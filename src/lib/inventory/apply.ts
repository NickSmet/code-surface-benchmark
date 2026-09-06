/**
 * Applies a derived change set to a run's copy of the estate. Both surfaces
 * express writes as `ChangeRow[]` (the catalog per tool call, the code
 * surface per run); the agent loop applies them here — immediately in direct
 * mode, or after the reviewer approves in review mode.
 */

import { POWER_STATES, validTagKey, type ChangeRow } from './projection';
import type { Inventory } from './types';

export function applyChangeRows(inv: Inventory, rows: ChangeRow[]): void {
  const byId = new Map(inv.resources.map((r) => [r.id, r]));
  const seen = new Set<string>();
  // Validate the entire proposal before touching the mock estate. This is
  // local validation, not a transaction across real cloud services.
  for (const row of rows) {
    const r = byId.get(row.resourceId);
    if (!r || r.name !== row.resourceName || r.type !== row.resourceType) throw new Error('Unknown or mismatched write target');
    const key = JSON.stringify([row.resourceId, row.field]);
    if (seen.has(key)) throw new Error('Duplicate field in change set');
    seen.add(key);
    if (row.field.startsWith('tags.')) {
      const tag = row.field.slice('tags.'.length);
      if (!validTagKey(tag) || (row.after !== null && typeof row.after !== 'string')) throw new Error('Invalid tag change');
      const current = Object.hasOwn(r.tags, tag) ? r.tags[tag] : null;
      const expectedOp = current === null ? 'add' : row.after === null ? 'remove' : 'edit';
      if (row.before !== current || row.op !== expectedOp || current === row.after) throw new Error('Stale or invalid tag change');
    } else if (row.field === 'powerState' && r.type === 'virtualMachine') {
      if (row.op !== 'edit' || row.before !== r.powerState || typeof row.after !== 'string' ||
          !POWER_STATES.includes(row.after) || row.after === row.before) throw new Error('Stale or invalid power-state change');
    } else {
      throw new Error(`Unsupported write field: ${row.field}`);
    }
  }
  for (const row of rows) {
    const r = byId.get(row.resourceId)!;
    if (row.field.startsWith('tags.')) {
      const key = row.field.slice('tags.'.length);
      if (row.after === null || row.after === undefined) delete r.tags[key];
      else r.tags[key] = row.after as string;
    } else {
      (r as unknown as Record<string, unknown>)[row.field] = row.after;
    }
  }
}
