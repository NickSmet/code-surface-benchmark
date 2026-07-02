/**
 * Applies a derived change set to a run's copy of the estate. Both surfaces
 * express writes as `ChangeRow[]` (the catalog per tool call, the code
 * surface per run); the agent loop applies them here — immediately in direct
 * mode, or after the reviewer approves in review mode.
 */

import type { ChangeRow } from './projection';
import type { Inventory } from './types';

export function applyChangeRows(inv: Inventory, rows: ChangeRow[]): void {
  const byId = new Map(inv.resources.map((r) => [r.id, r]));
  for (const row of rows) {
    const r = byId.get(row.resourceId);
    if (!r) continue;
    if (row.field.startsWith('tags.')) {
      const key = row.field.slice('tags.'.length);
      if (row.after === null || row.after === undefined) delete r.tags[key];
      else r.tags[key] = String(row.after);
    } else if (row.field !== '(resource)') {
      (r as unknown as Record<string, unknown>)[row.field] = row.after;
    }
  }
}
