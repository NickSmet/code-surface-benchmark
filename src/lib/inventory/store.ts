/**
 * Server-side inventory store.
 *
 * The canonical inventory is a single in-memory copy per server process,
 * seeded deterministically from the builder on first access. It is never
 * mutated: every benchmark run operates on its own copy of the estate
 * (`createRunInventory`), so writes genuinely apply — the tool calls have
 * real effects, like production MCP tools — while runs stay reproducible
 * and concurrent panels can't corrupt each other's state.
 */

import { buildInventory } from './fixtures/builders';
import type { Inventory } from './types';

let current: Inventory | null = null;

export function getInventory(): Inventory {
  if (!current) current = buildInventory();
  return current;
}

/** A fresh, pristine copy of the estate for one benchmark run. */
export function createRunInventory(): Inventory {
  return buildInventory();
}

export function resetInventory(): Inventory {
  current = buildInventory();
  return current;
}

/** Cheap headline stats for the UI header / prompts. */
export function inventorySummary(inv: Inventory = getInventory()): {
  resourceCount: number;
  groupCount: number;
  subscriptionCount: number;
  byType: Record<string, number>;
  generatedAt: string;
} {
  const byType: Record<string, number> = {};
  for (const r of inv.resources) byType[r.type] = (byType[r.type] ?? 0) + 1;
  return {
    resourceCount: inv.resources.length,
    groupCount: inv.resourceGroups.length,
    subscriptionCount: inv.subscriptions.length,
    byType,
    generatedAt: inv.generatedAt
  };
}
