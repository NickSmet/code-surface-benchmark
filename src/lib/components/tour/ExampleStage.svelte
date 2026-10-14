<script lang="ts">
  /**
   * The stage of the "code surface in practice" screen: the object screen's stage with a program
   * running on it. One SVG in the same 1400 x 680 space; every glyph is the one the object screen
   * drew, and everything on it is a function of `u` (see lib/tour/example-stage.ts).
   */
  import { COLORS } from '$lib/tour/paint';
  import { GRID, OBJ, RIGHT, STAGE, cellPose, type Glyph, type ObjectStage } from '$lib/tour/object-stage';
  import { tokenizeLine } from '$lib/tour/object-trace';
  import {
    CODE_TOP,
    CODE_X,
    PANEL,
    answerAt,
    bodyBand,
    chromeAt,
    lineAlpha,
    retBand,
    reviewAt,
    settledAt,
    sweepAt,
    wrapWords,
    type ExampleView
  } from '$lib/tour/example-stage';
  import { fmtTokens } from '$lib/tour/tokens';

  interface Props {
    stage: ObjectStage;
    view: ExampleView;
    /** Motion position: below 0 the program is written, 1 the run, 2 the answer, 3 the review. */
    u: number;
    /** What a screen reader hears for the current beat. */
    label: string;
    /** What a person decided about the change set. */
    decision?: 'pending' | 'approved' | 'declined';
    /** The page draws the program itself (a text box sits over the panel). */
    editing?: boolean;
    /** A run is in flight. */
    running?: boolean;
  }
  let { stage, view, u, label, decision = 'pending', editing = false, running = false }: Props = $props();

  // ── motion ───────────────────────────────────────────────────────────────
  const total = $derived(stage.glyphs.length);
  const sweep = $derived(sweepAt(u));
  const sweepN = $derived(sweep * total);
  const settled = $derived(settledAt(u));
  const chrome = $derived(chromeAt(u));
  const answerA = $derived(answerAt(u));
  const reviewA = $derived(reviewAt(u));
  const bodyA = $derived(bodyBand(u));
  const retA = $derived(retBand(u));

  // ── the program ──────────────────────────────────────────────────────────
  const lh = $derived(view.lineHeight);
  const tokens = $derived(view.lines.map((l) => tokenizeLine(l)));
  const lineTop = (i: number): number => PANEL.y + CODE_TOP + i * lh;
  const rationale = $derived(view.rationale ? wrapWords(`rationale: ${view.rationale}`, 82) : []);
  const bands = $derived(
    [
      { block: view.body, a: bodyA * 0.95 },
      ...(view.ret ? [{ block: view.ret, a: retA * 0.95 }] : [])
    ].filter((b) => b.a > 0.01)
  );

  // ── the object ───────────────────────────────────────────────────────────
  const depth = (g: Glyph): number => view.marks.depth[g.id] ?? 0;
  function ringOf(g: Glyph): { stroke: string; width: number; opacity: number } | null {
    if (view.marks.refused.has(g.id) && settled > 0) return { stroke: '#DC2626', width: 2.6, opacity: settled };
    const d = depth(g);
    if (d === 0 || g.index >= sweepN) return null;
    const heat = Math.min(1, (d - 1) / 4);
    return { stroke: heat > 0.5 ? COLORS.scanned : '#5EEAD4', width: 1.1 + 1.3 * heat, opacity: 0.8 + 0.2 * heat };
  }
  const isWritten = (g: Glyph): boolean => view.marks.written.has(g.id) && settled > 0.5 && decision !== 'declined';
  const isUsed = (g: Glyph): boolean => view.marks.used.has(g.id) && !view.marks.written.has(g.id) && settled > 0;

  const groupChips = $derived(stage.chips.filter((c) => c.kind === 'group'));
  const groupName = (key: string): string => key.slice('group:'.length);
  const groupScanned = (key: string, j: number): boolean => view.marks.scannedGroups.has(groupName(key)) && j < sweep * groupChips.length;
  const groupUsed = (key: string): boolean => view.marks.usedGroups.has(groupName(key)) && settled > 0;

  // ── the counters and the answer ──────────────────────────────────────────
  const c = $derived(view.counters);
  const scannedShown = $derived(
    c.scannedUnit === 'groups'
      ? Math.round(sweep * c.scanned)
      : stage.glyphs.reduce((n, g) => n + (depth(g) > 0 && g.index < sweepN ? 1 : 0), 0)
  );
  const usedShown = $derived(Math.round(settled * c.used));
  const tokensShown = $derived(answerA > 0.05);

  const PAD = OBJ.padX;
  const CARD_X = RIGHT.x + PAD;
  const CARD_W = RIGHT.w - 2 * PAD;
  const TILE_GAP = 10;
  const TILE_W = (CARD_W - 2 * TILE_GAP) / 3;
  const TILES_Y = 372;
  const TILE_H = 64;
  const ANSWER_Y = TILES_Y + TILE_H + 14;
  const ANSWER_H = RIGHT.y + RIGHT.h - 12 - ANSWER_Y;
  const LINE_Y0 = 52;
  const ANSWER_LINE = 19;

  const bad = $derived(view.answer.tone === 'bad');
  const decisionText = $derived(
    decision === 'approved' ? 'approved: applied to this copy of the estate' : decision === 'declined' ? 'declined: nothing changed' : 'waiting for a person'
  );
</script>

<svg
  class="stage"
  viewBox="0 0 {STAGE.w} {STAGE.h}"
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label={label}
  xmlns="http://www.w3.org/2000/svg"
>
  <!-- ═════════ the program (left) ═════════ -->
  <g class="program">
    <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} rx="12" class="dark" />
    <text x={PANEL.x + 18} y={PANEL.y + 25} class="code-title"><tspan class="strong">operate_inventory</tspan><tspan class="faint">{view.rationale ? '({ code, rationale })' : '({ code })'}</tspan></text>
    <g transform="translate({PANEL.x + PANEL.w - 18} {PANEL.y + 9})">
      <rect x="-86" width="86" height="22" rx="11" class="call-tag" />
      <text x="-43" y="15" text-anchor="middle" class="call-tag-text">{running ? 'running\u2026' : '1 tool call'}</text>
    </g>

    {#each bands as b, k (k)}
      <rect x={PANEL.x + 5} y={lineTop(b.block[0]) - 1} width={PANEL.w - 10} height={(b.block[1] - b.block[0] + 1) * lh + 2} rx="4" class="band" opacity={b.a} />
      <rect x={PANEL.x + 5} y={lineTop(b.block[0]) - 1} width="3" height={(b.block[1] - b.block[0] + 1) * lh + 2} class="band-bar" opacity={b.a} />
    {/each}

    {#each tokens as toks, i (i)}
      <text x={PANEL.x + 16} y={lineTop(i) + lh * 0.7} class="gutter" opacity={lineAlpha(i, u)}>{i + 1}</text>
      <!-- while the program is being edited, a text box sits over this and draws the text itself -->
      {#if !editing}
        <text x={PANEL.x + CODE_X} y={lineTop(i) + lh * 0.7} class="code" opacity={lineAlpha(i, u)}>{#each toks as tk, k (k)}<tspan class={tk.cls}>{tk.text}</tspan>{/each}</text>
      {/if}
    {/each}
    {#each rationale as line, i (i)}
      <text x={PANEL.x + 16} y={lineTop(view.lines.length) + 16 + i * 16} class="code small comment" opacity={lineAlpha(view.lines.length, u)}>{`// ${line}`}</text>
    {/each}
  </g>

  <!-- ═════════ the object (right) ═════════ -->
  <g class="object">
    <rect x={RIGHT.x} y={RIGHT.y} width={RIGHT.w} height={RIGHT.h} rx="14" class="obj-card" />
    <text x={GRID.x} y={RIGHT.y + 29} class="obj-title"><tspan class="brace">{'{ } '}</tspan>data</text>
    <g transform="translate({RIGHT.x + RIGHT.w - PAD - 214} {RIGHT.y + 12})">
      <rect width="214" height="24" rx="12" class="obj-tag" />
      <text x="107" y="16" text-anchor="middle" class="obj-tag-text">plain object, in the runtime</text>
    </g>
    <line x1={RIGHT.x} x2={RIGHT.x + RIGHT.w} y1={RIGHT.y + OBJ.headerH} y2={RIGHT.y + OBJ.headerH} class="rule" />

    <text x={GRID.x} y={OBJ.generatedAtY} class="row"><tspan class="key">generatedAt</tspan><tspan class="punct">{': '}</tspan><tspan class="str">{`"${stage.generatedAt}"`}</tspan></text>
    <text x={GRID.x} y={OBJ.subsLabelY} class="row"><tspan class="key">subscriptions</tspan><tspan class="count">{` [${stage.counts.subscriptions}]`}</tspan></text>
    <text x={RIGHT.x + RIGHT.w - PAD} y={OBJ.subsLabelY} text-anchor="end" class="hint">{'{ id, name }'}</text>
    <text x={GRID.x} y={OBJ.groupsLabelY} class="row"><tspan class="key">resourceGroups</tspan><tspan class="count">{` [${stage.counts.groups}]`}</tspan></text>
    <text x={RIGHT.x + RIGHT.w - PAD} y={OBJ.groupsLabelY} text-anchor="end" class="hint">{'{ name, subscriptionId, location }'}</text>
    <text x={GRID.x} y={OBJ.resourcesLabelY} class="row"><tspan class="key">resources</tspan><tspan class="count">{` [${stage.counts.resources}]`}</tspan></text>
    <text x={RIGHT.x + RIGHT.w - PAD} y={OBJ.resourcesLabelY} text-anchor="end" class="hint">ring: read in the runtime  {'\u00b7'}  dashed: used  {'\u00b7'}  green: changed</text>

    <!-- the headings, as the entries they became -->
    {#each stage.chips as ch (ch.key)}
      {@const j = groupChips.findIndex((x) => x.key === ch.key)}
      {@const scannedChip = ch.kind === 'group' && groupScanned(ch.key, j)}
      {@const usedChip = ch.kind === 'group' && groupUsed(ch.key)}
      <rect x={ch.toRect.x} y={ch.toRect.y} width={ch.toRect.w} height={ch.toRect.h} rx="7" class="chip" class:scanned={scannedChip} />
      {#if usedChip}
        <rect x={ch.toRect.x - 3} y={ch.toRect.y - 3} width={ch.toRect.w + 6} height={ch.toRect.h + 6} rx="9" class="needle" opacity={settled} />
      {/if}
      <text x={ch.toRect.x + 8} y={ch.toRect.y + ch.toRect.h / 2 + 4.5} class={ch.kind === 'subscription' ? 'chip-label sub' : 'chip-label'}>{ch.label}</text>
      <text x={ch.toRect.x + ch.toRect.w - 8} y={ch.toRect.y + ch.toRect.h / 2 + 4} text-anchor="end" class="chip-side to">{ch.to.side}</text>
    {/each}

    <!-- one cell per resource -->
    {#each stage.glyphs as g (g.id)}
      {@const p = cellPose(g.index)}
      {@const ring = ringOf(g)}
      {@const written = isWritten(g)}
      <rect
        x={p.cx - p.w / 2}
        y={p.cy - p.h / 2}
        width={p.w}
        height={p.h}
        rx={p.r}
        class="cell"
        style:fill={written ? COLORS.written : g.color}
        stroke={ring?.stroke ?? 'none'}
        stroke-width={ring?.width ?? 0}
        stroke-opacity={ring?.opacity ?? 0}
      ><title>{g.name} ({g.type}) is resources[{g.index}]{depth(g) > 0 ? `, ${depth(g)} fields read` : ''}</title></rect>
      {#if isUsed(g)}
        <rect x={p.cx - 8.5} y={p.cy - 8.5} width="17" height="17" rx="4" class="used-ring" opacity={settled} />
      {/if}
    {/each}

    <!-- ═════════ the counters ═════════ -->
    <g opacity={chrome}>
      <g transform="translate({CARD_X} {TILES_Y})">
        <rect width={TILE_W} height={TILE_H} rx="10" class="tile" />
        <text x="12" y="20" class="tile-label">scanned in the runtime</text>
        <text x="12" y="44" class="tile-value runtime">{scannedShown.toLocaleString('en-US')}{c.scannedUnit === 'groups' ? ' groups' : ''}</text>
        <text x="12" y="58" class="tile-sub">{`${c.reads.toLocaleString('en-US')} field reads, no tokens`}</text>
      </g>
      <g transform="translate({CARD_X + TILE_W + TILE_GAP} {TILES_Y})">
        <rect width={TILE_W} height={TILE_H} rx="10" class="tile" />
        <text x="12" y="20" class="tile-label">{c.usedLabel}</text>
        <text x="12" y="44" class="tile-value runtime">{usedShown.toLocaleString('en-US')}</text>
        <text x="12" y="58" class="tile-sub">{c.usedSub}</text>
      </g>
      <g transform="translate({CARD_X + 2 * (TILE_W + TILE_GAP)} {TILES_Y})">
        <rect width={TILE_W} height={TILE_H} rx="10" class="tile" />
        <text x="12" y="20" class="tile-label">back to the model</text>
        <text x="12" y="44" class="tile-value" class:sent={!bad} class:refused={bad}>{tokensShown ? `\u2248 ${fmtTokens(c.tokens)}` : '\u2013'}</text>
        <text x="12" y="58" class="tile-sub">{c.tokensSub}</text>
      </g>
    </g>

    <!-- ═════════ what comes back ═════════ -->
    <g opacity={chrome}>
      <rect x={CARD_X} y={ANSWER_Y} width={CARD_W} height={ANSWER_H} rx="12" class="waiting" opacity={1 - answerA} />
      <text x={CARD_X + CARD_W / 2} y={ANSWER_Y + ANSWER_H / 2 + 4} text-anchor="middle" class="waiting-text" opacity={1 - answerA}>what comes back to the model will appear here</text>
    </g>

    <g opacity={answerA * (1 - reviewA)} transform="translate(0 {(1 - answerA) * 10})">
      <rect x={CARD_X} y={ANSWER_Y} width={CARD_W} height={ANSWER_H} rx="12" class="result-card" class:bad />
      <rect x={CARD_X} y={ANSWER_Y} width="5" height={ANSWER_H} class="result-bar" class:bad />
      <text x={CARD_X + 22} y={ANSWER_Y + 24} class="result-label" class:bad>{view.answer.label}</text>
      <text x={CARD_X + CARD_W - 16} y={ANSWER_Y + 24} text-anchor="end" class="result-tokens" class:bad>{`\u2248 ${fmtTokens(view.answer.tokens)} tokens`}</text>
      {#each view.answer.lines as line, i (i)}
        <text x={CARD_X + 22} y={ANSWER_Y + LINE_Y0 + i * ANSWER_LINE} class="result-json" class:bad>{line}</text>
      {/each}
      {#if view.answer.more > 0}
        <text x={CARD_X + 22} y={ANSWER_Y + LINE_Y0 + view.answer.lines.length * ANSWER_LINE} class="result-more">{`\u2026 and ${view.answer.more.toLocaleString('en-US')} more`}</text>
      {/if}
    </g>

    {#if view.review}
      <g opacity={reviewA} transform="translate(0 {(1 - reviewA) * 10})">
        <rect x={CARD_X} y={ANSWER_Y} width={CARD_W} height={ANSWER_H} rx="12" class="review-card" />
        <rect x={CARD_X} y={ANSWER_Y} width="5" height={ANSWER_H} class="review-bar" class:declined={decision === 'declined'} />
        <text x={CARD_X + 22} y={ANSWER_Y + 24} class="review-label">change set, for review</text>
        <text x={CARD_X + CARD_W - 16} y={ANSWER_Y + 24} text-anchor="end" class="review-state" class:declined={decision === 'declined'}>{decisionText}</text>
        {#each view.review.rows as r, i (r.name)}
          <text x={CARD_X + 22} y={ANSWER_Y + LINE_Y0 - 4 + i * 17} class="review-row"><tspan class="rn">{r.name}</tspan><tspan class="rc" dx="14">{r.changes}</tspan></text>
        {/each}
        {#if view.review.hidden > 0}
          <text x={CARD_X + 22} y={ANSWER_Y + LINE_Y0 - 4 + view.review.rows.length * 17} class="result-more">{`\u2026 and ${view.review.hidden.toLocaleString('en-US')} more resources`}</text>
        {/if}
        <text x={CARD_X + 22} y={ANSWER_Y + ANSWER_H - 12} class="review-sum">{`${view.review.resources} resources, ${view.review.fields} fields  \u00b7  ${view.review.summary}`}</text>
      </g>
    {/if}
  </g>
</svg>

<style>
  .stage {
    display: block;
    width: 100%;
    height: 100%;
    font-family: inherit;
    overflow: visible;
    text-rendering: geometricPrecision;
  }

  /* ── object ── */
  .obj-card {
    fill: #fff;
    stroke: #94a3b8;
    stroke-width: 1.5;
    filter: drop-shadow(0 3px 10px rgba(15, 23, 42, 0.07));
  }
  .obj-title {
    font: 800 16px var(--font-mono);
    fill: #0f172a;
  }
  .brace {
    fill: #0d9488;
  }
  .obj-tag {
    fill: #f0fdfa;
    stroke: #99f6e4;
  }
  .obj-tag-text {
    font: 700 11px var(--font-sans);
    fill: #0f766e;
  }
  .rule {
    stroke: #e2e8f0;
    stroke-width: 1;
  }
  .row {
    font: 600 13px var(--font-mono);
    white-space: pre;
  }
  .key {
    fill: #0f172a;
    font-weight: 700;
  }
  .punct {
    fill: #94a3b8;
  }
  .str {
    fill: #047857;
    font-weight: 500;
  }
  .count {
    fill: #64748b;
    font-weight: 600;
  }
  .hint {
    font: 500 11.5px var(--font-mono);
    fill: #94a3b8;
  }

  /* ── chips, cells ── */
  .chip {
    fill: #f0fdfa;
    stroke: #5eead4;
    stroke-width: 1;
    transition: stroke 0.2s, stroke-width 0.2s;
  }
  .chip.scanned {
    stroke: #0d9488;
    stroke-width: 2.2;
  }
  .chip-label {
    font: 700 12.5px var(--font-sans);
    fill: #0f172a;
  }
  .chip-label.sub {
    font-size: 13px;
  }
  .chip-side {
    font: 500 11px var(--font-mono);
    fill: #64748b;
  }
  .chip-side.to {
    fill: #0f766e;
  }
  .needle {
    fill: none;
    stroke: #0f172a;
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  .cell {
    transition: fill 0.25s;
  }
  .used-ring {
    fill: none;
    stroke: #0f172a;
    stroke-width: 1.4;
    stroke-dasharray: 2.5 2;
  }

  /* ── dark panel ── */
  .dark {
    fill: #0f172a;
  }
  .code {
    font: 500 12.5px var(--font-mono);
    fill: #e2e8f0;
    white-space: pre;
  }
  .code.small {
    font-size: 12px;
  }
  .code .comment,
  .code.comment {
    fill: #94a3b8;
    font-style: italic;
  }
  .code .keyword {
    fill: #c4b5fd;
  }
  .code .string {
    fill: #86efac;
  }
  .code .number {
    fill: #fca5a5;
  }
  .code-title {
    font: 500 13px var(--font-mono);
    fill: #e2e8f0;
  }
  .code-title .strong {
    font-weight: 700;
  }
  .code-title .faint {
    fill: #94a3b8;
  }
  .call-tag {
    fill: #134e4a;
  }
  .call-tag-text {
    font: 700 11px var(--font-sans);
    fill: #5eead4;
  }
  .gutter {
    font: 500 11.5px var(--font-mono);
    fill: #475569;
  }
  .band {
    fill: #2dd4bf;
    fill-opacity: 0.17;
  }
  .band-bar {
    fill: #2dd4bf;
  }

  /* ── counters ── */
  .tile {
    fill: #fff;
    stroke: #e2e8f0;
    stroke-width: 1.2;
  }
  .tile-label {
    font: 700 10.5px var(--font-sans);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    fill: #64748b;
  }
  .tile-value {
    font: 800 22px var(--font-sans);
    font-variant-numeric: tabular-nums;
  }
  .tile-value.runtime {
    fill: #0f766e;
  }
  .tile-value.sent {
    fill: #4338ca;
  }
  .tile-value.refused {
    fill: #b91c1c;
  }
  .tile-sub {
    font: 500 11.5px var(--font-sans);
    fill: #64748b;
  }

  /* ── the answer ── */
  .waiting {
    fill: none;
    stroke: #cbd5e1;
    stroke-width: 1.2;
    stroke-dasharray: 5 5;
  }
  .waiting-text {
    font: 500 12.5px var(--font-sans);
    fill: #94a3b8;
  }
  .result-card {
    fill: #eef2ff;
    stroke: #c7d2fe;
    stroke-width: 1.2;
  }
  .result-card.bad {
    fill: #fef2f2;
    stroke: #fecaca;
  }
  .result-bar {
    fill: #6366f1;
  }
  .result-bar.bad {
    fill: #dc2626;
  }
  .result-label {
    font: 700 11px var(--font-sans);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    fill: #4338ca;
  }
  .result-label.bad {
    fill: #b91c1c;
  }
  .result-tokens {
    font: 700 12.5px var(--font-sans);
    fill: #4338ca;
  }
  .result-tokens.bad {
    fill: #b91c1c;
  }
  .result-json {
    font: 600 12.5px var(--font-mono);
    fill: #1e1b4b;
    white-space: pre;
  }
  .result-json.bad {
    fill: #7f1d1d;
  }
  .result-more {
    font: 500 12px var(--font-mono);
    fill: #64748b;
  }

  /* ── the change set ── */
  .review-card {
    fill: #ecfdf5;
    stroke: #a7f3d0;
    stroke-width: 1.2;
  }
  .review-bar {
    fill: #059669;
    transition: fill 0.2s;
  }
  .review-bar.declined {
    fill: #94a3b8;
  }
  .review-label {
    font: 700 11px var(--font-sans);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    fill: #047857;
  }
  .review-state {
    font: 700 12.5px var(--font-sans);
    fill: #047857;
  }
  .review-state.declined {
    fill: #64748b;
  }
  .review-row {
    font: 600 12.5px var(--font-mono);
    white-space: pre;
  }
  .rn {
    fill: #064e3b;
  }
  .rc {
    fill: #047857;
    font-weight: 500;
  }
  .review-sum {
    font: 600 12px var(--font-sans);
    fill: #047857;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell,
    .chip,
    .review-bar {
      transition: none;
    }
  }
</style>
