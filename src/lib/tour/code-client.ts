/**
 * Browser-side handle to the code runner: one fresh Web Worker per run, with
 * a wall-clock limit enforced from outside (a synchronous infinite loop can
 * only be stopped by terminating the worker).
 */

import { failedOutcome, type RunOutcome, type RunRequest } from './code-run';

export const RUN_TIMEOUT_MS = 1500;

export function runInSandbox(req: RunRequest, timeoutMs: number = RUN_TIMEOUT_MS): Promise<RunOutcome> {
  return new Promise<RunOutcome>((resolve) => {
    const started = performance.now();
    let worker: Worker;
    try {
      worker = new Worker(new URL('./code.worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      resolve(failedOutcome('error', `Could not start the sandbox worker: ${err instanceof Error ? err.message : String(err)}`, 0));
      return;
    }

    const finish = (outcome: RunOutcome): void => {
      clearTimeout(timer);
      worker.terminate();
      resolve(outcome);
    };
    const timer = setTimeout(
      () => finish(failedOutcome('timeout', `Stopped after ${timeoutMs} ms. The run took too long, so its worker was terminated.`, performance.now() - started)),
      timeoutMs
    );
    worker.onmessage = (event: MessageEvent<RunOutcome>) => finish(event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      finish(failedOutcome('error', event.message || 'The sandbox worker crashed.', performance.now() - started));
    };
    worker.postMessage(req);
  });
}
