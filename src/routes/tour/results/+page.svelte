<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import BeatNav from '$lib/components/tour/BeatNav.svelte';
  import PlaneChart from '$lib/components/tour/PlaneChart.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import StatTile from '$lib/components/tour/StatTile.svelte';
  import { FAMILY_COLOR, LABEL_COLOR, MODEL_COLOR, MARKER, diamondPath, ladderFrac } from '$lib/tour/plane';
  import {
    MODELS,
    NEXT_LABEL,
    RESULTS_BEATS,
    TASK_SETS,
    buildResults,
    chipHref,
    fmtTimes,
    multiples,
    parseResults,
    resultsHref,
    type ResultsBeatId,
    type TaskSet,
    type Tile
  } from '$lib/tour/results';

  const stay = { noScroll: true, keepFocus: true } as const;

  // The URL is the state, so Back and Forward walk the beats.
  const here = $derived(parseResults(page.url.searchParams));
  const view = $derived(buildResults(here.beat, here.model));
  const at = $derived(RESULTS_BEATS.findIndex((b) => b.id === here.beat));
  const times = multiples();

  const SHORT: Record<ResultsBeatId, string> = { older: 'gpt-5.4-mini', newer: 'gpt-5.6-luna', newest: 'gpt-6-luna', unplanned: 'Unplanned tasks', dollars: 'Dollars', why: 'Why it holds' };
  // The colours of the chart, so a figure under it is the colour of the markers it is about.
  const TONE: Record<Tile['tone'], string> = { code: LABEL_COLOR.code, catalogue: LABEL_COLOR.catalogue, ink: 'var(--color-text-primary)' };
  const pick = (id: ResultsBeatId): void => void goto(resultsHref(id), stay);
  const SETS: readonly TaskSet[] = ['preset', 'unplanned'];
</script>

<svelte:head>
  <title>How it holds up · From tools to code surfaces</title>
</svelte:head>

<div class="screen">
  <header class="top">
    <h1 class="t-h1">Change the model. The code surface stays at 100%.</h1>
    <Segmented label="What to look at" size="sm" value={here.beat} onchange={pick} accent="var(--color-brand)" options={RESULTS_BEATS.map((b) => ({ id: b.id, label: SHORT[b.id] }))} />
  </header>

  <section class="t-panel stage-panel" aria-label="Right answers and what they cost">
    {#if view.stage === 'plane' && view.plane && view.table}
      {@const tb = view.table}
      <div class="plane-wrap">
        <PlaneChart model={view.plane.model} set={view.plane.set} label={view.aria} />
      </div>
      <aside class="table" aria-label="The numbers behind the chart">
        <div class="picks">
          <div class="pills" role="group" aria-label="Model">
            {#each MODELS as m (m.key)}
              <a class="pill mono" class:on={m.key === tb.model} href={chipHref(m.key, tb.set)} data-sveltekit-noscroll data-sveltekit-keepfocus aria-current={m.key === tb.model ? 'true' : undefined}>{m.deployment}</a>
            {/each}
          </div>
          <div class="pills" role="group" aria-label="Tasks">
            {#each SETS as k (k)}
              <a class="pill" class:on={k === tb.set} href={chipHref(tb.model, k)} data-sveltekit-noscroll data-sveltekit-keepfocus aria-current={k === tb.set ? 'true' : undefined} title={TASK_SETS[k].note}>{TASK_SETS[k].label}</a>
            {/each}
          </div>
        </div>
        <div class="m-line">
          <span class="m-name" style:color={MODEL_COLOR[tb.model]}>{tb.deployment}</span>
          <span class="m-role">{tb.role}</span>
        </div>
        <div class="m-price">{tb.price}</div>

        <div class="cols" aria-hidden="true">
          <span>Right of 40</span>
          <span>$ per 1,000 runs</span>
        </div>
        {#each tb.groups as g (g.id)}
          <div class="g-head">
            <span class="g-title">{g.title}</span>
            <span class="g-note">{g.note}</span>
          </div>
          <ul class="rows">
            {#each g.rows as r (r.id)}
              <li class="row" class:code={r.isCode} class:held={!r.ran} title={r.hint} aria-label={r.aria}>
                <svg class="glyph" viewBox="-13 -13 26 26" aria-hidden="true">
                  {#if r.shape === 'ring'}
                    <circle r={MARKER.r - 0.5} fill="#fff" stroke={FAMILY_COLOR[r.family]} stroke-width="3.4" />
                  {:else if r.shape === 'diamond'}
                    <path d={diamondPath(0, 0)} fill={FAMILY_COLOR[r.family]} />
                  {:else if r.shape === 'square'}
                    <rect x={-MARKER.half} y={-MARKER.half} width={MARKER.half * 2} height={MARKER.half * 2} rx="3.5" fill={FAMILY_COLOR[r.family]} />
                  {:else}
                    <circle r={MARKER.r} fill={FAMILY_COLOR[r.family]} />
                  {/if}
                </svg>
                <span class="r-label">{r.label}</span>
                <span class="r-n">{#if r.ran}{r.correct}<small>/{r.runs}</small>{:else}&ndash;{/if}</span>
                <span class="r-usd" class:best={r.cheapest}>{r.usd}</span>
              </li>
            {/each}
          </ul>
        {/each}
      </aside>
    {:else if view.stage === 'ladder' && view.ladder}
      <div class="ladder">
        <h2 class="l-title">What 1,000 right answers cost</h2>
        <p class="l-sub">Failures included, over all eight tasks. A log scale: each bar is the one below it multiplied by what stands between them.</p>
        <ul class="l-rows">
          {#each view.ladder as r, i (r.id)}
            {#if i > 0}
              <li class="l-step" aria-hidden="true">
                <span class="l-chip">{i === 1 ? `${fmtTimes(times.model)} cheaper: the model alone` : `${fmtTimes(times.method)} cheaper: the method alone`}</span>
              </li>
            {/if}
            <li class="l-row" data-tone={r.tone}>
              <span class="l-label">{r.label}</span>
              <span class="l-track"><span class="l-bar" style:width="{Math.max(2, ladderFrac(r.usdValue) * 100)}%" style:background={FAMILY_COLOR[r.tone]}></span></span>
              <span class="l-usd">{r.usd}</span>
              <span class="l-n">{r.sub}</span>
            </li>
          {/each}
        </ul>
        <p class="l-total">{fmtTimes(times.both)} cheaper together</p>
      </div>
    {:else if view.columns}
      <div class="why">
        {#each view.columns as c (c.title)}
          <div class="col">
            <h2 class="col-title">{c.title}{#if c.note}<span class="col-note">{c.note}</span>{/if}</h2>
            <ul class="points">
              {#each c.points as pt (pt.text)}
                <li>
                  {#if c.tagged}<span class="tag" class:measured={pt.measured}>{pt.measured ? 'Measured' : 'Reading'}</span>{/if}
                  <span class="pt-text">{pt.text}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <p class="t-lead caption" aria-live="polite">{view.lead}</p>

  <section class="strip" aria-label="What it comes to">
    {#if view.tiles}
      <div class="tiles">
        {#each view.tiles as t (t.label)}
          <div class="t-panel tile">
            {#if t.op}<span class="op" aria-hidden="true">{t.op}</span>{/if}
            <StatTile label={t.label} value={t.value} sub={t.sub} tone={TONE[t.tone]} compact={t.compact} />
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <p class="foot">{view.footnote}</p>

  <div class="nav">
    <BeatNav
      {at}
      beats={RESULTS_BEATS}
      before={{ href: '/tour/guard', label: 'Security and writes' }}
      after={{ href: '/', label: 'Run the live benchmark' }}
      nextLabel={(i) => NEXT_LABEL[RESULTS_BEATS[i].id]}
    />
  </div>
</div>

<style>
  .screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--tour-gap);
    min-width: 0;
  }
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px 14px;
    min-width: 0;
  }
  /* What is happening, under the picture it is happening in. Two lines is the longest narration; reserve them so the stage above never jumps. */
  .caption {
    margin: -3px 0;
    max-width: none;
    min-height: 2.8em;
  }

  /* The stage keeps the window's leftover height: the chart takes what the numbers beside it leave. */
  .stage-panel {
    flex: 1;
    min-height: 380px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(400px, 31%, 470px);
    gap: 14px;
    padding: 8px 14px 8px 10px;
  }
  .ladder,
  .why {
    grid-column: 1 / -1;
  }
  .plane-wrap {
    min-width: 0;
    min-height: 0;
    display: grid;
  }

  /* ── the numbers beside the chart ───────────────────────────────── */
  .table {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 4px 0 2px;
  }
  .picks {
    display: grid;
    gap: 5px;
    margin-bottom: 8px;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .pill {
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--color-border-strong);
    background: white;
    font-size: 12.5px;
    font-weight: 650;
    color: var(--color-text-secondary);
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .pill.mono {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .pill:hover {
    background: var(--color-hover-bg);
  }
  .pill.on {
    background: var(--color-brand);
    border-color: var(--color-brand);
    color: #fff;
  }
  .m-line {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .m-name {
    font-family: var(--font-mono);
    font-size: 21px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .m-role {
    padding: 0 9px;
    border-radius: 999px;
    border: 1px solid var(--color-border-strong);
    background: white;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .m-price {
    margin: 1px 0 6px;
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .cols {
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    padding: 0 6px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .g-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-top: 5px;
    padding: 0 6px;
    border-bottom: 1px solid var(--color-border-default);
  }
  .g-title {
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
  .g-note {
    font-size: 11.5px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 58px 72px;
    align-items: center;
    column-gap: 8px;
    min-height: 29px;
    padding: 0 6px;
    border-radius: 8px;
  }
  .row.code {
    background: var(--code-bg);
  }
  .row.held {
    opacity: 0.45;
  }
  .glyph {
    width: 22px;
    height: 22px;
  }
  .r-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .row.code .r-label {
    font-weight: 800;
    color: #0b5f57;
  }
  .r-n {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 800;
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .r-n small {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .r-usd {
    font-family: var(--font-mono);
    font-size: 14px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-muted);
  }
  .r-usd.best {
    font-weight: 800;
    color: #0b5f57;
  }

  /* ── the cost of a right answer, on a log scale ─────────────────── */
  .ladder {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 10px 20px 8px;
  }
  .l-title {
    margin: 0;
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-primary);
  }
  .l-sub {
    margin: 2px 0 10px;
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .l-rows {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
  }
  .l-row {
    display: grid;
    grid-template-columns: minmax(240px, 22%) minmax(0, 1fr) 96px 120px;
    align-items: center;
    column-gap: 14px;
  }
  .l-label {
    font-size: 15px;
    font-weight: 650;
    line-height: 1.3;
    color: var(--color-text-secondary);
  }
  .l-track {
    height: 44px;
    border-radius: 8px;
    background: var(--color-hover-bg);
    overflow: hidden;
  }
  .l-bar {
    display: block;
    height: 100%;
    border-radius: 8px;
    transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .l-usd {
    font-family: var(--font-mono);
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.02em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .l-row[data-tone='code'] .l-usd {
    color: #047857;
  }
  .l-n {
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .l-step {
    display: flex;
    padding-left: calc(min(22%, 100%) + 14px);
  }
  .l-chip {
    padding: 2px 12px;
    border-radius: 999px;
    border: 1px solid var(--color-border-strong);
    background: white;
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-secondary);
  }
  .l-total {
    margin: 4px 0 0;
    text-align: right;
    font-size: 17px;
    font-weight: 800;
    color: #047857;
  }

  /* ── what to make of it ─────────────────────────────────────────── */
  .why {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px;
    align-self: stretch;
    padding: 10px 18px;
  }
  .col {
    min-width: 0;
  }
  .col-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 12px;
    margin: 0 0 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border-default);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-primary);
  }
  .col-note {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    color: var(--color-text-muted);
  }
  .points {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 16px;
  }
  .points li {
    display: flex;
    gap: 12px;
    align-items: baseline;
    font-size: 17px;
    line-height: 1.45;
    color: var(--color-text-secondary);
  }
  .tag {
    flex: none;
    width: 78px;
    border-radius: 999px;
    background: var(--warn-bg);
    color: #92400e;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-align: center;
    text-transform: uppercase;
  }
  .tag.measured {
    background: var(--code-bg);
    color: #0b5f57;
  }

  /* ── under the stage ────────────────────────────────────────────── */
  .strip {
    min-height: 0;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .tile {
    position: relative;
    padding: 8px 16px 10px;
  }
  /* In the gap between two tiles: the model and the method multiply into the whole. */
  .op {
    position: absolute;
    left: -21px;
    top: 50%;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    transform: translateY(-50%);
    border-radius: 50%;
    border: 1px solid var(--color-border-strong);
    background: white;
    font-size: 17px;
    font-weight: 800;
    line-height: 1;
    color: var(--color-text-secondary);
  }
  .tile :global(.sub) {
    margin-top: 3px;
    font-size: 13.5px;
    line-height: 1.35;
  }
  .foot {
    margin: 0;
    max-width: 160ch;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--color-text-muted);
  }

  .nav {
    margin-top: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .l-bar,
    .pill {
      transition: none;
    }
  }
</style>
