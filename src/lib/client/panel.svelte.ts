/**
 * Reactive state for one benchmark panel (Svelte 5 runes). Holds the live
 * transcript + running metrics for a single surface, mutated by the SSE
 * handler as events arrive.
 */

import type { ChangeRow } from '$lib/inventory/projection';
import type { ApprovalDecision, BenchEvent, RunMetrics, SurfaceId } from '$lib/agent/sse-protocol';
import { emptyMetrics } from '$lib/agent/sse-protocol';
import type { ToolTrace } from '$lib/surfaces/types';
import { runSurface } from './bench-client';

export type TranscriptItem =
  | {
      kind: 'tool';
      seq: number;
      name: string;
      argsPreview: string;
      args?: Record<string, unknown>;
      code?: string;
      resultPreview?: string;
      content?: string;
      error?: boolean;
      diff?: ChangeRow[];
      trace?: ToolTrace;
      /** Review mode: 'pending' while the run is paused on this change set. */
      approval?: 'pending' | ApprovalDecision;
      done: boolean;
    }
  | { kind: 'assistant'; text: string }
  | { kind: 'error'; message: string };

export type PanelStatus = 'idle' | 'running' | 'done' | 'error';

export class PanelState {
  readonly surface: SurfaceId;
  readonly label: string;

  providerLabel = $state('');
  model = $state('');
  isStub = $state(false);
  status = $state<PanelStatus>('idle');
  phase = $state<string>('');
  items = $state<TranscriptItem[]>([]);
  metrics = $state<RunMetrics>(emptyMetrics());
  finalText = $state<string | null>(null);
  stateDiff = $state<ChangeRow[] | null>(null);
  runId = $state('');
  /** Review mode: change sets that required a user decision this run. */
  approvalsRequested = $state(0);

  constructor(surface: SurfaceId, label: string) {
    this.surface = surface;
    this.label = label;
  }

  reset(): void {
    this.status = 'idle';
    this.phase = '';
    this.items = [];
    this.metrics = emptyMetrics();
    this.finalText = null;
    this.stateDiff = null;
    this.runId = '';
    this.approvalsRequested = 0;
  }

  private toolItem(seq: number): Extract<TranscriptItem, { kind: 'tool' }> | undefined {
    return this.items.find((i): i is Extract<TranscriptItem, { kind: 'tool' }> => i.kind === 'tool' && i.seq === seq);
  }

  private handle(ev: BenchEvent): void {
    switch (ev.type) {
      case 'meta':
        this.providerLabel = ev.providerLabel;
        this.model = ev.model;
        this.isStub = ev.isStub;
        this.metrics = ev.metrics;
        this.runId = ev.runId ?? '';
        break;
      case 'phase':
        this.phase = ev.phase;
        break;
      case 'tool_call':
        this.items.push({
          kind: 'tool',
          seq: ev.seq,
          name: ev.name,
          argsPreview: ev.argsPreview,
          args: ev.args,
          code: ev.code,
          done: false
        });
        break;
      case 'approval_request': {
        const item = this.toolItem(ev.seq);
        if (item) {
          item.diff = ev.diff;
          item.approval = 'pending';
        }
        this.approvalsRequested += 1;
        break;
      }
      case 'tool_result': {
        const item = this.toolItem(ev.seq);
        if (item) {
          item.resultPreview = ev.resultPreview;
          item.content = ev.content;
          item.error = ev.error;
          item.diff = ev.diff;
          item.trace = ev.trace;
          if (ev.approval) item.approval = ev.approval;
          item.done = true;
        }
        break;
      }
      case 'turn':
        this.metrics = ev.metrics;
        break;
      case 'assistant':
        this.items.push({ kind: 'assistant', text: ev.text });
        this.finalText = ev.text;
        break;
      case 'complete':
        this.metrics = ev.metrics;
        this.stateDiff = ev.stateDiff ?? null;
        this.finalText = ev.finalText;
        this.phase = 'done';
        this.status = 'done';
        break;
      case 'error':
        this.items.push({ kind: 'error', message: ev.message });
        this.metrics = ev.metrics;
        this.status = 'error';
        this.phase = 'done';
        break;
    }
  }

  async run(task: string, abortSignal?: AbortSignal, review = false): Promise<void> {
    this.reset();
    this.status = 'running';
    this.phase = 'thinking';
    await runSurface({
      surface: this.surface,
      task,
      abortSignal,
      review,
      handlers: { onEvent: (ev) => this.handle(ev) }
    });
    if (this.status === 'running') {
      this.status = 'error';
      this.items.push({ kind: 'error', message: 'Stream ended before the run completed.' });
    }
  }

  /** Answer a pending review-mode approval ('all' = approve the rest of the run). */
  async decide(seq: number | 'all', decision: ApprovalDecision): Promise<void> {
    if (!this.runId) return;
    try {
      await fetch('/backend/bench/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: this.runId, seq, decision })
      });
    } catch {
      /* dev server gone — the run will time out on its own */
    }
  }
}
