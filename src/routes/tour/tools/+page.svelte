<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import { Bot, User, Wrench, X } from '@lucide/svelte';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { CATALOG_TOOLS } from '$lib/surfaces/catalog/schemas';
  import { TASKS } from '$lib/tasks';
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
  // The pod the current call touched (when it touched exactly one), so the step is shown zoomed in.
  const autoId = $derived.by(() => {
    if (!call) return null;
    const ids = new Set<string>();
    for (const t of call.touches) {
      const u = t.resourceId ? model.unitIdOf.get(t.resourceId) : undefined;
      if (u) ids.add(u);
    }
    return ids.size === 1 ? [...ids][0] : null;
  });
  const focusId = $derived(pinnedId ?? hoverId ?? autoId);

  let scroller = $state<HTMLElement | null>(null);

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
  const frameLabel = $derived(f === 0 ? 'Question' : f === last ? 'Answer' : `Step ${f} / ${replay.calls.length}`);
  const valueText = $derived(
    f === 0 ? 'The question has been asked' : f === last ? 'The model writes its answer' : `Step ${f} of ${replay.calls.length}: ${call?.name ?? ''}`
  );
  const caption = $derived.by(() => {
    if (f === 0) return 'The model has the question and nothing else. No resource has been touched.';
    if (call) return `${call.name}: ${callSummary(call, nameOf)}`;
    return `The model writes the answer. It touched ${counts.touched} resources to get there; the question needed ${needleCount}.`;
  });

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
    syncUrl();
  }
  function setRoute(id: string): void {
    routeId = id;
    batch = 'all';
    frame = Infinity;
    playing = false;
    syncUrl();
  }
  function setBatch(id: Batch): void {
    batch = id;
    frame = Infinity;
    playing = false;
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

  // Keep the newest transcript entry in view, scrolling only the transcript.
  $effect(() => {
    void f;
    void replay;
    void tick().then(() => {
      const sc = scroller;
      if (!sc) return;
      if (f === 0) {
        sc.scrollTop = 0;
        return;
      }
      const el = sc.querySelector<HTMLElement>('[data-current]') ?? sc.querySelector<HTMLElement>('[data-tail]');
      if (!el) return;
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom - sc.clientHeight + 14;
      else if (top < sc.scrollTop) sc.scrollTop = Math.max(0, top - 14);
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
    const t = e.target as HTMLElement | null;
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

<header class="head">
  <div class="head-text">
    <p class="t-kicker">② Naive tools</p>
    <h1 class="t-h1">A question, answered one tool call at a time.</h1>
    <p class="t-lead">{route.lesson}</p>
  </div>
  <section class="t-panel t-panel-pad picker" aria-label="Question">
    <span class="ctl-label">Question</span>
    <Segmented
      label="Question"
      value={taskId}
      onchange={setTask}
      accent="var(--color-brand)"
      options={TASK_IDS.map((id) => ({ id, label: SHORT[id], title: TASKS.find((t) => t.id === id)?.description }))}
    />
  </section>
</header>

<section class="t-panel bar" aria-label="Replay">
  <Transport frame={f} {last} {playing} onframe={setFrame} onplay={togglePlay} {valueText} label={frameLabel} />
  <div class="tiles">
    <StatTile compact label="Calls" value={Math.min(f, replay.calls.length)} sub="of {replay.calls.length}" />
    <StatTile compact label="Model turns" value={turnNow} sub="of {replay.turns.length}" />
    <StatTile compact label="Resources touched" value={counts.touched} sub="the question needs {needleCount}" />
    <StatTile compact label="Billed" value={'\u2248 ' + fmtTokens(billedNow)} sub="tokens, no caching" />
  </div>
</section>

<div class="layout">
  <section class="t-panel map-panel" aria-label="The estate, as touched so far">
    <div class="legend-row">
      <TouchLegend {counts} kinds={['listed', 'read', 'written']} bind:emphasis needle={{ count: needleCount }} />
    </div>
    <p class="caption" role="status">
      <span class="cap-step">{f === 0 ? 'Start' : f === last ? 'Answer' : `Step ${f}`}</span>
      {caption}
    </p>
    <EstateMap
      {model}
      {paintOf}
      {groupPaintOf}
      {labelOf}
      badgeOf={(u) => stepBadge(u, marks)}
      selectedId={pinnedId}
      onselect={select}
      onhover={(id) => (hoverId = id)}
      label="Estate map showing what the model has touched so far"
    />
  </section>

  <aside class="side" aria-label="Transcript">
    <div class="t-panel transcript">
      <div class="tr-head">
        <h2 class="t-h2">What the model is told, in order</h2>
      </div>
      <div class="scroller" bind:this={scroller}>
        <article class="card setup">
          <p class="kicker"><Wrench size={13} /> Setup, sent again on every turn</p>
          <p class="text">
            Instructions <strong>{fmtInt(setup.system)}</strong> + {toolNames.length} tool definitions <strong>{fmtInt(setup.tools)}</strong> =
            <strong>{fmtTokens(setup.system + setup.tools)} tokens</strong> before the model reads a word of the question.
          </p>
          <p class="chips">
            {#each toolNames as n (n)}<span class="t-chip">{n}</span>{/each}
          </p>
        </article>

        <article class="card you">
          <p class="kicker"><User size={13} /> You</p>
          <p class="text">{taskPrompt(taskId)}</p>
        </article>

        {#each replay.turns as turn, ti (turn.n)}
          {@const started = turn.calls.length > 0 ? turn.calls[0].step <= f : f === last}
          {#if started}
            {@const prev = ti > 0 ? replay.turns[ti - 1].promptTokens : 0}
            <section class="turn" aria-label="Turn {turn.n}">
              <p class="turn-head">
                <span class="turn-n">Turn {turn.n}</span>
                <span class="turn-t">
                  the model is sent <strong>{fmtTokens(turn.promptTokens)}</strong> tokens
                  {#if ti > 0}<span class="delta">(+{fmtTokens(turn.promptTokens - prev)})</span>{/if}
                </span>
              </p>
              {#if turn.calls.length > 0}
                {@const dense = turn.calls.length > 6}
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
                          <span class="main">
                            <span class="tool">{c.name}</span>
                            <span class="args">{argsLine(c.args)}</span>
                          </span>
                          <span class="tok">+{fmtTokens(c.resultTokens)}</span>
                        </button>
                        {#if !dense || c.step === f}
                          <p class="sum">{callSummary(c, nameOf)}</p>
                        {/if}
                        {#if c.step === f}
                          <!-- Scrollable region: focusable on purpose so keyboard users can scroll the result. -->
                          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                          <pre class="t-json result" role="region" aria-label="Result of step {c.step}" tabindex="0">{pretty(c.content)}</pre>
                        {/if}
                      </li>
                    {/if}
                  {/each}
                </ol>
              {:else}
                <article class="card answer" data-tail>
                  <p class="kicker"><Bot size={13} /> Answer <span class="tokpill">≈ {replay.totals.answerTokens} tokens</span></p>
                  <p class="text pre">{turn.text}</p>
                </article>
              {/if}
            </section>
          {/if}
        {/each}

        {#if f === 0}
          <button type="button" class="start" onclick={togglePlay}>Play the run</button>
        {/if}
      </div>
      <p class="tr-foot">← → step · Space play or pause · Home / End · click any call to jump to it</p>
    </div>

    {#if unit}
      <div class="t-panel podcard">
        <div class="pod-head">
          <div class="pod-title">
            <p class="t-kicker">{pinnedId ? 'Pinned' : hoverId ? 'Preview' : 'This step'}</p>
            <h2 class="pod-name">{unit.name}</h2>
          </div>
          {#if pinnedId}
            <button type="button" class="t-btn sm" onclick={() => (pinnedId = null)}><X size={14} /> Unpin</button>
          {/if}
        </div>
        <UnitCard {unit} {model} {marks} currentStep={f} />
      </div>
    {/if}
  </aside>
</div>

<section class="t-panel t-panel-pad cost" aria-label="What it cost">
  <div class="cost-head">
    <div>
      <h2 class="t-h2">What the model re-reads on every turn</h2>
      <p class="cost-lead">
        Nothing is remembered between turns. Each turn sends the instructions, the tool definitions and the whole transcript so far.
      </p>
    </div>
    <div class="variants">
      {#if routes.length > 1}
        <div class="variant">
          <span class="ctl-label">How the model goes about it</span>
          <Segmented label="Route" size="sm" value={route.id} onchange={setRoute} options={routes.map((r) => ({ id: r.id, label: r.label }))} />
        </div>
      {/if}
      {#if fanout}
        <div class="variant">
          <span class="ctl-label">Calls per turn</span>
          <Segmented label="Calls per turn" size="sm" value={batch} onchange={setBatch} options={BATCHES} />
        </div>
      {/if}
    </div>
  </div>

  <div class="cost-body">
    <TurnBars turns={replay.turns} upTo={turnNow} onturn={jumpToTurn} />
    <div class="cost-facts">
      <StatTile compact label="Text that exists" value={'\u2248 ' + fmtTokens(facts.once)} sub="tokens in the finished transcript" />
      <StatTile compact label="Tokens billed" value={'\u2248 ' + fmtTokens(facts.billed)} sub="{facts.multiple.toFixed(1)}× the text, over {replay.totals.turns} turns" tone="#4338ca" />
      <StatTile compact label="Setup share" value={Math.round(facts.fixedShare * 100) + '%'} sub="of the bill is instructions and tool definitions, re-sent" />
      <StatTile compact label="The answer" value={'\u2248 ' + fmtInt(replay.totals.answerTokens)} sub="tokens" tone="#059669" />
    </div>
  </div>

  <details class="honest">
    <summary>How honest is this replay?</summary>
    <p>
      Pre-recorded, not a live model. The script stands in for the model's choices; every tool result is the real output of the benchmark's catalogue over this estate, and the tokens are
      billed the way the benchmark's own loop bills them (characters ÷ 4, each turn re-sending everything, no prompt caching). The scripts are idealised: they add the numbers exactly,
      where live models got the two hard tasks wrong. This shows the catalogue at its best, so the cost you see is the structural part.
    </p>
  </details>
</section>

<TourNav prev={{ href: '/tour/estate', label: 'The estate' }} next={{ href: '/tour/language', label: 'The catalogue grows a language' }} />

<style>
  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 560px);
    gap: 20px;
    align-items: start;
  }
  .head-text {
    min-width: 0;
  }
  .picker {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    padding: 12px 14px;
  }
  .ctl-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 24px;
    padding: 10px 16px;
  }
  .tiles {
    display: flex;
    gap: 22px;
    padding-left: 22px;
    border-left: 1px solid var(--color-border-default);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 430px;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 1100px) {
    .head,
    .layout,
    .bar {
      grid-template-columns: minmax(0, 1fr);
    }
    .tiles {
      padding-left: 0;
      border-left: 0;
    }
  }

  /* ── map ────────────────────────────────────────────────────────── */
  .map-panel {
    padding: 12px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .caption {
    margin: 0;
    min-height: 44px;
    font-size: 14.5px;
    color: var(--color-text-secondary);
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .cap-step {
    flex: none;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-brand);
  }

  /* ── transcript ─────────────────────────────────────────────────── */
  .side {
    position: sticky;
    top: 66px;
    /* Fit the viewport below the header and replay bar at scroll position 0. */
    height: calc(100dvh - 340px);
    min-height: 480px;
    max-height: 760px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }
  .transcript {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .tr-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px 8px;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .tr-foot {
    margin: 0;
    padding: 6px 14px;
    border-top: 1px solid var(--color-border-subtle);
    font-size: 12px;
    color: var(--color-text-dim);
  }
  .scroller {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card {
    border: 1px solid var(--color-border-default);
    border-radius: 10px;
    background: white;
    padding: 8px 12px;
  }
  .card .kicker {
    margin: 0 0 2px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .card .text {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }
  .card .text.pre {
    white-space: pre-wrap;
    color: var(--color-text-primary);
  }
  .setup {
    background: var(--color-expanded-bg);
  }
  .chips {
    margin: 6px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .you {
    border-color: var(--color-brand);
    background: var(--color-brand-bg);
  }
  .answer {
    border-color: var(--good);
    background: var(--good-bg);
  }
  .tokpill {
    margin-left: auto;
    font-family: var(--font-mono);
    letter-spacing: 0;
    text-transform: none;
    color: var(--good);
  }

  .turn {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .turn-head {
    margin: 4px 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .turn-n {
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-primary);
  }
  .turn-t strong {
    font-family: var(--font-mono);
    color: var(--color-text-primary);
  }
  .delta {
    font-family: var(--font-mono);
    color: #b45309;
  }
  .calls {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .call {
    border-left: 2px solid var(--color-border-default);
    margin-left: 8px;
    padding-left: 8px;
    border-radius: 0 8px 8px 0;
  }
  .call.current {
    border-left-color: var(--color-brand);
    background: var(--color-brand-bg);
  }
  .call-btn {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    width: 100%;
    text-align: left;
    padding: 4px 6px 4px 2px;
    border-radius: 8px;
  }
  .call-btn:hover {
    background: rgba(99, 102, 241, 0.08);
  }
  .num {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #e6e8fe;
    color: #4338ca;
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-weight: 800;
  }
  .current .num {
    background: var(--color-brand);
    color: white;
  }
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tool {
    font-family: var(--font-mono);
    font-size: 13.5px;
    font-weight: 800;
  }
  .args {
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
  .dense .main {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }
  .dense .call-btn {
    padding-top: 1px;
    padding-bottom: 1px;
  }
  .sum {
    margin: 0 0 4px 32px;
    font-size: 13px;
    color: var(--color-text-secondary);
  }
  .result {
    margin: 0 8px 8px 0;
    max-height: 170px;
    font-size: 12px;
  }
  .start {
    align-self: center;
    margin-top: 6px;
    padding: 9px 22px;
    border-radius: 10px;
    border: 1px solid var(--color-brand);
    background: var(--color-brand);
    color: white;
    font-size: 15px;
    font-weight: 700;
  }
  .start:hover {
    background: var(--color-brand-dark);
  }

  .podcard {
    flex: none;
    max-height: 48%;
    overflow: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pod-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .pod-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }
  .pod-name {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 17px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── cost ───────────────────────────────────────────────────────── */
  .cost {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .cost-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px 24px;
  }
  .cost-lead {
    margin: 4px 0 0;
    font-size: 14.5px;
    color: var(--color-text-muted);
    max-width: 70ch;
  }
  .variants {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
  }
  .variant {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cost-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 270px;
    gap: 24px;
    align-items: start;
  }
  .cost-facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 12px;
  }
  @media (max-width: 1100px) {
    .cost-body {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .honest {
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .honest summary {
    cursor: pointer;
    font-weight: 650;
    width: fit-content;
  }
  .honest p {
    margin: 6px 0 0;
    max-width: 110ch;
    line-height: 1.5;
  }
</style>
