<script lang="ts">
  interface Props {
    label: string;
    value: string | number;
    sub?: string;
    /** Colour for the number. */
    tone?: string;
    /** Smaller number, for dense rows. */
    compact?: boolean;
  }
  let { label, value, sub, tone, compact = false }: Props = $props();
</script>

<div class="stat" class:compact>
  <span class="label">{label}</span>
  <span class="value" style:color={tone}>{value}</span>
  {#if sub}<span class="sub">{sub}</span>{/if}
</div>

<style>
  .stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .value {
    font-family: var(--font-mono);
    font-size: 34px;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .compact .value {
    font-size: 24px;
  }
  .sub {
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
</style>
