/**
 * Browser-side SSE client for /backend/bench/[surface]/chat.
 *
 * POSTs a task, parses the SSE frames, and dispatches typed BenchEvents to
 * callbacks. Callback-oriented so Svelte 5 `$state` mutations compose
 * naturally (each handler is just `state.x = ...`).
 */

import type { BenchEvent, SurfaceId } from '$lib/agent/sse-protocol';

export interface BenchHandlers {
  onEvent?: (ev: BenchEvent) => void;
}

export async function runSurface(args: {
  surface: SurfaceId;
  task: string;
  handlers: BenchHandlers;
  abortSignal?: AbortSignal;
  /** Gate every proposed change set behind a user approval (review mode). */
  review?: boolean;
}): Promise<void> {
  const { surface, task, handlers, abortSignal, review } = args;

  let resp: Response;
  try {
    resp = await fetch(`/backend/bench/${surface}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ task, review: review === true }),
      signal: abortSignal
    });
  } catch (err) {
    if (abortSignal?.aborted) return;
    handlers.onEvent?.({ type: 'error', at: 0, message: err instanceof Error ? err.message : String(err), metrics: zero() });
    return;
  }

  if (!resp.ok || !resp.body) {
    let detail = `Request failed (${resp.status})`;
    try {
      detail = (await resp.text()) || detail;
    } catch {
      /* ignore */
    }
    handlers.onEvent?.({ type: 'error', at: 0, message: detail, metrics: zero() });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (abortSignal?.aborted) {
        await reader.cancel().catch(() => undefined);
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const ev = parseFrame(raw);
        if (ev) handlers.onEvent?.(ev);
      }
    }
  } catch (err) {
    if (abortSignal?.aborted) return;
    handlers.onEvent?.({ type: 'error', at: 0, message: err instanceof Error ? err.message : String(err), metrics: zero() });
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

function parseFrame(raw: string): BenchEvent | null {
  let dataStr = '';
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) {
      const part = line.slice('data:'.length).replace(/^ /, '');
      dataStr = dataStr ? `${dataStr}\n${part}` : part;
    }
  }
  if (!dataStr) return null;
  try {
    return JSON.parse(dataStr) as BenchEvent;
  } catch {
    return null;
  }
}

function zero() {
  return {
    turns: 0,
    toolCalls: 0,
    promptTokens: 0,
    cachedPromptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    toolSchemaTokens: 0,
    elapsedMs: 0
  };
}
