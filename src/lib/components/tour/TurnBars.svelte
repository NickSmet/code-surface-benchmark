<script lang="ts">
  import type { ReplayTurn } from '$lib/tour/replay';
  import { PART_KEYS, promptSplit, type PartKey } from '$lib/tour/replay-view';
  import { CACHE_TIP, OUTPUT_TIP } from '$lib/tour/explain';
  import { fmtTokens } from '$lib/tour/tokens';
  import Tip from './Tip.svelte';

  interface Props {
    turns: ReplayTurn[];
    /** Turns up to and including this one are solid; later turns are dashed ghosts. */
    upTo: number;
    /** Fixed plot height in px. Ignored when `fill` is set. */
    height?: number;
    /** Take whatever height the parent gives (the parent must be a flex column with a bounded height). */
    fill?: boolean;
    /** Click a bar to jump to that turn. */
    onturn?: (turn: number) => void;
    /** Turns a run gets before the benchmark stops it. A dashed line marks it when the replay runs past it. */
    limit?: number;
  }
  let { turns, upTo, height = 150, fill = false, onturn, limit }: Props = $props();

  // A bar is one turn: what the model read (the big block) and, on top, what it wrote (amber).
  // Text that is new in a request is drawn in colour. Text the model already got in the request
  // before is the same shape in grey: a provider with prompt caching can reuse it.
  // Amber is the model's own words: its call is output on the turn it is written, and input from
  // the next turn on, when it is read back.
  const OUT = '#f59e0b';
  const FRESH: Record<PartKey, { label: string; color: string; hint: string }> = {
    fixed: { label: 'Setup', color: '#475569', hint: 'Instructions and tool definitions' },
    user: { label: 'Question', color: '#0ea5e9', hint: 'The question you asked' },
    calls: { label: 'Calls', color: OUT, hint: 'The calls the model wrote on earlier turns, read back as input' },
    results: { label: 'Results', color: '#4f46e5', hint: 'What the tools sent back' }
  };
  const CACHED: Record<PartKey, string> = { fixed: '#e5e9f0', user: '#d5dbe5', calls: '#c4ccda', results: '#aeb8ca' };
  const NAME: Record<PartKey, string> = { fixed: 'setup', user: 'question', calls: 'calls', results: 'results' };

  /** One scale for both: the tallest turn is what it read plus what it wrote. */
  const max = $derived(Math.max(1, ...turns.map((t) => t.promptTokens + t.completionTokens)));
  const dense = $derived(turns.length > 12);

  interface Seg {
    key: PartKey;
    tokens: number;
    cached: boolean;
  }
  /** Bottom to top: what was repeated, then what is new. */
  function segments(i: number): Seg[] {
    const s = promptSplit(turns, i);
    const out: Seg[] = [];
    for (const key of PART_KEYS) if (s.cached[key] > 0) out.push({ key, tokens: s.cached[key], cached: true });
    for (const key of PART_KEYS) if (s.fresh[key] > 0) out.push({ key, tokens: s.fresh[key], cached: false });
    return out;
  }
  function pct(n: number): string {
    return `${(n / max) * 100}%`;
  }
  const n = (v: number): string => v.toLocaleString('en-US');
  const writes = (t: ReplayTurn): string => (t.calls.length === 0 ? 'the answer' : t.calls.length === 1 ? 'one call' : `${n(t.calls.length)} calls`);
  function tip(t: ReplayTurn, i: number): string {
    const s = promptSplit(turns, i);
    const list = (p: Record<PartKey, number>): string =>
      PART_KEYS.filter((k) => p[k] > 0)
        .map((k) => `${n(p[k])} ${NAME[k]}`)
        .join(', ');
    const head = `Turn ${t.n} reads ${n(t.promptTokens)} tokens and writes ${n(t.completionTokens)} (${writes(t)}).`;
    if (s.cachedTokens === 0) return `${head}\nAll of the input is new: ${list(s.fresh)}.`;
    return `${head}\nCached ${n(s.cachedTokens)}: the same as the previous request (${list(s.cached)}), usually billed at about a tenth.\nNew ${n(s.freshTokens)} (${list(s.fresh)}).`;
  }
  const showTick = (k: number): boolean => !dense || k === 1 || k === turns.length || k % 5 === 0;
  /** Where the limit falls, as a share of the bars: the middle of the gap after bar `limit`. */
  const limitAt = $derived.by((): string | null => {
    if (!limit || limit <= 0 || limit >= turns.length) return null;
    const share = limit / turns.length;
    const gap = dense ? 2 : 6;
    return `calc(${share * 100}% + ${(share - 0.5) * gap}px)`;
  });
  const summary = $derived(
    `Tokens read and written on each of ${turns.length} turns. ${turns
      .map((t) => `Turn ${t.n} reads ${n(t.promptTokens)} and writes ${n(t.completionTokens)}`)
      .join('; ')}. Grey is input repeated from the previous turn; amber is what the model wrote.`
  );
</script>

<figure class="chart" class:fill>
  <div class="plot" style:height={fill ? undefined : `${height}px`} role="img" aria-label={summary}>
    <span class="ymax" aria-hidden="true">{fmtTokens(max)}</span>
    <div class="bars" class:dense>
      {#each turns as t, i (t.n)}
        {@const solid = t.n <= upTo}
        {@const segs = solid ? segments(i) : []}
        <button
          type="button"
          class="col"
          class:ghost={!solid}
          class:now={t.n === upTo}
          style:height={pct(t.promptTokens + t.completionTokens)}
          title={tip(t, i)}
          aria-label={tip(t, i)}
          onclick={() => onturn?.(t.n)}
          disabled={!onturn}
        >
          {#if solid}
            <span class="stack" style:flex="{t.promptTokens} {t.promptTokens} 0px">
              {#each segs as s (`${s.cached ? 'c' : 'n'}-${s.key}`)}
                <span
                  class="seg"
                  class:cached={s.cached}
                  style:flex="{s.tokens} {s.tokens} 0px"
                  style:background-color={s.cached ? CACHED[s.key] : FRESH[s.key].color}
                ></span>
              {/each}
            </span>
            <span class="cap" style:flex="{t.completionTokens} {t.completionTokens} 0px" style:background-color={OUT}></span>
          {/if}
          {#if t.n === upTo || (!dense && solid)}
            <span class="val" aria-hidden="true">
              <b>{fmtTokens(t.promptTokens)}</b>
              <i>out {fmtTokens(t.completionTokens)}</i>
            </span>
          {/if}
        </button>
      {/each}
      {#if limitAt}<span class="limit" style:left={limitAt} aria-hidden="true"></span>{/if}
    </div>
  </div>
  <div class="xaxis" class:dense aria-hidden="true">
    {#each turns as t (t.n)}
      <span class="tick">{showTick(t.n) ? t.n : ''}</span>
    {/each}
  </div>
  <figcaption class="legend">
    <span class="lg-row">
      <span class="lg-h">Input</span>
      {#each PART_KEYS as k (k)}
        <span class="lg" title={FRESH[k].hint}><span class="sw" style:background-color={FRESH[k].color}></span>{FRESH[k].label}</span>
      {/each}
      <span class="lg-sep">
        <Tip class="lg" text={CACHE_TIP}><span class="sw hatch" style:background-color={CACHED.calls}></span>Cached</Tip>
      </span>
    </span>
    <span class="lg-row">
      <span class="lg-h">Output</span>
      <Tip class="lg" text={OUTPUT_TIP}><span class="sw" style:background-color={OUT}></span>What the model writes</Tip>
    </span>
  </figcaption>
</figure>

<style>
  .chart {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .chart.fill {
    height: 100%;
    min-height: 0;
  }
  .plot {
    position: relative;
    /* Room above the tallest bar for its two-line label. */
    padding-top: 32px;
    border-bottom: 1px solid var(--color-border-strong);
  }
  .fill .plot {
    flex: 1 1 0;
    min-height: 76px;
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
    position: relative;
    height: 100%;
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  /* Where the benchmark would stop the run. The same amber as the note under the chart. */
  .limit {
    position: absolute;
    top: -6px;
    bottom: 0;
    width: 0;
    border-left: 1.5px dashed #d97706;
    pointer-events: none;
    z-index: 1;
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
  /* What the turn read, parts stacked from the bottom: repeated first, then new. */
  .stack {
    display: flex;
    flex-direction: column-reverse;
    min-height: 0;
  }
  .seg {
    display: block;
    width: 100%;
    min-height: 1px;
    /* A hairline between parts that takes no room, so thin parts keep their height. */
    box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.9);
  }
  .seg:first-child {
    box-shadow: none;
  }
  /* What the turn wrote, on the same scale. It is tiny next to what it read, so it never drops below a few pixels. */
  .cap {
    display: block;
    width: 100%;
    min-height: 3px;
    border-radius: 3px 3px 0 0;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9);
  }
  /* Cached text: the same grey family, lightly hatched so it does not depend on colour alone. */
  .seg.cached,
  .sw.hatch {
    background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0 2px, transparent 2px 6px);
  }
  .val {
    position: absolute;
    left: 50%;
    bottom: 100%;
    transform: translateX(-50%);
    margin-bottom: 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.15;
    white-space: nowrap;
    font-family: var(--font-mono);
  }
  .val b {
    font-size: 12px;
    font-weight: 800;
    color: var(--color-text-primary);
  }
  .val i {
    font-style: normal;
    font-size: 10.5px;
    font-weight: 700;
    color: #b45309;
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
    line-height: 1.3;
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
  .legend {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .lg-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1px 11px;
  }
  .lg-h {
    /* Both headings are as wide as the longer one, so the swatches line up. */
    min-width: 46px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
  .legend .lg,
  .legend :global(.lg) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .lg-sep {
    padding-left: 11px;
    border-left: 1px solid var(--color-border-strong);
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
</style>
