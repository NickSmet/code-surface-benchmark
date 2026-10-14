<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The explanation. */
    text: string;
    /** The words the explanation hangs off. */
    children: Snippet;
    /** Class for the trigger, so it can match the text around it. */
    class?: string;
    /** Widest the bubble gets, in px. */
    width?: number;
  }
  let { text, children, class: klass = '', width = 280 }: Props = $props();

  const uid = $props.id();

  // Three ways to open it: pointer over it, keyboard focus, or a click that pins it open.
  let hover = $state(false);
  let focus = $state(false);
  let pinned = $state(false);
  const open = $derived(hover || focus || pinned);

  let trigger = $state<HTMLButtonElement>();
  let bubble = $state<HTMLElement>();
  let pos = $state({ left: 0, top: 0 });
  let placed = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Over the trigger a moment, not merely passing across it. */
  function enter() {
    clearTimeout(timer);
    timer = setTimeout(() => (hover = true), 120);
  }
  function leave() {
    clearTimeout(timer);
    hover = false;
  }
  function close() {
    clearTimeout(timer);
    hover = false;
    focus = false;
    pinned = false;
  }

  /** Above the trigger when there is room, below when not, and always inside the window. */
  function place() {
    if (!trigger || !bubble) return;
    const t = trigger.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const gap = 8;
    const edge = 8;
    const left = Math.min(Math.max(edge, t.left + t.width / 2 - b.width / 2), innerWidth - b.width - edge);
    const above = t.top - b.height - gap;
    pos = { left, top: above >= edge ? above : t.bottom + gap };
    placed = true;
  }

  // The bubble lives in the top layer, so no panel's overflow can clip it.
  $effect(() => {
    if (!open || !bubble) return;
    try {
      bubble.showPopover();
    } catch {
      /* Already showing, or no Popover API: it is fixed-positioned either way. */
    }
    place();
    return () => {
      placed = false;
    };
  });

  $effect(() => () => clearTimeout(timer));

  function onpointerdown(e: PointerEvent) {
    if (pinned && !trigger?.contains(e.target as Node)) pinned = false;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) close();
  }
</script>

<svelte:window {onpointerdown} {onkeydown} onresize={() => open && place()} onscrollcapture={() => open && place()} />

<span class="wrap">
  <button
    bind:this={trigger}
    type="button"
    class="tip {klass}"
    data-open={open}
    aria-describedby={open ? uid : undefined}
    onpointerenter={enter}
    onpointerleave={leave}
    onfocus={(e) => (focus = e.currentTarget.matches(':focus-visible'))}
    onblur={() => (focus = false)}
    onclick={() => {
      pinned = !pinned;
      if (!pinned) hover = false;
    }}
  >{@render children()}</button>
  {#if open}
    <span
      bind:this={bubble}
      id={uid}
      role="tooltip"
      popover="manual"
      class="bubble"
      style:left="{pos.left}px"
      style:top="{pos.top}px"
      style:visibility={placed ? 'visible' : 'hidden'}
      style:--w="{width}px"
    >{text}</span>
  {/if}
</span>

<style>
  .wrap {
    display: inline;
  }
  .tip {
    appearance: none;
    background: none;
    border: 0;
    margin: 0;
    padding: 0;
    border-radius: 3px;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    text-align: inherit;
    color: inherit;
    cursor: help;
    text-decoration: underline dotted;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
  }
  .tip:hover,
  .tip[data-open='true'] {
    text-decoration-color: currentColor;
  }
  .bubble {
    position: fixed;
    inset: auto;
    margin: 0;
    box-sizing: border-box;
    width: max-content;
    max-width: min(var(--w), calc(100vw - 16px));
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    overflow: visible;
    background: #0f172a;
    color: #f8fafc;
    font: 500 12.5px/1.45 var(--font-sans);
    letter-spacing: 0;
    text-transform: none;
    text-align: left;
    white-space: normal;
    box-shadow: 0 6px 24px rgba(15, 23, 42, 0.28);
    pointer-events: none;
  }
</style>
