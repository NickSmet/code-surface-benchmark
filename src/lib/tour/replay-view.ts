/**
 * Derived values for scrubbing through a replay: what has happened, what has
 * been billed, and how to say it in a sentence. Pure functions so they can be
 * tested without a browser.
 *
 * A replay is shown as "frames": frame 0 is the question being asked, frames
 * 1..N are the N tool calls completing one by one, and frame N+1 is the final
 * answer. A frame number equals the engine's `step` for calls.
 */

import type { EstateUnit } from './estate';
import type { Replay, ReplayCall } from './replay';
import type { MarkSet } from './touch';

/** Index of the last frame (the final answer). */
export function lastFrame(replay: Replay): number {
  return replay.calls.length + 1;
}

/** Which model turn a frame belongs to (0 before the first request). */
export function turnAt(replay: Replay, frame: number): number {
  if (frame <= 0) return 0;
  if (frame > replay.calls.length) return replay.turns.length;
  return replay.calls[frame - 1].turn;
}

/**
 * Tokens billed once the given frame has happened. A turn is billed when its
 * request is sent, i.e. before its calls run, so every call in a turn shares
 * that turn's bill.
 */
export function billedAt(replay: Replay, frame: number): number {
  const turn = turnAt(replay, frame);
  let n = 0;
  for (const t of replay.turns) if (t.n <= turn) n += t.promptTokens + t.completionTokens;
  return n;
}

export interface CostFacts {
  /** Tokens of text in the finished transcript, counting each piece once. */
  once: number;
  billed: number;
  /** billed / once: how many times over the transcript was paid for. */
  multiple: number;
  /** Instructions + tool definitions, re-sent on every turn. */
  fixedBilled: number;
  fixedShare: number;
}

export function costFacts(replay: Replay): CostFacts {
  const t = replay.totals;
  const question = replay.turns[0]?.parts.user ?? 0;
  const calls = replay.calls.reduce((n, c) => n + c.callTokens, 0);
  const once = t.fixedTokens + question + calls + t.resultTokens + t.answerTokens;
  const fixedBilled = t.fixedTokens * t.turns;
  return {
    once,
    billed: t.billedTokens,
    multiple: once > 0 ? t.billedTokens / once : 0,
    fixedBilled,
    fixedShare: t.billedTokens > 0 ? fixedBilled / t.billedTokens : 0
  };
}

/** One plain sentence about what a call did to the estate. */
export function callSummary(call: ReplayCall, nameOf: (resourceId: string) => string): string {
  if (call.error) return 'The tool returned an error.';
  const kinds = (k: string) => call.touches.filter((t) => t.kind === k && t.resourceId);
  const reads = kinds('read');
  const listed = kinds('listed');
  const writes = kinds('written');
  const groups = call.touches.filter((t) => t.groupName && t.kind === 'listed');

  if (writes.length > 0) {
    const what = writes[0].fields?.length ? ` (${writes[0].fields.join(', ')})` : '';
    return `Changed ${nameOf(writes[0].resourceId!)}${what}.`;
  }
  if (reads.length === 1) return `Read ${nameOf(reads[0].resourceId!)} in full.`;
  if (reads.length > 1) return `Read ${reads.length} records in full.`;
  if (listed.length > 0) return `${listed.length} resources came back, one line each.`;
  if (groups.length > 0) return `${groups.length} resource groups came back.`;
  return 'Nothing in the estate was touched.';
}

/** Step numbers that read or changed this pod, for the badge on the map. */
export function stepBadge(unit: EstateUnit, marks: MarkSet): string | null {
  const steps: number[] = [];
  for (const m of unit.members) {
    const mark = marks.resources.get(m.id);
    if (!mark) continue;
    if (mark.written !== undefined) steps.push(mark.written);
    else if (mark.read !== undefined) steps.push(mark.read);
  }
  if (steps.length === 0) return null;
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  return lo === hi ? String(lo) : `${lo}\u2013${hi}`;
}

/** Compact one-line rendering of tool arguments. */
export function argsLine(args: Record<string, unknown>, max = 90): string {
  const text = JSON.stringify(args);
  return text.length > max ? text.slice(0, max - 1) + '\u2026' : text;
}
