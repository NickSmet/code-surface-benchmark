<script lang="ts">
  import { Sparkles } from '@lucide/svelte';
  import type { PanelState } from '$lib/client/panel.svelte';
  import { renderMarkdown } from '$lib/markdown';
  import { fmtInt, fmtMs, fmtUsd } from '$lib/utils';

  interface Props {
    catalog: PanelState;
    code: PanelState;
    taskLabel: string;
  }

  let { catalog, code, taskLabel }: Props = $props();

  type DeltaTone = 'good' | 'bad' | 'neutral';
  type MetricBadge = {
    key: string;
    label: string;
    value: string;
    note?: string;
    delta: string;
    tone: DeltaTone;
  };

  function response(panel: PanelState): string {
    if (panel.finalText) return panel.finalText;
    if (panel.status === 'running') return 'Running...';
    if (panel.status === 'error') return 'The run ended with an error.';
    return 'No response yet.';
  }

  function cachedLabel(panel: PanelState): string {
    return panel.metrics.cachedPromptTokens > 0 ? `${fmtInt(panel.metrics.cachedPromptTokens)} cached` : '0 cached';
  }

  function tone(delta: number): DeltaTone {
    if (Math.abs(delta) < 1e-9) return 'neutral';
    return delta < 0 ? 'good' : 'bad';
  }

  function deltaLabel(delta: number, fmt: (n: number) => string): string {
    if (Math.abs(delta) < 1e-9) return '(±0)';
    const sign = delta > 0 ? '+' : '-';
    return `(${sign}${fmt(Math.abs(delta))})`;
  }

  function metrics(panel: PanelState, other: PanelState): MetricBadge[] {
    return [
      {
        key: 'turns',
        label: 'turns',
        value: fmtInt(panel.metrics.turns),
        delta: deltaLabel(panel.metrics.turns - other.metrics.turns, fmtInt),
        tone: tone(panel.metrics.turns - other.metrics.turns)
      },
      {
        key: 'tools',
        label: 'tools',
        value: fmtInt(panel.metrics.toolCalls),
        delta: deltaLabel(panel.metrics.toolCalls - other.metrics.toolCalls, fmtInt),
        tone: tone(panel.metrics.toolCalls - other.metrics.toolCalls)
      },
      {
        key: 'tokens',
        label: 'tokens',
        value: fmtInt(panel.metrics.totalTokens),
        note: cachedLabel(panel),
        delta: deltaLabel(panel.metrics.totalTokens - other.metrics.totalTokens, fmtInt),
        tone: tone(panel.metrics.totalTokens - other.metrics.totalTokens)
      },
      {
        key: 'cost',
        label: 'cost',
        value: fmtUsd(panel.metrics.costUsd),
        delta: deltaLabel(panel.metrics.costUsd - other.metrics.costUsd, fmtUsd),
        tone: tone(panel.metrics.costUsd - other.metrics.costUsd)
      },
      {
        key: 'latency',
        label: 'latency',
        value: fmtMs(panel.metrics.elapsedMs),
        delta: deltaLabel(panel.metrics.elapsedMs - other.metrics.elapsedMs, fmtMs),
        tone: tone(panel.metrics.elapsedMs - other.metrics.elapsedMs)
      }
    ];
  }
</script>

<section class="outcome-rail">
  <header class="outcome-head">
    <Sparkles size={15} />
    <span>Outcome</span>
    {#if taskLabel}<em>{taskLabel}</em>{/if}
  </header>

  <div class="outcome-grid">
    {#each [{ panel: catalog, other: code }, { panel: code, other: catalog }] as row (row.panel.surface)}
      {@const panel = row.panel}
      <article class="outcome-card" data-surface={panel.surface}>
        <div class="response-label">{panel.label}</div>

        <div class="metric-row" aria-label={`${panel.label} result metrics`}>
          {#each metrics(panel, row.other) as metric (metric.key)}
            <span class="metric-badge" data-tone={metric.tone}>
              <span class="badge-top">
                <em>{metric.label}</em>
                <strong>{metric.value}</strong>
              </span>
              <span class="badge-bottom">
                <b>{metric.delta}</b>
                {#if metric.note}<i>{metric.note}</i>{/if}
              </span>
            </span>
          {/each}
        </div>

        <div class="response">
          <div class="response-text md">{@html renderMarkdown(response(panel))}</div>
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .outcome-rail {
    border-top: 1px solid var(--color-border-default);
    background: var(--color-panel-bg);
    min-height: 188px;
    max-height: 30vh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .outcome-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-bottom: 1px solid var(--color-border-subtle);
    color: var(--color-text-secondary);
    font-weight: 800;
  }

  .outcome-head :global(svg) {
    color: var(--color-brand);
  }

  .outcome-head em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .outcome-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .outcome-card {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    padding: 12px 16px;
    border-right: 1px solid var(--color-border-default);
    background: white;
  }

  .outcome-card:last-child {
    border-right: 0;
  }

  .outcome-card[data-surface="catalog"] { --surface: var(--catalog); --surface-bg: var(--catalog-bg); }
  .outcome-card[data-surface="code"] { --surface: var(--code); --surface-bg: var(--code-bg); }

  .response {
    min-height: 0;
    overflow: auto;
  }

  .response-label {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--surface);
    margin-bottom: 7px;
  }

  .response-text {
    font-size: 14px;
    line-height: 1.48;
    color: var(--color-text-secondary);
  }

  .response-text :global(p) {
    margin: 0 0 6px;
  }

  .response-text :global(*:last-child) {
    margin-bottom: 0;
  }

  .metric-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: 10px;
  }

  .metric-badge {
    min-width: 0;
    display: grid;
    grid-template-rows: auto auto;
    gap: 1px;
    border: 1px solid var(--color-border-default);
    background: var(--color-expanded-bg);
    border-radius: 7px;
    padding: 4px 6px;
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
  }

  .badge-top,
  .badge-bottom {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 5px;
  }

  .badge-top em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-dim);
  }

  .badge-top strong {
    font-size: 11px;
    font-weight: 850;
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .badge-bottom b {
    font-size: 10px;
    font-weight: 850;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .metric-badge[data-tone="good"] .badge-bottom b {
    color: var(--good);
  }

  .metric-badge[data-tone="bad"] .badge-bottom b {
    color: var(--bad);
  }

  .metric-badge[data-tone="neutral"] .badge-bottom b {
    color: var(--color-text-dim);
  }

  .badge-bottom i {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
    font-size: 8.5px;
    color: var(--color-text-dim);
  }
</style>
