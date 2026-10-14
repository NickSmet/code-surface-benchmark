<script lang="ts">
  import type { StageCard } from '$lib/tour/strain-stage';
  import { fmtTokens } from '$lib/tour/tokens';

  interface Props {
    card: StageCard;
    /** Which side of the fix the card is on. */
    tone?: 'problem' | 'fix';
  }
  let { card, tone = 'problem' }: Props = $props();

  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** The text in runs, each marked or not: the marked ones are what the model copies from one card to the next. */
  function runs(text: string, marks: string[]): Array<{ text: string; marked: boolean }> {
    const found = [...new Set(marks)].filter(Boolean);
    if (!found.length) return [{ text, marked: false }];
    return text
      .split(new RegExp(`(${found.map(escape).join('|')})`, 'g'))
      .filter(Boolean)
      .map((t) => ({ text: t, marked: found.includes(t) }));
  }
</script>

{#snippet marked(text: string)}
  {#each runs(text, card.marks) as r}{#if r.marked}<mark>{r.text}</mark>{:else}{r.text}{/if}{/each}
{/snippet}

{#if card.kind === 'more' || card.kind === 'same'}
  <article class="card more" class:same={card.kind === 'same'} class:fix={tone === 'fix'}>
    <p class="more-title">{card.title}</p>
    <p class="more-what">{card.args}</p>
  </article>
{:else}
  <article class="card" class:sum={card.kind === 'sum'} class:fix={tone === 'fix'}>
    <p class="name">{card.title}</p>
    <pre class="args">{@render marked(card.args)}</pre>
    {#if card.result}
      <pre class="result">{@render marked(card.result)}</pre>
    {/if}
    <p class="foot">
      {#if card.kind === 'sum'}
        <span class="no-tool">no tool does this</span>
      {/if}
      {#if card.turn !== null}<span>turn {card.turn}</span>{/if}
      <!-- A turn's request is what grows down a chain, so it is the figure there; elsewhere it is what the call cost to write. -->
      {#if card.sent !== null}
        <span>sent {fmtTokens(card.sent)} tok</span>
      {:else if card.wrote !== null}
        <span>wrote {card.wrote} tok</span>
      {/if}
    </p>
  </article>
{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 1 0;
    min-width: 0;
    padding: 7px 9px;
    border: 1px solid #f1d5a0;
    border-radius: 9px;
    background: white;
    font-family: var(--font-mono);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
  }
  .card.fix {
    border-color: #b6d4f0;
  }
  .name {
    margin: 0;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--color-text-primary);
  }
  pre {
    margin: 0;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .args {
    color: var(--color-text-secondary);
  }
  .result {
    padding-top: 5px;
    border-top: 1px dashed var(--color-border-default);
    color: var(--color-text-muted);
  }
  .result::before {
    content: '\2192 ';
    color: var(--color-text-dim);
  }
  /* an id or a figure is never split across lines: the line breaks before it instead */
  mark {
    padding: 0 2px;
    border-radius: 3px;
    background: #fde68a;
    color: #78350f;
    white-space: nowrap;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    margin: auto 0 0;
    padding-top: 2px;
    font-size: 11px;
    color: var(--color-text-dim);
  }
  /* the model adding up the figures: there is no call, so it is drawn as the model's own reply */
  .card.sum {
    border-style: dashed;
    background: #fffdf6;
  }
  .card.sum .name {
    color: #92400e;
  }
  .no-tool {
    font-weight: 700;
    color: #b45309;
  }

  /* the rest of the calls, as a tile */
  .card.more {
    flex: 0 0 118px;
    align-items: center;
    justify-content: center;
    gap: 3px;
    text-align: center;
    border-style: dashed;
    background: transparent;
    font-family: var(--font-sans, inherit);
  }
  .more-title {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
    color: var(--color-text-secondary);
  }
  /* a call the fix keeps as it was: its name, small */
  .card.same .more-title {
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .more-what {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.3;
    color: var(--color-text-muted);
  }
</style>
