<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { Check, Cog, Eye, GitCompareArrows, LoaderCircle, Play, RotateCcw, X } from '@lucide/svelte';
  import solutionDoc from '../../../../docs/solution-path-examples.md?raw';
  import { applyChangeRows } from '$lib/inventory/apply';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { buildProjection } from '$lib/inventory/projection';
  import { SCHEMA_DOC } from '$lib/surfaces/code/helpers';
  import { TASKS } from '$lib/tasks';
  import EstateMap, { type GroupPaint } from '$lib/components/tour/EstateMap.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import StatTile from '$lib/components/tour/StatTile.svelte';
  import TouchLegend from '$lib/components/tour/TouchLegend.svelte';
  import TourNav from '$lib/components/tour/TourNav.svelte';
  import UnitCard from '$lib/components/tour/UnitCard.svelte';
  import type { TaskId } from '$lib/tour/answers';
  import { runInSandbox } from '$lib/tour/code-client';
  import { codeTouches } from '$lib/tour/code-compare';
  import { ALLOWED_GLOBALS, type RunOutcome } from '$lib/tour/code-run';
  import {
    backToModelTokens,
    compareSurfaces,
    comparisonHeadline,
    comparisonLesson,
    fieldLabel,
    groupDiff,
    outcomeCaption,
    probeResult,
    splitBill
  } from '$lib/tour/code-view';
  import { buildEstateModel } from '$lib/tour/estate';
  import { TYPE_LABEL } from '$lib/tour/facts';
  import { needleFor } from '$lib/tour/needles';
  import { COLORS, touchPaint, type Paint } from '$lib/tour/paint';
  import { CONTRACT_PROBES, TASK_ORDER, parseSolutionPrograms, type ContractProbe } from '$lib/tour/programs';
  import { taskPrompt } from '$lib/tour/scenarios';
  import { estimateTokens, fmtTokens } from '$lib/tour/tokens';
  import { countMarks, marksAt, type TouchKind } from '$lib/tour/touch';
  import { fmtInt, fmtMs } from '$lib/utils';

  const programs = parseSolutionPrograms(solutionDoc);
  /** Ground truth for "what does the question need": never changes, even after a change set is approved. */
  const pristine = buildInventory();
  const SHORT: Record<TaskId, string> = {
    'granular-read': 'Granular read',
    'filter-aggregate': 'Filter + aggregate',
    'bulk-write': 'Bulk write',
    'single-lookup': 'Single lookup'
  };
  const LAYERS = [
    {
      id: 'see',
      title: 'See',
      icon: Eye,
      line: 'The projection decides what exists.',
      text: 'The program is handed a copy of the estate with the internal fields removed. It cannot read what is not there.'
    },
    {
      id: 'change',
      title: 'Change',
      icon: GitCompareArrows,
      line: 'The runtime derives the change set.',
      text: 'The program only assigns values. The runtime compares the data before and after, and a single edit outside the allowlist rejects the whole proposal.'
    },
    {
      id: 'do',
      title: 'Do',
      icon: Cog,
      line: 'The sandbox decides what code may run.',
      text: 'The program runs in a Web Worker under a time limit, with a short list of globals and nothing else.'
    }
  ] as const;

  // ── state (the task is in the URL so a screen can be bookmarked) ───
  const startParam = page.url.searchParams.get('task') as TaskId;
  const startTask: TaskId = TASK_ORDER.includes(startParam) ? startParam : 'granular-read';

  let taskId = $state<TaskId>(startTask);
  let code = $state(programs[startTask].code);
  /** This browser's copy of the estate. Approved change sets land here and nowhere else. */
  let inv = $state.raw(buildInventory());
  let dirty = $state(false);
  let outcome = $state.raw<RunOutcome | null>(null);
  /** The program text that produced `outcome`, to tell when the editor has moved on from it. */
  let ranCode = $state('');
  let runNo = $state(0);
  let running = $state(false);
  let decision = $state<'pending' | 'approved' | 'declined'>('pending');
  let applyError = $state<string | null>(null);
  let showAllChanges = $state(false);

  let emphasis = $state<TouchKind | null>(null);
  let hoverId = $state<string | null>(null);
  let pinnedId = $state<string | null>(null);
  let layoutEl = $state<HTMLElement | null>(null);

  // ── derived ────────────────────────────────────────────────────────
  const program = $derived(programs[taskId]);
  const model = $derived(buildEstateModel(inv));
  const needle = $derived(needleFor(taskId, pristine));
  const needleCount = $derived(needle.resourceIds.size > 0 ? needle.resourceIds.size : needle.groupNames.size);
  const marks = $derived(marksAt(outcome ? codeTouches(outcome, runNo) : [], runNo));
  // Resource groups can be scanned or named too (the single-lookup question touches nothing else), so the legend counts both.
  const counts = $derived(countMarks(new Map([...marks.resources, ...marks.groups])));
  const caption = $derived(outcomeCaption(outcome, decision));
  const edited = $derived(code !== program.code);
  const stale = $derived(outcome !== null && ranCode !== code);
  const activeProbe = $derived(CONTRACT_PROBES.find((p) => p.code === code) ?? null);
  const probeRes = $derived(outcome && activeProbe && !stale ? probeResult(activeProbe, outcome) : null);
  const cmp = $derived(compareSurfaces(taskId, program));
  const changes = $derived(outcome ? groupDiff(outcome.diff) : []);
  const shownChanges = $derived(showAllChanges ? changes : changes.slice(0, 12));
  // When the question is about exactly one pod, show it by default, as the replay screen does.
  const autoId = $derived.by(() => {
    const ids = new Set<string>();
    for (const id of needle.resourceIds) {
      const u = model.unitIdOf.get(id);
      if (u) ids.add(u);
    }
    return ids.size === 1 ? [...ids][0] : null;
  });
  const focusId = $derived(pinnedId ?? hoverId ?? autoId);
  const unit = $derived(focusId ? (model.unitById.get(focusId) ?? null) : null);
  const lineCount = $derived(code.split('\n').length);
  const attemptedLines = $derived(
    outcome?.status === 'rejected'
      ? Object.entries(outcome.attempted)
          .slice(0, 6)
          .map(([id, fields]) => `${model.resourceById.get(id)?.name ?? id}: ${fields.join(', ')}`)
      : []
  );

  /** Which fields the program read, and from how many resources. The ring on the map is this, per resource. */
  const fieldReads = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const fields of Object.values(outcome?.scanned ?? {})) for (const f of fields) counts.set(f, (counts.get(f) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  });

  const groupsScanned = $derived(outcome ? Object.keys(outcome.scannedGroups).length : 0);
  const scannedValue = $derived(outcome ? (outcome.totals.resourcesScanned || groupsScanned) : null);
  const scannedUnit = $derived(outcome && outcome.totals.resourcesScanned === 0 && groupsScanned > 0 ? 'resource groups' : 'resources');
  const changedSub = $derived(
    !outcome || outcome.diff.length === 0
      ? 'nothing proposed'
      : `${outcome.resourcesAffected} resources, ${decision === 'approved' ? 'applied' : decision === 'declined' ? 'declined' : 'awaiting review'}`
  );

  const bars = $derived.by(() => {
    const rows = [
      { id: 'catalog', label: 'Catalogue, best case', replay: cmp.catalog },
      { id: 'code', label: 'Code surface', replay: cmp.code }
    ].map((r) => ({ ...r, ...splitBill(r.replay) }));
    const max = Math.max(...rows.map((r) => r.setup + r.rest));
    return rows.map((r) => ({ ...r, setupPct: (r.setup / max) * 100, restPct: (r.rest / max) * 100 }));
  });

  // The "see" layer, made concrete: one stored record against what the program is given.
  const heroStored = pristine.resources.find((r) => r.name === 'web-prod-03')!;
  const heroProjected = buildProjection(pristine).resources.find((r) => r.name === 'web-prod-03')!;
  const heroFields = { stored: Object.keys(heroStored).length, seen: Object.keys(heroProjected).length };
  const heroRemoved = Object.keys(heroStored).filter((k) => !(k in heroProjected));
  const schemaTokens = estimateTokens(SCHEMA_DOC);

  // ── actions ────────────────────────────────────────────────────────
  function syncUrl(): void {
    const qs = taskId === 'granular-read' ? '' : `?task=${taskId}`;
    try {
      replaceState(page.url.pathname + qs, page.state);
    } catch {
      /* router not ready: the URL is a convenience, not state */
    }
  }

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    const mine = code;
    try {
      const o = await runInSandbox({ code: mine, projection: buildProjection(inv), rationale: program.rationale });
      outcome = o;
      ranCode = mine;
      runNo += 1;
      decision = 'pending';
      applyError = null;
      showAllChanges = false;
    } finally {
      running = false;
    }
  }

  function resetEstate(): void {
    inv = buildInventory();
    dirty = false;
    decision = 'pending';
    applyError = null;
  }

  function setTask(id: TaskId): void {
    if (id === taskId) return;
    taskId = id;
    code = programs[id].code;
    outcome = null;
    pinnedId = null;
    if (dirty) resetEstate();
    syncUrl();
    void run();
  }

  function restore(): void {
    code = program.code;
    void run();
  }

  function tryProbe(p: ContractProbe): void {
    code = p.code;
    void run();
  }

  function approve(): void {
    if (!outcome || decision !== 'pending' || outcome.diff.length === 0) return;
    try {
      applyChangeRows(inv, outcome.diff);
      inv = { ...inv };
      dirty = true;
      decision = 'approved';
      applyError = null;
    } catch (e) {
      applyError = e instanceof Error ? e.message : String(e);
    }
  }

  function decline(): void {
    if (decision === 'pending') decision = 'declined';
  }

  /** A probe is run from the panel near the bottom; the program and the map it changes are at the top. */
  function showOnMap(): void {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    layoutEl?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function select(id: string | null): void {
    pinnedId = pinnedId === id ? null : id;
  }

  function onEditorKey(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void run();
    }
  }

  function onWindowKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && !e.defaultPrevented && !(e.target instanceof HTMLElement && e.target.closest('textarea'))) pinnedId = null;
  }

  onMount(() => {
    void run();
  });

  // ── map painting ───────────────────────────────────────────────────
  /** A scan ring gets stronger the more of a record's fields the program read. */
  function scanRing(fieldCount: number): string {
    const a = 0.5 + 0.5 * Math.min(1, Math.max(0, fieldCount - 2) / 5);
    return `rgba(13, 148, 136, ${a.toFixed(2)})`;
  }
  function paintOf(id: string): Paint {
    const mark = marks.resources.get(id);
    const p = touchPaint(id, mark, { emphasis, needle: needle.resourceIds, currentStep: runNo });
    if (mark?.scanned !== undefined && p.ring === COLORS.scanned) p.ring = scanRing(mark.fields.length);
    return p;
  }
  function groupPaintOf(name: string): GroupPaint | undefined {
    const mark = marks.groups.get(name);
    const needed = needle.groupNames.has(name);
    if (!mark && !needed) return undefined;
    const named = mark?.listed !== undefined;
    return {
      ring: needed ? COLORS.needle : named ? COLORS.read : COLORS.scanned,
      ringStyle: needed ? 'dashed' : 'solid',
      tag: named ? 'named' : mark ? 'scanned' : 'needed',
      tagColor: named ? COLORS.read : mark ? COLORS.scanned : COLORS.needle
    };
  }
  function labelOf(u: { id: string; name: string; members: unknown[] }): string {
    const extra = u.members.length > 1 ? `, with ${u.members.length - 1} connected resources` : '';
    const touched = [...(marks.resources.keys() as Iterable<string>)].some((id) => model.unitIdOf.get(id) === u.id);
    return `${u.name}${extra}${touched ? '. Looked at by the program.' : '. Not looked at.'}`;
  }

  const val = (v: unknown): string => (v === null || v === undefined ? 'none' : String(v));
  const OP_MARK = { add: '+', edit: '~', remove: '\u2212' } as const;
  const probesOf = (layer: string): ContractProbe[] => CONTRACT_PROBES.filter((p) => p.layer === layer);
  const statusLabel = (s: RunOutcome['status']): string =>
    ({ ok: 'Ran', error: 'Stopped with an error', rejected: 'Rejected', timeout: 'Timed out' })[s];
</script>

<svelte:head>
  <title>Code surface · From tools to code surfaces</title>
</svelte:head>
<svelte:window onkeydown={onWindowKey} />

<header class="head">
  <div class="head-text">
    <p class="t-kicker">④ Code surface</p>
    <h1 class="t-h1">One object. The model writes the program.</h1>
    <p class="t-lead">
      The estate is handed over as plain data. The model writes a few lines against it, the runtime runs them where the data lives, and only the answer travels back.
    </p>
  </div>
  <section class="t-panel t-panel-pad picker" aria-label="Question">
    <span class="ctl-label">Question</span>
    <Segmented
      label="Question"
      value={taskId}
      onchange={setTask}
      accent="var(--color-brand)"
      options={TASK_ORDER.map((id) => ({ id, label: SHORT[id], title: TASKS.find((t) => t.id === id)?.description }))}
    />
  </section>
</header>

<section class="t-panel bar" aria-label="What the run did">
  <StatTile compact label="Scanned" value={scannedValue === null ? '\u2013' : fmtInt(scannedValue)} sub="{scannedUnit}, inside the runtime" tone={COLORS.scanned} />
  <StatTile compact label="Field reads" value={outcome ? fmtInt(outcome.totals.propertyReads) : '\u2013'} sub="on resources and groups" />
  <StatTile compact label="Back to the model" value={outcome ? '≈ ' + fmtTokens(backToModelTokens(outcome)) : '\u2013'} sub="tokens: all the model sees" tone="#4338ca" />
  <StatTile compact label="Changed" value={outcome ? fmtInt(outcome.diff.length) : '\u2013'} sub={changedSub} tone={COLORS.written} />
</section>

<div class="layout" bind:this={layoutEl}>
  <div class="col">
    <section class="t-panel map-panel" aria-label="The estate and what the program touched">
      <div class="legend-row">
        <TouchLegend {counts} kinds={['scanned', 'listed', 'read', 'written']} bind:emphasis needle={{ count: needleCount }} />
      </div>
      <p class="caption" data-tone={caption.tone} role="status">
        <span class="cap-step">{running ? 'Running' : stale ? 'Edited' : outcome ? 'Result' : 'Ready'}</span>
        <span>{stale ? 'The program has changed since this run. Run it again to update the map.' : caption.text}</span>
      </p>
      {#key runNo}
        <EstateMap
          {model}
          {paintOf}
          {groupPaintOf}
          {labelOf}
          selectedId={pinnedId}
          onselect={select}
          onhover={(id) => (hoverId = id)}
          label="Estate map showing what the program looked at"
        />
      {/key}
      <div class="readout" aria-label="Pod inspector">
        {#if unit}
          <div class="ro-head">
            <span class="t-kicker">{pinnedId ? 'Pinned' : hoverId ? 'Preview' : 'The pod the question is about'}</span>
            <strong class="ro-name">{unit.name}</strong>
            {#if pinnedId}
              <button type="button" class="t-btn sm" onclick={() => (pinnedId = null)}><X size={14} /> Unpin</button>
            {/if}
          </div>
          <UnitCard {unit} {model} {marks} currentStep={runNo} />
        {:else}
          <p class="ro-empty">Hover or click a pod to see which of its resources the program looked at, and which fields.</p>
          {#if fieldReads.length}
            <p class="ro-label">Fields the program read, and from how many resources</p>
            <ul class="fchips">
              {#each fieldReads.slice(0, 16) as [field, n] (field)}
                <li class="fchip"><code>{field}</code><b>{fmtInt(n)}</b></li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    </section>
  </div>

  <div class="col">
    <section class="t-panel program" aria-label="The program">
      <div class="prog-head">
        <div class="prog-title">
          <h2 class="t-h2">{activeProbe ? 'A program that tests the contract' : 'The program the model writes'}</h2>
          <span class="prog-meta">
            {#if running}
              Running…
            {:else if stale}
              Edited. Run it again.
            {:else if outcome}
              {statusLabel(outcome.status)} in {fmtMs(outcome.durationMs)}
            {:else}
              Not run yet
            {/if}
          </span>
        </div>
        <button type="button" class="t-btn primary" onclick={run} disabled={running}>
          {#if running}
            <LoaderCircle size={16} class="spin" /> Running
          {:else}
            <Play size={15} fill="currentColor" /> Run
          {/if}
        </button>
      </div>

      <div class="ask">
        {#if activeProbe}
          <p><span class="ask-label">Probe</span><strong>{activeProbe.label}.</strong> {activeProbe.why}</p>
        {:else}
          <p><span class="ask-label">Question</span>{taskPrompt(taskId)}</p>
          {#if program.rationale}
            <p><span class="ask-label">Rationale</span>{program.rationale}</p>
          {/if}
        {/if}
      </div>

      <textarea
        class="editor"
        bind:value={code}
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        wrap="soft"
        rows={Math.max(10, lineCount)}
        aria-label="Program for operate_inventory"
        aria-describedby="editor-hint"
        onkeydown={onEditorKey}
      ></textarea>

      <div class="prog-foot">
        <span class="kbd" id="editor-hint">Edit it, then Run, or press Ctrl or ⌘ + Enter.</span>
        {#if edited}
          <button type="button" class="t-btn ghost sm" onclick={restore}><RotateCcw size={14} /> Restore the model's program</button>
        {/if}
      </div>
    </section>

    <section class="t-panel t-panel-pad result" aria-label="What comes back to the model">
      <div class="res-head">
        <h2 class="t-h2">What comes back to the model</h2>
        {#if outcome}<span class="t-chip">≈ {fmtTokens(backToModelTokens(outcome))} tokens</span>{/if}
      </div>
      {#if !outcome}
        <p class="empty">Nothing yet. Run the program.</p>
      {:else}
        <div class="res-body" class:stale>
          {#if outcome.status !== 'ok'}
            <p class="fail" role="alert"><strong>{statusLabel(outcome.status)}.</strong> {outcome.error}</p>
          {/if}
          <p class="res-note">{outcome.status === 'ok' ? 'This is the whole tool result. The model never sees the records that were scanned.' : 'This is what the model is told.'}</p>
          <pre class="t-json">{outcome.content}</pre>
          {#if outcome.logs.length}
            <p class="res-note">Console output</p>
            <pre class="t-json">{outcome.logs.join('\n')}</pre>
          {/if}
        </div>
      {/if}
    </section>
  </div>
</div>

{#if outcome && (outcome.diff.length > 0 || outcome.status === 'rejected')}
  <section class="t-panel t-panel-pad review" aria-label="Change review">
    <div class="rev-head">
      <div>
        <h2 class="t-h2">{outcome.status === 'rejected' ? 'The proposal was refused' : 'The change set the runtime derived'}</h2>
        <p class="rev-lead">
          {#if outcome.status === 'rejected'}
            The program assigned values the contract does not allow. One bad edit rejects the whole proposal, so nothing was applied and nothing is waiting for review.
          {:else}
            The program only assigned values. The runtime compared the data before and after and built this list. A person approves it before anything is applied; the model is told only how many changes there are.
          {/if}
        </p>
      </div>
      {#if outcome.diff.length > 0}
        <div class="rev-actions">
          {#if decision === 'pending'}
            <button type="button" class="t-btn good" onclick={approve}><Check size={16} /> Approve and apply</button>
            <button type="button" class="t-btn" onclick={decline}>Decline</button>
          {:else}
            <span class="verdict" data-decision={decision} role="status">
              {decision === 'approved' ? 'Applied to this browser\u2019s copy of the estate' : 'Declined: nothing changed'}
            </span>
            {#if dirty}
              <button type="button" class="t-btn" onclick={() => { resetEstate(); void run(); }}><RotateCcw size={14} /> Reset the estate</button>
            {/if}
          {/if}
        </div>
      {/if}
    </div>

    {#if applyError}
      <p class="fail" role="alert"><strong>Could not apply.</strong> {applyError}</p>
    {/if}
    {#if decision === 'approved'}
      <p class="rev-hint">Run the program again: it now finds nothing left to change.</p>
    {/if}

    {#if outcome.diff.length > 0}
      <ul class="chg-grid">
        {#each shownChanges as g (g.resourceId)}
          <li class="chg-card">
            <p class="chg-name">{g.resourceName} <span>{TYPE_LABEL[g.resourceType as keyof typeof TYPE_LABEL] ?? g.resourceType}</span></p>
            {#each g.rows as row (row.field)}
              <p class="chg-row" data-op={row.op}>
                <span class="chg-op" aria-label={row.op}>{OP_MARK[row.op]}</span>
                <span class="f">{fieldLabel(row)}</span>
                {#if row.op === 'add'}
                  <span class="v">{val(row.after)}</span>
                {:else if row.op === 'remove'}
                  <span class="v gone">{val(row.before)}</span>
                {:else}
                  <span class="v"><s>{val(row.before)}</s> → {val(row.after)}</span>
                {/if}
              </p>
            {/each}
          </li>
        {/each}
      </ul>
      {#if changes.length > shownChanges.length || showAllChanges}
        <button type="button" class="t-btn sm more" onclick={() => (showAllChanges = !showAllChanges)}>
          {showAllChanges ? 'Show fewer' : `Show all ${changes.length} resources`}
        </button>
      {/if}
    {:else if attemptedLines.length}
      <p class="res-note">What it tried to change</p>
      <ul class="attempts">
        {#each attemptedLines as line (line)}<li class="t-mono">{line}</li>{/each}
      </ul>
    {/if}
  </section>
{/if}

<section class="t-panel t-panel-pad object" aria-label="The object the program receives">
  <div class="obj-head">
    <h2 class="t-h2">The object the program receives</h2>
    <span class="t-chip">function main(data, ctx)</span>
  </div>
  <dl class="members">
    <div class="member">
      <dt><code>data.resources</code></dt>
      <dd><b>{fmtInt(inv.resources.length)}</b> records as plain JSON: type, tags, monthly cost, power state, and the ids that link a VM to its NIC, disks and public IP.</dd>
    </div>
    <div class="member">
      <dt><code>data.resourceGroups</code></dt>
      <dd><b>{fmtInt(inv.resourceGroups.length)}</b> groups, each pointing at its subscription by id.</dd>
    </div>
    <div class="member">
      <dt><code>data.subscriptions</code></dt>
      <dd><b>{fmtInt(inv.subscriptions.length)}</b> subscriptions: {inv.subscriptions.map((s) => s.name).join(' and ')}.</dd>
    </div>
    <div class="member">
      <dt><code>ctx</code></dt>
      <dd><code>now()</code> and <code>daysSince(iso)</code> give the estate's clock, so "idle for 30 days" means the same on every run. <code>preview(value)</code> shortens a value for logs.</dd>
    </div>
    <div class="member write">
      <dt>Writes</dt>
      <dd>Assign to a tag (string values) or to a VM's <code>powerState</code>. Nothing else may change.</dd>
    </div>
  </dl>
  <details class="schema">
    <summary>The exact description the model is sent <span class="t-muted">(≈ {fmtTokens(schemaTokens)} tokens)</span></summary>
    <pre class="t-code">{SCHEMA_DOC}</pre>
  </details>
</section>

<section class="t-panel t-panel-pad layers" aria-label="What keeps it safe">
  <div class="layers-head">
    <h2 class="t-h2">Three layers decide what the program can do</h2>
    <p class="layers-lead">Try to break each one. A chip loads a small program into the editor and runs it.</p>
  </div>
  <div class="layer-grid">
    {#each LAYERS as layer (layer.id)}
      {@const Icon = layer.icon}
      <div class="layer" class:active={activeProbe?.layer === layer.id && !!outcome && !stale}>
        <div class="layer-top">
          <Icon size={18} />
          <h3>{layer.title}</h3>
          <span class="layer-line">{layer.line}</span>
        </div>
        <p class="layer-text">{layer.text}</p>
        {#if layer.id === 'see'}
          <div class="record">
            <p><code>web-prod-03</code> is stored with {heroFields.stored} fields; the program is given {heroFields.seen}. Removed:</p>
            <div class="globs">{#each heroRemoved as k (k)}<span class="gone-key">{k}</span>{/each}</div>
          </div>
        {:else if layer.id === 'change'}
          <div class="record"><p>Writable: string tags, and a VM's <code>powerState</code>. Every other field is read-only.</p></div>
        {:else}
          <div class="record">
            <p>Globals inside the runtime, and nothing else:</p>
            <div class="globs">{#each ALLOWED_GLOBALS as g (g)}<code>{g}</code>{/each}</div>
          </div>
        {/if}
        <div class="probes">
          {#each probesOf(layer.id) as p (p.id)}
            <button type="button" class="probe" class:on={activeProbe?.id === p.id} aria-pressed={activeProbe?.id === p.id} onclick={() => tryProbe(p)}>{p.label}</button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
  {#if activeProbe && probeRes}
    <p class="probe-result" data-met={probeRes.met} role="status">
      <strong>{activeProbe.label}.</strong>
      {probeRes.headline}
      <span class="why">{activeProbe.why}</span>
      <button type="button" class="jump" onclick={showOnMap}>See the program and the map ↑</button>
    </p>
  {/if}
  <p class="caveat">
    This is a demonstration sandbox. A worker with a time limit and a list of globals contains ordinary mistakes; it is not a security boundary against hostile code. A real deployment needs a real isolate.
  </p>
</section>

<section class="t-panel t-panel-pad compare" aria-label="Same question, both surfaces">
  <div class="cmp-top">
    <div>
      <h2 class="t-h2">Same question, both surfaces</h2>
      <p class="cmp-headline" data-winner={cmp.winner}>{comparisonHeadline(cmp)}</p>
    </div>
    <span class="t-chip" title="Both replays end with the same sentence, so the bill compares the work and not the wording.">
      {cmp.sameAnswer ? 'Same final answer' : 'The answers differ'}
    </span>
  </div>
  <div class="cmp-rows">
    {#each bars as b (b.id)}
      <div class="cmp-row">
        <div class="cmp-name">
          <strong>{b.label}</strong>
          <span>{b.replay.totals.calls} {b.replay.totals.calls === 1 ? 'call' : 'calls'} over {b.replay.totals.turns} turns</span>
        </div>
        <div class="cmp-bar" role="img" aria-label="{b.label}: about {fmtTokens(b.setup + b.rest)} tokens billed, of which {fmtTokens(b.setup)} is setup sent again on every turn">
          <span class="seg setup" style:width="{b.setupPct}%"></span><span class="seg rest" style:width="{b.restPct}%"></span>
        </div>
        <div class="cmp-num">≈ {fmtTokens(b.setup + b.rest)}</div>
      </div>
    {/each}
  </div>
  <p class="cmp-legend">
    <span class="sw setup"></span> Instructions and tool definitions, sent again on every turn
    <span class="sw rest"></span> Everything else: the question, the calls, the results, the answer
  </p>
  <p class="cmp-lesson">{comparisonLesson(cmp)}</p>
  <details class="honest">
    <summary>How honest is this comparison?</summary>
    <p>
      Both sides are replays, not a live model. The program is the reference program from this repository's solution-path document, run for real against this estate; the catalogue side is the benchmark's own
      catalogue on its best-case route. Both bills use the benchmark's convention: characters ÷ 4, every turn re-sending everything, no prompt caching. The programs are idealised: they compute the answers
      exactly, where a live model might not.
    </p>
  </details>
</section>

<TourNav prev={{ href: '/tour/language', label: 'The catalogue grows a language' }} next={{ href: '/', label: 'Run it for real: the live benchmark', hint: 'Finish' }} />

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
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 10px 16px;
  }
  .bar > :global(*) {
    padding: 0 14px;
    border-left: 1px solid var(--color-border-default);
  }
  .bar > :global(*:first-child) {
    padding-left: 0;
    border-left: 0;
  }

  .layout {
    scroll-margin-top: 76px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(480px, 41vw, 620px);
    gap: 16px;
    align-items: start;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  @media (max-width: 1100px) {
    .head,
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .bar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
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
  .caption[data-tone='bad'] {
    color: #b91c1c;
  }
  .cap-step {
    flex: none;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-brand);
  }
  .caption[data-tone='bad'] .cap-step {
    color: #b91c1c;
  }
  .readout {
    height: 168px;
    overflow: auto;
    border-top: 1px solid var(--color-border-subtle);
    padding-top: 8px;
  }
  .ro-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }
  .ro-name {
    font-size: 15px;
  }
  .ro-head :global(.t-btn) {
    margin-left: auto;
  }
  .ro-empty {
    margin: 10px 0 0;
    font-size: 14px;
    color: var(--color-text-muted);
  }
  .ro-label {
    margin: 12px 0 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .fchips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .fchip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px 2px 8px;
    border-radius: 999px;
    border: 1px solid #99d5cf;
    background: #f0fdfa;
    font-size: 12.5px;
  }
  .fchip code {
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
  }
  .fchip b {
    min-width: 22px;
    padding: 0 6px;
    border-radius: 999px;
    background: #0d9488;
    color: white;
    font-size: 11.5px;
    text-align: center;
  }

  /* ── object ─────────────────────────────────────────────────────── */
  .object {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .obj-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .members {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 32px;
  }
  .member {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 12px;
    align-items: baseline;
    font-size: 14px;
  }
  .member dt {
    font-weight: 650;
    color: var(--color-text-primary);
  }
  .member dd {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .member code,
  .layer code {
    font-family: var(--font-mono);
    font-size: 12.5px;
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--color-expanded-bg);
    border: 1px solid var(--color-border-subtle);
    color: var(--color-text-primary);
  }
  .member.write dt {
    color: var(--good);
  }
  .schema summary {
    cursor: pointer;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .schema pre {
    margin-top: 8px;
    max-height: 320px;
    font-size: 12px;
  }

  /* ── program ────────────────────────────────────────────────────── */
  .program {
    padding: 14px 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .prog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .prog-title {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .prog-meta {
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .ask {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--color-text-secondary);
  }
  .ask p {
    margin: 0;
  }
  .ask-label {
    display: inline-block;
    min-width: 72px;
    margin-right: 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .editor {
    display: block;
    width: 100%;
    min-height: 224px;
    box-sizing: border-box;
    padding: 12px 14px;
    border: 1px solid #1e293b;
    border-radius: 10px;
    background: #0f172a;
    color: #e2e8f0;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.55;
    tab-size: 2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    resize: vertical;
    field-sizing: content;
  }
  .editor:focus-visible {
    outline: 2px solid var(--color-brand);
    outline-offset: 2px;
  }
  .prog-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 30px;
  }
  .kbd {
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.spin) {
      animation-duration: 3s;
    }
  }

  /* ── result ─────────────────────────────────────────────────────── */
  .result {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .res-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .res-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .res-body.stale {
    opacity: 0.55;
  }
  .res-body pre {
    max-height: 240px;
  }
  .res-note {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .empty {
    margin: 0;
    font-size: 14px;
    color: var(--color-text-muted);
  }
  .fail {
    margin: 0;
    padding: 8px 12px;
    border-radius: 9px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    font-size: 14px;
  }

  /* ── review ─────────────────────────────────────────────────────── */
  .review {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .rev-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  .rev-lead {
    margin: 4px 0 0;
    max-width: 78ch;
    font-size: 14.5px;
    color: var(--color-text-secondary);
  }
  .rev-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .verdict {
    font-size: 14px;
    font-weight: 650;
    color: var(--good);
  }
  .verdict[data-decision='declined'] {
    color: var(--color-text-muted);
  }
  .rev-hint {
    margin: 0;
    font-size: 14px;
    color: var(--color-text-secondary);
  }
  .chg-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 8px;
  }
  .chg-card {
    padding: 8px 10px;
    border: 1px solid var(--color-border-default);
    border-radius: 10px;
    background: white;
    min-width: 0;
  }
  .chg-name {
    margin: 0 0 4px;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chg-name span {
    margin-left: 4px;
    font-family: inherit;
    font-weight: 500;
    color: var(--color-text-muted);
    font-size: 12px;
  }
  .chg-row {
    margin: 0;
    display: grid;
    grid-template-columns: 16px auto minmax(0, 1fr);
    gap: 6px;
    align-items: baseline;
    font-size: 13px;
  }
  .chg-row .chg-op {
    font-family: var(--font-mono);
    font-weight: 800;
  }
  .chg-row[data-op='add'] .chg-op {
    color: var(--good);
  }
  .chg-row[data-op='edit'] .chg-op {
    color: #b45309;
  }
  .chg-row[data-op='remove'] .chg-op {
    color: #b91c1c;
  }
  .chg-row .f {
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
  }
  .chg-row .f::after {
    content: ':';
  }
  .chg-row .v {
    font-family: var(--font-mono);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chg-row .v s {
    color: var(--color-text-muted);
  }
  .chg-row .v.gone {
    text-decoration: line-through;
    color: var(--color-text-muted);
  }
  .more {
    align-self: flex-start;
  }
  .attempts {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
  }

  /* ── layers ─────────────────────────────────────────────────────── */
  .layers {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .layers-head {
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
  }
  .layers-lead {
    margin: 0;
    font-size: 14.5px;
    color: var(--color-text-muted);
  }
  .layer-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  @media (max-width: 1100px) {
    .layer-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .layer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid var(--color-border-default);
    border-radius: 12px;
    background: white;
    transition: border-color 0.15s, background 0.15s;
  }
  .layer.active {
    border-color: var(--color-brand);
    background: var(--color-brand-bg);
  }
  .layer-top {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-brand);
  }
  .layer-top h3 {
    margin: 0;
    font-size: 16px;
    color: var(--color-text-primary);
  }
  .layer-line {
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .layer-text {
    margin: 0;
    font-size: 14px;
    color: var(--color-text-secondary);
  }
  .record {
    margin: 0;
    font-size: 13px;
    line-height: 1.9;
    color: var(--color-text-secondary);
  }
  .gone-key {
    display: inline-block;
    padding: 0 6px;
    border-radius: 5px;
    background: #fef2f2;
    color: #991b1b;
    font-family: var(--font-mono);
    font-size: 12px;
    text-decoration: line-through;
  }
  .record p {
    margin: 0;
  }
  .globs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .probes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: auto;
  }
  .probe {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--color-border-strong);
    background: white;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .probe:hover {
    background: var(--color-hover-bg);
    border-color: var(--color-text-dim);
  }
  .probe.on {
    background: var(--color-brand);
    border-color: var(--color-brand);
    color: white;
  }
  .probe-result {
    margin: 0;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 14.5px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #7f1d1d;
  }
  .probe-result[data-met='true'] {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #064e3b;
  }
  .probe-result .why {
    display: block;
    margin-top: 2px;
    font-size: 13.5px;
    opacity: 0.85;
  }
  .jump {
    margin-top: 6px;
    padding: 0;
    border: 0;
    background: none;
    font-size: 13.5px;
    font-weight: 650;
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .caveat {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }

  /* ── compare ────────────────────────────────────────────────────── */
  .compare {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cmp-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .cmp-headline {
    margin: 4px 0 0;
    font-size: 20px;
    font-weight: 750;
    letter-spacing: -0.01em;
    color: #4338ca;
  }
  .cmp-headline[data-winner='catalog'] {
    color: #b45309;
  }
  .cmp-headline[data-winner='tie'] {
    color: var(--color-text-primary);
  }
  .cmp-rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cmp-row {
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr) 90px;
    gap: 14px;
    align-items: center;
  }
  .cmp-name {
    display: flex;
    flex-direction: column;
    font-size: 14px;
  }
  .cmp-name span {
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .cmp-bar {
    display: flex;
    height: 26px;
    border-radius: 7px;
    overflow: hidden;
    background: var(--color-expanded-bg);
  }
  .seg.setup,
  .sw.setup {
    background: #c7d2fe;
  }
  .seg.rest,
  .sw.rest {
    background: #6366f1;
  }
  .seg {
    height: 100%;
    transition: width 0.35s ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .seg {
      transition: none;
    }
  }
  .cmp-num {
    font-size: 17px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .cmp-legend {
    margin: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .sw {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
  .sw.rest {
    margin-left: 10px;
  }
  .cmp-lesson {
    margin: 0;
    max-width: 90ch;
    font-size: 15px;
    color: var(--color-text-secondary);
  }
  .honest summary {
    cursor: pointer;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .honest p {
    margin: 6px 0 0;
    max-width: 90ch;
    font-size: 13.5px;
    color: var(--color-text-muted);
  }
  @media (max-width: 1100px) {
    .members {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 800px) {
    .cmp-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .cmp-bar {
      grid-column: 1 / -1;
      order: 3;
    }
    .member {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
</style>
