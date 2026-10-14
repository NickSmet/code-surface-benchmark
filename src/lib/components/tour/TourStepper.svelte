<script lang="ts">
  import { page } from '$app/state';
  import { ArrowUpRight } from '@lucide/svelte';

  // `hint` is the tooltip: the bar stays one line tall so the screens below it can fit a laptop.
  const steps = [
    { href: '/tour/estate', title: 'The estate', hint: '194 things, many ways to look' },
    { href: '/tour/tools', title: 'Naive tools', hint: 'One call at a time' },
    { href: '/tour/language', title: 'A language', hint: 'The catalogue grows up' },
    { href: '/tour/code', title: 'Code surface', hint: 'Hand over the object' }
  ];

  const currentIndex = $derived(steps.findIndex((s) => page.url.pathname.startsWith(s.href)));
</script>

<header class="tour-top">
  <a class="brand" href="/tour/estate" title="Interactive tour: pre-recorded, no live model">
    <span class="brand-title">From tools to code surfaces</span>
    <span class="brand-sub">pre-recorded, no live model</span>
  </a>

  <nav aria-label="Tour steps">
    <ol class="steps">
      {#each steps as s, i (s.href)}
        <li class="step" class:done={i < currentIndex} class:current={i === currentIndex}>
          <a href={s.href} title={s.hint} aria-current={i === currentIndex ? 'step' : undefined}>
            <span class="num">{i + 1}</span>
            <span class="title">{s.title}</span>
          </a>
        </li>
      {/each}
    </ol>
  </nav>

  <a class="live" href="/">
    Live benchmark
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
  .live {
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
  .live:hover {
    background: var(--color-brand-bg);
  }

  @media (max-width: 1350px) {
    .brand-sub {
      display: none;
    }
  }
  @media (max-width: 960px) {
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
