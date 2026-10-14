<script lang="ts">
  import { Maximize2 } from '@lucide/svelte';
  import JsonView from './JsonView.svelte';
  import { prettyJson } from '$lib/tour/json-highlight';
  import type { ReplayCall } from '$lib/tour/replay';
  import { fmtTokens } from '$lib/tour/tokens';

  interface Props {
    call: ReplayCall;
    /** One sentence about what the call did to the estate. */
    summary: string;
    /** The replay is on this call, as opposed to a call looked at while the replay is elsewhere. */
    now: boolean;
    /** How the turn's request was made up. */
    sent: { total: number; cached: number; fresh: number };
    /** Open the whole result. */
    onexpand: () => void;
  }
  let { call, summary, now, sent, onexpand }: Props = $props();

  const text = $derived(prettyJson(call.content));
  const sentLine = $derived(
    sent.cached === 0
      ? `Sent ${fmtTokens(sent.total)} tokens, none cached yet`
      : `Sent ${fmtTokens(sent.total)} \u00b7 ${fmtTokens(sent.cached)} cached \u00b7 ${fmtTokens(sent.fresh)} new`
  );
</script>

<div class="detail">
  <div class="head">
    <span class="num" class:now>{call.step}</span>
    <span class="tool">{call.name}</span>
    <span class="args" title={call.argsText}>{call.argsText}</span>
    <span class="tok" title="Tokens this result adds to the conversation">+{fmtTokens(call.resultTokens)} tokens</span>
    <button type="button" class="t-btn sm expand" onclick={onexpand} title="Open the whole result">
      <Maximize2 size={13} /> Expand
    </button>
  </div>
  <p class="sum">
    <span class="what">{summary}</span>
    <span
      class="sent"
      title="Everything the model reads on this turn. Cached text is identical to the previous request, so a provider with prompt caching can reuse it. The totals on this page assume no caching."
    >{sentLine}</span>
  </p>
  <JsonView {text} label="Result of step {call.step}, {call.name}" maxLines={200} onmore={onexpand} />
</div>

<style>
  .detail {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    min-width: 0;
  }
  .num {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #e6e8fe;
    color: #4338ca;
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-weight: 800;
  }
  .num.now {
    background: var(--color-brand);
    color: white;
  }
  .tool {
    flex: none;
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 800;
  }
  .args {
    /* Wants about this much; when the row is too narrow the size and the button wrap to a second line. */
    flex: 1 1 96px;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tok {
    flex: none;
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 700;
    color: #4338ca;
  }
  .expand {
    flex: none;
    margin-left: auto;
    padding: 3px 9px;
  }
  .sum {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 2px 14px;
    font-size: 13px;
    color: var(--color-text-secondary);
  }
  .sent {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
    cursor: help;
  }
</style>
