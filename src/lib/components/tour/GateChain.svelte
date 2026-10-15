<script lang="ts">
  /**
   * The gates between a program and the estate, in the order the program meets them, and where the program on stage stands at
   * each. The chips are the steps of the screen: a link to each gate's beat, so the chain is the way in and the way to read it.
   */
  import { Check, CircleAlert, Hand, Minus, X } from '@lucide/svelte';
  import { GATES, type BeatId, type GateId, type GateStatus } from '$lib/tour/guard';

  interface Props {
    /** Where the program on stage stands at each gate. */
    gates: Record<GateId, GateStatus>;
    /** The beat the screen is on. */
    active: BeatId;
    /** The rule is on. */
    ruleOn: boolean;
    /** The address of a beat. */
    href: (id: BeatId) => string;
  }
  let { gates, active, ruleOn, href }: Props = $props();

  const WORD: Record<GateStatus, string> = {
    pass: 'passed',
    note: 'passed, with something left out',
    stop: 'stopped the program here',
    hold: 'holding the program for a person',
    skip: 'nothing to check',
    idle: 'not reached'
  };
  /** The program went on past a gate that let it through, or had nothing to check. */
  const travelled = (s: GateStatus): boolean => s === 'pass' || s === 'note' || s === 'skip';
</script>

<nav class="chain" aria-label="The gates between a program and the estate">
  <ol>
    {#each GATES as g, i (g.id)}
      {@const s = gates[g.id]}
      {#if i > 0}
        <li class="link" class:travelled={travelled(gates[GATES[i - 1].id])} aria-hidden="true"></li>
      {/if}
      <li>
        <a
          class="gate {s}"
          class:on={g.id === active}
          href={href(g.id)}
          title="{g.says} {g.id === 'rule' && !ruleOn ? 'Off.' : WORD[s][0].toUpperCase() + WORD[s].slice(1)}."
          aria-current={g.id === active ? 'step' : undefined}
          data-sveltekit-noscroll
          data-sveltekit-keepfocus
        >
          <span class="mark">
            {#if s === 'pass'}<Check size={13} strokeWidth={3} />
            {:else if s === 'note'}<CircleAlert size={13} strokeWidth={2.6} />
            {:else if s === 'stop'}<X size={13} strokeWidth={3} />
            {:else if s === 'hold'}<Hand size={13} strokeWidth={2.4} />
            {:else if s === 'skip'}<Minus size={13} strokeWidth={3} />
            {/if}
          </span>
          <span class="name">{g.label}</span>
          {#if g.home === 'yours'}<span class="own" title="Not in the benchmark's runtime: a rule you would add">{ruleOn ? 'yours' : 'off'}</span>{/if}
        </a>
      </li>
    {/each}
    <li class="link gap" aria-hidden="true"></li>
    <li>
      <a class="try" class:on={active === 'try'} href={href('try')} aria-current={active === 'try' ? 'step' : undefined} data-sveltekit-noscroll data-sveltekit-keepfocus>Try it</a>
    </li>
  </ol>
</nav>

<style>
  .chain ol {
    display: flex;
    align-items: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .gate,
  .try {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 11px 0 8px;
    border-radius: 999px;
    border: 1.5px solid var(--color-border-default);
    background: #fff;
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-secondary);
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
  }
  .try {
    padding: 0 14px;
    border-style: dashed;
    color: var(--color-text-muted);
  }
  .try.on {
    border-style: solid;
    border-color: var(--color-brand);
    color: var(--color-brand);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand) 22%, transparent);
  }
  .mark {
    display: inline-grid;
    place-items: center;
    width: 17px;
    height: 17px;
    border-radius: 999px;
  }
  .gate.idle .mark {
    border: 1.5px dashed var(--color-border-strong);
  }

  /* where the program stands at each gate */
  .gate.pass {
    border-color: #a7f3d0;
    background: #ecfdf5;
    color: #047857;
  }
  .gate.pass .mark {
    background: #059669;
    color: #fff;
  }
  .gate.note {
    border-color: #fde68a;
    background: #fffbeb;
    color: #b45309;
  }
  .gate.note .mark {
    background: #d97706;
    color: #fff;
  }
  .gate.stop {
    border-color: #fca5a5;
    background: #fef2f2;
    color: #b91c1c;
  }
  .gate.stop .mark {
    background: #dc2626;
    color: #fff;
  }
  .gate.hold {
    border-color: #c7d2fe;
    background: #eef2ff;
    color: #4338ca;
  }
  .gate.hold .mark {
    background: #6366f1;
    color: #fff;
  }
  .gate.skip {
    color: var(--color-text-muted);
  }
  .gate.skip .mark {
    background: var(--color-border-default);
    color: var(--color-text-muted);
  }
  .gate.idle {
    border-style: dashed;
    color: var(--color-text-dim);
  }

  /* the beat the screen is on */
  .gate.on {
    box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--color-brand) 55%, transparent);
  }
  .gate:hover,
  .try:hover {
    border-color: var(--color-brand);
  }

  .own {
    margin-left: 1px;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px dashed currentColor;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .link {
    width: 14px;
    height: 0;
    border-top: 2px dashed var(--color-border-strong);
  }
  .link.travelled {
    border-top: 2px solid #6ee7b7;
  }
  .link.gap {
    width: 12px;
    border-top: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .gate,
    .try {
      transition: none;
    }
  }
</style>
