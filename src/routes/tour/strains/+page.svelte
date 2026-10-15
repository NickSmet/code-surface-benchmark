<script lang="ts">
  import { page } from '$app/state';
  import { Calculator, Check, Link2, ListChecks, Split } from '@lucide/svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { slide } from 'svelte/transition';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import BeatNav from '$lib/components/tour/BeatNav.svelte';
  import CallMap from '$lib/components/tour/CallMap.svelte';
  import RunBar from '$lib/components/tour/RunBar.svelte';
  import RunLegend from '$lib/components/tour/RunLegend.svelte';
  import StrainStage from '$lib/components/tour/StrainStage.svelte';
  import { buildToolRungs } from '$lib/tour/language';
  import { KEEP_NARROW, buildStrains, withOrigin, type StrainId } from '$lib/tour/strains';
  import { buildBeats, buildStages, solvedRows } from '$lib/tour/strain-stage';
  import { fmtTokens } from '$lib/tour/tokens';

  const inv = buildInventory();
  // The ladder's tool rungs, which the fixes quote. The code rung is not needed here, so its program is not run.
  const rungs = buildToolRungs(inv);
  const rows = buildStrains(inv, rungs);
  const stages = buildStages(rows, inv, rungs);
  const beats = buildBeats(rows);
  /** One scale for every bar, so a long one is a bigger bill. */
  const maxBill = Math.max(...rows.map((r) => r.bill.total));
  const ICON = { chain: Link2, arithmetic: Calculator, 'fan-out': Split, recital: ListChecks, fits: Check } as const satisfies Record<StrainId, unknown>;

  // The beat is in the URL, so Back goes to the beat before, a link can open on any beat, and a row that has been put right stays right.
  const hrefAt = (n: number): string => (n === 0 ? '/tour/strains' : `/tour/strains?at=${n}`);
  const at = $derived.by(() => {
    const n = Number.parseInt(page.url.searchParams.get('at') ?? '0', 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), beats.length - 1) : 0;
  });
  const beat = $derived(beats[at]);
  const solved = $derived(solvedRows(beats, at));
  const overview = $derived(beat.phase === 'overview');

  const ms = (n: number): number => (prefersReducedMotion.current ? 0 : n);
  const nextLabel = (from: number): string => {
    const b = beats[from + 1];
    if (b.row === null) return b.caption;
    if (b.phase === 'fix') return rows[b.row].fix ? 'The usual fix' : 'Keep it';
    return from === 0 ? 'Walk through them' : `Next: ${rows[b.row].title}`;
  };
</script>

<svelte:head>
  <title>Where it strains · From tools to code surfaces</title>
</svelte:head>

<header class="head">
  <p class="t-kicker t-chrome">③ Where it strains</p>
  <h1 class="t-h1">Each question strains the tools somewhere else.</h1>
  {#if overview}
    <p class="t-lead" transition:slide={{ duration: ms(200) }}>
      The questions from the last screen, with the catalogue at its best. They do not strain it in the same place, and each one has a usual fix.
    </p>
  {/if}
</header>

<section class="t-panel t-panel-pad board" aria-label="Where each scenario strains the tools, and its usual fix">
  <div class="cols" aria-hidden="true">
    <span>Scenario</span>
    <span class="c-did" title="One square per call, one group per turn, darker for a bigger result."><b>What it does.</b> One square per call.</span>
    <span class="c-strain"><b>Where it strains</b></span>
    <span></span>
    <span class="c-fix"><b>The usual fix</b></span>
  </div>
  <ol id="strain-rows" class="rows">
    {#each rows as r, i (r.id)}
      {@const Icon = ICON[r.id]}
      {@const focused = beat.row === i}
      {@const done = solved.has(i)}
      <li class="row" class:focused class:done class:overview class:fits={r.fix === null}>
        <div class="line">
          <div class="scenario">
            <strong>{r.title}</strong>
            <span class="asks">{r.asks}</span>
          </div>
          <div class="did">
            <div class="did-calls">
              <!-- The squares are for the overview. Once a stage is open it draws the calls, and the rows keep their count and bill, so the table still fits one screen. -->
              {#if overview}<CallMap turns={r.replay.turns} />{/if}
              <span class="count">{r.calls} {r.calls === 1 ? 'call' : 'calls'}</span>
            </div>
            <div class="did-bill">
              <RunBar bill={r.bill} scale={maxBill} height={12} />
              <b>≈ {fmtTokens(r.bill.total)}</b>
            </div>
          </div>
          <div class="strain">
            <p class="s-label"><Icon size={15} />{r.strain.label}</p>
            {#if overview}
              <p class="s-text" transition:slide={{ duration: ms(200) }}>{r.strain.text}</p>
            {/if}
          </div>
          <div class="arrow" aria-hidden="true"><Check size={18} /></div>
          <div class="fix">
            {#if done}
              {#if r.fix}
                <p class="f-label">
                  {r.fix.label}
                  <span class="t-chip adds" title="The vocabulary the model has to learn">+ {r.fix.adds}</span>
                </p>
                {#if !focused}
                  <a class="cta" href={withOrigin(r.fix.href, i * 2 + 2)}>{r.fix.cta}</a>
                {/if}
              {:else}
                <p class="f-label">{KEEP_NARROW.label}</p>
              {/if}
            {:else}
              <p class="f-wait">The usual fix</p>
            {/if}
          </div>
        </div>
        {#if focused}
          <StrainStage
            stage={stages[i]}
            phase={beat.phase === 'fix' ? 'fix' : 'problem'}
            ctaHref={r.fix ? withOrigin(r.fix.href, i * 2 + 2) : ''}
            fullRunHref="/tour/tools?task={r.task}&route={r.route}"
          />
        {/if}
      </li>
    {/each}
  </ol>
  <p class="foot">
    <b>Scripted, and kind to the tools.</b> The model never mis-adds or mis-copies; the tool results are real. So these are structural costs, not failure rates. <RunLegend />
  </p>
</section>

{#if at === beats.length - 1}
  <p class="t-callout wrap" transition:slide={{ duration: ms(220) }}>
    <strong>Every fix is vocabulary.</strong> A calculator, a join, an update, a filter: each is one more thing for the model to learn and one more definition sent on every turn. Add them one at a time and you grow a query language.
  </p>
{/if}

<div class="nav">
  <BeatNav
    {at}
    beats={beats.map((b, i) => ({ href: hrefAt(i), caption: b.caption, group: b.row === null ? 'overview' : `row ${b.row}` }))}
    before={{ href: '/tour/tools', label: 'Naive tools' }}
    after={{ href: '/tour/language', label: 'Fix them one at a time' }}
    {nextLabel}
  />
</div>

<style>
  .head {
    min-width: 0;
  }

  .board {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cols,
  .line {
    display: grid;
    grid-template-columns: clamp(160px, 12.5vw, 195px) clamp(220px, 19vw, 290px) minmax(0, 1fr) 26px minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
  }
  .cols {
    padding: 0 12px;
    font-size: 12.5px;
    line-height: 1.3;
    color: var(--color-text-muted);
  }
  .cols b {
    color: var(--color-text-secondary);
  }
  .c-strain b {
    color: #92400e;
  }
  .c-fix b {
    color: var(--color-brand);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    padding: 6px 12px;
    border: 1px solid var(--color-border-default);
    border-radius: 12px;
    background: white;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .row.focused {
    border-color: var(--color-brand);
    box-shadow: 0 0 0 3px rgba(35, 108, 181, 0.13);
  }
  .row.overview {
    padding: 9px 12px;
  }

  /* ── the scenario ───────────────────────────────────────────────── */
  .scenario {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    min-width: 0;
  }
  .scenario strong {
    font-size: 15px;
    line-height: 1.25;
  }
  .asks {
    font-size: 12.5px;
    color: var(--color-text-muted);
  }

  /* ── what the catalogue does ────────────────────────────────────── */
  .did {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }
  .did-calls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px 10px;
  }
  .count {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .did-bill {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .did-bill b {
    min-width: 58px;
    text-align: right;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  /* ── where it strains ───────────────────────────────────────────── */
  .strain,
  .fix {
    min-width: 0;
    padding: 5px 12px;
    border-radius: 0 10px 10px 0;
  }
  .strain {
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-left: 3px solid #d97706;
    background: #fffbeb;
  }
  .row.fits .strain {
    border-left-color: #059669;
    background: #ecfdf5;
  }
  .row.overview .strain {
    padding: 8px 12px;
  }
  .s-label,
  .f-label {
    margin: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 6px;
    font-size: 14px;
    font-weight: 750;
    line-height: 1.25;
  }
  .s-label {
    color: #92400e;
  }
  .row.fits .s-label {
    color: #047857;
  }
  .s-text {
    margin: 2px 0 0;
    font-size: 13.5px;
    line-height: 1.4;
    color: var(--color-text-secondary);
  }

  /* ── the usual fix ──────────────────────────────────────────────── */
  .arrow {
    display: grid;
    place-items: center;
    color: #059669;
    opacity: 0;
    transform: scale(0.6);
    transition: opacity 0.25s ease, transform 0.25s ease;
  }
  .row.done .arrow {
    opacity: 1;
    transform: none;
  }
  .fix {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    border: 1.5px dashed var(--color-border-strong);
    border-radius: 10px;
    transition: background-color 0.3s ease, border-color 0.3s ease;
  }
  .f-wait {
    margin: 0;
    font-size: 13.5px;
    color: var(--color-text-dim);
  }
  .row.done .fix {
    border: 1.5px solid transparent;
    border-left: 3px solid var(--color-brand);
    border-radius: 0 10px 10px 0;
    background: var(--color-brand-bg);
  }
  .row.fits.done .fix {
    border-left-color: var(--color-border-strong);
    background: var(--color-expanded-bg);
  }
  .f-label {
    color: var(--color-text-primary);
  }
  .adds {
    font-weight: 500;
    color: var(--color-brand);
    border-color: #b6d4f0;
  }
  .cta {
    align-self: flex-start;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--color-brand);
    text-decoration: none;
  }
  .cta:hover {
    text-decoration: underline;
  }

  .foot {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--color-text-muted);
  }
  .foot b {
    color: var(--color-text-secondary);
  }
  .foot :global(.legend) {
    margin-left: 6px;
    vertical-align: middle;
  }

  /* The steps stay where the presenter's hand is, however tall the stage above them is: at the bottom of the window, and in reach on a short one. */
  .nav {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin-top: auto;
    padding: 6px 0 2px;
    background: linear-gradient(to top, var(--color-page-bg) 75%, transparent);
  }

  @media (max-width: 1100px) {
    .cols {
      display: none;
    }
    .line {
      grid-template-columns: minmax(0, 1fr);
    }
    .arrow {
      display: none;
    }
    .fix {
      border-radius: 10px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .arrow,
    .fix,
    .row {
      transition: none;
    }
  }
</style>
