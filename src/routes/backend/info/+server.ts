/**
 * GET  /backend/info   → provider label/model + inventory summary (header).
 * POST /backend/info    → reseed the inventory, return the fresh summary.
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { selectProvider } from '$lib/agent/providers';
import { getInventory, inventorySummary, resetInventory } from '$lib/inventory/store';
import { inventoryOverview } from '$lib/inventory/overview';
import { computeGroundTruth } from '$lib/inventory/truth';

function payload() {
  const provider = selectProvider(env as Record<string, string | undefined>);
  const inv = getInventory();
  return {
    provider: { label: provider.label, model: provider.model, isStub: provider.isStub },
    inventory: { ...inventorySummary(inv), ...inventoryOverview(inv) },
    truth: computeGroundTruth(inv)
  };
}

export const GET: RequestHandler = async () => json(payload());

export const POST: RequestHandler = async () => {
  resetInventory();
  return json(payload());
};
