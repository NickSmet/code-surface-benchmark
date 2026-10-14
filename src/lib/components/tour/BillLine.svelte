<script lang="ts">
  import type { RunBill } from '$lib/tour/replay-view';
  import { fmtTokens } from '$lib/tour/tokens';
  import { BILLED_TIP, CACHE_TIP, INPUT_RUN_TIP, OUTPUT_TIP } from '$lib/tour/explain';
  import { RUN_COLOR } from '$lib/tour/run-colors';
  import Tip from './Tip.svelte';

  interface Props {
    /** The whole run: what the model read, what it wrote, and what that adds up to. */
    bill: RunBill;
  }
  let { bill }: Props = $props();
</script>

<p class="line" role="group" aria-label="The whole run: what the model read and wrote, and the total billed">
  <span class="cell">
    <Tip class="k" text={INPUT_RUN_TIP}>Input</Tip>
    <b>{fmtTokens(bill.input)}</b>
    <span class="d">
      {#if bill.cached > 0}
        <Tip text={CACHE_TIP}>{fmtTokens(bill.cached)} cached</Tip> · {fmtTokens(bill.fresh)} new
      {:else}
        all new
      {/if}
    </span>
  </span>
  <!-- An operator stays with the number after it, so a narrow column never ends a line on a bare + or =. -->
  <span class="seq">
    <span class="op" aria-hidden="true">+</span>
    <span class="cell">
      <Tip class="k" text={OUTPUT_TIP}><i class="dot" style:background-color={RUN_COLOR.output}></i>Output</Tip>
      <b>{fmtTokens(bill.output)}</b>
    </span>
  </span>
  <span class="seq">
    <span class="op" aria-hidden="true">=</span>
    <span class="cell">
      <Tip class="k" text={BILLED_TIP}>Billed</Tip>
      <b class="total">≈ {fmtTokens(bill.total)}</b>
    </span>
  </span>
</p>

<style>
  .line {
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
  .seq {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    white-space: nowrap;
  }
  .line .cell :global(.k) {
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
  b.total {
    font-size: 15px;
  }
  .d {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .op {
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
</style>
