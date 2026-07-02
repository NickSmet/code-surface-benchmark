/**
 * Projection = the plain-data view the CODE surface exposes to the agent.
 *
 * It is a deep clone of the inventory with the internal-only fields removed
 * (`_internalId`, `_billingAccount`). The agent mutates this clone; we diff
 * it against a fresh projection of the original to derive a reviewable
 * change set — the agent never touches the canonical store, and literally
 * cannot read or write fields the projection drops.
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
  const clone = structuredClone(inv);
  for (const r of clone.resources as unknown as Record<string, unknown>[]) {
    for (const k of INTERNAL_KEYS) delete r[k];
    if (r.tags && typeof r.tags === 'object') r.tags = { ...(r.tags as Record<string, string>) };
  }
  return {
    generatedAt: clone.generatedAt,
    subscriptions: clone.subscriptions,
    resourceGroups: clone.resourceGroups,
    resources: clone.resources as ProjectionResource[]
  };
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

const IDENTITY_KEYS = new Set(['id', 'name', 'type', 'resourceGroup', 'subscriptionId', 'createdAt']);

function diffOne(before: Record<string, unknown>, after: Record<string, unknown>): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const meta = {
    resourceId: String(after.id ?? before.id),
    resourceName: String(after.name ?? before.name),
    resourceType: String(after.type ?? before.type)
  };

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

  // Scalar fields (everything else that's a primitive and not identity/tags).
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (k === 'tags' || IDENTITY_KEYS.has(k)) continue;
    const b = before[k];
    const a = after[k];
    if (typeof a === 'object' || typeof b === 'object') continue; // skip arrays/objects/refs
    if (b === a) continue;
    rows.push({ ...meta, field: k, op: 'edit', before: b ?? null, after: a ?? null });
  }
  return rows;
}

/** Field-level diff between two projections, keyed by resource id. */
export function diffProjection(before: ProjectionView, after: ProjectionView): ChangeRow[] {
  const beforeById = new Map(before.resources.map((r) => [(r as { id: string }).id, r as Record<string, unknown>]));
  const afterById = new Map(after.resources.map((r) => [(r as { id: string }).id, r as Record<string, unknown>]));

  const rows: ChangeRow[] = [];
  for (const [id, a] of afterById) {
    const b = beforeById.get(id);
    if (!b) {
      rows.push({
        resourceId: id,
        resourceName: String(a.name),
        resourceType: String(a.type),
        field: '(resource)',
        op: 'add',
        before: null,
        after: a.name
      });
      continue;
    }
    rows.push(...diffOne(b, a));
  }
  for (const [id, b] of beforeById) {
    if (!afterById.has(id)) {
      rows.push({
        resourceId: id,
        resourceName: String(b.name),
        resourceType: String(b.type),
        field: '(resource)',
        op: 'remove',
        before: b.name,
        after: null
      });
    }
  }
  return rows;
}
