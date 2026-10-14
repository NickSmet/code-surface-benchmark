<script lang="ts" module>
  export interface GroupPaint {
    ring?: string;
    ringStyle?: 'solid' | 'dashed';
    /** Small chip in the group header, e.g. "needed", "listed", "scanned". */
    tag?: string;
    tagColor?: string;
  }
</script>

<script lang="ts">
  import { AppWindow, Box, Database } from '@lucide/svelte';
  import type { EstateGroup, EstateModel, EstateUnit } from '$lib/tour/estate';
  import type { Paint } from '$lib/tour/paint';
  import { fmtInt } from '$lib/utils';

  interface Props {
    model: EstateModel;
    /** How to colour one resource's cell. */
    paintOf: (resourceId: string) => Paint;
    groupPaintOf?: (groupName: string) => GroupPaint | undefined;
    /** Small chip on a unit (e.g. the steps that touched it). */
    badgeOf?: (unit: EstateUnit) => string | null;
    /** Accessible name for a unit. */
    labelOf?: (unit: EstateUnit) => string;
    selectedId?: string | null;
    onselect?: (unitId: string | null) => void;
    onhover?: (unitId: string | null) => void;
    /** Accessible name for the whole map. */
    label?: string;
  }

  let {
    model,
    paintOf,
    groupPaintOf,
    badgeOf,
    labelOf,
    selectedId = null,
    onselect,
    onhover,
    label = 'Estate map'
  }: Props = $props();

  // Roving tabindex: one stop in the tab order, arrow keys move between units.
  let activeId = $state<string | null>(null);
  let root = $state<HTMLElement | null>(null);
  const tabStop = $derived(activeId && model.unitById.has(activeId) ? activeId : (model.units[0]?.id ?? null));

  const TOP_ROLES = new Set(['vm', 'nic', 'pip']);
  const usd0 = (n: number): string => '$' + fmtInt(n);
  const LOOSE_NAME: Record<string, string> = { storage: 'Storage account', sql: 'SQL database', app: 'App service', other: 'Resource' };

  function defaultLabel(u: EstateUnit): string {
    if (u.kind !== 'vm') return `${LOOSE_NAME[u.kind]} ${u.name}`;
    return u.members.length > 1 ? `${u.name}, with ${u.members.length - 1} connected resources` : u.name;
  }

  function neighbour(from: HTMLElement, dir: 'left' | 'right' | 'up' | 'down'): HTMLElement | null {
    if (!root) return null;
    const f = from.getBoundingClientRect();
    const fx = f.left + f.width / 2;
    const fy = f.top + f.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of root.querySelectorAll<HTMLElement>('[data-unit]')) {
      if (el === from) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - fx;
      const dy = r.top + r.height / 2 - fy;
      const primary = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      if (primary <= 4) continue;
      // Prefer the unit that is most directly in line with the direction of travel.
      const secondary = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = primary + secondary * 3;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function onkeydown(e: KeyboardEvent): void {
    const target = e.currentTarget as HTMLElement | null;
    if (!target || !root) return;
    const dirs: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (e.key in dirs) {
      const next = neighbour(target, dirs[e.key]);
      if (next) {
        e.preventDefault();
        next.focus();
        next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    } else if (e.key === 'Home' || e.key === 'End') {
      const all = root.querySelectorAll<HTMLElement>('[data-unit]');
      const el = e.key === 'Home' ? all[0] : all[all.length - 1];
      if (el) {
        e.preventDefault();
        el.focus();
      }
    }
  }

  const vmsOf = (g: EstateGroup): EstateUnit[] => g.units.filter((u) => u.kind === 'vm');
  const looseOf = (g: EstateGroup): EstateUnit[] => g.units.filter((u) => u.kind !== 'vm');
</script>

{#snippet cell(id: string, role: string, name: string)}
  {@const p = paintOf(id)}
  <span
    class="cell"
    class:dim={p.dim}
    class:faint={p.faint}
    class:fresh={p.fresh}
    data-role={role}
    data-name={name}
    data-ring={p.ring ? (p.ringStyle ?? 'solid') : undefined}
    style:--fill={p.fill}
    style:--ring={p.ring}
  ></span>
{/snippet}

<div class="estate-wrap">
  <div class="estate" bind:this={root} role="group" aria-label={label}>
    {#each model.subscriptions as sub (sub.id)}
      <section class="band" aria-label={`Subscription ${sub.name}`}>
        <header class="band-head">
          <h2 class="band-name">{sub.name}</h2>
          <span class="band-meta">
            {sub.groups.length} resource groups · {fmtInt(sub.resourceCount)} resources · {usd0(sub.costMonthly)}/mo
          </span>
        </header>

        <div class="groups">
          {#each sub.groups as g (g.name)}
            {@const gp = groupPaintOf?.(g.name)}
            {@const loose = looseOf(g)}
            <section
              class="group"
              aria-label={`Resource group ${g.name}`}
              data-ring={gp?.ring ? (gp.ringStyle ?? 'solid') : undefined}
              style:--g-ring={gp?.ring}
            >
              <header class="group-head">
                <h3 class="group-name">{g.name}</h3>
                {#if gp?.tag}
                  <span class="group-tag" style:--tag={gp.tagColor}>{gp.tag}</span>
                {/if}
                <span class="group-meta">{fmtInt(g.resourceCount)}</span>
              </header>

              <div class="pods">
                {#each vmsOf(g) as u (u.id)}
                  {@const top = u.members.filter((m) => TOP_ROLES.has(m.role))}
                  {@const disks = u.members.filter((m) => !TOP_ROLES.has(m.role))}
                  {@const hasPip = u.members.some((m) => m.role === 'pip')}
                  {@const badge = badgeOf?.(u) ?? null}
                  <button
                    type="button"
                    class="unit pod"
                    class:selected={selectedId === u.id}
                    data-unit={u.id}
                    aria-label={labelOf?.(u) ?? defaultLabel(u)}
                    aria-pressed={selectedId === u.id}
                    tabindex={tabStop === u.id ? 0 : -1}
                    {onkeydown}
                    onclick={() => onselect?.(selectedId === u.id ? null : u.id)}
                    onmouseenter={() => onhover?.(u.id)}
                    onmouseleave={() => onhover?.(null)}
                    onfocus={() => {
                      activeId = u.id;
                      onhover?.(u.id);
                    }}
                    onblur={() => onhover?.(null)}
                  >
                    <span class="pod-top">
                      {#each top as m (m.id)}
                        {@render cell(m.id, m.role, m.name)}
                      {/each}
                      {#if !hasPip}<span class="cell slot" aria-hidden="true"></span>{/if}
                    </span>
                    <span class="pod-disks">
                      {#each disks as m (m.id)}
                        {@render cell(m.id, m.role, m.name)}
                      {/each}
                    </span>
                    {#if badge}<span class="badge">{badge}</span>{/if}
                  </button>
                {/each}
              </div>

              {#if loose.length > 0}
                <div class="loose-row">
                  {#each loose as u (u.id)}
                    {@const p = paintOf(u.members[0].id)}
                    {@const badge = badgeOf?.(u) ?? null}
                    <button
                      type="button"
                      class="unit loose"
                      class:selected={selectedId === u.id}
                      data-unit={u.id}
                      data-kind={u.kind}
                      aria-label={labelOf?.(u) ?? defaultLabel(u)}
                      aria-pressed={selectedId === u.id}
                      tabindex={tabStop === u.id ? 0 : -1}
                      {onkeydown}
                      onclick={() => onselect?.(selectedId === u.id ? null : u.id)}
                      onmouseenter={() => onhover?.(u.id)}
                      onmouseleave={() => onhover?.(null)}
                      onfocus={() => {
                        activeId = u.id;
                        onhover?.(u.id);
                      }}
                      onblur={() => onhover?.(null)}
                    >
                      <span
                        class="cell loose-cell"
                        class:dim={p.dim}
                        class:faint={p.faint}
                        class:fresh={p.fresh}
                        data-role={u.members[0].role}
                        data-name={u.name}
                        data-ring={p.ring ? (p.ringStyle ?? 'solid') : undefined}
                        style:--fill={p.fill}
                        style:--ring={p.ring}
                      >
                        {#if u.kind === 'sql'}
                          <Database size="1em" strokeWidth={2.2} />
                        {:else if u.kind === 'app'}
                          <AppWindow size="1em" strokeWidth={2.2} />
                        {:else}
                          <Box size="1em" strokeWidth={2.2} />
                        {/if}
                      </span>
                      {#if badge}<span class="badge">{badge}</span>{/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </section>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .estate-wrap {
    container-type: inline-size;
    width: 100%;
  }
  .estate {
    /* Everything is sized in `u`, which follows the container width: a laptop
       gets small-but-legible pods, a projector gets big ones. */
    --u: clamp(6.5px, calc((100cqw - 4px) / 98), 12.5px);
    --link: var(--color-border-strong);
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2.2);
  }

  /* ── bands & groups ─────────────────────────────────────────────── */
  .band-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-bottom: calc(var(--u) * 0.9);
  }
  .band-name {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  .band-meta {
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .groups {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: calc(var(--u) * 1.2);
    align-items: start;
  }
  @container (max-width: 620px) {
    .groups {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .group {
    border: 1px solid var(--color-border-default);
    border-radius: 12px;
    background: var(--color-panel-bg);
    padding: calc(var(--u) * 1) calc(var(--u) * 1) calc(var(--u) * 1.1);
  }
  .group[data-ring='solid'] {
    outline: 2px solid var(--g-ring);
    outline-offset: 1px;
  }
  .group[data-ring='dashed'] {
    outline: 2px dashed var(--g-ring);
    outline-offset: 1px;
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: calc(var(--u) * 0.9);
  }
  .group-name {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .group-tag {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 1px 7px;
    border-radius: 999px;
    color: white;
    background: var(--tag, var(--color-text-primary));
    white-space: nowrap;
  }
  .group-meta {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  /* ── units ──────────────────────────────────────────────────────── */
  .pods {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 0.55);
  }
  .unit {
    position: relative;
    display: inline-flex;
    border: 1px solid var(--color-border-default);
    background: white;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .unit:hover {
    border-color: var(--color-text-dim);
  }
  .unit.selected {
    border-color: var(--color-brand);
    box-shadow: 0 0 0 2px var(--color-brand);
  }
  .unit:focus-visible {
    outline: 2px solid var(--color-brand);
    outline-offset: 2px;
  }

  .pod {
    flex-direction: column;
    gap: calc(var(--u) * 0.45);
    padding: calc(var(--u) * 0.6);
    min-width: calc(var(--u) * 6.9);
    border-radius: calc(var(--u) * 0.9);
  }
  .pod-top {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 0.55);
  }
  .pod-disks {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 0.35);
    min-height: calc(var(--u) * 0.7);
  }

  /* ── cells ──────────────────────────────────────────────────────── */
  .cell {
    position: relative;
    flex: none;
    background: var(--fill, var(--color-border-default));
    transition: background-color 0.14s, box-shadow 0.14s, opacity 0.14s;
  }
  .cell[data-ring='solid'] {
    box-shadow: 0 0 0 calc(var(--u) * 0.22) var(--ring);
  }
  .cell[data-ring='dashed'] {
    outline: calc(var(--u) * 0.18) dashed var(--ring);
    outline-offset: calc(var(--u) * 0.2);
  }
  .cell.faint {
    opacity: 0.4;
  }
  .cell.dim {
    opacity: 0.18;
  }
  .cell.fresh {
    animation: pop 0.3s ease-out;
  }
  @keyframes pop {
    0% {
      scale: 0.4;
    }
    60% {
      scale: 1.3;
    }
    100% {
      scale: 1;
    }
  }
  .cell[data-role='vm'] {
    width: calc(var(--u) * 2.2);
    height: calc(var(--u) * 2.2);
    border-radius: calc(var(--u) * 0.45);
  }
  .cell[data-role='nic'] {
    width: calc(var(--u) * 1.15);
    height: calc(var(--u) * 1.15);
    border-radius: 50%;
  }
  .cell[data-role='pip'],
  .cell.slot {
    width: calc(var(--u) * 1);
    height: calc(var(--u) * 1);
    border-radius: calc(var(--u) * 0.2);
  }
  /* No public IP: the empty slot says so. */
  .cell.slot {
    background: transparent;
    border: 1px dashed var(--color-border-strong);
  }
  .cell[data-role='osDisk'] {
    width: calc(var(--u) * 2.2);
    height: calc(var(--u) * 0.7);
    border-radius: calc(var(--u) * 0.2);
  }
  .cell[data-role='dataDisk'] {
    width: calc(var(--u) * 1.7);
    height: calc(var(--u) * 0.7);
    border-radius: calc(var(--u) * 0.2);
  }
  /* A hairline VM → NIC → IP so a pod reads as one connected thing. */
  .cell[data-role='nic']::before,
  .cell[data-role='pip']::before {
    content: '';
    position: absolute;
    right: 100%;
    top: 50%;
    width: calc(var(--u) * 0.55);
    height: 1px;
    background: var(--link);
  }

  .loose-row {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 0.5);
  }
  .pods + .loose-row {
    margin-top: calc(var(--u) * 0.9);
    padding-top: calc(var(--u) * 0.9);
    border-top: 1px dashed var(--color-border-default);
  }
  .loose {
    border-radius: calc(var(--u) * 0.6);
    padding: calc(var(--u) * 0.4);
  }
  .loose-cell {
    display: grid;
    place-items: center;
    width: calc(var(--u) * 2.3);
    height: calc(var(--u) * 2.3);
    border-radius: calc(var(--u) * 0.4);
    font-size: calc(var(--u) * 1.35);
    color: var(--color-text-secondary);
  }

  .badge {
    position: absolute;
    top: -8px;
    right: -6px;
    z-index: 2;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    color: white;
    background: var(--color-text-primary);
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell,
    .unit {
      transition: none;
    }
    .cell.fresh {
      animation: none;
    }
  }
</style>
