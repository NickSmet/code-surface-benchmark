import type { ChangeRow } from './projection';
import type { Inventory, Resource } from './types';
import type { ToolTraceMode, ToolTraceResource } from '$lib/surfaces/types';

export interface InventoryResourceTile {
  id: string;
  name: string;
  type: string;
  resourceGroup: string;
  subscriptionId: string;
  /** For NICs, public IPs and disks: the VM they hang off (drives the sidebar's VM-nested view). */
  parentVmId?: string | null;
  /** Display extras for the estate visualisation (only set by inventoryOverview). */
  powerState?: string;
  costMonthly?: number;
  detail?: string;
}

export interface InventoryGroupTile {
  name: string;
  subscriptionId: string;
  subscriptionName: string;
  location: string;
}

export interface InventoryOverview {
  resourceGroups: InventoryGroupTile[];
  resources: InventoryResourceTile[];
}

function subName(inv: Inventory, id: string): string {
  return inv.subscriptions.find((s) => s.id === id)?.name ?? id;
}

export function toResourceTile(r: Resource): InventoryResourceTile {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    resourceGroup: r.resourceGroup,
    subscriptionId: r.subscriptionId
  };
}

/** nicId → owning VM id, so NICs and public IPs can be nested under their VM. */
function vmByNicMap(inv: Inventory): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of inv.resources) {
    if (r.type === 'virtualMachine') map.set(r.nicId, r.id);
  }
  return map;
}

function parentVmId(r: Resource, vmByNic: Map<string, string>): string | null {
  if (r.type === 'disk') return r.attachedToVmId;
  if (r.type === 'networkInterface') return vmByNic.get(r.id) ?? null;
  if (r.type === 'publicIp') return r.associatedToId ? (vmByNic.get(r.associatedToId) ?? null) : null;
  return null;
}

function resourceDetail(r: Resource): string {
  switch (r.type) {
    case 'virtualMachine':
      return `${r.vmSize} · ${r.vcpus} vCPU / ${r.memoryGb} GB`;
    case 'disk':
      return `${r.diskSizeGb} GB ${r.diskSku}`;
    case 'networkInterface':
      return r.privateIp;
    case 'publicIp':
      return r.ipAddress;
    case 'storageAccount':
      return `${r.storageTier} · ${r.redundancy} · ${r.usedGb} GB`;
    case 'sqlDatabase':
      return `${r.dbTier} · ${r.dbStatus}`;
    case 'appService':
      return `${r.runtime} · ${r.appState}`;
  }
}

export function inventoryOverview(inv: Inventory): InventoryOverview {
  const vmByNic = vmByNicMap(inv);
  return {
    resourceGroups: inv.resourceGroups.map((g) => ({
      name: g.name,
      subscriptionId: g.subscriptionId,
      subscriptionName: subName(inv, g.subscriptionId),
      location: g.location
    })),
    resources: inv.resources.map((r) => ({
      ...toResourceTile(r),
      parentVmId: parentVmId(r, vmByNic),
      powerState: r.type === 'virtualMachine' ? r.powerState : undefined,
      costMonthly: r.costMonthly,
      detail: resourceDetail(r)
    }))
  };
}

export function traceResource(r: Resource, mode: ToolTraceMode, via: string): ToolTraceResource {
  return { ...toResourceTile(r), mode, via };
}

export function traceResources(resources: Resource[], mode: ToolTraceMode, via: string): ToolTraceResource[] {
  return resources.map((r) => traceResource(r, mode, via));
}

export function traceDiffResources(inv: Inventory, diff: ChangeRow[], via: string): ToolTraceResource[] {
  const byId = new Map(inv.resources.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const out: ToolTraceResource[] = [];

  for (const row of diff) {
    if (seen.has(row.resourceId)) continue;
    seen.add(row.resourceId);
    const resource = byId.get(row.resourceId);
    if (resource) {
      out.push(traceResource(resource, 'write', via));
    } else {
      out.push({
        id: row.resourceId,
        name: row.resourceName,
        type: row.resourceType,
        resourceGroup: '',
        mode: 'write',
        via
      });
    }
  }

  return out;
}
