/**
 * SSE endpoint for one surface's attempt at a task.
 *
 *   POST /backend/bench/catalog/chat   body: { task, review? }
 *   POST /backend/bench/code/chat      body: { task, review? }
 *
 * Streams a sequence of BenchEvent frames; the panel forwards each to its
 * live transcript + metrics. Both surfaces hit the same provider/model.
 *
 * Every run operates on its own mock copy of the estate; supported writes
 * apply to that copy without changing another run.
 * With `review: true`, every change set pauses the run until the user answers
 * via POST /backend/bench/approve (elicitation-style gating); approved sets
 * are then applied. Without review, writes apply as the calls return.
 */

import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { selectProvider } from '$lib/agent/providers';
import { runBench } from '$lib/agent/loop';
import type { BenchEvent } from '$lib/agent/sse-protocol';
import { endRun, waitForDecision } from '$lib/server/approvals';
import { createRunInventory } from '$lib/inventory/store';
import { createCatalogSurface } from '$lib/surfaces/catalog';
import { createCodeSurface } from '$lib/surfaces/code';

const SSE_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no'
};

const encoder = new TextEncoder();
const frame = (ev: BenchEvent): Uint8Array => encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);

export const POST: RequestHandler = async ({ request, params }) => {
  const surfaceId = params.surface;
  if (surfaceId !== 'catalog' && surfaceId !== 'code') throw error(404, 'Unknown surface');

  const body = (await request.json().catch(() => null)) as { task?: string; review?: boolean } | null;
  const task = body?.task?.trim();
  if (!task) throw error(400, 'task is required');
  const review = body?.review === true;

  const provider = selectProvider(env as Record<string, string | undefined>);
  // Per-run prefix nonce discourages cross-run cache reuse; actual cache
  // use is recorded from provider usage. Constant within each run. Deliberately
  // opaque (not a timestamp) so it can't leak a competing "now" into the
  // prompt — the snapshot time must stay the only clock the model sees.
  const runNonce = crypto.randomUUID().slice(0, 8);
  // Each run gets its own pristine copy of the estate: writes genuinely
  // apply, and concurrent panels can't see each other's changes.
  const inv = createRunInventory();
  const surface = surfaceId === 'catalog' ? createCatalogSurface(runNonce, inv) : createCodeSurface(runNonce, inv);
  const runId = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const ac = new AbortController();
      request.signal.addEventListener('abort', () => ac.abort(), { once: true });
      try {
        for await (const ev of runBench({
          provider,
          surface,
          task,
          env: env as Record<string, string | undefined>,
          abortSignal: ac.signal,
          runId,
          reviewGate: review ? (seq) => waitForDecision(runId, seq, ac.signal) : undefined
        })) {
          controller.enqueue(frame(ev));
          if (ev.type === 'complete' || ev.type === 'error') break;
        }
      } catch (err) {
        controller.enqueue(
          frame({
            type: 'error',
            at: 0,
            message: err instanceof Error ? err.message : String(err),
            metrics: {
              turns: 0,
              toolCalls: 0,
              promptTokens: 0,
              cachedPromptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              costUsd: 0,
              toolSchemaTokens: 0,
              elapsedMs: 0
            }
          })
        );
      } finally {
        endRun(runId);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
};
