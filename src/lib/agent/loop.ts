/**
 * The shared agent loop. IDENTICAL for both surfaces — only the injected
 * `Surface` (system prompt + tools + dispatch) differs. This compares two
 * interface packages; it does not isolate each feature's causal effect.
 *
 * Token accounting note: we SUM `usage.promptTokens` across every round trip,
 * and price each turn with its cached-token split. Each turn re-sends the
 * system prompt, the tool schemas, and the growing transcript, so this
 * captures the billed shape of the run — which is exactly the catalogue's weak
 * point and the honest thing to measure.
 */

import type { ProviderClient, ProviderMessage } from './providers/types';
import { costUsd, priceFor } from './pricing';
import { emptyMetrics, type ApprovalDecision, type BenchEvent, type RunMetrics, type SurfaceId } from './sse-protocol';
import { diffProjection, type ChangeRow } from '$lib/inventory/projection';
import type { Surface } from '$lib/surfaces/types';
import { previewArgs } from '$lib/surfaces/types';

const MAX_ITERATIONS = 16;

export interface RunBenchArgs {
  provider: ProviderClient;
  surface: Surface;
  task: string;
  env: Record<string, string | undefined>;
  abortSignal?: AbortSignal;
  /** Server-side run handle, echoed to the client in the meta event. */
  runId?: string;
  /**
   * Review mode: called whenever a tool call yields a proposed change set;
   * the loop pauses (like an MCP elicitation) until the user decides. Wait
   * time is excluded from elapsedMs; model calls and local execution remain.
   */
  reviewGate?: (seq: number, name: string, diff: ChangeRow[]) => Promise<ApprovalDecision>;
}

function estTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function* runBench(args: RunBenchArgs): AsyncGenerator<BenchEvent, void, unknown> {
  const { provider, surface, task, env, abortSignal, runId, reviewGate } = args;
  const start = Date.now();
  let pausedMs = 0;
  const at = (): number => Date.now() - start - pausedMs;
  const price = priceFor(provider.model, env);
  const initial = surface.snapshot();

  const toolSchemaTokens = estTokens(JSON.stringify(surface.tools));
  const metrics: RunMetrics = emptyMetrics(toolSchemaTokens);
  const surfaceId = surface.id as SurfaceId;

  const settle = (): void => {
    metrics.totalTokens = metrics.promptTokens + metrics.completionTokens;
    metrics.elapsedMs = at();
  };

  yield {
    type: 'meta',
    at: at(),
    surface: surfaceId,
    providerLabel: provider.label,
    model: provider.model,
    isStub: provider.isStub,
    metrics,
    runId,
    configuration: { systemPrompt: surface.systemPrompt, tools: surface.tools, prices: price, maxIterations: MAX_ITERATIONS, resultPolicy: 'complete' }
  };
  yield { type: 'phase', at: at(), phase: 'thinking' };

  const messages: Array<Exclude<ProviderMessage, { role: 'system' }>> = [{ role: 'user', content: task }];
  let seq = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (abortSignal?.aborted) return;

    let turn;
    try {
      turn = await provider.chatTurn({ systemPrompt: surface.systemPrompt, messages, tools: surface.tools });
    } catch (err) {
      settle();
      yield { type: 'error', at: at(), message: err instanceof Error ? err.message : String(err), metrics };
      return;
    }

    metrics.turns += 1;
    metrics.promptTokens += turn.usage.promptTokens;
    metrics.cachedPromptTokens += turn.usage.cachedPromptTokens;
    metrics.completionTokens += turn.usage.completionTokens;
    metrics.costUsd += costUsd(turn.usage, price);
    settle();
    yield { type: 'turn', at: at(), metrics: { ...metrics }, content: turn.content, toolCalls: turn.toolCalls, usage: turn.usage };

    // No tool calls → final answer, end the run.
    if (turn.toolCalls.length === 0) {
      const finalText = (turn.content ?? '').trim();
      if (finalText) yield { type: 'assistant', at: at(), text: finalText };
      yield { type: 'phase', at: at(), phase: 'done' };
      yield { type: 'complete', at: at(), metrics: { ...metrics }, finalText: finalText || null, stateDiff: diffProjection(initial, surface.snapshot()) };
      return;
    }

    yield { type: 'phase', at: at(), phase: 'calling' };

    // Record the assistant's tool-call message for the next replay.
    messages.push({ role: 'assistant', content: turn.content ?? '', tool_calls: turn.toolCalls });

    for (const tc of turn.toolCalls) {
      if (abortSignal?.aborted) return;
      seq += 1;
      const parsed = parseArgs(tc.function.arguments);

      let result;
      try {
        result = await surface.dispatch(tc.function.name, parsed);
      } catch (err) {
        result = {
          content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          resultPreview: err instanceof Error ? err.message : String(err),
          error: true
        };
      }

      metrics.toolCalls += 1;
      yield {
        type: 'tool_call',
        at: at(),
        seq,
        name: tc.function.name,
        argsPreview: previewArgs(parsed),
        args: parsed,
        code: result.code
      };

      // Writes: the surface returns the change set as a diff; the loop applies
      // it to the run's estate copy. In review mode the diff suspends the call
      // (an elicitation) until the reviewer decides — the catalog hits this
      // gate once per write call, the code surface once per run, and that
      // asymmetry is the point. Approved (or ungated) diffs apply immediately.
      let approval: ApprovalDecision | undefined;
      if (!result.error && result.diff && result.diff.length > 0) {
        if (reviewGate) {
          yield { type: 'approval_request', at: at(), seq, name: tc.function.name, diff: result.diff };
          const pauseStart = Date.now();
          approval = await reviewGate(seq, tc.function.name, result.diff);
          pausedMs += Date.now() - pauseStart;
          if (abortSignal?.aborted) return;
        }
        if (approval === 'declined') {
          result = {
            ...result,
            content: JSON.stringify({ status: 'declined', note: 'The reviewer declined this change set. It was not applied. Do not retry it.' }),
            resultPreview: `declined by reviewer (${result.diff.length} field changes)`
          };
        } else {
          try {
            surface.applyDiff(result.diff);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            result = { ...result, error: true, content: JSON.stringify({ error: message, status: 'not_applied' }), resultPreview: message };
          }
        }
      }
      // This fixture is bounded. Preserve complete results for both surfaces;
      // silently cutting JSON can hide task targets from the catalog agent.
      const resultContent = result.content;

      yield {
        type: 'tool_result',
        at: at(),
        seq,
        name: tc.function.name,
        resultPreview: result.resultPreview,
        content: resultContent,
        error: result.error,
        diff: result.diff,
        trace: result.trace,
        approval
      };

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultContent
      });
    }
    yield { type: 'phase', at: at(), phase: 'thinking' };
  }

  // Iteration cap hit without the model ending its turn.
  settle();
  yield { type: 'error', at: at(), metrics: { ...metrics }, message: `Model did not finish within ${MAX_ITERATIONS} turns` };
}
