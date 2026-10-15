<script lang="ts">
  import { untrack } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { Check, Play, RotateCcw, X } from '@lucide/svelte';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { buildProjection } from '$lib/inventory/projection';
  import BeatNav from '$lib/components/tour/BeatNav.svelte';
  import GateChain from '$lib/components/tour/GateChain.svelte';
  import ProgramStage from '$lib/components/tour/ProgramStage.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import { runInSandbox } from '$lib/tour/code-client';
  import { runTracked, type RunOutcome } from '$lib/tour/code-run';
  import type { Decision } from '$lib/tour/code-view';
  import { U_START, bandsOf, lineHeightFor, type ExampleView } from '$lib/tour/example-stage';
  import {
    DROPPED_FIELDS,
    GUARD_BEATS,
    GUARD_PANELS,
    PRODUCTION_RULE,
    PROGRAMS,
    buildGuard,
    gateOf,
    guardHref,
    programOf,
    type GateId,
    type GateStatus,
    type ProgramId
  } from '$lib/tour/guard';
  import { buildObjectStage } from '$lib/tour/object-stage';
  import { fmtInt } from '$lib/utils';
  import { parseAt } from '$lib/tour/workshop';

  // The same estate, the same object and the same runtime the benchmark runs: every refusal on this screen is a real run.
  const inv = buildInventory();
  const projection = buildProjection(inv);
  const stage = buildObjectStage(inv, projection, { vmName: 'web-prod-03' });
  /** What the stage shows while a run is in flight: a program that has not said anything yet. */
  const IDLE = runTracked({ code: 'function main(data) {\n}', projection });
  const NO_GATES: Record<GateId, GateStatus> = { read: 'idle', run: 'idle', change: 'idle', rule: 'idle', review: 'idle', apply: 'idle' };

  // ── where we are (the URL is the state, so Back and Forward walk the beats) ──
  const here = $derived(parseAt(page.url.searchParams, GUARD_BEATS.length));
  const beat = $derived(GUARD_BEATS[here]);
  const isTry = $derived(beat.id === 'try');
  const gate = $derived(beat.id === 'try' ? null : gateOf(beat.id));

  // ── what the room has done on this beat ──────────────────────────────────
  // It belongs to the beat, so opening another one starts clean, and nothing has to be reset.
  interface Local {
    beat: number;
    program: ProgramId | null;
    ruleOn: boolean;
    decision: Decision;
    /** The text box, once it has been typed in. */
    code: string | null;
    /** What a run that happened in the worker returned. */
    ran: { code: string; outcome: RunOutcome } | null;
    running: boolean;
  }
  const fresh = (b: number): Local => ({ beat: b, program: null, ruleOn: true, decision: 'pending', code: null, ran: null, running: false });
  let local = $state.raw<Local>(fresh(-1));
  const mine = $derived(local.beat === here ? local : fresh(here));
  const patch = (p: Partial<Local>): void => {
    local = { ...(local.beat === here ? local : fresh(here)), ...p, beat: here };
  };

  const programId = $derived(mine.program ?? beat.start);
  const program = $derived(PROGRAMS[programId]);
  const ruleOn = $derived(mine.ruleOn);
  const decision = $derived(mine.decision);
  const running = $derived(mine.running);

  /** The program on stage: the beat's own, or in the last beat the one that was last run. */
  const shownCode = $derived(isTry ? (mine.ran?.code ?? PROGRAMS[programId].code) : program.code);
  const textCode = $derived(mine.code ?? PROGRAMS[programId].code);
  const dirty = $derived(isTry && textCode !== shownCode);

  /** What a run returned, when it did not run in the page: one that has a clock on it, or a program the room typed. */
  const outcome = $derived.by((): RunOutcome | undefined => {
    if (running) return IDLE;
    if (mine.ran && mine.ran.code === shownCode) return mine.ran.outcome;
    return !isTry && program.worker ? IDLE : undefined;
  });
  const view = $derived(buildGuard({ beat: beat.id, code: shownCode, rationale: programOf(shownCode)?.rationale, inv, projection, ruleOn, decision, outcome }));

  // While the room is typing, the stage keeps the answer to the last run and takes the lines from the text box.
  const live = $derived(textCode.split('\n'));
  const stageView = $derived.by((): ExampleView => {
    if (!dirty) return view.example;
    const b = bandsOf(live);
    return { ...view.example, lines: live, lineHeight: lineHeightFor(live.length, Boolean(view.example.rationale)), body: b.body, ret: b.ret };
  });
  const flags = $derived(dirty ? [] : view.flags);
  const stop = $derived(dirty ? null : view.stop);
  const gates = $derived(running ? NO_GATES : view.gates);

  // ── running a program in the worker (the only place a program the room wrote can run) ──
  let runNo = 0;
  async function runInWorker(code: string): Promise<void> {
    const no = ++runNo;
    const on = here;
    patch({ running: true });
    const out = await runInSandbox({ code, projection, rationale: programOf(code)?.rationale });
    if (no !== runNo || on !== here) return;
    patch({ running: false, ran: { code, outcome: out } });
  }
  function load(id: ProgramId): void {
    patch({ program: id, decision: 'pending', ran: null, code: PROGRAMS[id].code });
    if (isTry || PROGRAMS[id].worker) void runInWorker(PROGRAMS[id].code);
  }
  const runText = (): void => void runInWorker(textCode);

  // ── motion ───────────────────────────────────────────────────────────────
  const motion = new Tween(0, { duration: 0 });
  const u = $derived(motion.current);
  const reduced = (): boolean => browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** While a run is in flight the program is running, and nothing has come back. */
  const RUN_AT = 0.15;
  /** Milliseconds for each unit of `u`, from the program being written to the change set being shown. */
  const UNIT_MS = [700, 1300, 700, 600];

  /** Time and easing for a tween between two places on the stage, each stretch of it at its own pace. */
  function pace(from: number, to: number): { duration: number; easing: (t: number) => number } {
    if (reduced() || from === to) return { duration: 0, easing: (t) => t };
    if (to < from) return { duration: 450, easing: (t) => t };
    const legs: Array<{ a: number; b: number; ms: number }> = [];
    for (let k = 0; k < UNIT_MS.length; k += 1) {
      const a = Math.max(from, U_START + k);
      const b = Math.min(to, U_START + k + 1);
      if (b > a) legs.push({ a, b, ms: UNIT_MS[k] * (b - a) });
    }
    const total = legs.reduce((s, l) => s + l.ms, 0);
    return {
      duration: total,
      easing: (t) => {
        let left = t * total;
        for (const l of legs) {
          if (left <= l.ms) return (l.a + ((l.b - l.a) * left) / l.ms - from) / (to - from);
          left -= l.ms;
        }
        return 1;
      }
    };
  }

  // The first render has the program on the panel and nothing run yet, so the page is right before any script runs;
  // the effect then plays the beat.
  let lastBeat = -1;
  let lastCode = '';
  $effect(() => {
    const idx = here;
    const code = shownCode;
    const target = view.endU;
    const busy = running;
    untrack(() => {
      const opened = idx !== lastBeat;
      const changed = code !== lastCode;
      lastBeat = idx;
      lastCode = code;
      if (busy) {
        void motion.set(RUN_AT, { duration: 0 });
      } else if (opened && changed) {
        // A beat with a program of its own: it is written in, then run.
        void motion.set(U_START, { duration: 0 });
        void motion.set(target, pace(U_START, target));
      } else if (changed) {
        // Another program on the same stage: it runs.
        void motion.set(0, { duration: 0 });
        void motion.set(target, pace(0, target));
      } else void motion.set(target, pace(motion.current, target));
    });
  });

  // ── what is said ─────────────────────────────────────────────────────────
  const stageLabel = $derived(`${beat.label}. ${view.lead}`);
  const plural = (n: number, one: string, many = `${one}s`): string => `${fmtInt(n)} ${n === 1 ? one : many}`;
  const sets = $derived(view.example.review);
  /** What sits under the gate's name: where it lives, and what it is not. */
  const FOOT: Record<GateId, string> = {
    read: `Never in the object: ${DROPPED_FIELDS.join(', ')}.`,
    run: 'A demo sandbox, a worker and a clock. Not a security boundary.',
    change: 'Writable: tags, string to string, and a VM\u2019s power state. The rest is read-only.',
    rule: 'Yours to add: the benchmark\u2019s runtime has no such rule.',
    review: 'The change set is a diff. Nothing is applied until someone says so.',
    apply: 'The runtime checks the whole proposal again, against the estate as it is.'
  };
  const nextLabel = (i: number): string => `Next: ${GUARD_BEATS[i + 1].label}`;
</script>

<svelte:head>
  <title>Security and writes · From tools to code surfaces</title>
</svelte:head>

<div class="screen">
  <header class="top">
    <h1 class="t-h1">The model proposes. Six gates decide.</h1>
    <GateChain {gates} active={beat.id} {ruleOn} href={guardHref} />
  </header>

  <section class="t-panel ask" aria-label="What the model was asked">
    <span class="v-label">Asked</span>
    <span class="ask-text">{view.ask}</span>
  </section>

  <ProgramStage
    {stage}
    view={stageView}
    {u}
    label={stageLabel}
    bind:code={() => textCode, (v) => patch({ code: v })}
    editable={isTry}
    {running}
    {decision}
    {flags}
    {stop}
    told={view.told}
    onrun={runText}
  />

  <p class="t-lead caption" aria-live="polite">{view.lead}</p>

  <section class="strip" aria-label="What this gate decides, and what you can do with it">
    {#if beat.id === 'review' || beat.id === 'apply'}
      <div class="review">
        <p class="review-text">
          {#if decision === 'pending'}
            <b>{plural(sets?.resources ?? 0, 'resource')}, {plural(sets?.fields ?? 0, 'field')}.</b>
            {beat.id === 'apply' ? 'Approve it, and applying checks it against the estate as it is now.' : 'Nothing is applied until someone says so.'}
          {:else if decision === 'declined'}
            <b>Declined.</b> Nothing was applied, and the model is told not to retry.
          {:else if view.applied?.ok === false}
            <b>Not applied.</b> {view.movedOn} had already changed, so nothing was written.
          {:else}
            <b>Applied</b> to this copy of the estate.
          {/if}
        </p>
        {#if decision === 'pending'}
          <div class="decide">
            <button type="button" class="t-btn primary" onclick={() => patch({ decision: 'approved' })}><Check size={15} />Approve and apply</button>
            <button type="button" class="t-btn" onclick={() => patch({ decision: 'declined' })}><X size={15} />Decline</button>
          </div>
        {:else}
          <div class="decide">
            <span class="decided" class:no={decision === 'declined' || view.applied?.ok === false}>{decision === 'declined' ? 'Declined' : view.applied?.ok === false ? 'Refused' : 'Approved'}</span>
            <button type="button" class="t-btn" onclick={() => patch({ decision: 'pending' })}><RotateCcw size={14} />Undo</button>
          </div>
        {/if}
      </div>
    {:else}
      <div class="gate-strip">
        <div class="says">
          <span class="says-name">{gate ? gate.label : 'Your program'}</span>
          <span class="says-line">{gate ? (gate.id === 'rule' ? PRODUCTION_RULE.text : gate.says) : 'Edit it, then run it.'}</span>
          <span class="says-foot">{gate ? FOOT[gate.id] : 'The gates decide what happens next.'}</span>
        </div>
        {#if beat.variants.length > 1}
          <div class="chips" role="group" aria-label="Programs to try">
            {#each beat.variants as id (id)}
              <button type="button" class="chip" class:on={shownCode === PROGRAMS[id].code} onclick={() => load(id)} title={PROGRAMS[id].why}>{PROGRAMS[id].label}</button>
            {/each}
          </div>
        {/if}
        <div class="right">
          {#if beat.id === 'rule'}
            <Segmented
              label="Your rule"
              size="sm"
              value={ruleOn ? 'on' : 'off'}
              onchange={(v) => patch({ ruleOn: v === 'on', decision: 'pending' })}
              accent="var(--color-brand)"
              options={[
                { id: 'on', label: 'Rule on' },
                { id: 'off', label: 'Rule off' }
              ]}
            />
          {:else if isTry}
            {#if dirty}<span class="run-hint warn">Edited: run it again</span>{/if}
            <button type="button" class="t-btn primary sm" onclick={runText} disabled={running}>
              <Play size={13} />
              {running ? 'Running\u2026' : 'Run'}
              <span class="kbd">{'\u2318\u21b5'}</span>
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </section>

  <div class="nav">
    <BeatNav
      at={here}
      beats={GUARD_PANELS}
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
  /* What is happening, under the picture it is happening in. Two lines is the longest narration; reserve them so the stage above never jumps. */
  .caption {
    margin: -3px 0;
    max-width: none;
    min-height: 2.8em;
  }

  .ask {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-height: 40px;
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

  .gate-strip {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .says {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 0 1 470px;
    min-width: 0;
  }
  .says-name {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-brand);
  }
  .says-line {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .says-foot {
    font-size: 12.5px;
    line-height: 1.35;
    color: var(--color-text-muted);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    gap: 5px 6px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .chip {
    height: 26px;
    padding: 0 11px;
    border: 1px solid var(--color-border-default);
    border-radius: 999px;
    background: #fff;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .chip:hover {
    border-color: var(--color-brand);
    color: var(--color-brand);
  }
  .chip.on {
    border-color: var(--color-brand);
    background: color-mix(in srgb, var(--color-brand) 10%, #fff);
    color: var(--color-brand);
  }
  .right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex: 0 0 auto;
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

  .nav {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin-top: auto;
    padding: 6px 0 2px;
    background: linear-gradient(to top, var(--color-page-bg) 75%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .chip {
      transition: none;
    }
  }

  /* Presented, the question, the narration and the strip are as tight as they can be and still read from the back of a room,
     and the stage, which keeps its proportions, takes everything they leave. */
  :global(.tour.present) .ask {
    min-height: 34px;
    padding: 3px 12px;
  }
  :global(.tour.present) .caption {
    margin: -2px 0;
    font-size: 15px;
    color: var(--color-text-secondary);
  }
  :global(.tour.present) .strip {
    height: 66px;
  }
</style>
