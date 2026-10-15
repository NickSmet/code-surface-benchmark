/**
 * The dollars-against-correctness plane of the benchmark's cost report, drawn for the talk.
 *
 * The benchmark's own chart (scripts/ptc-bench/cost-charts.ts) is one static panel per model. Here there is one panel and the
 * model changes under it, so a method that gets cheaper visibly moves left, and one that gets better visibly moves up. The
 * scales are the benchmark's: dollars per 1,000 runs on a log axis, share of runs that were right with a Wilson 95% interval,
 * colour for the tool set and shape for how it is called. They are fixed across every model and both sets of tasks, so two
 * positions compare directly.
 *
 * This file is only geometry: positions, interpolation between models, the trail a marker leaves, and where its labels go.
 * The numbers are results.ts's. Nothing here reads the benchmark's files.
 */

import {
  ARMS,
  CODE,
  MODEL_ORDER,
  armOf,
  cellIn,
  cheapestRun,
  perThousandRuns,
  type ArmId,
  type Cell,
  type Family,
  type ModelKey,
  type Shape,
  type TaskSet
} from './results';

/** Wilson score interval for k successes in n trials, as the benchmark's report computes it. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

// ── the frame ──────────────────────────────────────────────────────────────

export const PLANE = { w: 860, h: 520 } as const;
const MARGIN = { l: 62, r: 20, t: 14, b: 54 };
export const PLOT = { x0: MARGIN.l, y0: MARGIN.t, x1: PLANE.w - MARGIN.r, y1: PLANE.h - MARGIN.b } as const;

const SETS_LIST: readonly TaskSet[] = ['preset', 'unplanned'];
const everyCell = (): Cell[] => SETS_LIST.flatMap((s) => MODEL_ORDER.flatMap((m) => ARMS.map((a) => cellIn(s, m, a.id)).filter((c): c is Cell => Boolean(c))));

/** One dollar axis and one correctness axis for every model and both sets, as the benchmark's report draws its panels. */
export const X_LO = Math.min(...everyCell().map(perThousandRuns)) / 1.5;
export const X_HI = Math.max(...everyCell().map(perThousandRuns)) * 1.5;
const LOWEST = Math.min(1, ...everyCell().map((c) => wilson(c.correct, c.runs)[0]));
export const Y_MIN = Math.max(0, Math.floor((LOWEST - 0.04) * 10) / 10);
/** A little above 100%, so the labels of the markers at the top have room above them. */
export const Y_MAX = 1.1;

export const X_TICKS: readonly number[] = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].filter((t) => t >= X_LO && t <= X_HI);
export const Y_TICKS: readonly number[] = (() => {
  const out: number[] = [];
  for (let v = Math.ceil(Y_MIN * 10 - 1e-9) / 10; v <= 1 + 1e-9; v += 0.1) out.push(Math.round(v * 100) / 100);
  return out;
})();

export const xOf = (usd: number): number => PLOT.x0 + ((Math.log(usd) - Math.log(X_LO)) / (Math.log(X_HI) - Math.log(X_LO))) * (PLOT.x1 - PLOT.x0);
export const yOf = (share: number): number => PLOT.y1 - ((share - Y_MIN) / (Y_MAX - Y_MIN)) * (PLOT.y1 - PLOT.y0);

/** Axis ticks with no trailing zeros: $0.2, $1, $10. */
export const fmtTick = (v: number): string => `$${+v.toPrecision(3)}`;

// ── how a method looks ─────────────────────────────────────────────────────

export const FAMILY_COLOR: Record<Family, string> = { catalogue: '#6b7280', calc: '#d97706', tuned: '#2563eb', code: '#059669' };
/** Darker shades of the family colours, for text. */
export const LABEL_COLOR: Record<Family, string> = { catalogue: '#374151', calc: '#b45309', tuned: '#1d4ed8', code: '#047857' };
export const MODEL_COLOR: Record<ModelKey, string> = { older: '#7c3aed', newer: '#0891b2', newest: '#db2777' };

/** How a method is named on the plane itself, where there is little room. */
export const SHORT: Record<ArmId, string> = {
  'naive-direct': 'Catalogue, one by one',
  'calc-direct': 'Catalogue + calculator',
  'naive-ptc': 'Catalogue, from a program',
  'naive-ptc-native': 'Catalogue, hosted',
  'tuned-direct': 'Tuned, one by one',
  'tuned-ptc': 'Tuned, from a program',
  'tuned-ptc-native': 'Tuned, hosted',
  code: 'Code surface'
};

export const MARKER = { r: 9, half: 9, diamond: 11.5 } as const;

/** The path of a marker's shape, for the shapes that are paths. */
export const diamondPath = (x: number, y: number): string => `M ${x} ${y - MARKER.diamond} L ${x + MARKER.diamond} ${y} L ${x} ${y + MARKER.diamond} L ${x - MARKER.diamond} ${y} Z`;
export const shapeOf = (id: ArmId): Shape => armOf(id).shape;

// ── where a method is ──────────────────────────────────────────────────────

/** A marker's place on the plane, and the ends of its interval, all in the plane's own units. */
export interface Pose {
  x: number;
  y: number;
  /** The top of the interval (the higher share). */
  top: number;
  /** The bottom of the interval. */
  bottom: number;
}

export function poseOfCell(c: Cell): Pose {
  const [lo, hi] = wilson(c.correct, c.runs);
  return { x: xOf(perThousandRuns(c)), y: yOf(c.correct / c.runs), top: yOf(Math.min(1, hi)), bottom: yOf(Math.max(Y_MIN, lo)) };
}
export function poseOf(set: TaskSet, model: ModelKey, arm: ArmId): Pose | null {
  const c = cellIn(set, model, arm);
  return c ? poseOfCell(c) : null;
}

const mix = (a: number, b: number, f: number): number => a + (b - a) * f;
export const mixPose = (a: Pose, b: Pose, f: number): Pose => ({ x: mix(a.x, b.x, f), y: mix(a.y, b.y, f), top: mix(a.top, b.top, f), bottom: mix(a.bottom, b.bottom, f) });
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** The position of the model on the walk: 0 is the older model, 1 the newer, 2 the newest. */
export const modelIndex = (m: ModelKey): number => MODEL_ORDER.indexOf(m);

/** The first model a method ran on: the hosted ones start at the newer model. */
const firstIndex = (arm: ArmId): number => MODEL_ORDER.findIndex((m) => cellIn('preset', m, arm));

/** Where a method is as the model walks from the older (0) to the newest (2), on one set. A method that has not yet arrived waits where it will first appear. */
function along(arm: ArmId, set: TaskSet, t: number): Pose {
  const first = firstIndex(arm);
  const at = Math.max(first, Math.min(MODEL_ORDER.length - 1, t));
  const i = Math.floor(at);
  const j = Math.min(MODEL_ORDER.length - 1, i + 1);
  return mixPose(poseOf(set, MODEL_ORDER[i], arm)!, poseOf(set, MODEL_ORDER[j], arm)!, at - i);
}

/** How visible a method is: the hosted ones fade in as the walk reaches the first model they ran on. */
export function presence(arm: ArmId, t: number): number {
  const first = firstIndex(arm);
  return first <= 0 ? 1 : clamp01(t / first);
}

/**
 * Where a method is at a moment of the walk: `t` is the model (0 to 2), `s` is the set (0 preset, 1 unplanned).
 * Every moment is a mix of four stored places, so the motion from any state to any other is a straight glide.
 */
export function poseAt(arm: ArmId, t: number, s: number): Pose {
  return mixPose(along(arm, 'preset', t), along(arm, 'unplanned', t), clamp01(s));
}

export interface Pt {
  x: number;
  y: number;
}
export interface Trail {
  /** The way the model has walked, through every place before this one: drawn while the set is the preset. */
  journey: Pt[];
  /** The way from the preset tasks to the unplanned ones, at this model: drawn while the set is the unplanned. */
  across: Pt[];
  /** The places the marker has been, for the ghost dots. */
  ghosts: Pt[];
}

export function trailOf(arm: ArmId, t: number, s: number): Trail {
  const first = firstIndex(arm);
  const last = Math.floor(Math.max(first, Math.min(MODEL_ORDER.length - 1, t)));
  const stops: Pt[] = [];
  for (let i = first; i <= last; i += 1) stops.push(poseOf('preset', MODEL_ORDER[i], arm)!);
  const here = along(arm, 'preset', t);
  const journey = [...stops.map(({ x, y }) => ({ x, y })), ...(t > last + 1e-9 && last < MODEL_ORDER.length - 1 ? [{ x: here.x, y: here.y }] : [])];
  const head = poseAt(arm, t, s);
  const across = [{ x: here.x, y: here.y }, { x: head.x, y: head.y }];
  // A ghost is a place the marker has left, so the one it is standing on is not one.
  const standing = (p: Pt): boolean => Math.hypot(p.x - head.x, p.y - head.y) < 0.5;
  const ghosts = [...stops, ...(s > 0 ? [here] : [])].map(({ x, y }) => ({ x, y })).filter((p) => !standing(p));
  return { journey, across, ghosts };
}

// ── labels ─────────────────────────────────────────────────────────────────

export interface Label {
  arm: ArmId;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  kind: 'code' | 'cheapest';
}
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const LABEL_FONT = 13.5;
/** The width of a label, close enough to keep two apart: the same rule of thumb the benchmark's charts use. */
export const textWidth = (s: string, size = LABEL_FONT): number => s.length * size * 0.58;
const overlaps = (a: Box, b: Box, pad = 2): boolean => a.x0 < b.x1 + pad && a.x1 + pad > b.x0 && a.y0 < b.y1 + pad && a.y1 + pad > b.y0;
const area = (a: Box, b: Box): number => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const inside = (b: Box, pad = 4): boolean => b.x0 >= PLOT.x0 + pad && b.x1 <= PLOT.x1 - pad && b.y0 >= PLOT.y0 + pad && b.y1 <= PLOT.y1 - pad;

export function boxOf(l: Pick<Label, 'x' | 'y' | 'anchor' | 'text'>): Box {
  const w = textWidth(l.text);
  const x0 = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2;
  return { x0, y0: l.y - LABEL_FONT, x1: x0 + w, y1: l.y + 4 };
}

const SIDES: ReadonlyArray<{ dx: number; dy: number; anchor: Label['anchor'] }> = [
  { dx: 17, dy: 5, anchor: 'start' },
  { dx: -17, dy: 5, anchor: 'end' },
  { dx: 0, dy: -18, anchor: 'middle' },
  { dx: 0, dy: 31, anchor: 'middle' },
  { dx: 15, dy: -16, anchor: 'start' },
  { dx: -15, dy: -16, anchor: 'end' },
  { dx: 15, dy: 29, anchor: 'start' },
  { dx: -15, dy: 29, anchor: 'end' }
];

/** Which markers are named on the plane: the code surface, and the cheapest per run when it is something else. The table names the rest. */
export function namedArms(set: TaskSet, model: ModelKey): Array<{ arm: ArmId; kind: Label['kind'] }> {
  const cheap = cheapestRun(set, model).id;
  return cheap === CODE ? [{ arm: CODE, kind: 'code' }] : [{ arm: CODE, kind: 'code' }, { arm: cheap, kind: 'cheapest' }];
}

/** The room a marker takes, with a margin for its shape and the bar through it. */
const markerBox = (p: Pose, pad = 14): Box => ({ x0: p.x - pad, y0: p.y - pad, x1: p.x + pad, y1: p.y + pad });
const restingPoses = (set: TaskSet, model: ModelKey): Array<{ id: ArmId; pose: Pose }> =>
  ARMS.map((a) => ({ id: a.id, pose: poseOf(set, model, a.id) })).filter((p): p is { id: ArmId; pose: Pose } => Boolean(p.pose));

/** Each named marker's label, in the first place around it that touches no marker, no other label and not the frame. */
export function labelsFor(set: TaskSet, model: ModelKey): Label[] {
  const poses = restingPoses(set, model);
  const placed: Box[] = [];
  const out: Label[] = [];
  for (const { arm, kind } of namedArms(set, model)) {
    const pose = poseOf(set, model, arm)!;
    const text = kind === 'cheapest' ? `${SHORT[arm]} \u00b7 cheapest` : SHORT[arm];
    const others = poses.filter((p) => p.id !== arm).map((p) => markerBox(p.pose));
    let best: { label: Label; cost: number } | null = null;
    for (const side of SIDES) {
      const label: Label = { arm, text, x: pose.x + side.dx, y: pose.y + side.dy, anchor: side.anchor, kind };
      const box = boxOf(label);
      const cost = [...others, ...placed].reduce((n, b) => n + (overlaps(box, b, 3) ? 1 + area(box, b) : 0), 0) + (inside(box) ? 0 : 400);
      if (!best || cost < best.cost) best = { label, cost };
      if (cost === 0) break;
    }
    out.push(best!.label);
    placed.push(boxOf(best!.label));
  }
  return out;
}

/** How many times a label runs into a marker, another label or the frame. The tests want zero at every resting place. */
export function labelClashes(set: TaskSet, model: ModelKey): number {
  const labels = labelsFor(set, model);
  const poses = restingPoses(set, model);
  const boxes = labels.map(boxOf);
  let n = 0;
  boxes.forEach((b, i) => {
    if (!inside(b)) n += 1;
    boxes.forEach((o, j) => {
      if (j > i && overlaps(b, o, 2)) n += 1;
    });
    for (const p of poses) if (p.id !== labels[i].arm && overlaps(b, markerBox(p.pose, 11), 0)) n += 1;
  });
  return n;
}

// ── the ladder of what a right answer costs ────────────────────────────────

/** The bars of the last chart are on a log axis too: a bar's length is how many times the dollar axis has doubled. */
export const LADDER = { lo: 0.1, hi: 30 } as const;
export const ladderFrac = (usd: number): number => (Math.log(usd) - Math.log(LADDER.lo)) / (Math.log(LADDER.hi) - Math.log(LADDER.lo));

/** Every place the plane can rest: a model and a set. The tests sweep them. */
export const RESTS: ReadonlyArray<{ model: ModelKey; set: TaskSet }> = SETS_LIST.flatMap((set) => MODEL_ORDER.map((model) => ({ model, set })));
