<script lang="ts">
  import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from '@lucide/svelte';

  interface Props {
    frame: number;
    last: number;
    playing: boolean;
    /** Move to a frame. The parent decides whether that also pauses playback. */
    onframe: (frame: number) => void;
    onplay: () => void;
    /** Accessible description of the current frame, e.g. "Step 2 of 4: get_resource". */
    valueText: string;
    /** Shown to the right of the slider. */
    label?: string;
  }
  let { frame, last, playing, onframe, onplay, valueText, label }: Props = $props();

  const atStart = $derived(frame <= 0);
  const atEnd = $derived(frame >= last);
</script>

<div class="transport" role="group" aria-label="Replay controls">
  <div class="btns">
    <button type="button" class="b" onclick={() => onframe(0)} disabled={atStart} aria-label="Back to the question" title="Back to the start (Home)">
      <SkipBack size={16} />
    </button>
    <button type="button" class="b" onclick={() => onframe(frame - 1)} disabled={atStart} aria-label="Previous step" title="Previous step (←)">
      <StepBack size={16} />
    </button>
    <button type="button" class="b play" onclick={onplay} aria-label={playing ? 'Pause' : atEnd ? 'Replay' : 'Play'} title="Play or pause (Space)">
      {#if playing}<Pause size={17} />{:else}<Play size={17} />{/if}
      <span>{playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}</span>
    </button>
    <button type="button" class="b" onclick={() => onframe(frame + 1)} disabled={atEnd} aria-label="Next step" title="Next step (→)">
      <StepForward size={16} />
    </button>
    <button type="button" class="b" onclick={() => onframe(last)} disabled={atEnd} aria-label="Jump to the answer" title="Jump to the end (End)">
      <SkipForward size={16} />
    </button>
  </div>
  <input
    class="slider"
    type="range"
    min="0"
    max={last}
    step="1"
    value={frame}
    aria-label="Position in the replay"
    aria-valuetext={valueText}
    oninput={(e) => onframe(Number((e.currentTarget as HTMLInputElement).value))}
  />
  {#if label}<span class="label" aria-hidden="true">{label}</span>{/if}
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .btns {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .b {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 36px;
    min-width: 36px;
    padding: 0 9px;
    border-radius: 9px;
    border: 1px solid var(--color-border-strong);
    background: white;
    color: var(--color-text-secondary);
    font-size: 14px;
    font-weight: 700;
    transition: background 0.12s, border-color 0.12s;
  }
  .b:hover:not(:disabled) {
    background: var(--color-hover-bg);
    border-color: var(--color-text-dim);
  }
  .b:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .play {
    padding: 0 14px 0 11px;
    background: var(--color-brand);
    border-color: var(--color-brand);
    color: white;
    min-width: 92px;
  }
  .play:hover:not(:disabled) {
    background: var(--color-brand-dark);
    border-color: var(--color-brand-dark);
  }
  .slider {
    flex: 1;
    min-width: 120px;
    accent-color: var(--color-brand);
    height: 28px;
    cursor: pointer;
  }
  .label {
    font-family: var(--font-mono);
    font-size: 13.5px;
    font-weight: 700;
    color: var(--color-text-secondary);
    white-space: nowrap;
    min-width: 7.5ch;
    text-align: right;
  }
</style>
