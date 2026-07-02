<script lang="ts">
  import {
    AppWindow,
    Box,
    Braces,
    Cloud,
    Database,
    FileJson2,
    Globe2,
    HardDrive,
    Map as MapIcon,
    Network,
    Server
  } from '@lucide/svelte';
  import type { TranscriptItem } from '$lib/client/panel.svelte';
  import type { SurfaceId } from '$lib/agent/sse-protocol';
  import type { ToolTraceResource } from '$lib/surfaces/types';
  import { fmtInt } from '$lib/utils';

  type ToolItem = Extract<TranscriptItem, { kind: 'tool' }>;

  interface DemoInventoryResource {
    id: string;
    name: string;
    type: string;
    resourceGroup: string;
    subscriptionId: string;
    parentVmId?: string | null;
  }

  interface DemoInventoryGroup {
    name: string;
    subscriptionId: string;
    subscriptionName: string;
    location: string;
  }

  interface Props {
    resources: DemoInventoryResource[];
    groups: DemoInventoryGroup[];
    activeSurface: SurfaceId;
    activeTools: ToolItem[];
    activeTool: ToolItem | null;
    onSelectSurface: (surface: SurfaceId) => void;
  }

  let { resources, groups, activeSurface, activeTools, activeTool, onSelectSurface }: Props = $props();
  let tab = $state<'map' | 'json'>('map');

  // Article vocabulary: a resource the agent touched is a `read` or a
  // `write`; the code surface additionally has everything `in projection`
  // (shown as one banner, not per-row noise).
  type RowMode = 'read' | 'write' | 'off';
  const rowPriority: Record<RowMode, number> = { off: 0, read: 1, write: 2 };

  const UNTOUCHED_SHOWN = 3;

  let activeTraceResources = $derived.by(() => {
    const touch = new Map<string, ToolTraceResource>();
    const priority = { scope: 0, projection: 1, read: 2, write: 3 } as const;
    for (const item of activeTools) {
      for (const resource of item.trace?.resources ?? []) {
        const prev = touch.get(resource.id);
        if (!prev || priority[resource.mode] > priority[prev.mode]) touch.set(resource.id, resource);
      }
    }
    return touch;
  });

  function rowMode(id: string): RowMode {
    const traced = activeTraceResources.get(id);
    if (!traced) return 'off';
    if (traced.mode === 'write') return 'write';
    if (traced.mode === 'read' || traced.mode === 'scope') return 'read';
    return 'off'; // `projection` renders as the banner, not per-row paint
  }

  /** Whole-projection banner: the code surface sees everything at once. */
  let projectionInScope = $derived(
    activeSurface === 'code' &&
      Array.from(activeTraceResources.values()).some((r) => r.mode === 'projection' || r.mode === 'write')
  );

  let writeResourceCount = $derived(
    Array.from(activeTraceResources.values()).filter((r) => r.mode === 'write').length
  );
  let readResourceCount = $derived(
    Array.from(activeTraceResources.values()).filter((r) => r.mode === 'read' || r.mode === 'scope').length
  );
  let fieldChangeCount = $derived(activeTools.reduce((n, item) => n + (item.diff?.length ?? 0), 0));

  interface VmCard {
    vm: DemoInventoryResource;
    children: DemoInventoryResource[];
    mode: RowMode; // strongest mode across the VM and its children
  }

  interface GroupView {
    group: DemoInventoryGroup;
    total: number;
    touched: number;
    writes: number;
    vmCards: VmCard[];
    vmShown: VmCard[];
    vmHidden: number;
    others: DemoInventoryResource[];
    othersShown: DemoInventoryResource[];
    othersHidden: number;
  }

  function cardMode(vm: DemoInventoryResource, children: DemoInventoryResource[]): RowMode {
    let best = rowMode(vm.id);
    for (const child of children) {
      const m = rowMode(child.id);
      if (rowPriority[m] > rowPriority[best]) best = m;
    }
    return best;
  }

  let groupViews = $derived.by<GroupView[]>(() => {
    const childrenByVm = new Map<string, DemoInventoryResource[]>();
    for (const r of resources) {
      if (r.parentVmId) {
        const list = childrenByVm.get(r.parentVmId) ?? [];
        list.push(r);
        childrenByVm.set(r.parentVmId, list);
      }
    }

    return groups.map((group) => {
      const inGroup = resources.filter((r) => r.resourceGroup === group.name);

      const vmCards: VmCard[] = inGroup
        .filter((r) => r.type === 'virtualMachine')
        .map((vm) => {
          const children = (childrenByVm.get(vm.id) ?? []).sort(
            (a, b) => childRank(a.type) - childRank(b.type) || a.name.localeCompare(b.name)
          );
          return { vm, children, mode: cardMode(vm, children) };
        })
        .sort((a, b) => rowPriority[b.mode] - rowPriority[a.mode] || a.vm.name.localeCompare(b.vm.name));

      const others = inGroup
        .filter((r) => r.type !== 'virtualMachine' && !r.parentVmId)
        .sort((a, b) => rowPriority[rowMode(b.id)] - rowPriority[rowMode(a.id)] || a.name.localeCompare(b.name));

      let touched = 0;
      let writes = 0;
      for (const r of inGroup) {
        const m = rowMode(r.id);
        if (m !== 'off') touched += 1;
        if (m === 'write') writes += 1;
      }

      const vmTouched = vmCards.filter((c) => c.mode !== 'off');
      const vmShown = vmCards.slice(0, Math.max(vmTouched.length, UNTOUCHED_SHOWN));
      const othersTouched = others.filter((r) => rowMode(r.id) !== 'off');
      const othersShown = others.slice(0, Math.max(othersTouched.length, UNTOUCHED_SHOWN));

      return {
        group,
        total: inGroup.length,
        touched,
        writes,
        vmCards,
        vmShown,
        vmHidden: vmCards.length - vmShown.length,
        others,
        othersShown,
        othersHidden: others.length - othersShown.length
      };
    });
  });

  let heading = $derived(
    activeTool
      ? `#${activeTool.seq} ${activeTool.name}`
      : activeSurface === 'catalog'
        ? 'all catalog calls'
        : 'all code runs'
  );

  let caption = $derived.by(() => {
    if (activeTool?.trace?.details?.note) return String(activeTool.trace.details.note);
    if (activeTool) return activeTool.resultPreview ?? activeTool.argsPreview;
    if (activeSurface === 'code')
      return 'What the code surface touched: everything sits in the projection; writes are derived as one diff and applied to this run\u2019s copy of the estate.';
    return 'What the catalog agent touched: only what each tool call returned; writes apply per resource to this run\u2019s copy of the estate.';
  });

  function childRank(type: string): number {
    const order = ['networkInterface', 'publicIp', 'disk'];
    const i = order.indexOf(type);
    return i === -1 ? order.length : i;
  }

  function shortType(type: string): string {
    const labels: Record<string, string> = {
      virtualMachine: 'VM',
      networkInterface: 'NIC',
      publicIp: 'IP',
      storageAccount: 'Storage',
      sqlDatabase: 'SQL',
      appService: 'App',
      disk: 'Disk'
    };
    return labels[type] ?? type;
  }

  function jsonForTool(item: ToolItem) {
    const traceResources = item.trace?.resources ?? [];
    return {
      seq: item.seq,
      name: item.name,
      args: item.args ?? null,
      code: item.code ?? null,
      resultPreview: item.resultPreview ?? null,
      error: item.error ?? false,
      diff: item.diff ?? [],
      trace: item.trace
        ? {
            mode: item.trace.mode,
            details: item.trace.details,
            resourceCount: traceResources.length,
            resources: traceResources.slice(0, 80),
            omittedResources: Math.max(0, traceResources.length - 80)
          }
        : null
    };
  }

  let jsonText = $derived.by(() => {
    if (activeTool) return JSON.stringify(jsonForTool(activeTool), null, 2);
    const tools = activeTools.map((item) => ({
      seq: item.seq,
      name: item.name,
      resultPreview: item.resultPreview ?? null,
      traceMode: item.trace?.mode ?? null,
      traceResourceCount: item.trace?.resources.length ?? 0
    }));
    const touched = Array.from(activeTraceResources.values());
    return JSON.stringify(
      {
        surface: activeSurface,
        selection: 'lane aggregate',
        toolCalls: tools,
        touchedResourceCount: touched.length,
        touchedResources: touched.slice(0, 80),
        omittedResources: Math.max(0, touched.length - 80)
      },
      null,
      2
    );
  });
</script>

{#snippet ResourceIcon(type: string, size = 14)}
  {#if type === 'virtualMachine'}
    <Server {size} />
  {:else if type === 'networkInterface'}
    <Network {size} />
  {:else if type === 'publicIp'}
    <Globe2 {size} />
  {:else if type === 'disk'}
    <HardDrive {size} />
  {:else if type === 'storageAccount'}
    <Box {size} />
  {:else if type === 'sqlDatabase'}
    <Database {size} />
  {:else if type === 'appService'}
    <AppWindow {size} />
  {:else}
    <Cloud {size} />
  {/if}
{/snippet}

<aside class="inventory-sidebar" data-surface={activeSurface}>
  <header class="side-head">
    <span class="side-icon"><MapIcon size={17} /></span>
    <div>
      <h2>Estate map</h2>
      <p>{heading}</p>
    </div>
  </header>

  <div class="surface-toggle" role="tablist" aria-label="Surface shown on the map">
    <button
      type="button"
      data-surface="catalog"
      class:active={activeSurface === 'catalog'}
      onclick={() => onSelectSurface('catalog')}
    >
      Tool Catalog
    </button>
    <button
      type="button"
      data-surface="code"
      class:active={activeSurface === 'code'}
      onclick={() => onSelectSurface('code')}
    >
      Code Surface
    </button>
  </div>

  <div class="tabs" role="tablist" aria-label="Estate map view">
    <button class:active={tab === 'map'} type="button" onclick={() => (tab = 'map')}>
      <MapIcon size={14} /> Touched map
    </button>
    <button class:active={tab === 'json'} type="button" onclick={() => (tab = 'json')}>
      <FileJson2 size={14} /> JSON
    </button>
  </div>

  <p class="caption">{caption}</p>

  {#if tab === 'map'}
    <div class="map-scroll">
      {#if writeResourceCount > 0}
        <div class="headline write">
          <strong>{writeResourceCount}</strong>
          <span>resource{writeResourceCount === 1 ? '' : 's'} written · {fmtInt(fieldChangeCount)} field change{fieldChangeCount === 1 ? '' : 's'}</span>
        </div>
      {:else if readResourceCount > 0}
        <div class="headline">
          <strong>{readResourceCount}</strong>
          <span>resource{readResourceCount === 1 ? '' : 's'} read · no writes</span>
        </div>
      {/if}

      {#if projectionInScope}
        <div class="projection-banner">
          <Cloud size={14} />
          <span>whole projection visible to the code</span>
          <strong>{fmtInt(resources.length)} resources</strong>
        </div>
      {/if}

      {#each groupViews as view (view.group.name)}
        <section class="resource-group" data-touched={view.touched > 0}>
          <div class="group-head">
            <div class="group-title">
              <span>{view.group.name}</span>
              <em>{view.group.subscriptionName} · {view.group.location}</em>
            </div>
            <div class="group-counts">
              <span class="count"><strong>{view.total}</strong> total</span>
              {#if view.writes > 0}
                <span class="count write"><strong>{view.writes}</strong> writes</span>
              {:else if view.touched > 0}
                <span class="count read"><strong>{view.touched}</strong> read</span>
              {/if}
            </div>
          </div>

          <div class="group-body">
            {#each view.vmShown as card (card.vm.id)}
              {@const vmMode = rowMode(card.vm.id)}
              <div class="vm-card" data-mode={card.mode}>
                <div class="vm-row" data-mode={vmMode}>
                  <span class="resource-icon">{@render ResourceIcon('virtualMachine', 13)}</span>
                  <span class="vm-name" title={card.vm.name}>{card.vm.name}</span>
                  {#if vmMode !== 'off'}
                    <i class="mode-chip" data-mode={vmMode}>{vmMode === 'write' ? 'write' : 'read'}</i>
                  {/if}
                </div>
                {#if card.children.length > 0}
                  <div class="vm-children">
                    {#each card.children as child (child.id)}
                      {@const childMode = rowMode(child.id)}
                      <span class="child-chip" data-mode={childMode} title={`${child.name} · ${childMode === 'off' ? 'untouched' : childMode === 'write' ? 'write' : 'read'}`}>
                        {@render ResourceIcon(child.type, 11)}
                        {shortType(child.type)}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
            {#if view.vmHidden > 0}
              <div class="more-line">+{view.vmHidden} more VM{view.vmHidden === 1 ? '' : 's'} (untouched)</div>
            {/if}

            {#each view.othersShown as resource (resource.id)}
              {@const mode = rowMode(resource.id)}
              <div class="other-row" data-mode={mode}>
                <span class="resource-icon">{@render ResourceIcon(resource.type, 13)}</span>
                <span class="other-name" title={resource.name}>{resource.name}</span>
                <em>{shortType(resource.type)}</em>
                {#if mode !== 'off'}
                  <i class="mode-chip" data-mode={mode}>{mode === 'write' ? 'write' : 'read'}</i>
                {/if}
              </div>
            {/each}
            {#if view.othersHidden > 0}
              <div class="more-line">+{view.othersHidden} more resource{view.othersHidden === 1 ? '' : 's'} (untouched)</div>
            {/if}
          </div>
        </section>
      {/each}
    </div>

    <footer class="legend">
      <span><i data-mode="read"></i> read</span>
      <span><i data-mode="write"></i> write</span>
      <span><i data-mode="projection"></i> in projection</span>
    </footer>
  {:else}
    <div class="json-panel">
      <div class="json-title"><Braces size={14} /> selected trace</div>
      <pre>{jsonText}</pre>
    </div>
  {/if}
</aside>

<style>
  .inventory-sidebar {
    --surface: var(--catalog);
    width: 400px;
    min-width: 360px;
    max-width: 440px;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
    border-left: 1px solid var(--color-border-default);
    background: var(--color-panel-bg);
  }

  .inventory-sidebar[data-surface="code"] {
    --surface: var(--code);
  }

  .side-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 15px 16px 11px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .side-icon {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--surface);
    background: white;
    border: 1px solid var(--color-border-default);
    flex: none;
  }

  h2 {
    margin: 0;
    font-size: 16px;
    line-height: 1.2;
    font-weight: 800;
    letter-spacing: 0;
  }

  p {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--color-text-muted);
    line-height: 1.35;
  }

  .surface-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 10px 14px 0;
  }

  .surface-toggle button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--color-border-default);
    background: white;
    color: var(--color-text-muted);
    border-radius: 7px;
    padding: 8px 8px;
    font-size: 12.5px;
    font-weight: 800;
  }

  .surface-toggle button[data-surface="catalog"].active {
    color: var(--catalog);
    border-color: color-mix(in srgb, var(--catalog) 45%, var(--color-border-default));
    background: color-mix(in srgb, var(--catalog) 10%, white);
  }

  .surface-toggle button[data-surface="code"].active {
    color: var(--code);
    border-color: color-mix(in srgb, var(--code) 45%, var(--color-border-default));
    background: color-mix(in srgb, var(--code) 10%, white);
  }

  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 8px 14px 0;
  }

  .tabs button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--color-border-default);
    background: white;
    color: var(--color-text-muted);
    border-radius: 7px;
    padding: 6px 8px;
    font-size: 11.5px;
    font-weight: 700;
  }

  .tabs button.active {
    color: var(--surface);
    border-color: color-mix(in srgb, var(--surface) 35%, var(--color-border-default));
    background: color-mix(in srgb, var(--surface) 9%, white);
  }

  .caption {
    padding: 9px 14px 8px;
    margin: 0;
    min-height: 44px;
  }

  .map-scroll {
    min-height: 0;
    overflow: auto;
    padding: 0 14px 12px;
  }

  .headline {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
    padding: 9px 11px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--surface) 30%, var(--color-border-default));
    background: color-mix(in srgb, var(--surface) 6%, white);
    color: var(--surface);
  }

  .headline.write {
    border-color: color-mix(in srgb, var(--good) 45%, var(--color-border-default));
    background: var(--good-bg);
    color: var(--good);
  }

  .headline strong {
    font-family: var(--font-mono);
    font-size: 22px;
    line-height: 1;
  }

  .headline span {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-text-secondary);
  }

  .projection-banner {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 10px;
    padding: 8px 11px;
    border-radius: 8px;
    border: 1px dashed color-mix(in srgb, var(--code) 40%, var(--color-border-default));
    background: color-mix(in srgb, var(--code) 6%, white);
    color: var(--code);
    font-size: 12px;
    font-weight: 700;
  }

  .projection-banner strong {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .resource-group {
    margin-bottom: 10px;
    border: 1px solid var(--color-border-default);
    border-radius: 8px;
    background: white;
    overflow: hidden;
  }

  .resource-group[data-touched="true"] {
    border-color: color-mix(in srgb, var(--surface) 28%, var(--color-border-default));
  }

  .group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 10px 7px;
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-expanded-bg);
  }

  .group-title {
    min-width: 0;
  }

  .group-title span {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 800;
    color: var(--color-text-secondary);
  }

  .group-title em {
    display: block;
    min-width: 0;
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
    font-size: 10.5px;
    line-height: 1.2;
    color: var(--color-text-muted);
  }

  .group-counts {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .count {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--color-text-muted);
  }

  .count strong {
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .count.write {
    color: var(--good);
  }

  .count.write strong {
    color: var(--good);
  }

  .count.read {
    color: var(--surface);
  }

  .count.read strong {
    color: var(--surface);
  }

  .group-body {
    display: grid;
    gap: 5px;
    padding: 8px;
  }

  .vm-card {
    border: 1px solid var(--color-border-default);
    border-radius: 7px;
    background: white;
    padding: 6px 7px;
  }

  .vm-card[data-mode="read"] {
    border-color: color-mix(in srgb, var(--surface) 40%, var(--color-border-default));
    background: color-mix(in srgb, var(--surface) 4%, white);
  }

  .vm-card[data-mode="write"] {
    border-color: color-mix(in srgb, var(--good) 55%, var(--color-border-default));
    background: color-mix(in srgb, var(--good) 5%, white);
  }

  .vm-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .vm-name,
  .other-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--color-text-secondary);
  }

  .vm-row[data-mode="write"] .vm-name,
  .other-row[data-mode="write"] .other-name {
    color: var(--good);
    font-weight: 700;
  }

  .vm-row[data-mode="read"] .vm-name,
  .other-row[data-mode="read"] .other-name {
    color: var(--surface);
    font-weight: 700;
  }

  .resource-icon {
    width: 19px;
    height: 19px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: white;
    border: 1px solid var(--color-border-default);
    color: var(--color-text-muted);
    flex: none;
  }

  .vm-row[data-mode="write"] .resource-icon,
  .other-row[data-mode="write"] .resource-icon {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 40%, var(--color-border-default));
  }

  .vm-row[data-mode="read"] .resource-icon,
  .other-row[data-mode="read"] .resource-icon {
    color: var(--surface);
    border-color: color-mix(in srgb, var(--surface) 40%, var(--color-border-default));
  }

  .mode-chip {
    flex: none;
    font-style: normal;
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 4px 7px;
  }

  .mode-chip[data-mode="read"] {
    color: var(--surface);
    background: color-mix(in srgb, var(--surface) 12%, white);
  }

  .mode-chip[data-mode="write"] {
    color: white;
    background: var(--good);
  }

  .vm-children {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
    padding-left: 26px;
  }

  .child-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--color-border-default);
    border-radius: 999px;
    padding: 3px 7px;
    font-family: var(--font-mono);
    font-size: 9.5px;
    font-weight: 700;
    color: var(--color-text-muted);
    background: var(--color-expanded-bg);
  }

  .child-chip[data-mode="read"] {
    color: var(--surface);
    border-color: color-mix(in srgb, var(--surface) 45%, var(--color-border-default));
    background: color-mix(in srgb, var(--surface) 8%, white);
  }

  .child-chip[data-mode="write"] {
    color: var(--good);
    border-color: var(--good);
    background: var(--good-bg);
  }

  .other-row {
    min-width: 0;
    min-height: 30px;
    display: flex;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--color-border-default);
    border-radius: 7px;
    padding: 5px 7px;
    background: white;
  }

  .other-row[data-mode="read"] {
    border-color: color-mix(in srgb, var(--surface) 40%, var(--color-border-default));
    background: color-mix(in srgb, var(--surface) 4%, white);
  }

  .other-row[data-mode="write"] {
    border-color: color-mix(in srgb, var(--good) 55%, var(--color-border-default));
    background: color-mix(in srgb, var(--good) 5%, white);
  }

  .other-row em {
    flex: none;
    font-style: normal;
    font-family: var(--font-mono);
    font-size: 9.5px;
    font-weight: 700;
    color: var(--color-text-dim);
    text-transform: uppercase;
  }

  .more-line {
    min-height: 24px;
    display: flex;
    align-items: center;
    padding: 4px 7px;
    border-radius: 7px;
    border: 1px dashed var(--color-border-default);
    color: var(--color-text-dim);
    background: var(--color-expanded-bg);
    font-family: var(--font-mono);
    font-size: 10.5px;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px 14px;
    border-top: 1px solid var(--color-border-default);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .legend i {
    width: 12px;
    height: 12px;
    border-radius: 4px;
    border: 1px solid var(--color-border-default);
    background: white;
  }

  .legend i[data-mode="read"] {
    border-color: var(--surface);
    background: color-mix(in srgb, var(--surface) 15%, white);
  }

  .legend i[data-mode="write"] {
    border-color: var(--good);
    background: var(--good);
  }

  .legend i[data-mode="projection"] {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--code) 45%, var(--color-border-default));
    background: color-mix(in srgb, var(--code) 7%, white);
  }

  .json-panel {
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    margin: 0 14px 12px;
    border: 1px solid var(--color-border-default);
    border-radius: 8px;
    background: white;
  }

  .json-title {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border-subtle);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--surface);
  }

  pre {
    margin: 0;
    min-height: 0;
    overflow: auto;
    padding: 10px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--color-text-secondary);
    white-space: pre;
  }
</style>
