/**
 * Pre-recorded catalog runs.
 *
 * Each route is a small script that stands in for the model's decisions;
 * the tool results are real (see catalog-sim.ts). Routes are *idealised*:
 * where a live model has to add numbers or compare dates in prose, the
 * script computes them exactly. The benchmark's real catalogue runs got
 * those wrong on the two hard tasks; this tour deliberately shows the
 * catalogue at its best, so the cost it still pays is the structural part.
 */

import { buildInventory } from '$lib/inventory/fixtures/builders';
import type { ResourceSummary } from '$lib/surfaces/catalog/handlers';
import { TASKS } from '$lib/tasks';
import { formatAnswer, type TaskId } from './answers';
import { createCatalogSim } from './catalog-sim';
import { runReplay, type Replay, type ReplayOptions, type ScriptApi } from './replay';

export interface CatalogRoute {
  id: string;
  /** Short enough for a segmented control. */
  label: string;
  /** Tooltip for the control: what is different about this route. */
  hint?: string;
  /** What this route teaches, one or two sentences. */
  lesson: string;
  script: (api: ScriptApi) => string;
}

type Listing = { count: number; resources: ResourceSummary[] };

const DAY_MS = 86_400_000;

const roundCents = (n: number): number => Math.round(n * 100) / 100;

function aggregateFrom(rows: Array<{ resourceGroup: string; costMonthly: number; name: string; tagCount: number }>) {
  const cents: Record<string, number> = {};
  for (const r of rows) cents[r.resourceGroup] = (cents[r.resourceGroup] ?? 0) + Math.round(r.costMonthly * 100);
  const byResourceGroup = Object.fromEntries(Object.entries(cents).map(([g, c]) => [g, c / 100]));
  const total = roundCents(Object.values(cents).reduce((a, b) => a + b, 0) / 100);
  const untagged = rows.filter((r) => r.tagCount === 0).map((r) => r.name);
  return { byResourceGroup, total, untagged };
}

const granularChain: CatalogRoute = {
  id: 'chain',
  label: 'Follow the references',
  lesson: 'Each hop needs the previous answer, so the calls cannot be batched, and the whole transcript is re-sent every turn.',
  script: (api) => {
    const vm = api.call('get_resource', { name: 'web-prod-03' });
    const nic = api.call('get_resource', { id: vm.nicId });
    const pip = api.call('get_resource', { id: nic.publicIpId });
    return formatAnswer({ task: 'granular-read', vm: vm.name, powerState: vm.powerState, publicIp: pip.ipAddress ?? null });
  }
};

const aggregateBroad: CatalogRoute = {
  id: 'broad',
  label: 'Broad list',
  hint: 'Best case: one list call returns exactly what the question needs.',
  lesson: 'One well-designed list call is enough. Then the model adds the figures in prose, and in the benchmark it was off by 5\u201311% every time.',
  script: (api) => {
    const out = api.call<Listing>('list_resources', { type: 'virtualMachine', subscriptionName: 'Production' });
    const running = out.resources.filter((r) => r.powerState === 'running');
    const { byResourceGroup, total, untagged } = aggregateFrom(running);
    return formatAnswer({ task: 'filter-aggregate', byResourceGroup, total, untagged });
  }
};

const aggregateSurvey: CatalogRoute = {
  id: 'survey',
  label: 'Verify each VM',
  hint: 'Cautious: list first, then fetch every running VM to double-check.',
  lesson: 'Same question, cautious route: list, then fetch each running VM. Benchmark runs ranged from 1 to 19 calls, so the bill swung by 60%.',
  script: (api) => {
    const out = api.call<Listing>('list_resources', { type: 'virtualMachine', subscriptionName: 'Production' });
    const running = out.resources.filter((r) => r.powerState === 'running');
    const full = api.parallel(running.map((r) => ['get_resource', { name: r.name }] as const));
    const { byResourceGroup, total, untagged } = aggregateFrom(
      full.map((vm) => ({
        resourceGroup: String(vm.resourceGroup),
        costMonthly: Number(vm.costMonthly),
        name: String(vm.name),
        tagCount: Object.keys((vm.tags ?? {}) as object).length
      }))
    );
    return formatAnswer({ task: 'filter-aggregate', byResourceGroup, total, untagged });
  }
};

const bulkWrite: CatalogRoute = {
  id: 'standard',
  label: 'Survey, then one write per resource',
  lesson: 'Writes go one resource at a time, so the change set is recited call by call, and the survey result is re-sent on every later turn.',
  script: (api) => {
    const listing = api.call<Listing>('list_resources', {});
    const snapshot = Date.parse(api.snapshotAt);
    const untagged = listing.resources.filter((r) => r.resourceGroup === 'app-staging' && r.tagCount === 0);
    const idle = listing.resources.filter(
      (r) =>
        r.type === 'virtualMachine' &&
        r.powerState !== 'deallocated' &&
        r.lastActivityAt !== undefined &&
        (snapshot - Date.parse(r.lastActivityAt)) / DAY_MS > 30
    );
    api.parallel([
      ...untagged.map((r) => ['update_resource_tags', { name: r.name, tags: { env: 'staging', owner: 'app-team' } }] as const),
      ...idle.map((r) => ['set_power_state', { name: r.name, state: 'deallocated' }] as const)
    ]);
    return formatAnswer({ task: 'bulk-write', tagged: untagged.length, deallocated: idle.map((r) => r.name) });
  }
};

const singleLookup: CatalogRoute = {
  id: 'direct',
  label: 'One narrow tool',
  lesson: 'The counter-case: one purpose-built tool returns exactly the rows needed. Nothing to chain, nothing to replay.',
  script: (api) => {
    const groups = api.call<Array<{ name: string }> | { error: string }>('list_resource_groups', { subscriptionName: 'Production' });
    const names = Array.isArray(groups) ? groups.map((g) => g.name) : [];
    return formatAnswer({ task: 'single-lookup', names });
  }
};

export const CATALOG_ROUTES: Record<TaskId, CatalogRoute[]> = {
  'granular-read': [granularChain],
  'filter-aggregate': [aggregateBroad, aggregateSurvey],
  'bulk-write': [bulkWrite],
  'single-lookup': [singleLookup]
};

export function taskPrompt(task: TaskId): string {
  const t = TASKS.find((x) => x.id === task);
  if (!t) throw new Error(`Unknown task ${task}`);
  return t.prompt;
}

export interface ReplayRequest extends ReplayOptions {
  task: TaskId;
  route?: string;
}

/** Build one catalog replay from scratch (fresh estate copy, deterministic). */
export function replayCatalog({ task, route, batchSize }: ReplayRequest): Replay {
  const routes = CATALOG_ROUTES[task];
  const chosen = routes.find((r) => r.id === route) ?? routes[0];
  const sim = createCatalogSim(buildInventory());
  return runReplay(sim, taskPrompt(task), chosen.script, { batchSize });
}
