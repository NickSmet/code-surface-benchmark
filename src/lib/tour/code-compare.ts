/**
 * Put a code run on the same footing as a catalog replay.
 *
 * A code run is a two-turn conversation: the model writes the program (one
 * tool call), the runtime answers with the result text, the model states the
 * answer. `replayCode` pushes that through the same accounting as the catalog
 * replays, so "calls", "turns" and "tokens re-read" are directly comparable.
 */

import type { Inventory } from '$lib/inventory/types';
import { CODE_TOOLS, OPERATE_NAME } from '$lib/surfaces/code/schemas';
import { codeSystemPrompt } from '$lib/surfaces/code/prompt';
import type { RunOutcome } from './code-run';
import { runReplay, type Replay, type SimSurface } from './replay';
import type { TouchEvent } from './touch';

/** What a run touched, in the same four-kind vocabulary the catalog uses. */
export function codeTouches(outcome: RunOutcome, step = 1): TouchEvent[] {
  const events: TouchEvent[] = [];
  for (const [resourceId, fields] of Object.entries(outcome.scanned)) {
    events.push({ step, kind: 'scanned', resourceId, fields });
  }
  for (const [groupName, fields] of Object.entries(outcome.scannedGroups)) {
    events.push({ step, kind: 'scanned', groupName, fields });
  }
  for (const [resourceId, fields] of Object.entries(outcome.returned)) {
    events.push({ step, kind: 'read', resourceId, fields });
  }
  for (const resourceId of outcome.named) events.push({ step, kind: 'listed', resourceId });
  for (const groupName of outcome.namedGroups) events.push({ step, kind: 'listed', groupName });
  const written = new Map<string, string[]>();
  for (const row of outcome.diff) written.set(row.resourceId, [...(written.get(row.resourceId) ?? []), row.field]);
  for (const [resourceId, fields] of written) events.push({ step, kind: 'written', resourceId, fields });
  return events;
}

export interface CodeReplayInput {
  task: string;
  code: string;
  rationale?: string;
  outcome: RunOutcome;
  inventory: Inventory;
  /** What the model says once it has the result. */
  finalText: string;
}

export function replayCode({ task, code, rationale, outcome, inventory, finalText }: CodeReplayInput): Replay {
  const surface: SimSurface = {
    id: 'code',
    label: 'Code Surface',
    systemPrompt: codeSystemPrompt(inventory.generatedAt),
    tools: CODE_TOOLS,
    inventory,
    dispatch: () => ({
      content: outcome.content,
      preview: outcome.status === 'ok' ? (outcome.resultText ?? 'no return value').slice(0, 160) : (outcome.error ?? 'failed'),
      error: outcome.status !== 'ok',
      diff: outcome.diff,
      touches: codeTouches(outcome, 0).map(({ step: _step, ...rest }) => rest)
    })
  };
  return runReplay(surface, task, (api) => {
    api.call(OPERATE_NAME, rationale ? { rationale, code } : { code });
    return finalText;
  });
}
