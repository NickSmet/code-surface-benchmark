<script lang="ts">
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { Calculator, Check, ChevronRight, Link2, ListChecks, Split } from '@lucide/svelte';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import CallMap from '$lib/components/tour/CallMap.svelte';
  import RunBar from '$lib/components/tour/RunBar.svelte';
  import RunLegend from '$lib/components/tour/RunLegend.svelte';
  import TourNav from '$lib/components/tour/TourNav.svelte';
  import { buildToolRungs } from '$lib/tour/language';
  import { KEEP_NARROW, buildStrains, type StrainId } from '$lib/tour/strains';
  import { fmtTokens } from '$lib/tour/tokens';

  const inv = buildInventory();
  // The ladder's tool rungs, which the fixes quote. The code rung is not needed here, so its program is not run.
  const rows = buildStrains(inv, buildToolRungs(inv));
  /** One scale for every bar, so a long one is a bigger bill. */
  const maxBill = Math.max(...rows.map((r) => r.bill.total));
  const ICON = { chain: Link2, arithmetic: Calculator, 'fan-out': Split, recital: ListChecks, fits: Check } as const satisfies Record<StrainId, unknown>;

  // The fixes are held back until asked for, so the strains can be talked through first. The URL keeps the choice.
  let shown = $state(page.url.searchParams.get('fixes') === '1');
  function toggle() {
    shown = !shown;
    replaceState(shown ? '?fixes=1' : page.url.pathname, page.state);
  }
</script>

<svelte:head>
  <title>Where it strains · From tools to code surfaces</title>
</svelte:head>

<header class="head">
  <div class="head-text">
    <p class="t-kicker">③ Where it strains</p>
    <h1 class="t-h1">Each question strains the tools somewhere else.</h1>
    <p class="t-lead">
      The questions from the last screen, with the catalogue at its best. They do not strain it in the same place, and each one has a usual fix.
    </p>
  </div>
  <button type="button" class="t-btn primary reveal" aria-expanded={shown} aria-controls="strain-rows" onclick={toggle}>
    {shown ? 'Hide the fixes' : 'Show the usual fixes'}
    <ChevronRight size={16} />
  </button>
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
      <li class="row" class:shown class:fits={r.fix === null} style:--i={i}>
        <div class="scenario">
          <strong>{r.title}</strong>
          <span class="asks">{r.asks}</span>
          <a class="replay" href="/tour/tools?task={r.task}&route={r.route}">Replay it <ChevronRight size={13} /></a>
        </div>
        <div class="did">
          <div class="did-calls">
            <CallMap turns={r.replay.turns} />
            <span class="count">{r.calls} {r.calls === 1 ? 'call' : 'calls'}</span>
          </div>
          <div class="did-bill">
            <RunBar bill={r.bill} scale={maxBill} height={12} />
            <b>≈ {fmtTokens(r.bill.total)}</b>
          </div>
        </div>
        <div class="strain">
          <p class="s-label"><Icon size={15} />{r.strain.label}</p>
          <p class="s-text">{r.strain.text}</p>
        </div>
        <div class="arrow" aria-hidden="true"><ChevronRight size={18} /></div>
        <div class="fix" inert={!shown}>
          {#if r.fix}
            <p class="f-label">
              {r.fix.label}
              <span class="t-chip adds" title="The vocabulary the model has to learn">+ {r.fix.adds}</span>
            </p>
            <p class="f-text">{r.fix.text} <a class="cta" href={r.fix.href}>{r.fix.cta}<ChevronRight size={14} /></a></p>
          {:else}
            <p class="f-label">{KEEP_NARROW.label}</p>
            <p class="f-text">{KEEP_NARROW.text}</p>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
  <p class="foot">
    <b>Scripted, and kind to the tools.</b> The model's choices are scripted and it never mis-adds or mis-copies; the tool results are real. So these are the structural costs, not failure rates. <RunLegend />
  </p>
</section>

<p class="t-callout wrap">
  <strong>Every fix is vocabulary.</strong> A calculator, a join, an update, a filter: each is one more thing for the model to learn and one more definition sent on every turn. Add them one at a time and you grow a query language.
</p>

<TourNav prev={{ href: '/tour/tools', label: 'Naive tools' }} next={{ href: '/tour/language', label: 'Fix them one at a time', hint: 'Next' }} />

<style>
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  .head-text {
    min-width: 0;
  }
  .reveal {
    flex: none;
    margin-top: 14px;
  }

  .board {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cols,
  .row {
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
    padding: 9px 12px;
    border: 1px solid var(--color-border-default);
    border-radius: 12px;
    background: white;
  }

  /* ── the scenario ───────────────────────────────────────────────── */
  .scenario {
    display: flex;
    flex-direction: column;
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
  .replay {
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    font-size: 12.5px;
    font-weight: 650;
    color: var(--color-brand);
    text-decoration: none;
  }
  .replay:hover {
    text-decoration: underline;
  }

  /* ── what the catalogue does ────────────────────────────────────── */
  .did {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
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
    padding: 8px 12px;
    border-radius: 0 10px 10px 0;
  }
  .strain {
    border-left: 3px solid #d97706;
    background: #fffbeb;
  }
  .row.fits .strain {
    border-left-color: #059669;
    background: #ecfdf5;
  }
  .s-label,
  .f-label {
    margin: 0 0 2px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 750;
  }
  .s-label {
    color: #92400e;
  }
  .row.fits .s-label {
    color: #047857;
  }
  .s-text,
  .f-text {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.4;
    color: var(--color-text-secondary);
  }

  /* ── the usual fix ──────────────────────────────────────────────── */
  .arrow {
    display: grid;
    place-items: center;
    color: var(--color-brand);
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .fix {
    display: flex;
    flex-direction: column;
    border: 1.5px dashed var(--color-border-strong);
    border-left-width: 1.5px;
    border-radius: 10px;
    background: transparent;
    transition: background-color 0.3s ease, border-color 0.3s ease;
  }
  .f-label {
    color: var(--color-text-primary);
  }
  .adds {
    margin-left: auto;
    font-weight: 500;
    color: var(--color-brand);
    border-color: #b6d4f0;
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
  .fix > * {
    opacity: 0;
    transform: translateX(-10px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .row.shown .arrow {
    opacity: 1;
    transition: opacity 0.35s ease calc(var(--i) * 90ms + 40ms);
  }
  .row.shown .fix {
    border: 1.5px solid transparent;
    border-left: 3px solid var(--color-brand);
    border-radius: 0 10px 10px 0;
    background: var(--color-brand-bg);
  }
  .row.fits.shown .fix {
    border-left-color: var(--color-border-strong);
    background: var(--color-expanded-bg);
  }
  .row.shown .fix > * {
    opacity: 1;
    transform: none;
    transition: opacity 0.35s ease calc(var(--i) * 90ms + 90ms), transform 0.35s ease calc(var(--i) * 90ms + 90ms);
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

  @media (max-width: 1100px) {
    .head {
      flex-direction: column;
    }
    .reveal {
      margin-top: 0;
    }
    .cols {
      display: none;
    }
    .row {
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
    .fix > *,
    .row.shown .arrow,
    .row.shown .fix > * {
      transition: none;
    }
  }
</style>
