/**
 * Your turn: three small changes to programs the room has just seen, each one predicted before it is run.
 *
 * The screen is the code screen's stage with an editable program on it. An exercise is a base program (one of the
 * benchmark's own, or one of the tour's), the change the room is asked to make, and a few more changes to try
 * afterwards. Every change is the base program with one place swapped for another, so a change can never drift from
 * the program it changes, and every number the screen prints comes from running both programs: nothing here is
 * written down. The tests hold the three predictions to the runs they are about.
 */
import type { RunOutcome } from './code-run';
import { backToModelTokens } from './code-view';
import type { CodeProgram } from './programs';

export type ExerciseId = 'filter' | 'field' | 'rule';
/** Predict is the base program run, with the change still to come. Result is the change, run, against it. */
export type TurnPhase = 'predict' | 'result';
export const TURN_PHASES: readonly TurnPhase[] = ['predict', 'result'];
export const PHASE_LABEL: Record<TurnPhase, string> = { predict: 'Predict', result: 'Result' };

/** A change to a base program: the whole program with the change in it. */
export interface Change {
  id: string;
  /** What the button says. */
  label: string;
  code: string;
}

/** What the strip compares: a label, and what it was before. What it is after comes from the run of the change. */
export interface Tile {
  label: string;
  value: string;
}

export interface Exercise {
  id: ExerciseId;
  /** The picker's label. */
  label: string;
  /** The line above the stage: the base program's question, and the change asked for. */
  ask: string;
  /** What the room is asked before the run, in the chat. */
  predict: string;
  base: { code: string; rationale?: string };
  /** The change the room was asked to make comes first; the rest are "what if". */
  changes: readonly Change[];
  /** What the two runs are compared on: four numbers, read off one run. */
  tiles: (o: RunOutcome) => Tile[];
  /** One sentence on what the change did, from the two runs. */
  says: (before: RunOutcome, after: RunOutcome) => string;
}

// ── making a change ────────────────────────────────────────────────────────

/**
 * The program without its blank lines, as the code screen draws it. The text box shows the program's lines as they are,
 * so a program with blank lines would be drawn smaller to make room for lines that say nothing.
 */
export const compact = (code: string): string =>
  code
    .split('\n')
    .filter((l) => l.trim() !== '')
    .join('\n');

/** The program with `from` replaced by `to`. `from` has to be there exactly once: if the base program moves on, this says so loudly, and the tests fail. */
export function swap(code: string, from: string, to: string): string {
  const at = code.indexOf(from);
  if (at < 0 || code.indexOf(from, at + 1) >= 0) throw new Error(`The base program is no longer the one this change was written for. Expected exactly one: ${from}`);
  return code.slice(0, at) + to + code.slice(at + from.length);
}

// ── reading a run ──────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** What the program returned, if it ran. */
export function resultOf(o: RunOutcome): unknown {
  if (o.status !== 'ok') return undefined;
  try {
    const parsed: unknown = JSON.parse(o.content);
    return isRecord(parsed) ? parsed.result : undefined;
  } catch {
    return undefined;
  }
}

const NONE = '\u2013';
const num = (n: number): string => n.toLocaleString('en-US');
export const money = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Whether two runs came to the same thing: the same answer, and the same change set. */
export function sameAnswer(a: RunOutcome, b: RunOutcome): boolean {
  return a.status === 'ok' && b.status === 'ok' && a.content === b.content && JSON.stringify(a.diff) === JSON.stringify(b.diff);
}

/** The groups an answer to the cost question names. */
export function groupsOf(o: RunOutcome): string[] {
  const r = resultOf(o);
  return isRecord(r) && isRecord(r.byResourceGroup) ? Object.keys(r.byResourceGroup) : [];
}

/** Keys on each row of an answer that is a list of rows (the vCPU question). */
export function fieldsPerRow(o: RunOutcome): number | null {
  const r = resultOf(o);
  return Array.isArray(r) && isRecord(r[0]) ? Object.keys(r[0]).length : null;
}

/** What the scan did, said against what it did before: "still all 194 records" only when it still did. */
function scanSentence(before: RunOutcome, after: RunOutcome, moral: string): string {
  const was = before.totals.resourcesScanned;
  const now = after.totals.resourcesScanned;
  return now === was ? `The runtime still scans all ${num(now)} records: ${moral}.` : `The runtime now scans ${num(now)} records, against ${num(was)}.`;
}

const scanned = (o: RunOutcome): Tile => ({ label: 'Records scanned', value: o.status === 'ok' ? num(o.totals.resourcesScanned) : NONE });
const back = (o: RunOutcome): Tile => ({ label: 'Back to the model, tokens', value: o.status === 'ok' ? `\u2248 ${num(backToModelTokens(o))}` : NONE });

// ── the three exercises ────────────────────────────────────────────────────

const noun = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`;

export interface Sources {
  /** The benchmark's reference programs, by task. */
  programs: Record<'filter-aggregate' | 'bulk-write', CodeProgram>;
  /** The tour's program for "which five VMs cost the most per vCPU?". */
  ratio: string;
}

export function exercisesOf({ programs, ratio }: Sources): Exercise[] {
  const cost = { ...programs['filter-aggregate'], code: compact(programs['filter-aggregate'].code) };
  const tag = { ...programs['bulk-write'], code: compact(programs['bulk-write'].code) };

  // Where each change goes. A change that makes a line longer than the code panel is wide is written on several, as the programs themselves are.
  const COST_RUNNING = "    if (r.powerState !== 'running') continue;";
  const ROW = '    .map((r) => ({ vm: r.name, perVcpu: perVcpu(r) }))';
  const TAG_RULE = "    if (r.resourceGroup === 'app-staging' && Object.keys(r.tags).length === 0) {";

  return [
    {
      id: 'filter',
      label: 'A filter',
      ask: 'The cost of Production\u2019s running VMs, by resource group. Now only the ones in West Europe.',
      predict: 'Which resource group drops out, and where does the total land?',
      base: { code: cost.code },
      changes: [
        { id: 'west', label: 'West Europe only', code: swap(cost.code, COST_RUNNING, `${COST_RUNNING}\n    if (r.location !== 'westeurope') continue;`) },
        { id: 'stopped', label: 'Stopped, not running', code: swap(cost.code, "r.powerState !== 'running'", "r.powerState !== 'stopped'") }
      ],
      tiles: (o) => [
        { label: 'Groups in the answer', value: o.status === 'ok' ? num(groupsOf(o).length) : NONE },
        {
          label: 'Monthly total',
          value: (() => {
            const r = resultOf(o);
            return isRecord(r) && typeof r.totalMonthly === 'number' ? money(r.totalMonthly) : NONE;
          })()
        },
        scanned(o),
        back(o)
      ],
      says: (before, after) => {
        if (after.status !== 'ok') return `The change did not run: ${after.error ?? after.status}.`;
        const gone = groupsOf(before).filter((g) => !groupsOf(after).includes(g));
        const was = resultOf(before);
        const now = resultOf(after);
        const total = (r: unknown): string => (isRecord(r) && typeof r.totalMonthly === 'number' ? money(r.totalMonthly) : NONE);
        return `${gone.length ? `${gone.join(' and ')} ${gone.length === 1 ? 'drops' : 'drop'} out` : 'No group drops out'}, and the total goes from ${total(was)} to ${total(now)}. ${scanSentence(before, after, 'a filter changes what is kept, not what is read')}`;
      }
    },
    {
      id: 'field',
      label: 'A field',
      ask: 'The five VMs that cost the most per vCPU. Now also return each one\u2019s size and resource group.',
      predict: 'Will it read more records? How much more will the answer cost the model?',
      base: { code: ratio },
      changes: [
        {
          id: 'two',
          label: 'Add size and group',
          code: swap(ratio, ROW, '    .map((r) => ({\n      vm: r.name,\n      perVcpu: perVcpu(r),\n      size: r.vmSize,\n      group: r.resourceGroup\n    }))')
        },
        { id: 'whole', label: 'Return the whole record', code: swap(ratio, ROW, '    .map((r) => ({ ...r, perVcpu: perVcpu(r) }))') }
      ],
      tiles: (o) => [
        { label: 'Fields per VM', value: fieldsPerRow(o) === null ? NONE : num(fieldsPerRow(o)!) },
        back(o),
        scanned(o),
        { label: 'Field reads', value: o.status === 'ok' ? num(o.totals.propertyReads) : NONE }
      ],
      says: (before, after) => {
        if (after.status !== 'ok') return `The change did not run: ${after.error ?? after.status}.`;
        const was = backToModelTokens(before);
        const now = backToModelTokens(after);
        const reads = after.totals.propertyReads - before.totals.propertyReads;
        const read = reads === 0 ? 'It reads exactly the fields it did' : `It reads ${num(Math.abs(reads))} ${reads > 0 ? 'more' : 'fewer'} fields`;
        return `The answer goes from \u2248 ${num(was)} to \u2248 ${num(now)} tokens (${(now / was).toFixed(1)}\u00d7). ${read}, and reading costs the model nothing: what the program returns is the bill.`;
      }
    },
    {
      id: 'rule',
      label: 'A rule',
      ask: 'Tag the untagged resources in app-staging, deallocate the idle VMs. Now tag only the virtual machines.',
      predict: 'How many field changes will the change set hold, and on how many resources?',
      base: { code: tag.code, rationale: tag.rationale },
      changes: [
        {
          id: 'vms',
          label: 'Tag only the VMs',
          code: swap(tag.code, TAG_RULE, "    if (\n      r.type === 'virtualMachine' &&\n      r.resourceGroup === 'app-staging' &&\n      Object.keys(r.tags).length === 0\n    ) {")
        },
        { id: 'idle', label: 'Idle for 90 days, not 30', code: swap(tag.code, 'ctx.daysSince(r.lastActivityAt) > 30', 'ctx.daysSince(r.lastActivityAt) > 90') },
        { id: 'env', label: 'The env tag only', code: swap(tag.code, "      r.tags.owner = 'app-team';\n", '') }
      ],
      tiles: (o) => [
        { label: 'Fields changed', value: o.status === 'ok' ? num(o.diff.length) : NONE },
        { label: 'Resources affected', value: o.status === 'ok' ? num(o.resourcesAffected) : NONE },
        scanned(o),
        back(o)
      ],
      says: (before, after) => {
        if (after.status !== 'ok') return `The change did not run: ${after.error ?? after.status}.`;
        return `The change set goes from ${noun(before.diff.length, 'field change')} on ${noun(before.resourcesAffected, 'resource')} to ${num(after.diff.length)} on ${num(after.resourcesAffected)}. The runtime derived it from what the program did to the copy, and the model is told only \u2248 ${num(backToModelTokens(after))} tokens of it: the change set stays in the runtime.`;
      }
    }
  ];
}

export const EXERCISE_IDS: readonly ExerciseId[] = ['filter', 'field', 'rule'];

// ── where the screen is, in the URL ────────────────────────────────────────

export interface TurnState {
  id: ExerciseId;
  step: 0 | 1;
}

export function parseTurn(search: URLSearchParams): TurnState {
  const id = EXERCISE_IDS.find((e) => e === search.get('ex')) ?? EXERCISE_IDS[0];
  return { id, step: search.get('step') === '1' ? 1 : 0 };
}

export function turnHref(id: ExerciseId, step: 0 | 1 = 0): string {
  const qs = [id !== EXERCISE_IDS[0] ? `ex=${id}` : '', step === 1 ? 'step=1' : ''].filter(Boolean).join('&');
  return `/tour/turn${qs ? `?${qs}` : ''}`;
}

export interface TurnBeat extends TurnState {
  href: string;
  caption: string;
  /** The exercise: Shift and an arrow jump from one to the next. */
  group: ExerciseId;
}

export function turnBeats(labels: Record<ExerciseId, string>): TurnBeat[] {
  return EXERCISE_IDS.flatMap((id) =>
    ([0, 1] as const).map((step) => ({ id, step, href: turnHref(id, step), caption: `${labels[id]} \u00b7 ${PHASE_LABEL[TURN_PHASES[step]]}`, group: id }))
  );
}
