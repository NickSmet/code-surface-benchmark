/**
 * Lenses: the same 194 resources, coloured to answer different questions.
 * Each lens is a small function from a resource to a colour plus a legend,
 * so "the estate can be represented in many ways" is something you can flip
 * through rather than read about.
 */

import type { Inventory, Resource, ResourceType } from '$lib/inventory/types';
import { TYPE_LABEL, daysIdle } from './facts';
import { fmtInt } from '$lib/utils';

export type LensId = 'type' | 'power' | 'cost' | 'idle' | 'tags';

export interface LegendItem {
  key: string;
  label: string;
  /** Compact label for chips. Falls back to `label`. */
  short?: string;
  color: string;
  count: number;
}

export interface LensCell {
  fill?: string;
  /** Matches a legend item `key` (or 'na' when the lens does not apply). */
  key: string;
}

export interface Lens {
  id: LensId;
  label: string;
  /** The question this view is good for answering. */
  question: string;
  cell(r: Resource): LensCell;
  legend: LegendItem[];
  /** One sentence about what this view reveals, computed from the data. */
  insight: string;
}

const TYPE_SHORT: Record<ResourceType, string> = {
  virtualMachine: 'VM',
  networkInterface: 'NIC',
  publicIp: 'Public IP',
  disk: 'Disk',
  storageAccount: 'Storage',
  sqlDatabase: 'SQL',
  appService: 'App service'
};

/**
 * One colour per kind. Disks are a deliberately dark slate: a greyed-out VM
 * (faded, deallocated, untouched) is a pale grey square, and a disk must never
 * be mistaken for one.
 */
export const TYPE_COLOR: Record<ResourceType, string> = {
  virtualMachine: '#334155',
  networkInterface: '#38BDF8',
  publicIp: '#F59E0B',
  disk: '#64748B',
  storageAccount: '#D946EF',
  sqlDatabase: '#F97316',
  appService: '#84CC16'
};

const usd = (n: number): string => '$' + fmtInt(n);

function tally<T>(items: T[], keyOf: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(keyOf(it), (m.get(keyOf(it)) ?? 0) + 1);
  return m;
}

export function buildLenses(inv: Inventory): Record<LensId, Lens> {
  const snapshotMs = Date.parse(inv.generatedAt);
  const rs = inv.resources;
  const vms = rs.filter((r) => r.type === 'virtualMachine');

  // ── type ────────────────────────────────────────────────────────
  const typeCounts = tally(rs, (r) => r.type);
  const type: Lens = {
    id: 'type',
    label: 'Type',
    question: 'What kinds of things are in here?',
    cell: (r) => ({ fill: TYPE_COLOR[r.type], key: r.type }),
    legend: (Object.keys(TYPE_COLOR) as ResourceType[]).map((t) => ({
      key: t,
      label: TYPE_LABEL[t],
      short: TYPE_SHORT[t],
      color: TYPE_COLOR[t],
      count: typeCounts.get(t) ?? 0
    })),
    insight: `${typeCounts.size} kinds of resource, and they point at each other: every VM drags a NIC, a disk or two and sometimes a public IP along with it.`
  };

  // ── power state ─────────────────────────────────────────────────
  const POWER = { on: '#10B981', paused: '#F59E0B', off: '#94A3B8' };
  const powerKey = (r: Resource): string | null => {
    if (r.type === 'virtualMachine') return r.powerState === 'running' ? 'on' : r.powerState === 'stopped' ? 'paused' : 'off';
    if (r.type === 'appService') return r.appState === 'Running' ? 'on' : 'paused';
    if (r.type === 'sqlDatabase') return r.dbStatus === 'Online' ? 'on' : 'paused';
    return null;
  };
  const powerCounts = tally(rs, (r) => powerKey(r) ?? 'na');
  const running = vms.filter((v) => v.type === 'virtualMachine' && v.powerState === 'running').length;
  const stopped = vms.filter((v) => v.type === 'virtualMachine' && v.powerState === 'stopped').length;
  const power: Lens = {
    id: 'power',
    label: 'Power',
    question: 'What is switched on?',
    cell: (r) => {
      const k = powerKey(r);
      return k ? { fill: POWER[k as keyof typeof POWER], key: k } : { key: 'na' };
    },
    legend: [
      { key: 'on', label: 'Running / online', color: POWER.on, count: powerCounts.get('on') ?? 0 },
      { key: 'paused', label: 'Stopped / paused', color: POWER.paused, count: powerCounts.get('paused') ?? 0 },
      { key: 'off', label: 'Deallocated', color: POWER.off, count: powerCounts.get('off') ?? 0 },
      { key: 'na', label: 'No power state', color: '#E2E8F0', count: powerCounts.get('na') ?? 0 }
    ],
    insight: `${running} of ${vms.length} VMs are running and ${stopped} are stopped. Disks, NICs and IPs have no power state at all, so this view only ever paints part of the estate.`
  };

  // ── cost ────────────────────────────────────────────────────────
  const BINS = [
    { key: 'c0', max: 10, label: 'under $10', color: '#E3EAF6' },
    { key: 'c1', max: 50, label: '$10 – 50', color: '#B9CAEB' },
    { key: 'c2', max: 200, label: '$50 – 200', color: '#7C9CDB' },
    { key: 'c3', max: 600, label: '$200 – 600', color: '#3F67C4' },
    { key: 'c4', max: Infinity, label: '$600 and up', color: '#1B3A8C' }
  ];
  const binOf = (n: number) => BINS.find((b) => n < b.max) ?? BINS[BINS.length - 1];
  const costCounts = tally(rs, (r) => binOf(r.costMonthly).key);
  const sorted = rs.slice().sort((a, b) => b.costMonthly - a.costMonthly);
  const total = rs.reduce((n, r) => n + r.costMonthly, 0);
  const top = sorted.slice(0, 10).reduce((n, r) => n + r.costMonthly, 0);
  const cost: Lens = {
    id: 'cost',
    label: 'Cost',
    question: 'Where does the money go?',
    cell: (r) => {
      const b = binOf(r.costMonthly);
      return { fill: b.color, key: b.key };
    },
    legend: BINS.map((b) => ({ key: b.key, label: b.label, color: b.color, count: costCounts.get(b.key) ?? 0 })),
    insight: `The 10 most expensive resources are ${Math.round((top / total) * 100)}% of the ${usd(total)} monthly bill. Most of the estate is small change.`
  };

  // ── idle ────────────────────────────────────────────────────────
  const IDLE = { fresh: '#86EFAC', recent: '#FCD34D', idle: '#EF4444', off: '#CBD5E1' };
  const idleKey = (r: Resource): string | null => {
    const d = daysIdle(r, snapshotMs);
    if (d === null || r.type !== 'virtualMachine') return null;
    if (r.powerState === 'deallocated') return 'off';
    return d > 30 ? 'idle' : d > 7 ? 'recent' : 'fresh';
  };
  const idleCounts = tally(rs, (r) => idleKey(r) ?? 'na');
  const idleNames = vms.filter((r) => idleKey(r) === 'idle').map((r) => r.name);
  const idle: Lens = {
    id: 'idle',
    label: 'Idle',
    question: 'What is going unused?',
    cell: (r) => {
      const k = idleKey(r);
      return k ? { fill: IDLE[k as keyof typeof IDLE], key: k } : { key: 'na' };
    },
    legend: [
      { key: 'fresh', label: 'Active in last 7 days', short: 'Active, 7 days', color: IDLE.fresh, count: idleCounts.get('fresh') ?? 0 },
      { key: 'recent', label: '8 – 30 days ago', short: '8 – 30 days', color: IDLE.recent, count: idleCounts.get('recent') ?? 0 },
      { key: 'idle', label: 'Idle over 30 days, still allocated', short: 'Idle 30+ days, allocated', color: IDLE.idle, count: idleCounts.get('idle') ?? 0 },
      { key: 'off', label: 'Already deallocated', short: 'Deallocated', color: IDLE.off, count: idleCounts.get('off') ?? 0 },
      { key: 'na', label: 'Not a VM', color: '#E2E8F0', count: idleCounts.get('na') ?? 0 }
    ],
    insight: idleNames.length
      ? `${idleNames.length} VMs have been idle for over 30 days and are still allocated: ${idleNames.join(', ')}. Spread across the estate, they are hard to spot in a list.`
      : 'No VM has been idle for over 30 days.'
  };

  // ── tags ────────────────────────────────────────────────────────
  const TAG = { none: '#F97316', some: '#CBD5E1' };
  const untagged = rs.filter((r) => Object.keys(r.tags).length === 0);
  const perGroup = tally(untagged, (r) => r.resourceGroup);
  const worst = [...perGroup].sort((a, b) => b[1] - a[1])[0];
  const worstTotal = worst ? rs.filter((r) => r.resourceGroup === worst[0]).length : 0;
  const tags: Lens = {
    id: 'tags',
    label: 'Tags',
    question: 'What is unlabelled?',
    cell: (r) => (Object.keys(r.tags).length === 0 ? { fill: TAG.none, key: 'none' } : { fill: TAG.some, key: 'some' }),
    legend: [
      { key: 'none', label: 'No tags at all', color: TAG.none, count: untagged.length },
      { key: 'some', label: 'Has tags', color: TAG.some, count: rs.length - untagged.length }
    ],
    insight: worst
      ? `${untagged.length} resources have no tags, ${worst[1]} of them in ${worst[0]} (${worst[1]} of its ${worstTotal}). A tagging gap is a whole-estate property, not something you find one resource at a time.`
      : 'Every resource is tagged.'
  };

  return { type, power, cost, idle, tags };
}

export const LENS_ORDER: LensId[] = ['type', 'power', 'cost', 'idle', 'tags'];
