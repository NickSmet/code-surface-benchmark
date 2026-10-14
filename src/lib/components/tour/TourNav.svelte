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
      <ArrowLeft size={18} />
      <span><span class="hint">Back</span><span class="label">{prev.label}</span></span>
    </a>
  {:else}
    <span></span>
  {/if}
  {#if next}
    <a class="link next" href={next.href}>
      <span><span class="hint">{next.hint ?? 'Next'}</span><span class="label">{next.label}</span></span>
      <ArrowRight size={18} />
    </a>
  {/if}
</nav>

<style>
  .nav {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding-top: 6px;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-radius: 12px;
    border: 1px solid var(--color-border-default);
    background: white;
    text-decoration: none;
    color: var(--color-text-primary);
    transition: border-color 0.12s, background 0.12s;
  }
  .link:hover {
    border-color: var(--color-brand);
    background: var(--color-brand-bg);
  }
  .next {
    margin-left: auto;
    text-align: right;
  }
  .hint {
    display: block;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .label {
    display: block;
    font-size: 16px;
    font-weight: 750;
  }
</style>
