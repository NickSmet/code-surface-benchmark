<script lang="ts">
  import { untrack } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Check, Play, RotateCcw, X } from '@lucide/svelte';
  import solutionDoc from '../../../../docs/solution-path-examples.md?raw';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { buildProjection } from '$lib/inventory/projection';
  import BeatNav from '$lib/components/tour/BeatNav.svelte';
  import ExampleStage from '$lib/components/tour/ExampleStage.svelte';
  import RunBar from '$lib/components/tour/RunBar.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import { runInSandbox } from '$lib/tour/code-client';
  import { runTracked, type RunOutcome } from '$lib/tour/code-run';
  import {
    BREAK_START,
    EXAMPLES,
    LAYER_LINE,
    PHASE_U,
    PHASE_WORD,
    U_START,
    billStrip,
    buildExample,
    defOf,
    exampleBeats,
    exampleHref,
    freshOf,
    parseExampleState,
    probeFor,
    probesOf,
    type ExampleDef,
    type ExampleId,
    type ExampleView,
    type Layer
  } from '$lib/tour/example-stage';
  import { buildObjectStage } from '$lib/tour/object-stage';
  import { CONTRACT_PROBES, parseSolutionPrograms } from '$lib/tour/programs';
  import { fmtInt } from '$lib/utils';

  const VM_NAME = 'web-prod-03';

  // The same estate, the same object and the same programs the benchmark runs: nothing here is a mock-up.
  const inv = buildInventory();
  const projection = buildProjection(inv);
  const programs = parseSolutionPrograms(solutionDoc);
  const stage = buildObjectStage(inv, projection, { vmName: VM_NAME });
  const BEATS = exampleBeats();
  /** What the stage shows before anything has run. */
  const IDLE = runTracked({ code: 'function main(data) {\n}', projection });
  const stay = { noScroll: true, keepFocus: true } as const;

  // ── where we are (the URL is the state, so Back and Forward walk the beats) ──
  const here = $derived(parseExampleState(page.url.searchParams));
  const def = $derived(defOf(here.id));
  const phase = $derived(def.phases[here.step]);
  const at = $derived(BEATS.findIndex((b) => b.id === here.id && b.step === here.step));
  const isBreak = $derived(def.kind === 'break');

  // ── the examples that run on their own ───────────────────────────────────
  function sourceOf(d: ExampleDef): { code: string; rationale?: string } | null {
    if (d.kind === 'task' && d.task) return programs[d.task];
    const q = freshOf(d);
    return q ? { code: q.code } : null;
  }
  const fixed = $derived.by((): ExampleView | null => {
    const src = sourceOf(def);
    if (!src) return null;
    const outcome = runTracked({ code: src.code, projection, rationale: src.rationale });
    const strip = def.kind === 'task' && def.task ? billStrip(def.task, programs[def.task]) : undefined;
    return buildExample({ def, program: src, outcome, inv, strip });
  });

  // ── "try to break it": the program is the reader's to change, and it runs in a worker with a time limit ──
  let breakCode = $state(CONTRACT_PROBES.find((p) => p.id === BREAK_START.see)!.code);
  let breakOutcome = $state.raw<RunOutcome | null>(null);
  let ranCode = $state('');
  let running = $state(false);
  let runNo = 0;
  const layer = $derived<Layer>(phase === 'change' || phase === 'do' ? phase : 'see');
  const probe = $derived(probeFor(breakCode));
  const edited = $derived(isBreak && breakOutcome !== null && ranCode !== breakCode);
  const breakView = $derived(
    isBreak ? buildExample({ def, program: { code: breakCode }, outcome: breakOutcome ?? IDLE, inv }) : null
  );

  const view = $derived<ExampleView>(fixed ?? breakView ?? buildExample({ def, program: { code: breakCode }, outcome: IDLE, inv }));

  // ── a person's decision on a change set ──────────────────────────────────
  let decision = $state<'pending' | 'approved' | 'declined'>('pending');

  // ── motion ───────────────────────────────────────────────────────────────
  const motion = new Tween(0, { duration: 0 });
  const u = $derived(motion.current);
  const reduced = (): boolean => browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** How long it takes to get from one place on the stage to another. The run needs time for its sweep. */
  function travel(from: number, to: number): number {
    if (reduced() || from === to) return 0;
    if (to < from) return 450;
    if (from <= U_START + 0.001) return 1000;
    if (from < 1 && to >= 1) return 1700;
    return 900;
  }

  // The first render is the beat as the URL names it, so the page is right before any script runs.
  untrack(() => motion.set(isBreak ? 0 : PHASE_U[phase], { duration: 0 }));

  let shown: ExampleId | null = null;
  $effect(() => {
    const id = here.id;
    const step = here.step;
    untrack(() => {
      decision = 'pending';
      if (def.kind === 'break') {
        shown = id;
        return;
      }
      const target = PHASE_U[def.phases[step]];
      if (shown !== id && target === 0) {
        // A new example opens with its program being written.
        void motion.set(U_START, { duration: 0 });
        void motion.set(0, { duration: travel(U_START, 0) });
      } else void motion.set(target, { duration: travel(motion.current, target) });
      shown = id;
    });
  });

  async function runBreak(): Promise<void> {
    const no = ++runNo;
    running = true;
    void motion.set(0, { duration: 0 });
    const out = await runInSandbox({ code: breakCode, projection });
    if (no !== runNo) return;
    ranCode = breakCode;
    breakOutcome = out;
    running = false;
    void motion.set(2, { duration: reduced() ? 0 : 1500 });
  }
  function loadProbe(id: string): void {
    const p = CONTRACT_PROBES.find((x) => x.id === id);
    if (!p) return;
    breakCode = p.code;
    void runBreak();
  }
  // Each of the three beats opens on its own probe.
  $effect(() => {
    if (def.kind !== 'break') return;
    const l = layer;
    untrack(() => loadProbe(BREAK_START[l]));
  });

  function onEditorKey(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void runBreak();
    }
  }

  // ── what is said ─────────────────────────────────────────────────────────
  const lead = $derived.by(() => {
    if (phase === 'review' && decision === 'approved') return `Approved: the ${view.review?.resources ?? 0} resources now carry the change, in this copy of the estate.`;
    if (phase === 'review' && decision === 'declined') return 'Declined: nothing changed. The estate is exactly as it was.';
    return view.copy[phase] ?? '';
  });
  const stageLabel = $derived(`${PHASE_WORD[phase]}. ${lead}`);
  const plural = (n: number, one: string, many = one + 's'): string => `${fmtInt(n)} ${n === 1 ? one : many}`;

  function pick(id: ExampleId): void {
    void goto(exampleHref(id, 0), stay);
  }
  const nextLabel = (i: number): string => {
    const here = BEATS[i];
    const next = BEATS[i + 1];
    return here.id === next.id ? `Next: ${PHASE_WORD[next.phase]}` : `Next example: ${EXAMPLES.find((e) => e.id === next.id)?.label}`;
  };
</script>

<svelte:head>
  <title>The code surface · From tools to code surfaces</title>
</svelte:head>

<div class="screen">
  <header class="top">
    <h1 class="t-h1">Any question is one program.</h1>
    <Segmented
      label="Example"
      size="sm"
      value={here.id}
      onchange={pick}
      accent="var(--color-brand)"
      options={EXAMPLES.map((e) => ({ id: e.id, label: e.label }))}
    />
    <p class="t-lead" aria-live="polite">{lead}</p>
  </header>

  <section class="t-panel ask" aria-label="The question">
    <span class="v-label">{isBreak ? 'Try' : 'Question'}</span>
    <span class="ask-text">{view.question}</span>
  </section>

  <section class="t-panel stage-panel" aria-label="A program running on the estate object">
    <div class="stage-wrap">
      <div class="stage-box">
        <ExampleStage {stage} {view} {u} label={stageLabel} {decision} editing={isBreak} {running} />
        {#if isBreak}
          <textarea
            class="editor"
            aria-label="The program. Press Control or Command plus Enter to run it."
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            wrap="off"
            bind:value={breakCode}
            onkeydown={onEditorKey}
            style:--lh={view.lineHeight}
          ></textarea>
        {/if}
      </div>
    </div>
  </section>

  <section class="strip" aria-label="What it comes to">
    {#if isBreak}
      <div class="brk">
        <div class="layer">
          <span class="layer-name">{PHASE_WORD[layer]}</span>
          <span class="layer-line">{LAYER_LINE[layer]}</span>
        </div>
        <Segmented
          label="Things to try"
          size="sm"
          value={probe?.id ?? ''}
          onchange={loadProbe}
          accent="var(--color-brand)"
          options={probesOf(layer).map((p) => ({ id: p.id, label: p.label, title: p.why }))}
        />
        <div class="run-box">
          <span class="run-hint" class:warn={edited}>{edited ? 'Edited: run it again' : 'Edit the program, then'}</span>
          <button type="button" class="t-btn primary sm" onclick={() => void runBreak()} disabled={running}>
            <Play size={13} />
            {running ? 'Running\u2026' : 'Run'}
            <span class="kbd">{'\u2318\u21b5'}</span>
          </button>
        </div>
      </div>
    {:else if phase === 'review' && view.review}
      <div class="review">
        <p class="review-text">
          <b>{plural(view.review.resources, 'resource')}, {plural(view.review.fields, 'field')}.</b>
          {decision === 'approved' ? 'Applied to this copy of the estate.' : decision === 'declined' ? 'Nothing was applied.' : 'Nothing is applied until someone says so.'}
        </p>
        {#if decision === 'pending'}
          <div class="decide">
            <button type="button" class="t-btn primary" onclick={() => (decision = 'approved')}><Check size={15} />Approve and apply</button>
            <button type="button" class="t-btn" onclick={() => (decision = 'declined')}><X size={15} />Decline</button>
          </div>
        {:else}
          <div class="decide">
            <span class="decided" class:no={decision === 'declined'}>{decision === 'approved' ? 'Approved' : 'Declined'}</span>
            <button type="button" class="t-btn" onclick={() => (decision = 'pending')}><RotateCcw size={14} />Undo</button>
          </div>
        {/if}
      </div>
    {:else if view.strip?.kind === 'language'}
      <div class="lang">
        <div class="lang-col">
          <span class="kicker">The query language from the last screen, as first built</span>
          <span class="lang-body">Refused: <code>{view.strip.refused}</code></span>
        </div>
        <div class="lang-col">
          <span class="kicker">What it would take</span>
          <span class="lang-body">A new feature, <b>{view.strip.needs}</b>, and a longer description for the model to learn.</span>
        </div>
        <div class="lang-col ok">
          <span class="kicker">The code surface</span>
          <span class="lang-body">{phase === 'write' ? 'Writes a program with the one tool it already has.' : `Answered with the one tool it already has, \u2248 ${fmtInt(view.answer.tokens)} tokens back.`}</span>
        </div>
      </div>
    {:else if view.strip?.kind === 'bill' && (phase === 'answer' || phase === 'review')}
      {@const s = view.strip}
      <div class="bill">
        <div class="bars">
          {#each s.bars as b (b.id)}
            <div class="bar-row">
              <span class="bar-label">{b.label}</span>
              <RunBar bill={b.bill} scale={s.scale} height={14} />
              <span class="bar-num">{fmtInt(b.bill.total)} tokens, {plural(b.calls, 'call')}</span>
            </div>
          {/each}
        </div>
        <p class="verdict"><b>{s.headline}</b> {s.note}</p>
      </div>
    {:else}
      <p class="idle">
        {view.strip?.kind === 'bill' ? 'What this costs, against the catalogue at its best, shows once the answer is back.' : ''}
      </p>
    {/if}
  </section>

  <div class="nav">
    <BeatNav
      {at}
      beats={BEATS}
      before={{ href: '/tour/object', label: 'The object' }}
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
  .top .t-lead {
    grid-column: 1 / -1;
    /* Two lines is the longest narration; reserve them so the stage below never jumps. */
    min-height: 2.8em;
  }

  .ask {
    display: flex;
    align-items: baseline;
    gap: 10px;
    /* Two lines is the longest question; reserve them so the stage does not change size from one example to the next. */
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

  /* The stage keeps its proportions and takes the largest size that fits what is left of the window. */
  .stage-panel {
    flex: 1;
    min-height: 380px;
    display: flex;
    padding: 6px;
    overflow-x: auto;
  }
  .stage-wrap {
    flex: 1;
    min-width: 940px;
    min-height: 0;
    container-type: size;
    display: grid;
    place-items: center;
  }
  .stage-box {
    --sw: min(100cqw, calc(100cqh * 1400 / 680));
    position: relative;
    width: var(--sw);
    aspect-ratio: 1400 / 680;
  }

  /* The program is typed over the panel the stage draws: same left edge, same lines, same size. */
  .editor {
    position: absolute;
    left: calc(var(--sw) * 60 / 1400);
    top: calc(var(--sw) * 68 / 1400);
    width: calc(var(--sw) * 628 / 1400);
    height: calc(var(--sw) * 576 / 1400);
    margin: 0;
    padding: 0;
    border: 0;
    outline: 0;
    resize: none;
    overflow: auto;
    background: transparent;
    color: #e2e8f0;
    caret-color: #5eead4;
    font-family: var(--font-mono);
    font-size: calc(var(--sw) * 12.5 / 1400);
    font-weight: 500;
    line-height: calc(var(--sw) * var(--lh) / 1400);
    white-space: pre;
    tab-size: 2;
  }
  .editor::selection {
    background: rgba(45, 212, 191, 0.3);
  }

  /* ── under the stage: always the same height, so nothing moves when it changes ── */
  .strip {
    height: 74px;
    display: flex;
    align-items: center;
    padding: 0 4px;
  }
  .strip > * {
    flex: 1;
    min-width: 0;
  }
  .idle {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-dim);
    text-align: center;
  }

  .kicker {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .bill {
    display: grid;
    grid-template-columns: minmax(0, 620px) minmax(0, 1fr);
    align-items: center;
    gap: 24px;
  }
  .bars {
    display: grid;
    gap: 8px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) 190px;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .bar-label {
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .bar-num {
    font-variant-numeric: tabular-nums;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .verdict {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--color-text-secondary);
  }
  .verdict b {
    color: var(--color-text-primary);
  }

  .lang {
    display: grid;
    grid-template-columns: 1.3fr 1.1fr 1fr;
    gap: 10px;
    align-items: stretch;
  }
  .lang-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--color-border-default);
    background: #fff;
    font-size: 13px;
    line-height: 1.4;
    color: var(--color-text-secondary);
  }
  .lang-col:first-child {
    border-color: #fecaca;
    background: #fef2f2;
  }
  .lang-col.ok {
    border-color: #a7f3d0;
    background: #ecfdf5;
  }
  .lang-col code {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: #7f1d1d;
  }
  .lang-body b {
    color: var(--color-text-primary);
  }

  .review {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .review-text {
    margin: 0;
    font-size: 14px;
    color: var(--color-text-secondary);
  }
  .review-text b {
    color: var(--color-text-primary);
  }
  .decide {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .decided {
    font-size: 14px;
    font-weight: 700;
    color: #047857;
  }
  .decided.no {
    color: var(--color-text-muted);
  }

  .brk {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .layer {
    display: flex;
    flex-direction: column;
    min-width: 190px;
  }
  .layer-name {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-brand);
  }
  .layer-line {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .run-box {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .run-hint {
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .run-hint.warn {
    color: #b45309;
    font-weight: 600;
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
</style>
