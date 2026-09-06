/**
 * In-process implementations of the catalogue's granular tools, over the
 * run's copy of the estate. A deliberately simple catalogue: `list_*` return compact summaries, `get_resource` returns full
 * detail, writes are single-resource. The cost falls out of the shape:
 * multi-hop reads need several `get_resource` round trips, and bulk writes
 * need one call per resource.
 *
 * Writes return the change set as a diff; the agent loop applies it to the
 * run's estate copy (immediately, or once the reviewer approves). Each run
 * gets a fresh copy, so runs stay reproducible.
 */

import type { ChangeRow } from '$lib/inventory/projection';
import { type Inventory, type Resource, type VirtualMachine } from '$lib/inventory/types';
import { projectResource } from '$lib/inventory/projection';

function subNameById(inv: Inventory, id: string): string {
  return inv.subscriptions.find((s) => s.id === id)?.name ?? id;
}
function subIdByName(inv: Inventory, name: string): string | null {
  const s = inv.subscriptions.find((x) => x.name.toLowerCase() === name.toLowerCase() || x.id === name);
  return s?.id ?? null;
}

function stripInternal(r: Resource): Record<string, unknown> {
  return projectResource(r) as unknown as Record<string, unknown>;
}

export interface ResourceSummary {
  name: string;
  type: string;
  resourceGroup: string;
  subscription: string;
  location: string;
  costMonthly: number;
  tagCount: number;
  powerState?: string;
  vmSize?: string;
  lastActivityAt?: string;
}

function summaryOf(inv: Inventory, r: Resource): ResourceSummary {
  const base: ResourceSummary = {
    name: r.name,
    type: r.type,
    resourceGroup: r.resourceGroup,
    subscription: subNameById(inv, r.subscriptionId),
    location: r.location,
    costMonthly: r.costMonthly,
    tagCount: Object.keys(r.tags).length
  };
  if (r.type === 'virtualMachine') {
    base.powerState = r.powerState;
    base.vmSize = r.vmSize;
    base.lastActivityAt = r.lastActivityAt;
  }
  return base;
}

export function listSubscriptions(inv: Inventory): Array<{ id: string; name: string }> {
  return inv.subscriptions.map((s) => ({ id: s.id, name: s.name }));
}

export function listResourceGroups(
  inv: Inventory,
  args: { subscriptionName?: string }
): Array<{
  name: string;
  location: string;
  subscription: string;
}> {
  const subId = args.subscriptionName ? subIdByName(inv, args.subscriptionName) : null;
  return inv.resourceGroups
    .filter((g) => (subId ? g.subscriptionId === subId : true))
    .map((g) => ({ name: g.name, location: g.location, subscription: subNameById(inv, g.subscriptionId) }));
}

export function listResources(
  inv: Inventory,
  args: {
    type?: string;
    resourceGroup?: string;
    subscriptionName?: string;
  }
): { count: number; resources: ResourceSummary[] } {
  const subId = args.subscriptionName ? subIdByName(inv, args.subscriptionName) : null;
  const out = inv.resources.filter(
    (r) =>
      (args.type ? r.type === args.type : true) &&
      (args.resourceGroup ? r.resourceGroup === args.resourceGroup : true) &&
      (subId ? r.subscriptionId === subId : true)
  );
  return { count: out.length, resources: out.map((r) => summaryOf(inv, r)) };
}

export function getResource(inv: Inventory, args: { name?: string; id?: string }): Record<string, unknown> | { error: string } {
  const r =
    (args.id ? inv.resources.find((x) => x.id === args.id) : undefined) ??
    (args.name ? inv.resources.find((x) => x.name === args.name) : undefined);
  if (!r) return { error: `No resource found for ${JSON.stringify(args)}` };
  return stripInternal(r);
}

export function updateResourceTags(
  inv: Inventory,
  args: { name?: string; tags?: Record<string, string> }
): {
  content: Record<string, unknown>;
  diff: ChangeRow[];
} {
  const r = args.name ? inv.resources.find((x) => x.name === args.name) : undefined;
  if (!r) return { content: { error: `No resource named ${args.name}` }, diff: [] };
  const add = args.tags ?? {};
  const diff: ChangeRow[] = [];
  for (const [k, v] of Object.entries(add)) {
    const before = r.tags[k];
    if (before === v) continue;
    diff.push({
      resourceId: r.id,
      resourceName: r.name,
      resourceType: r.type,
      field: `tags.${k}`,
      op: before === undefined ? 'add' : 'edit',
      before: before ?? null,
      after: v
    });
  }
  return {
    content: { ok: true, name: r.name, tags: { ...r.tags, ...add }, status: 'applied' },
    diff
  };
}

export function setPowerState(
  inv: Inventory,
  args: { name?: string; state?: string }
): {
  content: Record<string, unknown>;
  diff: ChangeRow[];
} {
  const r = args.name ? inv.resources.find((x) => x.name === args.name) : undefined;
  if (!r) return { content: { error: `No resource named ${args.name}` }, diff: [] };
  if (r.type !== 'virtualMachine') return { content: { error: `${args.name} is not a virtual machine` }, diff: [] };
  const vm = r as VirtualMachine;
  const next = String(args.state ?? '');
  if (!['running', 'stopped', 'deallocated'].includes(next)) {
    return { content: { error: `Invalid state '${next}' (use running|stopped|deallocated)` }, diff: [] };
  }
  const diff: ChangeRow[] =
    vm.powerState === next
      ? []
      : [
          {
            resourceId: vm.id,
            resourceName: vm.name,
            resourceType: vm.type,
            field: 'powerState',
            op: 'edit',
            before: vm.powerState,
            after: next
          }
        ];
  return { content: { ok: true, name: vm.name, powerState: next, status: 'applied' }, diff };
}
