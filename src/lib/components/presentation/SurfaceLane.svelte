<script lang="ts">
  import { CheckCircle2, ChevronRight, Loader2, TriangleAlert } from '@lucide/svelte';
  import type { PanelState, TranscriptItem } from '$lib/client/panel.svelte';
  import type { SurfaceId } from '$lib/agent/sse-protocol';
  import { fmtInt, fmtUsd } from '$lib/utils';

  interface Props {
    panel: PanelState;
    active: boolean;
    selectedSeq: number | null;
    onSelectLane: (surface: SurfaceId) => void;
    onSelectTool: (surface: SurfaceId, seq: number) => void;
  }

  let { panel, active, selectedSeq, onSelectLane, onSelectTool }: Props = $props();

  let toolItems = $derived(panel.items.filter((i): i is Extract<TranscriptItem, { kind: 'tool' }> => i.kind === 'tool'));
  let tag = $derived(panel.surface === 'catalog' ? 'tool catalog' : 'code surface');
  let activityLabel = $derived(panel.metrics.toolCalls === 1 ? 'tool call' : 'tool calls');
  type ToolItem = Extract<TranscriptItem, { kind: 'tool' }>;

  function toolKind(name: string): 'code' | 'write' | 'tool' {
    if (name === 'operate_inventory') return 'code';
    if (name === 'update_resource_tags' || name === 'set_power_state') return 'write';
    return 'tool';
  }

  function kindLabel(kind: 'code' | 'write' | 'tool'): string {
    if (kind === 'code') return 'RUN';
    if (kind === 'write') return 'SET';
    return 'GET';
  }

  function preview(item: ToolItem): string {
    if (!item.done) return item.argsPreview;
    if (item.resultPreview) return item.resultPreview;
    return item.error ? 'error' : 'done';
  }

  function json(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function resultText(item: ToolItem): string {
    return item.content ?? item.resultPreview ?? '';
  }

  function traceText(item: ToolItem): string {
    if (!item.trace) return '';
    return JSON.stringify(
      {
        mode: item.trace.mode,
        details: item.trace.details,
        resources: item.trace.resources.slice(0, 80),
        omittedResources: Math.max(0, item.trace.resources.length - 80)
      },
      null,
      2
    );
  }
</script>

<section class="demo-lane" data-surface={panel.surface} data-active={active}>
  <button class="lane-select" type="button" onclick={() => onSelectLane(panel.surface)}>
    <header class="lane-head">
      <div class="lane-title">
        <span class="surface-dot"></span>
        <div>
          <h2>{panel.label}</h2>
          <p>{tag}</p>
        </div>
      </div>
      <div class="lane-metrics">
        <div class="metric">
          <strong>{panel.metrics.toolCalls}</strong>
          <span>{activityLabel}</span>
        </div>
        <div class="metric">
          <strong>{panel.metrics.turns}</strong>
          <span>model turns</span>
        </div>
        <div class="metric">
          <strong>{fmtInt(panel.metrics.totalTokens)}</strong>
          <span>tokens</span>
        </div>
        <div class="metric">
          <strong>{fmtUsd(panel.metrics.costUsd)}</strong>
          <span>cost</span>
        </div>
      </div>
    </header>

    <div class="lane-status" data-status={panel.status}>
      {#if panel.status === 'running'}
        <Loader2 size={14} />
        <span>{panel.phase === 'calling' ? 'running tools' : 'reasoning'}</span>
      {:else if panel.status === 'error'}
        <TriangleAlert size={14} />
        <span>error</span>
      {:else if panel.status === 'done'}
        <CheckCircle2 size={14} />
        <span>done</span>
      {:else}
        <span>ready</span>
      {/if}
    </div>
  </button>

  <div class="lane-stream">
    {#if toolItems.length === 0}
      <div class="lane-empty">Run a task to stream tool activity.</div>
    {:else}
      {#each toolItems as item (item.seq)}
        {@const kind = toolKind(item.name)}
        {@const expanded = selectedSeq === item.seq}
        <div class="tool-node" class:expanded>
          <button
            class="tool-line"
            data-kind={kind}
            data-done={item.done}
            type="button"
            onclick={(event) => {
              event.stopPropagation();
              onSelectTool(panel.surface, item.seq);
            }}
          >
            <span class="seq">#{item.seq}</span>
            <span class="kind-chip" data-kind={kind} data-error={item.error}>
              {item.error ? 'ERR' : kindLabel(kind)}
            </span>
            <span class="tool-name">{item.name}</span>
            <span class="tool-preview">{preview(item)}</span>
            {#if !item.done}
              <span class="pulse"><i></i><i></i><i></i></span>
            {:else if item.error}
              <span class="row-end err"><TriangleAlert size={14} /></span>
            {:else}
              <span class="chev" class:open={expanded}><ChevronRight size={15} /></span>
            {/if}
          </button>

          {#if expanded}
            <div class="tool-details">
              <section>
                <div class="detail-label">arguments</div>
                <pre>{json(item.args ?? item.argsPreview)}</pre>
              </section>

              {#if item.code}
                <section>
                  <div class="detail-label">code</div>
                  <pre class="code-block">{item.code}</pre>
                </section>
              {/if}

              {#if item.done}
                <section data-kind={kind}>
                  <div class="detail-label">{item.error ? 'error/result' : 'result'}</div>
                  <pre class="result" data-kind={kind} data-error={item.error}>{resultText(item)}</pre>
                </section>
              {/if}

              {#if item.diff && item.diff.length > 0}
                <section>
                  <div class="detail-label">diff</div>
                  <pre>{json(item.diff)}</pre>
                </section>
              {/if}

              {#if item.trace}
                <section>
                  <div class="detail-label">trace</div>
                  <pre>{traceText(item)}</pre>
                </section>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .demo-lane {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    border-right: 1px solid var(--color-border-default);
    background: var(--color-page-bg);
  }

  .demo-lane[data-active="true"] {
    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 5%, white), white 22%);
    box-shadow: inset 0 3px 0 var(--surface);
  }

  .demo-lane[data-surface="catalog"] { --surface: var(--catalog); --surface-bg: var(--catalog-bg); --surface-border: var(--catalog-border); }
  .demo-lane[data-surface="code"] { --surface: var(--code); --surface-bg: var(--code-bg); --surface-border: var(--code-border); }

  .lane-select {
    display: block;
    width: 100%;
    text-align: left;
    cursor: pointer;
  }

  .lane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 22px 12px;
  }

  .lane-title {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }

  .surface-dot {
    width: 11px;
    height: 11px;
    border-radius: 999px;
    background: var(--surface);
    flex: none;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: 0;
  }

  p {
    margin: 3px 0 0;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .lane-metrics {
    display: flex;
    align-items: flex-end;
    gap: 18px;
    color: var(--surface);
    flex: none;
  }

  .metric {
    display: grid;
    justify-items: end;
    gap: 3px;
  }

  .metric strong {
    font-family: var(--font-mono);
    font-size: 24px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .metric:first-child strong {
    font-size: 32px;
  }

  .metric span {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .lane-status {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 22px 12px;
    min-height: 30px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border-subtle);
    padding-bottom: 10px;
  }

  .lane-status :global(svg) {
    color: var(--surface);
  }

  .lane-status[data-status="running"] :global(svg) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .lane-stream {
    min-height: 0;
    overflow-y: auto;
    padding: 0 22px 18px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .lane-empty {
    margin: auto;
    color: var(--color-text-dim);
    font-size: 14px;
  }

  .tool-node {
    flex: none;
    border: 1px solid var(--color-border-default);
    background: white;
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.12s, background 0.12s;
  }

  .tool-node:hover {
    border-color: var(--surface-border);
  }

  .tool-node.expanded {
    border-color: var(--surface-border);
    background: var(--surface-bg);
  }

  .tool-line {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    border: 0;
    background: transparent;
    cursor: pointer;
    padding: 6px 10px;
  }

  .seq {
    flex: none;
    width: 24px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 800;
    color: var(--color-text-dim);
  }

  .kind-chip {
    flex: none;
    font-family: var(--font-mono);
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.04em;
    border-radius: 4px;
    padding: 2px 5px;
    color: var(--color-text-muted);
    background: var(--color-expanded-bg);
  }

  .kind-chip[data-kind="write"] {
    color: white;
    background: var(--surface);
  }

  .kind-chip[data-kind="code"] {
    color: var(--surface);
    background: var(--surface-bg);
  }

  .kind-chip[data-error="true"] {
    color: white;
    background: var(--bad, #DC2626);
  }

  .tool-name {
    flex: none;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .tool-line[data-kind="write"] .tool-name {
    color: var(--good);
  }

  .tool-preview {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chev {
    flex: none;
    display: inline-flex;
    color: var(--surface);
    transition: transform 0.14s ease;
  }

  .chev.open {
    transform: rotate(90deg);
  }

  .row-end.err {
    flex: none;
    display: inline-flex;
    color: var(--bad, #DC2626);
  }

  .tool-details {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 4px 12px 12px;
    border-top: 1px solid color-mix(in srgb, var(--surface) 18%, var(--color-border-subtle));
  }

  .detail-label {
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-dim);
    margin-bottom: 4px;
  }

  .tool-details pre {
    margin: 0;
    max-height: 260px;
    overflow: auto;
    border: 1px solid var(--color-border-subtle);
    border-radius: 6px;
    background: var(--color-expanded-bg);
    padding: 8px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--color-text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .tool-details pre.code-block {
    max-height: 340px;
    background: #0F172A;
    color: #E2E8F0;
    border-color: #1E293B;
    white-space: pre;
  }

  .tool-details pre.result[data-kind="write"]:not([data-error="true"]) {
    border-color: color-mix(in srgb, var(--good) 35%, var(--color-border-subtle));
    background: color-mix(in srgb, var(--good) 8%, white);
  }

  .pulse {
    display: inline-flex;
    gap: 3px;
  }

  .pulse i {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--surface);
    animation: bounce 1.1s ease-in-out infinite;
  }

  .pulse i:nth-child(2) { animation-delay: 0.15s; }
  .pulse i:nth-child(3) { animation-delay: 0.3s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
    40% { transform: translateY(-4px); opacity: 1; }
  }
</style>
