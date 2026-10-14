<script lang="ts">
  import { untrack } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import solutionDoc from '../../../../docs/solution-path-examples.md?raw';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { buildProjection } from '$lib/inventory/projection';
  import { SCHEMA_DOC } from '$lib/surfaces/code/helpers';
  import { CODE_TOOLS } from '$lib/surfaces/code/schemas';
  import ObjectStage from '$lib/components/tour/ObjectStage.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import TourNav from '$lib/components/tour/TourNav.svelte';
  import Transport from '$lib/components/tour/Transport.svelte';
  import { ACTS, LAST_STEP, PROGRAM_MAX_LINES, STEP_IDS, actOf, buildObjectStage, type ActId, type StepId } from '$lib/tour/object-stage';
  import { contractExcerpt, programBlocks, stepCopy, traceAccess } from '$lib/tour/object-trace';
  import { parseSolutionPrograms } from '$lib/tour/programs';
  import { estimateTokens } from '$lib/tour/tokens';

  const VM_NAME = 'web-prod-03';

  // Everything the screen shows comes from the benchmark's own data and the benchmark's own reference
  // program; building it throws if any of it has drifted, so the screen cannot quietly show something else.
  const inv = buildInventory();
  const projection = buildProjection(inv);
  const program = parseSolutionPrograms(solutionDoc)['granular-read'].code;
  if (program.split('\n').length > PROGRAM_MAX_LINES) {
    throw new Error(`The reference program has more lines than the program panel holds (${PROGRAM_MAX_LINES}); make the panel taller or the program shorter`);
  }
  const stage = buildObjectStage(inv, projection, { vmName: VM_NAME });
  const trace = traceAccess(program, projection);
  const blocks = programBlocks(program);
  const contract = contractExcerpt(SCHEMA_DOC);
  // The whole definition the model is sent for the tool (name, description, parameters): the very number the
  // language screen holds its own tool definitions against, so the two screens never quote two sizes for one tool.
  const definitionTokens = estimateTokens(JSON.stringify(CODE_TOOLS));
  const stored = inv.resources.find((r) => r.name === VM_NAME)!;
  const projected = projection.resources.find((r) => r.name === VM_NAME)!;
  const removedFields = Object.keys(stored).filter((k) => !(k in projected));
  const facts = { trace, resources: stage.counts.resources, subscriptions: stage.counts.subscriptions, groups: stage.counts.groups, vmName: VM_NAME };
  const TOTAL = STEP_IDS.length;

  /** How long it takes to arrive at each step from the one before, in ms. */
  const STEP_MS: Record<StepId, number> = {
    estate: 0,
    containers: 1300,
    links: 1500,
    flatten: 2300,
    contract: 1000,
    program: 1100,
    index: 1500,
    find: 1500,
    nic: 1100,
    ip: 1100,
    return: 1200
  };
  const HOLD_MS = 1500;

  // ── state (seeded from the URL so a step can be bookmarked) ────────────
  const startParam = Number(page.url.searchParams.get('step'));
  const start = Number.isFinite(startParam) ? Math.max(0, Math.min(LAST_STEP, Math.floor(startParam))) : 0;
  let frame = $state(start);
  let playing = $state(false);
  /** The motion position the stage is drawn at: the step, plus the way there. */
  const motion = new Tween(start, { duration: 0 });
  const t = $derived(motion.current);

  const copy = $derived(stepCopy(STEP_IDS[frame], facts));
  const frameLabel = $derived(`Step ${frame + 1}/${TOTAL} \u00b7 ${copy.label}`);
  const valueText = $derived(`Step ${frame + 1} of ${TOTAL}: ${copy.label}`);
  const stageLabel = $derived(`${copy.label}. ${copy.text}`);

  const reduced = (): boolean => browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Time to move the stage from `from` to `to`: the sum of the steps it crosses, quicker when it crosses several. */
  function travelMs(from: number, to: number): number {
    if (reduced()) return 0;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    let ms = 0;
    for (let k = Math.floor(lo) + 1; k <= Math.ceil(hi); k += 1) {
      ms += STEP_MS[STEP_IDS[k]] * Math.max(0, Math.min(hi, k) - Math.max(lo, k - 1));
    }
    if (hi - lo > 1.5) ms *= 0.6;
    if (to < from) ms *= 0.8;
    return Math.min(ms, 2800);
  }

  // ── actions ────────────────────────────────────────────────────────────
  function syncUrl(): void {
    const qs = frame > 0 ? `?step=${frame}` : '';
    try {
      replaceState(page.url.pathname + qs, page.state);
    } catch {
      /* router not ready: the URL is a convenience, not state */
    }
  }

  function go(n: number): void {
    frame = Math.max(0, Math.min(LAST_STEP, n));
    void motion.set(frame, { duration: travelMs(motion.current, frame) });
  }
  function setFrame(n: number): void {
    playing = false;
    go(n);
    syncUrl();
  }
  function setAct(id: ActId): void {
    setFrame(ACTS.find((a) => a.id === id)?.first ?? 0);
  }
  function togglePlay(): void {
    if (playing) {
      playing = false;
      syncUrl();
      return;
    }
    if (reduced()) {
      setFrame(LAST_STEP);
      return;
    }
    if (frame >= LAST_STEP) go(0);
    playing = true;
  }

  // Autoplay: arrive at a step, hold it so it can be read, move on.
  $effect(() => {
    if (!playing) return;
    const at = frame;
    const wait = untrack(() => travelMs(motion.current, at)) + HOLD_MS;
    const id = setTimeout(() => {
      if (at >= LAST_STEP) {
        playing = false;
        syncUrl();
        return;
      }
      go(at + 1);
    }, wait);
    return () => clearTimeout(id);
  });

  function onWindowKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    // Keys inside a form control or the part selector belong to that widget.
    if (el?.closest('input, textarea, select, dialog, [role=radio], [role=tab]') || el?.isContentEditable) return;
    if (e.key === 'ArrowRight') setFrame(frame + 1);
    else if (e.key === 'ArrowLeft') setFrame(frame - 1);
    else if (e.key === 'Home') setFrame(0);
    else if (e.key === 'End') setFrame(LAST_STEP);
    else if (e.key === ' ' && !el?.closest('button, a, summary')) togglePlay();
    else return;
    e.preventDefault();
  }
</script>

<svelte:head>
  <title>The object · From tools to code surfaces</title>
</svelte:head>
<svelte:window onkeydown={onWindowKey} />

<div class="screen">
  <header class="top">
    <h1 class="t-h1">Stop adding tools. Reshape the estate.</h1>
    <Segmented
      label="Part of the walkthrough"
      size="sm"
      value={actOf(frame)}
      onchange={setAct}
      accent="var(--color-brand)"
      options={ACTS.map((a) => ({ id: a.id, label: a.label, title: a.hint }))}
    />
    <TourNav prev={{ href: '/tour/language', label: 'A language' }} next={{ href: '/tour/code', label: 'Code surface' }} />
    <p class="t-lead" aria-live="polite">{copy.text}</p>
  </header>

  <section class="t-panel run" aria-label="Walkthrough controls">
    <div class="run-transport">
      <Transport {frame} last={LAST_STEP} {playing} onframe={setFrame} onplay={togglePlay} {valueText} label={frameLabel} />
    </div>
    <div class="ask">
      <span class="swatch" aria-hidden="true"></span>
      <span class="v-label">Question</span>
      <span class="ask-text">power state and public IP of <b>{VM_NAME}</b>, the pod outlined on the map</span>
    </div>
  </section>

  <section class="t-panel stage-panel" aria-label="The estate becoming an object">
    <div class="stage-wrap">
      <div class="stage-box">
        <ObjectStage {t} label={stageLabel} {stage} {trace} code={program} {blocks} {contract} {definitionTokens} {removedFields} />
      </div>
    </div>
  </section>
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
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 2px 14px;
    min-width: 0;
  }
  .top .t-lead {
    grid-column: 1 / -1;
    /* Two lines is the longest narration; reserve them so the stage below never jumps. */
    min-height: 2.8em;
  }

  .run {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    padding: 6px 12px;
  }
  .run-transport {
    flex: 1 1 520px;
    min-width: 0;
  }
  .ask {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding-left: 18px;
    border-left: 1px solid var(--color-border-default);
    font-size: 13.5px;
    color: var(--color-text-secondary);
  }
  /* The same dashed outline the map draws around the pod the question is about. */
  .swatch {
    align-self: center;
    width: 15px;
    height: 13px;
    border: 1.5px dashed #0f172a;
    border-radius: 4px;
  }
  .v-label {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .ask-text b {
    font-family: var(--font-mono);
    color: var(--color-text-primary);
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
    width: min(100cqw, calc(100cqh * 1400 / 680));
    aspect-ratio: 1400 / 680;
  }
</style>
