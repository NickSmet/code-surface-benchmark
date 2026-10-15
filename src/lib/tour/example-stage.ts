/**
 * The code surface in practice (screen 6): the stage of the object screen, now with programs running on
 * it. One example is three or four beats on the same stage: the model writes a program, the runtime runs
 * it, the answer comes back (and, for a write, a person reviews the change set).
 *
 * Everything the screen prints is built here from a real run of a real program, so the tests can hold
 * each number to the run it came from. The page only draws.
 */

import type { Inventory } from '$lib/inventory/types';
import type { TaskId } from './answers';
import { backToModelTokens, compareSurfaces, comparisonHeadline, fieldLabel, groupDiff, type Comparison } from './code-view';
import type { RunOutcome } from './code-run';
import { FRESH_QUESTIONS, runQuery, type FreshQuestion } from './language';
import { needleFor } from './needles';
import { LEFT, PROGRAM, ease, seg } from './object-stage';
import { CONTRACT_PROBES, type CodeProgram, type ContractProbe } from './programs';
import { runBill, type RunBill } from './replay-view';
import { taskPrompt } from './scenarios';
import { fmtTokens } from './tokens';

// ── the examples ───────────────────────────────────────────────────────────

export type ExampleId = 'cost' | 'tag' | 'disks' | 'ratio' | 'lookup' | 'break';
export type ExampleKind = 'task' | 'fresh' | 'break';
/** Write, run, answer (and review) are one program's life. See, change, do are the three things the contract guards. */
export type Phase = 'write' | 'run' | 'answer' | 'review' | 'see' | 'change' | 'do';

export interface ExampleDef {
  id: ExampleId;
  label: string;
  kind: ExampleKind;
  /** The benchmark question the example answers (kind `task`). */
  task?: TaskId;
  /** The question the last screen's language could not ask (kind `fresh`). */
  fresh?: string;
  phases: readonly Phase[];
}

const LIFE = ['write', 'run', 'answer'] as const;

export const EXAMPLES: readonly ExampleDef[] = [
  { id: 'cost', label: 'Cost by group', kind: 'task', task: 'filter-aggregate', phases: LIFE },
  { id: 'tag', label: 'Tag and deallocate', kind: 'task', task: 'bulk-write', phases: [...LIFE, 'review'] },
  { id: 'disks', label: 'Disks of stopped VMs', kind: 'fresh', fresh: 'disks', phases: LIFE },
  { id: 'ratio', label: 'Cost per vCPU', kind: 'fresh', fresh: 'ratio', phases: LIFE },
  { id: 'lookup', label: 'A narrow lookup', kind: 'task', task: 'single-lookup', phases: LIFE },
  { id: 'break', label: 'Try to break it', kind: 'break', phases: ['see', 'change', 'do'] }
];

export const EXAMPLE_IDS: readonly ExampleId[] = EXAMPLES.map((e) => e.id);
export const defOf = (id: ExampleId): ExampleDef => EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];

export const PHASE_WORD: Record<Phase, string> = {
  write: 'Write',
  run: 'Run',
  answer: 'Answer',
  review: 'Review',
  see: 'See',
  change: 'Change',
  do: 'Do'
};

export type Layer = 'see' | 'change' | 'do';

/** What the contract guards in each of the three "try to break it" beats. */
export const LAYER_LINE: Record<Layer, string> = {
  see: 'The projection decides what exists.',
  change: 'The runtime derives the change set.',
  do: 'The sandbox decides what code may run.'
};

/** The probe each "try to break it" beat opens with. The others in the same layer are one click away. */
export const BREAK_START: Record<Layer, string> = { see: 'internal', change: 'cost', do: 'loop' };

export const probesOf = (layer: Layer): ContractProbe[] => CONTRACT_PROBES.filter((p) => p.layer === layer);

// ── where the screen is, in the URL ────────────────────────────────────────

export interface ExampleState {
  id: ExampleId;
  step: number;
}

const clampStep = (def: ExampleDef, n: number): number => (Number.isInteger(n) ? Math.max(0, Math.min(def.phases.length - 1, n)) : 0);

export function parseExampleState(search: URLSearchParams): ExampleState {
  const def = EXAMPLES.find((e) => e.id === search.get('ex')) ?? EXAMPLES[0];
  const raw = search.get('step');
  return { id: def.id, step: clampStep(def, raw === null ? 0 : Number(raw)) };
}

export function exampleHref(id: ExampleId, step = 0): string {
  const qs = [id !== EXAMPLES[0].id ? `ex=${id}` : '', step > 0 ? `step=${step}` : ''].filter(Boolean).join('&');
  return `/tour/code${qs ? `?${qs}` : ''}`;
}

export interface ExampleBeat extends ExampleState {
  phase: Phase;
  href: string;
  caption: string;
  /** The example the beat belongs to: Shift and an arrow jump from one example to the next. */
  group: ExampleId;
}

/** Every beat of every example, in the order a talk walks them. */
export function exampleBeats(): ExampleBeat[] {
  return EXAMPLES.flatMap((e) =>
    e.phases.map((phase, step) => ({ id: e.id, step, phase, href: exampleHref(e.id, step), caption: `${e.label} \u00b7 ${PHASE_WORD[phase]}`, group: e.id }))
  );
}

// ── the program, as the panel draws it ─────────────────────────────────────

/** The panel is the full height of the left zone. */
export const PANEL = { x: LEFT.x, y: LEFT.y, w: LEFT.w, h: LEFT.h } as const;
export const CODE_TOP = 48;
/** Where the text starts, from the panel's left edge: a little tighter than the object screen's panel, for the longer programs. */
export const CODE_X = 40;
export const CODE_BOTTOM = 14;
/** The rationale (writes only) takes a line of its own under the code. */
export const RATIONALE_H = 34;

/** The code a reader sees: blank lines add height and nothing else, so they are dropped. */
export const displayLines = (code: string): string[] => code.split('\n').filter((l) => l.trim() !== '');

export function lineHeightFor(lineCount: number, hasRationale = false): number {
  const room = PANEL.h - CODE_TOP - CODE_BOTTOM - (hasRationale ? RATIONALE_H : 0);
  return Math.min(PROGRAM.lineH, room / Math.max(1, lineCount));
}

export type Block = [first: number, last: number];

/** The function body, and the statement that returns its answer (if there is one), as zero-based line numbers. */
export function bandsOf(lines: readonly string[]): { body: Block; ret: Block | null } {
  const last = lines.length - 1;
  let at = -1;
  for (let i = last - 1; i >= 1; i -= 1) {
    if (/^ {2}return\b/.test(lines[i])) {
      at = i;
      break;
    }
  }
  return { body: [1, Math.max(1, last - 1)], ret: at >= 0 ? [at, Math.max(at, last - 1)] : null };
}

// ── what the runtime did, mark by mark ─────────────────────────────────────

export interface Marks {
  /** resource id → how many of its fields the program read. */
  depth: Readonly<Record<string, number>>;
  /** The records the answer is built from: the benchmark's needle for its questions, the records named in the answer for the rest. */
  used: ReadonlySet<string>;
  usedGroups: ReadonlySet<string>;
  scannedGroups: ReadonlySet<string>;
  /** Resources a run changed (a proposal until someone approves it). */
  written: ReadonlySet<string>;
  /** Resources a refused run tried to change. */
  refused: ReadonlySet<string>;
}

export function marksOf(def: ExampleDef, o: RunOutcome, inv: Inventory): Marks {
  const depth = Object.fromEntries(Object.entries(o.scanned).map(([id, fields]) => [id, fields.length]));
  let used: Set<string>;
  let usedGroups: Set<string>;
  if (def.kind === 'task' && def.task) {
    const needle = needleFor(def.task, inv);
    used = new Set(needle.resourceIds);
    usedGroups = new Set(needle.groupNames);
  } else {
    used = new Set(o.named);
    usedGroups = new Set(o.namedGroups);
  }
  return {
    depth,
    used,
    usedGroups,
    scannedGroups: new Set(Object.keys(o.scannedGroups)),
    written: new Set(o.status === 'ok' ? o.diff.map((r) => r.resourceId) : []),
    refused: new Set(o.status === 'rejected' ? Object.keys(o.attempted) : [])
  };
}

// ── the three counters ─────────────────────────────────────────────────────

export interface Counters {
  scanned: number;
  scannedUnit: 'records' | 'groups';
  reads: number;
  usedLabel: 'records it used' | 'groups it used' | 'proposed changes';
  used: number;
  usedSub: string;
  tokens: number;
  tokensSub: string;
}

const plural = (n: number, one: string, many = one + 's'): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function countersOf(o: RunOutcome, marks: Marks): Counters {
  const resources = o.totals.resourcesScanned;
  const groups = marks.scannedGroups.size;
  const scanned = resources > 0 ? resources : groups;
  const writes = o.status === 'ok' && o.diff.length > 0;
  const onGroups = !writes && marks.used.size === 0 && marks.usedGroups.size > 0;
  return {
    scanned,
    scannedUnit: resources > 0 || groups === 0 ? 'records' : 'groups',
    reads: o.totals.propertyReads,
    usedLabel: writes ? 'proposed changes' : onGroups ? 'groups it used' : 'records it used',
    used: writes ? o.diff.length : onGroups ? marks.usedGroups.size : marks.used.size,
    usedSub: writes ? `fields on ${plural(o.resourcesAffected, 'resource')}` : o.status !== 'ok' ? 'nothing was applied' : `of ${scanned.toLocaleString('en-US')} scanned`,
    tokens: backToModelTokens(o),
    tokensSub: o.status !== 'ok' ? 'tokens: the error it is told' : writes ? 'tokens: the summary it needs' : 'tokens: only the answer'
  };
}

// ── the answer, as the model reads it ──────────────────────────────────────

export const MAX_ANSWER_LINES = 7;
/** Characters of 12.5px monospace that fit across the answer card. */
export const ANSWER_WIDTH = 74;

export interface AnswerCard {
  tone: 'ok' | 'bad';
  label: string;
  /** Already clipped to the card. */
  lines: string[];
  /** Entries that did not fit, when the answer is a list longer than the card. */
  more: number;
  tokens: number;
}

const clip = (s: string, n: number = ANSWER_WIDTH): string => (s.length > n ? s.slice(0, n - 1) + '\u2026' : s);
const oneLine = (v: unknown): string => JSON.stringify(v) ?? 'undefined';
const isPlainObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Wrap at word boundaries; continuation lines are indented by two spaces. */
export function wrapWords(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = '  ' + word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

function parseContent(content: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(content);
    return isPlainObject(v) ? v : null;
  } catch {
    return null;
  }
}

/** An object one key per line, and a small object inside it one key per line again; everything else on a line of its own. */
function entriesOf(v: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, x] of Object.entries(v)) {
    if (isPlainObject(x) && Object.keys(x).length > 0 && Object.keys(x).length <= 8) {
      out.push(`${k}:`);
      for (const [k2, y] of Object.entries(x)) out.push(`  ${k2}: ${oneLine(y)}`);
    } else out.push(`${k}: ${oneLine(x)}`);
  }
  return out;
}

/** The tool result as the model reads it, a line at a time. */
export function answerCard(o: RunOutcome): AnswerCard {
  const parsed = parseContent(o.content);
  const entries: string[] = [];
  if (!parsed) entries.push(o.content);
  else if ('error' in parsed) entries.push(...wrapWords(`error: ${String(parsed.error)}`, ANSWER_WIDTH));
  else {
    const r = parsed.result;
    if (Array.isArray(r)) entries.push(...r.map(oneLine));
    else if (isPlainObject(r)) entries.push(...entriesOf(r));
    else if (r !== undefined) entries.push(oneLine(r));
    for (const k of ['changeCount', 'resourcesAffected']) if (k in parsed) entries.push(`${k}: ${oneLine(parsed[k])}`);
  }
  const fits = entries.length <= MAX_ANSWER_LINES;
  const shown = fits ? entries : entries.slice(0, MAX_ANSWER_LINES - 1);
  return {
    tone: o.status === 'ok' ? 'ok' : 'bad',
    label:
      o.status === 'ok' ? 'back to the model' : o.status === 'rejected' ? 'refused: what the model is told' : o.status === 'timeout' ? 'stopped: what the model is told' : 'error: what the model is told',
    lines: shown.map((l) => clip(l)),
    more: fits ? 0 : entries.length - shown.length,
    tokens: backToModelTokens(o)
  };
}

/** How many entries the answer holds when it is a list ("16 disks come back"). */
export function answerItems(o: RunOutcome): number | null {
  const r = parseContent(o.content)?.result;
  return Array.isArray(r) ? r.length : null;
}

// ── the change set, for review ─────────────────────────────────────────────

export interface ReviewCard {
  resources: number;
  fields: number;
  /** What kinds of change there are, e.g. "tags on 33 resources · power state on 4". */
  summary: string;
  rows: Array<{ name: string; type: string; changes: string }>;
  /** Resources not listed. */
  hidden: number;
}

export const REVIEW_ROWS = 6;

const show = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export function reviewCard(o: RunOutcome): ReviewCard | null {
  if (o.status !== 'ok' || o.diff.length === 0) return null;
  const groups = groupDiff(o.diff);
  const rows = groups.map((g) => ({
    name: g.resourceName,
    type: g.resourceType,
    kind: g.rows.map((r) => (r.field.startsWith('tags.') ? 'tags' : r.field)).join(','),
    changes: g.rows
      .map((r) => (r.op === 'add' ? `+ ${fieldLabel(r)}=${show(r.after)}` : r.op === 'remove' ? `\u2212 ${fieldLabel(r)}` : `${fieldLabel(r)} ${show(r.before)} \u2192 ${show(r.after)}`))
      .join('  \u00b7  ')
  }));
  // One of each kind of change first, so the list shows what the change set is made of, then the rest in order.
  const seen = new Set<string>();
  const firsts = rows.filter((r) => (seen.has(r.kind) ? false : (seen.add(r.kind), true)));
  const listed = [...firsts, ...rows.filter((r) => !firsts.includes(r))].slice(0, REVIEW_ROWS);
  const count = (kind: string): number => rows.filter((r) => r.kind.split(',').includes(kind)).length;
  const summary = [count('tags') > 0 && `tags on ${plural(count('tags'), 'resource')}`, count('powerState') > 0 && `power state on ${count('powerState')}`].filter(Boolean).join('  \u00b7  ');
  return {
    resources: groups.length,
    fields: o.diff.length,
    summary,
    rows: listed.map(({ name, type, changes }) => ({ name, type, changes })),
    hidden: Math.max(0, groups.length - listed.length)
  };
}

// ── under the stage ────────────────────────────────────────────────────────

export interface StripBar {
  id: 'catalog' | 'code';
  label: string;
  calls: number;
  bill: RunBill;
}

export type Strip =
  | { kind: 'bill'; winner: Comparison['winner']; headline: string; note: string; bars: [StripBar, StripBar]; scale: number }
  | { kind: 'language'; refused: string; needs: string };

function billNote(task: TaskId, c: Comparison): string {
  switch (task) {
    case 'filter-aggregate':
      return `The catalogue's best case is a single list_resources call whose summaries happen to carry what this question needs, so the two bills land close.`;
    case 'bulk-write':
      return `The catalogue states the change one call at a time: ${c.catalog.totals.calls} calls, each result landing in the transcript. The code surface states the rule once, and the runtime derives the change set.`;
    case 'single-lookup':
      return `One narrow tool is the right shape for a one-step lookup, and the code surface has to describe the whole object first. Code surfaces earn their keep on multi-step work, not on lookups.`;
    case 'granular-read':
      return `The catalogue chains ${c.catalog.totals.calls} calls, and every turn re-sends the transcript so far. The code surface makes one call.`;
  }
}

/** The catalogue's best case against this program, both billed the way every replay is. */
export function billStrip(task: TaskId, program: CodeProgram): Strip {
  const c = compareSurfaces(task, program);
  const bars: [StripBar, StripBar] = [
    { id: 'catalog', label: 'Catalogue, best case', calls: c.catalog.totals.calls, bill: runBill(c.catalog) },
    { id: 'code', label: 'Code surface', calls: c.code.totals.calls, bill: runBill(c.code) }
  ];
  return { kind: 'bill', winner: c.winner, headline: comparisonHeadline(c), note: billNote(task, c), bars, scale: Math.max(bars[0].bill.total, bars[1].bill.total) };
}

/** What the language from the last screen says to the same question, as it stands before any feature is added. */
export function languageStrip(q: FreshQuestion, inv: Inventory): Strip {
  const out = runQuery(inv, q.query, new Set());
  return { kind: 'language', refused: out.ok ? 'The query ran.' : out.error, needs: q.next };
}

// ── the view of one example ────────────────────────────────────────────────

export interface ExampleView {
  def: ExampleDef;
  question: string;
  lines: string[];
  rationale: string | null;
  lineHeight: number;
  body: Block;
  ret: Block | null;
  marks: Marks;
  counters: Counters;
  answer: AnswerCard;
  review: ReviewCard | null;
  /** The sentence for each beat of the example. */
  copy: Partial<Record<Phase, string>>;
  strip: Strip | null;
  status: RunOutcome['status'];
}

export interface BuildInput {
  def: ExampleDef;
  program: Pick<CodeProgram, 'code' | 'rationale'>;
  outcome: RunOutcome;
  /** The estate as it was before any change: ground truth for what a question needs. */
  inv: Inventory;
  /** The comparison strip. The caller builds it, because it replays two conversations; omit it for the examples that have none. */
  strip?: Strip | null;
}

export function questionOf(def: ExampleDef): string {
  if (def.kind === 'task' && def.task) return taskPrompt(def.task);
  if (def.kind === 'fresh') return FRESH_QUESTIONS.find((q) => q.id === def.fresh)?.question ?? '';
  return 'Anything a program might try. The contract decides what happens next.';
}

export const freshOf = (def: ExampleDef): FreshQuestion | null => (def.kind === 'fresh' ? (FRESH_QUESTIONS.find((q) => q.id === def.fresh) ?? null) : null);

export const probeFor = (code: string): ContractProbe | null => CONTRACT_PROBES.find((p) => p.code === code) ?? null;

function copyOf(def: ExampleDef, code: string, o: RunOutcome, marks: Marks, c: Counters, lines: number): Partial<Record<Phase, string>> {
  const tok = fmtTokens(c.tokens);
  const scanned = `${c.scanned.toLocaleString('en-US')} ${c.scannedUnit === 'groups' ? 'resource groups' : 'records'}`;
  switch (def.id) {
    case 'cost':
      return {
        write: `Same object, same one tool, a bigger question: the cost question from the ladder, as one program of ${lines} lines. It picks Production's running VMs, adds their cost up per resource group and lists the untagged ones. The model never sees a record.`,
        run: `The runtime runs it where the data lives. ${scanned} are scanned and not one is sent to the model; the ${marks.used.size} that pass every filter, the running VMs in Production, are the ones it adds up. ${o.totals.propertyReads.toLocaleString('en-US')} field reads, no tokens.`,
        answer: `Only the answer goes back, \u2248 ${tok} tokens. The program added the totals up, so there is no sum for the model to get wrong.`
      };
    case 'tag':
      return {
        write: `The write question, as a rule: tag what is untagged in app-staging, deallocate the VMs that sat idle. The model sends the rule and a one-line rationale, not a list of ${plural(o.resourcesAffected, 'resource')}.`,
        run: `It runs on a copy of the estate, and the runtime compares before and after: ${plural(o.diff.length, 'field change')} on ${plural(o.resourcesAffected, 'resource')}, and nothing else moved. ${scanned} scanned.`,
        answer: `The model is told just enough to write its summary, \u2248 ${tok} tokens. The ${o.diff.length}-field change set stays in the runtime.`,
        review: `Nothing is applied until a person reviews the change set: ${plural(o.resourcesAffected, 'resource')}, ${plural(o.diff.length, 'field')}. Approve and it lands in this copy of the estate. Decline and nothing changes.`
      };
    case 'disks':
      return {
        write: `A question the query language was not built for: which disks belong to stopped or deallocated VMs? It has to follow a reference. As code it is ${lines} lines, written like any other program.`,
        run: `Same runtime, new question. ${scanned} are scanned for their type, with a lookup by id for each disk's VM. ${plural(marks.used.size, 'record')} end up in the answer: the disks and their VMs.`,
        answer: `${plural(answerItems(o) ?? 0, 'disk')} come back, \u2248 ${tok} tokens. Nothing was added to the tool surface for this question.`
      };
    case 'ratio':
      return {
        write: `Another nobody planned for: which five VMs cost the most per vCPU? Dividing and sorting is what the model already writes fluently, so it does not need a calculator tool either.`,
        run: `The program divides cost by vCPUs for every VM and sorts. ${scanned} are scanned, and ${plural(o.named.length, 'VM')} reach the model by name.`,
        answer: `${plural(answerItems(o) ?? 0, 'row')} come back, \u2248 ${tok} tokens. The program did the dividing, so there is no arithmetic for the model to get wrong.`
      };
    case 'lookup':
      return {
        write: `A narrow question: how many resource groups does Production have, and what are they called? ${lines} lines, and not one resource record involved.`,
        run: `It reads ${plural(marks.scannedGroups.size, 'resource group')} and no resource record. ${marks.usedGroups.size} of the groups are Production's.`,
        answer: `${plural(marks.usedGroups.size, 'name')} come back, \u2248 ${tok} tokens. A narrow tool would have done this too, and for less.`
      };
    case 'break': {
      const probe = probeFor(code);
      const text = probe ? `${probe.label}. ${probe.why}` : `Your program. The runtime answered ${o.status}${o.error ? `: ${o.error}` : ''}.`;
      return { see: text, change: text, do: text };
    }
  }
}

/** Every number and sentence one example puts on the screen, from one run of its program. */
export function buildExample(input: BuildInput): ExampleView {
  const { def, program, outcome: o, inv } = input;
  const lines = def.kind === 'break' ? program.code.split('\n') : displayLines(program.code);
  const marks = marksOf(def, o, inv);
  const counters = countersOf(o, marks);
  const fresh = freshOf(def);
  const bands = bandsOf(lines);
  return {
    def,
    question: questionOf(def),
    lines,
    rationale: program.rationale ?? null,
    lineHeight: lineHeightFor(lines.length, Boolean(program.rationale)),
    body: bands.body,
    ret: bands.ret,
    marks,
    counters,
    answer: answerCard(o),
    review: reviewCard(o),
    copy: copyOf(def, program.code, o, marks, counters, lines.length),
    strip: input.strip !== undefined ? input.strip : fresh ? languageStrip(fresh, inv) : null,
    status: o.status
  };
}

// ── motion ─────────────────────────────────────────────────────────────────
//
// One number, `u`, places the stage: below 0 the program is being written, 0 is the program in full,
// 1 the run complete, 2 the answer back, 3 the change set in front of a person.

export const PHASE_U: Record<Phase, number> = { write: 0, run: 1, answer: 2, review: 3, see: 2, change: 2, do: 2 };
/** Where `u` starts when an example opens, so its program can write itself in. */
export const U_START = -1;

/** How much of the program is on the panel: line by line, top to bottom. */
export const lineAlpha = (i: number, u: number): number => ease(seg(u, U_START + i * 0.02, U_START + 0.4 + i * 0.02));
/** The counters and the answer's frame arrive once the program is mostly there. */
export const chromeAt = (u: number): number => ease(seg(u, -0.6, -0.1));
/** The run's sweep across the estate, 0..1. */
export const sweepAt = (u: number): number => ease(seg(u, 0.05, 0.85));
/** The marks that settle once the sweep is done: what it used, what it changed. */
export const settledAt = (u: number): number => ease(seg(u, 0.8, 1));
export const answerAt = (u: number): number => ease(seg(u, 1.15, 1.7));
export const reviewAt = (u: number): number => ease(seg(u, 2.15, 2.75));
export const bodyBand = (u: number): number => ease(seg(u, 0.05, 0.25)) * (1 - ease(seg(u, 1.0, 1.25)));
export const retBand = (u: number): number => ease(seg(u, 1.05, 1.35)) * (1 - ease(seg(u, 2.05, 2.3)));
