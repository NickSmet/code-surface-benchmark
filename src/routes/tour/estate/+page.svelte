<script lang="ts">
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { X } from '@lucide/svelte';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { TASKS } from '$lib/tasks';
  import BeatKeys from '$lib/components/tour/BeatKeys.svelte';
  import EstateMap, { type GroupPaint } from '$lib/components/tour/EstateMap.svelte';
  import Segmented from '$lib/components/tour/Segmented.svelte';
  import StatTile from '$lib/components/tour/StatTile.svelte';
  import TourNav from '$lib/components/tour/TourNav.svelte';
  import UnitCard from '$lib/components/tour/UnitCard.svelte';
  import type { TaskId } from '$lib/tour/answers';
  import { buildEstateModel } from '$lib/tour/estate';
  import { buildLenses, LENS_ORDER, TYPE_COLOR, type LensId } from '$lib/tour/lenses';
  import { needleFor } from '$lib/tour/needles';
  import { COLORS, KIND_LABEL, type Paint } from '$lib/tour/paint';
  import { usePresenter } from '$lib/tour/presenter.svelte';
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

  // One sentence under the title: what the question needs, else what this view shows.
  const lead = $derived(
    needle
      ? needle.caption
      : dumped
        ? 'Everything is in the model\u2019s context. Pick a question to see how much of it the question needs.'
        : lens.insight
  );

  const SHORT: Record<TaskId, string> = {
    'granular-read': 'Granular read',
    'filter-aggregate': 'Filter + aggregate',
    'bulk-write': 'Bulk write',
    'single-lookup': 'Single lookup'
  };

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

  const presenter = usePresenter();
  /** The arrow keys walk the colourings and then the whole estate as the model is handed it; Shift jumps to that last one. */
  const modeGroups = MODES.map((m) => (m === 'context' ? 'context' : 'lenses'));

  function onWindowKey(e: KeyboardEvent): void {
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey || presenter.helpOpen) return;
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
<BeatKeys at={MODES.indexOf(mode)} groups={modeGroups} onstep={(i) => setLens(MODES[i])} />

<div class="screen">
  <header class="top">
    <div class="top-text">
      <h1 class="t-h1" aria-live="polite">
        {#if needle}
          Your question needs <span class="big">{fmtInt(needleCount)}</span> of the {fmtInt(model.totals.resources)}.
        {:else}
          {fmtInt(model.totals.resources)} resources, wired together.
        {/if}
      </h1>
      <p class="t-lead" aria-live="polite">{lead}</p>
    </div>
    <TourNav next={{ href: '/tour/tools', label: 'Naive tools' }} />
  </header>

  <section class="t-panel bar" aria-label="Controls">
    <div class="ctl">
      <span class="ctl-label">Colour by</span>
      <Segmented
        label="Colour by"
        size="sm"
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
        size="sm"
        value={taskId ?? 'none'}
        onchange={setTask}
        accent="var(--color-brand)"
        options={[
          { id: 'none', label: 'None' },
          ...QUESTIONS.map((id) => ({ id, label: SHORT[id], title: TASKS.find((t) => t.id === id)?.description }))
        ]}
      />
    </div>
    {#if taskId}
      <details class="prompt">
        <summary>The exact question</summary>
        <blockquote>{taskPrompt(taskId)}</blockquote>
      </details>
    {/if}
  </section>

  <section class="t-panel map-panel" aria-label="The estate">
    {#if !dumped}
      <div class="legend" role="group" aria-label="{lens.label} legend. Hover to highlight, click to pin.">
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
      </div>
    {:else}
      <div class="bars" role="status">
        <div class="bar-row">
          <span class="bar-label">
            <span class="sw" style:background={COLORS.read} title={KIND_LABEL.read}></span>
            Everything in context
          </span>
          <span class="meter"><span class="fill" style:width="100%"></span></span>
          <span class="bar-num">≈ {fmtTokens(dump.tokens)} tokens</span>
        </div>
        {#if replay}
          <div class="bar-row">
            <span class="bar-label">The answer</span>
            <span class="meter"><span class="fill ans" style:width="{Math.max(answerPct, 0.4)}%"></span></span>
            <span class="bar-num">≈ {fmtInt(replay.totals.answerTokens)} tokens</span>
          </div>
        {/if}
      </div>
    {/if}

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

  <aside class="t-panel strip" class:has-unit={!!unit} aria-label="Inspector" aria-live="polite">
    {#if unit}
      <div class="s-pod">
        <div class="insp-head">
          <div class="insp-title">
            <h2 class="insp-name">{unit.name}</h2>
            <span class="insp-where">{unit.groupName} · {unitGroup?.subscriptionName} · {unitGroup?.location}</span>
          </div>
          {#if pinnedId}
            <button type="button" class="t-btn sm" onclick={() => (pinnedId = null)} title="Escape also unpins">
              <X size={14} /> Unpin
            </button>
          {:else}
            <span class="t-chip" title="Click the pod to keep it here">preview</span>
          {/if}
        </div>
        <UnitCard {unit} {model} dense />
      </div>

      <div class="s-reps">
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
          <p class="rep-source">{repText.source} · tokens ≈ characters ÷ 4 · indented here, sent compact</p>
          <pre class="t-json rep-text" class:fade={activeRep === 'estate'}>{repText.display}</pre>
        {/if}
      </div>
    {:else}
      <div class="s-how">
        <h2 class="t-h2">Point at a pod</h2>
        <p class="how">Hover or arrow-key to inspect it. Click to pin, Esc to let go. Keys 1 to 6 switch the view.</p>
      </div>
      <ul class="glyphs" aria-label="What the shapes mean">
        <li><span class="g g-vm" style:background={TYPE_COLOR.virtualMachine}></span><span><strong>Square</strong> a virtual machine</span></li>
        <li><span class="g g-nic" style:background={TYPE_COLOR.networkInterface}></span><span><strong>Circle</strong> its network interface</span></li>
        <li><span class="g g-pip" style:background={TYPE_COLOR.publicIp}></span><span><strong>Small square</strong> its public IP, dashed if none</span></li>
        <li><span class="g g-disk" style:background={TYPE_COLOR.disk}></span><span><strong>Bars</strong> its disks</span></li>
        <li><span class="g g-loose" style:background={TYPE_COLOR.storageAccount}></span><span><strong>Loose squares</strong> storage, SQL, app services</span></li>
      </ul>
      <div class="tiles">
        <StatTile label="Resources" value={fmtInt(model.totals.resources)} />
        <StatTile label="VMs" value={fmtInt(model.totals.vms)} />
        <StatTile label="Groups" value={fmtInt(model.totals.groups)} sub="{model.totals.subscriptions} subscriptions" />
        <StatTile label="Per month" value={'$' + fmtInt(Math.round(model.totals.costMonthly))} />
      </div>
    {/if}
  </aside>
</div>

<style>
  /* One screen: everything above the foot is sized so a 1512 x 945 viewport shows it all. */
  .screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--tour-gap);
    min-width: 0;
  }
  .big {
    font-family: var(--font-mono);
    color: var(--color-brand);
    font-size: 1.1em;
  }

  /* ── header + toolbar ───────────────────────────────────────────── */
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    min-width: 0;
  }
  .top-text {
    min-width: 0;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 22px;
    padding: 6px 12px;
    position: relative;
  }
  .ctl {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ctl-label {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .prompt {
    margin-left: auto;
    font-size: 13px;
  }
  .prompt summary {
    cursor: pointer;
    font-weight: 650;
    color: var(--color-brand);
    width: fit-content;
    padding: 3px 6px;
    border-radius: 7px;
  }
  .prompt summary:hover {
    background: var(--color-brand-bg);
  }
  .prompt blockquote {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    width: min(620px, 92vw);
    margin: 0;
    padding: 10px 14px;
    border: 1px solid var(--color-brand);
    border-left-width: 3px;
    background: var(--color-brand-bg);
    border-radius: 0 10px 10px 0;
    color: var(--color-text-secondary);
    font-size: 14px;
    line-height: 1.5;
  }

  /* ── map ────────────────────────────────────────────────────────── */
  .map-panel {
    padding: 10px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }
  .lg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px 2px 6px;
    border-radius: 999px;
    border: 1px solid var(--color-border-default);
    background: white;
    font-size: 12.5px;
    color: var(--color-text-secondary);
    transition: border-color 0.12s, background 0.12s;
  }
  button.lg:hover,
  .lg[data-active='true'] {
    border-color: var(--color-text-secondary);
    background: var(--color-hover-bg);
  }
  .sw {
    width: 11px;
    height: 11px;
    border-radius: 3px;
    flex: none;
    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.12);
  }
  .lg-num {
    font-family: var(--font-mono);
    font-size: 13.5px;
    font-weight: 800;
    color: var(--color-text-primary);
  }
  .lg-label {
    font-weight: 550;
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 176px minmax(0, 1fr) 140px;
    align-items: center;
    gap: 12px;
  }
  .bar-label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 650;
    line-height: 1.25;
    color: var(--color-text-secondary);
  }
  .meter {
    height: 10px;
    border-radius: 4px;
    background: var(--color-border-subtle);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: #6366f1;
    border-radius: 4px;
    transition: width 0.4s ease;
  }
  .fill.ans {
    background: #059669;
  }
  .bar-num {
    font-family: var(--font-mono);
    font-size: 13.5px;
    font-weight: 800;
  }

  /* ── detail strip ───────────────────────────────────────────────── */
  .strip {
    flex: 1 1 auto;
    min-height: 176px;
    max-height: 420px;
    overflow: auto;
    padding: 12px 16px;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr) minmax(0, 1.25fr);
    grid-template-rows: minmax(min-content, 1fr);
    align-items: center;
    gap: 10px 32px;
  }
  .strip.has-unit {
    grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.5fr);
    align-items: stretch;
  }
  .s-how {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .how {
    margin: 0;
    font-size: 15px;
    line-height: 1.45;
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
    grid-template-columns: 30px 1fr;
    align-items: center;
    gap: 8px;
  }
  .g {
    justify-self: center;
  }
  .g-vm {
    width: 17px;
    height: 17px;
    border-radius: 3px;
  }
  .g-nic {
    width: 13px;
    height: 13px;
    border-radius: 50%;
  }
  .g-pip {
    width: 11px;
    height: 11px;
    border-radius: 2px;
  }
  .g-disk {
    width: 24px;
    height: 6px;
    border-radius: 2px;
  }
  .g-loose {
    width: 15px;
    height: 15px;
    border-radius: 4px;
  }
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 16px;
    align-content: start;
    padding: 14px 18px;
    border: 1px solid var(--color-border-default);
    border-radius: 10px;
    background: white;
  }

  .s-pod,
  .s-reps {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .insp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .insp-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    flex-wrap: wrap;
  }
  .insp-name {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .insp-where {
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .rep-tabs {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .rep-tabs button {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 10px;
    border-radius: 9px;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rt-num {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 800;
    color: var(--color-text-primary);
  }
  .rep-source {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }
  /* Starts from zero so its text never inflates the strip: it only takes what is spare. */
  .rep-text {
    flex: 1 1 0;
    min-height: 84px;
    max-height: 260px;
  }
  .rep-text.fade {
    -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent);
    mask-image: linear-gradient(to bottom, black 70%, transparent);
  }

  @media (max-width: 1100px) {
    .strip,
    .strip.has-unit {
      grid-template-columns: minmax(0, 1fr);
      max-height: none;
    }
  }
  @media (max-height: 800px) {
    .map-panel {
      padding: 8px 12px 10px;
      gap: 6px;
    }
    .strip {
      padding: 10px 14px;
    }
  }
</style>
