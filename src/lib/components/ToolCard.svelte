<script lang="ts">
  import { Check, ChevronRight, Code2, Wrench, TriangleAlert, X } from '@lucide/svelte';
  import type { TranscriptItem } from '$lib/client/panel.svelte';
  import type { ApprovalDecision } from '$lib/agent/sse-protocol';
  import DiffView from './DiffView.svelte';

  interface Props {
    item: Extract<TranscriptItem, { kind: 'tool' }>;
    /** Set false when a group renders one aggregated diff instead. */
    showDiff?: boolean;
    /** Review mode: answer a pending approval ('all' = approve the rest). */
    onDecision?: (seq: number | 'all', decision: ApprovalDecision) => void;
  }
  let { item, showDiff = true, onDecision }: Props = $props();

  let isCode = $derived(item.name === 'operate_inventory');
  let open = $state(false);
</script>

<div class="tool-card" data-error={item.error ? 'true' : 'false'} data-approval={item.approval ?? ''}>
  <button class="head" data-open={open} onclick={() => (open = !open)} type="button">
    <span class="seq">#{item.seq}</span>
    {#if item.error}
      <TriangleAlert size={13} />
    {:else if isCode}
      <Code2 size={13} />
    {:else}
      <Wrench size={13} />
    {/if}
    <span class="name">{item.name}</span>
    <span class="summary">
      {#if item.done}
        {item.resultPreview ?? ''}
      {:else}
        {item.argsPreview}
      {/if}
    </span>
    {#if item.approval === 'approved'}
      <span class="approval-badge" data-kind="approved"><Check size={10} /> approved</span>
    {:else if item.approval === 'declined'}
      <span class="approval-badge" data-kind="declined"><X size={10} /> declined</span>
    {:else if item.approval === 'pending'}
      <span class="approval-badge" data-kind="pending">awaiting review</span>
    {/if}
    {#if !item.done && item.approval !== 'pending'}
      <span class="thinking"><i></i><i></i><i></i></span>
    {/if}
    <ChevronRight class="chev" size={13} />
  </button>

  {#if open}
    <div class="body">
      {#if item.code}
        <div>
          <div class="label">code</div>
          <pre class="code">{item.code}</pre>
        </div>
      {:else}
        <div>
          <div class="label">arguments</div>
          <pre class="result">{item.argsPreview}</pre>
        </div>
      {/if}
      {#if item.done && item.resultPreview}
        <div>
          <div class="label">{item.error ? 'error' : 'result'}</div>
          <pre class="result">{item.resultPreview}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if item.diff && item.diff.length > 0 && (showDiff || item.approval === 'pending')}
  <DiffView
    diff={item.diff}
    title={item.approval === 'pending'
      ? 'Proposed change set'
      : item.approval === 'declined'
        ? 'Change set (declined)'
        : 'Change set (applied)'}
  />
{/if}

{#if item.approval === 'pending'}
  <div class="approval-bar">
    <span class="ab-label">Run paused — the surface is asking for approval of this change set.</span>
    <button class="btn approve" onclick={() => onDecision?.(item.seq, 'approved')}><Check size={13} /> Approve</button>
    <button class="btn" onclick={() => onDecision?.('all', 'approved')}>Approve rest</button>
    <button class="btn danger-ghost" onclick={() => onDecision?.(item.seq, 'declined')}><X size={13} /> Decline</button>
  </div>
{/if}
