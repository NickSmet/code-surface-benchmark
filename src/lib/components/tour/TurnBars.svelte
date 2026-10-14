<script lang="ts">
  import type { ReplayTurn } from '$lib/tour/replay';
  import { fmtTokens } from '$lib/tour/tokens';

  interface Props {
    turns: ReplayTurn[];
    /** Turns up to and including this one are solid; later turns are dashed ghosts. */
    upTo: number;
    height?: number;
    /** Click a bar to jump to that turn. */
    onturn?: (turn: number) => void;
  }
  let { turns, upTo, height = 150, onturn }: Props = $props();

  const SEGMENTS = [
    { key: 'fixed', label: 'Instructions + tool definitions', color: '#CBD5E1' },
    { key: 'user', label: 'Your question', color: '#94A3B8' },
    { key: 'calls', label: 'Model\u2019s earlier tool calls', color: '#A5B4FC' },
    { key: 'results', label: 'Earlier tool results', color: '#4F46E5' }
  ] as const;

  const max = $derived(Math.max(1, ...turns.map((t) => t.promptTokens)));
  const dense = $derived(turns.length > 12);

  function parts(t: ReplayTurn): Record<(typeof SEGMENTS)[number]['key'], number> {
    return { fixed: t.parts.system + t.parts.tools, user: t.parts.user, calls: t.parts.calls, results: t.parts.results };
  }
  function pct(n: number): string {
    return `${(n / max) * 100}%`;
  }
  function tip(t: ReplayTurn): string {
    const p = parts(t);
    return `Turn ${t.n} sends ${t.promptTokens.toLocaleString('en-US')} tokens: ${p.fixed.toLocaleString('en-US')} instructions and tool definitions, ${p.user.toLocaleString('en-US')} question, ${p.calls.toLocaleString('en-US')} earlier calls, ${p.results.toLocaleString('en-US')} earlier results.`;
  }
  const showTick = (n: number): boolean => !dense || n === 1 || n === turns.length || n % 5 === 0;
  const summary = $derived(
    `Tokens sent to the model on each of ${turns.length} turns: ${turns.map((t) => t.promptTokens.toLocaleString('en-US')).join(', ')}.`
  );
</script>

<figure class="chart">
  <div class="plot" style:height="{height}px" role="img" aria-label={summary}>
    <span class="ymax" aria-hidden="true">{fmtTokens(max)}</span>
    <div class="bars" class:dense>
      {#each turns as t (t.n)}
        {@const p = parts(t)}
        {@const solid = t.n <= upTo}
        <button
          type="button"
          class="col"
          class:ghost={!solid}
          class:now={t.n === upTo}
          style:height={pct(t.promptTokens)}
          title={tip(t)}
          aria-label={tip(t)}
          onclick={() => onturn?.(t.n)}
          disabled={!onturn}
        >
          {#if solid}
            {#each SEGMENTS as s (s.key)}
              <span class="seg" style:height={`${(p[s.key] / t.promptTokens) * 100}%`} style:background={s.color}></span>
            {/each}
          {/if}
          {#if t.n === upTo || (!dense && solid)}
            <span class="val" aria-hidden="true">{fmtTokens(t.promptTokens)}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
  <div class="xaxis" class:dense aria-hidden="true">
    {#each turns as t (t.n)}
      <span class="tick">{showTick(t.n) ? t.n : ''}</span>
    {/each}
  </div>
  <figcaption class="axes">
    <span>Model turn</span>
    <span class="legend">
      {#each SEGMENTS as s (s.key)}
        <span class="lg"><span class="sw" style:background={s.color}></span>{s.label}</span>
      {/each}
    </span>
  </figcaption>
</figure>

<style>
  .chart {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .plot {
    position: relative;
    padding-top: 22px;
    border-bottom: 1px solid var(--color-border-strong);
  }
  .ymax {
    position: absolute;
    top: 0;
    left: 0;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--color-text-dim);
  }
  .bars {
    height: 100%;
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  .bars.dense {
    gap: 2px;
  }
  .col {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    max-width: 120px;
    display: flex;
    flex-direction: column-reverse;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px 4px 0 0;
    background: transparent;
    overflow: visible;
    transition: height 0.3s ease;
  }
  .col:not(:disabled) {
    cursor: pointer;
  }
  .col:not(:disabled):hover {
    border-color: var(--color-text-secondary);
  }
  .col.ghost {
    border: 1px dashed var(--color-border-strong);
    background: rgba(148, 163, 184, 0.08);
  }
  .col.now {
    border-color: var(--color-text-primary);
  }
  .seg {
    display: block;
    width: 100%;
    flex: none;
  }
  .seg:last-child {
    border-radius: 3px 3px 0 0;
  }
  .val {
    position: absolute;
    left: 50%;
    bottom: 100%;
    transform: translateX(-50%);
    margin-bottom: 2px;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .xaxis {
    display: flex;
    gap: 6px;
  }
  .tick {
    flex: 1 1 0;
    max-width: 120px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .xaxis.dense {
    gap: 2px;
  }
  .xaxis.dense .tick {
    font-size: 11px;
    overflow: visible;
    white-space: nowrap;
  }
  .axes {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 16px;
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
  }
  .lg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 11px;
    height: 11px;
    border-radius: 3px;
  }
</style>
