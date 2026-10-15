<script lang="ts">
  import '$lib/components/tour/tour.css';
  import { untrack } from 'svelte';
  import { afterNavigate, goto, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import PresenterHelp from '$lib/components/tour/PresenterHelp.svelte';
  import PresenterRail from '$lib/components/tour/PresenterRail.svelte';
  import TourStepper from '$lib/components/tour/TourStepper.svelte';
  import { globalActionFor, typingIn } from '$lib/tour/beat-keys';
  import { Presenter, providePresenter } from '$lib/tour/presenter.svelte';
  import { SCREENS, screenIndexOf } from '$lib/tour/screens';

  let { data, children } = $props();

  // The server decides the first render from the cookie (or `?mode=`); after that a toggle is the visitor's own.
  const presenter = providePresenter(new Presenter(untrack(() => data.present)));
  $effect(() => {
    presenter.on = data.present;
  });

  // `?mode=` opens a link in a mode. It is not part of the address afterwards, or a reload would undo a toggle.
  function dropModeParam(): void {
    if (!page.url.searchParams.has('mode')) return;
    const clean = new URL(page.url);
    clean.searchParams.delete('mode');
    try {
      replaceState(clean.pathname + clean.search, page.state);
    } catch {
      /* router not ready: the address is a convenience */
    }
  }

  afterNavigate(({ from, to }) => {
    // The first time the router is not ready yet, so this waits a tick for it.
    if (!from) setTimeout(dropModeParam, 0);
    // Arriving at another screen: show the step bar, larger than it is at rest, for a moment.
    else if (presenter.on && to && screenIndexOf(from.url.pathname) !== screenIndexOf(to.url.pathname)) presenter.flash();
  });

  function jump(delta: 1 | -1): void {
    const to = SCREENS[screenIndexOf(page.url.pathname) + delta];
    if (to) void goto(to.href, { noScroll: true });
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.defaultPrevented || typingIn(e.target)) return;
    const act = globalActionFor(e);
    if (act === null) return;
    if (act === 'close') {
      if (presenter.helpOpen) {
        e.preventDefault();
        presenter.helpOpen = false;
      }
      return;
    }
    if (presenter.helpOpen && act !== 'help') return;
    e.preventDefault();
    if (act === 'present') presenter.toggle();
    else if (act === 'help') presenter.helpOpen = !presenter.helpOpen;
    else if (act === 'fullscreen') toggleFullscreen();
    else jump(act.screen);
  }

  // A presenter clicks something and then reaches for the clicker: the click must not leave focus on a button or a
  // tab, where the arrow keys and Space would belong to it and not to the talk.
  function onclick(e: MouseEvent): void {
    if (!presenter.on) return;
    const hit = e.target instanceof Element ? e.target.closest<HTMLElement>('button, a, [role=radio], [role=tab]') : null;
    if (hit) setTimeout(() => hit.blur(), 0);
  }
</script>

<svelte:window {onkeydown} {onclick} />

<div class="tour" class:present={presenter.on}>
  {#if presenter.on}
    <PresenterRail />
  {:else}
    <TourStepper />
  {/if}
  <main class="tour-main">{@render children()}</main>
  <PresenterHelp />
</div>
