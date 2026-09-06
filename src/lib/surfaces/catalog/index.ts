import { createRunInventory } from '$lib/inventory/store';
import { applyChangeRows } from '$lib/inventory/apply';
import { buildProjection } from '$lib/inventory/projection';
import { traceDiffResources, traceResource, traceResources } from '$lib/inventory/overview';
import type { Inventory } from '$lib/inventory/types';
import type { Surface, ToolDispatchResult } from '$lib/surfaces/types';
import { CATALOG_TOOLS } from './schemas';
import { catalogSystemPrompt } from './prompt';
import {
  getResource,
  listResourceGroups,
  listResources,
  listSubscriptions,
  setPowerState,
  updateResourceTags
} from './handlers';

function preview(value: unknown, max = 160): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function traceListResources(
  inv: Inventory,
  args: { type?: string; resourceGroup?: string; subscriptionName?: string },
  via: string
) {
  const sub = args.subscriptionName
    ? inv.subscriptions.find((x) => x.name.toLowerCase() === args.subscriptionName!.toLowerCase() || x.id === args.subscriptionName)
    : null;
  const resources = inv.resources.filter(
    (r) =>
      (args.type ? r.type === args.type : true) &&
      (args.resourceGroup ? r.resourceGroup === args.resourceGroup : true) &&
      (sub ? r.subscriptionId === sub.id : true)
  );
  return {
    mode: 'scope' as const,
    resources: traceResources(resources, 'read', via),
    details: {
      operation: via,
      filter: {
        type: args.type ?? null,
        resourceGroup: args.resourceGroup ?? null,
        subscriptionName: args.subscriptionName ?? null
      },
      count: resources.length
    }
  };
}

export function createCatalogSurface(runNonce?: string, inv: Inventory = createRunInventory()): Surface {
  return {
    id: 'catalog',
    label: 'Tool Catalog',
    systemPrompt: catalogSystemPrompt(inv.generatedAt, runNonce),
    tools: CATALOG_TOOLS,
    snapshot: () => buildProjection(inv),
    applyDiff: (rows) => applyChangeRows(inv, rows),
    async dispatch(name, args): Promise<ToolDispatchResult> {
      switch (name) {
        case 'list_subscriptions': {
          const out = listSubscriptions(inv);
          return {
            content: JSON.stringify(out),
            resultPreview: `${out.length} subscriptions`,
            trace: { mode: 'scope', resources: [], details: { operation: name, count: out.length } }
          };
        }
        case 'list_resource_groups': {
          const out = listResourceGroups(inv, args as { subscriptionName?: string });
          return {
            content: JSON.stringify(out),
            resultPreview: `${out.length} resource groups`,
            trace: {
              mode: 'scope',
              resources: [],
              details: { operation: name, subscriptionName: args.subscriptionName ?? null, count: out.length }
            }
          };
        }
        case 'list_resources': {
          const typedArgs = args as { type?: string; resourceGroup?: string; subscriptionName?: string };
          const out = listResources(inv, typedArgs);
          return { content: JSON.stringify(out), resultPreview: `${out.count} resources`, trace: traceListResources(inv, typedArgs, name) };
        }
        case 'get_resource': {
          const typedArgs = args as { name?: string; id?: string };
          const out = getResource(inv, typedArgs);
          const err = 'error' in out;
          const resource =
            typedArgs.id ? inv.resources.find((r) => r.id === typedArgs.id) : typedArgs.name ? inv.resources.find((r) => r.name === typedArgs.name) : undefined;
          return {
            content: JSON.stringify(out),
            resultPreview: err ? String(out.error) : `${String((out as { name?: string }).name)} (${String((out as { type?: string }).type)})`,
            error: err,
            trace: {
              mode: 'read',
              resources: resource ? [traceResource(resource, 'read', name)] : [],
              details: { operation: name, selector: typedArgs, found: Boolean(resource) }
            }
          };
        }
        case 'update_resource_tags': {
          const out = updateResourceTags(inv, args as { name?: string; tags?: Record<string, string> });
          const err = 'error' in out.content;
          return {
            content: JSON.stringify(out.content),
            resultPreview: err
              ? preview(out.content.error)
              : `${String(out.content.name)}: +${out.diff.length} tag${out.diff.length === 1 ? '' : 's'}`,
            error: err,
            diff: out.diff,
            trace: {
              mode: 'write',
              resources: traceDiffResources(inv, out.diff, name),
              details: { operation: name, changeCount: out.diff.length, target: args.name ?? null }
            }
          };
        }
        case 'set_power_state': {
          const out = setPowerState(inv, args as { name?: string; state?: string });
          const err = 'error' in out.content;
          return {
            content: JSON.stringify(out.content),
            resultPreview: err ? preview(out.content.error) : `${String(out.content.name)} → ${String(out.content.powerState)}`,
            error: err,
            diff: out.diff,
            trace: {
              mode: 'write',
              resources: traceDiffResources(inv, out.diff, name),
              details: { operation: name, changeCount: out.diff.length, target: args.name ?? null, state: args.state ?? null }
            }
          };
        }
        default:
          return { content: JSON.stringify({ error: `Unknown tool ${name}` }), resultPreview: `unknown tool ${name}`, error: true };
      }
    }
  };
}
