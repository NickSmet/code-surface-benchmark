<script lang="ts">
  import { clipLines, isJson, tokenizeJson } from '$lib/tour/json-highlight';
  import { fmtInt } from '$lib/utils';

  interface Props {
    /** The text to show, already indented. Text that is not JSON is shown plain. */
    text: string;
    /** Accessible name of the scrollable region. */
    label: string;
    /** Show only the first lines; the rest is one button away. */
    maxLines?: number;
    /** Called by the "more lines" button (usually: open the full result). */
    onmore?: () => void;
  }
  let { text, label, maxLines = Infinity, onmore }: Props = $props();

  const clip = $derived(clipLines(text, maxLines));
  const tokens = $derived(isJson(text) ? tokenizeJson(clip.text) : null);
</script>

<!-- Scrollable region: focusable on purpose so keyboard users can scroll the result. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="json" role="region" aria-label={label} tabindex="0">
  {#if tokens}<pre>{#each tokens as t}{#if t.k === 'plain'}{t.s}{:else}<span class="j-{t.k}">{t.s}</span>{/if}{/each}</pre>{:else}<pre>{clip.text}</pre>{/if}
  {#if clip.more > 0}
    <button type="button" class="more" disabled={!onmore} onclick={onmore}>
      &hellip; {fmtInt(clip.more)} more {clip.more === 1 ? 'line' : 'lines'}{#if onmore}<span class="go">Expand to see all</span>{/if}
    </button>
  {/if}
</div>

<style>
  .json {
    flex: 1 1 0;
    min-height: 0;
    overflow: auto;
    background: var(--color-expanded-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 9px;
  }
  pre {
    margin: 0;
    padding: 9px 12px;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.5;
    tab-size: 2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--color-text-secondary);
  }
  /* Contrast on the pale background is at least 4.5:1 for every colour. */
  .j-key {
    color: #1d4ed8;
  }
  .j-str {
    color: #047857;
  }
  .j-num {
    color: #b45309;
  }
  .j-lit {
    color: #7c3aed;
  }
  .j-punct {
    color: #64748b;
  }
  .more {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 7px 12px;
    border-top: 1px dashed var(--color-border-strong);
    text-align: left;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .more:not(:disabled):hover {
    background: var(--color-hover-bg);
  }
  .go {
    font-family: var(--font-sans);
    font-weight: 700;
    color: var(--color-brand);
  }
</style>
