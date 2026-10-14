<script lang="ts">
  import { KIND_HINT, KIND_LABEL, KIND_SHORT } from '$lib/tour/paint';
  import { TOUCH_KINDS, type TouchCounts, type TouchKind } from '$lib/tour/touch';
  import { fmtInt } from '$lib/utils';

  interface Props {
    counts: TouchCounts;
    /** Which kinds are meaningful on this screen. */
    kinds?: TouchKind[];
    /** Highlight one kind on the map (hover/focus previews, click pins). */
    emphasis?: TouchKind | null;
    /** The resources the question really needs, drawn as a dashed outline. */
    needle?: { count: number } | null;
    /** Smaller chips with one or two words each; the long wording stays in the tooltip. */
    short?: boolean;
  }
  let { counts, kinds = TOUCH_KINDS, emphasis = $bindable(null), needle = null, short = false }: Props = $props();

  let pinned = $state<TouchKind | null>(null);

  function toggle(k: TouchKind): void {
    pinned = pinned === k ? null : k;
    emphasis = pinned ?? k;
  }

  const label = (k: TouchKind): string => (short ? KIND_SHORT[k] : KIND_LABEL[k]);
</script>

<div class="legend" class:short role="group" aria-label="How resources were touched">
  {#each kinds as k (k)}
    <button
      type="button"
      class="item"
      data-kind={k}
      data-active={emphasis === k ? 'true' : undefined}
      aria-pressed={pinned === k}
      title="{KIND_LABEL[k]}. {KIND_HINT[k]}"
      onmouseenter={() => (emphasis = k)}
      onmouseleave={() => (emphasis = pinned)}
      onfocus={() => (emphasis = k)}
      onblur={() => (emphasis = pinned)}
      onclick={() => toggle(k)}
    >
      <span class="sw" aria-hidden="true"></span>
      <span class="num">{fmtInt(counts[k])}</span>
      <span class="lbl">{label(k)}</span>
    </button>
  {/each}
  {#if needle}
    <span class="item static" data-kind="needle" title="Needed by the question: the resources it actually depends on.">
      <span class="sw" aria-hidden="true"></span>
      <span class="num">{fmtInt(needle.count)}</span>
      <span class="lbl">{short ? 'needed' : 'Needed by the question'}</span>
    </span>
  {/if}
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
  }
  .item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 11px 5px 8px;
    border-radius: 999px;
    border: 1px solid var(--color-border-default);
    background: white;
    font-size: 13px;
    color: var(--color-text-secondary);
    transition: border-color 0.12s, background 0.12s;
  }
  button.item:hover,
  .item[data-active='true'] {
    border-color: var(--color-text-secondary);
    background: var(--color-hover-bg);
  }
  .item.static {
    cursor: default;
  }
  .num {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 800;
    color: var(--color-text-primary);
    min-width: 1.4ch;
    text-align: right;
  }
  .lbl {
    font-weight: 550;
  }
  .sw {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: var(--color-border-default);
    flex: none;
  }

  /* Short: a row of small chips that never competes with the map. */
  .short {
    gap: 4px 5px;
  }
  .short .item {
    gap: 6px;
    padding: 1px 9px 1px 6px;
    font-size: 12.5px;
  }
  .short .num {
    font-size: 13px;
    min-width: 1.2ch;
  }
  .short .sw {
    width: 11px;
    height: 11px;
    border-radius: 3px;
  }

  [data-kind='listed'] .sw {
    background: #bfc4fa;
  }
  [data-kind='read'] .sw {
    background: #6366f1;
  }
  [data-kind='scanned'] .sw {
    background: var(--color-border-default);
    box-shadow: 0 0 0 2px #0d9488;
    margin: 2px;
    width: 10px;
    height: 10px;
  }
  .short [data-kind='scanned'] .sw {
    width: 8px;
    height: 8px;
  }
  [data-kind='written'] .sw {
    background: #059669;
  }
  [data-kind='needle'] .sw {
    background: transparent;
    outline: 2px dashed #0f172a;
    outline-offset: 1px;
    margin: 2px;
    width: 10px;
    height: 10px;
  }
  .short [data-kind='needle'] .sw {
    width: 8px;
    height: 8px;
  }
</style>
