<script lang="ts">
  import type { TurnFlow } from '$lib/tour/replay-view';
  import { fmtTokens } from '$lib/tour/tokens';
  import { CACHE_TIP, INPUT_TIP, OUTPUT_ANSWER_TIP, OUTPUT_CALL_TIP, RESULT_TIP } from '$lib/tour/explain';
  import Tip from './Tip.svelte';

  interface Props {
    /** What the turn read and wrote. */
    flow: TurnFlow;
    /** Tokens the shown call's result adds to the next request. Left out on the answer, which has none. */
    result?: number;
    /** What the calls are, when that is worth saying: "the program". */
    what?: string;
  }
  let { flow, result, what }: Props = $props();

  const answer = $derived(flow.calls === 0);
</script>

<p class="flow" role="group" aria-label="This turn: what the model read, what it wrote, and what came back">
  <span class="cell">
    <Tip class="k" text={INPUT_TIP}>Input</Tip>
    <b>{fmtTokens(flow.input)}</b>
    <span class="d">
      {#if flow.cached > 0}
        <Tip text={CACHE_TIP}>{fmtTokens(flow.cached)} cached</Tip> · {fmtTokens(flow.fresh)} new
      {:else}
        all new
      {/if}
    </span>
  </span>
  <span class="arrow" aria-hidden="true">→</span>
  <span class="cell">
    <Tip class="k" text={answer ? OUTPUT_ANSWER_TIP : OUTPUT_CALL_TIP}><i class="dot out"></i>Output</Tip>
    <b>{fmtTokens(flow.output)}</b>
    {#if answer}
      <span class="d">the answer</span>
    {:else if what}
      <span class="d">{what}</span>
    {:else if flow.calls > 1}
      <span class="d">{flow.calls} calls</span>
    {/if}
  </span>
  {#if result !== undefined}
    <span class="arrow" aria-hidden="true">→</span>
    <span class="cell">
      <Tip class="k" text={RESULT_TIP}><i class="dot res"></i>Result</Tip>
      <b>+{fmtTokens(result)}</b>
    </span>
  {/if}
</p>

<style>
  .flow {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .cell {
    display: inline-flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 6px;
  }
  .flow .cell :global(.k) {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  b {
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 800;
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }
  .d {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .arrow {
    color: var(--color-text-dim, #94a3b8);
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 5px;
    border-radius: 2px;
    vertical-align: baseline;
  }
  .dot.out {
    background: #f59e0b;
  }
  .dot.res {
    background: #4f46e5;
  }
</style>
