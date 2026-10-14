<script lang="ts">
  import { Maximize2 } from '@lucide/svelte';
  import FlowLine from './FlowLine.svelte';
  import JsonView from './JsonView.svelte';
  import { prettyJson } from '$lib/tour/json-highlight';
  import type { ReplayCall } from '$lib/tour/replay';
  import type { TurnFlow } from '$lib/tour/replay-view';

  interface Props {
    call: ReplayCall;
    /** One sentence about what the call did to the estate. */
    summary: string;
    /** The replay is on this call, as opposed to a call looked at while the replay is elsewhere. */
    now: boolean;
    /** What the call's turn read and wrote. */
    flow: TurnFlow;
    /** Open the whole result. */
    onexpand: () => void;
  }
  let { call, summary, now, flow, onexpand }: Props = $props();

  const text = $derived(prettyJson(call.content));
</script>

<div class="detail">
  <div class="head">
    <span class="num" class:now>{call.step}</span>
    <span class="tool">{call.name}</span>
    <span class="args" title={call.argsText}>{call.argsText}</span>
    <button type="button" class="t-btn sm expand" onclick={onexpand} title="Open the whole result">
      <Maximize2 size={13} /> Expand
    </button>
  </div>
  <p class="sum">{summary}</p>
  <FlowLine {flow} result={call.resultSentTokens} />
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
  .expand {
    flex: none;
    margin-left: auto;
    padding: 3px 9px;
  }
  .sum {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-secondary);
  }
</style>
