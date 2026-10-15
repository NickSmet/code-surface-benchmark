<script lang="ts">
  /**
   * The code screen's stage with a program the room can edit: the same picture, in the same proportions, with a
   * text box laid over the program's panel so a change is typed where the program is drawn.
   *
   * The geometry is the code screen's, number for number: the stage keeps its 1400 x 680 proportions and takes the
   * largest size that fits, and the text box sits on the panel at the stage's own left edge, line height and size.
   */
  import ExampleStage from './ExampleStage.svelte';
  import type { ExampleView } from '$lib/tour/example-stage';
  import type { ObjectStage } from '$lib/tour/object-stage';

  interface Props {
    stage: ObjectStage;
    view: ExampleView;
    /** Motion position: below 0 the program is written, 1 the run, 2 the answer, 3 the review. */
    u: number;
    /** What a screen reader hears for the current beat. */
    label: string;
    /** The program in the text box. */
    code: string;
    running?: boolean;
    /** Control or Command plus Enter in the text box. */
    onrun?: () => void;
  }
  let { stage, view, u, label, code = $bindable(), running = false, onrun }: Props = $props();

  function onkeydown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onrun?.();
    } else if (e.key === 'Escape') {
      // Leave the editor, so the arrow keys step through the talk again.
      (e.currentTarget as HTMLElement).blur();
    }
  }
</script>

<section class="t-panel stage-panel" aria-label="A program running on the estate object">
  <div class="stage-wrap">
    <div class="stage-box">
      <ExampleStage {stage} {view} {u} {label} editing {running} />
      <textarea
        class="editor"
        aria-label="The program. Press Control or Command plus Enter to run it."
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        wrap="off"
        bind:value={code}
        {onkeydown}
        style:--lh={view.lineHeight}
      ></textarea>
    </div>
  </div>
</section>

<style>
  /* The stage keeps its proportions and takes the largest size that fits what is left of the window. */
  .stage-panel {
    flex: 1;
    min-height: 380px;
    display: flex;
    padding: 6px;
    overflow-x: auto;
  }
  .stage-wrap {
    flex: 1;
    min-width: 940px;
    min-height: 0;
    container-type: size;
    display: grid;
    place-items: center;
  }
  .stage-box {
    --sw: min(100cqw, calc(100cqh * 1400 / 680));
    position: relative;
    width: var(--sw);
    aspect-ratio: 1400 / 680;
  }

  /* The program is typed over the panel the stage draws: same left edge, same lines, same size. */
  .editor {
    position: absolute;
    left: calc(var(--sw) * 60 / 1400);
    top: calc(var(--sw) * 68 / 1400);
    width: calc(var(--sw) * 628 / 1400);
    height: calc(var(--sw) * 576 / 1400);
    margin: 0;
    padding: 0;
    border: 0;
    outline: 0;
    resize: none;
    overflow: auto;
    background: transparent;
    color: #e2e8f0;
    caret-color: #5eead4;
    font-family: var(--font-mono);
    font-size: calc(var(--sw) * 12.5 / 1400);
    font-weight: 500;
    line-height: calc(var(--sw) * var(--lh) / 1400);
    white-space: pre;
    tab-size: 2;
    /* A line a little longer than the panel scrolls, as it would in any editor, without a scrollbar drawn over the program. */
    scrollbar-width: none;
  }
  .editor::-webkit-scrollbar {
    display: none;
  }
  .editor::selection {
    background: rgba(45, 212, 191, 0.3);
  }

  :global(.tour.present) .stage-panel {
    padding: 3px;
  }
</style>
