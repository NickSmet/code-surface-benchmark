<script lang="ts">
  import { AppWindow, Box, Database, Globe, HardDrive, Network, Server } from '@lucide/svelte';
  import type { EstateMember, EstateModel, EstateUnit, MemberRole } from '$lib/tour/estate';
  import { ROLE_LABEL, factOf } from '$lib/tour/facts';
  import { KIND_LABEL } from '$lib/tour/paint';
  import { TOUCH_KINDS, type MarkSet, type TouchKind } from '$lib/tour/touch';
  import { fmtUsd } from '$lib/utils';

  interface Props {
    unit: EstateUnit;
    model: EstateModel;
    /** When given, each row shows how it was touched (or that it was not). */
    marks?: MarkSet | null;
    /** Mark chips from this step as "just happened". */
    currentStep?: number;
    /** Show a second line with the resource's key facts (size, IP, SKU). */
    facts?: boolean;
    /** Tighter rows, for a strip rather than a sidebar. */
    dense?: boolean;
  }
  let { unit, model, marks = null, currentStep, facts = false, dense = false }: Props = $props();

  const ICON = { vm: Server, nic: Network, pip: Globe, osDisk: HardDrive, dataDisk: HardDrive, storage: Box, sql: Database, app: AppWindow, other: Box };
  const INDENT: Partial<Record<MemberRole, number>> = { nic: 1, pip: 2, osDisk: 1, dataDisk: 1 };
  const TAG: Record<MemberRole, string> = {
    vm: 'VM',
    nic: 'NIC',
    pip: 'public IP',
    osDisk: 'OS disk',
    dataDisk: 'data disk',
    storage: 'storage',
    sql: 'SQL',
    app: 'app service',
    other: ''
  };
  const SHORT: Record<TouchKind, string> = { listed: 'summary', read: 'full read', scanned: 'scanned', written: 'changed' };

  function fieldsLine(fields: string[]): string {
    const shown = fields.slice(0, 6).join(', ');
    return fields.length > 6 ? `${shown} +${fields.length - 6}` : shown;
  }

  const rows = $derived(
    unit.members.map((m: EstateMember) => ({
      m,
      r: model.resourceById.get(m.id)!,
      mark: marks?.resources.get(m.id)
    }))
  );
</script>

<ul class="rows" class:dense>
  {#each rows as { m, r, mark } (m.id)}
    {@const Icon = ICON[m.role]}
    <li
      class="row"
      style:--indent={INDENT[m.role] ?? 0}
      data-untouched={marks && !mark ? 'true' : undefined}
      title="{ROLE_LABEL[m.role]} · {factOf(r)}"
    >
      <span class="ic" aria-hidden="true"><Icon size={15} strokeWidth={2.1} /></span>
      <span class="body">
        <span class="line">
          <span class="name">{m.name}</span>
          {#if TAG[m.role]}<span class="tag">{TAG[m.role]}</span>{/if}
        </span>
        {#if facts}<span class="fact">{factOf(r)}</span>{/if}
        {#if mark && mark.fields.length > 0}
          <span class="fields" title={mark.fields.join(', ')}>read: {fieldsLine(mark.fields)}</span>
        {/if}
      </span>
      <span class="side">
        {#if marks}
          <span class="chips">
            {#each TOUCH_KINDS as k (k)}
              {#if mark && mark[k] !== undefined}
                <span class="chip" data-kind={k} class:now={currentStep !== undefined && mark.steps.includes(currentStep)} title={KIND_LABEL[k]}>
                  {SHORT[k]}{#if k !== 'scanned'}&nbsp;{mark[k]}{/if}
                </span>
              {/if}
            {/each}
            {#if !mark}<span class="chip" data-kind="none">untouched</span>{/if}
          </span>
        {/if}
        {#if !marks}<span class="cost">{fmtUsd(r.costMonthly)}/mo</span>{/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 5px 9px;
    margin-left: calc(var(--indent, 0) * 16px);
    border: 1px solid var(--color-border-subtle);
    border-radius: 8px;
    background: white;
  }
  .row[data-untouched='true'] {
    background: transparent;
    border-style: dashed;
  }
  .dense {
    gap: 2px;
  }
  .dense .row {
    gap: 8px;
    padding: 2px 8px;
    margin-left: calc(var(--indent, 0) * 14px);
  }
  .dense .ic {
    width: 20px;
    height: 20px;
  }
  .dense .name {
    font-size: 13px;
  }
  .ic {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: var(--color-border-subtle);
    color: var(--color-text-secondary);
  }
  .body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .line {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
  }
  .name {
    font-family: var(--font-mono);
    font-size: 13.5px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-size: 12px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .fact {
    font-size: 12.5px;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fields {
    font-family: var(--font-mono);
    font-size: 12px;
    color: #0f766e;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .side {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .cost {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
  }
  .chip {
    font-size: 12px;
    font-weight: 650;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .chip[data-kind='listed'] {
    background: #e6e8fe;
    color: #4338ca;
    border-color: #bfc4fa;
  }
  .chip[data-kind='read'] {
    background: #6366f1;
    color: white;
  }
  .chip[data-kind='scanned'] {
    background: #ccfbf1;
    color: #0f766e;
    border-color: #0d9488;
  }
  .chip[data-kind='written'] {
    background: #059669;
    color: white;
  }
  .chip[data-kind='none'] {
    background: transparent;
    color: var(--color-text-dim);
    border-color: var(--color-border-default);
    font-weight: 500;
  }
  .chip.now {
    box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.18);
  }
</style>
