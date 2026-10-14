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
import type { Replay, ReplayCall, ReplayTurn } from './replay';
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
  const { input, output } = billedSplit(replay, frame);
  return input + output;
}

/** The same bill as `billedAt`, split into what the model read (input) and what it wrote (output). */
export function billedSplit(replay: Replay, frame: number): { input: number; output: number } {
  const turn = turnAt(replay, frame);
  let input = 0;
  let output = 0;
  for (const t of replay.turns) {
    if (t.n > turn) break;
    input += t.promptTokens;
    output += t.completionTokens;
  }
  return { input, output };
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

/** What a request is made of, bottom to top as the chart stacks it. */
export type PartKey = 'fixed' | 'user' | 'calls' | 'results';
export const PART_KEYS: readonly PartKey[] = ['fixed', 'user', 'calls', 'results'];

export interface PromptSplit {
  /**
   * Text that was already in the previous request, unchanged and in the same
   * place. A provider with prompt caching can reuse it at a discount. The first
   * request has none: nothing has been sent before.
   */
  cached: Record<PartKey, number>;
  /** Text that is new in this request: the whole prompt the first time, then only what the last turn added. */
  fresh: Record<PartKey, number>;
  cachedTokens: number;
  freshTokens: number;
}

/**
 * Split request `index` into what it repeats from the request before and what is new.
 *
 * Every turn re-sends the instructions, the tool definitions, the question and
 * everything that happened so far, and appends one thing: the previous turn's
 * calls and their results. So from the second request on, only that tail is new.
 * This is an accounting view, not a billing change: the replay's totals still
 * assume no caching.
 */
export function promptSplit(turns: ReplayTurn[], index: number): PromptSplit {
  const turn = turns[index];
  const cur = turn.parts;
  const prev = index > 0 ? turns[index - 1] : null;
  const fixed = cur.system + cur.tools;
  const cachedParts: Record<PartKey, number> = prev
    ? { fixed, user: cur.user, calls: prev.parts.calls, results: prev.parts.results }
    : { fixed: 0, user: 0, calls: 0, results: 0 };
  const freshParts: Record<PartKey, number> = prev
    ? { fixed: 0, user: 0, calls: Math.max(0, cur.calls - prev.parts.calls), results: Math.max(0, cur.results - prev.parts.results) }
    : { fixed, user: cur.user, calls: cur.calls, results: cur.results };
  // The previous request is, character for character, the start of this one. So what is
  // cached is exactly that request's size, and what is new is exactly the difference.
  const cachedTokens = prev ? prev.promptTokens : 0;
  const freshTokens = turn.promptTokens - cachedTokens;
  return { cached: settle(cachedParts, cachedTokens), fresh: settle(freshParts, freshTokens), cachedTokens, freshTokens };
}

/** One model turn in plain terms: what it read, what it wrote. */
export interface TurnFlow {
  /** Tokens the model reads: the whole request. */
  input: number;
  /** Of those, tokens identical to the request before (nothing on the first turn). */
  cached: number;
  /** Of those, tokens that are new this turn. */
  fresh: number;
  /** Tokens the model writes: the calls' names and arguments, or the answer on the last turn. */
  output: number;
  /** How many calls it wrote; none on the last turn, which writes the answer. */
  calls: number;
}

export function turnFlow(turns: ReplayTurn[], index: number): TurnFlow {
  const turn = turns[index];
  const s = promptSplit(turns, index);
  return { input: turn.promptTokens, cached: s.cachedTokens, fresh: s.freshTokens, output: turn.completionTokens, calls: turn.calls.length };
}

/** Parts are each rounded up on their own, so they can overshoot the whole: the biggest absorbs the difference. */
function settle(parts: Record<PartKey, number>, exact: number): Record<PartKey, number> {
  const out = { ...parts };
  const sum = PART_KEYS.reduce((n, k) => n + out[k], 0);
  if (sum === exact) return out;
  const big = PART_KEYS.reduce((a, b) => (out[b] > out[a] ? b : a));
  out[big] = Math.max(0, out[big] + (exact - sum));
  return out;
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
