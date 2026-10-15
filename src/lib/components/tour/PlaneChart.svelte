<script lang="ts">
  /**
   * The benchmark's dollars-against-correctness plane, with the model changing under it. Everything on it is a function of two
   * numbers: `t`, how far along the models the walk is (0 the older, 1 the newer, 2 the newest), and `s`, how far from the
   * preset tasks to the unplanned ones. A marker's place is a mix of four stored places (lib/tour/plane.ts), so changing the
   * beat is a glide, and the trail a marker leaves is the way it came.
   */
  import { untrack } from 'svelte';
  import { cubicInOut } from 'svelte/easing';
  import { Tween } from 'svelte/motion';
  import { browser } from '$app/environment';
  import { ARMS, armOf, cellIn, fmtUsd, perThousandRuns, type ModelKey, type TaskSet } from '$lib/tour/results';
  import {
    FAMILY_COLOR,
    LABEL_COLOR,
    MARKER,
    PLANE,
    PLOT,
    X_TICKS,
    Y_MIN,
    Y_TICKS,
    diamondPath,
    fmtTick,
    labelsFor,
    modelIndex,
    poseAt,
    presence,
    trailOf,
    xOf,
    yOf
  } from '$lib/tour/plane';

  interface Props {
    model: ModelKey;
    set: TaskSet;
    /** What a screen reader hears. */
    label: string;
  }
  let { model, set, label }: Props = $props();

  const reduced = (): boolean => browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targetT = $derived(modelIndex(model));
  const targetS = $derived(set === 'unplanned' ? 1 : 0);

  // The first render is where the URL says, so the chart is right before any script runs.
  const t = new Tween(untrack(() => targetT), { duration: 0 });
  const s = new Tween(untrack(() => targetS), { duration: 0 });

  $effect(() => {
    const toT = targetT;
    const toS = targetS;
    untrack(() => {
      const quick = reduced();
      const dt = Math.abs(toT - t.current);
      if (dt > 1e-6) void t.set(toT, { duration: quick ? 0 : 800 + 350 * dt, easing: cubicInOut });
      if (Math.abs(toS - s.current) > 1e-6) void s.set(toS, { duration: quick ? 0 : 1100, easing: cubicInOut });
    });
  });

  /** The names stay off the plane while it is moving, so they never swim. */
  const atRest = $derived(Math.abs(t.current - targetT) < 1e-3 && Math.abs(s.current - targetS) < 1e-3);
  const labels = $derived(labelsFor(set, model));

  const drawn = $derived(
    ARMS.map((a) => ({
      arm: a,
      pose: poseAt(a.id, t.current, s.current),
      alpha: presence(a.id, t.current),
      trail: trailOf(a.id, t.current, s.current)
    }))
  );
  const line = (pts: Array<{ x: number; y: number }>): string => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  /** The markers that rest in the place the walk is going to, with their numbers, for the hover. */
  const tip = (id: (typeof ARMS)[number]['id']): string => {
    const c = cellIn(set, model, id);
    return c ? `${armOf(id).full}: ${c.correct} of ${c.runs} right, ${fmtUsd(perThousandRuns(c))} per 1,000 runs` : armOf(id).full;
  };
  // The code surface is drawn last, so it is never under another marker.
  const order = $derived([...drawn.filter((d) => d.arm.id !== 'code'), ...drawn.filter((d) => d.arm.id === 'code')]);
</script>

<!-- The drawing never sets the height of the box it is in: it takes what the page leaves, and keeps its proportions inside it. -->
<div class="box">
<svg class="plane" viewBox="0 0 {PLANE.w} {PLANE.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label={label} xmlns="http://www.w3.org/2000/svg">
  <rect x={PLOT.x0} y={PLOT.y0} width={PLOT.x1 - PLOT.x0} height={PLOT.y1 - PLOT.y0} class="field" />
  {#each X_TICKS as v (v)}
    <line x1={xOf(v)} x2={xOf(v)} y1={PLOT.y0} y2={PLOT.y1} class="grid" />
    <text x={xOf(v)} y={PLOT.y1 + 19} text-anchor="middle" class="tick">{fmtTick(v)}</text>
  {/each}
  {#each Y_TICKS as v (v)}
    <line x1={PLOT.x0} x2={PLOT.x1} y1={yOf(v)} y2={yOf(v)} class="grid" />
    <text x={PLOT.x0 - 10} y={yOf(v) + 4.5} text-anchor="end" class="tick">{Math.round(v * 100)}%</text>
  {/each}
  <rect x={PLOT.x0} y={PLOT.y0} width={PLOT.x1 - PLOT.x0} height={PLOT.y1 - PLOT.y0} class="frame" />
  <text x={(PLOT.x0 + PLOT.x1) / 2} y={PLANE.h - 12} text-anchor="middle" class="axis">estimated dollars per 1,000 runs, log scale: left is cheaper</text>
  <text transform="translate(16 {(PLOT.y0 + PLOT.y1) / 2}) rotate(-90)" text-anchor="middle" class="axis">runs that were right (axis starts at {Math.round(Y_MIN * 100)}%)</text>

  <!-- where each marker has been -->
  {#each drawn as d (d.arm.id)}
    {@const c = FAMILY_COLOR[d.arm.family]}
    {#if d.trail.journey.length > 1}
      <polyline points={line(d.trail.journey)} fill="none" stroke={c} stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round" opacity={(1 - s.current) * 0.5 * d.alpha} />
    {/if}
    <polyline points={line(d.trail.across)} fill="none" stroke={c} stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round" opacity={s.current * 0.55 * d.alpha} />
    {#each d.trail.ghosts as g, k (k)}
      <circle cx={g.x} cy={g.y} r="3.6" fill={c} opacity={0.4 * d.alpha} />
    {/each}
  {/each}

  <!-- the interval each right-answer share could be, with 95% confidence -->
  {#each drawn as d (d.arm.id)}
    {@const c = FAMILY_COLOR[d.arm.family]}
    <g stroke={c} stroke-width="2.2" opacity={0.42 * d.alpha}>
      <line x1={d.pose.x} x2={d.pose.x} y1={d.pose.top} y2={d.pose.bottom} />
      <line x1={d.pose.x - 4.5} x2={d.pose.x + 4.5} y1={d.pose.top} y2={d.pose.top} />
      <line x1={d.pose.x - 4.5} x2={d.pose.x + 4.5} y1={d.pose.bottom} y2={d.pose.bottom} />
    </g>
  {/each}

  <!-- the markers: colour is the tool set, shape is how the tools are called -->
  {#each order as d (d.arm.id)}
    {@const c = FAMILY_COLOR[d.arm.family]}
    {@const x = d.pose.x}
    {@const y = d.pose.y}
    <g opacity={d.alpha} class="marker" data-arm={d.arm.id}>
      <title>{tip(d.arm.id)}</title>
      {#if d.arm.id === 'code'}
        <circle cx={x} cy={y} r="17" fill={c} opacity="0.16" />
      {/if}
      {#if d.arm.shape === 'ring'}
        <circle cx={x} cy={y} r={MARKER.r - 0.5} fill="#fff" stroke={c} stroke-width="3.4" />
      {:else if d.arm.shape === 'diamond'}
        <path d={diamondPath(x, y)} fill={c} stroke="#fff" stroke-width="1.5" />
      {:else if d.arm.shape === 'square'}
        <rect x={x - MARKER.half} y={y - MARKER.half} width={MARKER.half * 2} height={MARKER.half * 2} rx="3.5" fill={c} stroke="#fff" stroke-width="1.5" />
      {:else}
        <circle cx={x} cy={y} r={MARKER.r} fill={c} stroke="#fff" stroke-width="1.5" />
      {/if}
    </g>
  {/each}

  <!-- names, once it has stopped moving -->
  {#each labels as l (l.arm)}
    <text x={l.x} y={l.y} text-anchor={l.anchor} class="name" class:code={l.kind === 'code'} style:fill={LABEL_COLOR[armOf(l.arm).family]} style:opacity={atRest ? 1 : 0}>{l.text}</text>
  {/each}
</svg>
</div>

<style>
  .box {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .plane {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    font-family: inherit;
    overflow: visible;
    text-rendering: geometricPrecision;
  }
  .field {
    fill: #fcfcfd;
  }
  .grid {
    stroke: #eceff3;
    stroke-width: 1;
  }
  .frame {
    fill: none;
    stroke: #d1d5db;
    stroke-width: 1;
  }
  .tick {
    font: 500 12.5px var(--font-sans);
    fill: #6b7280;
    font-variant-numeric: tabular-nums;
  }
  .axis {
    font: 500 12.5px var(--font-sans);
    fill: #4b5563;
  }
  .name {
    font: 650 13.5px var(--font-sans);
    paint-order: stroke;
    stroke: #fff;
    stroke-width: 4px;
    stroke-linejoin: round;
    transition: opacity 0.3s ease 0.08s;
  }
  .name.code {
    font-weight: 800;
  }
  @media (prefers-reduced-motion: reduce) {
    .name {
      transition: none;
    }
  }
</style>
