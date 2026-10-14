/** Small human-readable facts about a resource, for cards and tooltips. */

import type { Resource, ResourceType } from '$lib/inventory/types';
import type { MemberRole } from './estate';

export const TYPE_LABEL: Record<ResourceType, string> = {
  virtualMachine: 'Virtual machine',
  networkInterface: 'Network interface',
  publicIp: 'Public IP',
  disk: 'Disk',
  storageAccount: 'Storage account',
  sqlDatabase: 'SQL database',
  appService: 'App service'
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  vm: 'Virtual machine',
  nic: 'Network interface',
  pip: 'Public IP',
  osDisk: 'OS disk',
  dataDisk: 'Data disk',
  storage: 'Storage account',
  sql: 'SQL database',
  app: 'App service',
  other: 'Resource'
};

export function factOf(r: Resource): string {
  switch (r.type) {
    case 'virtualMachine':
      return `${r.vmSize} · ${r.vcpus} vCPU · ${r.memoryGb} GB · ${r.powerState}`;
    case 'networkInterface':
      return `${r.privateIp}${r.publicIpId ? ' → public IP' : ' · no public IP'}`;
    case 'publicIp':
      return `${r.ipAddress} · ${r.allocationMethod}`;
    case 'disk':
      return `${r.diskSizeGb} GB · ${r.diskSku}`;
    case 'storageAccount':
      return `${r.storageTier} · ${r.redundancy} · ${r.usedGb} GB used`;
    case 'sqlDatabase':
      return `${r.dbTier} · ${r.dbStatus}`;
    case 'appService':
      return `${r.runtime} · ${r.appState}`;
  }
}

export function tagSummary(r: Resource): string {
  const entries = Object.entries(r.tags);
  if (entries.length === 0) return 'no tags';
  return entries.map(([k, v]) => `${k}=${v}`).join(' · ');
}

export function daysIdle(r: Resource, snapshotMs: number): number | null {
  if (r.type !== 'virtualMachine') return null;
  return (snapshotMs - Date.parse(r.lastActivityAt)) / 86_400_000;
}
