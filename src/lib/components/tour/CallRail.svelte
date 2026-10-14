<script lang="ts">
  import { tick } from 'svelte';
  import type { ReplayCall } from '$lib/tour/replay';
  import { fmtTokens } from '$lib/tour/tokens';

  interface Props {
    /** The calls of one turn that have happened so far. */
    calls: ReplayCall[];
    /** The call whose result is on show. */
    shown: number;
    /** The call the replay is on. */
    now: number;
    /** Jump the replay to this call. */
    onpick: (step: number) => void;
    /** Hovering or focusing a call previews what it touched on the map. */
    onhover: (step: number | null) => void;
    label: string;
  }
  let { calls, shown, now, onpick, onhover, label }: Props = $props();

  let box = $state<HTMLElement | null>(null);

  // Keep the call on show inside the list, scrolling the list and nothing else.
  $effect(() => {
    void shown;
    void calls.length;
    void tick().then(() => {
      const el = box?.querySelector<HTMLElement>('[data-shown]');
      if (!box || !el) return;
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.top < b.top + 4) box.scrollTop += r.top - b.top - 4;
      else if (r.bottom > b.bottom - 4) box.scrollTop += r.bottom - b.bottom + 4;
    });
  });
</script>

<ol class="rail" aria-label={label} bind:this={box}>
  {#each calls as c (c.step)}
    <li data-shown={c.step === shown ? '' : undefined}>
      <button
        type="button"
        class="row"
        class:shown={c.step === shown}
        class:now={c.step === now}
        aria-current={c.step === now ? 'step' : undefined}
        onclick={() => onpick(c.step)}
        onmouseenter={() => onhover(c.step)}
        onmouseleave={() => onhover(null)}
        onfocus={() => onhover(c.step)}
        onblur={() => onhover(null)}
      >
        <span class="num">{c.step}</span>
        <span class="txt">
          <span class="tool">{c.name}</span>
          <span class="prev">{c.preview}</span>
        </span>
        <span class="tok" title="Tokens this result adds to the next request">+{fmtTokens(c.resultSentTokens)}</span>
      </button>
    </li>
  {/each}
</ol>

<style>
  .rail {
    list-style: none;
    margin: 0;
    padding: 0 4px 0 0;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 8px 4px 5px;
    border-radius: 8px;
    text-align: left;
  }
  .row:hover {
    background: rgba(99, 102, 241, 0.08);
  }
  .row.shown {
    background: var(--color-brand-bg);
    box-shadow: inset 2px 0 0 var(--color-brand);
  }
  .num {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #e6e8fe;
    color: #4338ca;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
  }
  .now .num {
    background: var(--color-brand);
    color: white;
  }
  .txt {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .tool {
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 800;
    color: var(--color-text-primary);
  }
  .prev {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .tool,
  .prev {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tok {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    color: #4338ca;
  }
</style>
