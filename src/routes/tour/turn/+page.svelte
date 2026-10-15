<script lang="ts">
  import { untrack } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Play } from '@lucide/svelte';
  import solutionDoc from '../../../../docs/solution-path-examples.md?raw';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { buildProjection } from '$lib/inventory/projection';
  import BeatNav from '$lib/components/tour/BeatNav.svelte';
  import ProgramStage from '$lib/components/tour/ProgramStage.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import { runInSandbox } from '$lib/tour/code-client';
  import { runTracked, type RunOutcome } from '$lib/tour/code-run';
  import { PHASE_U, U_START, buildExample, defOf } from '$lib/tour/example-stage';
  import { FRESH_QUESTIONS } from '$lib/tour/language';
  import { buildObjectStage } from '$lib/tour/object-stage';
  import { parseSolutionPrograms } from '$lib/tour/programs';
  import { exercisesOf, parseTurn, sameAnswer, turnBeats, turnHref, type ExerciseId } from '$lib/tour/turn';

  // The same estate, object and programs as the code screen; the change is the room's.
  const inv = buildInventory();
  const projection = buildProjection(inv);
  const stage = buildObjectStage(inv, projection, { vmName: 'web-prod-03' });
  const exercises = exercisesOf({
    programs: parseSolutionPrograms(solutionDoc),
    ratio: FRESH_QUESTIONS.find((q) => q.id === 'ratio')!.code
  });
  const BEATS = turnBeats(Object.fromEntries(exercises.map((e) => [e.id, e.label])) as Record<ExerciseId, string>);
  /** The stage draws a program the reader edits: the "try to break it" example is the one that does. */
  const def = defOf('break');
  const stay = { noScroll: true, keepFocus: true } as const;

  // ── where we are (the URL is the state, so Back and Forward walk the beats) ──
  const here = $derived(parseTurn(page.url.searchParams));
  const ex = $derived(exercises.find((e) => e.id === here.id) ?? exercises[0]);
  const at = $derived(BEATS.findIndex((b) => b.id === here.id && b.step === here.step));

  // ── the programs the screen knows: they run in the page, the room's own edits run in a worker ──
  const runKnown = (code: string): RunOutcome => runTracked({ code, projection, rationale: ex.base.rationale });
  const baseOutcome = $derived(runKnown(ex.base.code));
  const refOutcome = $derived(runKnown(ex.changes[0].code));
  const startCode = (): string => (here.step === 0 ? ex.base.code : ex.changes[0].code);

  let code = $state(untrack(startCode));
  let outcome = $state.raw<RunOutcome>(untrack(() => (here.step === 0 ? baseOutcome : refOutcome)));
  /** The program `outcome` is the run of. */
  let ranCode = $state(untrack(startCode));
  let running = $state(false);
  let runNo = 0;

  const edited = $derived(ranCode !== code);
  /** Which of the screen's own programs is in the box: none, once the room has typed in it. */
  const loaded = $derived(code === ex.base.code ? 'base' : (ex.changes.find((c) => c.code === code)?.id ?? ''));
  const atBase = $derived(outcome === baseOutcome);

  const view = $derived(buildExample({ def, program: { code, rationale: ex.base.rationale }, outcome, inv }));

  // ── motion ───────────────────────────────────────────────────────────────
  const restOf = (o: RunOutcome): number => (o.status === 'ok' && o.diff.length > 0 ? PHASE_U.review : PHASE_U.answer);
  const motion = new Tween(0, { duration: 0 });
  const u = $derived(motion.current);
  const reduced = (): boolean => browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The first render is the beat as the URL names it, so the page is right before any script runs.
  untrack(() => motion.set(restOf(outcome), { duration: 0 }));

  function knownOutcome(src: string): RunOutcome | null {
    if (src === ex.base.code) return baseOutcome;
    if (src === ex.changes[0].code) return refOutcome;
    const other = ex.changes.find((c) => c.code === src);
    return other ? runKnown(other.code) : null;
  }

  /** The beat the screen is last known to have shown: the key of the exercise and step, so a beat is only entered once. */
  let shown = '';

  /**
   * The beat follows what is on the stage: the program as it was shown is "Predict", and anything that has run, whoever
   * wrote it, is "Result". So the dots and Back and Next say the same as the stage does.
   */
  function follow(out: RunOutcome): void {
    const step = out === baseOutcome ? 0 : 1;
    if (step === here.step) return;
    shown = `${here.id}:${step}`;
    void goto(turnHref(here.id, step), { ...stay, replaceState: true });
  }

  function land(out: RunOutcome, src: string): void {
    ranCode = src;
    outcome = out;
    running = false;
    void motion.set(restOf(out), { duration: reduced() ? 0 : 1500 });
    follow(out);
  }

  /** Run what is in the box: the sweep across the estate, then the answer. */
  async function run(): Promise<void> {
    const no = ++runNo;
    const src = code;
    void motion.set(0, { duration: 0 });
    const known = knownOutcome(src);
    if (known) return land(known, src);
    running = true;
    const out = await runInSandbox({ code: src, projection, rationale: ex.base.rationale });
    if (no === runNo) land(out, src);
  }

  function load(id: string): void {
    const next = id === 'base' ? ex.base.code : ex.changes.find((c) => c.id === id)?.code;
    if (next === undefined) return;
    code = next;
    void run();
  }

  // Each beat opens on its own program: the one the room has been shown, or the change it was asked for.
  $effect(() => {
    const key = `${here.id}:${here.step}`;
    untrack(() => {
      const first = shown === '';
      const same = shown === key;
      shown = key;
      if (first || same) return;
      code = startCode();
      void run();
    });
  });

  // ── what is said ─────────────────────────────────────────────────────────
  const says = $derived.by(() => {
    if (running) return 'Running in the sandbox\u2026';
    if (atBase) return `${ex.predict} Answer in the chat before the change runs.`;
    return ex.says(baseOutcome, outcome);
  });
  const verdict = $derived.by((): 'match' | 'differs' | null => {
    if (loaded !== '' || edited || running || outcome.status !== 'ok') return null;
    return sameAnswer(outcome, refOutcome) ? 'match' : 'differs';
  });
  const tiles = $derived(ex.tiles(baseOutcome).map((t, i) => ({ ...t, now: ex.tiles(outcome)[i].value })));
  const stageLabel = $derived(`${atBase ? 'Predict' : 'Result'}. ${says}`);

  function pick(id: ExerciseId): void {
    void goto(turnHref(id, 0), stay);
  }
  const nextLabel = (i: number): string => (BEATS[i].id === BEATS[i + 1].id ? 'Run the change' : `Next: ${exercises.find((e) => e.id === BEATS[i + 1].id)?.label.toLowerCase()}`);
</script>

<svelte:head>
  <title>Your turn · From tools to code surfaces</title>
</svelte:head>

<div class="screen">
  <header class="top">
    <h1 class="t-h1">Change one thing. Say what moves.</h1>
    <Segmented
      label="Exercise"
      size="sm"
      value={here.id}
      onchange={pick}
      accent="var(--color-brand)"
      options={exercises.map((e) => ({ id: e.id, label: e.label }))}
    />
  </header>

  <section class="t-panel ask" aria-label="The exercise">
    <span class="v-label">Your turn</span>
    <span class="ask-text">{ex.ask}</span>
  </section>

  <ProgramStage {stage} {view} {u} label={stageLabel} bind:code {running} onrun={() => void run()} />

  <p class="t-lead caption" aria-live="polite">
    {#if atBase && !running}<b class="lead-in">Predict.</b>{/if}
    {says}
  </p>

  <section class="strip" aria-label="Before and after">
    <ul class="tiles">
      {#each tiles as t (t.label)}
        <li class="tile">
          <span class="tl">{t.label}</span>
          <span class="tv">
            <span class="was">{t.value}</span>
            <span class="to" aria-hidden="true">{'\u2192'}</span>
            <span class="now" class:q={atBase} class:ran={!atBase}>{atBase ? '?' : t.now}</span>
          </span>
        </li>
      {/each}
    </ul>
    <div class="ctl">
      <Segmented
        label="Program"
        size="sm"
        value={loaded}
        onchange={load}
        accent="var(--color-brand)"
        options={[{ id: 'base', label: 'Before' }, ...ex.changes.map((c) => ({ id: c.id, label: c.label }))]}
      />
      {#if verdict}
        <span class="verdict" class:differs={verdict === 'differs'}>{verdict === 'match' ? 'Same answer as the reference' : 'Not the reference answer'}</span>
      {/if}
      <button type="button" class="t-btn primary sm" onclick={() => void run()} disabled={running}>
        <Play size={13} />
        {running ? 'Running\u2026' : edited ? 'Run your edit' : 'Run'}
        <span class="kbd">{'\u2318\u21b5'}</span>
      </button>
    </div>
  </section>

  <div class="nav">
    <BeatNav
      {at}
      beats={BEATS}
      before={{ href: '/tour/code', label: 'The code surface' }}
      after={{ href: '/tour/results', label: 'How it holds up' }}
      {nextLabel}
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

  .ask {
    display: flex;
    align-items: baseline;
    gap: 10px;
    /* Two lines is the longest exercise; reserve them so the stage does not change size from one exercise to the next. */
    min-height: 52px;
    padding: 6px 14px;
    font-size: 13.5px;
    line-height: 1.4;
    color: var(--color-text-secondary);
  }
  .v-label {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .ask-text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* What is happening, under the picture it is happening in. Two lines is the longest narration; reserve them so the stage above never jumps. */
  .caption {
    margin: -3px 0;
    max-width: none;
    min-height: 2.8em;
  }
  .lead-in {
    margin-right: 4px;
    color: var(--color-brand);
  }

  /* ── under the stage: always the same height, so nothing moves when it changes ── */
  .strip {
    height: 74px;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 0 4px;
  }
  .tiles {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid var(--color-border-default);
    background: #fff;
    min-width: 0;
  }
  .tl {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tv {
    display: flex;
    align-items: baseline;
    gap: 7px;
    font-size: 17px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .was {
    color: var(--color-text-muted);
  }
  .to {
    color: var(--color-text-dim);
    font-weight: 500;
  }
  .now {
    color: var(--color-text-dim);
  }
  .now.ran {
    color: var(--color-text-primary);
  }
  .now.q {
    color: var(--color-brand);
  }

  .ctl {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .verdict {
    font-size: 12.5px;
    font-weight: 700;
    color: #047857;
    white-space: nowrap;
  }
  .verdict.differs {
    color: #b45309;
  }
  .kbd {
    margin-left: 4px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    opacity: 0.75;
  }

  .nav {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin-top: auto;
    padding: 6px 0 2px;
    background: linear-gradient(to top, var(--color-page-bg) 75%, transparent);
  }

  /* Presented, the exercise, the narration and the strip are as tight as they can be and still read from the back of a room,
     and the stage, which keeps its proportions, takes everything they leave. */
  :global(.tour.present) .ask {
    min-height: 48px;
    padding: 4px 12px;
  }
  :global(.tour.present) .caption {
    margin: -2px 0;
    font-size: 15px;
    color: var(--color-text-secondary);
  }
  :global(.tour.present) .strip {
    height: 66px;
  }
  :global(.tour.present) .tile {
    padding: 4px 10px;
  }
</style>
