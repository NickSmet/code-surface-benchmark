/**
 * The last screen: how the methods hold up as the model gets weaker.
 *
 * The cells below are a snapshot of a headless benchmark run on 14 October 2026 (scripts/ptc-bench; results in
 * docs/runs/ptc-three-models-20261014/cost-results.json, group "all"): eight methods, eight tasks and ten repetitions
 * each, on the same mock estate the tour uses, against three deployments. A cell is one method on one model, 80 runs.
 * `correct` is how many of the 80 were right, and `totalUsd` is what all 80 cost, failures included, estimated from
 * the tokens the provider reported and the price sheet. It is not an invoice.
 *
 * The run belongs to the benchmark job, not to the tour. This file holds the copy of its numbers that the tour needs,
 * so nothing here reads the run's files.
 *
 * Every sentence and number the screen shows is built here from the cells (and from the few figures marked REPORTED),
 * so the tests can hold each claim to its source. To refresh: re-export the cells from a newer cost-results.json and
 * run the tests; a claim that no longer holds fails there, and its sentence has to be rewritten.
 */

export type ModelKey = 'newest' | 'newer' | 'older';
/** The benchmark's own names for its eight methods. */
export type ArmId = 'naive-direct' | 'calc-direct' | 'naive-ptc' | 'tuned-direct' | 'tuned-ptc' | 'code' | 'naive-ptc-native' | 'tuned-ptc-native';
/** The six that ran on all three models. Hosted programmatic calling ran on the two newer ones only. */
export type MethodId = Exclude<ArmId, 'naive-ptc-native' | 'tuned-ptc-native'>;
export interface Cell {
  runs: number;
  correct: number;
  totalUsd: number;
}

export const SOURCE = {
  run: '14 October 2026',
  file: 'docs/runs/ptc-three-models-20261014/cost-results.json',
  generatedAt: '2026-10-14T18:57:51.547Z',
  tasks: 8,
  repetitions: 10
} as const;

export const RESULTS: Record<ModelKey, Partial<Record<ArmId, Cell>>> = {
  newest: {
    'naive-direct': { runs: 80, correct: 77, totalUsd: 0.1079024 },
    'calc-direct': { runs: 80, correct: 77, totalUsd: 0.1137215 },
    'naive-ptc': { runs: 80, correct: 76, totalUsd: 0.0294035 },
    'tuned-direct': { runs: 80, correct: 80, totalUsd: 0.0680748 },
    'tuned-ptc': { runs: 80, correct: 80, totalUsd: 0.0316361 },
    code: { runs: 80, correct: 80, totalUsd: 0.0228572 },
    'naive-ptc-native': { runs: 80, correct: 79, totalUsd: 0.0362324 },
    'tuned-ptc-native': { runs: 80, correct: 80, totalUsd: 0.0430862 }
  },
  newer: {
    'naive-direct': { runs: 80, correct: 76, totalUsd: 0.2446246 },
    'calc-direct': { runs: 80, correct: 77, totalUsd: 0.2628605 },
    'naive-ptc': { runs: 80, correct: 79, totalUsd: 0.0661884 },
    'tuned-direct': { runs: 80, correct: 78, totalUsd: 0.1563639 },
    'tuned-ptc': { runs: 80, correct: 80, totalUsd: 0.0759213 },
    code: { runs: 80, correct: 80, totalUsd: 0.0595128 },
    'naive-ptc-native': { runs: 80, correct: 79, totalUsd: 0.0788517 },
    'tuned-ptc-native': { runs: 80, correct: 80, totalUsd: 0.0883369 }
  },
  older: {
    'naive-direct': { runs: 80, correct: 39, totalUsd: 0.7286035 },
    'calc-direct': { runs: 80, correct: 49, totalUsd: 0.6757377 },
    'naive-ptc': { runs: 80, correct: 56, totalUsd: 0.2291713 },
    'tuned-direct': { runs: 80, correct: 54, totalUsd: 0.3489856 },
    'tuned-ptc': { runs: 80, correct: 49, totalUsd: 0.2759211 },
    code: { runs: 80, correct: 80, totalUsd: 0.2124958 }
  }
};

/** Figures the screen quotes that the cells cannot give. They come from the benchmark's write-up (docs/ptc-matrix-results.md). */
export const REPORTED = {
  /** On the newest model, the smallest p-value of any method against the code surface (section 1.4): accuracy does not separate them there. */
  newestSmallestP: 0.12,
  /** On the single narrow lookup a direct call costs this many times the code surface's tokens (section 1.3): the one place the code surface loses. */
  lookupDirectCallTokens: '0.6\u00d7',
  /** The size of the estate every run drives. */
  estateResources: 194
} as const;

// ── what the screen is about ───────────────────────────────────────────────

export interface ModelInfo {
  key: ModelKey;
  deployment: string;
  role: string;
}
/** Left to right on the screen: the strongest first, so the screen turns the model down as it goes. */
export const MODELS: readonly ModelInfo[] = [
  { key: 'newest', deployment: 'gpt-6-luna', role: 'newest' },
  { key: 'newer', deployment: 'gpt-5.6-luna', role: 'newer' },
  { key: 'older', deployment: 'gpt-5.4-mini', role: 'older' }
];
export const modelOf = (key: ModelKey): ModelInfo => MODELS.find((m) => m.key === key)!;

export type GroupId = 'catalogue' | 'tuned' | 'code';
export const GROUPS: Record<GroupId, { title: string; note: string }> = {
  catalogue: { title: 'Catalogue', note: 'six narrow tools \u00b7 screens 2\u20133' },
  tuned: { title: 'Tuned catalogue', note: 'one query tool \u00b7 screen 4' },
  code: { title: 'Code surface', note: 'one tool \u00b7 screens 5\u20136' }
};

export interface MethodInfo {
  id: MethodId;
  group: GroupId;
  label: string;
  /** What the method is, for the tooltip. */
  hint: string;
}
export const METHODS: readonly MethodInfo[] = [
  { id: 'naive-direct', group: 'catalogue', label: 'Called one by one', hint: 'The six narrow tools, called the way a model calls any tools: one at a time.' },
  { id: 'calc-direct', group: 'catalogue', label: 'Plus a calculator', hint: 'The same six tools and a calculator, called one at a time.' },
  { id: 'naive-ptc', group: 'catalogue', label: 'Called from a program', hint: 'The same six tools as functions inside one program the model writes (programmatic tool calling).' },
  { id: 'tuned-direct', group: 'tuned', label: 'Called one by one', hint: 'A tuned set: one shared filter language, exact aggregation, references that can be followed. Called one at a time.' },
  { id: 'tuned-ptc', group: 'tuned', label: 'Called from a program', hint: 'The tuned set as functions inside a program the model writes.' },
  { id: 'code', group: 'code', label: 'A program per question', hint: 'One tool. The model writes a program over the estate as a plain object.' }
];
export const CODE: MethodId = 'code';
export const OTHERS: readonly MethodId[] = METHODS.filter((m) => m.id !== CODE).map((m) => m.id);

// ── numbers ────────────────────────────────────────────────────────────────

export const cellOf = (model: ModelKey, arm: ArmId): Cell => {
  const c = RESULTS[model][arm];
  if (!c) throw new Error(`no results for ${arm} on ${model}`);
  return c;
};

/** Dollars per 1,000 right answers: everything the cell's runs cost, failures included, over the runs that were right. */
export const perThousandRight = (c: Cell): number => (c.correct === 0 ? Infinity : (c.totalUsd / c.correct) * 1000);

/** Three significant figures, as the benchmark's report prints them. */
export function fmtUsd(x: number): string {
  if (!Number.isFinite(x)) return '\u2013';
  return `$${x.toFixed(x >= 10 ? 1 : x >= 1 ? 2 : 3)}`;
}
export function fmtTimes(x: number): string {
  return `${x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)}\u00d7`;
}

export interface Span {
  min: number;
  max: number;
}
/** How many of the 80 the methods other than the code surface got right, on these models. */
export function othersSpan(models: readonly ModelKey[]): Span {
  const all = models.flatMap((m) => OTHERS.map((id) => cellOf(m, id).correct));
  return { min: Math.min(...all), max: Math.max(...all) };
}
export function codeSpan(models: readonly ModelKey[]): Span {
  const all = models.map((m) => cellOf(m, CODE).correct);
  return { min: Math.min(...all), max: Math.max(...all) };
}
/** The cheapest right answer on a model, and the cheapest among the other methods. */
export function cheapest(model: ModelKey): { id: MethodId; usd: number } {
  const all = METHODS.map((m) => ({ id: m.id, usd: perThousandRight(cellOf(model, m.id)) }));
  return all.reduce((a, b) => (b.usd < a.usd ? b : a));
}
export function nextCheapest(model: ModelKey): { id: MethodId; usd: number; correct: number } {
  const all = OTHERS.map((id) => ({ id, usd: perThousandRight(cellOf(model, id)), correct: cellOf(model, id).correct }));
  return all.reduce((a, b) => (b.usd < a.usd ? b : a));
}

const range = (s: Span, unit = ''): string => (s.min === s.max ? `${s.min}${unit}` : `${s.min}\u2013${s.max}${unit}`);
const words = (s: Span): string => (s.min === s.max ? `${s.min}` : `${s.min} to ${s.max}`);

/** Two effects, one on top of the other: a cheaper, better model, and the code surface instead of one-by-one calls. */
export function multiples(): { both: number; model: number; method: number } {
  const worst = perThousandRight(cellOf('older', 'naive-direct'));
  const sameMethodNewest = perThousandRight(cellOf('newest', 'naive-direct'));
  const best = perThousandRight(cellOf('newest', CODE));
  return { both: worst / best, model: worst / sameMethodNewest, method: sameMethodNewest / best };
}

// ── the beats ──────────────────────────────────────────────────────────────

export type ResultsBeatId = 'newer' | 'older' | 'dollars' | 'why';
export interface ResultsBeat {
  id: ResultsBeatId;
  href: string;
  caption: string;
}
export const resultsHref = (id: ResultsBeatId): string => (id === 'newer' ? '/tour/results' : `/tour/results?show=${id}`);
export const RESULTS_BEATS: readonly ResultsBeat[] = (
  [
    ['newer', 'The newer models'],
    ['older', 'An older model'],
    ['dollars', 'What a right answer costs'],
    ['why', 'Why, and what this does not show']
  ] as const
).map(([id, caption]) => ({ id, href: resultsHref(id), caption }));

export function parseResultsBeat(search: URLSearchParams): ResultsBeatId {
  return RESULTS_BEATS.find((b) => b.id === search.get('show'))?.id ?? RESULTS_BEATS[0].id;
}

/** What the Next button says at a beat. */
export const NEXT_LABEL: Record<ResultsBeatId, string> = {
  newer: 'Next: an older model',
  older: 'Next: what a right answer costs',
  dollars: 'Next: why it holds',
  why: 'Next'
};

// ── one beat, as the screen draws it ───────────────────────────────────────

export interface RowView {
  id: MethodId;
  label: string;
  hint: string;
  correct: number;
  runs: number;
  /** Share of runs that were right: the filled part of the bar. */
  fill: number;
  usd: string;
  usdValue: number;
  isCode: boolean;
  /** The cheapest right answer on this model. */
  cheapest: boolean;
  aria: string;
}
export interface GroupView {
  id: GroupId;
  title: string;
  note: string;
  rows: RowView[];
}
export interface PanelView {
  model: ModelKey;
  deployment: string;
  role: string;
  /** False before the beat that introduces the model: its place is held and its rows are not drawn. */
  revealed: boolean;
  /** What the held place says. */
  veil: string;
  /** The beat is about this model. The others are drawn back. */
  focus: boolean;
  groups: GroupView[];
}
export interface Tile {
  label: string;
  value: string;
  sub: string;
  tone: 'code' | 'catalogue' | 'ink';
  /** Drawn in the gap before the tile, so a row of tiles can read as a sum. */
  op?: '\u00d7' | '=';
}
export interface Point {
  text: string;
  /** True for a figure the benchmark measured; false for a reading of it. */
  measured: boolean;
}
export interface Column {
  title: string;
  note?: string;
  /** Say, point by point, whether it is a figure or a reading. */
  tagged: boolean;
  points: Point[];
}
export interface ResultsView {
  beat: ResultsBeatId;
  lead: string;
  /** What the beat is about: the right answers, or what they cost. */
  emphasis: 'accuracy' | 'dollars';
  panels: PanelView[];
  tiles: Tile[] | null;
  columns: Column[] | null;
  /** What the figures are, in a line under the panels. */
  footnote: string;
}

const REVEALED: Record<ResultsBeatId, ModelKey[]> = {
  newer: ['newest', 'newer'],
  older: ['newest', 'newer', 'older'],
  dollars: ['newest', 'newer', 'older'],
  why: ['newest', 'newer', 'older']
};
const FOCUS: Record<ResultsBeatId, ModelKey[]> = {
  newer: ['newest', 'newer'],
  older: ['older'],
  dollars: ['newest', 'newer', 'older'],
  why: []
};

function panelOf(model: ModelInfo, beat: ResultsBeatId): PanelView {
  const best = cheapest(model.key).id;
  const groups = (Object.keys(GROUPS) as GroupId[]).map((g) => ({
    id: g,
    ...GROUPS[g],
    rows: METHODS.filter((m) => m.group === g).map((m): RowView => {
      const c = cellOf(model.key, m.id);
      const usdValue = perThousandRight(c);
      return {
        id: m.id,
        label: m.label,
        hint: m.hint,
        correct: c.correct,
        runs: c.runs,
        fill: c.correct / c.runs,
        usd: fmtUsd(usdValue),
        usdValue,
        isCode: m.id === CODE,
        cheapest: m.id === best,
        aria: `${GROUPS[g].title}, ${m.label}: ${c.correct} of ${c.runs} right, ${fmtUsd(usdValue)} per 1,000 right answers`
      };
    })
  }));
  return {
    model: model.key,
    deployment: model.deployment,
    role: model.role,
    revealed: REVEALED[beat].includes(model.key),
    veil: `Next: the ${model.role} model`,
    focus: FOCUS[beat].includes(model.key),
    groups
  };
}

function leadOf(beat: ResultsBeatId): string {
  const n = cellOf('newest', CODE).runs;
  switch (beat) {
    case 'newer': {
      const models: ModelKey[] = ['newest', 'newer'];
      return `On the two newer models almost every method works: the other five get ${words(othersSpan(models))} of ${n} right, and the code surface gets ${words(codeSpan(models))}. Accuracy hardly separates them, so cost does.`;
    }
    case 'older': {
      const o = othersSpan(['older']);
      return `Now an older model, ${modelOf('older').deployment}. The code surface is still at ${words(codeSpan(['older']))} of ${n}. The other five methods fall to between ${o.min} and ${o.max}.`;
    }
    case 'dollars':
      return 'What a right answer costs, failures included: the code surface is the cheapest on all three models. A better model and a better method are separate effects, and they multiply.';
    case 'why':
      return 'A reading, not a measurement: models write code fluently, and the object tells them what the data looks like. Programs over the catalogue, with no such description, fell with the model.';
  }
}

function tilesOf(beat: ResultsBeatId): Tile[] | null {
  const n = cellOf('newest', CODE).runs;
  if (beat === 'newer' || beat === 'older') {
    const models: ModelKey[] = beat === 'newer' ? ['newest', 'newer'] : ['older'];
    const on = beat === 'newer' ? 'on both models' : `on ${modelOf('older').deployment}`;
    const price = models.map((m) => fmtUsd(perThousandRight(cellOf(m, CODE))));
    const next = models.map((m) => nextCheapest(m));
    return [
      { label: 'Code surface', value: `${range(codeSpan(models))} of ${n}`, sub: `right, ${on}`, tone: 'code' },
      { label: 'The other five', value: `${range(othersSpan(models))} of ${n}`, sub: `right, ${on}`, tone: 'catalogue' },
      {
        label: 'Cheapest right answer',
        value: 'Code surface',
        sub: `${price.join(' and ')} per 1,000 right answers. Next cheapest: ${next.map((x) => fmtUsd(x.usd)).join(' and ')}${beat === 'older' ? `, at ${next[0].correct} of ${n}` : ''}.`,
        tone: 'ink'
      }
    ];
  }
  if (beat === 'dollars') {
    const m = multiples();
    const worst = fmtUsd(perThousandRight(cellOf('older', 'naive-direct')));
    const best = fmtUsd(perThousandRight(cellOf('newest', CODE)));
    const [o, nw] = [modelOf('older').deployment, modelOf('newest').deployment];
    return [
      {
        label: 'The model alone',
        value: fmtTimes(m.model),
        sub: `${o} to ${nw}, the catalogue called one by one: ${cellOf('newest', 'naive-direct').correct} right instead of ${cellOf('older', 'naive-direct').correct}, at lower prices.`,
        tone: 'catalogue'
      },
      {
        label: 'The method alone',
        value: fmtTimes(m.method),
        sub: `On ${nw}, the code surface instead of one-by-one calls: ${cellOf('newest', CODE).correct} right instead of ${cellOf('newest', 'naive-direct').correct}.`,
        tone: 'catalogue',
        op: '\u00d7'
      },
      { label: 'Both together', value: fmtTimes(m.both), sub: `cheaper per right answer: ${nw} with the code surface, ${best}, against ${o} with one-by-one catalogue calls, ${worst}.`, tone: 'code', op: '=' }
    ];
  }
  return null;
}

function columnsOf(beat: ResultsBeatId): Column[] | null {
  if (beat !== 'why') return null;
  const older = modelOf('older').deployment;
  return [
    {
      title: 'Why the code surface holds',
      note: 'a reading of the benchmark, with the figure it rests on',
      tagged: true,
      points: [
        { text: 'A program is what models write best. Training on code has been heavy for years, so even an older model writes a short one well.', measured: false },
        {
          text: 'The object is documented by design: the shape of the data, and which record points at which (screen 5). A program over the catalogue cannot look at a result before it runs, so a wrong guess about its shape becomes a confident wrong answer.',
          measured: false
        },
        {
          text: `Code alone did not hold. On ${older}, programs over the catalogue got ${cellOf('older', 'naive-ptc').correct} of ${cellOf('older', 'naive-ptc').runs} right, and over the tuned catalogue ${cellOf('older', 'tuned-ptc').correct}.`,
          measured: true
        }
      ]
    },
    {
      title: 'What this does not show',
      tagged: false,
      points: [
        { text: `On ${modelOf('newest').deployment} accuracy ties: the smallest p-value against the code surface is ${REPORTED.newestSmallestP}. There it saves money, not mistakes.`, measured: true },
        { text: `One mock estate of ${REPORTED.estateResources} resources, eight tasks, ten runs each. Larger estates and other vendors' versions of programmatic calling are untested.`, measured: true },
        { text: `A single narrow lookup is the one place a direct call wins: it costs about ${REPORTED.lookupDirectCallTokens} the tokens.`, measured: true },
        { text: 'Dollars are estimates from the tokens the provider reported, not an invoice.', measured: true }
      ]
    }
  ];
}

export function hostedSpan(): Span {
  const all = (['newest', 'newer'] as const).flatMap((m) => (['naive-ptc-native', 'tuned-ptc-native'] as const).map((a) => cellOf(m, a).correct));
  return { min: Math.min(...all), max: Math.max(...all) };
}

function footnoteOf(): string {
  const n = cellOf('newest', CODE).runs;
  const h = hostedSpan();
  return `${n} runs a bar: ${SOURCE.tasks} tasks, ${SOURCE.repetitions} runs each. Pink is the wrong answers. Dollars are estimates from reported tokens, per 1,000 right answers, failures included. Hosted programmatic calling, run on the two newer models only, got ${words(h)} of ${n} and is left out.`;
}

export function buildResults(beat: ResultsBeatId): ResultsView {
  return {
    beat,
    lead: leadOf(beat),
    emphasis: beat === 'dollars' ? 'dollars' : 'accuracy',
    panels: MODELS.map((m) => panelOf(m, beat)),
    tiles: tilesOf(beat),
    columns: columnsOf(beat),
    footnote: footnoteOf()
  };
}
