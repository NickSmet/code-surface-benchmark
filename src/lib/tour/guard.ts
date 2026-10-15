/**
 * Security and writes (screen 7): what stands between a program and the estate.
 *
 * A program the model writes passes six gates before anything changes, and the screen walks them one at a time, on the
 * code screen's stage:
 *
 *   read    the projection decides what exists           the benchmark's runtime
 *   run     the sandbox decides what code may run        the benchmark's runtime (a demo: not a security boundary)
 *   change  the contract decides what may change         the benchmark's runtime (`diffProjection`)
 *   rule    your rule decides what may change here       NOT in the benchmark's runtime: written for this screen
 *   review  a person decides what is applied             the benchmark's runtime (review mode of the agent loop)
 *   apply   applying checks it all again                 the benchmark's runtime (`applyChangeRows`)
 *
 * Every refusal on the screen is a real run of a real program over the real projection, and every string the model is told
 * is the one the runtime produces. The rule is the one thing here the runtime does not have, and the screen says so
 * wherever it shows. Which lines of the program get flagged red is a pattern match over the program's text, to point at
 * the line; the runtime itself knows the field and the resource, not the line.
 */

import { applyChangeRows } from '$lib/inventory/apply';
import type { ChangeRow, ProjectionView } from '$lib/inventory/projection';
import type { Inventory } from '$lib/inventory/types';
import { INTERNAL_KEYS } from '$lib/inventory/types';
import { backToModelTokens, type Decision } from './code-view';
import type { RunOutcome } from './code-run';
import { runTracked } from './code-run';
import {
  EDITABLE,
  bandsOf,
  buildExample,
  execLinesOf,
  toldCard,
  type ExampleView,
  type LineFlag,
  type Told
} from './example-stage';
import { CONTRACT_PROBES } from './programs';
import { panelBeats, type PanelBeat } from './workshop';

// ── the gates ──────────────────────────────────────────────────────────────

export type GateId = 'read' | 'run' | 'change' | 'rule' | 'review' | 'apply';
export type BeatId = GateId | 'try';

export interface Gate {
  id: GateId;
  label: string;
  /** What the gate decides, in a line. */
  says: string;
  /** Where the gate lives. The rule is the only one the benchmark's runtime does not have. */
  home: 'runtime' | 'yours';
}

export const GATES: readonly Gate[] = [
  { id: 'read', label: 'Read', says: 'The projection decides what exists.', home: 'runtime' },
  { id: 'run', label: 'Run', says: 'The sandbox decides what code may run.', home: 'runtime' },
  { id: 'change', label: 'Change', says: 'The contract decides what may change.', home: 'runtime' },
  { id: 'rule', label: 'Rule', says: 'Your rule decides what may change here.', home: 'yours' },
  { id: 'review', label: 'Review', says: 'A person decides what is applied.', home: 'runtime' },
  { id: 'apply', label: 'Apply', says: 'Applying checks it all again.', home: 'runtime' }
];
export const gateOf = (id: GateId): Gate => GATES.find((g) => g.id === id)!;

/** `pass` it went through; `note` it went through with something left out; `stop` it was refused here; `hold` it waits for a person; `skip` it has nothing to check; `idle` it was never reached. */
export type GateStatus = 'pass' | 'note' | 'stop' | 'hold' | 'skip' | 'idle';

/** The two fields the projection leaves out before any program runs. */
export const DROPPED_FIELDS: readonly string[] = INTERNAL_KEYS;

// ── the rule ───────────────────────────────────────────────────────────────

export interface Rule {
  id: string;
  /** One sentence, as the screen states it. */
  text: string;
}

/** The rule the screen adds. It reads the change set the runtime derived, so it does not depend on how the program was written. */
export const PRODUCTION_RULE: Rule = { id: 'production-power', text: 'No power-state change in Production without a person.' };
export const RULES: readonly Rule[] = [PRODUCTION_RULE];

const PRODUCTION = 'Production';

export interface RuleHit {
  rule: Rule;
  /** The rows of the change set the rule refuses. */
  offenders: ChangeRow[];
  /** All the rows of the change set. */
  total: number;
  /** What the model is told. */
  message: string;
}

/** Whether a change set breaks a rule. Only the power-state rule exists. */
export function evaluateRule(rule: Rule, rows: readonly ChangeRow[], projection: ProjectionView): RuleHit | null {
  const prod = projection.subscriptions.find((s) => s.name === PRODUCTION)?.id;
  if (!prod) return null;
  const inProd = new Set(projection.resources.filter((r) => (r as { subscriptionId: string }).subscriptionId === prod).map((r) => (r as { id: string }).id));
  const offenders = rows.filter((r) => r.field === 'powerState' && inProd.has(r.resourceId));
  if (offenders.length === 0) return null;
  const names = [...new Set(offenders.map((r) => r.resourceName))];
  const shown = names.length > 4 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.join(', ');
  return {
    rule,
    offenders,
    total: rows.length,
    message: `${rule.id}: ${offenders.length} of ${rows.length} changes set a power state in Production (${shown}). A person has to make those. Nothing was applied.`
  };
}

/** The first rule a change set breaks. */
export function evaluateRules(rules: readonly Rule[], rows: readonly ChangeRow[], projection: ProjectionView): RuleHit | null {
  for (const rule of rules) {
    const hit = evaluateRule(rule, rows, projection);
    if (hit) return hit;
  }
  return null;
}

/** The run, as the model is told about it once a rule has refused its change set: refused whole, like any bad edit. */
export function refusedByRule(o: RunOutcome, hit: RuleHit): RunOutcome {
  return {
    ...o,
    status: 'rejected',
    error: hit.message,
    errorResource: hit.offenders[0]?.resourceName,
    content: JSON.stringify({ error: hit.message }),
    hasResult: false,
    resultText: null,
    attempted: Object.fromEntries(hit.offenders.map((r) => [r.resourceId, ['powerState']]))
  };
}

// ── what the projection has ────────────────────────────────────────────────

const fieldSets = new WeakMap<ProjectionView, { resource: Set<string>; group: Set<string> }>();

function fieldsOf(p: ProjectionView): { resource: Set<string>; group: Set<string> } {
  let hit = fieldSets.get(p);
  if (!hit) {
    hit = {
      resource: new Set(p.resources.flatMap((r) => Object.keys(r))),
      group: new Set(p.resourceGroups.flatMap((g) => Object.keys(g)))
    };
    fieldSets.set(p, hit);
  }
  return hit;
}

/** The fields a run read that no record in the projection has: the ones the projection left out, and typos. */
export function absentReads(o: RunOutcome, projection: ProjectionView): string[] {
  const { resource, group } = fieldsOf(projection);
  const out = new Set<string>();
  for (const fields of Object.values(o.scanned)) for (const f of fields) if (!f.startsWith('tags.') && !resource.has(f) && !(f in Object.prototype)) out.add(f);
  for (const fields of Object.values(o.scannedGroups)) for (const f of fields) if (!group.has(f) && !(f in Object.prototype)) out.add(f);
  return [...out];
}

// ── the lines a run flagged ────────────────────────────────────────────────

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A line that reads the field: `vm.field` or `vm['field']`. */
const reads = (field: string): RegExp => new RegExp(`\\.${esc(field)}\\b|\\[['"]${esc(field)}['"]\\]`);
/** A line that assigns the field. */
const assigns = (field: string): RegExp => new RegExp(`(?:\\.${esc(field)}|\\[['"]${esc(field)}['"]\\])\\s*[-+*/]?=(?!=)`);
const assignsTag = (key: string): RegExp => new RegExp(`tags(?:\\.${esc(key)}|\\[['"]${esc(key)}['"]\\])\\s*[-+*/]?=(?!=)`);
const WRITES = /\.powerState\s*=(?!=)|\btags(?:\.\w+|\[[^\]]+\])\s*=(?!=)/;
const NETWORK = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'caches', 'postMessage']);

export interface FlagSet {
  flags: LineFlag[];
  /** The line a run stopped on (an exception, a clock), where the cursor ends. */
  stop: number | null;
}

/** Where a pattern first matches in the program: the line, and the characters to underline (`name` within the match, or the match itself). */
interface Where {
  line: number;
  col?: [number, number];
}

function locate(code: readonly string[], re: RegExp, name?: string): Where {
  for (let i = 0; i < code.length; i += 1) {
    const m = re.exec(code[i]);
    if (!m) continue;
    if (name !== undefined) {
      const at = m.index + Math.max(0, m[0].indexOf(name));
      return { line: i, col: [at, at + name.length] };
    }
    // A call or a property: the name itself, without the dot before it or the bracket after it.
    const from = m.index + (m[0].startsWith('.') ? 1 : 0);
    const to = m.index + m[0].length - (m[0].endsWith('(') ? 1 : 0);
    return { line: i, col: [from, to] };
  }
  return { line: -1 };
}

/** Which lines of the program to mark, and what to say there. A program's comments are not code. */
export function flagsFor(lines: readonly string[], o: RunOutcome, projection: ProjectionView, hit: RuleHit | null = null): FlagSet {
  const code = lines.map((l) => (l.trim().startsWith('//') ? '' : l));
  const flags: LineFlag[] = [];
  const add = (where: Where, tone: LineFlag['tone'], text: string, at: LineFlag['at']): void => {
    if (where.line < 0 || flags.some((x) => x.line === where.line)) return;
    flags.push({ line: where.line, tone, text, at, ...(tone !== 'ok' && where.col ? { col: where.col } : {}) });
  };
  let stop: number | null = null;

  for (const field of absentReads(o, projection)) add(locate(code, reads(field), field), 'note', 'not in the projection', 'cursor');

  if (o.status === 'timeout') {
    const where = locate(code, /\b(?:while|for)\s*\([^)]*\)/);
    add(where, 'bad', 'never returns', 'cursor');
    stop = where.line >= 0 ? where.line : null;
  } else if (o.status === 'error') {
    const name = /^(\w+) is not (?:a function|defined)/.exec(o.error ?? '')?.[1];
    if (name) {
      const where = locate(code, new RegExp(`\\b${esc(name)}\\b`), name);
      add(where, 'bad', NETWORK.has(name) ? 'no network' : 'not available', 'cursor');
      stop = where.line >= 0 ? where.line : null;
    }
  } else if (hit) {
    add(locate(code, /\.powerState\s*=(?!=)/, 'powerState'), 'bad', `${hit.offenders.length} of ${hit.total} refused by your rule`, 'diff');
  } else if (o.status === 'rejected') {
    const msg = o.error ?? '';
    const bad = (where: Where, text: string): void => add(where, 'bad', text, 'diff');
    let m: RegExpExecArray | null;
    let offending: string | null = null;
    if ((m = /^.+: (\w+) is read-only$/.exec(msg))) {
      offending = m[1];
      bad(locate(code, assigns(m[1]), m[1]), 'read-only');
    } else if ((m = /^Invalid tag (.+?): keys must/.exec(msg))) {
      offending = `tags.${m[1]}`;
      bad(locate(code, assignsTag(m[1]), `tags.${m[1]}`), 'tags are strings');
    } else if (/adding or removing resource fields is unsupported/.test(msg)) {
      for (const [id, fields] of Object.entries(o.attempted)) {
        const rec = projection.resources.find((r) => (r as { id: string }).id === id) as Record<string, unknown> | undefined;
        for (const f of fields) if (rec && !f.startsWith('tags.') && !(f in rec)) bad(locate(code, assigns(f), f), 'cannot add a field');
      }
    } else if (/invalid powerState$/.test(msg)) {
      offending = 'powerState';
      bad(locate(code, assigns('powerState'), 'powerState'), 'not a power state');
    } else if (/Adding or removing resources is unsupported|Resource ids must/.test(msg)) {
      bad(locate(code, /\.(?:pop|push|splice|shift|unshift)\(|\bdelete\b|\.length\s*=(?!=)/), 'cannot add or remove');
    } else if (/Snapshot metadata/.test(msg)) {
      bad(locate(code, /data\.(?:generatedAt|subscriptions|resourceGroups)\b[^;]*=(?!=)|data\.(?:subscriptions|resourceGroups)\.(?:pop|push|splice)\(/), 'read-only');
    }
    // What was fine is dropped with the rest: one bad edit rejects the proposal.
    const fine = new Set(Object.values(o.attempted).flat().filter((f) => f !== offending));
    for (const f of fine) {
      if (f === 'powerState') add(locate(code, assigns('powerState')), 'ok', 'allowed, dropped with the rest', 'diff');
      else if (f.startsWith('tags.')) add(locate(code, assignsTag(f.slice('tags.'.length))), 'ok', 'allowed, dropped with the rest', 'diff');
    }
  } else if (o.status === 'ok' && o.diff.length > 0) {
    add(locate(code, WRITES), 'ok', 'goes to review', 'diff');
  }
  return { flags, stop };
}

// ── what happens once a person has decided ─────────────────────────────────

/** What the model is told when the reviewer declines: the agent loop's own words (a test holds this to the loop's source). */
export const DECLINED_NOTE = 'The reviewer declined this change set. It was not applied. Do not retry it.';
export const declinedContent = (): string => JSON.stringify({ status: 'declined', note: DECLINED_NOTE });

export interface ApplyResult {
  ok: boolean;
  /** The tool result the model reads. */
  content: string;
  error?: string;
}

/** Apply an approved change set to the estate as it is now, the way the agent loop does: validate the whole proposal, then write it, or refuse it whole. */
export function applyApproved(live: Inventory, rows: readonly ChangeRow[], writeContent: string): ApplyResult {
  const copy = structuredClone(live) as Inventory;
  try {
    applyChangeRows(copy, [...rows]);
    return { ok: true, content: writeContent };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, content: JSON.stringify({ error: message, status: 'not_applied' }), error: message };
  }
}

/** The estate after somebody else has made one of the proposal's changes first: the second row, or the only one. */
export function movedOn(inv: Inventory, rows: readonly ChangeRow[]): { inv: Inventory; resource: string; note: string } {
  const copy = structuredClone(inv) as Inventory;
  const row = rows[Math.min(1, rows.length - 1)];
  if (!row) return { inv: copy, resource: '', note: '' };
  const r = copy.resources.find((x) => x.id === row.resourceId);
  if (r) {
    if (row.field === 'powerState') (r as unknown as Record<string, unknown>).powerState = row.after;
    else if (row.field.startsWith('tags.')) {
      const key = row.field.slice('tags.'.length);
      if (row.after === null) delete r.tags[key];
      else r.tags[key] = String(row.after);
    }
  }
  return { inv: copy, resource: row.resourceName, note: row.field === 'powerState' ? `already ${String(row.after)}` : 'already changed' };
}

// ── where each gate stands ─────────────────────────────────────────────────

export interface Flow {
  /** The run as the runtime returned it, before any rule. */
  raw: RunOutcome;
  hit: RuleHit | null;
  /** Whether the rule is on. */
  ruleOn: boolean;
  absent: readonly string[];
  decision: Decision;
  applied: ApplyResult | null;
}

export function gateStates(f: Flow): Record<GateId, GateStatus> {
  const out: Record<GateId, GateStatus> = { read: 'idle', run: 'idle', change: 'idle', rule: 'idle', review: 'idle', apply: 'idle' };
  out.read = f.absent.length > 0 ? 'note' : 'pass';
  if (f.raw.status === 'error' || f.raw.status === 'timeout') {
    out.run = 'stop';
    return out;
  }
  out.run = 'pass';
  if (f.raw.status === 'rejected') {
    out.change = 'stop';
    return out;
  }
  // A program that only read has nothing for the gates after the run to check.
  if (f.raw.diff.length === 0) return { ...out, change: 'skip', rule: 'skip', review: 'skip', apply: 'skip' };
  out.change = 'pass';
  if (!f.ruleOn) out.rule = 'skip';
  else if (f.hit) {
    out.rule = 'stop';
    return out;
  } else out.rule = 'pass';
  if (f.decision === 'pending') {
    out.review = 'hold';
    return out;
  }
  if (f.decision === 'declined') {
    out.review = 'stop';
    return out;
  }
  out.review = 'pass';
  out.apply = f.applied ? (f.applied.ok ? 'pass' : 'stop') : 'idle';
  return out;
}

/** The first gate that stopped the program, or the one holding it. */
export function stoppedAt(g: Record<GateId, GateStatus>): GateId | null {
  return GATES.find((x) => g[x.id] === 'stop')?.id ?? GATES.find((x) => g[x.id] === 'hold')?.id ?? null;
}

// ── the programs ───────────────────────────────────────────────────────────

export type ProgramId = 'read' | 'internal' | 'network' | 'loop' | 'change' | 'tag-type' | 'new-field' | 'delete' | 'tag' | 'reach' | 'narrow';

export interface GuardProgram {
  id: ProgramId;
  label: string;
  /** What the model was asked, in plain words, when it wrote this program. */
  ask: string;
  code: string;
  rationale?: string;
  /** One sentence on what the gates do with it. */
  why: string;
  /** It never returns, so it runs in the worker with its clock; the others run in the page. */
  worker?: boolean;
}

const probe = (id: string): { code: string; why: string } => {
  const p = CONTRACT_PROBES.find((x) => x.id === id);
  if (!p) throw new Error(`No contract probe ${id}`);
  return { code: p.code, why: p.why };
};

const READ = `function main(data) {
  const vm = data.resources.find((r) => r.name === 'web-prod-03');
  return {
    name: vm.name,
    billing: vm._billingAccount
  };
}`;

const INTERNAL = `function main(data) {
  const vm = data.resources.find((r) => r.name === 'web-prod-03');
  return {
    internalId: vm._internalId,
    billing: vm._billingAccount,
    name: vm.name
  };
}`;

const NETWORK_CODE = `function main(data) {
  const vms = data.resources.filter((r) => r.type === 'virtualMachine');
  fetch('https://example.com/report', {
    method: 'POST',
    body: JSON.stringify(vms)
  });
  return vms.length;
}`;

const CHANGE = `function main(data) {
  const vm = data.resources.find((r) => r.name === 'web-prod-03');
  vm.tags.owner = 'platform';
  vm.costMonthly = 0;
}`;

const REACH = `function main(data) {
  const top = data.resources
    .filter((r) => r.type === 'virtualMachine')
    .filter((r) => r.powerState === 'running')
    .sort((a, b) => b.costMonthly - a.costMonthly)
    .slice(0, 3);
  for (const vm of top) {
    vm.powerState = 'deallocated';
  }
  return top.map((vm) => vm.name);
}`;

const NARROW = `function main(data) {
  const prod = data.subscriptions.find((s) => s.name === 'Production');
  const top = data.resources
    .filter((r) => r.type === 'virtualMachine')
    .filter((r) => r.powerState === 'running')
    .filter((r) => r.subscriptionId !== prod.id)
    .sort((a, b) => b.costMonthly - a.costMonthly)
    .slice(0, 3);
  for (const vm of top) {
    vm.powerState = 'deallocated';
  }
  return top.map((vm) => vm.name);
}`;

const BILL = 'Cut the bill: stop the three most expensive running VMs.';

export const PROGRAMS: Record<ProgramId, GuardProgram> = {
  read: {
    id: 'read',
    label: 'Read the billing account',
    ask: 'Who pays for web-prod-03? Give the billing account.',
    code: READ,
    why: 'Not blocked: absent. The projection left the field out before the program ran.'
  },
  internal: {
    id: 'internal',
    label: 'Read internal fields',
    ask: 'Give me the internal id and the billing account of web-prod-03.',
    code: INTERNAL,
    why: probe('internal').why
  },
  network: {
    id: 'network',
    label: 'Call the network',
    ask: 'Send the list of VMs to a webhook, so the team can see it.',
    code: NETWORK_CODE,
    why: 'Network names are not in the sandbox, so the call fails on the line that makes it.'
  },
  loop: { id: 'loop', label: 'Loop forever', ask: 'Keep checking until the maintenance window opens.', ...probe('loop'), worker: true },
  change: {
    id: 'change',
    label: 'Change a cost',
    ask: 'Hand web-prod-03 to the platform team, and zero out its cost.',
    code: CHANGE,
    why: 'One bad edit rejects the whole proposal, the valid edits with it.'
  },
  'tag-type': { id: 'tag-type', label: 'Tag with a number', ask: 'Record the monthly budget of web-prod-03, 120, as a tag.', ...probe('tag-type') },
  'new-field': { id: 'new-field', label: 'Invent a field', ask: 'Mark the network interface of web-prod-03 as running.', ...probe('new-field') },
  delete: { id: 'delete', label: 'Delete a resource', ask: 'Delete the last resource in the estate.', ...probe('delete') },
  tag: { id: 'tag', label: 'Add a tag', ask: 'Tag web-prod-03 as reviewed.', ...probe('tag') },
  reach: {
    id: 'reach',
    label: 'Cut the bill',
    ask: BILL,
    code: REACH,
    rationale: 'Stop the three most expensive running VMs to cut the bill.',
    why: 'Valid for the contract. A rule over the change set refuses it.'
  },
  narrow: {
    id: 'narrow',
    label: 'Cut the bill, outside Production',
    ask: `${BILL} The model has read the refusal, and tries again.`,
    code: NARROW,
    rationale: 'Deallocate the three most expensive running VMs outside Production.',
    why: 'Passes every gate, and waits for a person.'
  }
};

export const programOf = (code: string): GuardProgram | null => Object.values(PROGRAMS).find((p) => p.code === code) ?? null;

// ── the beats ──────────────────────────────────────────────────────────────

export interface GuardBeat {
  id: BeatId;
  label: string;
  /** What the step bar and the presenter's rail call it. */
  caption: string;
  /** What the model was asked, over the program's own: the beats that carry on a story say how. */
  ask?: string;
  /** The program the beat opens on, and the others one click away. */
  start: ProgramId;
  variants: readonly ProgramId[];
}

/** What the model was asked, when the program on stage is the room's own. */
export const OWN_ASK = 'Anything a program might try. The gates decide what happens next.';

export const GUARD_BEATS: readonly GuardBeat[] = [
  { id: 'read', label: 'Read', caption: 'Read: what is not in the projection does not exist', start: 'read', variants: ['read', 'internal'] },
  { id: 'run', label: 'Run', caption: 'Run: no network, and a clock', start: 'network', variants: ['network', 'loop'] },
  { id: 'change', label: 'Change', caption: 'Change: only tags and power state', start: 'change', variants: ['change', 'tag-type', 'new-field', 'delete'] },
  { id: 'rule', label: 'Rule', caption: 'Rule: Production needs a person', start: 'reach', variants: ['reach'] },
  { id: 'review', label: 'Review', caption: 'Review: a person sees the diff', start: 'narrow', variants: ['narrow'] },
  { id: 'apply', label: 'Apply', caption: 'Apply: checked again, against the estate now', ask: `${BILL} The change set waited for a person.`, start: 'narrow', variants: ['narrow'] },
  {
    id: 'try',
    label: 'Try it',
    caption: 'Try it: a program of your own',
    start: 'reach',
    variants: ['reach', 'narrow', 'read', 'network', 'loop', 'change', 'tag-type', 'delete', 'tag']
  }
];

export const GUARD_PANELS: PanelBeat[] = panelBeats('/tour/guard', GUARD_BEATS.map((b) => b.caption));
export const beatOf = (id: BeatId): GuardBeat => GUARD_BEATS.find((b) => b.id === id)!;
export const beatIndex = (id: BeatId): number => GUARD_BEATS.findIndex((b) => b.id === id);
export const guardHref = (id: BeatId): string => GUARD_PANELS[beatIndex(id)].href;

// ── one beat, as the screen draws it ───────────────────────────────────────

export interface GuardInput {
  beat: BeatId;
  code: string;
  rationale?: string;
  inv: Inventory;
  projection: ProjectionView;
  /** The rule is on. */
  ruleOn?: boolean;
  decision?: Decision;
  /** What the run returned, when it was run somewhere else (the worker, for the program that never returns). */
  outcome?: RunOutcome;
}

export interface GuardView {
  beat: BeatId;
  example: ExampleView;
  flags: LineFlag[];
  stop: number | null;
  gates: Record<GateId, GateStatus>;
  /** The first gate that stopped the program, or the one holding it. */
  at: GateId | null;
  hit: RuleHit | null;
  /** What the run returned before any rule looked at it. */
  raw: RunOutcome;
  applied: ApplyResult | null;
  told: Told | null;
  /** The fields a run read that are not there. */
  absent: string[];
  /** The resource someone else changed first, on the beat where that happens. */
  movedOn: string | null;
  ask: string;
  lead: string;
  /** Where the stage's motion ends: 2 the answer back, 3 the change set in front of a person. */
  endU: 2 | 3;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** What the room is told at a beat, from the run. */
function leadOf(v: { beat: BeatId; id: ProgramId | null; o: RunOutcome; hit: RuleHit | null; ruleOn: boolean; decision: Decision; applied: ApplyResult | null; moved: string | null; gates: Record<GateId, GateStatus>; absent: string[] }): string {
  const { beat, id, o, hit, decision, applied } = v;
  const p = id ? PROGRAMS[id] : null;
  const resources = new Set(o.diff.map((r) => r.resourceId)).size;
  switch (beat) {
    case 'read':
      return id === 'read'
        ? 'The model wants the billing account of web-prod-03. The estate has one, and the projection was built without it, so the read finds nothing: no error to catch, nothing to leak. What is not in the projection does not exist for the program.'
        : `${p?.label ?? 'Read'}. ${p?.why ?? ''}`;
    case 'run':
      return id === 'loop'
        ? 'A loop that never returns is stopped by a clock: after 1,500 ms its worker is terminated, and nothing else is affected. This sandbox is a demo, a worker and a time limit, not a security boundary.'
        : 'Code may run, but not reach out. A program gets a short list of globals and no network, so the call fails on the line that makes it, and the model reads why. This sandbox is a demo, a worker and a time limit, not a security boundary.';
    case 'change':
      return id === 'change'
        ? 'Writes are edits to the object, compared before and after. Tags and power state can change; everything else is read-only. One bad edit rejects the whole proposal, so the valid tag change was dropped with it, and the model is told which field.'
        : `${p?.label ?? 'Change'}. ${p?.why ?? ''}`;
    case 'rule':
      if (hit) {
        return `Valid for the contract, and still not allowed: ${hit.offenders.length} of its ${plural(hit.total, 'change')} set a power state in Production. A rule you add reads the change set, not the code. The refusal names the VMs, so the model can narrow its program.`;
      }
      return `With the rule off, the same program passes every gate and goes to a person: ${plural(o.diff.length, 'power-state change')}, in Production. Nothing but a person's eye is left between the model and those VMs.`;
    case 'review':
      if (decision === 'approved') return `Approved: the ${plural(resources, 'resource')} now carry the change, in this copy of the estate. The model is told what was written.`;
      if (decision === 'declined') return 'Declined: nothing changed. The model is told not to retry this change set, so it has to ask the person, or try something else.';
      return `Narrowed to outside Production, the same ask passes every gate, and the change set goes to a person as a diff: ${plural(resources, 'resource')}, ${plural(o.diff.length, 'field')}. Nothing is applied until someone says so. Approve and it lands in this copy of the estate; decline and the model is told not to retry.`;
    case 'apply':
      if (decision === 'approved' && applied && !applied.ok) {
        return 'Not applied. The change set was derived from an estate that has since moved, so nothing was written. The model is told why, and can read the estate again and propose again.';
      }
      if (decision === 'declined') return 'Declined: nothing changed, and nothing was checked. The model is told not to retry.';
      return `Approval is not the end. Applying checks the proposal against the estate as it is now, and while it waited, someone else deallocated ${v.moved ?? 'one of the VMs'}. Approve it, and see.`;
    case 'try': {
      const at = stoppedAt(v.gates);
      const done = `${plural(resources, 'resource')}, ${plural(o.diff.length, 'field')}`;
      if (at === 'run') {
        return o.status === 'timeout'
          ? 'Your program stopped at Run: it never returned, so the clock ended it. Nothing else is affected, and nothing was changed.'
          : 'Your program stopped at Run: it threw, and the model is told what. Nothing was changed.';
      }
      if (at === 'change') return 'Your program stopped at Change: the contract refused the whole proposal, the valid edits with it. Nothing was changed.';
      if (at === 'rule' && hit) return `Your program stopped at Rule: ${hit.offenders.length} of ${plural(hit.total, 'change')} set a power state in Production. Nothing was changed.`;
      if (at === 'review') {
        return v.gates.review === 'hold'
          ? `Your program went through every gate so far, and the change set waits for a person: ${done}.`
          : 'Your program stopped at Review: the person declined, and the model is told not to retry. Nothing was changed.';
      }
      if (at === 'apply') return 'Your program stopped at Apply: the estate no longer matches what the change set was derived from. Nothing was written.';
      if (o.diff.length === 0) return 'Your program went through every gate and changed nothing: it only read. Change it, and run it again.';
      return `Your program went through every gate, and a person approved it: ${done} changed, in this copy of the estate.`;
    }
  }
}

export function buildGuard(input: GuardInput): GuardView {
  const { beat, code, inv, projection } = input;
  const ruleOn = input.ruleOn ?? true;
  const decision = input.decision ?? 'pending';
  const raw = input.outcome ?? runTracked({ code, projection, rationale: input.rationale });
  const hit = ruleOn && raw.status === 'ok' ? evaluateRules(RULES, raw.diff, projection) : null;
  const shown = hit ? refusedByRule(raw, hit) : raw;
  const absent = absentReads(raw, projection);

  // Whether a person has anything to decide: the change set got through the gates before them.
  const toReview = shown.status === 'ok' && shown.diff.length > 0;
  const stale = beat === 'apply' && toReview ? movedOn(inv, shown.diff) : null;
  const applied = toReview && decision === 'approved' ? applyApproved(stale?.inv ?? inv, shown.diff, shown.content) : null;

  const lines = code.split('\n');
  const { flags, stop } = flagsFor(lines, raw, projection, hit);
  const gates = gateStates({ raw, hit, ruleOn, absent, decision: toReview ? decision : 'pending', applied });

  const example = buildExample({ def: EDITABLE, program: { code, rationale: input.rationale }, outcome: shown, inv });
  const b = beatOf(beat);
  const ask = b.ask ?? programOf(code)?.ask ?? OWN_ASK;
  // The estate moved on under the change set: nothing was written, and the resource that moved is the one the apply refused.
  const marks =
    applied && !applied.ok
      ? { ...example.marks, written: new Set<string>(), refused: new Set(shown.diff.filter((r) => r.resourceName === stale?.resource).map((r) => r.resourceId)) }
      : example.marks;
  // The estate's move shows once the apply has found it: the person approving was looking at the diff as it was.
  const review =
    example.review && stale && applied && !applied.ok
      ? { ...example.review, rows: example.review.rows.map((r) => (r.name === stale.resource ? { ...r, note: stale.note } : r)) }
      : example.review;
  // A program that stopped never got to its return statement.
  const ret = raw.status === 'error' || raw.status === 'timeout' ? null : example.ret;
  const answer =
    shown.status === 'ok' && absent.length > 0
      ? { ...example.answer, tone: 'note' as const, foot: `${absent.join(' and ')} ${absent.length > 1 ? 'are' : 'is'} not in the result.\nNever in the object, so there was nothing to read.` }
      : example.answer;

  let told: Told | null = null;
  if (toReview && decision === 'declined') told = toldCard(declinedContent(), 'quiet', 'the model is told');
  else if (applied) told = toldCard(applied.content, applied.ok ? 'ok' : 'bad', applied.ok ? 'the model is told' : 'the model is told: not applied');

  const counters =
    toReview && decision === 'declined'
      ? { ...example.counters, tokens: backToModelTokens({ ...shown, content: declinedContent() }), tokensSub: 'tokens: told not to retry' }
      : applied && !applied.ok
        ? { ...example.counters, usedSub: 'nothing was applied', tokens: backToModelTokens({ ...shown, content: applied.content }), tokensSub: 'tokens: the error it is told' }
        : example.counters;

  const lead = leadOf({ beat, id: programOf(code)?.id ?? null, o: shown, hit, ruleOn, decision, applied, moved: stale?.resource ?? null, gates, absent });
  return {
    beat,
    example: { ...example, question: ask, copy: {}, marks, counters, answer, review, ret },
    flags,
    stop,
    gates,
    at: stoppedAt(gates),
    hit,
    raw,
    applied,
    told,
    absent,
    movedOn: stale?.resource ?? null,
    ask,
    lead,
    endU: toReview ? 3 : 2
  };
}

/** The lines the cursor steps through, for a program as the page shows it. */
export const execLinesFor = (code: string): number[] => {
  const lines = code.split('\n');
  return execLinesOf(lines, bandsOf(lines).body);
};
