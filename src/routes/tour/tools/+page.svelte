<script lang="ts">
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import { Bot, Play, User, Wrench, X } from '@lucide/svelte';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { CATALOG_TOOLS } from '$lib/surfaces/catalog/schemas';
  import { TASKS } from '$lib/tasks';
  import { MAX_ITERATIONS } from '$lib/agent/limits';
  import CallDetail from '$lib/components/tour/CallDetail.svelte';
  import CallRail from '$lib/components/tour/CallRail.svelte';
  import EstateMap, { type GroupPaint } from '$lib/components/tour/EstateMap.svelte';
  import FlowLine from '$lib/components/tour/FlowLine.svelte';
  import ResultModal from '$lib/components/tour/ResultModal.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import StatTile from '$lib/components/tour/StatTile.svelte';
  import TabStrip, { type TabItem } from '$lib/components/tour/TabStrip.svelte';
  import Tip from '$lib/components/tour/Tip.svelte';
  import TouchLegend from '$lib/components/tour/TouchLegend.svelte';
  import TourNav from '$lib/components/tour/TourNav.svelte';
  import Transport from '$lib/components/tour/Transport.svelte';
  import TurnBars from '$lib/components/tour/TurnBars.svelte';
  import UnitCard from '$lib/components/tour/UnitCard.svelte';
  import type { TaskId } from '$lib/tour/answers';
  import { buildEstateModel } from '$lib/tour/estate';
  import { ANSWER_NOTE, CACHE_TIP } from '$lib/tour/explain';
  import { prettyJson } from '$lib/tour/json-highlight';
  import { needleFor } from '$lib/tour/needles';
  import { COLORS, touchPaint, type Paint } from '$lib/tour/paint';
  import type { ReplayCall, ReplayTurn } from '$lib/tour/replay';
  import { billedSplit, callSummary, costFacts, lastFrame, stepBadge, turnAt, turnFlow, type TurnFlow } from '$lib/tour/replay-view';
  import { CATALOG_ROUTES, replayCatalog, taskPrompt } from '$lib/tour/scenarios';
  import { countMarks, marksAt, type TouchKind } from '$lib/tour/touch';
  import { fmtTokens } from '$lib/tour/tokens';
  import { fmtInt } from '$lib/utils';

  type Batch = 'all' | '10' | '1';

  const inv = buildInventory();
  const model = buildEstateModel(inv);
  const toolNames = CATALOG_TOOLS.map((t) => t.function.name);
  const TASK_IDS = TASKS.map((t) => t.id as TaskId);
  const SHORT: Record<TaskId, string> = {
    'granular-read': 'Granular read',
    'filter-aggregate': 'Filter + aggregate',
    'bulk-write': 'Bulk write',
    'single-lookup': 'Single lookup'
  };
  const BATCHES: Array<{ id: Batch; label: string; title: string }> = [
    { id: 'all', label: 'All at once', title: 'The model issues every independent call in one turn.' },
    { id: '10', label: '10 per turn', title: 'The model issues at most ten calls per turn.' },
    { id: '1', label: 'One at a time', title: 'The model issues a single call per turn.' }
  ];

  // ── state (seeded from the URL so a frame can be bookmarked) ───────
  const params = page.url.searchParams;
  const startTask = TASK_IDS.includes(params.get('task') as TaskId) ? (params.get('task') as TaskId) : 'granular-read';
  const startRoute = CATALOG_ROUTES[startTask].find((r) => r.id === params.get('route'))?.id ?? CATALOG_ROUTES[startTask][0].id;
  const startStep = Number(params.get('step'));

  let taskId = $state<TaskId>(startTask);
  let routeId = $state<string>(startRoute);
  let batch = $state<Batch>(['10', '1'].includes(params.get('batch') ?? '') ? (params.get('batch') as Batch) : 'all');
  let frame = $state<number>(Number.isFinite(startStep) && startStep > 0 ? Math.floor(startStep) : 0);
  let playing = $state(false);

  let emphasis = $state<TouchKind | null>(null);
  let hoverStep = $state<number | null>(null);
  let hoverId = $state<string | null>(null);
  let pinnedId = $state<string | null>(null);

  // The pods the current call touched. When it is exactly one, the step is shown zoomed in.
  const callUnits = $derived.by(() => {
    const ids = new Set<string>();
    if (call) {
      for (const t of call.touches) {
        const u = t.resourceId ? model.unitIdOf.get(t.resourceId) : undefined;
        if (u) ids.add(u);
      }
    }
    return ids;
  });
  const autoId = $derived(callUnits.size === 1 ? [...callUnits][0] : null);
  const focusId = $derived(pinnedId ?? hoverId ?? autoId);

  // ── the replay ─────────────────────────────────────────────────────
  const routes = $derived(CATALOG_ROUTES[taskId]);
  const route = $derived(routes.find((r) => r.id === routeId) ?? routes[0]);
  const base = $derived(replayCatalog({ task: taskId, route: route.id }));
  const fanout = $derived(base.turns.some((t) => t.calls.length > 1));
  const replay = $derived(fanout && batch !== 'all' ? replayCatalog({ task: taskId, route: route.id, batchSize: Number(batch) }) : base);
  const last = $derived(lastFrame(replay));
  const f = $derived(Math.min(frame, last));
  const call = $derived(f >= 1 && f <= replay.calls.length ? replay.calls[f - 1] : null);

  const needle = $derived(needleFor(taskId, inv));
  const needleCount = $derived(needle.resourceIds.size > 0 ? needle.resourceIds.size : needle.groupNames.size);
  const marks = $derived(marksAt(replay.touches, f));
  const counts = $derived(countMarks(marks.resources));
  const turnNow = $derived(turnAt(replay, f));
  /** The bill so far: what the model has read and what it has written. */
  const billed = $derived(billedSplit(replay, f));
  const billedNow = $derived(billed.input + billed.output);
  const facts = $derived(costFacts(replay));
  /** The benchmark stops a model that has not finished within this many turns; the replay lets it finish. */
  const overCap = $derived(replay.turns.length > MAX_ITERATIONS);
  const unit = $derived(focusId ? (model.unitById.get(focusId) ?? null) : null);
  const setup = $derived({ system: replay.turns[0].parts.system, tools: replay.turns[0].parts.tools });

  const nameOf = (id: string): string => model.resourceById.get(id)?.name ?? id;
  const frameLabel = $derived(
    f === 0 ? 'Question' : f === last ? 'Answer' : `Step ${f}/${replay.calls.length} \u00b7 turn ${turnNow}/${replay.turns.length}`
  );
  const valueText = $derived(
    f === 0 ? 'The question has been asked' : f === last ? 'The model writes its answer' : `Step ${f} of ${replay.calls.length}: ${call?.name ?? ''}`
  );
  // Read aloud by screen readers on every step; not drawn.
  const caption = $derived.by(() => {
    if (f === 0) return 'The model has the question and nothing else. No resource has been touched.';
    if (call) return `Step ${f}, ${call.name}: ${callSummary(call, nameOf)}`;
    return `The model writes the answer. It touched ${counts.touched} resources to get there; the question needed ${needleCount}.`;
  });

  // ── the transcript tabs ────────────────────────────────────────────
  // One tab is open at a time, and it is wherever the playhead is. Opening another
  // is remembered only until the playhead moves.
  const keyOf = (t: ReplayTurn): string => (t.calls.length > 0 ? `turn-${t.n}` : 'answer');
  const autoKey = $derived(f === 0 ? 'you' : f >= last ? 'answer' : `turn-${turnNow}`);
  /** Turns whose request has been sent by now: each one is a tab. */
  const startedTurns = $derived(replay.turns.filter((t) => (t.calls.length > 0 ? t.calls[0].step <= f : f === last)));
  const keys = $derived(['setup', 'you', ...startedTurns.map(keyOf)]);
  let manual = $state<{ key: string; at: number } | null>(null);
  const openKey = $derived(manual && manual.at === f && keys.includes(manual.key) ? manual.key : autoKey);

  const tabs = $derived.by((): TabItem[] => {
    const away = (key: string): boolean => key === autoKey && openKey !== autoKey;
    const items: TabItem[] = [
      { id: 'setup', label: 'Setup', icon: Wrench, title: 'Instructions and tool definitions, sent on every turn' },
      { id: 'you', label: 'You', icon: User, tone: 'you', title: 'The question', here: away('you') }
    ];
    for (const t of startedTurns) {
      const key = keyOf(t);
      if (t.calls.length > 0) {
        items.push({ id: key, label: `Turn ${t.n}`, title: `Turn ${t.n}: ${callNames(t.calls.filter((c) => c.step <= f))}`, here: away(key) });
      } else {
        items.push({ id: key, label: 'Answer', icon: Bot, tone: 'answer', title: 'The model writes its answer', here: away(key) });
      }
    }
    return items;
  });

  function selectTab(key: string): void {
    if (playing) {
      playing = false;
      syncUrl();
    }
    manual = key === autoKey ? null : { key, at: f };
  }

  // What the open tab shows. A turn shows one of its calls: the one the replay is on, or else its last.
  const openTurn = $derived(replay.turns.find((t) => t.calls.length > 0 && `turn-${t.n}` === openKey) ?? null);
  const openCalls = $derived(openTurn ? openTurn.calls.filter((c) => c.step <= f) : []);
  const shownCall = $derived(openCalls.find((c) => c.step === f) ?? openCalls[openCalls.length - 1] ?? null);
  const answerTurn = $derived(replay.turns[replay.turns.length - 1]);
  /** What a turn read and what it wrote: the line under its tab, in the chart's numbers. */
  const flowOf = (turn: ReplayTurn): TurnFlow => turnFlow(replay.turns, replay.turns.indexOf(turn));

  // The whole result of one call, in a dialog.
  let modalStep = $state<number | null>(null);
  const modalCall = $derived(modalStep !== null ? (replay.calls[modalStep - 1] ?? null) : null);
  function openResult(step: number): void {
    if (playing) {
      playing = false;
      syncUrl();
    }
    modalStep = step;
  }

  /** "get_resource ×3", "list_resources, get_resource ×19". */
  function callNames(calls: ReplayCall[]): string {
    const counts = new Map<string, number>();
    for (const c of calls) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    return [...counts].map(([n, k]) => (k > 1 ? `${n} \u00d7${k}` : n)).join(', ');
  }

  // ── actions ────────────────────────────────────────────────────────
  function syncUrl(): void {
    const p = new URLSearchParams();
    if (taskId !== 'granular-read') p.set('task', taskId);
    if (route.id !== routes[0].id) p.set('route', route.id);
    if (fanout && batch !== 'all') p.set('batch', batch);
    if (f > 0) p.set('step', String(f));
    const qs = p.toString();
    try {
      replaceState(page.url.pathname + (qs ? `?${qs}` : ''), page.state);
    } catch {
      /* router not ready: the URL is a convenience, not state */
    }
  }

  function setFrame(n: number): void {
    playing = false;
    manual = null;
    frame = Math.max(0, Math.min(last, n));
    syncUrl();
  }
  function togglePlay(): void {
    if (playing) {
      playing = false;
      syncUrl();
      return;
    }
    const reduce = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setFrame(last);
      return;
    }
    manual = null;
    if (f >= last) frame = 0;
    playing = true;
  }
  function setTask(id: TaskId): void {
    taskId = id;
    routeId = CATALOG_ROUTES[id][0].id;
    batch = 'all';
    frame = 0;
    playing = false;
    pinnedId = null;
    manual = null;
    syncUrl();
  }
  function setRoute(id: string): void {
    routeId = id;
    batch = 'all';
    frame = Infinity;
    playing = false;
    manual = null;
    syncUrl();
  }
  function setBatch(id: Batch): void {
    batch = id;
    frame = Infinity;
    playing = false;
    manual = null;
    syncUrl();
  }
  function jumpToTurn(n: number): void {
    setFrame(replay.calls.find((c) => c.turn === n)?.step ?? last);
  }
  function select(id: string | null): void {
    pinnedId = pinnedId === id ? null : id;
  }

  // Autoplay: faster for long runs so the whole thing takes about five seconds.
  $effect(() => {
    if (!playing) return;
    const ms = Math.min(900, Math.max(90, Math.round(5200 / Math.max(1, last))));
    const id = setInterval(() => {
      if (frame >= last) {
        playing = false;
        syncUrl();
        return;
      }
      frame += 1;
    }, ms);
    return () => clearInterval(id);
  });

  // ── map painting ───────────────────────────────────────────────────
  function paintOf(id: string): Paint {
    const mark = marks.resources.get(id);
    const p = touchPaint(id, mark, { emphasis, needle: needle.resourceIds, currentStep: f });
    if (hoverStep !== null && !mark?.steps.includes(hoverStep)) p.dim = true;
    return p;
  }
  function groupPaintOf(name: string): GroupPaint | undefined {
    const mark = marks.groups.get(name);
    const needed = needle.groupNames.has(name);
    if (!mark && !needed) return undefined;
    return {
      ring: needed ? COLORS.needle : COLORS.read,
      ringStyle: needed ? 'dashed' : 'solid',
      tag: mark ? 'listed' : 'needed',
      tagColor: mark ? COLORS.read : COLORS.needle
    };
  }
  function labelOf(u: { id: string; name: string; members: unknown[] }): string {
    const extra = u.members.length > 1 ? `, with ${u.members.length - 1} connected resources` : '';
    const touched = [...(marks.resources.keys() as Iterable<string>)].some((id) => model.unitIdOf.get(id) === u.id);
    return `${u.name}${extra}${touched ? '. Touched so far.' : '. Untouched so far.'}`;
  }

  function onWindowKey(e: KeyboardEvent): void {
    // While the result is open nothing behind it moves, wherever focus has landed. (Escape is the dialog's own.)
    if (modalStep !== null) return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    // Keys inside a form control, a tab list, the pod map or the result dialog belong to that widget.
    if (t?.closest('input, textarea, select, dialog, [role=radio], [role=tab], [data-unit]') || t?.isContentEditable) return;
    if (e.key === 'ArrowRight') setFrame(f + 1);
    else if (e.key === 'ArrowLeft') setFrame(f - 1);
    else if (e.key === 'Home') setFrame(0);
    else if (e.key === 'End') setFrame(last);
    else if (e.key === ' ' && !t?.closest('button, a, summary')) togglePlay();
    else if (e.key === 'Escape') pinnedId = null;
    else return;
    e.preventDefault();
  }
</script>

<svelte:head>
  <title>Naive tools · From tools to code surfaces</title>
</svelte:head>
<svelte:window onkeydown={onWindowKey} />

<div class="screen">
  <header class="top">
    <h1 class="t-h1">One tool call at a time.</h1>
    <Segmented
      label="Question"
      size="sm"
      value={taskId}
      onchange={setTask}
      accent="var(--color-brand)"
      options={TASK_IDS.map((id) => ({ id, label: SHORT[id], title: TASKS.find((t) => t.id === id)?.description }))}
    />
    <TourNav prev={{ href: '/tour/estate', label: 'The estate' }} next={{ href: '/tour/strains', label: 'Where it strains' }} />
    <p class="t-lead">{route.lesson}</p>
  </header>

  <section class="t-panel run" aria-label="Replay">
    <div class="run-transport">
      <Transport frame={f} {last} {playing} onframe={setFrame} onplay={togglePlay} {valueText} label={frameLabel} />
    </div>
    {#if routes.length > 1 || fanout}
      <div class="variants">
        {#if routes.length > 1}
          <div class="variant">
            <span class="v-label">Route</span>
            <Segmented
              label="Route"
              size="sm"
              value={route.id}
              onchange={setRoute}
              options={routes.map((r) => ({ id: r.id, label: r.label, title: r.hint }))}
            />
          </div>
        {/if}
        {#if fanout}
          <div class="variant">
            <span class="v-label">Calls per turn</span>
            <Segmented label="Calls per turn" size="sm" value={batch} onchange={setBatch} options={BATCHES} />
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <p class="t-sr" role="status">{caption}</p>

  <div class="stage">
    <section class="t-panel map-panel" aria-label="The estate, as touched so far">
      <TouchLegend short {counts} kinds={['listed', 'read', 'written']} bind:emphasis needle={{ count: needleCount }} />
      <EstateMap
        {model}
        {paintOf}
        {groupPaintOf}
        {labelOf}
        badgeOf={(u) => stepBadge(u, marks)}
        selectedId={pinnedId}
        {focusId}
        onselect={select}
        onhover={(id) => (hoverId = id)}
        label="Estate map showing what the model has touched so far"
      />
    </section>

    <aside class="t-panel podcard" aria-label="The pod in focus">
      {#if unit}
        <div class="pod-head">
          <span class="t-kicker">{pinnedId ? 'Pinned' : hoverId ? 'Preview' : 'This step'}</span>
          <h2 class="pod-name">{unit.name}</h2>
          {#if pinnedId}
            <button type="button" class="t-btn sm unpin" onclick={() => (pinnedId = null)}><X size={14} /> Unpin</button>
          {/if}
        </div>
        <UnitCard {unit} {model} {marks} currentStep={f} dense tags={false} />
      {:else}
        <div class="pod-empty">
          <p class="pe-title">
            {#if f === 0}
              Nothing touched yet
            {:else if callUnits.size > 1}
              This step touched {fmtInt(callUnits.size)} pods
            {:else}
              No single pod in focus
            {/if}
          </p>
          <p class="pe-hint">Hover or click a pod to see how it was touched.</p>
        </div>
      {/if}
    </aside>
  </div>

  <div class="convo">
    <section class="t-panel transcript" aria-label="Transcript">
      <div class="tabs">
        <TabStrip items={tabs} selected={openKey} onselect={selectTab} label="Transcript, one tab per turn" panelId="transcript-panel" smooth={!playing} />
      </div>
      <div
        class="panel"
        id="transcript-panel"
        role="tabpanel"
        aria-labelledby="tab-{openKey}"
        data-tone={openKey === 'you' ? 'you' : openKey === 'answer' ? 'answer' : 'plain'}
      >
        {#if openKey === 'setup'}
          <p class="b-text">
            <strong>{fmtInt(setup.system)}</strong> tokens of instructions and <strong>{fmtInt(setup.tools)}</strong> for {toolNames.length}
            tool definitions, before the model reads a word of the question.
          </p>
          <p class="chips">
            {#each toolNames as n (n)}<span class="t-chip">{n}</span>{/each}
          </p>
          <p class="b-note">Read in full on turn 1. From turn 2 on it is the same text, so it can be <Tip text={CACHE_TIP}>cached</Tip>.</p>
        {:else if openKey === 'you'}
          <p class="b-text">{taskPrompt(taskId)}</p>
          {#if f === 0}
            <button type="button" class="t-btn primary sm start" onclick={togglePlay}><Play size={14} /> Play the run</button>
          {/if}
        {:else if openTurn && shownCall}
          <div class="turn" class:multi={openTurn.calls.length > 1}>
            {#if openTurn.calls.length > 1}
              <CallRail
                calls={openCalls}
                shown={shownCall.step}
                now={f}
                onpick={setFrame}
                onhover={(s) => (hoverStep = s)}
                label="Calls in turn {openTurn.n}"
              />
            {/if}
            {#key shownCall.step}
              <CallDetail
                call={shownCall}
                summary={callSummary(shownCall, nameOf)}
                now={shownCall.step === f}
                flow={flowOf(openTurn)}
                onexpand={() => openResult(shownCall.step)}
              />
            {/key}
          </div>
        {:else if openKey === 'answer'}
          <p class="b-text pre">{answerTurn.text}</p>
          <div class="b-flow"><FlowLine flow={flowOf(answerTurn)} /></div>
          <p class="b-note">{ANSWER_NOTE}</p>
        {/if}
      </div>
    </section>

    <section class="t-panel cost" aria-label="What it cost">
      <div class="cost-head">
        <h2 class="t-h2">Input and output, turn by turn</h2>
        <details class="honest">
          <summary>How honest is this replay?</summary>
          <p>
            Pre-recorded, not a live model. Every tool result is the real output of the benchmark&rsquo;s catalogue over this estate, and tokens are counted the way the benchmark counts them:
            characters &divide; 4, and every turn reads the whole conversation again. The totals are tokens, not dollars, and count cached text (grey) at full price; providers usually bill it
            at about a tenth, and bill output at a higher rate than input. The scripts are idealised: they add the numbers exactly, where a live model does it in its head. How often that goes
            wrong depends on the model; the Results screen has the measured runs.
          </p>
        </details>
      </div>
      <div class="cost-chart">
        <TurnBars fill turns={replay.turns} upTo={turnNow} onturn={jumpToTurn} limit={MAX_ITERATIONS} />
      </div>
      {#if overCap}
        <p class="cap-note">
          The dashed line is where the benchmark stops a run ({MAX_ITERATIONS} turns), so a model working this slowly would not finish. The replay lets it, to show the bill.
        </p>
      {/if}
      <div class="cost-facts">
        <StatTile
          compact
          label="Billed so far"
          value={'≈ ' + fmtTokens(billedNow)}
          sub="{fmtTokens(billed.input)} in + {fmtTokens(billed.output)} out"
          hint="The whole run: ≈ {fmtTokens(facts.billed)} tokens, {fmtTokens(replay.totals.promptTokens)} in + {fmtTokens(replay.totals.completionTokens)} out. Tokens, not dollars."
          tone="#4338ca"
        />
        <StatTile compact label="Billed ÷ text" value="{facts.multiple.toFixed(1)}×" sub="text is ≈ {fmtTokens(facts.once)} tokens" />
        <StatTile compact label="Setup share" value={Math.round(facts.fixedShare * 100) + '%'} sub="instructions + tools" />
      </div>
    </section>
  </div>
</div>

{#if modalCall}
  <ResultModal
    step={modalCall.step}
    title={modalCall.name}
    subtitle={modalCall.argsText}
    text={prettyJson(modalCall.content)}
    chars={modalCall.content.length}
    tokens={modalCall.resultTokens}
    counted={modalCall.resultSentTokens}
    onclose={() => (modalStep = null)}
  />
{/if}

<style>
  .screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--tour-gap);
    min-width: 0;
  }

  /* ── header: title, question, navigation; the lesson runs full width below ── */
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 2px 14px;
    min-width: 0;
  }
  .top .t-lead {
    grid-column: 1 / -1;
  }

  /* ── replay row ─────────────────────────────────────────────────── */
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
  .variants {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    padding-left: 18px;
    border-left: 1px solid var(--color-border-default);
  }
  .variant {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .v-label {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  /* ── stage: the estate beside the pod in focus ──────────────────── */
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(280px, 22vw, 340px);
    gap: var(--tour-gap);
    align-items: stretch;
  }
  .map-panel {
    padding: 8px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .podcard {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    overflow: auto;
  }
  .pod-head {
    display: flex;
    align-items: baseline;
    gap: 9px;
    min-width: 0;
  }
  .pod-name {
    margin: 0;
    min-width: 0;
    flex: 1;
    font-family: var(--font-mono);
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .unpin {
    align-self: center;
    flex: none;
  }
  .pod-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    text-align: center;
    color: var(--color-text-muted);
  }
  .pe-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-secondary);
  }
  .pe-hint {
    margin: 0;
    font-size: 13px;
  }

  /* ── conversation: transcript tabs and cost ─────────────────────── */
  .convo {
    flex: 1 1 0;
    min-height: 250px;
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: var(--tour-gap);
  }
  .transcript {
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .tabs {
    flex: none;
    padding: 5px 6px 0;
  }
  /* The open tab gets everything that is left; the tabs never grow. */
  .panel {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 10px 12px 12px;
    overflow: auto;
    background: white;
  }
  .panel[data-tone='you'] {
    background: var(--color-brand-bg);
  }
  .panel[data-tone='answer'] {
    background: var(--good-bg);
  }
  .turn {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .turn.multi {
    display: grid;
    grid-template-columns: clamp(170px, 30%, 260px) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 10px;
  }

  /* the short tabs: setup, question, answer */
  .b-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }
  .b-text.pre {
    white-space: pre-wrap;
    color: var(--color-text-primary);
  }
  .chips {
    margin: 8px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .b-note {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .b-flow {
    margin-top: 8px;
  }
  .cap-note {
    margin: 0;
    padding: 5px 8px;
    border-left: 3px solid #f59e0b;
    border-radius: 4px;
    background: #fffbeb;
    font-size: 12.5px;
    line-height: 1.4;
    color: #92400e;
  }
  .start {
    align-self: flex-start;
    margin-top: 10px;
  }

  /* cost */
  .cost {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
  }
  .cost-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .cost-chart {
    flex: 1 1 0;
    min-height: 0;
  }
  .cost-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .honest {
    position: relative;
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .honest summary {
    cursor: pointer;
    font-weight: 650;
    width: fit-content;
    margin-left: auto;
  }
  .honest p {
    position: absolute;
    z-index: 10;
    top: calc(100% + 6px);
    right: 0;
    width: min(440px, 80vw);
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--color-border-strong);
    border-radius: 10px;
    background: white;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
    font-size: 13px;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }

  @media (max-width: 1100px) {
    .top {
      grid-template-columns: minmax(0, 1fr);
    }
    .stage,
    .convo {
      grid-template-columns: minmax(0, 1fr);
    }
    .convo {
      flex: none;
      grid-template-rows: none;
    }
    /* Stacked: the tabs need a definite height so the open one can fill it and scroll inside. */
    .transcript {
      height: min(70dvh, 540px);
    }
    .cost-chart {
      height: 180px;
      flex: none;
    }
  }
  @media (max-width: 700px) {
    .turn.multi {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 132px minmax(0, 1fr);
    }
  }
</style>
