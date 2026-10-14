/**
 * Screen ③: where the naive tools strain, and the usual fix for each.
 *
 * One row for each scenario on the tools screen. Nothing here is measured on
 * a live model. The runs are the tools screen's own replays: the model's
 * choices are scripted, and it never mis-adds or mis-copies, while the tool
 * results are real. So what a row can say is structural: how many calls, in
 * how many turns, what the model has to write, and what the usual fix does to
 * the call count. It makes no claim about how often a model gets something
 * wrong.
 *
 * Every number in the copy is read off a replay or a plan, and the tests
 * check that it is.
 */

import type { Inventory } from '$lib/inventory/types';
import type { TaskId } from './answers';
import { TASK_LABEL, planTask, type FeatureId, type Rung, type RungId } from './language';
import type { Replay } from './replay';
import { runBill, type RunBill } from './replay-view';
import { CATALOG_ROUTES, replayCatalog } from './scenarios';
import { fmtTokens } from './tokens';

export type StrainId = 'chain' | 'arithmetic' | 'fan-out' | 'recital' | 'fits';

export interface Fix {
  /** What you do about it, in a few words. */
  label: string;
  text: string;
  /** What the model gets to learn: the vocabulary the fix adds. */
  adds: string;
  /** Where on the language screen to see it. */
  href: string;
  cta: string;
}

export interface Strain {
  id: StrainId;
  task: TaskId;
  /** The route on the tools screen that this row replays. */
  route: string;
  /** The scenario, as the tools screen names it. */
  title: string;
  /** The question, in a few words. */
  asks: string;
  replay: Replay;
  bill: RunBill;
  calls: number;
  /** Turns that carry calls: the round trips the model waits for. */
  rounds: number;
  /** The most calls in any one turn. */
  widest: number;
  strain: { label: string; text: string };
  /** `null` when nothing strains, which is the point of that row. */
  fix: Fix | null;
}

/** What to say beside a row where nothing strains, so the table ends on the counter-case. */
export const KEEP_NARROW = {
  label: 'Keep it as it is',
  text: 'A narrow tool is the right design when the question is narrow. The strain only starts when the questions get wider.'
} as const;

const SCENARIOS: Array<{ id: StrainId; task: TaskId; route: string }> = [
  { id: 'chain', task: 'granular-read', route: 'chain' },
  { id: 'arithmetic', task: 'filter-aggregate', route: 'broad' },
  { id: 'fan-out', task: 'filter-aggregate', route: 'survey' },
  { id: 'recital', task: 'bulk-write', route: 'standard' },
  { id: 'fits', task: 'single-lookup', route: 'direct' }
];

const n = (v: number): string => v.toLocaleString('en-US');
const plural = (v: number, one: string, many = `${one}s`): string => `${n(v)} ${v === 1 ? one : many}`;

type Listing = { count: number; resources: Array<{ powerState?: string }> };

/** The language screen's ladder or grow-the-language section, with the state a link asks for. */
export const strainLink = (rung: RungId | null, features: FeatureId[] = [], grow = false): string => {
  const qs = [rung ? `rung=${rung}` : '', features.length ? `f=${features.join(',')}` : ''].filter(Boolean).join('&');
  return `/tour/language${qs ? `?${qs}` : ''}${grow ? '#grow' : ''}`;
};

/**
 * The five rows. `rungs` are the ladder's tool rungs (see `buildToolRungs`) and `inv` the estate they ran on:
 * the fixes quote them, so a number about a fix is the number the language screen shows.
 */
export function buildStrains(inv: Inventory, rungs: Rung[]): Strain[] {
  const rung = (id: RungId): Rung => {
    const r = rungs.find((x) => x.id === id);
    if (!r) throw new Error(`No rung ${id}`);
    return r;
  };
  const plan = (task: TaskId, features: FeatureId[]) => planTask(task, new Set(features), structuredClone(inv));
  const replays = new Map(SCENARIOS.map((s) => [s.id, replayCatalog({ task: s.task, route: s.route })]));
  const calls = (id: StrainId): number => replays.get(id)!.totals.calls;

  return SCENARIOS.map((s): Strain => {
    const replay = replays.get(s.id)!;
    const title = CATALOG_ROUTES[s.task].find((r) => r.id === s.route)!.label;
    const base = {
      id: s.id,
      task: s.task,
      route: s.route,
      title,
      asks: TASK_LABEL[s.task],
      replay,
      bill: runBill(replay),
      calls: replay.totals.calls,
      rounds: replay.turns.filter((t) => t.calls.length > 0).length,
      widest: Math.max(0, ...replay.turns.map((t) => t.calls.length))
    };
    switch (s.id) {
      case 'chain': {
        const joined = plan('granular-read', ['join']);
        return {
          ...base,
          strain: {
            label: 'A chain',
            text: `${plural(base.calls, 'call')}, one to a turn: every call after the first uses what the last one found, so nothing can be batched. Each turn also sends the whole conversation again.`
          },
          fix: {
            label: 'Follow references inside the tool',
            text: `One query that starts at the VM and crosses to its NIC and its public IP: ${plural(joined.calls, 'call')}, not ${base.calls}.`,
            adds: 'join',
            href: strainLink('query', ['join'], true),
            cta: 'See joins'
          }
        };
      }
      case 'arithmetic': {
        const list = JSON.parse(replay.calls[0].content) as Listing;
        const running = list.resources.filter((r) => r.powerState === 'running').length;
        const plain = rung('filter');
        const calc = rung('calculator');
        return {
          ...base,
          strain: {
            label: 'Arithmetic by inference',
            text: `One call lists ${n(list.count)} VMs, ${n(running)} of them running. The model adds their costs itself, in its reply, and nothing checks the sum.`
          },
          fix: {
            label: 'Give it a calculator',
            text: `The sums come out exact, but the calculator cannot see the estate: the model copies each figure into a call. \u2248 ${fmtTokens(calc.bill.total)} tokens read and written, against \u2248 ${fmtTokens(plain.bill.total)}.`,
            adds: 'calculate(expression)',
            href: strainLink('calculator'),
            cta: 'See the calculator'
          }
        };
      }
      case 'fan-out': {
        const lookups = replay.calls.filter((c) => c.name === 'get_resource').length;
        return {
          ...base,
          strain: {
            label: 'A call per VM',
            text: `${plural(base.calls, 'call')}: a list, then a lookup for each of the ${n(lookups)} running VMs. The broad list did the same job in ${plural(calls('arithmetic'), 'call')}, and the catalogue allows both, so the bill follows the model's route.`
          },
          fix: {
            label: 'Wider tools, then filters in the tool',
            text: `Fold the lookups into fewer, wider calls, then filter across VMs inside the tool. On the next screen the same question goes from ${plural(rung('per-property').replay.totals.calls, 'call')} to ${rung('filter').replay.totals.calls}.`,
            adds: 'filters',
            href: strainLink(null),
            cta: 'Climb the ladder'
          }
        };
      }
      case 'recital': {
        const writes = replay.calls.filter((c) => c.name !== 'list_resources');
        const spelled = writes.reduce((total, c) => total + c.callTokens, 0);
        const edited = plan('bulk-write', ['update']);
        return {
          ...base,
          strain: {
            label: 'One write per resource',
            text: `${plural(base.calls, 'call')}: a ${fmtTokens(replay.calls[0].resultSentTokens)}-token list, then ${n(writes.length)} single-resource writes. The model spells every change out itself (\u2248 ${fmtTokens(spelled)} tokens of calls), and the list is read again on every later turn.`
          },
          fix: {
            label: 'Update everything that matches',
            text: `An update with a filter says which resources match and what to set: the same job takes ${edited.calls} calls, not ${base.calls}.`,
            adds: 'update',
            href: strainLink('query', ['update'], true),
            cta: 'See updates'
          }
        };
      }
      case 'fits': {
        return {
          ...base,
          strain: {
            label: 'Nothing strains',
            text: `${plural(base.calls, 'call')}, ${fmtTokens(replay.calls[0].resultSentTokens)} tokens back. The tool does exactly what the question asks.`
          },
          fix: null
        };
      }
    }
  });
}
