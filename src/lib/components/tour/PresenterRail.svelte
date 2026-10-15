<script lang="ts">
  import { page } from '$app/state';
  import { Keyboard, LogOut } from '@lucide/svelte';
  import { usePresenter } from '$lib/tour/presenter.svelte';
  import { SCREENS, screenIndexOf } from '$lib/tour/screens';

  const presenter = usePresenter();
  const here = $derived(screenIndexOf(page.url.pathname));
  /** How far through the screen on show the talk is; the rail fills its segment with it. */
  const fill = $derived(presenter.beat && presenter.beat.count > 0 ? Math.min(1, (presenter.beat.at + 1) / presenter.beat.count) : 0);
  const current = $derived(SCREENS[here] ?? null);
  const shown = $derived(presenter.pop !== null);
</script>

<!--
  Presenter mode keeps the step bar out of the way: a rail four pixels tall along the top edge, one segment for each
  screen, the current one filling as the screen is walked. The full bar comes down over the page for a moment when the
  talk moves to another screen, or while the pointer is at the top edge, and goes back up. It never takes any room.
-->
<div class="rail" class:shown>
  <div class="hit" aria-hidden="true"></div>
  <div
    class="bar"
    role="progressbar"
    aria-label="Where the talk is"
    aria-valuemin={0}
    aria-valuemax={SCREENS.length}
    aria-valuenow={Math.round((Math.max(here, 0) + fill) * 100) / 100}
    aria-valuetext={current ? `${current.title}, screen ${here + 1} of ${SCREENS.length}` : undefined}
  >
    {#each SCREENS as s, i (s.id)}
      <span class="seg" class:now={i === here}>
        <span class="fill" style:transform="scaleX({i < here ? 1 : i === here ? fill : 0})"></span>
      </span>
    {/each}
  </div>

  <div class="pop">
    <nav aria-label="Tour steps">
      <ol class="steps">
        {#each SCREENS as s, i (s.id)}
          <li class:done={i < here} class:now={i === here}>
            <a href={s.href} title={s.hint} aria-current={i === here ? 'step' : undefined}>
              <span class="num">{i + 1}</span>
              <span class="title">{s.title}</span>
            </a>
          </li>
        {/each}
      </ol>
    </nav>
    <p class="note" aria-live="polite">{presenter.pop?.note ?? (current ? `${current.title}: ${current.hint}` : '')}</p>
    <div class="acts">
      <button type="button" onclick={() => (presenter.helpOpen = true)}><Keyboard size={14} />Keys <kbd>H</kbd></button>
      <button type="button" onclick={() => presenter.toggle()}><LogOut size={14} />Leave presenter mode <kbd>P</kbd></button>
    </div>
  </div>
</div>

<style>
  .rail {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 60;
    pointer-events: none;
  }
  /* The strip of page, just above the content, that brings the bar down when the pointer is in it. */
  .hit {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 10px;
    pointer-events: auto;
  }
  .bar {
    position: relative;
    display: flex;
    gap: 3px;
    padding: 0 3px;
    height: 4px;
  }
  .seg {
    flex: 1;
    overflow: hidden;
    border-radius: 0 0 3px 3px;
    background: var(--color-border-default);
  }
  .seg.now {
    background: color-mix(in srgb, var(--color-brand) 22%, white);
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--color-brand);
    transform-origin: left center;
    transition: transform 0.35s ease;
  }

  .pop {
    position: absolute;
    top: 10px;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    max-width: calc(100vw - 32px);
    padding: 10px 12px 8px;
    background: rgba(255, 255, 255, 0.97);
    backdrop-filter: blur(8px);
    border: 1px solid var(--color-border-default);
    border-radius: 16px;
    box-shadow: 0 16px 44px rgba(15, 23, 42, 0.24);
    opacity: 0;
    visibility: hidden;
    transform: translate(-50%, -14px);
    transition: opacity 0.18s, transform 0.18s, visibility 0s 0.18s;
    pointer-events: none;
  }
  .hit:hover ~ .pop,
  .pop:hover,
  .pop:focus-within,
  .rail.shown .pop {
    opacity: 1;
    visibility: visible;
    transform: translate(-50%, 0);
    transition: opacity 0.18s, transform 0.18s;
    pointer-events: auto;
  }

  .steps {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    display: flex;
    align-items: center;
  }
  .steps li + li::before {
    content: '';
    width: 14px;
    height: 2px;
    margin-right: 4px;
    border-radius: 1px;
    background: var(--color-border-default);
  }
  .steps li.done + li::before,
  .steps li.now::before {
    background: var(--color-brand);
  }
  a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 14px 4px 5px;
    border: 1px solid transparent;
    border-radius: 999px;
    color: var(--color-text-muted);
    text-decoration: none;
    transition: background 0.12s;
  }
  a:hover {
    background: var(--color-hover-bg);
  }
  .now a {
    background: var(--color-brand-bg);
    border-color: #b6d4f0;
    color: var(--color-text-primary);
  }
  .num {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--color-border-strong);
    background: white;
    font-size: 13px;
    font-weight: 800;
    color: var(--color-text-muted);
  }
  .done .num {
    border-color: var(--color-brand);
    color: var(--color-brand);
  }
  .now .num {
    border-color: var(--color-brand);
    background: var(--color-brand);
    color: white;
  }
  .title {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    color: var(--color-text-primary);
  }

  .note {
    margin: 0;
    font-size: 13.5px;
    color: var(--color-text-secondary);
    text-align: center;
  }
  .acts {
    display: flex;
    gap: 14px;
  }
  .acts button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .acts button:hover {
    background: var(--color-hover-bg);
    color: var(--color-text-primary);
  }
  kbd {
    padding: 0 5px;
    border: 1px solid var(--color-border-strong);
    border-radius: 4px;
    background: white;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  /* Seven titles in a row need about 1000px; narrower than that, only the screen the talk is on keeps its title. */
  @media (max-width: 1100px) {
    .steps li:not(.now) .title {
      display: none;
    }
    a {
      padding-right: 6px;
    }
    .now a {
      padding-right: 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fill,
    .pop {
      transition: none;
    }
  }
</style>
