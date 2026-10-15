<script lang="ts">
  import { page } from '$app/state';
  import { ArrowUpRight, Presentation } from '@lucide/svelte';
  import ScreenMark from './ScreenMark.svelte';
  import { usePresenter } from '$lib/tour/presenter.svelte';
  import { screenIndexOf } from '$lib/tour/screens';

  // `hint` is the tooltip: the bar stays one line tall so the screens below it can fit a laptop.
  const presenter = usePresenter();
  /** The seven of the tour, or the ten of the workshop. */
  const steps = $derived(presenter.screens);
  /** Ten titles do not fit a bar: past eight steps only the screen the talk is on keeps its title. */
  const many = $derived(steps.length > 8);

  const currentIndex = $derived(screenIndexOf(page.url.pathname, steps));
</script>

<header class="tour-top">
  <a class="brand" href={steps[0].href} title="Interactive tour: pre-recorded, no live model">
    <span class="brand-title">From tools to code surfaces</span>
    <span class="brand-sub">pre-recorded, no live model</span>
  </a>

  <nav aria-label="Tour steps">
    <ol class="steps" class:many>
      {#each steps as s, i (s.href)}
        <li class="step" class:done={i < currentIndex} class:current={i === currentIndex}>
          <a href={s.href} title={s.hint} aria-current={i === currentIndex ? 'step' : undefined}>
            <span class="num"><ScreenMark screen={s} size={13} /></span>
            <span class="title">{s.title}</span>
          </a>
        </li>
      {/each}
    </ol>
  </nav>

  <button type="button" class="present" onclick={() => presenter.toggle()} title="Present: a thin rail instead of this bar, no Back and Next, keys to move (P)" aria-label="Present (P)">
    <Presentation size={15} />
    <span class="present-label">Present</span>
  </button>
  <a class="live" href="/">
    Live<span class="live-more">&nbsp;benchmark</span>
    <ArrowUpRight size={14} />
  </a>
</header>

<style>
  .tour-top {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 18px;
    height: var(--tour-top, 44px);
    padding: 0 20px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid var(--color-border-default);
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 10px;
    text-decoration: none;
    color: inherit;
    flex: none;
  }
  .brand-title {
    font-size: 14.5px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  .brand-sub {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  nav {
    flex: 1;
    min-width: 0;
    display: flex;
    justify-content: center;
  }
  .steps {
    display: flex;
    align-items: center;
    gap: 4px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .step {
    display: flex;
    align-items: center;
  }
  .step + .step::before {
    content: '';
    width: 16px;
    height: 2px;
    margin-right: 4px;
    background: var(--color-border-default);
    border-radius: 1px;
  }
  .step.done + .step::before,
  .step.current::before {
    background: var(--color-brand);
  }
  .step a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 12px 3px 4px;
    border-radius: 999px;
    border: 1px solid transparent;
    text-decoration: none;
    color: var(--color-text-muted);
    transition: background 0.12s, border-color 0.12s;
  }
  .step a:hover {
    background: var(--color-hover-bg);
  }
  .step.current a {
    background: var(--color-brand-bg);
    border-color: #b6d4f0;
    color: var(--color-text-primary);
  }
  .num {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--color-border-strong);
    font-size: 12px;
    font-weight: 800;
    color: var(--color-text-muted);
    background: white;
  }
  .step.done .num {
    border-color: var(--color-brand);
    color: var(--color-brand);
  }
  .step.current .num {
    border-color: var(--color-brand);
    background: var(--color-brand);
    color: white;
  }
  .title {
    font-size: 13.5px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .live,
  .present {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: none;
    font-size: 13px;
    font-weight: 650;
    color: var(--color-brand);
    text-decoration: none;
    padding: 5px 9px;
    border-radius: 8px;
  }
  .present {
    gap: 6px;
    border: 0;
    background: transparent;
  }
  .live:hover,
  .present:hover {
    background: var(--color-brand-bg);
  }

  /* The workshop's ten steps would need about 1900px with every title, so the ones the talk is not on are their number or picture and a tooltip. */
  .many .step:not(.current) .title {
    display: none;
  }
  .many .step a {
    padding-right: 4px;
  }
  .many .step.current a {
    padding-right: 12px;
  }

  /* Seven steps, the tagline and the Present icon need about 1630px. Without the tagline they need about 1470px; with "Live" for "Live benchmark" about 1385px;
     tighter pills and joints carry them down to about 1310px. Each breakpoint keeps about 30px to spare for other fonts.
     Below 1340px the steps get a row of their own. The Present button shows its label from 1740px up (about 90px against the icon's 30). */
  @media (max-width: 1740px) {
    .present-label {
      display: none;
    }
    .present {
      padding: 5px 7px;
    }
  }
  @media (max-width: 1660px) {
    .brand-sub {
      display: none;
    }
  }
  @media (max-width: 1540px) {
    .live-more {
      display: none;
    }
  }
  @media (max-width: 1450px) {
    .steps {
      gap: 2px;
    }
    .step + .step::before {
      width: 8px;
      margin-right: 2px;
    }
    .step a {
      gap: 6px;
      padding-right: 8px;
    }
  }
  @media (max-width: 1340px) {
    .tour-top {
      height: auto;
      flex-wrap: wrap;
      gap: 4px 16px;
      padding: 6px 16px;
    }
    nav {
      order: 3;
      flex-basis: 100%;
      justify-content: flex-start;
      overflow-x: auto;
    }
    .brand-sub {
      display: none;
    }
    .live {
      margin-left: auto;
    }
  }
</style>
