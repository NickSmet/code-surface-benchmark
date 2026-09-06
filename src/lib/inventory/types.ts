/**
 * Deterministic mock cloud inventory with VM -> NIC -> public IP references.
 * Both surfaces expose an allowlisted projection. The write path separately
 * validates supported mutations; the demo's node:vm is not a security boundary.
 */

export type ResourceType =
  | 'virtualMachine'
  | 'disk'
  | 'networkInterface'
  | 'publicIp'
  | 'storageAccount'
  | 'sqlDatabase'
  | 'appService';

export type PowerState = 'running' | 'stopped' | 'deallocated';
export type Tags = Record<string, string>;

/** Fields shared by every resource. */
export interface ResourceBase {
  /** Full ARM-style id, e.g. /subscriptions/.../providers/Microsoft.Compute/virtualMachines/web-prod-03 */
  id: string;
  name: string;
  type: ResourceType;
  location: string;
  resourceGroup: string;
  subscriptionId: string;
  tags: Tags;
  /** Estimated USD/month for this resource. */
  costMonthly: number;
  createdAt: string;
  /** Internal-only — stripped by the code-surface projection. */
  _internalId: string;
  /** Internal-only — stripped by the code-surface projection. */
  _billingAccount: string;
}

export interface VirtualMachine extends ResourceBase {
  type: 'virtualMachine';
  vmSize: string;
  osType: 'Linux' | 'Windows';
  powerState: PowerState;
  vcpus: number;
  memoryGb: number;
  /** Last time the VM did meaningful work — drives "idle > N days". */
  lastActivityAt: string;
  nicId: string;
  osDiskId: string;
  dataDiskIds: string[];
}

export interface Disk extends ResourceBase {
  type: 'disk';
  diskSizeGb: number;
  diskSku: 'Standard_LRS' | 'StandardSSD_LRS' | 'Premium_LRS';
  attachedToVmId: string | null;
}

export interface NetworkInterface extends ResourceBase {
  type: 'networkInterface';
  privateIp: string;
  publicIpId: string | null;
  vnetName: string;
}

export interface PublicIp extends ResourceBase {
  type: 'publicIp';
  ipAddress: string;
  allocationMethod: 'Static' | 'Dynamic';
  associatedToId: string | null;
}

export interface StorageAccount extends ResourceBase {
  type: 'storageAccount';
  storageTier: 'Hot' | 'Cool';
  redundancy: 'LRS' | 'ZRS' | 'GRS';
  usedGb: number;
  httpsOnly: boolean;
}

export interface SqlDatabase extends ResourceBase {
  type: 'sqlDatabase';
  dbTier: string;
  maxSizeGb: number;
  dbStatus: 'Online' | 'Paused';
}

export interface AppService extends ResourceBase {
  type: 'appService';
  runtime: string;
  appSku: string;
  httpsOnly: boolean;
  appState: 'Running' | 'Stopped';
}

export type Resource =
  | VirtualMachine
  | Disk
  | NetworkInterface
  | PublicIp
  | StorageAccount
  | SqlDatabase
  | AppService;

export interface Subscription {
  id: string;
  name: string;
}

export interface ResourceGroup {
  name: string;
  subscriptionId: string;
  location: string;
}

export interface Inventory {
  generatedAt: string;
  subscriptions: Subscription[];
  resourceGroups: ResourceGroup[];
  resources: Resource[];
}

/** The internal-only keys the projection removes before the agent sees data. */
export const INTERNAL_KEYS = ['_internalId', '_billingAccount'] as const;
