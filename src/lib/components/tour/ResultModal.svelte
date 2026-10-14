<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Copy, X } from '@lucide/svelte';
  import JsonView from './JsonView.svelte';
  import { fmtTokens } from '$lib/tour/tokens';
  import { fmtInt } from '$lib/utils';

  interface Props {
    /** Position of the call in the run. */
    step: number;
    /** The tool that was called. */
    title: string;
    /** The call's arguments, as one line. */
    subtitle?: string;
    /** The whole result, indented for reading. */
    text: string;
    /** What the model actually receives: the compact text, in characters and in tokens. */
    chars: number;
    tokens: number;
    /** What the result costs each time it is read again: the same text wrapped in its message. */
    counted: number;
    /** Called once the dialog has closed, however it was closed. */
    onclose: () => void;
  }
  let { step, title, subtitle = '', text, chars, tokens, counted, onclose }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  // A modal dialog traps focus, closes on Escape and makes the page behind it inert.
  onMount(() => {
    dialog?.showModal();
    return () => clearTimeout(timer);
  });

  function close(): void {
    dialog?.close();
  }
  // A click that lands on the backdrop reports the dialog itself as its target.
  function onbackdrop(e: MouseEvent): void {
    if (e.target === dialog) close();
  }
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 1600);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  }
</script>

<!-- Escape already closes a modal dialog; the backdrop click is a pointer convenience. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} aria-labelledby="result-title" {onclose} onclick={onbackdrop}>
  <header class="head">
    <div class="titles">
      <h2 class="title" id="result-title">
        <span class="num">{step}</span>
        <span class="tool">{title}</span>
        <span class="what">result</span>
      </h2>
      {#if subtitle}<p class="sub" title={subtitle}>{subtitle}</p>{/if}
    </div>
    <button type="button" class="t-btn sm" onclick={copy}>
      {#if copied}<Check size={14} /> Copied{:else}<Copy size={14} /> Copy{/if}
    </button>
    <button type="button" class="t-btn sm icon" aria-label="Close" onclick={close}><X size={15} /></button>
  </header>
  <div class="body">
    <JsonView {text} label="Full result of step {step}, {title}" />
  </div>
  <footer class="foot">
    Indented here to read. The model gets it compact: {fmtInt(chars)} characters, about {fmtTokens(tokens)} tokens.
    Wrapped in its message, it counts as about {fmtTokens(counted)} tokens each time it is read again.
  </footer>
  <span class="t-sr" role="status">{copied ? 'Copied to the clipboard' : ''}</span>
</dialog>

<style>
  dialog {
    /* The page's CSS reset zeroes every margin, which also removes the `auto` that centres a modal. */
    margin: auto;
    padding: 0;
    border: 1px solid var(--color-border-strong);
    border-radius: 14px;
    width: min(1040px, calc(100vw - 48px));
    /* As tall as the result, up to the screen: a short result does not sit in a huge empty box. */
    height: fit-content;
    max-width: none;
    max-height: min(820px, calc(100dvh - 48px));
    background: white;
    color: var(--color-text-primary);
    box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
    overflow: hidden;
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  dialog::backdrop {
    background: rgba(15, 23, 42, 0.5);
  }
  .head {
    flex: none;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 14px 10px 16px;
    border-bottom: 1px solid var(--color-border-default);
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 16px;
  }
  .num {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--color-brand);
    color: white;
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-weight: 800;
  }
  .tool {
    font-family: var(--font-mono);
    font-weight: 800;
  }
  .what {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .sub {
    margin: 4px 0 0;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-text-muted);
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .body {
    flex: 0 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 12px 14px;
  }
  /* The result is as tall as its text; only when the dialog hits the screen does it scroll. */
  .body :global(.json) {
    flex: 0 1 auto;
  }
  .foot {
    flex: none;
    padding: 8px 16px 11px;
    border-top: 1px solid var(--color-border-subtle);
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  @media (max-width: 700px) {
    dialog {
      width: 100vw;
      max-height: 100dvh;
      border-radius: 0;
    }
  }
</style>
