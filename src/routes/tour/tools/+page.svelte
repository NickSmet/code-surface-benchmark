<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import { Bot, Play, User, Wrench, X } from '@lucide/svelte';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { CATALOG_TOOLS } from '$lib/surfaces/catalog/schemas';
  import { TASKS } from '$lib/tasks';
  import AccItem from '$lib/components/tour/AccItem.svelte';
  import EstateMap, { type GroupPaint } from '$lib/components/tour/EstateMap.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import StatTile from '$lib/components/tour/StatTile.svelte';
  import TouchLegend from '$lib/components/tour/TouchLegend.svelte';
  import TourNav from '$lib/components/tour/TourNav.svelte';
  import Transport from '$lib/components/tour/Transport.svelte';
  import TurnBars from '$lib/components/tour/TurnBars.svelte';
  import UnitCard from '$lib/components/tour/UnitCard.svelte';
  import type { TaskId } from '$lib/tour/answers';
  import { buildEstateModel } from '$lib/tour/estate';
  import { needleFor } from '$lib/tour/needles';
  import { COLORS, touchPaint, type Paint } from '$lib/tour/paint';
  import type { ReplayCall } from '$lib/tour/replay';
  import { argsLine, billedAt, callSummary, costFacts, lastFrame, stepBadge, turnAt } from '$lib/tour/replay-view';
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

  let accList = $state<HTMLElement | null>(null);

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
  const billedNow = $derived(billedAt(replay, f));
  const facts = $derived(costFacts(replay));
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

  // ── the transcript accordion ───────────────────────────────────────
  // One item is open at a time. By default it is wherever the playhead is; opening
  // another is remembered only until the playhead moves.
  const autoKey = $derived(f === 0 ? 'you' : f >= last ? 'answer' : `turn-${turnNow}`);
  let manual = $state<{ key: string; at: number } | null>(null);
  const openKey = $derived(manual && manual.at === f ? manual.key : autoKey);

  function toggleItem(key: string): void {
    if (playing) {
      playing = false;
      syncUrl();
    }
    manual = { key: openKey === key ? '' : key, at: f };
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

  /** Scroll `box` (and only `box`) just enough to show `el`; when `el` is taller than the box, show its top. */
  function reveal(box: HTMLElement, el: HTMLElement, pad = 6): void {
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.height + 2 * pad >= b.height || r.top < b.top + pad) box.scrollTop += r.top - b.top - pad;
    else if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - b.bottom + pad;
  }

  // Keep the open item, and the current call inside it, in view.
  $effect(() => {
    void openKey;
    void f;
    void replay;
    void tick().then(() => {
      const list = accList;
      if (!list) return;
      const item = list.querySelector<HTMLElement>(`[data-acc="${openKey}"]`);
      if (!item) return;
      reveal(list, item);
      const body = item.querySelector<HTMLElement>('[role=region]');
      if (!body) return;
      const el = body.querySelector<HTMLElement>('[data-current]') ?? body.querySelector<HTMLElement>('[data-tail]');
      if (el) reveal(body, el);
      else body.scrollTop = 0;
    });
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

  function pretty(text: string, max = 1000): string {
    let out = text;
    try {
      out = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* not JSON: show as is */
    }
    return out.length > max ? `${out.slice(0, max)}\n\u2026 ${(out.length - max).toLocaleString('en-US')} more characters` : out;
  }

  function onWindowKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (t?.closest('input, textarea, select, [role=radio], [role=tab], [data-unit]') || t?.isContentEditable) return;
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
    <TourNav prev={{ href: '/tour/estate', label: 'The estate' }} next={{ href: '/tour/language', label: 'A language' }} />
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
      <div class="acc-list" data-acc-list bind:this={accList}>
        <AccItem id="setup" open={openKey === 'setup'} ontoggle={toggleItem}>
          {#snippet head()}
            <Wrench size={13} />
            <span class="h-t">Setup</span>
            <span class="h-m prose">{fmtTokens(setup.system + setup.tools)} tokens, sent again on every turn</span>
          {/snippet}
          <p class="b-text">
            Instructions <strong>{fmtInt(setup.system)}</strong> + {toolNames.length} tool definitions <strong>{fmtInt(setup.tools)}</strong>
            tokens, before the model reads a word of the question.
          </p>
          <p class="chips">
            {#each toolNames as n (n)}<span class="t-chip">{n}</span>{/each}
          </p>
        </AccItem>

        <AccItem id="you" tone="you" open={openKey === 'you'} ontoggle={toggleItem} current={autoKey === 'you'}>
          {#snippet head()}
            <User size={13} />
            <span class="h-t">You</span>
            {#if openKey !== 'you'}<span class="h-m prose">{taskPrompt(taskId)}</span>{/if}
          {/snippet}
          <p class="b-text">{taskPrompt(taskId)}</p>
          {#if f === 0}
            <button type="button" class="t-btn primary sm start" onclick={togglePlay}><Play size={14} /> Play the run</button>
          {/if}
        </AccItem>

        {#each replay.turns as turn, ti (turn.n)}
          {@const started = turn.calls.length > 0 ? turn.calls[0].step <= f : f === last}
          {#if started}
            {@const prev = ti > 0 ? replay.turns[ti - 1].promptTokens : 0}
            {#if turn.calls.length > 0}
              {@const key = `turn-${turn.n}`}
              {@const dense = turn.calls.length > 6}
              <AccItem id={key} open={openKey === key} ontoggle={toggleItem} current={autoKey === key}>
                {#snippet head()}
                  <span class="h-t">Turn {turn.n}</span>
                  <span class="h-m">{callNames(turn.calls.filter((c) => c.step <= f))}</span>
                  <span class="h-r">
                    {fmtTokens(turn.promptTokens)} tokens{#if ti > 0}<span class="delta"> +{fmtTokens(turn.promptTokens - prev)}</span>{/if}
                  </span>
                {/snippet}
                <ol class="calls" class:dense>
                  {#each turn.calls as c (c.step)}
                    {#if c.step <= f}
                      <li class="call" class:current={c.step === f} data-current={c.step === f ? '' : undefined}>
                        <button
                          type="button"
                          class="call-btn"
                          onclick={() => setFrame(c.step)}
                          onmouseenter={() => (hoverStep = c.step)}
                          onmouseleave={() => (hoverStep = null)}
                          onfocus={() => (hoverStep = c.step)}
                          onblur={() => (hoverStep = null)}
                          aria-current={c.step === f ? 'step' : undefined}
                        >
                          <span class="num">{c.step}</span>
                          <span class="tool">{c.name}</span>
                          <span class="args">{argsLine(c.args)}</span>
                          <span class="tok">+{fmtTokens(c.resultTokens)}</span>
                        </button>
                        {#if c.step === f}
                          <p class="sum">{callSummary(c, nameOf)}</p>
                          <!-- Scrollable region: focusable on purpose so keyboard users can scroll the result. -->
                          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                          <pre class="t-json result" role="region" aria-label="Result of step {c.step}" tabindex="0">{pretty(c.content)}</pre>
                        {/if}
                      </li>
                    {/if}
                  {/each}
                </ol>
              </AccItem>
            {:else}
              <AccItem id="answer" tone="answer" open={openKey === 'answer'} ontoggle={toggleItem} current={autoKey === 'answer'}>
                {#snippet head()}
                  <Bot size={13} />
                  <span class="h-t">Answer</span>
                  <span class="h-m prose">turn {turn.n} reads {fmtTokens(turn.promptTokens)} tokens{#if ti > 0}<span class="delta"> +{fmtTokens(turn.promptTokens - prev)}</span>{/if}</span>
                  <span class="h-r good">≈ {fmtInt(replay.totals.answerTokens)} tokens</span>
                {/snippet}
                <p class="b-text pre" data-tail>{turn.text}</p>
              </AccItem>
            {/if}
          {/if}
        {/each}
      </div>
    </section>

    <section class="t-panel cost" aria-label="What it cost">
      <div class="cost-head">
        <h2 class="t-h2">Sent to the model, turn by turn</h2>
        <details class="honest">
          <summary>How honest is this replay?</summary>
          <p>
            Pre-recorded, not a live model. Every tool result is the real output of the benchmark&rsquo;s catalogue over this estate, and tokens are billed the way the benchmark bills them
            (characters &divide; 4, every turn re-sends everything, no prompt caching). The scripts are idealised: they add the numbers exactly, where live models got the two hard tasks
            wrong.
          </p>
        </details>
      </div>
      <div class="cost-chart">
        <TurnBars fill turns={replay.turns} upTo={turnNow} onturn={jumpToTurn} />
      </div>
      <div class="cost-facts">
        <StatTile compact label="Billed so far" value={'≈ ' + fmtTokens(billedNow)} sub="of ≈ {fmtTokens(facts.billed)} tokens" tone="#4338ca" />
        <StatTile compact label="Billed ÷ text" value="{facts.multiple.toFixed(1)}×" sub="text is ≈ {fmtTokens(facts.once)} tokens" />
        <StatTile compact label="Setup share" value={Math.round(facts.fixedShare * 100) + '%'} sub="instructions + tools" />
      </div>
    </section>
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

  /* ── conversation: transcript accordion and cost ────────────────── */
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
    padding: 6px;
  }
  .acc-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: auto;
  }

  /* header snippets (rendered inside AccItem, styled here) */
  .h-t {
    flex: none;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .h-m {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .h-m.prose {
    font-family: inherit;
    font-size: 13px;
  }
  .h-r {
    flex: none;
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .h-r.good {
    font-weight: 700;
    color: var(--good);
  }
  .delta {
    margin-left: 0.45em;
    color: #b45309;
  }

  /* bodies */
  .b-text {
    margin: 2px 0 0;
    font-size: 13.5px;
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
  .start {
    margin-top: 8px;
  }

  .calls {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .call {
    border-radius: 8px;
  }
  .call.current {
    background: var(--color-brand-bg);
    box-shadow: inset 2px 0 0 var(--color-brand);
  }
  .call-btn {
    display: grid;
    grid-template-columns: 22px auto minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    width: 100%;
    text-align: left;
    padding: 3px 8px 3px 4px;
    border-radius: 8px;
  }
  .call-btn:hover {
    background: rgba(99, 102, 241, 0.08);
  }
  .dense .call-btn {
    padding-top: 1px;
    padding-bottom: 1px;
  }
  .num {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #e6e8fe;
    color: #4338ca;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
  }
  .current .num {
    background: var(--color-brand);
    color: white;
  }
  .tool {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
  }
  .args {
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tok {
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 700;
    color: #4338ca;
  }
  .sum {
    margin: 0 8px 4px 34px;
    font-size: 13px;
    color: var(--color-text-secondary);
  }
  .result {
    margin: 0 8px 8px 34px;
    font-size: 12px;
    line-height: 1.45;
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
    .transcript {
      max-height: 70dvh;
    }
    .cost-chart {
      height: 180px;
      flex: none;
    }
  }
</style>
