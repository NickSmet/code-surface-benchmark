<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { beatActionFor, moveFor, typingIn } from '$lib/tour/beat-keys';
  import { usePresenter } from '$lib/tour/presenter.svelte';
  import { crossTo } from '$lib/tour/screens';

  /**
   * The keys of the steps of a screen whose steps are state rather than addresses: a replay, a walkthrough, a set of
   * lenses. It also tells the presenter's rail how far through the screen the talk is. It draws nothing.
   */
  interface Props {
    /** The step the screen is on. */
    at: number;
    /** The group each step belongs to; Shift and an arrow jump over a whole group. */
    groups: readonly string[];
    /** Go to this step. */
    onstep: (to: number) => void;
    /** Off while something sits on top of the screen (a dialog) and the keys belong to it. */
    enabled?: boolean;
    /** Whether Space steps. A screen where Space plays and pauses says no. */
    spaceSteps?: boolean;
    /** Keys inside any of these belong to the widget that has focus. */
    ignoreIn?: string;
  }
  let { at, groups, onstep, enabled = true, spaceSteps = false, ignoreIn = 'dialog, [role=radio], [role=tab], [data-unit]' }: Props = $props();

  const presenter = usePresenter();
  $effect(() => presenter.report({ at, count: groups.length }));
  onMount(() => () => presenter.report(null));

  function onkeydown(e: KeyboardEvent): void {
    if (!enabled || e.defaultPrevented || presenter.helpOpen || typingIn(e.target)) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (el?.closest(ignoreIn)) return;
    const action = beatActionFor(e);
    if (!action) return;
    if (e.key === ' ' && (!spaceSteps || el?.closest('button, a, summary'))) return;
    const move = moveFor(action, at, groups);
    if (!move) return;
    e.preventDefault();
    if ('to' in move) onstep(move.to);
    else {
      const next = crossTo(page.url.pathname, move.cross);
      if (next) void goto(next.href, { noScroll: true });
    }
  }
</script>

<svelte:window {onkeydown} />
