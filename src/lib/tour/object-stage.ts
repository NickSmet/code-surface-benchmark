/**
 * The estate-to-object transition, as geometry.
 *
 * Everything the "object" screen draws is a pure function of one number, the
 * motion position `t` (0 .. 10): where each of the 194 glyphs is, which chips
 * have landed, how far each connector is drawn. Nothing here touches the DOM,
 * so the same functions run under `tsx --test`, and the screen can be scrubbed
 * forwards and backwards without keeping any other state.
 *
 * The stage is a fixed 1400 x 680 coordinate space that the page scales to fit:
 *
 *   left zone   the estate (steps 0-3), then the tool description and the program
 *   right zone  the object `data` that the estate turns into
 *
 * Every resource is one glyph for the whole screen. It starts in its pod, makes
 * the trip to its cell in `data.resources`, and stays there while the program
 * reads it, so the viewer can follow one thing from the picture to the data.
 */

import type { Inventory, ResourceType } from '$lib/inventory/types';
import type { ProjectionResource, ProjectionView } from '$lib/inventory/projection';
import { buildEstateModel, type EstateModel, type MemberRole, type UnitKind } from './estate';
import { TYPE_COLOR } from './lenses';

// ── the stage ──────────────────────────────────────────────────────────────

export const STAGE = { w: 1400, h: 680 } as const;
export const LEFT = { x: 20, y: 20, w: 680, h: 640 } as const;
export const RIGHT = { x: 740, y: 20, w: 640, h: 640 } as const;

/** The program panel in the left zone, and how many lines of code it holds. The reference program has to fit. */
export const PROGRAM = { h: 452, top: 48, bottom: 8, lineH: 21.5 } as const;
export const PROGRAM_MAX_LINES = Math.floor((PROGRAM.h - PROGRAM.top - PROGRAM.bottom) / PROGRAM.lineH);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A glyph's shape, centre-based so a change of size does not shift it. */
export interface Pose {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Corner radius; half the size makes a circle. */
  r: number;
}

// ── the steps ──────────────────────────────────────────────────────────────

export const STEP_IDS = ['estate', 'containers', 'links', 'flatten', 'contract', 'program', 'index', 'find', 'nic', 'ip', 'return'] as const;
export type StepId = (typeof STEP_IDS)[number];
export const LAST_STEP = STEP_IDS.length - 1;

export type ActId = 'reshape' | 'describe' | 'read';
export interface Act {
  id: ActId;
  label: string;
  /** The first step of the act. */
  first: number;
  hint: string;
}
export const ACTS: Act[] = [
  { id: 'reshape', label: 'Reshape', first: 0, hint: 'Turn the estate into one plain object' },
  { id: 'describe', label: 'Describe', first: 4, hint: 'Tell the model its shape, once' },
  { id: 'read', label: 'Read', first: 5, hint: 'A program reads the object' }
];
export function actOf(step: number): ActId {
  return step >= 5 ? 'read' : step >= 4 ? 'describe' : 'reshape';
}

/**
 * The motion position when a step has fully arrived. A step is *entered* during
 * the unit interval before it: step 3 ("flatten") plays while t runs 2 -> 3.
 */
export const AT = Object.fromEntries(STEP_IDS.map((id, i) => [id, i])) as Record<StepId, number>;

// ── small maths ────────────────────────────────────────────────────────────

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0 before `a`, 1 after `b`, linear between. */
export const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
export const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const mix = (a: number, b: number, u: number): number => a + (b - a) * u;
/** A stable pseudo-random number in [0, 1) so the flights look organic but never change between renders. */
export function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
export function mixPose(a: Pose, b: Pose, u: number): Pose {
  return { cx: mix(a.cx, b.cx, u), cy: mix(a.cy, b.cy, u), w: mix(a.w, b.w, u), h: mix(a.h, b.h, u), r: mix(a.r, b.r, u) };
}

// ── the estate, drawn in the left zone ─────────────────────────────────────

const CARD = { w: 212, gapX: 22, header: 26, pods: 30, podW: 61, podH: 38, pitchX: 65, pitchY: 42, padX: 9, rows: 6, bottom: 8 } as const;
const ROW = { label: 22, labelGap: 4, gap: 14 } as const;
const CARD_H = CARD.pods + CARD.rows * CARD.pitchY - (CARD.pitchY - CARD.podH) + CARD.bottom;

/** Where each kind of resource sits inside a pod (relative to the pod's top-left corner). */
const POD_SHAPE: Record<MemberRole, { cx: number; cy: number; w: number; h: number; r: number }> = {
  vm: { cx: 18, cy: 19, w: 22, h: 22, r: 5 },
  nic: { cx: 40, cy: 11, w: 11, h: 11, r: 5.5 },
  pip: { cx: 54, cy: 11, w: 10, h: 10, r: 2 },
  osDisk: { cx: 47, cy: 24, w: 22, h: 5.5, r: 2.5 },
  dataDisk: { cx: 47, cy: 32, w: 22, h: 5.5, r: 2.5 },
  storage: { cx: 30, cy: 19, w: 24, h: 24, r: 6 },
  sql: { cx: 30, cy: 19, w: 24, h: 24, r: 6 },
  app: { cx: 30, cy: 19, w: 24, h: 24, r: 6 },
  other: { cx: 30, cy: 19, w: 24, h: 24, r: 6 }
};

export interface PodFrame extends Rect {
  unitId: string;
  kind: UnitKind;
  /** The pod the question is about. */
  focus: boolean;
}
export interface GroupCard extends Rect {
  name: string;
  subscriptionName: string;
  count: number;
  location: string;
  pods: PodFrame[];
}
export interface SubLabel extends Rect {
  name: string;
  id: string;
  groupCount: number;
  resourceCount: number;
}

// ── the object, drawn in the right zone ────────────────────────────────────

export const OBJ = {
  padX: 16,
  headerH: 44,
  generatedAtY: 86,
  subsLabelY: 124,
  subsChipY: 132,
  groupsLabelY: 188,
  groupsChipY: 196,
  chipH: 26,
  resourcesLabelY: 290,
  gridY: 300,
  recordsY: 380,
  recordH: 72,
  recordGap: 20,
  /** Width of the record cards; the strip to their right carries the id-link brackets. */
  recordW: 580
} as const;

/** `data.resources`: 194 cells, row after row. */
export const GRID = { x: RIGHT.x + OBJ.padX, y: OBJ.gridY, cols: 49, pitch: 12.4, size: 10 } as const;

export function cellPose(index: number): Pose {
  const col = index % GRID.cols;
  const row = Math.floor(index / GRID.cols);
  return { cx: GRID.x + col * GRID.pitch + GRID.pitch / 2, cy: GRID.y + row * GRID.pitch + GRID.pitch / 2, w: GRID.size, h: GRID.size, r: 2.5 };
}

// ── glyphs ─────────────────────────────────────────────────────────────────

export type Focus = 'vm' | 'nic' | 'pip';

export interface Glyph {
  /** The resource id: the same glyph in the estate and in `data.resources`. */
  id: string;
  /** Its index in `data.resources`, which is also its cell. */
  index: number;
  name: string;
  type: ResourceType;
  role: MemberRole;
  color: string;
  groupName: string;
  unitId: string;
  estate: Pose;
  /** Only the pod the question is about gets a close-up. */
  zoom: Pose | null;
  cell: Pose;
  /** 0..1: when in the flatten step this glyph sets off. */
  delay: number;
  /** Sideways bow of its flight path, in stage units. */
  bend: number;
  focus: Focus | null;
}

/** The centre line of record card `i`: the close-up lines its three glyphs up with the three records. */
const recordCy = (i: number): number => OBJ.recordsY + i * (OBJ.recordH + OBJ.recordGap) + OBJ.recordH / 2;

/** The close-up of the question's pod: three glyphs stacked to line up with the three records, disks to the side. */
export const ZOOM = {
  vm: { cx: 600, cy: recordCy(0), w: 72, h: 72, r: 14 },
  nic: { cx: 600, cy: recordCy(1), w: 44, h: 44, r: 22 },
  pip: { cx: 600, cy: recordCy(2), w: 40, h: 40, r: 7 },
  osDisk: { cx: 486, cy: recordCy(0) - 12, w: 92, h: 17, r: 8 },
  dataDisk: { cx: 486, cy: recordCy(0) + 13, w: 92, h: 17, r: 8 }
} as const;
const zoomOf = (role: MemberRole): Pose | null => (role in ZOOM ? { ...ZOOM[role as keyof typeof ZOOM] } : null);

export interface Chip {
  key: string;
  kind: 'subscription' | 'group';
  label: string;
  /** What sits at the right-hand end of the chip: in the estate a count, in the object a field of the entry. */
  from: { side: string };
  to: { side: string };
  fromRect: Rect;
  toRect: Rect;
  /** 0..1 stagger. */
  delay: number;
}

export interface RecordField {
  key: string;
  /** Already formatted as source text, e.g. `"running"`. */
  value: string;
  col: 0 | 1;
  row: 0 | 1;
  /** `id` is what others point at, `ref` points at another record, `read` is returned by the program. */
  kind: 'plain' | 'id' | 'ref' | 'read';
}
export interface RecordCard extends Rect {
  role: Focus;
  index: number;
  id: string;
  name: string;
  type: ResourceType;
  fields: RecordField[];
}

export interface ObjectStage {
  groups: GroupCard[];
  subs: SubLabel[];
  glyphs: Glyph[];
  chips: Chip[];
  records: RecordCard[];
  /** Glyph indexes of the question's three records. */
  focus: { vm: number; nic: number; pip: number };
  generatedAt: string;
  counts: { subscriptions: number; groups: number; resources: number };
  /** The five resources of the question's pod, in `data.resources` order. */
  podIndexes: number[];
}

const shortId = (id: string): string => `\u2026/${id.split('/').pop()}`;
const quote = (v: unknown): string => (v === null || v === undefined ? 'null' : JSON.stringify(v));

function field(res: Record<string, unknown>, key: string, col: 0 | 1, row: 0 | 1, kind: RecordField['kind'], value?: string): RecordField {
  return { key, value: value ?? quote(res[key]), col, row, kind };
}

/** The three records the question needs, with the fields the program reads or follows. */
function recordCards(vm: ProjectionResource, nic: ProjectionResource, pip: ProjectionResource, index: (id: string) => number): RecordCard[] {
  const v = vm as unknown as Record<string, unknown>;
  const n = nic as unknown as Record<string, unknown>;
  const p = pip as unknown as Record<string, unknown>;
  const at = (i: number): Rect => ({ x: GRID.x, y: OBJ.recordsY + i * (OBJ.recordH + OBJ.recordGap), w: OBJ.recordW, h: OBJ.recordH });
  return [
    {
      role: 'vm',
      index: index(vm.id),
      id: vm.id,
      name: vm.name,
      type: vm.type,
      ...at(0),
      fields: [
        field(v, 'name', 0, 0, 'plain'),
        field(v, 'powerState', 1, 0, 'read'),
        field(v, 'id', 0, 1, 'id', quote(shortId(vm.id))),
        field(v, 'nicId', 1, 1, 'ref', quote(shortId(String(v.nicId))))
      ]
    },
    {
      role: 'nic',
      index: index(nic.id),
      id: nic.id,
      name: nic.name,
      type: nic.type,
      ...at(1),
      fields: [
        field(n, 'name', 0, 0, 'plain'),
        field(n, 'privateIp', 1, 0, 'plain'),
        field(n, 'id', 0, 1, 'id', quote(shortId(nic.id))),
        field(n, 'publicIpId', 1, 1, 'ref', quote(shortId(String(n.publicIpId))))
      ]
    },
    {
      role: 'pip',
      index: index(pip.id),
      id: pip.id,
      name: pip.name,
      type: pip.type,
      ...at(2),
      fields: [
        field(p, 'name', 0, 0, 'plain'),
        field(p, 'ipAddress', 1, 0, 'read'),
        field(p, 'id', 0, 1, 'id', quote(shortId(pip.id))),
        field(p, 'associatedToId', 1, 1, 'plain', quote(shortId(String(p.associatedToId))))
      ]
    }
  ];
}

/**
 * Lay the estate out and decide where everything goes. `projection` supplies the
 * order of `data.resources`; `question` names the VM the question is about.
 */
export function buildObjectStage(inv: Inventory, projection: ProjectionView, question: { vmName: string }): ObjectStage {
  const model: EstateModel = buildEstateModel(inv);
  if (model.subscriptions.length > 2) throw new Error('The stage has room for two subscriptions');

  const indexOf = new Map(projection.resources.map((r, i) => [r.id, i]));
  const index = (id: string): number => {
    const i = indexOf.get(id);
    if (i === undefined) throw new Error(`Resource ${id} is not in the projection`);
    return i;
  };

  const vm = projection.resources.find((r) => r.name === question.vmName);
  if (!vm || vm.type !== 'virtualMachine') throw new Error(`No VM named ${question.vmName}`);
  const nic = projection.resources[index(vm.nicId)];
  const pip = nic.type === 'networkInterface' && nic.publicIpId ? projection.resources[index(nic.publicIpId)] : undefined;
  if (!pip) throw new Error(`${question.vmName} has no public IP to follow`);
  const focusUnit = model.unitIdOf.get(vm.id);

  const groups: GroupCard[] = [];
  const subs: SubLabel[] = [];
  const glyphs: Glyph[] = [];
  const chips: Chip[] = [];
  const n = projection.resources.length;

  model.subscriptions.forEach((sub, s) => {
    if (sub.groups.length > 3) throw new Error('The stage has room for three groups per subscription');
    const rowY = LEFT.y + s * (ROW.label + ROW.labelGap + CARD_H + ROW.gap);
    subs.push({ name: sub.name, id: sub.id, groupCount: sub.groups.length, resourceCount: sub.resourceCount, x: LEFT.x, y: rowY, w: 220, h: ROW.label });
    sub.groups.forEach((group, c) => {
      const card: GroupCard = {
        name: group.name,
        subscriptionName: sub.name,
        count: group.resourceCount,
        location: group.location,
        x: LEFT.x + c * (CARD.w + CARD.gapX),
        y: rowY + ROW.label + ROW.labelGap,
        w: CARD.w,
        h: CARD_H,
        pods: []
      };
      if (group.units.length > CARD.rows * 3) throw new Error(`The stage has room for ${CARD.rows * 3} pods per group; ${group.name} has ${group.units.length}`);
      group.units.forEach((unit, k) => {
        const pod: PodFrame = {
          unitId: unit.id,
          kind: unit.kind,
          focus: unit.id === focusUnit,
          x: card.x + CARD.padX + (k % 3) * CARD.pitchX,
          y: card.y + CARD.pods + Math.floor(k / 3) * CARD.pitchY,
          w: CARD.podW,
          h: CARD.podH
        };
        card.pods.push(pod);
        for (const member of unit.members) {
          const i = index(member.id);
          const shape = POD_SHAPE[member.role];
          const zoom = unit.id === focusUnit ? zoomOf(member.role) : null;
          // The cell order is the projection's; the stagger follows it with a little noise so the fill looks poured, not printed.
          const delay = 0.82 * (i / Math.max(1, n - 1)) + 0.18 * hash01(i + 1);
          glyphs[i] = {
            id: member.id,
            index: i,
            name: member.name,
            type: member.type,
            role: member.role,
            color: TYPE_COLOR[member.type],
            groupName: group.name,
            unitId: unit.id,
            estate: { cx: pod.x + shape.cx, cy: pod.y + shape.cy, w: shape.w, h: shape.h, r: shape.r },
            zoom,
            cell: cellPose(i),
            delay,
            bend: (hash01(i * 7 + 3) - 0.5) * 120,
            focus: member.id === vm.id ? 'vm' : member.id === nic.id ? 'nic' : member.id === pip.id ? 'pip' : null
          };
        }
      });
      groups.push(card);
    });
  });

  // Chips: the estate's headings that become entries of `subscriptions` and `resourceGroups`.
  subs.forEach((sub, s) => {
    chips.push({
      key: `sub:${sub.id}`,
      kind: 'subscription',
      label: sub.name,
      from: { side: '' },
      to: { side: shortSubId(sub.id) },
      fromRect: { x: sub.x, y: sub.y + 1, w: 200, h: 20 },
      toRect: { x: GRID.x + s * 308, y: OBJ.subsChipY, w: 300, h: OBJ.chipH },
      delay: s * 0.1
    });
  });
  groups.forEach((g, i) => {
    chips.push({
      key: `group:${g.name}`,
      kind: 'group',
      label: g.name,
      from: { side: String(g.count) },
      to: { side: g.location },
      fromRect: { x: g.x + 6, y: g.y + 3, w: g.w - 12, h: 21 },
      toRect: { x: GRID.x + (i % 3) * 206, y: OBJ.groupsChipY + Math.floor(i / 3) * (OBJ.chipH + 6), w: 196, h: OBJ.chipH },
      delay: 0.2 + i * 0.09
    });
  });

  const podIndexes = glyphs.filter((g) => g.unitId === focusUnit).map((g) => g.index);

  return {
    groups,
    subs,
    glyphs,
    chips,
    records: recordCards(vm, nic, pip, index),
    focus: { vm: index(vm.id), nic: index(nic.id), pip: index(pip.id) },
    generatedAt: projection.generatedAt,
    counts: { subscriptions: projection.subscriptions.length, groups: projection.resourceGroups.length, resources: n },
    podIndexes
  };
}

/** `sub-7f3a9c20-prod` -> `sub-7f3a\u2026prod`: enough to see it is an id. */
export function shortSubId(id: string): string {
  const parts = id.split('-');
  return parts.length >= 3 ? `${parts[0]}-${parts[1].slice(0, 4)}\u2026${parts[parts.length - 1]}` : id;
}

// ── choreography ───────────────────────────────────────────────────────────

/** Step 1 (containers): when each chip sets off and lands, as a position in `t`. */
export function chipProgress(chip: Chip, t: number): number {
  const start = AT.estate + chip.delay * 0.6;
  return ease(seg(t, start, start + 0.45));
}

/** The pose of a chip at `t`. */
export function chipRect(chip: Chip, t: number): Rect {
  const u = chipProgress(chip, t);
  return { x: mix(chip.fromRect.x, chip.toRect.x, u), y: mix(chip.fromRect.y, chip.toRect.y, u), w: mix(chip.fromRect.w, chip.toRect.w, u), h: mix(chip.fromRect.h, chip.toRect.h, u) };
}

/** Where a glyph sets off to and lands, as a position in `t`, in the flatten step (2 -> 3). */
export function flightWindow(g: Glyph): [number, number] {
  const start = AT.links + g.delay * 0.4;
  return [start, start + 0.55];
}

/** 0..1: how far a glyph has travelled into its cell. */
export function landed(g: Glyph, t: number): number {
  const [a, b] = flightWindow(g);
  return ease(seg(t, a, b));
}

/** The number of resources that have landed in `data.resources` at `t` (a glyph counts once it is within the cell). */
export function landedCount(glyphs: Glyph[], t: number): number {
  let n = 0;
  for (const g of glyphs) if (seg(t, ...flightWindow(g)) >= 1) n += 1;
  return n;
}

/** The close-up of the question's pod (step 2): the glyphs lift out of their pods into their enlarged pose. */
export function zoomProgress(t: number): number {
  return ease(seg(t, AT.containers + 0.05, AT.containers + 0.85));
}

/** Where the flights pour in: just outside the object card's left edge, level with the array. */
export const GATE = { x: RIGHT.x - 16, y: OBJ.gridY + 28 } as const;

/** A point on the quadratic curve p0 -> k -> p2. */
function curve(p0x: number, p0y: number, kx: number, ky: number, p2x: number, p2y: number, u: number): [number, number] {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return [a * p0x + b * kx + c * p2x, a * p0y + b * ky + c * p2y];
}

/**
 * One flight: in from the side to the gate, then along the array into its cell. Both legs meet the gate level,
 * so the 194 flights read as one stream, and none of them crosses the headings above the array. The share of
 * the trip spent on each leg follows its length, so the speed does not jump at the gate. `bend` fans the
 * approaches out a little so the stream is not a single line.
 */
function flown(a: Pose, b: Pose, u: number, bend: number): Pose {
  const in1 = Math.hypot(GATE.x - a.cx, GATE.y - a.cy);
  const in2 = Math.hypot(b.cx - GATE.x, b.cy - GATE.y);
  const split = in1 / (in1 + in2 || 1);
  const [cx, cy] =
    u <= split
      ? curve(a.cx, a.cy, mix(a.cx, GATE.x, 0.5), GATE.y + bend * 0.4, GATE.x, GATE.y, split > 0 ? u / split : 1)
      : curve(GATE.x, GATE.y, mix(GATE.x, b.cx, 0.5), mix(GATE.y, b.cy, 0.3) + bend * 0.1, b.cx, b.cy, (u - split) / (1 - split));
  return { cx, cy, w: mix(a.w, b.w, u), h: mix(a.h, b.h, u), r: mix(a.r, b.r, u) };
}

/** Where a glyph is and what shape it has at `t`. */
export function poseAt(g: Glyph, t: number): Pose {
  if (g.zoom) {
    if (t <= AT.links) return mixPose(g.estate, g.zoom, zoomProgress(t));
    return flown(g.zoom, g.cell, landed(g, t), g.bend * 0.6);
  }
  return flown(g.estate, g.cell, landed(g, t), g.bend);
}

/**
 * Opacity of the estate's frames (group cards, pods): full, dimmed during the close-up, faint once every glyph
 * has left (an emptied picture), and gone when the tool description takes the left half.
 */
export function estateOpacity(t: number): number {
  const dimmed = 1 - 0.72 * ease(seg(t, AT.containers + 0.1, AT.containers + 0.8)) - 0.08 * ease(seg(t, AT.links + 0.25, AT.flatten));
  return dimmed * (1 - ease(seg(t, AT.flatten + 0.2, AT.contract)));
}

/** The dashed outline and tag that mark the question's pod, until its glyphs lift out. */
export function needleOpacity(t: number): number {
  return 1 - seg(t, AT.containers + 0.0, AT.containers + 0.3);
}

/** The close-up's captions and the dashed lines to the records. */
export function closeUpOpacity(t: number): number {
  return ease(seg(t, AT.containers + 0.45, AT.containers + 0.95)) * (1 - ease(seg(t, AT.links + 0.0, AT.links + 0.35)));
}

/** The record cards appearing beside the close-up. */
export function recordsOpacity(t: number): number {
  return ease(seg(t, AT.containers + 0.4, AT.containers + 0.85));
}
export function recordFieldsOpacity(t: number): number {
  return ease(seg(t, AT.containers + 0.7, AT.containers + 0.95));
}
/** The brackets that link a reference to the record it names (0..1 draws them; the second starts after the first). */
export function linkDraw(which: 'nic' | 'pip', t: number): number {
  const a = AT.containers + (which === 'nic' ? 0.75 : 0.85);
  return ease(seg(t, a, a + 0.15));
}

/** The tool description replacing the estate in the left zone. */
export function contractOpacity(t: number): number {
  return ease(seg(t, AT.flatten + 0.25, AT.contract)) * (1 - ease(seg(t, AT.contract + 0.1, AT.program - 0.05)));
}
/** The program panel, and each of its lines. */
export function programOpacity(t: number): number {
  return ease(seg(t, AT.contract + 0.3, AT.program));
}
export function programLineOpacity(line: number, t: number): number {
  return ease(seg(t, AT.contract + 0.35 + line * 0.025, AT.contract + 0.6 + line * 0.025));
}
/** The result card that comes back to the model. */
export function resultOpacity(t: number): number {
  return ease(seg(t, AT.ip + 0.25, AT.return - 0.05));
}

/** The scan of every id (step 6) and of names up to the VM (step 7), as a number of cells reached at `t`. */
export function indexSweep(count: number, t: number): number {
  return Math.round(count * ease(seg(t, AT.program + 0.05, AT.index - 0.1)));
}
export function findSweep(upTo: number, t: number): number {
  return Math.round((upTo + 1) * ease(seg(t, AT.index + 0.05, AT.find - 0.15)));
}

/** A 0..1 pulse for something the program has just reached in its step (rises, holds, never falls). */
export function reach(step: number, t: number, lead = 0.3): number {
  return ease(seg(t, step - 1 + lead, step - 0.1));
}
