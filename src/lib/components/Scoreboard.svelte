<script module lang="ts">
  export interface Verdict {
    state: 'pending' | 'correct' | 'wrong';
    failures: string[];
  }
</script>

<script lang="ts">
  import type { PanelState } from '$lib/client/panel.svelte';
  import { fmtInt, fmtMs, fmtRatio, fmtUsd } from '$lib/utils';
  import { Check, Trophy, X } from '@lucide/svelte';

  interface Props {
    catalog: PanelState;
    code: PanelState;
    taskLabel: string;
    hasRun: boolean;
    /** null → custom prompt, no ground truth to check against. */
    verdicts: { catalog: Verdict; code: Verdict } | null;
    /** Review mode: approval prompts per surface (null when off). */
    approvals: { c: number; k: number } | null;
  }
  let { catalog, code, taskLabel, hasRun, verdicts, approvals }: Props = $props();

  type Row = { label: string; c: number; k: number; fmt: (n: number) => string; fineC: string; fineK: string };

  let rows = $derived<Row[]>([
    {
      label: 'Billed tokens',
      c: catalog.metrics.totalTokens,
      k: code.metrics.totalTokens,
      fmt: fmtInt,
      fineC: `${fmtInt(catalog.metrics.promptTokens)} in (${fmtInt(catalog.metrics.cachedPromptTokens)} cached) / ${fmtInt(catalog.metrics.completionTokens)} out`,
      fineK: `${fmtInt(code.metrics.promptTokens)} in (${fmtInt(code.metrics.cachedPromptTokens)} cached) / ${fmtInt(code.metrics.completionTokens)} out`
    },
    {
      label: 'Model turns',
      c: catalog.metrics.turns,
      k: code.metrics.turns,
      fmt: String,
      fineC: `${catalog.metrics.toolCalls} tool call${catalog.metrics.toolCalls === 1 ? '' : 's'}`,
      fineK: `${code.metrics.toolCalls} tool call${code.metrics.toolCalls === 1 ? '' : 's'}`
    },
    {
      label: 'Est. cost',
      c: catalog.metrics.costUsd,
      k: code.metrics.costUsd,
      fmt: fmtUsd,
      fineC: `${fmtInt(catalog.metrics.toolSchemaTokens)} tok tool defs`,
      fineK: `${fmtInt(code.metrics.toolSchemaTokens)} tok tool defs`
    },
    {
      label: 'Latency',
      c: catalog.metrics.elapsedMs,
      k: code.metrics.elapsedMs,
      fmt: fmtMs,
      fineC: catalog.model || '—',
      fineK: code.model || '—'
    }
  ]);

  function winner(c: number, k: number): 'catalog' | 'code' | 'tie' {
    if (!c || !k) return 'tie';
    const r = fmtRatio(Math.max(c, k), Math.min(c, k));
    if (!r) return 'tie';
    return k < c ? 'code' : 'catalog';
  }
  function ratio(c: number, k: number): string | null {
    return fmtRatio(Math.max(c, k), Math.min(c, k));
  }

</script>

<aside class="ledger" data-empty={!hasRun}>
  <div class="ledger-head">
    <Trophy size={12} />
    <span class="lh-title">Scoreboard</span>
    {#if taskLabel}<span class="lh-task" title={taskLabel}>· {taskLabel}</span>{/if}
  </div>

  <div class="ledger-key">
    <span class="key-c">catalog</span>
    <span class="key-d">Δ</span>
    <span class="key-k">code</span>
  </div>

  {#each rows as row (row.label)}
    {@const w = winner(row.c, row.k)}
    {@const r = ratio(row.c, row.k)}
    <div class="lrow">
      <div class="lrow-label">{row.label}</div>
      <div class="lrow-vals">
        <span class="lv" class:win={w === 'catalog'} class:dim={w === 'code'}>{row.fmt(row.c)}</span>
        {#if !hasRun}
          <span class="delta" data-dir="none">—</span>
        {:else if w === 'tie' || !r}
          <span class="delta" data-dir="tie">≈ tie</span>
        {:else if w === 'catalog'}
          <span class="delta" data-dir="catalog">◀ {r}</span>
        {:else}
          <span class="delta" data-dir="code">{r} ▶</span>
        {/if}
        <span class="lv right" class:win={w === 'code'} class:dim={w === 'catalog'}>{row.fmt(row.k)}</span>
      </div>
      <div class="lrow-fine">
        <span>{row.fineC}</span>
        <span class="right">{row.fineK}</span>
      </div>
    </div>
  {/each}

  {#if approvals}
    {@const w = winner(approvals.c, approvals.k)}
    {@const r = ratio(approvals.c, approvals.k)}
    <div class="lrow">
      <div class="lrow-label">Approvals asked</div>
      <div class="lrow-vals">
        <span class="lv" class:win={w === 'catalog'} class:dim={w === 'code'}>{approvals.c}</span>
        {#if approvals.c === 0 && approvals.k === 0}
          <span class="delta" data-dir="none">—</span>
        {:else if w === 'tie' || !r}
          <span class="delta" data-dir="tie">≈ tie</span>
        {:else if w === 'catalog'}
          <span class="delta" data-dir="catalog">◀ {r}</span>
        {:else}
          <span class="delta" data-dir="code">{r} ▶</span>
        {/if}
        <span class="lv right" class:win={w === 'code'} class:dim={w === 'catalog'}>{approvals.k}</span>
      </div>
      <div class="lrow-fine">
        <span>one per write call</span>
        <span class="right">one per change set</span>
      </div>
    </div>
  {/if}

  <div class="lrow truth">
    <div class="lrow-label">Ground truth</div>
    {#if !hasRun}
      <div class="truth-note">runs are checked against the exact answer</div>
    {:else if !verdicts}
      <div class="truth-note">no ground truth for custom prompts</div>
    {:else}
      <div class="lrow-vals">
        {#each [{ v: verdicts.catalog, side: 'catalog' }, { v: verdicts.code, side: 'code' }] as entry, i (entry.side)}
          {#if i === 1}<span class="delta spacer-mid"></span>{/if}
          {#if entry.v.state === 'pending'}
            <span class="verdict pending" class:right={i === 1}>…</span>
          {:else if entry.v.state === 'correct'}
            <span class="verdict correct" class:right={i === 1}><Check size={11} /> checks passed</span>
          {:else}
            <span class="verdict wrong" class:right={i === 1}><X size={11} /> check failed</span>
          {/if}
        {/each}
      </div>
      {#each [{ v: verdicts.catalog, side: 'catalog' }, { v: verdicts.code, side: 'code' }] as entry (entry.side)}
        {#if entry.v.state === 'wrong'}
          <ul class="truth-fails" data-side={entry.side}>
            {#each entry.v.failures as f (f)}
              <li>{entry.side} failed: {f}</li>
            {/each}
          </ul>
        {/if}
      {/each}
    {/if}
  </div>


</aside>

<style>
  .ledger {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    border-left: 1px solid var(--color-border-default);
    border-right: 1px solid var(--color-border-default);
    background: var(--color-expanded-bg);
    padding: 0 12px 12px;
  }
  .ledger[data-empty='true'] .lrow-vals,
  .ledger[data-empty='true'] .lrow-fine {
    opacity: 0.45;
  }

  .ledger-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 11px 0 9px;
    color: var(--color-text-muted);
  }
  .lh-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .lh-task {
    font-size: 10.5px;
    color: var(--color-text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  .ledger-key {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 3px 0 6px;
    border-bottom: 1px solid var(--color-border-default);
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .key-c { color: var(--catalog); }
  .key-d { color: var(--color-text-dim); font-weight: 500; }
  .key-k { color: var(--code); text-align: right; }

  .lrow {
    padding: 8px 0 7px;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .lrow-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-text-dim);
    text-transform: uppercase;
    text-align: center;
    margin-bottom: 3px;
  }
  .lrow-vals {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: baseline;
    gap: 6px;
  }
  .lv {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .lv.win { font-weight: 800; }
  .lv.dim { font-weight: 400; color: var(--color-text-dim); }
  .lv.right { text-align: right; }

  .delta {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    border-radius: 3px;
    padding: 1px 5px;
    white-space: nowrap;
  }
  .delta[data-dir='catalog'] { color: var(--catalog); background: var(--catalog-bg); border: 1px solid var(--catalog-border); }
  .delta[data-dir='code'] { color: var(--code); background: var(--code-bg); border: 1px solid var(--code-border); }
  .delta[data-dir='tie'] { color: var(--warn); background: var(--warn-bg); border: 1px solid #FDE68A; }
  .delta[data-dir='none'] { color: var(--color-text-dim); }
  .delta.spacer-mid { visibility: hidden; padding: 0; border: 0; }

  .lrow-fine {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 2px;
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--color-text-dim);
  }
  .lrow-fine .right { text-align: right; }

  .truth-note {
    font-size: 10.5px;
    color: var(--color-text-dim);
    text-align: center;
    padding: 2px 0;
  }
  .verdict {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
  }
  .verdict.right { justify-content: flex-end; }
  .verdict.correct { color: var(--good); }
  .verdict.wrong { color: var(--bad); }
  .verdict.pending { color: var(--color-text-dim); }

  .truth-fails {
    margin: 5px 0 0;
    padding: 5px 7px;
    list-style: none;
    border-radius: 5px;
    background: var(--bad-bg);
    border: 1px solid #FECACA;
  }
  .truth-fails li {
    font-size: 10px;
    line-height: 1.45;
    color: #991b1b;
  }

</style>
