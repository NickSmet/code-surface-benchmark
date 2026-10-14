<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import BeatNav from '$lib/components/tour/BeatNav.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import StatTile from '$lib/components/tour/StatTile.svelte';
  import { exampleHref } from '$lib/tour/example-stage';
  import { NEXT_LABEL, RESULTS_BEATS, buildResults, parseResultsBeat, resultsHref, type ResultsBeatId, type Tile } from '$lib/tour/results';

  const stay = { noScroll: true, keepFocus: true } as const;

  // The URL is the state, so Back and Forward walk the beats.
  const beat = $derived(parseResultsBeat(page.url.searchParams));
  const view = $derived(buildResults(beat));
  const at = $derived(RESULTS_BEATS.findIndex((b) => b.id === beat));

  const SHORT: Record<ResultsBeatId, string> = { newer: 'Newer models', older: 'An older model', dollars: 'Dollars', why: 'Why it holds' };
  const TONE: Record<Tile['tone'], string> = { code: 'var(--code)', catalogue: 'var(--catalog)', ink: 'var(--color-text-primary)' };
  const pick = (id: ResultsBeatId): void => void goto(resultsHref(id), stay);
</script>

<svelte:head>
  <title>How it holds up · From tools to code surfaces</title>
</svelte:head>

<div class="screen">
  <header class="top">
    <h1 class="t-h1">A weaker model breaks the other methods. Not this one.</h1>
    <Segmented label="What to look at" size="sm" value={beat} onchange={pick} accent="var(--color-brand)" options={RESULTS_BEATS.map((b) => ({ id: b.id, label: SHORT[b.id] }))} />
    <p class="t-lead" aria-live="polite">{view.lead}</p>
  </header>

  <section class="panels" data-emphasis={view.emphasis} aria-label="Right answers and what they cost, by model">
    {#each view.panels as p (p.model)}
      <article class="t-panel panel" class:ring={p.focus && view.emphasis === 'accuracy'} class:back={!p.focus && view.beat !== 'dollars'} class:held={!p.revealed}>
        <header class="p-head">
          <h2 class="p-name">{p.deployment}</h2>
          <span class="p-role">{p.role}</span>
        </header>
        <div class="body">
          <div class="cols" aria-hidden="true">
            <span>Right answers</span>
            <span>$ per 1,000 right</span>
          </div>
          {#each p.groups as g (g.id)}
            <div class="g-head">
              <span class="g-title">{g.title}</span>
              <span class="g-note">{g.note}</span>
            </div>
            <ul class="rows">
              {#each g.rows as r (r.id)}
                <li class="row" class:code={r.isCode} title={r.hint} aria-label={r.aria}>
                  <span class="r-label">{r.label}</span>
                  <span class="bar"><span class="fill" style:width="{p.revealed ? r.fill * 100 : 0}%"></span></span>
                  <span class="r-n">{r.correct}<small>/{r.runs}</small></span>
                  <span class="r-usd" class:best={r.cheapest}>{r.usd}</span>
                </li>
              {/each}
            </ul>
          {/each}
        </div>
        {#if !p.revealed}
          <div class="veil">{p.veil}</div>
        {/if}
      </article>
    {/each}
  </section>

  <section class="band" aria-label="What it comes to">
    {#if view.tiles}
      <div class="tiles">
        {#each view.tiles as t (t.label)}
          <div class="t-panel tile">
            {#if t.op}<span class="op" aria-hidden="true">{t.op}</span>{/if}
            <StatTile label={t.label} value={t.value} sub={t.sub} tone={TONE[t.tone]} />
          </div>
        {/each}
      </div>
    {:else if view.columns}
      <div class="why">
        {#each view.columns as c (c.title)}
          <div class="t-panel col">
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

  <p class="foot">{view.footnote}</p>

  <div class="nav">
    <BeatNav
      {at}
      beats={RESULTS_BEATS}
      before={{ href: exampleHref('break', 2), label: 'The code surface' }}
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
  .top .t-lead {
    grid-column: 1 / -1;
    /* Two lines is the longest narration; reserve them so the panels below never jump. */
    min-height: 2.8em;
  }

  /* ── the three models ───────────────────────────────────────────── */
  .panels {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .panel {
    position: relative;
    padding: 12px 14px 10px;
    transition: opacity 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
  }
  .panel.ring {
    border-color: var(--color-brand);
    box-shadow: 0 0 0 1px var(--color-brand);
  }
  .panel.back {
    opacity: 0.5;
  }
  .p-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 4px;
  }
  .p-name {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .p-role {
    padding: 1px 9px;
    border-radius: 999px;
    border: 1px solid var(--color-border-strong);
    background: white;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .body {
    transition: opacity 0.5s ease;
  }
  .held .body {
    opacity: 0;
  }
  .veil {
    position: absolute;
    inset: 52px 14px 12px;
    display: grid;
    place-items: center;
    border: 2px dashed var(--color-border-strong);
    border-radius: 10px;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-muted);
  }

  /* One grid for the column heads and every row, so the bars and the figures line up. */
  .row {
    display: grid;
    grid-template-columns: 186px minmax(0, 1fr) 46px 66px;
    align-items: center;
    column-gap: 8px;
  }
  .cols {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    /* The heads sit over the bar and the figures, not over the labels. */
    padding: 0 6px 0 calc(6px + 186px + 8px);
    font-size: 11px;
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
    margin-top: 9px;
    padding: 0 6px;
    border-bottom: 1px solid var(--color-border-default);
  }
  .g-title {
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
  .g-note {
    font-size: 12px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    min-height: 46px;
    padding: 0 6px;
    border-radius: 8px;
  }
  .row.code {
    background: var(--code-bg);
  }
  .r-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .row.code .r-label {
    font-weight: 700;
    color: #0b5f57;
  }
  .bar {
    height: 16px;
    border-radius: 4px;
    background: var(--bad-bg);
    overflow: hidden;
    transition: opacity 0.35s ease;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 4px 0 0 4px;
    background: var(--catalog);
    transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .row.code .fill {
    background: var(--code);
  }
  .r-n {
    font-family: var(--font-mono);
    font-size: 17px;
    font-weight: 800;
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    transition: opacity 0.35s ease;
  }
  .r-n small {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .r-usd {
    font-family: var(--font-mono);
    font-size: 15px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-muted);
    transition: font-size 0.35s ease, color 0.35s ease;
  }
  .r-usd.best {
    font-weight: 800;
    color: #0b5f57;
  }

  /* The dollars beat: the bars step back and the prices come forward. */
  .panels[data-emphasis='dollars'] .bar,
  .panels[data-emphasis='dollars'] .r-n {
    opacity: 0.22;
  }
  .panels[data-emphasis='dollars'] .r-usd {
    font-size: 18px;
    font-weight: 800;
    color: var(--color-text-primary);
  }
  .panels[data-emphasis='dollars'] .r-usd.best {
    color: #0b5f57;
  }

  .foot {
    margin: 0;
    max-width: 160ch;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--color-text-muted);
  }

  /* ── under the panels ───────────────────────────────────────────── */
  .band {
    flex: 1;
    display: flex;
    align-items: flex-start;
    min-height: 0;
  }
  .tiles,
  .why {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .tile {
    position: relative;
    padding: 14px 18px 16px;
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
    margin-top: 4px;
    font-size: 14px;
    line-height: 1.4;
  }
  .why {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-self: stretch;
  }
  .col {
    padding: 12px 18px 12px;
  }
  .col-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 0 0 8px;
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-primary);
  }
  .col-note {
    font-size: 12.5px;
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
    gap: 8px;
  }
  .points li {
    display: flex;
    gap: 10px;
    align-items: baseline;
    font-size: 14.5px;
    line-height: 1.42;
    color: var(--color-text-secondary);
  }
  .tag {
    flex: none;
    width: 74px;
    padding: 0 0;
    border-radius: 999px;
    background: var(--warn-bg);
    color: #92400e;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-align: center;
    text-transform: uppercase;
  }
  .tag.measured {
    background: var(--code-bg);
    color: #0b5f57;
  }

  .nav {
    margin-top: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .panel,
    .body,
    .bar,
    .fill,
    .r-n,
    .r-usd {
      transition: none;
    }
  }
</style>
