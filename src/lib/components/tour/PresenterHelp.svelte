<script lang="ts">
  import { X } from '@lucide/svelte';
  import { usePresenter } from '$lib/tour/presenter.svelte';

  const presenter = usePresenter();

  // One row for each thing a key does. The groups are the unit Shift jumps by: an example, a turn of the model, a rung.
  const rows: Array<{ keys: string[]; what: string }> = [
    { keys: ['\u2192', 'PageDown', 'Space'], what: 'Next step' },
    { keys: ['\u2190', 'PageUp', '\u21e7 Space'], what: 'Step back' },
    { keys: ['\u21e7 \u2192', '\u21e7 \u2190'], what: 'Next / previous group: an example, a turn of the model, a rung of the ladder' },
    { keys: ['Home', 'End'], what: 'First / last step of the screen' },
    { keys: ['\u2325 \u2192', '\u2325 \u2190', '\u2318\u21e7 \u2192', ']  ['], what: 'Next / previous screen' },
    { keys: ['P'], what: 'Presenter mode on and off' },
    { keys: ['F'], what: 'Full screen' },
    { keys: ['H', '?'], what: 'This list' },
    { keys: ['Esc'], what: 'Leave the program editor, or close this list' }
  ];

  let closeButton = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    if (presenter.helpOpen) closeButton?.focus();
  });
</script>

{#if presenter.helpOpen}
  <div class="scrim" role="presentation" onclick={() => (presenter.helpOpen = false)}></div>
  <div class="card" role="dialog" aria-modal="true" aria-label="Keys for presenting">
    <header>
      <h2>Keys</h2>
      <button type="button" class="close" bind:this={closeButton} onclick={() => (presenter.helpOpen = false)} aria-label="Close"><X size={16} /></button>
    </header>
    <dl>
      {#each rows as r (r.what)}
        <div class="row">
          <dt>
            {#each r.keys as k (k)}<kbd>{k}</kbd>{/each}
          </dt>
          <dd>{r.what}</dd>
        </div>
      {/each}
    </dl>
    <p class="foot">Past the last step of a screen, → goes on to the next screen; at the first step, ← comes back to the end of the one before. A clicker that sends Page Up and Page Down works as it is.</p>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(15, 23, 42, 0.28);
  }
  .card {
    position: fixed;
    z-index: 71;
    top: 50%;
    left: 50%;
    width: min(620px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    overflow: auto;
    transform: translate(-50%, -50%);
    padding: 16px 20px 14px;
    background: white;
    border: 1px solid var(--color-border-default);
    border-radius: 16px;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.34);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
  }
  .close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-muted);
  }
  .close:hover {
    background: var(--color-hover-bg);
  }
  dl {
    display: grid;
    gap: 8px;
    margin: 12px 0 10px;
  }
  .row {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr);
    align-items: baseline;
    gap: 12px;
  }
  dt {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  dd {
    margin: 0;
    font-size: 14px;
    color: var(--color-text-secondary);
  }
  kbd {
    padding: 1px 7px;
    border: 1px solid var(--color-border-strong);
    border-bottom-width: 2px;
    border-radius: 6px;
    background: var(--color-page-bg);
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-text-primary);
  }
  .foot {
    margin: 0;
    padding-top: 10px;
    border-top: 1px solid var(--color-border-subtle);
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--color-text-muted);
  }
</style>
