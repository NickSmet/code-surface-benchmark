<script lang="ts">
  import {
    AppWindow,
    Box,
    Cloud,
    Database,
    Globe2,
    HardDrive,
    Map as MapIcon,
    Network,
    Server,
    X
  } from '@lucide/svelte';
  import type { InventoryGroupTile, InventoryResourceTile } from '$lib/inventory/overview';
  import { fmtInt } from '$lib/utils';

  interface Props {
    resources: InventoryResourceTile[];
    groups: InventoryGroupTile[];
    generatedAt: string;
    onClose: () => void;
  }
  let { resources, groups, generatedAt, onClose }: Props = $props();

  const fmtCost = (n: number): string => `$${fmtInt(Math.round(n))}/mo`;

  interface VmCard {
    vm: InventoryResourceTile;
    children: InventoryResourceTile[];
  }
  interface GroupView {
    group: InventoryGroupTile;
    total: number;
    cost: number;
    vmCards: VmCard[];
    others: InventoryResourceTile[];
  }
  interface SubView {
    id: string;
    name: string;
    total: number;
    cost: number;
    groups: GroupView[];
  }

  let subs = $derived.by<SubView[]>(() => {
    const childrenByVm = new Map<string, InventoryResourceTile[]>();
    for (const r of resources) {
      if (r.parentVmId) {
        const list = childrenByVm.get(r.parentVmId) ?? [];
        list.push(r);
        childrenByVm.set(r.parentVmId, list);
      }
    }

    const groupViews: GroupView[] = groups.map((group) => {
      const inGroup = resources.filter((r) => r.resourceGroup === group.name);
      const vmCards: VmCard[] = inGroup
        .filter((r) => r.type === 'virtualMachine')
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((vm) => ({
          vm,
          children: (childrenByVm.get(vm.id) ?? []).sort(
            (a, b) => childRank(a.type) - childRank(b.type) || a.name.localeCompare(b.name)
          )
        }));
      const others = inGroup
        .filter((r) => r.type !== 'virtualMachine' && !r.parentVmId)
        .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
      return {
        group,
        total: inGroup.length,
        cost: inGroup.reduce((n, r) => n + (r.costMonthly ?? 0), 0),
        vmCards,
        others
      };
    });

    const byId = new Map<string, SubView>();
    for (const gv of groupViews) {
      const sub = byId.get(gv.group.subscriptionId) ?? {
        id: gv.group.subscriptionId,
        name: gv.group.subscriptionName,
        total: 0,
        cost: 0,
        groups: []
      };
      sub.total += gv.total;
      sub.cost += gv.cost;
      sub.groups.push(gv);
      byId.set(gv.group.subscriptionId, sub);
    }
    return Array.from(byId.values()).sort((a, b) => b.cost - a.cost);
  });

  let totalCost = $derived(resources.reduce((n, r) => n + (r.costMonthly ?? 0), 0));

  let typeCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const r of resources) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
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

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') onClose();
  }
</script>

{#snippet ResourceIcon(type: string, size = 13)}
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

<svelte:window onkeydown={onKeydown} />

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="estate" role="dialog" aria-modal="true" aria-label="Cloud estate">
    <header class="estate-head">
      <span class="head-icon"><MapIcon size={16} /></span>
      <div class="head-titles">
        <h2>The cloud estate both surfaces run against</h2>
        <p>
          {fmtInt(resources.length)} resources · {groups.length} resource groups · {subs.length} subscriptions
          · ~{fmtCost(totalCost)} · seeded {new Date(generatedAt).toLocaleString()}
        </p>
      </div>
      <div class="type-chips">
        {#each typeCounts as [type, count] (type)}
          <span class="type-chip">
            {@render ResourceIcon(type, 11)}
            {count} {shortType(type)}{count === 1 || shortType(type).endsWith('e') ? '' : 's'}
          </span>
        {/each}
      </div>
      <button class="close" onclick={onClose} aria-label="Close"><X size={16} /></button>
    </header>

    <div class="estate-body">
      {#each subs as sub (sub.id)}
        <section class="sub">
          <div class="sub-head">
            <span class="sub-name">{sub.name}</span>
            <span class="sub-meta">{sub.groups.length} groups · {sub.total} resources · {fmtCost(sub.cost)}</span>
          </div>
          <div class="groups">
            {#each sub.groups as view (view.group.name)}
              <div class="group-card">
                <div class="group-head">
                  <div class="group-title">
                    <span>{view.group.name}</span>
                    <em>{view.group.location} · {view.total} resources · {fmtCost(view.cost)}</em>
                  </div>
                </div>
                <div class="group-body">
                  {#each view.vmCards as card (card.vm.id)}
                    <div class="vm-card">
                      <div class="vm-row">
                        <span class="power-dot" data-state={card.vm.powerState ?? 'unknown'} title={card.vm.powerState}></span>
                        <span class="vm-name" title={`${card.vm.name} · ${card.vm.detail ?? ''}`}>{card.vm.name}</span>
                        <span class="vm-cost">{fmtCost(card.vm.costMonthly ?? 0)}</span>
                      </div>
                      {#if card.vm.detail}
                        <div class="vm-detail">{card.vm.detail}</div>
                      {/if}
                      {#if card.children.length > 0}
                        <div class="vm-children">
                          {#each card.children as child (child.id)}
                            <span class="child-chip" title={`${child.name} · ${child.detail ?? ''}`}>
                              {@render ResourceIcon(child.type, 10)}
                              {shortType(child.type)}
                              {#if child.type === 'publicIp' && child.detail}<b>{child.detail}</b>{/if}
                            </span>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                  {#each view.others as resource (resource.id)}
                    <div class="other-row">
                      <span class="resource-icon">{@render ResourceIcon(resource.type, 12)}</span>
                      <span class="other-name" title={`${resource.name} · ${resource.detail ?? ''}`}>{resource.name}</span>
                      <em>{resource.detail ?? shortType(resource.type)}</em>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>

    <footer class="estate-foot">
      <span><i class="power-dot" data-state="running"></i> running</span>
      <span><i class="power-dot" data-state="stopped"></i> stopped</span>
      <span><i class="power-dot" data-state="deallocated"></i> deallocated</span>
      <span class="foot-note">NICs, public IPs and disks are nested under the VM they hang off — the multi-hop chains the tasks traverse.</span>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .estate {
    width: min(1560px, 96vw);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--color-page-bg);
    border-radius: 12px;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.35);
    overflow: hidden;
  }

  .estate-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 16px;
    border-bottom: 1px solid var(--color-border-default);
  }
  .head-icon {
    width: 32px;
    height: 32px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid var(--color-border-default);
    color: var(--color-brand);
    background: var(--color-expanded-bg);
  }
  .head-titles { min-width: 0; }
  .head-titles h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }
  .head-titles p {
    margin: 2px 0 0;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--color-text-muted);
  }
  .type-chips {
    margin-left: auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 5px;
    max-width: 440px;
  }
  .type-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-mono);
    font-size: 9.5px;
    font-weight: 600;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border-default);
    border-radius: 999px;
    background: var(--color-expanded-bg);
    padding: 3px 8px;
    white-space: nowrap;
  }
  .close {
    flex: none;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border-default);
    background: white;
  }
  .close:hover { background: var(--color-hover-bg); color: var(--color-text-primary); }

  .estate-body {
    min-height: 0;
    overflow-y: auto;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--color-expanded-bg);
  }

  .sub-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 8px;
  }
  .sub-name {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  .sub-meta {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 10px;
    align-items: start;
  }
  .group-card {
    border: 1px solid var(--color-border-default);
    border-radius: 9px;
    background: white;
    overflow: hidden;
  }
  .group-head {
    padding: 8px 10px 7px;
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-panel-bg);
  }
  .group-title span {
    display: block;
    font-size: 12.5px;
    font-weight: 800;
    color: var(--color-text-secondary);
  }
  .group-title em {
    display: block;
    margin-top: 1px;
    font-style: normal;
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--color-text-muted);
  }
  .group-body {
    display: grid;
    gap: 5px;
    padding: 8px;
  }

  .vm-card {
    border: 1px solid var(--color-border-default);
    border-radius: 7px;
    padding: 6px 8px;
    background: white;
  }
  .vm-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .power-dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-text-dim);
  }
  .power-dot[data-state='running'] { background: var(--good); }
  .power-dot[data-state='stopped'] { background: var(--warn); }
  .power-dot[data-state='deallocated'] { background: var(--color-border-strong); }
  .vm-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-weight: 700;
    color: var(--color-text-secondary);
  }
  .vm-cost {
    flex: none;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-text-muted);
  }
  .vm-detail {
    margin: 2px 0 0 15px;
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--color-text-dim);
  }
  .vm-children {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 6px 0 0 15px;
  }
  .child-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--color-border-default);
    border-radius: 999px;
    padding: 2px 7px;
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 700;
    color: var(--color-text-muted);
    background: var(--color-expanded-bg);
    white-space: nowrap;
  }
  .child-chip b {
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .other-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    border: 1px solid var(--color-border-subtle);
    border-radius: 7px;
    padding: 4px 8px;
    background: var(--color-panel-bg);
  }
  .resource-icon {
    flex: none;
    color: var(--color-text-muted);
    display: inline-flex;
  }
  .other-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--color-text-secondary);
  }
  .other-row em {
    flex: none;
    font-style: normal;
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--color-text-dim);
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .estate-foot {
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 9px 16px;
    border-top: 1px solid var(--color-border-default);
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-text-muted);
  }
  .estate-foot span { display: inline-flex; align-items: center; gap: 5px; }
  .estate-foot i { display: inline-block; }
  .foot-note {
    margin-left: auto;
    font-family: var(--font-sans);
    font-size: 10.5px;
    color: var(--color-text-dim);
  }
</style>
