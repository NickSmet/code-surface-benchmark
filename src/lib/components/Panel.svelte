<script lang="ts">
  import { ChevronRight, Layers, Wrench } from '@lucide/svelte';
  import type { PanelState, TranscriptItem } from '$lib/client/panel.svelte';
  import type { ChangeRow } from '$lib/inventory/projection';
  import { fmtMs } from '$lib/utils';
  import { renderMarkdown } from '$lib/markdown';
  import ToolCard from './ToolCard.svelte';
  import DiffView from './DiffView.svelte';

  interface Props {
    panel: PanelState;
  }
  let { panel }: Props = $props();

  let tag = $derived(panel.surface === 'catalog' ? 'per-resource tool catalog' : 'code · projected object');
  const phaseLabel: Record<string, string> = {
    thinking: 'reasoning',
    calling: 'running tools',
    done: 'done',
    '': 'idle'
  };

  // ── Transcript blocks: collapse long runs of same-name tool calls ────────
  // A bulk write on the catalog is ~35 near-identical calls; rendering each
  // one (plus its diff card) makes the panel a scroll nightmare. Consecutive
  // calls to the same tool fold into one stack with an aggregated change set.
  type ToolItem = Extract<TranscriptItem, { kind: 'tool' }>;
  type Block =
    | { kind: 'single'; key: string; item: TranscriptItem }
    | { kind: 'group'; key: string; groupKey: number; name: string; items: ToolItem[] };

  const GROUP_MIN = 4;

  let blocks = $derived.by<Block[]>(() => {
    const out: Block[] = [];
    let msgIdx = 0;
    let run: ToolItem[] = [];
    const flush = (): void => {
      if (run.length >= GROUP_MIN) {
        out.push({ kind: 'group', key: `g${run[0].seq}`, groupKey: run[0].seq, name: run[0].name, items: run });
      } else {
        for (const item of run) out.push({ kind: 'single', key: `t${item.seq}`, item });
      }
      run = [];
    };
    for (const item of panel.items) {
      if (item.kind === 'tool') {
        if (run.length > 0 && run[0].name !== item.name) flush();
        run.push(item);
      } else {
        flush();
        out.push({ kind: 'single', key: `m${msgIdx++}`, item });
      }
    }
    flush();
    return out;
  });

  let expanded = $state<Record<number, boolean>>({});

  function groupDiff(items: ToolItem[]): ChangeRow[] {
    return items.flatMap((i) => i.diff ?? []);
  }
  function groupPending(items: ToolItem[]): ToolItem[] {
    return items.filter((i) => i.approval === 'pending');
  }
  function groupBusy(items: ToolItem[]): boolean {
    return items.some((i) => !i.done && i.approval !== 'pending');
  }
</script>

<section class="panel" data-surface={panel.surface}>
  <header class="panel-head">
    <span class="ptitle">{panel.label}</span>
    <span class="ptag">{tag}</span>
    <span class="spacer"></span>
    <span class="phase" data-running={panel.status === 'running'}>
      <span class="pulse"></span>
      {phaseLabel[panel.phase] ?? panel.phase}
      {#if panel.metrics.elapsedMs > 0}· {fmtMs(panel.metrics.elapsedMs)}{/if}
    </span>
  </header>

  <div class="panel-body">
    {#if panel.items.length === 0 && panel.status === 'idle'}
      <div class="empty-state">
        Pick a task in the header or type a prompt below.<br />Both panels run the same task against the same model — only the surface differs.
      </div>
    {/if}

    {#each blocks as block (block.key)}
      {#if block.kind === 'single'}
        {#if block.item.kind === 'tool'}
          <ToolCard item={block.item} onDecision={(seq, d) => panel.decide(seq, d)} />
        {:else if block.item.kind === 'assistant'}
          <div class="chat-msg" data-role="assistant">
            <div class="bubble md">{@html renderMarkdown(block.item.text)}</div>
          </div>
        {:else if block.item.kind === 'error'}
          <div class="run-error">{block.item.message}</div>
        {/if}
      {:else}
        {@const diff = groupDiff(block.items)}
        {@const pending = groupPending(block.items)}
        {@const isOpen = expanded[block.groupKey] ?? false}
        <div class="tool-group">
          <button class="tg-head" data-open={isOpen} type="button" onclick={() => (expanded[block.groupKey] = !isOpen)}>
            <span class="tg-badge"><Layers size={11} /> ×{block.items.length}</span>
            <Wrench size={13} />
            <span class="tg-name">{block.name}</span>
            <span class="tg-summary">
              #{block.items[0].seq}–#{block.items[block.items.length - 1].seq}
              {#if diff.length > 0}
                · {diff.length} field changes
              {/if}
            </span>
            {#if groupBusy(block.items)}
              <span class="thinking"><i></i><i></i><i></i></span>
            {/if}
            <ChevronRight class="chev" size={13} />
          </button>
          {#if isOpen}
            <div class="tg-items">
              {#each block.items as item (item.seq)}
                <ToolCard {item} showDiff={false} onDecision={(seq, d) => panel.decide(seq, d)} />
              {/each}
            </div>
          {:else}
            {#each pending as item (item.seq)}
              <div class="tg-pending">
                <ToolCard {item} onDecision={(seq, d) => panel.decide(seq, d)} />
              </div>
            {/each}
          {/if}
          {#if diff.length > 0 && pending.length === 0}
            <DiffView {diff} title={block.items.every((i) => i.approval === 'declined') ? 'Change set (declined)' : 'Change set (applied)'} />
          {/if}
        </div>
      {/if}
    {/each}

    {#if panel.status === 'running' && panel.phase === 'thinking' && panel.items.length === 0}
      <div class="thinking"><i></i><i></i><i></i></div>
    {/if}
  </div>
</section>
