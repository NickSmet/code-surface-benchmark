<script lang="ts">
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { X } from '@lucide/svelte';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { TASKS } from '$lib/tasks';
  import EstateMap, { type GroupPaint } from '$lib/components/tour/EstateMap.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import StatTile from '$lib/components/tour/StatTile.svelte';
  import TourNav from '$lib/components/tour/TourNav.svelte';
  import UnitCard from '$lib/components/tour/UnitCard.svelte';
  import type { TaskId } from '$lib/tour/answers';
  import { buildEstateModel } from '$lib/tour/estate';
  import { buildLenses, LENS_ORDER, type LensId } from '$lib/tour/lenses';
  import { needleFor } from '$lib/tour/needles';
  import { COLORS, KIND_LABEL, type Paint } from '$lib/tour/paint';
  import { estateDump, representationsFor } from '$lib/tour/representations';
  import { replayCatalog, taskPrompt } from '$lib/tour/scenarios';
  import { fmtTokens } from '$lib/tour/tokens';
  import { fmtInt } from '$lib/utils';

  const inv = buildInventory();
  const model = buildEstateModel(inv);
  const lenses = buildLenses(inv);
  const dump = estateDump(inv);
  const groupByName = new Map(model.groups.map((g) => [g.name, g]));

  const QUESTIONS = TASKS.map((t) => t.id as TaskId);
  const params = page.url.searchParams;
  const startLens = params.get('lens') as LensId | null;
  const startTask = params.get('q') as TaskId | null;

  // The sixth "lens" is not a colouring: it is the estate as the model is handed it.
  type Mode = LensId | 'context';
  const MODES: Mode[] = [...LENS_ORDER, 'context'];
  let mode = $state<Mode>(startLens && MODES.includes(startLens as Mode) ? (startLens as Mode) : 'type');
  let taskId = $state<TaskId | null>(startTask && QUESTIONS.includes(startTask) ? startTask : null);
  const dumped = $derived(mode === 'context');

  // Lens legend: hover/focus previews, click pins.
  let legendHover = $state<string | null>(null);
  let legendPinned = $state<string | null>(null);
  const legendKey = $derived(legendHover ?? legendPinned);

  // Map selection: hover previews only while nothing is pinned.
  let hoverId = $state<string | null>(null);
  let pinnedId = $state<string | null>(null);
  const focusId = $derived(pinnedId ?? hoverId);

  let repId = $state<'summary' | 'record' | 'pod' | 'estate'>('record');

  const lens = $derived(lenses[mode === 'context' ? 'type' : mode]);
  const needle = $derived(taskId ? needleFor(taskId, inv) : null);
  const replay = $derived(taskId ? replayCatalog({ task: taskId }) : null);
  const unit = $derived(focusId ? (model.unitById.get(focusId) ?? null) : null);
  const reps = $derived(unit ? representationsFor(unit, inv) : []);
  const activeRep = $derived<'summary' | 'record' | 'pod' | 'estate'>(
    repId === 'estate' || reps.some((r) => r.id === repId) ? repId : 'record'
  );
  const repText = $derived(
    activeRep === 'estate'
      ? { source: `all ${dump.count} projected records as one JSON array`, display: dump.text.slice(0, 1800) + ' …' }
      : (reps.find((r) => r.id === activeRep) ?? null)
  );
  const unitGroup = $derived(unit ? groupByName.get(unit.groupName) : undefined);

  const needleCount = $derived(needle ? (needle.groupNames.size > 0 ? 0 : needle.resourceIds.size) : 0);
  const answerPct = $derived(replay ? (replay.totals.answerTokens / dump.tokens) * 100 : 0);

  const SHORT: Record<TaskId, string> = {
    'granular-read': 'Granular read',
    'filter-aggregate': 'Filter + aggregate',
    'bulk-write': 'Bulk write',
    'single-lookup': 'Single lookup'
  };
  const KIND_NAME: Record<string, string> = { vm: 'Virtual machine pod', storage: 'Storage account', sql: 'SQL database', app: 'App service', other: 'Resource' };

  function syncUrl(): void {
    const p = new URLSearchParams();
    if (mode !== 'type') p.set('lens', mode);
    if (taskId) p.set('q', taskId);
    const qs = p.toString();
    try {
      replaceState(page.url.pathname + (qs ? `?${qs}` : ''), page.state);
    } catch {
      /* router not ready: the URL is a convenience, not state */
    }
  }

  function setLens(id: Mode): void {
    mode = id;
    legendHover = null;
    legendPinned = null;
    syncUrl();
  }
  function setTask(id: TaskId | 'none'): void {
    taskId = id === 'none' ? null : id;
    syncUrl();
  }
  function pinLegend(key: string): void {
    legendPinned = legendPinned === key ? null : key;
    legendHover = legendPinned ?? key;
  }
  function select(id: string | null): void {
    pinnedId = pinnedId === id ? null : id;
  }

  // A VM is its whole pod: if the question needs the VM, its NIC, IP and disks are not faded.
  const needUnits = $derived(
    new Set(needle ? [...needle.resourceIds].map((id) => model.unitIdOf.get(id)).filter((u): u is string => !!u) : [])
  );

  function paintOf(id: string): Paint {
    if (dumped) {
      const p: Paint = { fill: COLORS.read };
      if (needle?.resourceIds.has(id)) {
        p.needle = true;
        // Pulse once so the needle can be found in the haystack.
        p.fresh = true;
      }
      return p;
    }
    const r = model.resourceById.get(id)!;
    const cell = lens.cell(r);
    const p: Paint = { fill: cell.fill };
    if (legendKey && cell.key !== legendKey) p.dim = true;
    if (needle) {
      if (needle.resourceIds.has(id)) p.needle = true;
      else if (!needUnits.has(model.unitIdOf.get(id) ?? '')) p.faint = true;
    }
    return p;
  }

  function groupPaintOf(name: string): GroupPaint | undefined {
    if (!needle || !needle.groupNames.has(name)) return undefined;
    return { ring: COLORS.needle, ringStyle: 'dashed', tag: 'needed', tagColor: COLORS.needle };
  }

  function labelOf(u: { id: string; name: string; members: unknown[] }): string {
    const r = model.resourceById.get(u.id)!;
    const key = lens.cell(r).key;
    const what = lens.legend.find((l) => l.key === key)?.label ?? '';
    const extra = u.members.length > 1 ? `, with ${u.members.length - 1} connected resources` : '';
    return `${u.name}${extra}${dumped || !what ? '' : `. ${lens.label}: ${what}`}`;
  }

  function onWindowKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (pinnedId) pinnedId = null;
      else if (legendPinned) {
        legendPinned = null;
        legendHover = null;
      }
      return;
    }
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= MODES.length) setLens(MODES[n - 1]);
  }
</script>

<svelte:head>
  <title>The estate · From tools to code surfaces</title>
</svelte:head>
<svelte:window onkeydown={onWindowKey} />

<header class="head">
  <div class="head-text">
    <p class="t-kicker">① The estate</p>
    <h1 class="t-h1" aria-live="polite">
      {#if needle}
        Your question needs <span class="big">{fmtInt(needleCount)}</span> of the {fmtInt(model.totals.resources)}.
      {:else}
        {fmtInt(model.totals.resources)} resources, wired together.
      {/if}
    </h1>
    <p class="t-lead">
      {#if needle}
        {needle.caption}
      {:else}
        Each pod is a VM with the network interface, public IP and disks it points at. The loose squares are storage, SQL and app services.
      {/if}
    </p>
    {#if taskId}
      <details class="prompt">
        <summary>The exact question the agent is asked</summary>
        <blockquote>{taskPrompt(taskId)}</blockquote>
      </details>
    {/if}
  </div>

  <section class="t-panel t-panel-pad ctl-panel" aria-label="Controls">
    <div class="ctl">
      <span class="ctl-label">Colour by</span>
      <Segmented
        label="Colour by"
        value={mode}
        onchange={setLens}
        options={[
          ...LENS_ORDER.map((id, i) => ({ id: id as Mode, label: lenses[id].label, hint: String(i + 1), title: lenses[id].question })),
          { id: 'context' as Mode, label: 'In context', hint: String(MODES.length), title: 'Hand the model everything' }
        ]}
      />
    </div>
    <div class="ctl">
      <span class="ctl-label">Ask a question</span>
      <Segmented
        label="Question"
        value={taskId ?? 'none'}
        onchange={setTask}
        accent="var(--color-brand)"
        options={[
          { id: 'none', label: 'None' },
          ...QUESTIONS.map((id) => ({ id, label: SHORT[id], title: TASKS.find((t) => t.id === id)?.description }))
        ]}
      />
    </div>
  </section>
</header>

<div class="layout">
  <section class="t-panel map-panel" aria-label="The estate">
    <div class="legend-row">
      <div class="legend" role="group" aria-label={dumped ? 'Context legend' : `${lens.label} legend. Hover to highlight, click to pin.`}>
        {#if dumped}
          <span class="lg static">
            <span class="sw" style:background={COLORS.read}></span>
            <span class="lg-num">{fmtInt(model.totals.resources)}</span>
            <span class="lg-label">{KIND_LABEL.read}</span>
          </span>
        {:else}
          {#each lens.legend as item (item.key)}
            <button
              type="button"
              class="lg"
              data-active={legendKey === item.key ? 'true' : undefined}
              aria-pressed={legendPinned === item.key}
              title={item.label}
              onmouseenter={() => (legendHover = item.key)}
              onmouseleave={() => (legendHover = null)}
              onfocus={() => (legendHover = item.key)}
              onblur={() => (legendHover = null)}
              onclick={() => pinLegend(item.key)}
            >
              <span class="sw" style:background={item.color}></span>
              <span class="lg-num">{fmtInt(item.count)}</span>
              <span class="lg-label">{item.short ?? item.label}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <div class="caption" role="status">
      {#if dumped}
        <div class="bar-row">
          <span class="bar-label">Everything in context</span>
          <span class="bar"><span class="fill" style:width="100%"></span></span>
          <span class="bar-num">≈ {fmtTokens(dump.tokens)} tokens</span>
        </div>
        {#if replay}
          <div class="bar-row">
            <span class="bar-label">The answer</span>
            <span class="bar"><span class="fill ans" style:width="{Math.max(answerPct, 0.4)}%"></span></span>
            <span class="bar-num">≈ {fmtInt(replay.totals.answerTokens)} tokens</span>
          </div>
        {:else}
          <p class="insight">Everything is in the model's context. Pick a question to see how much of it the question needs.</p>
        {/if}
      {:else}
        <p class="insight">{lens.insight}</p>
      {/if}
    </div>

    <EstateMap
      {model}
      {paintOf}
      {groupPaintOf}
      {labelOf}
      selectedId={pinnedId}
      onselect={select}
      onhover={(id) => (hoverId = id)}
      label="Estate map: {fmtInt(model.totals.resources)} resources in {model.totals.groups} resource groups"
    />
  </section>

  <aside class="inspector t-panel" aria-label="Inspector" aria-live="polite">
    {#if unit}
      <div class="insp-head">
        <div class="insp-title">
          <p class="t-kicker">{KIND_NAME[unit.kind] ?? 'Resource'}</p>
          <h2 class="insp-name">{unit.name}</h2>
          <p class="insp-where">{unit.groupName} · {unitGroup?.subscriptionName} · {unitGroup?.location}</p>
        </div>
        {#if pinnedId}
          <button type="button" class="t-btn sm" onclick={() => (pinnedId = null)} title="Escape also unpins">
            <X size={14} /> Unpin
          </button>
        {:else}
          <span class="t-chip" title="Click the pod to keep it here">preview</span>
        {/if}
      </div>

      <UnitCard {unit} {model} />

      <div class="reps">
        <h3 class="t-h2">What the model would be handed</h3>
        <div class="rep-tabs" role="tablist" aria-label="Representations of this resource">
          {#each reps as r (r.id)}
            <button type="button" role="tab" aria-selected={activeRep === r.id} class:on={activeRep === r.id} onclick={() => (repId = r.id)} title={r.source}>
              <span class="rt-label">{r.label}</span>
              <span class="rt-num">{fmtTokens(r.tokens)}</span>
            </button>
          {/each}
          <button type="button" role="tab" aria-selected={activeRep === 'estate'} class:on={activeRep === 'estate'} onclick={() => (repId = 'estate')}>
            <span class="rt-label">Estate</span>
            <span class="rt-num">{fmtTokens(dump.tokens)}</span>
          </button>
        </div>
        {#if repText}
          <p class="rep-source">{repText.source} · tokens ≈ characters ÷ 4</p>
          <pre class="t-json rep-text" class:fade={activeRep === 'estate'}>{repText.display}</pre>
          <p class="rep-note">Indented here so you can read it. The model receives it compact.</p>
        {/if}
      </div>
    {:else}
      <div class="insp-empty">
        <h2 class="t-h2">Point at a pod</h2>
        <p class="how">
          Hover or arrow-key to a pod to inspect it. Click to pin it, Esc to let go. Keys 1 to 6 switch the view.
        </p>
        <ul class="glyphs">
          <li><span class="g g-vm"></span><span><strong>Square</strong> a virtual machine</span></li>
          <li><span class="g g-nic"></span><span><strong>Circle</strong> its network interface</span></li>
          <li><span class="g g-pip"></span><span><strong>Small square</strong> its public IP, dashed when it has none</span></li>
          <li><span class="g g-disk"></span><span><strong>Bars</strong> its disks</span></li>
          <li><span class="g g-loose"></span><span><strong>Loose squares</strong> storage, SQL and app services</span></li>
        </ul>
        <div class="tiles">
          <StatTile label="Resources" value={fmtInt(model.totals.resources)} />
          <StatTile label="VMs" value={fmtInt(model.totals.vms)} />
          <StatTile label="Groups" value={fmtInt(model.totals.groups)} sub="{model.totals.subscriptions} subscriptions" />
          <StatTile label="Per month" value={'$' + fmtInt(Math.round(model.totals.costMonthly))} />
        </div>
      </div>
    {/if}
  </aside>
</div>

<TourNav next={{ href: '/tour/tools', label: 'The naive way: one tool call at a time' }} />

<style>
  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 600px);
    gap: 20px;
    align-items: start;
  }
  .head-text {
    min-width: 0;
  }
  .big {
    font-family: var(--font-mono);
    color: var(--color-brand);
    font-size: 1.15em;
  }
  .prompt {
    margin-top: 8px;
    max-width: 78ch;
    font-size: 14px;
  }
  .prompt summary {
    cursor: pointer;
    font-weight: 650;
    color: var(--color-brand);
    width: fit-content;
  }
  .prompt blockquote {
    margin: 6px 0 0;
    padding: 8px 12px;
    border-left: 3px solid var(--color-brand);
    background: var(--color-brand-bg);
    border-radius: 0 9px 9px 0;
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .ctl-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px;
  }
  .ctl {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
  .ctl-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 390px;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 1100px) {
    .layout,
    .head {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* ── map panel ──────────────────────────────────────────────────── */
  .map-panel {
    padding: 12px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .legend-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
  .lg {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 3px 10px 3px 7px;
    border-radius: 999px;
    border: 1px solid var(--color-border-default);
    background: white;
    font-size: 13.5px;
    color: var(--color-text-secondary);
    transition: border-color 0.12s, background 0.12s;
  }
  button.lg:hover,
  .lg[data-active='true'] {
    border-color: var(--color-text-secondary);
    background: var(--color-hover-bg);
  }
  .sw {
    width: 13px;
    height: 13px;
    border-radius: 4px;
    flex: none;
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.12);
  }
  .lg-num {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 800;
    color: var(--color-text-primary);
  }
  .lg-label {
    font-weight: 550;
  }
  .caption {
    min-height: 46px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
  }
  .insight {
    margin: 0;
    font-size: 14.5px;
    color: var(--color-text-muted);
  }
  .bar-row {
    display: grid;
    grid-template-columns: 160px minmax(0, 1fr) 140px;
    align-items: center;
    gap: 12px;
  }
  .bar-label {
    font-size: 14px;
    font-weight: 650;
    color: var(--color-text-secondary);
  }
  .bar {
    height: 14px;
    border-radius: 5px;
    background: var(--color-border-subtle);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: #6366f1;
    border-radius: 5px;
    transition: width 0.4s ease;
  }
  .fill.ans {
    background: #059669;
  }
  .bar-num {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 800;
  }

  /* ── inspector ──────────────────────────────────────────────────── */
  .inspector {
    position: sticky;
    top: 66px;
    max-height: calc(100dvh - 82px);
    overflow: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 360px;
  }
  .insp-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .insp-title {
    min-width: 0;
  }
  .insp-name {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .insp-where {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .reps {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rep-tabs {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .rep-tabs button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 5px 10px;
    border-radius: 10px;
    border: 1px solid var(--color-border-default);
    background: white;
    text-align: left;
    min-width: 0;
    transition: border-color 0.12s, background 0.12s;
  }
  .rep-tabs button:hover:not(.on) {
    background: var(--color-hover-bg);
  }
  .rep-tabs button.on {
    border-color: var(--color-brand);
    background: var(--color-brand-bg);
  }
  .rt-label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .rt-num {
    font-family: var(--font-mono);
    font-size: 19px;
    font-weight: 800;
    line-height: 1.2;
    color: var(--color-text-primary);
  }
  .rep-source {
    margin: 0;
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .rep-text {
    height: 150px;
  }
  .rep-text.fade {
    -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent);
    mask-image: linear-gradient(to bottom, black 70%, transparent);
  }
  .rep-note {
    margin: 0;
    font-size: 12.5px;
    color: var(--color-text-dim);
  }

  .insp-empty {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .how {
    margin: 0;
    font-size: 14.5px;
    color: var(--color-text-secondary);
  }
  .glyphs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
    font-size: 14.5px;
  }
  .glyphs li {
    display: grid;
    grid-template-columns: 34px 1fr;
    align-items: center;
    gap: 10px;
  }
  .g {
    justify-self: center;
    background: #64748b;
  }
  .g-vm {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    background: #334155;
  }
  .g-nic {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #38bdf8;
  }
  .g-pip {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    background: #f59e0b;
  }
  .g-disk {
    width: 26px;
    height: 6px;
    border-radius: 2px;
  }
  .g-loose {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: #d946ef;
  }
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 12px;
    padding: 12px 14px;
    border: 1px solid var(--color-border-default);
    border-radius: 12px;
    background: white;
  }
</style>
