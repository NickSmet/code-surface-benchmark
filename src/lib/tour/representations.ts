/**
 * The text a model is actually handed.
 *
 * The map shows a VM as a pod of squares; the model sees none of that. It
 * sees text, and the same VM can be handed over at very different sizes. These
 * are the three shapes the catalog surface produces, taken from the real
 * handlers, with their token cost.
 */

import type { Inventory } from '$lib/inventory/types';
import { buildProjection } from '$lib/inventory/projection';
import { getResource, listResources } from '$lib/surfaces/catalog/handlers';
import type { EstateUnit } from './estate';
import { estimateTokens } from './tokens';

export interface Representation {
  id: 'summary' | 'record' | 'pod';
  label: string;
  /** Where in the benchmark this text comes from. */
  source: string;
  /** What the model receives (compact JSON, exactly as returned). */
  compact: string;
  /** The same data indented for people to read. */
  display: string;
  tokens: number;
}

export function representationsFor(unit: EstateUnit, inv: Inventory): Representation[] {
  const head = inv.resources.find((r) => r.id === unit.id);
  if (!head) return [];
  const row = listResources(inv, { type: head.type }).resources.find((r) => r.name === head.name);
  const record = getResource(inv, { id: head.id });
  const pod = unit.members.map((m) => getResource(inv, { id: m.id }));

  const make = (id: Representation['id'], label: string, source: string, value: unknown): Representation => {
    const compact = JSON.stringify(value);
    return { id, label, source, compact, display: JSON.stringify(value, null, 2), tokens: estimateTokens(compact) };
  };

  const out: Representation[] = [];
  if (row) out.push(make('summary', 'One line', 'list_resources: one row of the listing', row));
  out.push(make('record', 'Record', 'get_resource: the full record', record));
  if (unit.members.length > 1) {
    out.push(make('pod', `Pod (${unit.members.length})`, `get_resource × ${unit.members.length}: every resource in the pod`, pod));
  }
  return out;
}

/** Everything, handed over as one JSON array of projected resources. */
export function estateDump(inv: Inventory): { text: string; tokens: number; count: number } {
  const resources = buildProjection(inv).resources;
  const text = JSON.stringify(resources);
  return { text, tokens: estimateTokens(text), count: resources.length };
}
