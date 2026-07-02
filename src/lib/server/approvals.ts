/**
 * In-memory broker for review-mode approvals.
 *
 * In review mode the agent loop pauses whenever a tool call produces a
 * proposed change set, emits an `approval_request` SSE event, and awaits a
 * decision here. The UI answers via POST /backend/bench/approve. This mimics
 * MCP elicitation: the server suspends the call and asks the user — which is
 * exactly why the *number* of change sets per task matters.
 *
 * Dev-server scope: everything lives in module state of one node process,
 * same as the inventory store.
 */

import type { ApprovalDecision } from '$lib/agent/sse-protocol';

interface RunApprovals {
  resolvers: Map<number, (d: ApprovalDecision) => void>;
  approveRest: boolean;
}

const runs = new Map<string, RunApprovals>();

const DECISION_TIMEOUT_MS = 10 * 60 * 1000;

function runFor(runId: string): RunApprovals {
  let run = runs.get(runId);
  if (!run) {
    run = { resolvers: new Map(), approveRest: false };
    runs.set(runId, run);
  }
  return run;
}

/** Loop side: block until the UI decides (or abort/timeout declines). */
export function waitForDecision(runId: string, seq: number, signal?: AbortSignal): Promise<ApprovalDecision> {
  const run = runFor(runId);
  if (run.approveRest) return Promise.resolve('approved');
  if (signal?.aborted) return Promise.resolve('declined');

  return new Promise<ApprovalDecision>((resolve) => {
    const done = (d: ApprovalDecision): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      run.resolvers.delete(seq);
      resolve(d);
    };
    const onAbort = (): void => done('declined');
    const timer = setTimeout(() => done('declined'), DECISION_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    run.resolvers.set(seq, done);
  });
}

/** UI side: answer one pending request, or everything from here on. */
export function submitDecision(runId: string, seq: number | 'all', decision: ApprovalDecision): boolean {
  const run = runs.get(runId);
  if (!run) return false;
  if (seq === 'all') {
    if (decision === 'approved') run.approveRest = true;
    for (const resolve of [...run.resolvers.values()]) resolve(decision);
    return true;
  }
  const resolve = run.resolvers.get(seq);
  if (!resolve) return false;
  resolve(decision);
  return true;
}

/** Stream teardown: decline anything still pending and forget the run. */
export function endRun(runId: string): void {
  const run = runs.get(runId);
  if (run) for (const resolve of [...run.resolvers.values()]) resolve('declined');
  runs.delete(runId);
}
