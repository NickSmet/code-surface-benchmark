<script lang="ts">
  import { page } from '$app/state';
  import solutionDoc from '../../../../docs/solution-path-examples.md?raw';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { buildProjection } from '$lib/inventory/projection';
  import BeatNav from '$lib/components/tour/BeatNav.svelte';
  import { parseSolutionPrograms } from '$lib/tour/programs';
  import { QUESTION_MINUTES, WRAP_BEATS, parseAt } from '$lib/tour/workshop';
  import { ASKS, SEEDS, TAKEAWAY, recapOf } from '$lib/tour/wrap';

  const at = $derived(parseAt(page.url.searchParams, WRAP_BEATS.length));

  // The recap is read off the same estate and programs the screens it points back to ran.
  const inv = buildInventory();
  const recap = recapOf({ inv, projection: buildProjection(inv), programs: parseSolutionPrograms(solutionDoc) });
</script>

<svelte:head>
  <title>Questions · From tools to code surfaces</title>
</svelte:head>

<div class="screen">
  <header class="top">
    <h1 class="t-h1">Where each one fits</h1>
    <p class="t-lead">What we saw, what to ask of an estate that is not this one, and then yours.</p>
  </header>

  <div class="grid">
    <div class="col">
      <section class="t-panel panel" class:ring={at === 0} class:back={at !== 0} aria-label="What we saw">
        <h2 class="t-h2">What we saw</h2>
        <ol class="recap">
          {#each recap as r (r.text)}
            <li>
              <span class="marks" aria-label="Screen {r.screens.join(' and ')}">
                {#each r.screens as s (s)}<span class="n">{s}</span>{/each}
              </span>
              <span>{r.text}</span>
            </li>
          {/each}
        </ol>
      </section>

      <section class="t-panel panel" class:ring={at === 2} class:back={at !== 2} aria-label="Take it with you">
        <h2 class="t-h2">Take it with you</h2>
        <dl class="take">
          <dt>Repository</dt>
          <dd><code>{TAKEAWAY.repo}</code></dd>
          <dt>Run it</dt>
          <dd><code>{TAKEAWAY.run[0]}</code>, then <code>{TAKEAWAY.run[1]}</code>, then open <code>{TAKEAWAY.open}</code></dd>
          {#each TAKEAWAY.files as f (f.path)}
            <dt>In it</dt>
            <dd><code>{f.path}</code> {f.what}</dd>
          {/each}
        </dl>
      </section>
    </div>

    <div class="col">
      <section class="t-panel panel" class:ring={at === 1} class:back={at !== 1} aria-label="What to ask of your own estate">
        <h2 class="t-h2">Ask of your own estate</h2>
        <ol class="asks">
          {#each ASKS as a (a.title)}
            <li>
              <b>{a.title}</b>
              <span>{a.because}</span>
              <span class="marks" aria-label="Screen {a.screens.join(' and ')}">
                {#each a.screens as s (s)}<span class="n">{s}</span>{/each}
              </span>
            </li>
          {/each}
        </ol>
      </section>

      <section class="t-panel panel qa" class:ring={at === 2} class:back={at !== 2} aria-label="Questions">
        <h2 class="t-h2">Questions <span class="split">{QUESTION_MINUTES} minutes</span></h2>
        <p class="qa-lead">In the chat, or unmute. If you want somewhere to start:</p>
        <ul class="seeds">
          {#each SEEDS as s (s)}
            <li>{s}</li>
          {/each}
        </ul>
      </section>
    </div>
  </div>

  <div class="nav">
    <BeatNav {at} beats={WRAP_BEATS} />
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
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }
  .col {
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
    opacity: 0.5;
  }
  .split {
    margin-left: 8px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: none;
    color: var(--color-text-dim);
  }

  .recap,
  .asks {
    display: grid;
    gap: 10px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    font-size: 16.5px;
    line-height: 1.4;
    color: var(--color-text-secondary);
  }
  .recap li {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }
  .asks li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1px 10px;
    align-items: baseline;
  }
  .asks b {
    grid-column: 1 / -1;
    color: var(--color-text-primary);
  }
  .asks li > span:nth-of-type(1) {
    font-size: 14.5px;
    color: var(--color-text-muted);
  }

  /* The screens a line points back to, small enough to be a pointer and not a heading. */
  .marks {
    display: inline-flex;
    gap: 3px;
  }
  .n {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: var(--color-brand-bg);
    border: 1px solid var(--color-brand);
    font-size: 12.5px;
    font-weight: 800;
    color: var(--color-brand);
  }

  .take {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px 14px;
    margin: 10px 0 0;
    font-size: 15.5px;
    color: var(--color-text-secondary);
  }
  .take dt {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    align-self: center;
  }
  .take dd {
    margin: 0;
  }
  code {
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--color-text-primary);
  }

  .qa-lead {
    margin: 8px 0 6px;
    font-size: 15.5px;
    color: var(--color-text-secondary);
  }
  .seeds {
    margin: 0;
    padding-left: 20px;
    display: grid;
    gap: 5px;
    font-size: 16.5px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .nav {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin-top: auto;
    padding: 6px 0 2px;
    background: linear-gradient(to top, var(--color-page-bg) 75%, transparent);
  }

  :global(.tour.present) .panel {
    padding: 10px 14px 12px;
  }
</style>
