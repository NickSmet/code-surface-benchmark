<script lang="ts" module>
  import type { Wrench } from '@lucide/svelte';

  export interface TabItem {
    /** Unique within the strip. */
    id: string;
    label: string;
    /** Any lucide icon. */
    icon?: typeof Wrench;
    /** Hover text. */
    title?: string;
    /** Colour the tab to say who is speaking. */
    tone?: 'plain' | 'you' | 'answer';
    /** The replay is on this tab while a different one is open. */
    here?: boolean;
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { browser } from '$app/environment';
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';

  interface Props {
    items: TabItem[];
    selected: string;
    onselect: (id: string) => void;
    /** Accessible name of the tab list. */
    label: string;
    /** The one panel these tabs switch. */
    panelId: string;
    /** Animate the selected tab into view. Turn this off while something else is moving. */
    smooth?: boolean;
  }
  let { items, selected, onselect, label, panelId, smooth = true }: Props = $props();

  let scroller = $state<HTMLElement | null>(null);
  let canLeft = $state(false);
  let canRight = $state(false);
  let placed = false;

  const reduced = (): boolean => browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function measure(): void {
    const el = scroller;
    if (!el) return;
    canLeft = el.scrollLeft > 1;
    canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  }

  function nudge(dir: -1 | 1): void {
    const el = scroller;
    if (el) el.scrollBy({ left: dir * Math.max(120, (el.clientWidth * 2) / 3), behavior: reduced() ? 'auto' : 'smooth' });
  }

  /** Scroll the strip, and only the strip, so the selected tab is fully visible and clear of the arrows. */
  function showSelected(): void {
    const el = scroller;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab) return;
    const pad = 34;
    const box = el.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    let left = el.scrollLeft;
    if (r.left < box.left + pad) left += r.left - box.left - pad;
    else if (r.right > box.right - pad) left += r.right - box.right + pad;
    left = Math.max(0, left);
    if (Math.abs(left - el.scrollLeft) > 1) el.scrollTo({ left, behavior: placed && smooth && !reduced() ? 'smooth' : 'auto' });
    placed = true;
  }

  // Follow the selection, and recount the arrows when tabs come or go.
  $effect(() => {
    void selected;
    void items.length;
    void tick().then(() => {
      showSelected();
      measure();
    });
  });
  $effect(() => {
    const el = scroller;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // WAI-ARIA tabs with automatic activation: arrows move and select, one tab stop.
  function onkeydown(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey || items.length === 0) return;
    const i = Math.max(0, items.findIndex((t) => t.id === selected));
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onselect(items[next].id);
    void tick().then(() => scroller?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus());
  }
</script>

<div class="strip" class:can-left={canLeft} class:can-right={canRight}>
  <button type="button" class="nudge left" tabindex="-1" aria-label="Scroll the tabs left" onclick={() => nudge(-1)}>
    <ChevronLeft size={15} strokeWidth={2.4} />
  </button>
  <div class="scroller" role="tablist" aria-label={label} bind:this={scroller} onscroll={measure}>
    {#each items as it (it.id)}
      {@const Icon = it.icon}
      <button
        type="button"
        role="tab"
        class="tab"
        class:on={it.id === selected}
        data-tone={it.tone ?? 'plain'}
        id="tab-{it.id}"
        aria-selected={it.id === selected}
        aria-controls={panelId}
        tabindex={it.id === selected ? 0 : -1}
        title={it.title}
        {onkeydown}
        onclick={() => onselect(it.id)}
      >
        {#if Icon}<Icon size={13} />{/if}
        <span>{it.label}</span>
        {#if it.here}<span class="here" role="img" aria-label="The replay is here" title="The replay is here"></span>{/if}
      </button>
    {/each}
  </div>
  <button type="button" class="nudge right" tabindex="-1" aria-label="Scroll the tabs right" onclick={() => nudge(1)}>
    <ChevronRight size={15} strokeWidth={2.4} />
  </button>
</div>

<style>
  .strip {
    position: relative;
    display: flex;
    min-width: 0;
    border-bottom: 1px solid var(--color-border-default);
  }
  .scroller {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 2px;
    padding: 0 2px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  .scroller::-webkit-scrollbar {
    display: none;
  }
  .tab {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 31px;
    margin-bottom: -1px;
    padding: 0 11px;
    border-bottom: 2px solid transparent;
    border-radius: 8px 8px 0 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-muted);
    white-space: nowrap;
    transition: background 0.12s, color 0.12s;
  }
  .tab:hover:not(.on) {
    background: rgba(15, 23, 42, 0.05);
    color: var(--color-text-primary);
  }
  .tab.on {
    color: var(--color-text-primary);
    border-bottom-color: var(--color-brand);
    background: white;
  }
  .tab[data-tone='you'].on {
    background: var(--color-brand-bg);
  }
  .tab[data-tone='answer'].on {
    border-bottom-color: var(--good);
    background: var(--good-bg);
  }
  .here {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-brand);
  }
  .nudge {
    position: absolute;
    top: 0;
    bottom: 1px;
    z-index: 2;
    display: none;
    align-items: center;
    width: 32px;
    color: var(--color-text-secondary);
  }
  .nudge.left {
    left: 0;
    justify-content: flex-start;
    padding-left: 5px;
    background: linear-gradient(to right, var(--color-panel-bg) 55%, transparent);
  }
  .nudge.right {
    right: 0;
    justify-content: flex-end;
    padding-right: 5px;
    background: linear-gradient(to left, var(--color-panel-bg) 55%, transparent);
  }
  .nudge:hover {
    color: var(--color-brand);
  }
  .can-left .nudge.left,
  .can-right .nudge.right {
    display: flex;
  }
</style>
