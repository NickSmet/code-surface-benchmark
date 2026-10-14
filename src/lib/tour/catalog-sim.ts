/**
 * A synchronous twin of `createCatalogSurface` for the tour.
 *
 * It calls the very same handlers, so the text each tool returns is
 * byte-identical to what the benchmark's catalog agent receives (a test pins
 * that). What it adds: per-call "touch" events so the estate map can show
 * which resources entered the model's context and how.
 */

import { applyChangeRows } from '$lib/inventory/apply';
import { buildInventory } from '$lib/inventory/fixtures/builders';
import type { ChangeRow } from '$lib/inventory/projection';
import type { Inventory } from '$lib/inventory/types';
import {
  getResource,
  listResourceGroups,
  listResources,
  listSubscriptions,
  setPowerState,
  updateResourceTags
} from '$lib/surfaces/catalog/handlers';
import { catalogSystemPrompt } from '$lib/surfaces/catalog/prompt';
import { CATALOG_TOOLS } from '$lib/surfaces/catalog/schemas';
import type { SimResult, SimSurface } from './replay';
import { estimateTokens } from './tokens';
import type { TouchEvent } from './touch';

type Touch = Omit<TouchEvent, 'step'>;

function clip(value: unknown, max = 120): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function writeTouches(diff: ChangeRow[], resultTokens: number): Touch[] {
  const byId = new Map<string, string[]>();
  for (const row of diff) byId.set(row.resourceId, [...(byId.get(row.resourceId) ?? []), row.field]);
  return [...byId].map(([resourceId, fields]) => ({ kind: 'written' as const, resourceId, fields, tokens: resultTokens }));
}

export function createCatalogSim(inventory: Inventory = buildInventory()): SimSurface {
  const idByName = new Map(inventory.resources.map((r) => [r.name, r.id]));

  const dispatch = (name: string, args: Record<string, unknown>): SimResult => {
    switch (name) {
      case 'list_subscriptions': {
        const out = listSubscriptions(inventory);
        return { content: JSON.stringify(out), preview: `${out.length} subscriptions`, touches: [] };
      }
      case 'list_resource_groups': {
        const out = listResourceGroups(inventory, args as { subscriptionName?: string });
        const touches: Touch[] = out.map((g) => ({ kind: 'listed', groupName: g.name, tokens: estimateTokens(JSON.stringify(g)) }));
        return { content: JSON.stringify(out), preview: `${out.length} resource groups`, touches };
      }
      case 'list_resources': {
        const out = listResources(inventory, args as { type?: string; resourceGroup?: string; subscriptionName?: string });
        const touches: Touch[] = [];
        for (const row of out.resources) {
          const resourceId = idByName.get(row.name);
          if (resourceId) touches.push({ kind: 'listed', resourceId, tokens: estimateTokens(JSON.stringify(row)) });
        }
        return { content: JSON.stringify(out), preview: `${out.count} resources`, touches };
      }
      case 'get_resource': {
        const out = getResource(inventory, args as { name?: string; id?: string });
        const content = JSON.stringify(out);
        if ('error' in out) return { content, preview: String(out.error), error: true, touches: [] };
        return {
          content,
          preview: `${String(out.name)} (${String(out.type)})`,
          touches: [{ kind: 'read', resourceId: String(out.id), tokens: estimateTokens(content) }]
        };
      }
      case 'update_resource_tags': {
        const out = updateResourceTags(inventory, args as { name?: string; tags?: Record<string, string> });
        const content = JSON.stringify(out.content);
        const error = 'error' in out.content;
        return {
          content,
          preview: error
            ? clip(out.content.error)
            : `${String(out.content.name)}: +${out.diff.length} tag${out.diff.length === 1 ? '' : 's'}`,
          error,
          diff: out.diff,
          touches: error ? [] : writeTouches(out.diff, estimateTokens(content))
        };
      }
      case 'set_power_state': {
        const out = setPowerState(inventory, args as { name?: string; state?: string });
        const content = JSON.stringify(out.content);
        const error = 'error' in out.content;
        return {
          content,
          preview: error ? clip(out.content.error) : `${String(out.content.name)} → ${String(out.content.powerState)}`,
          error,
          diff: out.diff,
          touches: error ? [] : writeTouches(out.diff, estimateTokens(content))
        };
      }
      default:
        return { content: JSON.stringify({ error: `Unknown tool ${name}` }), preview: `unknown tool ${name}`, error: true, touches: [] };
    }
  };

  return {
    id: 'catalog',
    label: 'Tool Catalog',
    systemPrompt: catalogSystemPrompt(inventory.generatedAt),
    tools: CATALOG_TOOLS,
    inventory,
    dispatch,
    applyDiff: (rows) => applyChangeRows(inventory, rows)
  };
}
