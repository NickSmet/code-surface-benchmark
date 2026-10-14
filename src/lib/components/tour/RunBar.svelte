<script lang="ts">
  import type { RunBill } from '$lib/tour/replay-view';
  import { RUN_COLOR } from '$lib/tour/run-colors';
  import { fmtTokens } from '$lib/tour/tokens';

  interface Props {
    bill: RunBill;
    /** Tokens a full-width track stands for. Bars that share a scale can be compared by length. */
    scale: number;
    /** Thickness in px. */
    height?: number;
  }
  let { bill, scale, height = 16 }: Props = $props();

  // Left to right, as the turn chart stacks bottom to top: text read again, text read for the first time, what was written.
  const summary = $derived(
    `${fmtTokens(bill.total)} tokens billed. Read ${fmtTokens(bill.input)}: ${fmtTokens(bill.cached)} cached, ${fmtTokens(bill.fresh)} new. Wrote ${fmtTokens(bill.output)}.`
  );
</script>

<span class="track" style:height="{height}px" style:border-radius="{height > 20 ? 7 : 5}px" role="img" aria-label={summary} title={summary}>
  <span class="fill" style:width="{(bill.total / Math.max(1, scale)) * 100}%">
    <span class="seg cached" style:flex="{bill.cached} {bill.cached} 0px" style:background-color={RUN_COLOR.cached}></span>
    <span class="seg" style:flex="{bill.fresh} {bill.fresh} 0px" style:background-color={RUN_COLOR.fresh}></span>
    <!-- What it wrote is a sliver next to what it read, so it never drops below a few pixels. -->
    <span class="seg out" style:flex="{bill.output} {bill.output} 0px" style:background-color={RUN_COLOR.output}></span>
  </span>
</span>

<style>
  .track {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    overflow: hidden;
    background: var(--color-expanded-bg);
  }
  .fill {
    display: flex;
    height: 100%;
    min-width: 0;
    transition: width 0.3s ease;
  }
  .seg {
    height: 100%;
    min-width: 0;
  }
  /* A hairline between neighbours that takes no room. */
  .seg + .seg {
    box-shadow: -1px 0 0 rgba(255, 255, 255, 0.9);
  }
  /* Cached text: lightly hatched, so it does not depend on colour alone. */
  .seg.cached {
    background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0 2px, transparent 2px 6px);
  }
  .seg.out {
    min-width: 3px;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
