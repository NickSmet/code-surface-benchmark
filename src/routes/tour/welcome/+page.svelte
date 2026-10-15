<script lang="ts">
  import { page } from '$app/state';
  import BeatNav from '$lib/components/tour/BeatNav.svelte';
  import { BLOCKS, HOW, OUTCOMES, QUESTIONS_FROM, QUESTION_MINUTES, TOTAL_MINUTES, WELCOME_BEATS, parseAt, rangeOf } from '$lib/tour/workshop';

  const at = $derived(parseAt(page.url.searchParams, WELCOME_BEATS.length));

  /** Where a minute falls along the ninety, as a share of the track. */
  const pos = (minute: number): string => `${(minute / TOTAL_MINUTES) * 100}%`;
  const span = (a: number, b: number): string => `${((b - a) / TOTAL_MINUTES) * 100}%`;
  const TICKS = [0, 30, 60, 90];
</script>

<svelte:head>
  <title>Welcome · From tools to code surfaces</title>
</svelte:head>

<div class="screen">
  <header class="top">
    <h1 class="t-h1">From tools to code surfaces</h1>
    <p class="t-lead">Ninety minutes on one design question: how should an agent work with a large, structured estate?</p>
  </header>

  <div class="grid">
    <div class="left">
      <section class="t-panel panel" class:ring={at === 0} class:back={at !== 0} aria-label="What you leave with">
        <h2 class="t-h2">By the end you can</h2>
        <ul class="outcomes">
          {#each OUTCOMES as o (o.verb)}
            <li><b>{o.verb}</b> {o.text}</li>
          {/each}
        </ul>
      </section>

      <section class="t-panel panel" class:ring={at === 2} class:back={at !== 2} aria-label="How we will work">
        <h2 class="t-h2">How we will work</h2>
        <ul class="how">
          {#each HOW as h (h.title)}
            <li><b>{h.title}.</b> {h.text}</li>
          {/each}
        </ul>
      </section>
    </div>

    <section class="t-panel panel agenda" class:ring={at === 1} class:back={at !== 1} aria-label="The ninety minutes">
      <h2 class="t-h2">The ninety minutes <span class="split">{TOTAL_MINUTES - QUESTION_MINUTES} of talk, {QUESTION_MINUTES} for questions</span></h2>
      <ol class="rows">
        <li class="axis" aria-hidden="true">
          <span></span>
          <span class="ticks">
            {#each TICKS as t (t)}
              <i class:end={t === TOTAL_MINUTES} style:left={pos(t)}>{t}</i>
            {/each}
            <em style:left={pos(QUESTIONS_FROM)}>Q&amp;A</em>
          </span>
          <span></span>
        </li>
        {#each BLOCKS as b (b.screen)}
          {@const qaFrom = Math.max(b.from, QUESTIONS_FROM)}
          <li class="a-row">
            <span class="a-text"><b>{b.title}</b><span class="a-gist">{b.gist}</span></span>
            <span class="a-track" aria-hidden="true">
              <span class="a-bar" style:left={pos(b.from)} style:width={span(b.from, b.to)}></span>
              {#if b.to > QUESTIONS_FROM}
                <span class="a-bar qa" style:left={pos(qaFrom)} style:width={span(qaFrom, b.to)}></span>
              {/if}
            </span>
            <span class="a-range">{rangeOf(b)}</span>
          </li>
        {/each}
      </ol>
    </section>
  </div>

  <div class="nav">
    <BeatNav {at} beats={WELCOME_BEATS} />
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
  .top .t-lead {
    max-width: none;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.35fr);
    gap: 12px;
    align-items: start;
  }
  .left {
    display: grid;
    gap: 12px;
  }

  .panel {
    padding: 12px 16px 14px;
    transition: opacity 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
  }
  .panel.ring {
    border-color: var(--color-brand);
    box-shadow: 0 0 0 1px var(--color-brand);
  }
  .panel.back {
    opacity: 0.6;
  }
  .split {
    margin-left: 8px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: none;
    color: var(--color-text-dim);
  }

  .outcomes,
  .how {
    display: grid;
    gap: 10px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    font-size: 16px;
    line-height: 1.45;
    color: var(--color-text-secondary);
  }
  .outcomes b {
    display: block;
    font-size: 19px;
    font-weight: 800;
    color: var(--color-brand);
  }
  .how b {
    color: var(--color-text-primary);
  }

  /* ── the agenda: each block sits where it falls in the ninety, so pace can be read off the page ── */
  .rows {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }
  .axis,
  .a-row {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr) 72px;
    align-items: center;
    gap: 14px;
  }
  .axis {
    height: 22px;
  }
  .ticks {
    position: relative;
    height: 100%;
  }
  .ticks i,
  .ticks em {
    position: absolute;
    top: 2px;
    transform: translateX(-50%);
    font-size: 11.5px;
    font-style: normal;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-dim);
  }
  .ticks i:first-child {
    transform: none;
  }
  .ticks i.end {
    transform: translateX(-100%);
  }
  .ticks em {
    transform: none;
    padding-left: 5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #b45309;
  }
  .a-row {
    padding: 6px 0;
    border-top: 1px solid var(--color-border-subtle);
  }
  .a-text {
    display: grid;
    gap: 1px;
    min-width: 0;
    font-size: 15.5px;
    line-height: 1.3;
  }
  .a-text b {
    font-weight: 700;
    color: var(--color-text-primary);
  }
  .a-gist {
    font-size: 13px;
    line-height: 1.35;
    color: var(--color-text-muted);
  }
  .a-track {
    position: relative;
    align-self: stretch;
    min-height: 22px;
    /* Faint lines at thirty and sixty, and the stretch kept for questions. */
    background:
      linear-gradient(to right, transparent calc(33.333% - 0.5px), #e2e8f0 calc(33.333% - 0.5px) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px)),
      linear-gradient(to right, transparent calc(66.666% - 0.5px), #e2e8f0 calc(66.666% - 0.5px) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px)),
      linear-gradient(to right, transparent 77.778%, #fffbeb 77.778%);
  }
  .a-bar {
    position: absolute;
    top: 50%;
    height: 14px;
    margin-top: -7px;
    border-radius: 4px;
    background: var(--color-brand);
  }
  .a-bar.qa {
    background: #d97706;
    border-radius: 0 4px 4px 0;
  }
  .a-range {
    text-align: right;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .nav {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin-top: auto;
    padding: 6px 0 2px;
    background: linear-gradient(to top, var(--color-page-bg) 75%, transparent);
  }

  /* Presented, the room reads this from a distance for a minute or two: the panels keep their size and lose their air. */
  :global(.tour.present) .panel {
    padding: 10px 14px 12px;
  }
  :global(.tour.present) .a-row {
    padding: 4px 0;
  }
</style>
