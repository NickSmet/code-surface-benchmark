/**
 * `ctx` helpers exposed inside the sandbox, plus the projection contract that
 * is embedded directly in the single code tool's description.
 */

import type { ProjectionView } from '$lib/inventory/projection';

export function preview(value: unknown, maxLen = 200): string {
  const s = typeof value === 'string' ? value : value == null ? '' : safeStringify(value);
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '…';
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** Build the ctx bound into the sandbox for one run. */
export function makeCtx(data: ProjectionView): Record<string, unknown> {
  const now = new Date(data.generatedAt).getTime();
  return {
    preview,
    /** Snapshot time as ISO. Reason about age/idleness relative to this. */
    now: () => data.generatedAt,
    /** Whole days between an ISO timestamp and the snapshot time. */
    daysSince: (iso: string) => (now - new Date(iso).getTime()) / 86_400_000
  };
}

export const SCHEMA_DOC = `
// data - the inventory projection. Plain objects and arrays. No SDK, no
// wrappers; internal fields (_internalId, _billingAccount) are not present.
//
// type Projection = {
//   generatedAt: string;                 // snapshot time (ISO). Use ctx.now() / ctx.daysSince(iso).
//   subscriptions: { id: string; name: string }[];
//   resourceGroups: { name: string; subscriptionId: string; location: string }[];
//   resources: Resource[];               // ALL resources, flat. Filter/group with normal JS.
// };
//
// Every Resource has: id, name, type, location, resourceGroup, subscriptionId,
//   tags (Record<string,string>), costMonthly (number, USD/mo), createdAt (ISO).
// type is one of:
//   'virtualMachine' | 'disk' | 'networkInterface' | 'publicIp'
//   | 'storageAccount' | 'sqlDatabase' | 'appService'
//
// Type-specific fields:
//   virtualMachine:   vmSize, osType('Linux'|'Windows'), powerState('running'|'stopped'|'deallocated'),
//                     vcpus, memoryGb, lastActivityAt(ISO), nicId, osDiskId, dataDiskIds[]
//   disk:             diskSizeGb, diskSku, attachedToVmId(string|null)
//   networkInterface: privateIp, publicIpId(string|null), vnetName
//   publicIp:         ipAddress, allocationMethod('Static'|'Dynamic'), associatedToId(string|null)
//   storageAccount:   storageTier('Hot'|'Cool'), redundancy('LRS'|'ZRS'|'GRS'), usedGb, httpsOnly
//   sqlDatabase:      dbTier, maxSizeGb, dbStatus('Online'|'Paused')
//   appService:       runtime, appSku, httpsOnly, appState('Running'|'Stopped')
//
// References are by id. To get a VM's public IP, follow vm.nicId -> nic.publicIpId -> publicIp.ipAddress:
//   const byId = new Map(data.resources.map(r => [r.id, r]));
//   const vm  = data.resources.find(r => r.name === 'web-prod-03');
//   const nic = byId.get(vm.nicId);
//   const pip = nic && nic.publicIpId ? byId.get(nic.publicIpId) : null;
//   return { powerState: vm.powerState, publicIp: pip ? pip.ipAddress : null };
//
// operate_inventory contract:
// - Define function main(data, ctx).
// - Return any JSON-serialisable value to answer a read question.
// - Mutate data in place to make changes. The runtime diffs your mutated
//   projection against the original, derives the change set, and applies it
//   (a reviewer may hold it for approval first).
// - A script may both mutate data and return a summary.
// - Only tags (string values) and virtualMachine.powerState are writable.
//   Other fields, snapshot metadata and resource membership are read-only;
//   unsupported edits reject the entire proposal.
// - To deallocate a VM, set r.powerState = 'deallocated' on matching VMs
//   that are not already deallocated.
//
// Read example:
//   function main(data) {
//     return data.resources.filter(r => r.type === 'virtualMachine' && r.powerState === 'running').length;
//   }
//
// Write example:
//   function main(data) {
//     for (const r of data.resources) {
//       if (r.resourceGroup === 'app-staging' && Object.keys(r.tags).length === 0) {
//         r.tags.env = 'staging'; r.tags.owner = 'app-team';
//       }
//     }
//   }
//
// ctx.now() -> snapshot ISO;  ctx.daysSince(iso) -> days;  ctx.preview(v).
`.trim();
