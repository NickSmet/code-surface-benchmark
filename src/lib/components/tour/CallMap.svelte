<script lang="ts">
  import type { ReplayTurn } from '$lib/tour/replay';

  interface Props {
    turns: ReplayTurn[];
    /** A result this big, in tokens, is as dark as a square gets. */
    cap?: number;
  }
  let { turns, cap = 600 }: Props = $props();

  // One square per call, grouped by the turn that made it: the round trips the model waits for.
  const waves = $derived(turns.filter((t) => t.calls.length > 0));
  const calls = $derived(waves.reduce((n, t) => n + t.calls.length, 0));
  const summary = $derived(`${calls} ${calls === 1 ? 'call' : 'calls'} in ${waves.length} ${waves.length === 1 ? 'turn' : 'turns'}`);
</script>

<span class="map" role="img" aria-label={summary}>
  {#each waves as turn (turn.n)}
    <span class="wave">
      {#each turn.calls as c (c.id)}
        <span class="sq" style:opacity={0.3 + 0.7 * Math.min(1, c.resultTokens / cap)} title="{c.name} {c.argsText}"></span>
      {/each}
    </span>
  {/each}
</span>

<style>
  .map {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px 8px;
    min-width: 0;
  }
  .wave {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 3px;
    border-radius: 6px;
    background: var(--color-expanded-bg);
    max-width: 100%;
  }
  .sq {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    background: #4f46e5;
  }
</style>
