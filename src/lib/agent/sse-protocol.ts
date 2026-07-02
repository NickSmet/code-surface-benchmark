/**
 * Wire protocol between a bench run (server) and a panel (client).
 *
 * The server runs the agent loop for one surface and yields a sequence of
 * typed events over SSE. Every event carries `at` (ms since the run started)
 * and a running `metrics` snapshot so each panel animates the race live.
 */

import type { ChangeRow } from '$lib/inventory/projection';
import type { ToolTrace } from '$lib/surfaces/types';

export type SurfaceId = 'catalog' | 'code';

/** Running totals for one surface's attempt at a task. */
export interface RunMetrics {
  /** Model round trips (chat completions calls). */
  turns: number;
  /** Tool invocations dispatched. */
  toolCalls: number;
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  /** Estimated tokens spent just *defining* the tools up front (the catalogue tax). */
  toolSchemaTokens: number;
  elapsedMs: number;
}

export function emptyMetrics(toolSchemaTokens = 0): RunMetrics {
  return {
    turns: 0,
    toolCalls: 0,
    promptTokens: 0,
    cachedPromptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    toolSchemaTokens,
    elapsedMs: 0
  };
}

export type ApprovalDecision = 'approved' | 'declined';

export type BenchEvent =
  | {
      type: 'meta';
      at: number;
      surface: SurfaceId;
      providerLabel: string;
      model: string;
      isStub: boolean;
      metrics: RunMetrics;
      /** Server-side run handle — used to answer approval requests in review mode. */
      runId?: string;
    }
  | { type: 'phase'; at: number; phase: 'thinking' | 'calling' | 'done' }
  | { type: 'tool_call'; at: number; seq: number; name: string; argsPreview: string; args?: Record<string, unknown>; code?: string }
  | {
      /** Review mode: the run is paused, waiting for a decision on this change set. */
      type: 'approval_request';
      at: number;
      seq: number;
      name: string;
      diff: ChangeRow[];
    }
  | {
      type: 'tool_result';
      at: number;
      seq: number;
      name: string;
      resultPreview: string;
      content?: string;
      error?: boolean;
      diff?: ChangeRow[];
      trace?: ToolTrace;
      /** Set in review mode when this call carried a change set. */
      approval?: ApprovalDecision;
    }
  | { type: 'turn'; at: number; metrics: RunMetrics }
  | { type: 'assistant'; at: number; text: string }
  | { type: 'complete'; at: number; metrics: RunMetrics; finalText: string | null }
  | { type: 'error'; at: number; message: string; metrics: RunMetrics };
