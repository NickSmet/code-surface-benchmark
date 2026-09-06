/**
 * Projection = the plain-data view the CODE surface exposes to the agent.
 *
 * An allowlisted copy of the inventory. Only tags and VM powerState may be
 * changed; other edits are rejected before a diff is proposed. This is a
 * data contract, not containment for hostile code (the demo uses node:vm).
 */

import { INTERNAL_KEYS, type Inventory, type Resource, type ResourceGroup, type Subscription } from './types';

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type ProjectionResource = DistributiveOmit<Resource, (typeof INTERNAL_KEYS)[number]>;

export interface ProjectionView {
  generatedAt: string;
  subscriptions: Subscription[];
  resourceGroups: ResourceGroup[];
  resources: ProjectionResource[];
}

export function buildProjection(inv: Inventory): ProjectionView {
  return {
    generatedAt: inv.generatedAt,
    subscriptions: inv.subscriptions.map(({ id, name }) => ({ id, name })),
    resourceGroups: inv.resourceGroups.map(({ name, subscriptionId, location }) => ({ name, subscriptionId, location })),
    resources: inv.resources.map(projectResource)
  };
}

const BASE_FIELDS = ['id', 'name', 'type', 'location', 'resourceGroup', 'subscriptionId', 'tags', 'costMonthly', 'createdAt'];
const TYPE_FIELDS: Record<Resource['type'], string[]> = {
  virtualMachine: ['vmSize', 'osType', 'powerState', 'vcpus', 'memoryGb', 'lastActivityAt', 'nicId', 'osDiskId', 'dataDiskIds'],
  disk: ['diskSizeGb', 'diskSku', 'attachedToVmId'],
  networkInterface: ['privateIp', 'publicIpId', 'vnetName'],
  publicIp: ['ipAddress', 'allocationMethod', 'associatedToId'],
  storageAccount: ['storageTier', 'redundancy', 'usedGb', 'httpsOnly'],
  sqlDatabase: ['dbTier', 'maxSizeGb', 'dbStatus'],
  appService: ['runtime', 'appSku', 'httpsOnly', 'appState']
};

/** Shared by detailed catalog reads, so both surfaces expose the same fields. */
export function projectResource(resource: Resource): ProjectionResource {
  const source = resource as unknown as Record<string, unknown>;
  return Object.fromEntries(
    [...BASE_FIELDS, ...TYPE_FIELDS[resource.type]].map((key) => [key, structuredClone(source[key])])
  ) as unknown as ProjectionResource;
}

export const POWER_STATES = ['running', 'stopped', 'deallocated'];
export function validTagKey(key: string): boolean {
  return key.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(key);
}

// These checks enforce the JSON data contract for ordinary scripts. They do
// not harden the in-process VM against a malicious program.
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((k) => Object.hasOwn(right, k) && sameData(left[k], right[k]));
}

function validateTags(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('tags must be a string-to-string object');
  for (const [key, entry] of Object.entries(value)) {
    if (!validTagKey(key) || typeof entry !== 'string') throw new Error(`Invalid tag ${key}: keys must be supported and values must be strings`);
  }
}

export type ChangeOp = 'add' | 'edit' | 'remove';

export interface ChangeRow {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  field: string;
  op: ChangeOp;
  before: unknown;
  after: unknown;
}

function diffOne(before: Record<string, unknown>, after: Record<string, unknown>): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const meta = {
    resourceId: String(before.id),
    resourceName: String(before.name),
    resourceType: String(before.type)
  };

  if (!sameData(Object.keys(before).sort(), Object.keys(after).sort())) {
    throw new Error(`${meta.resourceName}: adding or removing resource fields is unsupported`);
  }
  validateTags(after.tags);
  for (const key of Object.keys(before)) {
    if (key === 'tags') continue;
    if (key === 'powerState' && before.type === 'virtualMachine') {
      if (typeof after[key] !== 'string' || !POWER_STATES.includes(after[key] as string)) throw new Error(`${meta.resourceName}: invalid powerState`);
    } else if (!sameData(before[key], after[key])) {
      throw new Error(`${meta.resourceName}: ${key} is read-only`);
    }
  }

  // Tags diffed key-by-key for readable rows (tags.env, tags.owner, ...).
  const beforeTags = (before.tags ?? {}) as Record<string, string>;
  const afterTags = (after.tags ?? {}) as Record<string, string>;
  const tagKeys = new Set([...Object.keys(beforeTags), ...Object.keys(afterTags)]);
  for (const k of tagKeys) {
    const b = beforeTags[k];
    const a = afterTags[k];
    if (b === a) continue;
    rows.push({
      ...meta,
      field: `tags.${k}`,
      op: b === undefined ? 'add' : a === undefined ? 'remove' : 'edit',
      before: b ?? null,
      after: a ?? null
    });
  }

  if (before.type === 'virtualMachine' && before.powerState !== after.powerState) {
    rows.push({ ...meta, field: 'powerState', op: 'edit', before: before.powerState, after: after.powerState });
  }
  return rows;
}

/** Field-level diff between two projections, keyed by resource id. */
export function diffProjection(before: ProjectionView, after: ProjectionView): ChangeRow[] {
  if (!after || !sameData(Object.keys(before).sort(), Object.keys(after).sort()) ||
      !sameData(before.generatedAt, after.generatedAt) || !sameData(before.subscriptions, after.subscriptions) ||
      !sameData(before.resourceGroups, after.resourceGroups)) {
    throw new Error('Snapshot metadata, subscriptions and resource groups are read-only');
  }
  if (!Array.isArray(after.resources) || after.resources.length !== before.resources.length) {
    throw new Error('Adding or removing resources is unsupported');
  }
  const beforeById = new Map(before.resources.map((r) => [(r as { id: string }).id, r as Record<string, unknown>]));
  const afterById = new Map(after.resources.map((r) => [(r as { id: string }).id, r as Record<string, unknown>]));
  if (afterById.size !== beforeById.size) throw new Error('Resource ids must remain unique and unchanged');

  const rows: ChangeRow[] = [];
  for (const [id, a] of afterById) {
    const b = beforeById.get(id);
    if (!b) {
      throw new Error('Resource ids must remain unchanged');
    }
    rows.push(...diffOne(b, a));
  }
  return rows;
}
