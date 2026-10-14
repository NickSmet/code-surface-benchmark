/**
 * The estate as a drawing model.
 *
 * The inventory is a flat list of 194 resources that point at each other
 * (VM → NIC → public IP, VM → disks). To *show* it we fold each VM together
 * with the things hanging off it into one "pod", and keep storage accounts,
 * SQL databases and app services as loose single cells. Every resource lands
 * in exactly one unit, so per-resource touch state can be painted per cell.
 */

import type { Inventory, Resource, ResourceType } from '$lib/inventory/types';

export type MemberRole = 'vm' | 'nic' | 'pip' | 'osDisk' | 'dataDisk' | 'storage' | 'sql' | 'app' | 'other';
export type UnitKind = 'vm' | 'storage' | 'sql' | 'app' | 'other';

export interface EstateMember {
  id: string;
  name: string;
  type: ResourceType;
  role: MemberRole;
}

export interface EstateUnit {
  /** Id of the head resource (the VM, or the loose resource itself). */
  id: string;
  kind: UnitKind;
  name: string;
  groupName: string;
  /** Head first, then NIC, public IP, OS disk, data disks. */
  members: EstateMember[];
}

export interface EstateGroup {
  name: string;
  subscriptionId: string;
  subscriptionName: string;
  location: string;
  units: EstateUnit[];
  resourceCount: number;
  costMonthly: number;
}

export interface EstateSubscription {
  id: string;
  name: string;
  groups: EstateGroup[];
  resourceCount: number;
  costMonthly: number;
}

export interface EstateModel {
  subscriptions: EstateSubscription[];
  groups: EstateGroup[];
  units: EstateUnit[];
  unitById: Map<string, EstateUnit>;
  /** resource id → id of the unit it is drawn in. */
  unitIdOf: Map<string, string>;
  resourceById: Map<string, Resource>;
  resourceIdByName: Map<string, string>;
  totals: {
    resources: number;
    units: number;
    vms: number;
    groups: number;
    subscriptions: number;
    costMonthly: number;
  };
}

const LOOSE_ROLE: Record<Exclude<UnitKind, 'vm'>, MemberRole> = {
  storage: 'storage',
  sql: 'sql',
  app: 'app',
  other: 'other'
};

const LOOSE_ORDER: UnitKind[] = ['vm', 'storage', 'sql', 'app', 'other'];

export function buildEstateModel(inv: Inventory): EstateModel {
  const resourceById = new Map(inv.resources.map((r) => [r.id, r]));
  const resourceIdByName = new Map(inv.resources.map((r) => [r.name, r.id]));
  const claimed = new Set<string>();
  const unitsByGroup = new Map<string, EstateUnit[]>();

  const place = (unit: EstateUnit): void => {
    const list = unitsByGroup.get(unit.groupName);
    if (list) list.push(unit);
    else unitsByGroup.set(unit.groupName, [unit]);
  };

  // Pass 1 — every VM pulls in the resources it references.
  for (const vm of inv.resources) {
    if (vm.type !== 'virtualMachine') continue;
    const members: EstateMember[] = [];
    const take = (res: Resource | undefined, role: MemberRole): void => {
      if (!res || claimed.has(res.id)) return;
      claimed.add(res.id);
      members.push({ id: res.id, name: res.name, type: res.type, role });
    };
    take(vm, 'vm');
    const nic = resourceById.get(vm.nicId);
    take(nic, 'nic');
    if (nic?.type === 'networkInterface' && nic.publicIpId) take(resourceById.get(nic.publicIpId), 'pip');
    take(resourceById.get(vm.osDiskId), 'osDisk');
    for (const id of vm.dataDiskIds) take(resourceById.get(id), 'dataDisk');
    place({ id: vm.id, kind: 'vm', name: vm.name, groupName: vm.resourceGroup, members });
  }

  // Pass 2 — whatever is left is drawn as a loose cell.
  for (const r of inv.resources) {
    if (claimed.has(r.id)) continue;
    claimed.add(r.id);
    const kind: UnitKind =
      r.type === 'storageAccount' ? 'storage' : r.type === 'sqlDatabase' ? 'sql' : r.type === 'appService' ? 'app' : 'other';
    place({
      id: r.id,
      kind,
      name: r.name,
      groupName: r.resourceGroup,
      members: [{ id: r.id, name: r.name, type: r.type, role: LOOSE_ROLE[kind as Exclude<UnitKind, 'vm'>] }]
    });
  }

  const subName = new Map(inv.subscriptions.map((s) => [s.id, s.name]));
  const cost = (members: EstateMember[]): number =>
    members.reduce((n, m) => n + (resourceById.get(m.id)?.costMonthly ?? 0), 0);

  const groups: EstateGroup[] = inv.resourceGroups.map((g) => {
    const units = (unitsByGroup.get(g.name) ?? []).slice().sort((a, b) => LOOSE_ORDER.indexOf(a.kind) - LOOSE_ORDER.indexOf(b.kind));
    return {
      name: g.name,
      subscriptionId: g.subscriptionId,
      subscriptionName: subName.get(g.subscriptionId) ?? g.subscriptionId,
      location: g.location,
      units,
      resourceCount: units.reduce((n, u) => n + u.members.length, 0),
      costMonthly: units.reduce((n, u) => n + cost(u.members), 0)
    };
  });

  const subscriptions: EstateSubscription[] = inv.subscriptions.map((s) => {
    const own = groups.filter((g) => g.subscriptionId === s.id);
    return {
      id: s.id,
      name: s.name,
      groups: own,
      resourceCount: own.reduce((n, g) => n + g.resourceCount, 0),
      costMonthly: own.reduce((n, g) => n + g.costMonthly, 0)
    };
  });

  const units = groups.flatMap((g) => g.units);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const unitIdOf = new Map<string, string>();
  for (const u of units) for (const m of u.members) unitIdOf.set(m.id, u.id);

  return {
    subscriptions,
    groups,
    units,
    unitById,
    unitIdOf,
    resourceById,
    resourceIdByName,
    totals: {
      resources: inv.resources.length,
      units: units.length,
      vms: units.filter((u) => u.kind === 'vm').length,
      groups: groups.length,
      subscriptions: subscriptions.length,
      costMonthly: inv.resources.reduce((n, r) => n + r.costMonthly, 0)
    }
  };
}
