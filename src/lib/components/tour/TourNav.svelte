<script lang="ts">
  import { ArrowLeft, ArrowRight } from '@lucide/svelte';

  interface Link {
    href: string;
    label: string;
    hint?: string;
  }
  interface Props {
    prev?: Link;
    next?: Link;
  }
  let { prev, next }: Props = $props();
</script>

<nav class="nav" aria-label="Previous and next step">
  {#if prev}
    <a class="link prev" href={prev.href}>
      <ArrowLeft size={15} />
      <span class="hint">Back</span>
      <span class="label">{prev.label}</span>
    </a>
  {:else}
    <span></span>
  {/if}
  {#if next}
    <a class="link next" href={next.href}>
      <span class="hint">{next.hint ?? 'Next'}</span>
      <span class="label">{next.label}</span>
      <ArrowRight size={15} />
    </a>
  {/if}
</nav>

<style>
  .nav {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .link {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 9px;
    border: 1px solid var(--color-border-default);
    background: white;
    text-decoration: none;
    color: var(--color-text-primary);
    transition: border-color 0.12s, background 0.12s;
  }
  .link :global(svg) {
    align-self: center;
    flex: none;
  }
  .link:hover {
    border-color: var(--color-brand);
    background: var(--color-brand-bg);
  }
  .next {
    margin-left: auto;
  }
  .hint {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .label {
    font-size: 14px;
    font-weight: 700;
  }
</style>
