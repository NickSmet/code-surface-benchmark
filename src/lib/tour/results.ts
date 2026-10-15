/**
 * The results screen: how the methods hold up as the model changes, and what that costs.
 *
 * The cells below are a snapshot of a headless benchmark run on 14 October 2026 (scripts/ptc-bench; results in
 * docs/runs/ptc-three-models-20261014/cost-results.json, groups "core" and "heldout"): eight methods and ten repetitions
 * each, on the same mock estate the tour uses, against three deployments. The eight tasks come in two sets of four.
 * The preset tasks are the four this tour has used throughout, and the tuned catalogue was designed after seeing them, so on
 * them it is as good as it gets. The unplanned tasks (the benchmark calls them held-out) are four questions about the same
 * estate that were written after the tool sets were frozen. A cell is one method on one model on one set, 40 runs.
 * `correct` is how many of the 40 were right, and `totalUsd` is what all 40 cost, failures included, estimated from the
 * tokens the provider reported and the price sheet. It is not an invoice.
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
/** The four tasks the tuned catalogue was designed around, and four written after the tool sets were frozen. */
export type TaskSet = 'preset' | 'unplanned';
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
  repetitions: 10,
  /** Which of the export's groups each set is. */
  groups: { preset: 'core', unplanned: 'heldout' }
} as const;

/** One method on one model on one set. Hosted programmatic calling is absent on the oldest deployment, which rejects it. */
export const SETS: Record<TaskSet, Record<ModelKey, Partial<Record<ArmId, Cell>>>> = {
  preset: {
    newest: {
      'naive-direct': { runs: 40, correct: 37, totalUsd: 0.0312674 },
      'calc-direct': { runs: 40, correct: 37, totalUsd: 0.0327242 },
      'naive-ptc': { runs: 40, correct: 36, totalUsd: 0.0155402 },
      'tuned-direct': { runs: 40, correct: 40, totalUsd: 0.0134717 },
      'tuned-ptc': { runs: 40, correct: 40, totalUsd: 0.0152069 },
      code: { runs: 40, correct: 40, totalUsd: 0.0111259 },
      'naive-ptc-native': { runs: 40, correct: 40, totalUsd: 0.0212603 },
      'tuned-ptc-native': { runs: 40, correct: 40, totalUsd: 0.0221086 }
    },
    newer: {
      'naive-direct': { runs: 40, correct: 36, totalUsd: 0.0685654 },
      'calc-direct': { runs: 40, correct: 37, totalUsd: 0.0710145 },
      'naive-ptc': { runs: 40, correct: 39, totalUsd: 0.034075 },
      'tuned-direct': { runs: 40, correct: 39, totalUsd: 0.0291695 },
      'tuned-ptc': { runs: 40, correct: 40, totalUsd: 0.0355987 },
      code: { runs: 40, correct: 40, totalUsd: 0.0310666 },
      'naive-ptc-native': { runs: 40, correct: 39, totalUsd: 0.041234 },
      'tuned-ptc-native': { runs: 40, correct: 40, totalUsd: 0.0415312 }
    },
    older: {
      'naive-direct': { runs: 40, correct: 21, totalUsd: 0.2407062 },
      'calc-direct': { runs: 40, correct: 29, totalUsd: 0.2183762 },
      'naive-ptc': { runs: 40, correct: 30, totalUsd: 0.11102 },
      'tuned-direct': { runs: 40, correct: 30, totalUsd: 0.1018096 },
      'tuned-ptc': { runs: 40, correct: 22, totalUsd: 0.1202148 },
      code: { runs: 40, correct: 40, totalUsd: 0.1028103 }
    }
  },
  unplanned: {
    newest: {
      'naive-direct': { runs: 40, correct: 40, totalUsd: 0.076635 },
      'calc-direct': { runs: 40, correct: 40, totalUsd: 0.0809973 },
      'naive-ptc': { runs: 40, correct: 40, totalUsd: 0.0138633 },
      'tuned-direct': { runs: 40, correct: 40, totalUsd: 0.0546031 },
      'tuned-ptc': { runs: 40, correct: 40, totalUsd: 0.0164292 },
      code: { runs: 40, correct: 40, totalUsd: 0.0117314 },
      'naive-ptc-native': { runs: 40, correct: 39, totalUsd: 0.0149721 },
      'tuned-ptc-native': { runs: 40, correct: 40, totalUsd: 0.0209776 }
    },
    newer: {
      'naive-direct': { runs: 40, correct: 40, totalUsd: 0.1760592 },
      'calc-direct': { runs: 40, correct: 40, totalUsd: 0.191846 },
      'naive-ptc': { runs: 40, correct: 40, totalUsd: 0.0321134 },
      'tuned-direct': { runs: 40, correct: 39, totalUsd: 0.1271944 },
      'tuned-ptc': { runs: 40, correct: 40, totalUsd: 0.0403226 },
      code: { runs: 40, correct: 40, totalUsd: 0.0284462 },
      'naive-ptc-native': { runs: 40, correct: 40, totalUsd: 0.0376177 },
      'tuned-ptc-native': { runs: 40, correct: 40, totalUsd: 0.0468057 }
    },
    older: {
      'naive-direct': { runs: 40, correct: 18, totalUsd: 0.4878973 },
      'calc-direct': { runs: 40, correct: 20, totalUsd: 0.4573615 },
      'naive-ptc': { runs: 40, correct: 26, totalUsd: 0.1181514 },
      'tuned-direct': { runs: 40, correct: 24, totalUsd: 0.247176 },
      'tuned-ptc': { runs: 40, correct: 27, totalUsd: 0.1557063 },
      code: { runs: 40, correct: 40, totalUsd: 0.1096855 }
    }
  }
};

/** All eight tasks: the two sets added up, 80 runs a cell. */
function allTasks(): Record<ModelKey, Partial<Record<ArmId, Cell>>> {
  const out: Record<ModelKey, Partial<Record<ArmId, Cell>>> = { newest: {}, newer: {}, older: {} };
  for (const model of Object.keys(out) as ModelKey[]) {
    for (const arm of Object.keys(SETS.preset[model]) as ArmId[]) {
      const a = SETS.preset[model][arm]!;
      const b = SETS.unplanned[model][arm]!;
      out[model][arm] = { runs: a.runs + b.runs, correct: a.correct + b.correct, totalUsd: a.totalUsd + b.totalUsd };
    }
  }
  return out;
}
export const RESULTS: Record<ModelKey, Partial<Record<ArmId, Cell>>> = allTasks();

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
  /** Dollars per million tokens, standard tier: what the run's tokens were priced at. */
  price: { input: number; cached: number; output: number };
}
/** In the order the screen walks them: the older model first, and the field moves as the model improves. */
export const MODELS: readonly ModelInfo[] = [
  { key: 'older', deployment: 'gpt-5.4-mini', role: 'older', price: { input: 0.75, cached: 0.075, output: 4.5 } },
  { key: 'newer', deployment: 'gpt-5.6-luna', role: 'newer', price: { input: 0.2, cached: 0.02, output: 1.2 } },
  { key: 'newest', deployment: 'gpt-6-luna', role: 'newest', price: { input: 0.1, cached: 0.01, output: 0.5 } }
];
export const MODEL_ORDER: readonly ModelKey[] = MODELS.map((m) => m.key);
export const modelOf = (key: ModelKey): ModelInfo => MODELS.find((m) => m.key === key)!;

/** "$0.75 in, $0.075 cached, $4.50 out, per 1M tokens": at least two decimals, and as many more as the figure needs. */
export function fmtPrice(v: number): string {
  const s = String(+v.toFixed(3));
  const decimals = s.includes('.') ? s.split('.')[1].length : 0;
  return `$${v.toFixed(Math.max(2, decimals))}`;
}
export const priceLine = (key: ModelKey): string => {
  const p = modelOf(key).price;
  return `${fmtPrice(p.input)} in \u00b7 ${fmtPrice(p.cached)} cached \u00b7 ${fmtPrice(p.output)} out, per 1M tokens`;
};
/** How many times lower a model's prices are than the older model's: the least, and the most, over input and output. */
export function priceDrop(key: ModelKey): { min: number; max: number } {
  const o = modelOf('older').price;
  const p = modelOf(key).price;
  const ratios = [o.input / p.input, o.output / p.output];
  return { min: Math.min(...ratios), max: Math.max(...ratios) };
}

export const TASK_SETS: Record<TaskSet, { label: string; short: string; note: string }> = {
  preset: { label: 'Preset tasks', short: 'preset', note: 'the four this tour has used, and the four the tuned catalogue was designed around' },
  unplanned: { label: 'Unplanned tasks', short: 'unplanned', note: 'four questions written after the tool sets were frozen, one of them inside the tuned catalogue\u2019s design' }
};

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

/** What colour a method is drawn in: the tool set, as in the benchmark's charts (the calculator is its own colour there). */
export type Family = 'catalogue' | 'calc' | 'tuned' | 'code';
/** What shape: how the tools are called. */
export type Shape = 'circle' | 'diamond' | 'ring' | 'square';
export interface ArmInfo {
  id: ArmId;
  group: GroupId;
  family: Family;
  shape: Shape;
  /** Under its tool set's heading: how it is called. */
  label: string;
  /** Standing alone: the tool set and how it is called. */
  full: string;
  /** Hosted programmatic calling: the provider runs the program. */
  hosted: boolean;
}
/** The eight methods in the order the table lists them, and the plane's markers are drawn. */
export const ARMS: readonly ArmInfo[] = [
  { id: 'naive-direct', group: 'catalogue', family: 'catalogue', shape: 'circle', label: 'One by one', full: 'Catalogue, one by one', hosted: false },
  { id: 'calc-direct', group: 'catalogue', family: 'calc', shape: 'circle', label: 'Plus a calculator', full: 'Catalogue plus a calculator', hosted: false },
  { id: 'naive-ptc', group: 'catalogue', family: 'catalogue', shape: 'diamond', label: 'From a program', full: 'Catalogue, from a program', hosted: false },
  { id: 'naive-ptc-native', group: 'catalogue', family: 'catalogue', shape: 'ring', label: 'Hosted program', full: 'Catalogue, hosted program', hosted: true },
  { id: 'tuned-direct', group: 'tuned', family: 'tuned', shape: 'circle', label: 'One by one', full: 'Tuned catalogue, one by one', hosted: false },
  { id: 'tuned-ptc', group: 'tuned', family: 'tuned', shape: 'diamond', label: 'From a program', full: 'Tuned catalogue, from a program', hosted: false },
  { id: 'tuned-ptc-native', group: 'tuned', family: 'tuned', shape: 'ring', label: 'Hosted program', full: 'Tuned catalogue, hosted program', hosted: true },
  { id: 'code', group: 'code', family: 'code', shape: 'square', label: 'A program per question', full: 'Code surface', hosted: false }
];
export const armOf = (id: ArmId): ArmInfo => ARMS.find((a) => a.id === id)!;

// ── numbers ────────────────────────────────────────────────────────────────

export const cellOf = (model: ModelKey, arm: ArmId): Cell => {
  const c = RESULTS[model][arm];
  if (!c) throw new Error(`no results for ${arm} on ${model}`);
  return c;
};
/** A cell of one set. Undefined when the method did not run on the model. */
export const cellIn = (set: TaskSet, model: ModelKey, arm: ArmId): Cell | undefined => SETS[set][model][arm];
export function setCell(set: TaskSet, model: ModelKey, arm: ArmId): Cell {
  const c = cellIn(set, model, arm);
  if (!c) throw new Error(`no results for ${arm} on ${model} (${set})`);
  return c;
}

/** Dollars per 1,000 right answers: everything the cell's runs cost, failures included, over the runs that were right. */
export const perThousandRight = (c: Cell): number => (c.correct === 0 ? Infinity : (c.totalUsd / c.correct) * 1000);
/** Dollars per 1,000 runs, right or wrong: the plane's horizontal axis. */
export const perThousandRuns = (c: Cell): number => (c.totalUsd / c.runs) * 1000;

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

/** The arms that ran on a model, in the table's order. */
export const armsOn = (model: ModelKey): ArmInfo[] => ARMS.filter((a) => SETS.preset[model][a.id]);

/** The cheapest method on a set and model, per 1,000 runs, among the methods that ran: what the plane's horizontal axis ranks. */
export function cheapestRun(set: TaskSet, model: ModelKey, among: readonly ArmId[] = ARMS.map((a) => a.id)): { id: ArmId; usd: number; correct: number } {
  const all = among.filter((id) => cellIn(set, model, id)).map((id) => ({ id, usd: perThousandRuns(setCell(set, model, id)), correct: setCell(set, model, id).correct }));
  return all.reduce((a, b) => (b.usd < a.usd ? b : a));
}
const codeUsd = (set: TaskSet, model: ModelKey): number => perThousandRuns(setCell(set, model, CODE));
const OTHER_ARMS: readonly ArmId[] = ARMS.filter((a) => a.id !== CODE).map((a) => a.id);
/** Where the other methods are on a set and model: how many right, and what a run costs. */
export function othersOn(set: TaskSet, model: ModelKey): { correct: Span; usd: Span } {
  const cells = OTHER_ARMS.filter((id) => cellIn(set, model, id)).map((id) => setCell(set, model, id));
  const right = cells.map((c) => c.correct);
  const usd = cells.map(perThousandRuns);
  return { correct: { min: Math.min(...right), max: Math.max(...right) }, usd: { min: Math.min(...usd), max: Math.max(...usd) } };
}
/** How many methods on a model got every run of a set right. */
export const perfectOn = (set: TaskSet, model: ModelKey): ArmId[] =>
  ARMS.filter((a) => cellIn(set, model, a.id) && setCell(set, model, a.id).correct === setCell(set, model, a.id).runs).map((a) => a.id);

const range = (s: Span, unit = ''): string => (s.min === s.max ? `${s.min}${unit}` : `${s.min}\u2013${s.max}${unit}`);
const words = (s: Span): string => (s.min === s.max ? `${s.min}` : `${s.min} to ${s.max}`);
const usdRange = (s: Span): string => (s.min === s.max ? fmtUsd(s.min) : `${fmtUsd(s.min)} to ${fmtUsd(s.max)}`);
const percent = (x: number): string => `${Math.round(x * 100)}%`;
/** A factor without trailing zeros: 3.75, 7.5, 9. */
const factor = (x: number): string => String(+x.toFixed(2));
const factorWords = (s: Span): string => (s.min === s.max ? factor(s.min) : `${factor(s.min)} to ${factor(s.max)}`);
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** A small count in words, for the start of a sentence. */
const countWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** What a method got right on two sets, said once when it is the same on both. */
const rightOn = (a: Cell, b: Cell, bLabel: string): string => (a.correct === b.correct ? `${a.correct} of ${a.runs} on both` : `${a.correct} of ${a.runs} on the preset tasks, ${b.correct} on ${bLabel}`);

/** Two effects, one on top of the other: a cheaper, better model, and the code surface instead of one-by-one calls. */
export function multiples(): { both: number; model: number; method: number } {
  const worst = perThousandRight(cellOf('older', 'naive-direct'));
  const sameMethodNewest = perThousandRight(cellOf('newest', 'naive-direct'));
  const best = perThousandRight(cellOf('newest', CODE));
  return { both: worst / best, model: worst / sameMethodNewest, method: sameMethodNewest / best };
}

// ── the beats ──────────────────────────────────────────────────────────────

export type ResultsBeatId = 'older' | 'newer' | 'newest' | 'unplanned' | 'dollars' | 'why';
export interface ResultsBeat {
  id: ResultsBeatId;
  href: string;
  caption: string;
}
/** The model the unplanned tasks open on: the one the walk has just ended on. */
export const UNPLANNED_MODEL: ModelKey = 'newest';

export const resultsHref = (id: ResultsBeatId, model?: ModelKey): string => {
  const qs = [id !== 'older' ? `show=${id}` : '', id === 'unplanned' && model && model !== UNPLANNED_MODEL ? `model=${model}` : ''].filter(Boolean).join('&');
  return `/tour/results${qs ? `?${qs}` : ''}`;
};
export const RESULTS_BEATS: readonly ResultsBeat[] = (
  [
    ['older', 'gpt-5.4-mini'],
    ['newer', 'gpt-5.6-luna'],
    ['newest', 'gpt-6-luna'],
    ['unplanned', 'Unplanned tasks'],
    ['dollars', 'What a right answer costs'],
    ['why', 'Why, and what this does not show']
  ] as const
).map(([id, caption]) => ({ id, href: resultsHref(id), caption }));

export interface ResultsState {
  beat: ResultsBeatId;
  /** The model the plane shows (the unplanned tasks can be turned to any of the three). */
  model: ModelKey;
}
export function parseResults(search: URLSearchParams): ResultsState {
  const beat = RESULTS_BEATS.find((b) => b.id === search.get('show'))?.id ?? RESULTS_BEATS[0].id;
  const asked = MODEL_ORDER.find((m) => m === search.get('model'));
  // The first three beats are a model each. The unplanned tasks can be turned to any of the three. Nothing else is about one model.
  const model = beat === 'older' || beat === 'newer' || beat === 'newest' ? beat : beat === 'unplanned' ? (asked ?? UNPLANNED_MODEL) : UNPLANNED_MODEL;
  return { beat, model };
}
export const parseResultsBeat = (search: URLSearchParams): ResultsBeatId => parseResults(search).beat;

/** Where a chip in the plane's header leads: a model's own beat on the preset tasks, or the unplanned tasks turned to that model. */
export const chipHref = (model: ModelKey, set: TaskSet): string => (set === 'preset' ? resultsHref(model) : resultsHref('unplanned', model));

/** What the Next button says at a beat. */
export const NEXT_LABEL: Record<ResultsBeatId, string> = {
  older: 'Next: a newer model',
  newer: 'Next: the newest model',
  newest: 'Next: questions nobody planned for',
  unplanned: 'Next: what a right answer costs',
  dollars: 'Next: why it holds',
  why: 'Next'
};

/** What the plane shows at a beat: one model, one set, and the way there. */
export interface PlaneState {
  model: ModelKey;
  set: TaskSet;
}
export function planeStateOf(s: ResultsState): PlaneState | null {
  switch (s.beat) {
    case 'older':
    case 'newer':
    case 'newest':
      return { model: s.beat, set: 'preset' };
    case 'unplanned':
      return { model: s.model, set: 'unplanned' };
    default:
      return null;
  }
}

// ── one beat, as the screen draws it ───────────────────────────────────────

export interface RowView {
  id: ArmId;
  family: Family;
  shape: Shape;
  label: string;
  hint: string;
  /** False where the method did not run on this model: the row is held and says so. */
  ran: boolean;
  correct: number;
  runs: number;
  /** Share of runs that were right: the filled part of the bar. */
  fill: number;
  /** Dollars per 1,000 runs, as printed. */
  usd: string;
  usdValue: number;
  isCode: boolean;
  /** The cheapest per run on this model and set. */
  cheapest: boolean;
  aria: string;
}
export interface GroupView {
  id: GroupId;
  title: string;
  note: string;
  rows: RowView[];
}
export interface TableView {
  model: ModelKey;
  set: TaskSet;
  deployment: string;
  role: string;
  price: string;
  groups: GroupView[];
}
export interface Tile {
  label: string;
  value: string;
  sub: string;
  tone: 'code' | 'catalogue' | 'ink';
  /** A name rather than a figure: set smaller, so a long one fits. */
  compact?: boolean;
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
export interface LadderRow {
  id: 'older-catalogue' | 'newest-catalogue' | 'newest-code';
  label: string;
  sub: string;
  usd: string;
  usdValue: number;
  tone: 'code' | 'catalogue';
}
export interface ResultsView {
  beat: ResultsBeatId;
  model: ModelKey;
  lead: string;
  /** What fills the stage: the plane and its table, the ladder of costs, or the reading. */
  stage: 'plane' | 'ladder' | 'why';
  plane: PlaneState | null;
  table: TableView | null;
  ladder: LadderRow[] | null;
  tiles: Tile[] | null;
  columns: Column[] | null;
  /** What the figures are, in a line under the stage. */
  footnote: string;
  /** What a screen reader hears for the plane. */
  aria: string;
}

function tableOf(plane: PlaneState): TableView {
  const m = modelOf(plane.model);
  const best = cheapestRun(plane.set, plane.model).id;
  const groups = (Object.keys(GROUPS) as GroupId[]).map((g) => ({
    id: g,
    ...GROUPS[g],
    rows: ARMS.filter((a) => a.group === g).map((a): RowView => {
      const c = cellIn(plane.set, plane.model, a.id);
      const usdValue = c ? perThousandRuns(c) : Infinity;
      return {
        id: a.id,
        family: a.family,
        shape: a.shape,
        label: a.label,
        hint: a.full,
        ran: Boolean(c),
        correct: c?.correct ?? 0,
        runs: c?.runs ?? 40,
        fill: c ? c.correct / c.runs : 0,
        usd: c ? fmtUsd(usdValue) : '\u2013',
        usdValue,
        isCode: a.id === CODE,
        cheapest: Boolean(c) && a.id === best,
        aria: c
          ? `${a.full}: ${c.correct} of ${c.runs} right, ${fmtUsd(usdValue)} per 1,000 runs`
          : `${a.full}: not run on ${m.deployment}, which does not offer hosted programmatic calling`
      };
    })
  }));
  return { model: plane.model, set: plane.set, deployment: m.deployment, role: m.role, price: priceLine(plane.model), groups };
}

function planeAria(plane: PlaneState): string {
  const m = modelOf(plane.model);
  const parts = ARMS.filter((a) => cellIn(plane.set, plane.model, a.id)).map((a) => {
    const c = setCell(plane.set, plane.model, a.id);
    return `${a.full}: ${c.correct} of ${c.runs} right, ${fmtUsd(perThousandRuns(c))}`;
  });
  return `Dollars per 1,000 runs against runs that were right, ${m.deployment} on the ${TASK_SETS[plane.set].short} tasks. ${parts.join('. ')}.`;
}

function leadOf(s: ResultsState): string {
  const p = planeStateOf(s);
  const n = SETS.preset.older.code!.runs;
  switch (s.beat) {
    case 'older': {
      const o = othersOn('preset', 'older');
      return `An older model, ${modelOf('older').deployment}, on the four preset tasks. Only the code surface reaches the top: ${n} of ${n} right. The other five get ${words(o.correct)}, at ${usdRange(o.usd)} per 1,000 runs against its ${fmtUsd(codeUsd('preset', 'older'))}.`;
    }
    case 'newer': {
      const cheap = cheapestRun('preset', 'newer');
      const less = 1 - cheap.usd / codeUsd('preset', 'newer');
      return `${modelOf('newer').deployment} costs ${factorWords(priceDrop('newer'))} times less per token, so everything moves left, and it does the work better, so everything moves up. The code surface is no longer the cheapest: the tuned catalogue, called one by one, is ${percent(less)} under it, at ${cheap.correct} of ${n}. The code surface is still at ${n} of ${n}.`;
    }
    case 'newest': {
      const next = cheapestRun('preset', 'newest', OTHER_ARMS);
      return `${modelOf('newest').deployment} costs ${factorWords(priceDrop('newest'))} times less per token than the older model. ${capital(countWord(perfectOn('preset', 'newest').length))} methods now get ${n} of ${n}, so price decides, and the code surface is the cheapest again: ${fmtUsd(codeUsd('preset', 'newest'))} per 1,000 runs against ${fmtUsd(next.usd)} for the next.`;
    }
    case 'unplanned': {
      const model = p!.model;
      const was = cheapestRun('preset', model, OTHER_ARMS);
      const now = perThousandRuns(setCell('unplanned', model, was.id));
      return `The same ${modelOf(model).deployment} on four questions written after the tool sets were frozen. ${armOf(was.id).full}, the cheapest other method on the preset tasks, goes from ${fmtUsd(was.usd)} to ${fmtUsd(now)} per 1,000 runs: ${fmtTimes(now / was.usd)}. The code surface goes from ${fmtUsd(codeUsd('preset', model))} to ${fmtUsd(codeUsd('unplanned', model))}, and still gets ${setCell('unplanned', model, CODE).correct} of ${n}.`;
    }
    case 'dollars':
      return 'What a right answer costs, failures included, over all eight tasks: the code surface is the cheapest on all three models. A better model and a better method are separate effects, and they multiply.';
    case 'why':
      return 'A reading, not a measurement: models write code fluently, and the object tells them what the data looks like. Programs over the catalogue, with no such description, fell with the model.';
  }
}

function tilesOf(s: ResultsState): Tile[] | null {
  const p = planeStateOf(s);
  const n = SETS.preset.older.code!.runs;
  if (p && s.beat !== 'unplanned') {
    const o = othersOn(p.set, p.model);
    const code = setCell(p.set, p.model, CODE);
    const cheap = cheapestRun(p.set, p.model);
    const cheapIsCode = cheap.id === CODE;
    const next = cheapestRun(p.set, p.model, OTHER_ARMS);
    return [
      { label: 'Code surface', value: `${code.correct} of ${code.runs}`, sub: `right, at ${fmtUsd(codeUsd(p.set, p.model))} per 1,000 runs`, tone: 'code' },
      {
        label: s.beat === 'older' ? 'The other five' : 'The other seven',
        value: `${range(o.correct)} of ${n}`,
        sub: `right, at ${usdRange(o.usd)} per 1,000 runs`,
        tone: 'catalogue'
      },
      cheapIsCode
        ? {
            label: 'Cheapest per run',
            value: 'Code surface',
            sub: `${fmtUsd(codeUsd(p.set, p.model))} per 1,000 runs. Next: ${armOf(next.id).full.toLowerCase()}, ${fmtUsd(next.usd)}, ${percent(next.usd / codeUsd(p.set, p.model) - 1)} more.`,
            tone: 'ink',
            compact: true
          }
        : {
            label: 'Cheapest per run',
            value: armOf(cheap.id).full,
            sub: `${fmtUsd(cheap.usd)} per 1,000 runs, ${cheap.correct} of ${n} right. The code surface: ${fmtUsd(codeUsd(p.set, p.model))}, ${code.correct} of ${n}.`,
            tone: 'ink',
            compact: true
          }
    ];
  }
  if (p && s.beat === 'unplanned') {
    const was = cheapestRun('preset', p.model, OTHER_ARMS);
    const before = setCell('preset', p.model, was.id);
    const now = setCell('unplanned', p.model, was.id);
    const code = [setCell('preset', p.model, CODE), setCell('unplanned', p.model, CODE)];
    return [
      {
        label: armOf(was.id).full,
        value: `${fmtUsd(was.usd)} \u2192 ${fmtUsd(perThousandRuns(now))}`,
        sub: `per 1,000 runs, preset to unplanned: ${fmtTimes(perThousandRuns(now) / was.usd)}. Right: ${rightOn(before, now, 'these')}.`,
        tone: 'catalogue'
      },
      {
        label: 'Code surface',
        value: `${fmtUsd(perThousandRuns(code[0]))} \u2192 ${fmtUsd(perThousandRuns(code[1]))}`,
        sub: `per 1,000 runs: ${percent(Math.abs(perThousandRuns(code[1]) / perThousandRuns(code[0]) - 1))} ${perThousandRuns(code[1]) >= perThousandRuns(code[0]) ? 'more' : 'less'}. Right: ${rightOn(code[0], code[1], 'these')}.`,
        tone: 'code'
      },
      {
        label: 'Cheapest on unplanned tasks',
        value: armOf(cheapestRun('unplanned', p.model).id).full,
        sub: `${fmtUsd(cheapestRun('unplanned', p.model).usd)} per 1,000 runs on ${modelOf(p.model).deployment}.`,
        tone: 'ink',
        compact: true
      }
    ];
  }
  if (s.beat === 'dollars') {
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

function ladderOf(): LadderRow[] {
  const row = (id: LadderRow['id'], model: ModelKey, arm: ArmId, label: string, tone: LadderRow['tone']): LadderRow => {
    const c = cellOf(model, arm);
    return { id, label, sub: `${c.correct} of ${c.runs} right`, usd: fmtUsd(perThousandRight(c)), usdValue: perThousandRight(c), tone };
  };
  return [
    row('older-catalogue', 'older', 'naive-direct', `${modelOf('older').deployment}, the catalogue called one by one`, 'catalogue'),
    row('newest-catalogue', 'newest', 'naive-direct', `${modelOf('newest').deployment}, the catalogue called one by one`, 'catalogue'),
    row('newest-code', 'newest', CODE, `${modelOf('newest').deployment}, the code surface`, 'code')
  ];
}

function columnsOf(beat: ResultsBeatId): Column[] | null {
  if (beat !== 'why') return null;
  const older = modelOf('older').deployment;
  const ptc = (['newer', 'newest'] as const).map((m) => setCell('unplanned', m, 'naive-ptc'));
  const code = (['newer', 'newest'] as const).map((m) => setCell('unplanned', m, CODE));
  const over = Math.max(...ptc.map((c, i) => perThousandRuns(c) / perThousandRuns(code[i])));
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
        { text: `On the two newer models, programs over the plain catalogue cost within ${percent(over - 1)} of the code surface on the unplanned tasks. Most of that saving is a program instead of calls; the object is what keeps it at the top on the older model.`, measured: true },
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

function footnoteOf(s: ResultsState): string {
  const n = cellOf('newest', CODE).runs;
  const h = hostedSpan();
  if (planeStateOf(s)) {
    const k = SETS.preset.older.code!.runs;
    return `${k} runs a marker: 4 tasks, ${SOURCE.repetitions} runs each. Dollars are estimates from the tokens the provider reported, per 1,000 runs, failures included. Bars are 95% intervals. Rings are hosted programmatic calling, run on the two newer models only.`;
  }
  return `${n} runs a bar: ${SOURCE.tasks} tasks, ${SOURCE.repetitions} runs each. Dollars are estimates from reported tokens, per 1,000 right answers, failures included. Hosted programmatic calling, run on the two newer models only, got ${words(h)} of ${n} and is left out.`;
}

export function buildResults(beat: ResultsBeatId, model?: ModelKey): ResultsView {
  const s: ResultsState = parseResults(new URLSearchParams(beat === 'unplanned' && model ? { show: beat, model } : { show: beat }));
  const plane = planeStateOf(s);
  return {
    beat: s.beat,
    model: s.model,
    lead: leadOf(s),
    stage: plane ? 'plane' : s.beat === 'dollars' ? 'ladder' : 'why',
    plane,
    table: plane ? tableOf(plane) : null,
    ladder: s.beat === 'dollars' ? ladderOf() : null,
    tiles: tilesOf(s),
    columns: columnsOf(s.beat),
    footnote: footnoteOf(s),
    aria: plane ? planeAria(plane) : ''
  };
}
