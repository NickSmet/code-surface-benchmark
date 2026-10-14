/**
 * Screen ③'s stage: the calls that matter in a strain's run, and in its usual fix, drawn as cards.
 *
 * Nothing on a card is typed in. The tool, the arguments, the few result fields that matter and the
 * token counts are all read off the replay or the plan that the row is built from, and the tests check
 * that they are. The model's choices are still scripted (see strains.ts), so a stage shows what the
 * calls look like and how many there are. It says nothing about how often a model gets them right.
 */

import type { Inventory } from '$lib/inventory/types';
import { planTask, runQuery, type FeatureId, type Rung, type RungId } from './language';
import type { Replay, ReplayCall } from './replay';
import type { Strain, StrainId } from './strains';
import { estimateTokens, fmtTokens } from './tokens';

/** A call, the model adding up in its reply, the rest of the calls as a tile, or a call that is the same as on the other side. */
export type CardKind = 'call' | 'sum' | 'more' | 'same';

export interface StageCard {
  /** Unique within a pane. */
  key: string;
  kind: CardKind;
  /** The tool, or what the card stands for. */
  title: string;
  /** What the model wrote. */
  args: string;
  /** What came back, cut down to the fields that matter. */
  result: string;
  /** Text that one card hands to the next: it is drawn the same on both. */
  marks: string[];
  /** Footer: the model turn the call was made in, and the size of that turn's request. `null` for a planned call. */
  turn: number | null;
  sent: number | null;
  /** Tokens the model wrote to make the call. */
  wrote: number | null;
}

export interface StagePane {
  label: string;
  text: string;
  calls: number;
  /** Each card waits for the one before it. */
  linked: boolean;
  cards: StageCard[];
  /** A line under the cards: what the marks mean, or a count worth noticing. */
  legend: string | null;
  /** Calls on each rung of the ladder, for the question this row is about. */
  ladder: Array<{ id: RungId; label: string; calls: number }> | null;
}

export interface StrainStage {
  id: StrainId;
  problem: StagePane;
  fix: (StagePane & { adds: string; href: string; cta: string }) | null;
}

// ── formatting a call the way the model wrote it ────────────────────────────

const LONG_ID = /\/subscriptions\/[^"\s,}\]]*\/([^/"\s,}\]]+)/g;

/** An Azure resource id is 130 characters long; its last segment is the part a reader can follow. */
export const shortIds = (s: string): string => s.replace(LONG_ID, '\u2026/$1');

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}

/** `{ id: "…/web-prod-03-nic" }` */
export function showArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([k, v]) => `${k}: ${shortIds(JSON.stringify(v))}`);
  return parts.length ? `{ ${parts.join(', ')} }` : '{ }';
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Every key and value of a parsed result, outermost first. Arrays are not entered. */
function fieldsOf(value: unknown, out: Array<[string, unknown]> = [], depth = 0): Array<[string, unknown]> {
  if (value && typeof value === 'object' && !Array.isArray(value) && depth < 3) {
    for (const [k, v] of Object.entries(value)) {
      out.push([k, v]);
      fieldsOf(v, out, depth + 1);
    }
  }
  return out;
}

/** `key: value` on its own line, for each of the keys the result has. */
export function pickFields(content: string, keys: string[]): string {
  const fields = fieldsOf(tryParse(content));
  return keys
    .flatMap((key) => {
      const hit = fields.find(([k]) => k === key);
      return hit ? [`${key}: ${shortIds(JSON.stringify(hit[1]))}`] : [];
    })
    .join('\n');
}

const SKIP_KEYS = new Set(['id', 'name', 'type']);

/** The keys of a result whose value something later uses: an id the next call asks for, a word in the answer. */
function usedKeys(content: string, needles: string[]): string[] {
  const hits = fieldsOf(tryParse(content)).filter(
    ([k, v]) => !SKIP_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number') && needles.includes(String(v))
  );
  return [...new Set(hits.map(([k]) => k))];
}

const idsIn = (args: Record<string, unknown>): string[] =>
  Object.values(args).filter((v): v is string => typeof v === 'string' && v.startsWith('/subscriptions/'));

const wordsOf = (text: string): string[] => text.split(/[\s;,]+/).map((w) => w.replace(/[.:]+$/, '')).filter((w) => w.length > 3);

// ── a query, in plain lines ─────────────────────────────────────────────────

type Q = Record<string, any>;

const lit = (v: unknown): string => (typeof v === 'string' ? JSON.stringify(v) : String(v));

/**
 * The language's query object as a few lines. It leaves out nothing the queries on this screen use,
 * and the tests check that it covers every key of the queries shown.
 */
export function describeQuery(q: Q): string {
  const lines: string[] = [];
  if (q.from) lines.push(`from ${q.from}`);
  if (q.compute) lines.push(`compute ${Object.entries(q.compute as Q).map(([as, c]) => `${as} = ${(c as Q).fn}(${(c as Q).field})`).join(', ')}`);
  if (q.where) lines.push(`where ${(q.where as Q[]).map((w) => `${w.field} ${w.op} ${lit(w.value)}`).join(' and ')}`);
  if (q.join) lines.push(`join ${(q.join as Q[]).map((j) => `${j.via} as ${j.as}`).join(', ')}`);
  if (q.groupBy) lines.push(`groupBy ${(q.groupBy as string[]).join(', ')}`);
  if (q.aggregate) lines.push(`aggregate ${(q.aggregate as Q[]).map((a) => `${a.fn}(${a.field}) as ${a.as}`).join(', ')}`);
  if (q.select) lines.push(`select ${(q.select as string[]).join(', ')}`);
  if (q.update) lines.push(`update set ${Object.entries((q.update as Q).set as Q).map(([k, v]) => `${k} = ${lit(v)}`).join(', ')}`);
  return lines.join('\n');
}

/** The keys `describeQuery` knows how to show. */
export const QUERY_KEYS = ['from', 'compute', 'where', 'join', 'groupBy', 'aggregate', 'select', 'update'] as const;

// ── the cards ───────────────────────────────────────────────────────────────

const card = (c: Partial<StageCard> & Pick<StageCard, 'key' | 'title'>): StageCard => ({
  kind: 'call',
  args: '',
  result: '',
  marks: [],
  turn: null,
  sent: null,
  wrote: null,
  ...c
});

/** A call from a replay, with the turn it was made in. */
function fromCall(c: ReplayCall, result: string, extra: Partial<StageCard> = {}): StageCard {
  return card({ key: c.id, title: c.name, args: showArgs(c.args), result, turn: c.turn, wrote: c.callTokens, ...extra });
}

/** Tokens the model writes to make a call: the same count the replay bills a call at. */
const wroteFor = (tool: string, args: unknown): number => estimateTokens(tool + JSON.stringify(args));

function more(key: string, n: number, what: string): StageCard {
  return card({ key, kind: 'more', title: `+ ${n.toLocaleString('en-US')} more`, args: what });
}

/** A call that is on both sides of the fix, so the fix does not draw it again. */
function same(c: ReplayCall): StageCard {
  return card({ key: 'list', kind: 'same', title: c.name, args: 'the same call and result as on the left' });
}

/** What a `list_resources` card shows of a listing: how many, and the first record. */
function listing(content: string, fields: string[]): string {
  const data = tryParse(content) as { count?: number; resources?: Array<Record<string, unknown>> } | null;
  const first = data?.resources?.[0];
  if (!data || typeof data.count !== 'number' || !first) return '';
  const record = Object.fromEntries(fields.filter((f) => f in first).map((f) => [f, first[f]]));
  return `count: ${data.count}\nresources: [ ${JSON.stringify(record)}, \u2026 ]`;
}

const operands = (expression: string): number => expression.split('+').length;

/**
 * One stage for each strain. `rungs` are the ladder's tool rungs, and `inv` the estate they ran on: the same
 * inputs `buildStrains` took, so the stage and the row beside it quote the same runs.
 */
export function buildStages(strains: Strain[], inv: Inventory, rungs: Rung[]): StrainStage[] {
  const rung = (id: RungId): Rung => {
    const r = rungs.find((x) => x.id === id);
    if (!r) throw new Error(`No rung ${id}`);
    return r;
  };
  const plan = (task: Strain['task'], features: FeatureId[]) => planTask(task, new Set(features), structuredClone(inv));
  const features = (f: FeatureId[]): ReadonlySet<FeatureId> => new Set(f);
  const byId = (id: StrainId): Strain => {
    const s = strains.find((x) => x.id === id);
    if (!s) throw new Error(`No strain ${id}`);
    return s;
  };

  return strains.map((s): StrainStage => {
    const calls = s.replay.calls;
    const pane = (label: string, text: string, n: number, cards: StageCard[], extra: Partial<StagePane> = {}): StagePane => ({
      label,
      text,
      calls: n,
      linked: false,
      cards,
      legend: null,
      ladder: null,
      ...extra
    });
    const withFix = (p: StagePane): StrainStage['fix'] => (s.fix ? { ...p, adds: s.fix.adds, href: s.fix.href, cta: s.fix.cta } : null);

    switch (s.id) {
      case 'chain': {
        // Each call's result is read for what the next call (or the answer) uses: the ids the model copies on.
        const cards = calls.map((c, i) => {
          const next = calls[i + 1];
          const needles = [...(next ? idsIn(next.args) : []), ...wordsOf(s.replay.finalText)];
          const keys = usedKeys(c.content, needles);
          // Each turn sends the whole conversation again, so what a turn sends is worth a footer on this strain only.
          return fromCall(c, pickFields(c.content, keys.length ? keys : ['powerState']), { sent: s.replay.turns[c.turn - 1]?.promptTokens ?? null });
        });
        for (let i = 1; i < calls.length; i++) {
          const copied = idsIn(calls[i].args).filter((id) => calls[i - 1].content.includes(id));
          for (const id of copied) {
            cards[i].marks.push(shortIds(id));
            cards[i - 1].marks.push(shortIds(id));
          }
        }
        const joined = plan('granular-read', ['join']);
        const q = joined.queries[0] as Q;
        const out = runQuery(structuredClone(inv), q, features(['join']));
        const row = out.ok && out.kind === 'rows' ? out.rows[0] ?? {} : {};
        const fixCard = card({
          key: 'join',
          title: 'query_resources',
          args: describeQuery(q),
          result: Object.entries(row).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n'),
          wrote: wroteFor('query_resources', q)
        });
        return {
          id: s.id,
          problem: pane(s.strain.label, s.strain.text, s.calls, cards, {
            linked: true,
            legend: 'Highlighted: text the model copies out of one result and into the next call.'
          }),
          fix: withFix(pane(s.fix!.label, s.fix!.text, joined.calls, [fixCard]))
        };
      }

      case 'arithmetic': {
        const calc = rung('calculator').replay.calls.filter((c) => c.name === 'calculate');
        const firstSum = String(calc[0].args.expression);
        // The first figure the model adds: it is on the list card and again on the card that adds it.
        const first = firstSum.split(' + ')[0];
        const asked = (replay: Replay): StageCard => {
          const c = replay.calls[0];
          return fromCall(c, listing(c.content, ['name', 'costMonthly', 'powerState']), { key: 'list', marks: [first] });
        };
        const reply = s.replay.finalText;
        const group = /([\w-]+): \$([\d,]+\.\d\d)/.exec(reply);
        const grand = /Grand total \$([\d,]+\.\d\d)/.exec(reply);
        const sum = card({
          key: 'sum',
          kind: 'sum',
          title: 'The model adds',
          args: truncate(firstSum, 52),
          result: group && grand ? `${group[1]}: $${group[2]}\n\u2026\nGrand total $${grand[1]}` : '',
          marks: [first]
        });
        const shown = calc.slice(0, 2).map((c) =>
          fromCall(c, c.content, {
            args: `{ expression: ${JSON.stringify(truncate(String(c.args.expression), 40))} }`,
            marks: c === calc[0] ? [first] : []
          })
        );
        const figures = calc.reduce((n, c) => n + operands(String(c.args.expression)), 0);
        const cards = [same(rung('calculator').replay.calls[0]), ...shown];
        if (calc.length > shown.length) cards.push(more('calc-more', calc.length - shown.length, 'calculate: one for each group, one for the total'));
        return {
          id: s.id,
          problem: pane(s.strain.label, s.strain.text, s.calls, [asked(s.replay), sum], {
            legend: 'Highlighted: a figure the model reads off the list and adds up in its reply.'
          }),
          fix: withFix(
            pane(s.fix!.label, s.fix!.text, rung('calculator').replay.totals.calls, cards, {
              legend: `${figures} figures copied by the model, out of the list and into ${calc.length} calls.`
            })
          )
        };
      }

      case 'fan-out': {
        const [list, ...lookups] = calls;
        const listCard = (c: ReplayCall): StageCard => fromCall(c, listing(c.content, ['name', 'costMonthly', 'powerState']), { key: 'list' });
        const shown = lookups.slice(0, 2).map((c) => fromCall(c, pickFields(c.content, ['powerState', 'costMonthly'])));
        const cards = [listCard(list), ...shown];
        if (lookups.length > shown.length) cards.push(more('lookups-more', lookups.length - shown.length, `${lookups[0].name}, one for each running VM`));
        const broad = byId('arithmetic');
        const order: RungId[] = ['per-property', 'one-tool', 'aspect', 'aspects', 'filter'];
        return {
          id: s.id,
          problem: pane(s.strain.label, s.strain.text, s.calls, cards),
          fix: withFix(
            pane(s.fix!.label, s.fix!.text, broad.calls, [listCard(broad.replay.calls[0])], {
              ladder: order.map((id) => ({ id, label: rung(id).title, calls: rung(id).replay.totals.calls }))
            })
          )
        };
      }

      case 'recital': {
        const [list, ...writes] = calls;
        const names = [...new Set(writes.map((c) => c.name))];
        const shown = names.map((n) => writes.find((c) => c.name === n)!);
        const cards = [
          fromCall(list, `count: ${(tryParse(list.content) as { count: number }).count}\n\u2248 ${fmtTokens(list.resultSentTokens)} tokens of resources`),
          ...shown.map((c) => fromCall(c, pickFields(c.content, ['status']))),
          more('writes-more', writes.length - shown.length, 'one write for each resource')
        ];
        const edited = plan('bulk-write', ['update']);
        const fixCards = (edited.queries as Q[]).map((q, i) => {
          const out = runQuery(structuredClone(inv), q, features(['update']));
          return card({
            key: `update-${i}`,
            title: 'query_resources',
            args: describeQuery(q),
            result: out.ok && out.kind === 'update' ? `matched: ${out.matched}\nchanged: ${out.changed}` : '',
            wrote: wroteFor('query_resources', q)
          });
        });
        return {
          id: s.id,
          problem: pane(s.strain.label, s.strain.text, s.calls, cards),
          fix: withFix(pane(s.fix!.label, s.fix!.text, edited.calls, fixCards))
        };
      }

      case 'fits': {
        const [c] = calls;
        const names = (tryParse(c.content) as Array<{ name: string }>).map((g) => g.name).join(', ');
        return {
          id: s.id,
          problem: pane(s.strain.label, s.strain.text, s.calls, [fromCall(c, `names: ${names}`)]),
          fix: null
        };
      }
    }
  });
}

// ── the beats ───────────────────────────────────────────────────────────────

export interface Beat {
  /** Index into the strains, or `null` for the overview. */
  row: number | null;
  phase: 'overview' | 'problem' | 'fix';
  /** What the presenter is on, in a few words. */
  caption: string;
}

/** The overview, then the problem and the fix of each row in turn. The narrow row has a fix beat too: the verdict. */
export function buildBeats(strains: Strain[]): Beat[] {
  return [
    { row: null, phase: 'overview', caption: 'Five questions, one catalogue' },
    ...strains.flatMap((s, i): Beat[] => [
      { row: i, phase: 'problem', caption: `${s.title}: ${s.fix ? 'the problem' : 'nothing strains'}` },
      { row: i, phase: 'fix', caption: `${s.title}: ${s.fix ? 'the usual fix' : 'keep it'}` }
    ])
  ];
}

/** Which rows a beat has put right: every row before the focused one, and the focused one once its fix is shown. */
export function solvedRows(beats: Beat[], at: number): Set<number> {
  const beat = beats[Math.min(Math.max(at, 0), beats.length - 1)];
  const solved = new Set<number>();
  if (beat.row === null) return solved;
  for (let i = 0; i < beat.row; i++) solved.add(i);
  if (beat.phase === 'fix') solved.add(beat.row);
  return solved;
}
