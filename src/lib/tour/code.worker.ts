/// <reference lib="webworker" />
/**
 * Web Worker entry: run one program, post the outcome, done. A fresh worker is
 * created per run (see code-client.ts) so a runaway loop can simply be
 * terminated and no state leaks between runs.
 */

import { failedOutcome, runTracked, type RunOutcome, type RunRequest } from './code-run';

self.onmessage = (event: MessageEvent<RunRequest>) => {
  let outcome: RunOutcome;
  try {
    outcome = runTracked(event.data);
  } catch (err) {
    outcome = failedOutcome('error', err instanceof Error ? err.message : String(err), 0);
  }
  (self as unknown as Worker).postMessage(outcome);
};
