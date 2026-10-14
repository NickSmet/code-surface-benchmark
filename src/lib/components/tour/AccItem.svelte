<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronRight } from '@lucide/svelte';

  interface Props {
    /** Unique within its list. */
    id: string;
    open: boolean;
    ontoggle: (id: string) => void;
    /** Colour the item to say who is speaking. */
    tone?: 'plain' | 'you' | 'answer';
    /** The playhead is inside this item. */
    current?: boolean;
    /** One line, always visible. */
    head: Snippet;
    /** Only rendered while open. */
    children: Snippet;
  }
  let { id, open, ontoggle, tone = 'plain', current = false, head, children }: Props = $props();

  // WAI-ARIA accordion: up/down move between headers of the same list.
  function onkeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const list = (e.currentTarget as HTMLElement).closest('[data-acc-list]');
    if (!list) return;
    const all = [...list.querySelectorAll<HTMLElement>('[data-acc-btn]')];
    const i = all.indexOf(e.currentTarget as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : e.key === 'ArrowDown' ? i + 1 : i - 1;
    if (next < 0 || next >= all.length) return;
    e.preventDefault();
    all[next].focus();
  }
</script>

<section class="acc" class:open class:current data-tone={tone} data-acc={id}>
  <h3 class="h">
    <button type="button" class="btn" id="acc-btn-{id}" data-acc-btn aria-expanded={open} aria-controls="acc-{id}" {onkeydown} onclick={() => ontoggle(id)}>
      <ChevronRight class="chev" size={14} strokeWidth={2.4} />
      <span class="head">{@render head()}</span>
    </button>
  </h3>
  <div class="body" id="acc-{id}" role="region" aria-labelledby="acc-btn-{id}" hidden={!open}>
    {#if open}{@render children()}{/if}
  </div>
</section>

<style>
  .acc {
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--color-border-default);
    border-radius: 9px;
    background: white;
    transition: border-color 0.12s, background 0.12s;
  }
  .acc.open {
    /* The open item takes the spare height; its body scrolls, its header never does. */
    flex: 1 1 190px;
    min-height: 190px;
    border-color: var(--color-border-strong);
  }
  .acc.current {
    /* An inset bar, not a thicker border, so nothing shifts when the playhead moves. */
    box-shadow: inset 3px 0 0 var(--color-brand);
  }
  .acc[data-tone='you'] {
    background: var(--color-brand-bg);
    border-color: #b7d3ee;
  }
  .acc[data-tone='answer'] {
    background: var(--good-bg);
    border-color: #a7e3c8;
  }
  .h {
    margin: 0;
    font: inherit;
  }
  .btn {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    min-height: 28px;
    padding: 3px 10px 3px 8px;
    border-radius: 8px;
    text-align: left;
    color: var(--color-text-secondary);
  }
  .btn:hover {
    background: rgba(15, 23, 42, 0.04);
  }
  .btn :global(.chev) {
    flex: none;
    color: var(--color-text-dim);
    transition: transform 0.14s ease;
  }
  .open .btn :global(.chev) {
    transform: rotate(90deg);
    color: var(--color-text-secondary);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    flex: 1;
    font-size: 13px;
  }
  .head :global(svg) {
    align-self: center;
    flex: none;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 2px 10px 10px 12px;
  }
  .body[hidden] {
    display: none;
  }
</style>
