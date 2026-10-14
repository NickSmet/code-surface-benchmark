<script lang="ts">
  import { goto } from '$app/navigation';
  import { ArrowLeft, ArrowRight } from '@lucide/svelte';

  interface Link {
    href: string;
    label: string;
  }
  interface Props {
    /** The beat the screen is on. */
    at: number;
    /** One entry for each beat: the URL that shows it, and what the presenter is on there. */
    beats: ReadonlyArray<{ href: string; caption: string }>;
    /** Where Back goes from the first beat, and Next from the last: the screens on either side. */
    before?: Link;
    after?: Link;
    /** What the Next button says at a beat. The next beat's caption, if not given. */
    nextLabel?: (at: number) => string;
  }
  let { at, beats, before, after, nextLabel }: Props = $props();

  const last = $derived(beats.length - 1);
  const back = $derived(at > 0 ? { href: beats[at - 1].href, label: 'Back', inScreen: true } : before ? { ...before, inScreen: false } : null);
  const forward = $derived(
    at < last
      ? { href: beats[at + 1].href, label: nextLabel ? nextLabel(at) : beats[at + 1].caption, inScreen: true }
      : after
        ? { ...after, inScreen: false }
        : null
  );

  const go = (link: { href: string; inScreen: boolean } | null) => {
    if (link) void goto(link.href, link.inScreen ? { noScroll: true, keepFocus: true } : {});
  };

  const typing = (t: EventTarget | null): boolean =>
    t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
  const pressable = (t: EventTarget | null): boolean => t instanceof HTMLElement && ['A', 'BUTTON', 'SUMMARY'].includes(t.tagName);

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !pressable(e.target))) {
      e.preventDefault();
      go(forward);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      go(back);
    } else if (e.key === 'Home' && at > 0) {
      e.preventDefault();
      void goto(beats[0].href, { noScroll: true, keepFocus: true });
    } else if (e.key === 'End' && at < last) {
      e.preventDefault();
      void goto(beats[last].href, { noScroll: true, keepFocus: true });
    }
  }
</script>

<svelte:window {onkeydown} />

<nav class="beats" aria-label="Steps on this screen">
  {#if back}
    <a class="t-btn back" href={back.href} data-sveltekit-noscroll={back.inScreen ? '' : undefined} data-sveltekit-keepfocus={back.inScreen ? '' : undefined}>
      <ArrowLeft size={15} />
      {back.label}
    </a>
  {:else}
    <span></span>
  {/if}

  <div class="mid">
    <ol class="dots">
      {#each beats as b, i (b.href)}
        <li>
          <a
            class="dot"
            class:on={i === at}
            class:done={i < at}
            href={b.href}
            title={b.caption}
            aria-label="Step {i + 1} of {beats.length}: {b.caption}"
            aria-current={i === at ? 'step' : undefined}
            data-sveltekit-noscroll
            data-sveltekit-keepfocus
          ></a>
        </li>
      {/each}
    </ol>
    <p class="caption"><b>{at + 1} / {beats.length}</b> {beats[at].caption}</p>
  </div>

  {#if forward}
    <a class="t-btn primary next" href={forward.href} data-sveltekit-noscroll={forward.inScreen ? '' : undefined} data-sveltekit-keepfocus={forward.inScreen ? '' : undefined}>
      {forward.label}
      <ArrowRight size={15} />
    </a>
  {:else}
    <span></span>
  {/if}
</nav>

<style>
  .beats {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 14px;
  }
  .back {
    justify-self: start;
  }
  .next {
    justify-self: end;
  }
  .back,
  .next {
    text-decoration: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mid {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }
  .dots {
    display: flex;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .dot {
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--color-border-strong);
    transition: background 0.15s, transform 0.15s;
  }
  .dot:hover {
    background: var(--color-text-dim);
  }
  .dot.done {
    background: #93b9e2;
  }
  .dot.on {
    background: var(--color-brand);
    transform: scale(1.35);
  }
  .caption {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-secondary);
    text-align: center;
    white-space: nowrap;
  }
  .caption b {
    margin-right: 6px;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-muted);
  }
  @media (max-width: 900px) {
    .beats {
      grid-template-columns: 1fr 1fr;
    }
    .mid {
      grid-column: 1 / -1;
      grid-row: 1;
    }
  }
</style>
