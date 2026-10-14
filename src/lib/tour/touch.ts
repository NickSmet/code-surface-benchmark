/**
 * "What was touched, and how" — the vocabulary shared by every tour screen.
 *
 * A resource can be touched four ways. Two of them put text in the model's
 * context window; one happens entirely inside the runtime; one changes state:
 *
 *   listed   a one-line summary of it entered the model's context
 *   read     its full record entered the model's context
 *   scanned  code read it inside the runtime — the model never saw it
 *   written  a field of it was changed
 *
 * Tool catalogues only ever produce `listed` / `read` / `written`
 * (touched == seen). A code surface adds `scanned`: it can look at everything
 * while only its return value reaches the model.
 */

export type TouchKind = 'listed' | 'read' | 'scanned' | 'written';

export interface TouchEvent {
  /** 1-based index of the step (tool call / run) that caused this. */
  step: number;
  kind: TouchKind;
  resourceId?: string;
  /** Resource groups can be touched too (list_resource_groups). */
  groupName?: string;
  /** Tokens this touch put into the model's context, when it did. */
  tokens?: number;
  /** Fields read or written (code surface). */
  fields?: string[];
}

export interface TouchMark {
  /** First step at which each kind happened. */
  listed?: number;
  read?: number;
  scanned?: number;
  written?: number;
  steps: number[];
  fields: string[];
  tokens: number;
}

export interface MarkSet {
  resources: Map<string, TouchMark>;
  groups: Map<string, TouchMark>;
}

export const TOUCH_KINDS: TouchKind[] = ['listed', 'read', 'scanned', 'written'];

/** Precedence when one cell can only show one thing: changed > full > summary > scanned. */
const PRECEDENCE: TouchKind[] = ['written', 'read', 'listed', 'scanned'];

export function dominantKind(mark: TouchMark | undefined): TouchKind | null {
  if (!mark) return null;
  for (const k of PRECEDENCE) if (mark[k] !== undefined) return k;
  return null;
}

function addEvent(map: Map<string, TouchMark>, key: string, e: TouchEvent): void {
  let m = map.get(key);
  if (!m) {
    m = { steps: [], fields: [], tokens: 0 };
    map.set(key, m);
  }
  if (m[e.kind] === undefined) m[e.kind] = e.step;
  if (!m.steps.includes(e.step)) m.steps.push(e.step);
  if (e.tokens) m.tokens += e.tokens;
  if (e.fields) for (const f of e.fields) if (!m.fields.includes(f)) m.fields.push(f);
}

/** Everything touched up to and including `step` (events must carry their step). */
export function marksAt(events: readonly TouchEvent[], step: number): MarkSet {
  const resources = new Map<string, TouchMark>();
  const groups = new Map<string, TouchMark>();
  for (const e of events) {
    if (e.step > step) continue;
    if (e.resourceId) addEvent(resources, e.resourceId, e);
    if (e.groupName) addEvent(groups, e.groupName, e);
  }
  return { resources, groups };
}

export interface TouchCounts {
  listed: number;
  read: number;
  scanned: number;
  written: number;
  /** Distinct resources touched in any way. */
  touched: number;
}

/** Exclusive counts by dominant kind, so the four numbers add up to `touched`. */
export function countMarks(marks: Map<string, TouchMark>): TouchCounts {
  const out: TouchCounts = { listed: 0, read: 0, scanned: 0, written: 0, touched: marks.size };
  for (const m of marks.values()) {
    const k = dominantKind(m);
    if (k) out[k] += 1;
  }
  return out;
}

/** Tokens of text that entered the model's context because of these touches. */
export function contextTokens(marks: Map<string, TouchMark>): number {
  let n = 0;
  for (const m of marks.values()) n += m.tokens;
  return n;
}

/** Human description of one mark, for the resource card ("listed at step 1, read in full at step 2"). */
export function describeMark(mark: TouchMark | undefined): string[] {
  if (!mark) return [];
  const out: string[] = [];
  if (mark.listed !== undefined) out.push(`one-line summary entered context (step ${mark.listed})`);
  if (mark.read !== undefined) out.push(`full record entered context (step ${mark.read})`);
  if (mark.scanned !== undefined) out.push(`scanned by the runtime (step ${mark.scanned}) — the model never saw it`);
  if (mark.written !== undefined) out.push(`changed (step ${mark.written})`);
  return out;
}
