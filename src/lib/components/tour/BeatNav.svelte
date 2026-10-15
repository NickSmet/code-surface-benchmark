<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ArrowLeft, ArrowRight } from '@lucide/svelte';
  import { beatActionFor, moveFor, typingIn } from '$lib/tour/beat-keys';
  import { usePresenter, type BeatReport } from '$lib/tour/presenter.svelte';
  import { crossTo } from '$lib/tour/screens';

  interface Link {
    href: string;
    label: string;
  }
  interface Props {
    /** The beat the screen is on. */
    at: number;
    /** One entry for each beat: the URL that shows it, and what the presenter is on there. Beats with the same `group` are jumped over together (Shift and an arrow); without one, a beat is a group of its own. */
    beats: ReadonlyArray<{ href: string; caption: string; group?: string }>;
    /** Where Back goes from the first beat, and Next from the last: the screens on either side. */
    before?: Link;
    after?: Link;
    /** What the Next button says at a beat. The next beat's caption, if not given. */
    nextLabel?: (at: number) => string;
  }
  let { at, beats, before, after, nextLabel }: Props = $props();

  const presenter = usePresenter();
  const stay = { noScroll: true, keepFocus: true } as const;

  const last = $derived(beats.length - 1);
  const groups = $derived(beats.map((b) => b.group ?? b.caption));
  // Off either end of the screen: the screens on either side. A screen names its neighbours in the tour; in the workshop,
  // which has three more, they are whatever the workshop's list says, and Back and Next say that screen's title.
  const around = $derived.by((): { before: Link | undefined; after: Link | undefined } => {
    if (presenter.format !== 'workshop') return { before, after };
    const edge = (delta: 1 | -1): Link | undefined => {
      const to = crossTo(page.url.pathname, delta, presenter.screens);
      return to ? { href: delta > 0 ? to.screen.href : to.screen.end, label: to.screen.title } : undefined;
    };
    return { before: edge(-1), after: edge(1) };
  });
  const back = $derived(at > 0 ? { href: beats[at - 1].href, label: 'Back', inScreen: true } : around.before ? { ...around.before, inScreen: false } : null);
  const forward = $derived(
    at < last
      ? { href: beats[at + 1].href, label: nextLabel ? nextLabel(at) : beats[at + 1].caption, inScreen: true }
      : around.after
        ? { ...around.after, inScreen: false }
        : null
  );

  // The presenter's rail fills as the screen is walked.
  let mine: BeatReport | null = null;
  $effect(() => {
    mine = { at, count: beats.length };
    presenter.report(mine);
  });
  onMount(() => () => {
    if (mine) presenter.release(mine);
  });

  const pressable = (t: EventTarget | null): boolean => t instanceof HTMLElement && ['A', 'BUTTON', 'SUMMARY'].includes(t.tagName);

  /** Off the end of the screen. Read, it is the Back or Next link; presented, the neighbour is entered at its first beat going on and its last going back. */
  function cross(delta: 1 | -1): void {
    if (presenter.on) {
      const next = crossTo(page.url.pathname, delta, presenter.screens);
      if (next) void goto(next.href, { noScroll: true });
      return;
    }
    const link = delta > 0 ? around.after : around.before;
    if (link) void goto(link.href);
  }

  /** A screen that is leaving can stay in the page for a moment (a fade that has not finished) with the address already the next screen's. Its keys must not answer for that one. */
  const home = untrack(() => page.url.pathname);

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || page.url.pathname !== home || presenter.helpOpen || typingIn(e.target)) return;
    const action = beatActionFor(e);
    if (!action || (e.key === ' ' && pressable(e.target))) return;
    const move = moveFor(action, at, groups);
    if (!move) return;
    e.preventDefault();
    if ('to' in move) void goto(beats[move.to].href, stay);
    else cross(move.cross);
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
