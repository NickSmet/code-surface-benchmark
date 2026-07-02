<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, RotateCcw, Square } from '@lucide/svelte';
  import { TASKS, type BenchTask } from '$lib/tasks';
  import { PanelState, type TranscriptItem } from '$lib/client/panel.svelte';
  import type { SurfaceId } from '$lib/agent/sse-protocol';
  import { fmtInt } from '$lib/utils';
  import SurfaceLane from '$lib/components/presentation/SurfaceLane.svelte';
  import OutcomeRail from '$lib/components/presentation/OutcomeRail.svelte';
  import InventorySidebar from '$lib/components/presentation/InventorySidebar.svelte';

  type ToolItem = Extract<TranscriptItem, { kind: 'tool' }>;

  type Info = {
    provider: { label: string; model: string; isStub: boolean };
    inventory: {
      resourceCount: number;
      groupCount: number;
      subscriptionCount: number;
      generatedAt: string;
      resourceGroups: Array<{ name: string; subscriptionId: string; subscriptionName: string; location: string }>;
      resources: Array<{
        id: string;
        name: string;
        type: string;
        resourceGroup: string;
        subscriptionId: string;
        parentVmId?: string | null;
      }>;
    };
  };

  const catalog = new PanelState('catalog', 'Tool Catalog');
  const code = new PanelState('code', 'Code Surface');

  let input = $state('');
  let running = $state(false);
  let taskLabel = $state('');
  let selectedTaskId = $state<string | null>(null);
  let info = $state<Info | null>(null);
  let abort: AbortController | null = null;
  let activeSurface = $state<SurfaceId>('catalog');
  let selectedSeqBySurface = $state<Record<SurfaceId, number | null>>({ catalog: null, code: null });

  let activePanel = $derived(activeSurface === 'catalog' ? catalog : code);
  let selectedTask = $derived(selectedTaskId ? TASKS.find((task) => task.id === selectedTaskId) : undefined);
  let selectedSeq = $derived(selectedSeqBySurface[activeSurface]);
  let activeTool = $derived.by<ToolItem | null>(() => {
    if (selectedSeq == null) return null;
    return activePanel.items.find((item): item is ToolItem => item.kind === 'tool' && item.seq === selectedSeq) ?? null;
  });
  let activeTools = $derived.by<ToolItem[]>(() => {
    if (activeTool) return [activeTool];
    return activePanel.items.filter((item): item is ToolItem => item.kind === 'tool');
  });

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
    const id = new URLSearchParams(location.search).get('run');
    const task = id ? TASKS.find((t) => t.id === id) : undefined;
    if (task) void runBoth(task.prompt, task.label, task.id);
  });

  async function runBoth(prompt: string, label: string, taskId: string | null): Promise<void> {
    if (running && abort) abort.abort();
    running = true;
    input = prompt;
    taskLabel = label;
    selectedTaskId = taskId;
    activeSurface = 'catalog';
    selectedSeqBySurface = { catalog: null, code: null };
    const ac = new AbortController();
    abort = ac;
    try {
      await Promise.all([catalog.run(prompt, ac.signal), code.run(prompt, ac.signal)]);
    } finally {
      if (abort === ac) {
        running = false;
        abort = null;
      }
    }
  }

  function selectTask(task: BenchTask): void {
    input = task.prompt;
    taskLabel = task.label;
    selectedTaskId = task.id;
  }

  function runInput(): void {
    const prompt = input.trim();
    if (!prompt) return;
    const label = selectedTask && prompt === selectedTask.prompt ? selectedTask.label : prompt.length > 54 ? `${prompt.slice(0, 53)}...` : prompt;
    void runBoth(prompt, label, selectedTask && prompt === selectedTask.prompt ? selectedTask.id : null);
  }

  function onPromptInput(e: Event): void {
    input = e.currentTarget instanceof HTMLInputElement ? e.currentTarget.value : '';
    if (selectedTask && input !== selectedTask.prompt) {
      selectedTaskId = null;
      taskLabel = '';
    }
  }

  function stop(): void {
    abort?.abort();
    running = false;
  }

  async function reseed(): Promise<void> {
    stop();
    catalog.reset();
    code.reset();
    taskLabel = '';
    selectedTaskId = null;
    activeSurface = 'catalog';
    selectedSeqBySurface = { catalog: null, code: null };
    try {
      const r = await fetch('/backend/info', { method: 'POST' });
      if (r.ok) info = (await r.json()) as Info;
    } catch {
      /* ignore */
    }
  }

  function selectLane(surface: SurfaceId): void {
    activeSurface = surface;
    selectedSeqBySurface = { ...selectedSeqBySurface, [surface]: null };
  }

  function selectTool(surface: SurfaceId, seq: number): void {
    activeSurface = surface;
    const current = selectedSeqBySurface[surface];
    selectedSeqBySurface = { ...selectedSeqBySurface, [surface]: current === seq ? null : seq };
  }

  function onPromptKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      runInput();
    }
  }
</script>

<svelte:head><title>Code Surface Demo</title></svelte:head>

<div class="demo-shell">
  <header class="demo-top">
    <div class="task-strip" aria-label="Preset tasks">
      {#each TASKS as task (task.id)}
        <button class:active={selectedTaskId === task.id} disabled={running} type="button" onclick={() => selectTask(task)}>
          {task.label}
        </button>
      {/each}
    </div>

    <div class="prompt-runner">
      <input value={input} oninput={onPromptInput} onkeydown={onPromptKey} placeholder="Select a task or type a custom prompt" />
      {#if running}
        <button class="btn danger-ghost action" type="button" onclick={stop}><Square size={14} /> Stop</button>
      {:else}
        <button class="btn primary action" type="button" onclick={runInput} disabled={!input.trim()}><Play size={14} /> Run</button>
      {/if}
      <button class="btn danger-ghost icon-action" type="button" onclick={reseed} title="Reseed inventory">
        <RotateCcw size={14} />
      </button>
    </div>

    {#if info}
      <div class="provider" data-stub={info.provider.isStub} title={info.provider.label}>
        <span class="dot"></span>
        <span>{info.provider.isStub ? 'stub' : info.provider.model}</span>
        <em>{fmtInt(info.inventory.resourceCount)} resources</em>
      </div>
    {/if}
  </header>

  <main class="demo-stage">
    <section class="demo-main">
      <div class="lane-grid">
        <SurfaceLane
          panel={catalog}
          active={activeSurface === 'catalog'}
          selectedSeq={selectedSeqBySurface.catalog}
          onSelectLane={selectLane}
          onSelectTool={selectTool}
        />
        <SurfaceLane
          panel={code}
          active={activeSurface === 'code'}
          selectedSeq={selectedSeqBySurface.code}
          onSelectLane={selectLane}
          onSelectTool={selectTool}
        />
      </div>

      <OutcomeRail {catalog} {code} taskLabel={taskLabel} />
    </section>

    <InventorySidebar
      resources={info?.inventory.resources ?? []}
      groups={info?.inventory.resourceGroups ?? []}
      {activeSurface}
      {activeTools}
      {activeTool}
      onSelectSurface={selectLane}
    />
  </main>
</div>

<style>
  .demo-shell {
    height: 100dvh;
    min-height: 720px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--color-page-bg);
    color: var(--color-text-primary);
    overflow: hidden;
  }

  .demo-top {
    display: grid;
    grid-template-columns: auto minmax(460px, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--color-border-default);
    background: var(--color-page-bg);
  }

  .task-strip {
    min-width: 0;
    display: flex;
    gap: 5px;
    overflow-x: auto;
    padding-bottom: 1px;
    max-width: 660px;
  }

  .task-strip button {
    flex: none;
    border: 1px solid var(--color-border-default);
    background: white;
    border-radius: 999px;
    padding: 5px 10px;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .task-strip button.active {
    background: var(--color-brand);
    border-color: var(--color-brand);
    color: white;
  }

  .task-strip button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .prompt-runner {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px;
  }

  .prompt-runner input {
    min-width: 0;
    height: 30px;
    border: 1px solid var(--color-border-default);
    border-radius: 7px;
    background: white;
    padding: 0 10px;
    font-size: 12px;
    outline: none;
  }

  .prompt-runner input:focus {
    border-color: var(--color-brand);
  }

  .prompt-runner .action {
    height: 28px;
    min-width: 68px;
    justify-content: center;
    padding-inline: 9px;
  }

  .icon-action {
    width: 28px;
    height: 28px;
    justify-content: center;
    padding: 0;
  }

  .provider {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    justify-self: end;
    border: 1px solid var(--color-border-default);
    background: var(--color-expanded-bg);
    border-radius: 999px;
    padding: 3px 8px;
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .provider .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--good);
  }

  .provider[data-stub="true"] .dot {
    background: var(--warn);
  }

  .provider em {
    font-style: normal;
    color: var(--color-text-dim);
  }

  .demo-stage {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .demo-main {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .lane-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  @media (max-width: 1180px) {
    .demo-top {
      grid-template-columns: 1fr auto;
    }

    .task-strip,
    .prompt-runner {
      grid-column: 1 / -1;
    }

    .provider {
      grid-column: 2;
      grid-row: 1;
    }

    .demo-stage {
      grid-template-columns: minmax(0, 1fr);
    }

    :global(.inventory-sidebar) {
      display: none;
    }
  }
</style>
