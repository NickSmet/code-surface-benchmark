<script lang="ts">
  import { DoorOpen, MessageCircleQuestionMark, PencilLine } from '@lucide/svelte';
  import type { TourScreen } from '$lib/tour/screens';

  /**
   * What goes in the circle of a step: the screen's number, or, on the three screens that only the workshop has and
   * that must not take a number from the eight, a small picture.
   */
  let { screen, size = 14 }: { screen: TourScreen; size?: number } = $props();
</script>

{#if screen.n !== undefined}
  {screen.n}
{:else if screen.mark === 'welcome'}
  <DoorOpen {size} aria-hidden="true" />
{:else if screen.mark === 'turn'}
  <PencilLine {size} aria-hidden="true" />
{:else}
  <MessageCircleQuestionMark {size} aria-hidden="true" />
{/if}
