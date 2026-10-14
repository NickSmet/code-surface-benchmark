<script lang="ts">
  import { ArrowRight, Check } from '@lucide/svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fade, fly, slide } from 'svelte/transition';
  import CallCard from './CallCard.svelte';
  import type { StagePane, StrainStage } from '$lib/tour/strain-stage';
  import { KEEP_NARROW } from '$lib/tour/strains';

  interface Props {
    stage: StrainStage;
    /** `problem` shows the problem and holds the fix back; `fix` shows both. */
    phase: 'problem' | 'fix';
    /** Where the fix's link goes: the language screen, with the way back here. */
    ctaHref: string;
    /** The run this strain replays, in full, on the tools screen. */
    fullRunHref: string;
  }
  let { stage, phase, ctaHref, fullRunHref }: Props = $props();

  /** Every duration is zero for a reader who asked for less motion. */
  const ms = (n: number): number => (prefersReducedMotion.current ? 0 : n);

  /**
   * How much of the row a pane asks for: a card is one share, a query that runs to several lines a third more, a tile
   * for the rest of the calls half of one, and a lone card still wants room to breathe.
   */
  const share = (p: StagePane | null): number => {
    if (!p) return 1.5;
    const cards = p.cards.reduce((n, c) => n + (c.kind === 'more' || c.kind === 'same' ? 0.55 : c.args.includes('\n') ? 1.35 : 1), 0);
    return Math.max(cards, p.cards.length === 1 ? 1.5 : 0) + (p.ladder ? 1 : 0);
  };
  const columns = $derived(`minmax(0, ${share(stage.problem)}fr) 30px minmax(0, ${share(stage.fix)}fr)`);

  const calls = (n: number): string => `${n} ${n === 1 ? 'call' : 'calls'}`;
  const RUNG_SHORT: Record<string, string> = {
    'per-property': 'a tool per property',
    'one-tool': 'one tool',
    aspect: 'an aspect',
    aspects: 'aspect array',
    filter: 'filtering'
  };
</script>

{#snippet cards(pane: StagePane, tone: 'problem' | 'fix', from: 'above' | 'left')}
  <div class="cards" class:linked={pane.linked}>
    {#each pane.cards as c, i (c.key)}
      {#if pane.linked && i > 0}
        <span class="link" aria-hidden="true"><ArrowRight size={16} /></span>
      {/if}
      <div
        class="slot"
        class:more={c.kind === 'more' || c.kind === 'same'}
        in:fly|global={{ x: from === 'left' ? -26 : 0, y: from === 'above' ? 10 : 0, duration: ms(280), delay: ms(from === 'left' ? 90 + i * 150 : 110 + i * 170) }}
        out:fade|global={{ duration: ms(110) }}
      >
        <CallCard card={c} {tone} />
      </div>
    {/each}
  </div>
{/snippet}

{#snippet legend(text: string)}
  <p class="legend">
    {#if text.startsWith('Highlighted:')}<mark>Highlighted:</mark>{text.slice('Highlighted:'.length)}{:else}{text}{/if}
  </p>
{/snippet}

<div class="stage" style:--cols={columns} transition:slide={{ duration: ms(240) }}>
  <section class="pane problem" class:past={phase === 'fix'} aria-label="The problem">
    <header class="ph">
      <span class="tag warn">{stage.fix ? 'The problem' : 'The case'}</span>
      <h3>{stage.problem.label}</h3>
      <span class="count">{calls(stage.problem.calls)}</span>
      <a class="full" href={fullRunHref} title="The whole run, call by call, on the naive tools screen">Full run <ArrowRight size={12} /></a>
    </header>
    {@render cards(stage.problem, 'problem', 'above')}
    {#if stage.problem.legend}
      {@render legend(stage.problem.legend)}
    {/if}
    <p class="text">{stage.problem.text}</p>
  </section>

  <div class="between" aria-hidden="true" class:on={phase === 'fix'}><ArrowRight size={22} /></div>

  <section class="pane fix" class:wait={phase === 'problem'} aria-label={stage.fix ? 'The usual fix' : 'The verdict'}>
    {#if phase === 'fix'}
      {#if stage.fix}
        {@const fix = stage.fix}
        <header class="ph">
          <span class="tag good">The usual fix</span>
          <h3>{fix.label}</h3>
          <span class="t-chip adds" title="The vocabulary the model now has to learn">+ {fix.adds}</span>
          <span class="count">{calls(fix.calls)} <small>was {stage.problem.calls}</small></span>
        </header>
        {@render cards(fix, 'fix', 'left')}
        {#if fix.ladder}
          <div class="ladder" in:fade|global={{ duration: ms(250), delay: ms(500) }}>
            <span class="ladder-h">The same question, design by design, on the next screen:</span>
            <span class="rungs">
              {#each fix.ladder as r, i (r.id)}
                {#if i > 0}<ArrowRight size={12} />{/if}
                <span class="rung" title={r.label}><b>{r.calls}</b><small>{RUNG_SHORT[r.id] ?? r.label}</small></span>
              {/each}
            </span>
          </div>
        {/if}
        {#if fix.legend}
          {@render legend(fix.legend)}
        {/if}
        <p class="text">
          {fix.text}
          <a class="cta" href={ctaHref}>{fix.cta}<ArrowRight size={14} /></a>
        </p>
      {:else}
        <header class="ph">
          <span class="tag keep"><Check size={12} /> The verdict</span>
          <h3>{KEEP_NARROW.label}</h3>
        </header>
        <p class="text keep-text" in:fade|global={{ duration: ms(250), delay: ms(120) }}>{KEEP_NARROW.text}</p>
      {/if}
    {:else}
      <p class="wait-text">{stage.fix ? 'The usual fix is next.' : 'Next: what to do about it.'}</p>
    {/if}
  </section>
</div>

<style>
  .stage {
    display: grid;
    grid-template-columns: var(--cols, minmax(0, 1fr) 30px minmax(0, 1fr));
    gap: 0;
    align-items: stretch;
    margin-top: 6px;
  }
  .pane {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
    padding: 9px 12px;
    border-radius: 11px;
    transition: opacity 0.3s ease, filter 0.3s ease;
  }
  .problem {
    border: 1px solid #f3dcae;
    background: #fffbeb;
  }
  .problem.past {
    opacity: 0.72;
    filter: saturate(0.8);
  }
  .fix {
    border: 1px solid #bcd7f1;
    background: var(--color-brand-bg);
  }
  .fix.wait {
    border: 1.5px dashed var(--color-border-strong);
    background: transparent;
    align-items: center;
    justify-content: center;
  }
  .wait-text {
    margin: 0;
    font-size: 14px;
    color: var(--color-text-muted);
  }
  .between {
    display: grid;
    place-items: center;
    color: var(--color-text-dim);
    transition: color 0.3s ease;
  }
  .between.on {
    color: var(--color-brand);
  }

  /* ── the header of a pane ───────────────────────────────────────── */
  .ph {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .ph h3 {
    margin: 0;
    min-width: 0;
    font-size: 14.5px;
    font-weight: 750;
    line-height: 1.2;
  }
  .tag {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .tag.warn {
    background: #fde9bd;
    color: #8a4b08;
  }
  .tag.good {
    background: #cfe4f8;
    color: var(--color-brand-dark);
  }
  .tag.keep {
    background: #d5f0e2;
    color: #047857;
  }
  .count {
    margin-left: auto;
    flex: none;
    font-size: 13px;
    font-weight: 750;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .count small {
    margin-left: 4px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
  }
  .full {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
    font-weight: 650;
    color: var(--color-text-muted);
    text-decoration: none;
  }
  .full:hover {
    color: var(--color-brand);
    text-decoration: underline;
  }

  /* ── the calls ──────────────────────────────────────────────────── */
  .cards {
    display: flex;
    align-items: stretch;
    gap: 8px;
    min-width: 0;
  }
  .slot {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
  }
  .slot.more {
    flex: 0 0 118px;
  }
  .link {
    flex: none;
    display: grid;
    place-items: center;
    width: 16px;
    margin: 0 -2px;
    color: #c78413;
  }

  .legend {
    margin: 0;
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .legend mark {
    padding: 0 3px;
    border-radius: 3px;
    background: #fde68a;
    color: #78350f;
  }
  .text {
    margin: 0;
    font-size: 13px;
    line-height: 1.38;
    color: var(--color-text-secondary);
  }
  .keep-text {
    font-size: 14px;
  }
  .cta {
    display: inline-flex;
    align-items: center;
    margin-left: 2px;
    font-weight: 700;
    white-space: nowrap;
    color: var(--color-brand);
    text-decoration: none;
  }
  .cta:hover {
    text-decoration: underline;
  }
  .adds {
    flex: none;
    border-color: #b6d4f0;
    color: var(--color-brand);
  }

  /* ── the ladder's counts, under the fan-out's fix ───────────────── */
  .ladder {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ladder-h {
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .rungs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--color-text-dim);
  }
  .rung {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    min-width: 62px;
    padding: 3px 8px;
    border-radius: 8px;
    background: white;
    border: 1px solid #b6d4f0;
    line-height: 1.15;
  }
  .rung b {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
  }
  .rung small {
    font-size: 10.5px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .rung:last-child b {
    color: var(--color-brand);
  }

  @media (max-width: 1100px) {
    .stage {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    .between {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pane,
    .between {
      transition: none;
    }
  }
</style>
