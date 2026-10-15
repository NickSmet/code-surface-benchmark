<script lang="ts" generics="T extends string">
  interface Option {
    id: T;
    label: string;
    /** Small trailing text, e.g. a hotkey or a count. */
    hint?: string;
    title?: string;
  }
  interface Props {
    options: Option[];
    value: T;
    onchange: (id: T) => void;
    label: string;
    /** Accent colour for the selected option. */
    accent?: string;
    size?: 'md' | 'sm';
  }
  let { options, value, onchange, label, accent, size = 'md' }: Props = $props();

  let root = $state<HTMLElement | null>(null);

  // When the selection changes, the new one pulses once: a change made from the keyboard can be seen from across a room.
  let flash = $state(false);
  let shown: T | undefined;
  $effect(() => {
    const now = value;
    if (shown === undefined || shown === now) {
      shown = now;
      return;
    }
    shown = now;
    flash = true;
    const id = setTimeout(() => (flash = false), 900);
    return () => clearTimeout(id);
  });

  // Radio-group keyboard model: arrows move and select, one tab stop.
  function onkeydown(e: KeyboardEvent): void {
    const i = options.findIndex((o) => o.id === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onchange(options[next].id);
    queueMicrotask(() => root?.querySelectorAll<HTMLElement>('[role=radio]')[next]?.focus());
  }
</script>

<div class="seg" class:sm={size === 'sm'} class:flash role="radiogroup" aria-label={label} bind:this={root} style:--accent={accent}>
  {#each options as o (o.id)}
    <button
      type="button"
      role="radio"
      aria-checked={value === o.id}
      tabindex={value === o.id ? 0 : -1}
      title={o.title}
      class:on={value === o.id}
      {onkeydown}
      onclick={() => onchange(o.id)}
    >
      {o.label}
      {#if o.hint}<span class="hint">{o.hint}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    border-radius: 11px;
    border: 1px solid var(--color-border-default);
    background: var(--color-expanded-bg);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-muted);
    white-space: nowrap;
    transition: background 0.12s, color 0.12s;
  }
  .sm button {
    padding: 4px 10px;
    font-size: 13px;
  }
  button:hover:not(.on) {
    background: white;
    color: var(--color-text-primary);
  }
  button.on {
    background: var(--accent, var(--color-text-primary));
    color: white;
  }
  .hint {
    font-family: var(--font-mono);
    font-size: 11.5px;
    opacity: 0.65;
  }

  .flash button.on {
    animation: pulse 0.9s ease-out;
  }
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent, var(--color-text-primary)) 55%, transparent);
      transform: scale(1);
    }
    30% {
      transform: scale(1.07);
    }
    100% {
      box-shadow: 0 0 0 12px transparent;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash button.on {
      animation: none;
    }
  }
</style>
