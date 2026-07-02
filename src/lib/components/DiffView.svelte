<script lang="ts">
  import type { ChangeRow } from '$lib/inventory/projection';

  interface Props {
    diff: ChangeRow[];
    /** 'Proposed change set' while awaiting review, 'Change set (applied)' once live, etc. */
    title?: string;
  }
  let { diff, title = 'Change set' }: Props = $props();

  const LIMIT = 12;
  let showAll = $state(false);
  let rows = $derived(showAll ? diff : diff.slice(0, LIMIT));

  function fmt(v: unknown): string {
    if (v === null || v === undefined) return '∅';
    return typeof v === 'string' ? v : JSON.stringify(v);
  }
</script>

<div class="diff-card">
  <div class="diff-title">
    {title}
    <span class="diff-count">· {diff.length} field change{diff.length === 1 ? '' : 's'} across {new Set(diff.map((d) => d.resourceId)).size} resource{new Set(diff.map((d) => d.resourceId)).size === 1 ? '' : 's'}</span>
  </div>
  {#each rows as row (row.resourceId + row.field)}
    <div class="diff-row">
      <div class="path">
        <span class="op" data-op={row.op}>{row.op}</span>
        {row.resourceName}<span style="color:var(--color-text-dim)">.{row.field}</span>
      </div>
      <div class="vals">
        {#if row.op === 'edit'}
          <span class="old">{fmt(row.before)}</span>→ <span class="new">{fmt(row.after)}</span>
        {:else if row.op === 'add'}
          <span class="new">{fmt(row.after)}</span>
        {:else}
          <span class="old">{fmt(row.before)}</span>
        {/if}
      </div>
    </div>
  {/each}
  {#if diff.length > LIMIT}
    <button class="btn" style="align-self:flex-start;margin-top:6px" onclick={() => (showAll = !showAll)}>
      {showAll ? 'Show less' : `Show all ${diff.length}`}
    </button>
  {/if}
</div>
