<script lang="ts">
  import { onMount } from 'svelte';
  import { RotateCcw, Play, ShieldCheck, Square } from '@lucide/svelte';
  import { TASKS, type BenchTask } from '$lib/tasks';
  import { PanelState } from '$lib/client/panel.svelte';
  import { checksForTask, factsFromDiffs } from '$lib/bench-checks';
  import type { GroundTruth } from '$lib/inventory/truth';
  import type { InventoryGroupTile, InventoryResourceTile } from '$lib/inventory/overview';
  import Panel from '$lib/components/Panel.svelte';
  import Scoreboard, { type Verdict } from '$lib/components/Scoreboard.svelte';
  import EstateModal from '$lib/components/EstateModal.svelte';
  import { fmtInt } from '$lib/utils';

  type Info = {
    provider: { label: string; model: string; isStub: boolean };
    inventory: {
      resourceCount: number;
      groupCount: number;
      subscriptionCount: number;
      generatedAt: string;
      resourceGroups: InventoryGroupTile[];
      resources: InventoryResourceTile[];
    };
    truth: GroundTruth;
  };

  const catalog = new PanelState('catalog', 'Tool Catalog');
  const code = new PanelState('code', 'Code Surface');

  let input = $state('');
  let running = $state(false);
  let hasRun = $state(false);
  let lastTaskLabel = $state('');
  let lastTaskId = $state<string | null>(null);
  let reviewMode = $state(false);
  let lastRunReviewed = $state(false);
  let info = $state<Info | null>(null);
  let estateOpen = $state(false);
  let abort: AbortController | null = null;

  async function loadInfo(): Promise<void> {
    try {
      const r = await fetch('/backend/info');
      if (r.ok) info = (await r.json()) as Info;
    } catch {
      /* offline */
    }
  }

  onMount(() => {
    void loadInfo();
    // Deep link: /?run=<taskId> auto-fires a task (handy for the talk / demos).
    const id = new URLSearchParams(location.search).get('run');
    const task = id ? TASKS.find((t) => t.id === id) : undefined;
    if (task) runTask(task);
  });

  async function runBoth(prompt: string, label: string, taskId: string | null): Promise<void> {
    if (running && abort) abort.abort();
    running = true;
    hasRun = true;
    lastTaskLabel = label;
    lastTaskId = taskId;
    lastRunReviewed = reviewMode;
    const ac = new AbortController();
    abort = ac;
    try {
      await Promise.all([catalog.run(prompt, ac.signal, reviewMode), code.run(prompt, ac.signal, reviewMode)]);
    } finally {
      if (abort === ac) {
        running = false;
        abort = null;
      }
    }
  }

  function runTask(task: BenchTask): void {
    input = task.prompt;
    void runBoth(task.prompt, task.label, task.id);
  }

  function runInput(): void {
    const t = input.trim();
    if (!t) return;
    // If the prompt is (still) a preset task verbatim, we can check ground truth.
    const preset = TASKS.find((task) => task.prompt === t);
    void runBoth(t, preset?.label ?? (t.length > 48 ? t.slice(0, 47) + '…' : t), preset?.id ?? null);
  }

  function stop(): void {
    abort?.abort();
    running = false;
  }

  async function reseed(): Promise<void> {
    stop();
    catalog.reset();
    code.reset();
    hasRun = false;
    lastTaskLabel = '';
    lastTaskId = null;
    try {
      const r = await fetch('/backend/info', { method: 'POST' });
      if (r.ok) info = (await r.json()) as Info;
    } catch {
      /* ignore */
    }
  }

  function onComposerKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runInput();
    }
  }

  // ── Ground-truth verdicts (same checks the bench harness runs) ──────────
  function verdictFor(panel: PanelState, taskId: string, truth: GroundTruth): Verdict {
    if (panel.status === 'running' || panel.status === 'idle') return { state: 'pending', failures: [] };
    const diffs = panel.items.flatMap((i) => (i.kind === 'tool' ? (i.diff ?? []) : []));
    const facts = factsFromDiffs(panel.status === 'done', panel.finalText ?? '', diffs);
    const failures = checksForTask(taskId, truth, facts)
      .filter((c) => !c.pass)
      .map((c) => (c.detail ? `${c.label} — ${c.detail}` : c.label));
    return { state: failures.length > 0 ? 'wrong' : 'correct', failures };
  }

  let verdicts = $derived.by(() => {
    if (!hasRun || !lastTaskId || !info?.truth) return null;
    return {
      catalog: verdictFor(catalog, lastTaskId, info.truth),
      code: verdictFor(code, lastTaskId, info.truth)
    };
  });

  let approvals = $derived(
    lastRunReviewed ? { c: catalog.approvalsRequested, k: code.approvalsRequested } : null
  );
</script>

<svelte:head><title>Code Surface Benchmark</title></svelte:head>

<div class="bench-shell">
  <header class="bench-header">
    <div class="title-block">
      <div class="title">From Tools to Code Surfaces</div>
      <div class="subtitle">Same model, same task, same data — two surfaces, side by side.</div>
    </div>

    <div class="task-pills">
      <span class="task-pills-label">Sample Tasks. Click to run:</span>
      {#each TASKS as task (task.id)}
        <div class="task-pill-wrap">
          <button class="task-pill" disabled={running} onclick={() => runTask(task)}>
            <span class="pill-dot" data-win={task.expect}></span>
            {task.label}
          </button>
          <div class="task-tip" role="tooltip">
            <div class="tip-head">
              <strong>{task.label}</strong>
              <span class="tip-expect" data-win={task.expect}>{task.expect === 'code' ? 'expected: code' : 'expected: catalog'}</span>
            </div>
            <p>{task.description}</p>
            <em>click runs it on both surfaces</em>
          </div>
        </div>
      {/each}
    </div>

    <span class="spacer"></span>

    {#if info}
      <button class="provider-chip clickable" onclick={() => (estateOpen = true)} title="Open the estate map">
        {fmtInt(info.inventory.resourceCount)} resources · {info.inventory.groupCount} groups · {info.inventory.subscriptionCount} subs
      </button>
      <span class="provider-chip" data-stub={info.provider.isStub} title={info.provider.label}>
        <span class="dot"></span>
        {info.provider.isStub ? 'offline stub (set OPENAI_API_KEY)' : info.provider.label}
      </span>
    {/if}

    <button class="btn danger-ghost" onclick={reseed} title="Regenerate the inventory and clear both panels">
      <RotateCcw size={14} /> Reseed
    </button>
  </header>

  <div class="controls">
    <div class="composer">
      <textarea
        bind:value={input}
        onkeydown={onComposerKey}
        placeholder="Ask the estate anything — e.g. 'Which storage accounts are not HTTPS-only?'  (Enter to run, Shift+Enter for newline)"
        rows="2"
      ></textarea>
      <button
        class="review-toggle"
        class:active={reviewMode}
        onclick={() => (reviewMode = !reviewMode)}
        disabled={running}
        title="Gate every change set behind an approval before it applies, like MCP elicitation. The catalog asks once per write call; the code surface asks once per run. Off: writes apply to this run's copy of the estate as the calls return."
      >
        <ShieldCheck size={14} />
        Review writes
        <span class="rt-state">{reviewMode ? 'on' : 'off'}</span>
      </button>
      {#if running}
        <button class="btn danger-ghost send" onclick={stop}><Square size={14} /> Stop</button>
      {:else}
        <button class="btn primary send" onclick={runInput} disabled={!input.trim()}><Play size={14} /> Run</button>
      {/if}
    </div>
  </div>

  <div class="compare-grid">
    <Panel panel={catalog} />
    <Scoreboard {catalog} {code} taskLabel={lastTaskLabel} {hasRun} {verdicts} {approvals} />
    <Panel panel={code} />
  </div>
</div>

{#if estateOpen && info}
  <EstateModal
    resources={info.inventory.resources}
    groups={info.inventory.resourceGroups}
    generatedAt={info.inventory.generatedAt}
    onClose={() => (estateOpen = false)}
  />
{/if}
