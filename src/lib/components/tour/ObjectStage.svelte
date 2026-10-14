<script lang="ts">
  /**
   * The stage of the "estate to object" screen: one SVG, one coordinate space, every
   * glyph rendered once. All of it is a function of `t`; see lib/tour/object-stage.ts.
   */
  import { COLORS } from '$lib/tour/paint';
  import { TYPE_COLOR } from '$lib/tour/lenses';
  import {
    AT,
    GRID,
    LEFT,
    OBJ,
    PROGRAM,
    RIGHT,
    STAGE,
    ZOOM,
    cellPose,
    chipProgress,
    chipRect,
    closeUpOpacity,
    contractOpacity,
    ease,
    estateOpacity,
    findSweep,
    indexSweep,
    landed,
    landedCount,
    linkDraw,
    needleOpacity,
    poseAt,
    programLineOpacity,
    programOpacity,
    reach,
    recordFieldsOpacity,
    recordsOpacity,
    resultOpacity,
    seg,
    type Glyph,
    type ObjectStage,
    type RecordCard
  } from '$lib/tour/object-stage';
  import { shapeForDisplay, tokenizeLine, type AccessTrace, type ContractExcerpt, type ProgramBlocks } from '$lib/tour/object-trace';
  import { fmtTokens } from '$lib/tour/tokens';

  interface Props {
    /** Motion position, 0 .. 10. */
    t: number;
    /** What a screen reader hears for the current step. */
    label: string;
    stage: ObjectStage;
    trace: AccessTrace;
    code: string;
    blocks: ProgramBlocks;
    contract: ContractExcerpt;
    descriptionTokens: number;
    /** Fields stored on a resource that the object leaves out. */
    removedFields: string[];
  }
  let { t, label, stage, trace, code, blocks, contract, descriptionTokens, removedFields }: Props = $props();

  // ── derived from t ───────────────────────────────────────────────────────
  const poses = $derived(stage.glyphs.map((g) => poseAt(g, t)));
  /** While the close-up is up, what is left of the estate steps back; each glyph is back to full strength by the time it lands. */
  const estateDim = $derived(1 - 0.7 * ease(seg(t, AT.containers + 0.1, AT.containers + 0.8)));
  const glyphOpacity = (g: Glyph): number => (g.zoom ? 1 : estateDim + (1 - estateDim) * landed(g, t));
  const estateA = $derived(estateOpacity(t));
  const needleA = $derived(needleOpacity(t));
  const closeA = $derived(closeUpOpacity(t));
  const recA = $derived(recordsOpacity(t));
  const recFieldsA = $derived(recordFieldsOpacity(t));
  const nicLink = $derived(linkDraw('nic', t));
  const ipLink = $derived(linkDraw('pip', t));
  const chipU = $derived(stage.chips.map((c) => chipProgress(c, t)));
  const subsLanded = $derived(stage.chips.filter((c, i) => c.kind === 'subscription' && chipU[i] >= 0.999).length);
  const groupsLanded = $derived(stage.chips.filter((c, i) => c.kind === 'group' && chipU[i] >= 0.999).length);
  const resourcesLanded = $derived(landedCount(stage.glyphs, t));
  const tagA = $derived(ease(seg(t, AT.links + 0.8, AT.flatten)));
  const contractA = $derived(contractOpacity(t));
  const programA = $derived(programOpacity(t));
  const resultA = $derived(resultOpacity(t));
  const idN = $derived(indexSweep(trace.idReads, t));
  const nameN = $derived(findSweep(trace.nameReadUpTo, t));
  /** How far into each access step we are: 0 before it, 1 once it has arrived. */
  const vmFound = $derived(reach(AT.find, t));
  const nicFound = $derived(reach(AT.nic, t));
  const pipFound = $derived(reach(AT.ip, t));
  const returned = $derived(reach(AT.return, t));
  const usedN = $derived([AT.find, AT.nic, AT.ip].filter((s) => t >= s - 0.5).length);
  const backShown = $derived(t >= AT.return - 0.5);
  const pillA = $derived(ease(seg(t, AT.program + 0.1, AT.program + 0.3)) * (1 - ease(seg(t, AT.find + 0.1, AT.find + 0.5))));
  const pillText = $derived(t < AT.index + 0.05 ? `id read on ${idN} records` : `name read on ${nameN} records, stopped at [${trace.nameReadUpTo}]`);

  // ── the program panel ────────────────────────────────────────────────────
  const PANEL = { x: LEFT.x, y: LEFT.y, w: LEFT.w, h: PROGRAM.h } as const;
  const LINE_H = PROGRAM.lineH;
  const lines = $derived(code.split('\n'));
  const lineTokens = $derived(lines.map((l) => tokenizeLine(l)));
  const lineTop = (i: number): number => PANEL.y + PROGRAM.top + i * LINE_H;
  /** The counters sit under the panel, and the answer card fills the rest of the left zone. */
  const TILES_Y = PANEL.y + PANEL.h + 12;
  const RESULT_Y = TILES_Y + 70 + 12;
  const RESULT_H = LEFT.y + LEFT.h - RESULT_Y;

  /** The five blocks, with the step each belongs to. */
  const bands = $derived([
    { at: AT.index, block: blocks.index },
    { at: AT.find, block: blocks.find },
    { at: AT.nic, block: blocks.nic },
    { at: AT.ip, block: blocks.ip },
    { at: AT.return, block: blocks.ret }
  ]);
  /** Bright while its step is current, faint once the program has moved on. */
  function bandOpacity(at: number): number {
    return 0.95 * ease(seg(t, at - 1 + 0.15, at - 0.25)) * (1 - 0.78 * ease(seg(t, at, at + 0.35)));
  }

  // ── the contract panel ───────────────────────────────────────────────────
  const shape = $derived(shapeForDisplay(contract.shape));

  // ── glyph ring: what the runtime has read ────────────────────────────────
  const isFocal = (g: Glyph): boolean => g.focus !== null;
  function ringOf(g: Glyph): { stroke: string; width: number; opacity: number; dash: string | null } {
    const i = g.index;
    if (i < nameN) return { stroke: COLORS.scanned, width: 2.1, opacity: 1, dash: null };
    if (i < idN) return { stroke: '#5EEAD4', width: 1.3, opacity: 0.95, dash: null };
    if (isFocal(g) && tagA > 0) return { stroke: COLORS.needle, width: 1.5, opacity: tagA, dash: '2.5 2' };
    return { stroke: 'none', width: 0, opacity: 0, dash: null };
  }

  // ── the close-up ─────────────────────────────────────────────────────────
  const panelX = ZOOM.osDisk.cx - ZOOM.osDisk.w / 2 - 16;
  const panelY = ZOOM.vm.cy - ZOOM.vm.h / 2 - 42;
  const panelBottom = ZOOM.pip.cy + ZOOM.pip.h / 2 + 30;
  const diskCount = $derived(stage.glyphs.filter((g) => g.zoom && (g.role === 'osDisk' || g.role === 'dataDisk')).length);

  // ── the three records ────────────────────────────────────────────────────
  const found = $derived([
    { index: stage.focus.vm, a: vmFound },
    { index: stage.focus.nic, a: nicFound },
    { index: stage.focus.pip, a: pipFound }
  ]);
  const reached = (r: RecordCard): number => (r.role === 'vm' ? vmFound : r.role === 'nic' ? nicFound : pipFound);
  const BRACKET_X = RIGHT.x + OBJ.padX + OBJ.recordW + 16;
  const brackets = $derived([
    { from: stage.records[0], to: stage.records[1], draw: nicLink, found: nicFound },
    { from: stage.records[1], to: stage.records[2], draw: ipLink, found: pipFound }
  ]);
  const recordRight = RIGHT.x + OBJ.padX + OBJ.recordW;
  const fieldX = (col: number): number => GRID.x + 16 + col * 282;

  const back = $derived(JSON.stringify(trace.result));
</script>

<svg
  class="stage"
  viewBox="0 0 {STAGE.w} {STAGE.h}"
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label={label}
  xmlns="http://www.w3.org/2000/svg"
>
  {#snippet glyph(g: Glyph, i: number)}
    {@const p = poses[i]}
    {@const ring = ringOf(g)}
    <rect
      x={p.cx - p.w / 2}
      y={p.cy - p.h / 2}
      width={p.w}
      height={p.h}
      rx={p.r}
      fill={g.color}
      opacity={glyphOpacity(g)}
      stroke={ring.stroke}
      stroke-width={ring.width}
      stroke-opacity={ring.opacity}
      stroke-dasharray={ring.dash}
    ><title>{g.name} ({g.type}) is resources[{g.index}]</title></rect>
  {/snippet}

  <!-- ═════════ the estate (left) ═════════ -->
  <g class="estate" opacity={estateA}>
    {#each stage.groups as g (g.name)}
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="11" class="group" />
      {#each g.pods as p (p.unitId)}
        <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="7" class={p.kind === 'vm' ? 'pod' : 'pod loose'} />
      {/each}
    {/each}
  </g>

  <!-- the pod the question is about -->
  {#each stage.groups as g (g.name)}
    {#each g.pods.filter((p) => p.focus) as p (p.unitId)}
      <rect x={p.x - 3} y={p.y - 3} width={p.w + 6} height={p.h + 6} rx="9" class="needle" opacity={needleA} />
    {/each}
  {/each}

  <!-- ═════════ the object (right) ═════════ -->
  <g class="object">
    <rect x={RIGHT.x} y={RIGHT.y} width={RIGHT.w} height={RIGHT.h} rx="14" class="obj-card" />
    <text x={GRID.x} y={RIGHT.y + 29} class="obj-title"><tspan class="brace">{'{ } '}</tspan>data</text>
    <g transform="translate({RIGHT.x + RIGHT.w - OBJ.padX - 214} {RIGHT.y + 12})">
      <rect width="214" height="24" rx="12" class="obj-tag" />
      <text x="107" y="16" text-anchor="middle" class="obj-tag-text">plain object, in the runtime</text>
    </g>
    <line x1={RIGHT.x} x2={RIGHT.x + RIGHT.w} y1={RIGHT.y + OBJ.headerH} y2={RIGHT.y + OBJ.headerH} class="rule" />

    <text x={GRID.x} y={OBJ.generatedAtY} class="row"><tspan class="key">generatedAt</tspan><tspan class="punct">{': '}</tspan><tspan class="str">{`"${stage.generatedAt}"`}</tspan></text>

    <text x={GRID.x} y={OBJ.subsLabelY} class="row"><tspan class="key">subscriptions</tspan><tspan class="count">{` [${subsLanded}]`}</tspan></text>
    <text x={RIGHT.x + RIGHT.w - OBJ.padX} y={OBJ.subsLabelY} text-anchor="end" class="hint">{'{ id, name }'}</text>

    <text x={GRID.x} y={OBJ.groupsLabelY} class="row"><tspan class="key">resourceGroups</tspan><tspan class="count">{` [${groupsLanded}]`}</tspan></text>
    <text x={RIGHT.x + RIGHT.w - OBJ.padX} y={OBJ.groupsLabelY} text-anchor="end" class="hint">{'{ name, subscriptionId, location }'}</text>

    <text x={GRID.x} y={OBJ.resourcesLabelY} class="row"><tspan class="key">resources</tspan><tspan class="count">{` [${resourcesLanded}]`}</tspan></text>
    <text x={RIGHT.x + RIGHT.w - OBJ.padX} y={OBJ.resourcesLabelY} text-anchor="end" class="hint" opacity={1 - pillA}>one flat list, one cell per resource</text>
    <text x={RIGHT.x + RIGHT.w - OBJ.padX} y={OBJ.resourcesLabelY} text-anchor="end" class="pill-text" opacity={pillA}>{pillText}</text>

    <!-- empty slots where the chips and the resources will land -->
    {#each stage.chips as c (c.key)}
      <rect x={c.toRect.x} y={c.toRect.y} width={c.toRect.w} height={c.toRect.h} rx="7" class="slot" />
    {/each}
    {#each stage.glyphs as g (g.id)}
      {@const c = cellPose(g.index)}
      <rect x={c.cx - c.w / 2} y={c.cy - c.h / 2} width={c.w} height={c.h} rx="2.5" class="ghost" />
    {/each}

  </g>

  <!-- ═════════ the three records ═════════ -->
  <g class="records" opacity={recA}>
    <text x={GRID.x} y={OBJ.recordsY - 14} class="section">the three records this question needs</text>

    {#each brackets as b, i (i)}
      {@const y0 = b.from.y + 58}
      {@const y1 = b.to.y + 18}
      {@const d = `M${recordRight} ${y0} H${BRACKET_X} V${y1} H${recordRight + 5}`}
      <path {d} pathLength="1" class="bracket" class:on={b.found > 0.5} stroke-dasharray="1" stroke-dashoffset={1 - b.draw} />
      <polygon
        points="{recordRight + 4},{y1} {recordRight + 12},{y1 - 4} {recordRight + 12},{y1 + 4}"
        class="bracket-head"
        class:on={b.found > 0.5}
        opacity={seg(b.draw, 0.85, 1)}
      />
    {/each}

    {#each stage.records as r (r.role)}
      {@const found = reached(r)}
      <g>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="10" class="record" class:found={found > 0.5} />
        <!-- icon -->
        {#if r.role === 'vm'}
          <rect x={r.x + 11} y={r.y + 10} width="16" height="16" rx="4" fill={TYPE_COLOR[r.type]} />
        {:else if r.role === 'nic'}
          <circle cx={r.x + 19} cy={r.y + 18} r="7.5" fill={TYPE_COLOR[r.type]} />
        {:else}
          <rect x={r.x + 13} y={r.y + 12} width="12" height="12" rx="2.5" fill={TYPE_COLOR[r.type]} />
        {/if}
        <text x={r.x + 36} y={r.y + 23} class="rec-name">{r.name}</text>
        <text x={r.x + r.w - 76} y={r.y + 23} text-anchor="end" class="rec-type">{r.type}</text>
        <text x={r.x + r.w - 12} y={r.y + 23} text-anchor="end" class="rec-index" opacity={tagA}>{`[${r.index}]`}</text>
        {#each r.fields as f (f.key)}
          {@const linked = (f.kind === 'ref' || f.kind === 'id') && (r.role === 'vm' ? f.kind === 'ref' : true)}
          <text x={fieldX(f.col)} y={r.y + 46 + f.row * 20} class="field" opacity={recFieldsA}><tspan class="fkey">{f.key}</tspan><tspan class="punct">{': '}</tspan><tspan
              class="fval"
              class:link={linked}
              class:read={f.kind === 'read'}
              class:sent={f.kind === 'read' && returned > 0.5}>{f.value}</tspan></text>
        {/each}
      </g>
    {/each}
  </g>

  <!-- ═════════ the glyphs: one per resource, from the estate to its cell ═════════ -->
  <!-- the rest of the estate sits under the close-up panel, so the panel reads cleanly -->
  <g class="glyphs">
    {#each stage.glyphs as g, i (g.id)}
      {#if !g.zoom}{@render glyph(g, i)}{/if}
    {/each}
  </g>

  <!-- ═════════ the close-up of the pod (left, step 2) ═════════ -->
  <g class="closeup" opacity={closeA}>
    <rect x={panelX} y={panelY} width={LEFT.x + LEFT.w - panelX} height={panelBottom - panelY} rx="12" class="lift" />
    <text x={panelX + 16} y={panelY + 24} class="section">as the estate draws it</text>
    <!-- the lines that join them in the picture -->
    <line x1={ZOOM.vm.cx} x2={ZOOM.vm.cx} y1={ZOOM.vm.cy + ZOOM.vm.h / 2} y2={ZOOM.nic.cy - ZOOM.nic.h / 2} class="drawn" />
    <line x1={ZOOM.nic.cx} x2={ZOOM.nic.cx} y1={ZOOM.nic.cy + ZOOM.nic.h / 2} y2={ZOOM.pip.cy - ZOOM.pip.h / 2} class="drawn" />
    {#each [ZOOM.osDisk, ZOOM.dataDisk] as d, i (i)}
      <line x1={d.cx + d.w / 2} x2={ZOOM.vm.cx - ZOOM.vm.w / 2} y1={d.cy} y2={ZOOM.vm.cy + (i === 0 ? -5 : 5)} class="drawn thin" />
    {/each}
    <text x={ZOOM.nic.cx - ZOOM.nic.w / 2 - 12} y={ZOOM.nic.cy + 4} text-anchor="end" class="label">network interface</text>
    <text x={ZOOM.pip.cx - ZOOM.pip.w / 2 - 12} y={ZOOM.pip.cy + 4} text-anchor="end" class="label">public IP</text>
    <text x={ZOOM.osDisk.cx} y={ZOOM.dataDisk.cy + ZOOM.dataDisk.h / 2 + 17} text-anchor="middle" class="label">{diskCount} disks</text>
    <!-- the same three things, as records on the right -->
    {#each stage.records as r (r.role)}
      {@const z = ZOOM[r.role]}
      {@const cy = r.y + r.h / 2}
      <line x1={z.cx + z.w / 2 + 6} x2={r.x - 12} y1={cy} y2={cy} class="to-record" />
      <polygon points="{r.x - 4},{cy} {r.x - 12},{cy - 4} {r.x - 12},{cy + 4}" class="to-record-head" />
    {/each}
  </g>

  <!-- the pod's own glyphs travel above the close-up panel -->
  <g class="glyphs">
    {#each stage.glyphs as g, i (g.id)}
      {#if g.zoom}{@render glyph(g, i)}{/if}
    {/each}
  </g>

  <!-- the cells the program has found or followed -->
  <g class="found">
    {#each found as f (f.index)}
      {@const c = cellPose(f.index)}
      <rect x={c.cx - 9.5} y={c.cy - 9.5} width="19" height="19" rx="4.5" class="found-ring" opacity={f.a} />
    {/each}
    {#if vmFound > 0}
      {@const c = cellPose(stage.focus.vm)}
      <g opacity={vmFound}>
        <rect x={c.cx - 25} y={GRID.y - 26} width="50" height="17" rx="8.5" class="pin" />
        <polygon points="{c.cx - 4.5},{GRID.y - 9.5} {c.cx + 4.5},{GRID.y - 9.5} {c.cx},{GRID.y - 4}" class="pin" />
        <text x={c.cx} y={GRID.y - 14} text-anchor="middle" class="pin-text">found</text>
      </g>
    {/if}
  </g>

  <!-- ═════════ the headings that become entries (chips) ═════════ -->
  <g class="chips">
    {#each stage.chips as c, i (c.key)}
      {@const r = chipRect(c, t)}
      {@const u = chipU[i]}
      {@const cross = seg(u, 0.35, 0.8)}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="7" class="chip" fill-opacity={u} stroke-opacity={u} />
      <text x={r.x + 8} y={r.y + r.h / 2 + 4.5} class={c.kind === 'subscription' ? 'chip-label sub' : 'chip-label'}>{c.label}</text>
      <text x={r.x + r.w - 8} y={r.y + r.h / 2 + 4} text-anchor="end" class="chip-side" opacity={1 - cross}>{c.from.side}</text>
      <text x={r.x + r.w - 8} y={r.y + r.h / 2 + 4} text-anchor="end" class="chip-side to" opacity={cross}>{c.to.side}</text>
    {/each}
  </g>

  <!-- ═════════ the tool description (left, step 4) ═════════ -->
  <g class="contract" opacity={contractA} pointer-events="none">
    <rect x={LEFT.x} y={LEFT.y} width={LEFT.w} height="332" rx="12" class="dark" />
    <text x={LEFT.x + 18} y={LEFT.y + 25} class="dark-head">tool description, as sent to the model</text>
    <g transform="translate({LEFT.x + LEFT.w - 18} {LEFT.y + 10})">
      <text x="0" y="15" text-anchor="end" class="dark-tag">{`\u2248 ${fmtTokens(descriptionTokens)} tokens in all`}</text>
    </g>
    {#each shape as l, i (i)}
      <text x={LEFT.x + 24} y={LEFT.y + 66 + i * 22} class="code">{#each tokenizeLine(l.code) as tk, k (k)}<tspan class={tk.cls}>{tk.text}</tspan>{/each}{#if l.note}<tspan class="comment">{`  // ${l.note}`}</tspan>{/if}</text>
    {/each}
    {#each contract.references as l, i (i)}
      <text x={LEFT.x + 24} y={LEFT.y + 66 + shape.length * 22 + 20 + i * 20} class="code comment small">{`// ${l}`}</text>
    {/each}
    <line x1={LEFT.x + 18} x2={LEFT.x + LEFT.w - 18} y1={LEFT.y + 262} y2={LEFT.y + 262} class="dark-rule" />
    <text x={LEFT.x + 24} y={LEFT.y + 286} class="dark-head">left out of the object</text>
    {#each removedFields as f, i (f)}
      <text x={LEFT.x + 24 + i * 150} y={LEFT.y + 310} class="code struck">{f}</text>
    {/each}
    <text x={LEFT.x + LEFT.w - 18} y={LEFT.y + 310} text-anchor="end" class="dark-head quiet">stored on every resource, never projected</text>
  </g>

  <!-- ═════════ the program (left, steps 5-10) ═════════ -->
  <g class="program" opacity={programA}>
    <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} rx="12" class="dark" />
    <text x={PANEL.x + 18} y={PANEL.y + 25} class="code-title"><tspan class="strong">operate_inventory</tspan><tspan class="faint">{'({ code })'}</tspan></text>
    <g transform="translate({PANEL.x + PANEL.w - 18} {PANEL.y + 9})">
      <rect x="-86" width="86" height="22" rx="11" class="call-tag" />
      <text x="-43" y="15" text-anchor="middle" class="call-tag-text">1 tool call</text>
    </g>

    {#each bands as b (b.at)}
      {@const o = bandOpacity(b.at)}
      <rect
        x={PANEL.x + 5}
        y={lineTop(b.block[0]) - 1}
        width={PANEL.w - 10}
        height={(b.block[1] - b.block[0] + 1) * LINE_H + 2}
        rx="4"
        class="band"
        opacity={o}
      />
      <rect x={PANEL.x + 5} y={lineTop(b.block[0]) - 1} width="3" height={(b.block[1] - b.block[0] + 1) * LINE_H + 2} class="band-bar" opacity={o} />
    {/each}

    {#each lineTokens as toks, i (i)}
      <text x={PANEL.x + 16} y={lineTop(i) + 15} class="gutter" opacity={programLineOpacity(i, t)}>{i + 1}</text>
      <text x={PANEL.x + 46} y={lineTop(i) + 15} class="code" opacity={programLineOpacity(i, t)}>{#each toks as tk, k (k)}<tspan class={tk.cls}>{tk.text}</tspan>{/each}</text>
    {/each}

    <!-- counters: work the runtime did, against what the model was sent -->
    <g transform="translate({LEFT.x} {TILES_Y})">
      <rect width="216" height="70" rx="10" class="tile" />
      <text x="14" y="21" class="tile-label">scanned in the runtime</text>
      <text x="14" y="47" class="tile-value runtime">{Math.min(trace.scanned, idN)}</text>
      <text x="14" y="63" class="tile-sub">records read, no tokens</text>
    </g>
    <g transform="translate({LEFT.x + 232} {TILES_Y})">
      <rect width="216" height="70" rx="10" class="tile" />
      <text x="14" y="21" class="tile-label">records it used</text>
      <text x="14" y="47" class="tile-value runtime">{usedN}</text>
      <text x="14" y="63" class="tile-sub">of {trace.scanned}: found by name, then by id</text>
    </g>
    <g transform="translate({LEFT.x + 464} {TILES_Y})">
      <rect width="216" height="70" rx="10" class="tile" />
      <text x="14" y="21" class="tile-label">back to the model</text>
      <text x="14" y="47" class="tile-value sent">{backShown ? `\u2248 ${fmtTokens(trace.backTokens)}` : '\u2013'}</text>
      <text x="14" y="63" class="tile-sub">tokens: all it sees of the estate</text>
    </g>
  </g>

  <!-- ═════════ the answer (left, step 10) ═════════ -->
  <g class="result" opacity={resultA} transform="translate(0 {(1 - resultA) * 10})">
    <rect x={LEFT.x} y={RESULT_Y} width={LEFT.w} height={RESULT_H} rx="12" class="result-card" />
    <rect x={LEFT.x} y={RESULT_Y} width="5" height={RESULT_H} class="result-bar" />
    <text x={LEFT.x + 22} y={RESULT_Y + 25} class="result-label">back to the model</text>
    <text x={LEFT.x + 22} y={RESULT_Y + 58} class="result-json">{back}</text>
    <text x={LEFT.x + 22} y={RESULT_Y + 82} class="result-sub">{`the whole tool message, \u2248 ${fmtTokens(trace.backTokens)} tokens; the ${stage.counts.resources} records stayed in the runtime`}</text>
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

  /* ── estate ── */
  .group {
    fill: #fff;
    stroke: var(--color-border-strong, #cbd5e1);
    stroke-width: 1.2;
  }
  .pod {
    fill: #f8fafc;
    stroke: #e2e8f0;
    stroke-width: 1;
  }
  .pod.loose {
    fill: #fbfdff;
    stroke: #edf1f6;
  }
  .needle {
    fill: none;
    stroke: #0f172a;
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
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
  .slot {
    fill: none;
    stroke: #cbd5e1;
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .ghost {
    fill: #eef2f7;
  }
  .pill-text {
    font: 700 11.5px var(--font-mono);
    fill: #0f766e;
  }
  .found-ring {
    fill: none;
    stroke: #0d9488;
    stroke-width: 2.2;
  }
  .pin {
    fill: #0d9488;
  }
  .pin-text {
    font: 800 10.5px var(--font-sans);
    letter-spacing: 0.04em;
    fill: #fff;
  }

  /* ── chips ── */
  .chip {
    fill: #f0fdfa;
    stroke: #5eead4;
    stroke-width: 1;
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

  /* ── records ── */
  .section {
    font: 700 11px var(--font-sans);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    fill: #64748b;
  }
  .record {
    fill: #fff;
    stroke: #cbd5e1;
    stroke-width: 1.2;
    transition: stroke 0.2s, stroke-width 0.2s;
  }
  .record.found {
    stroke: #0d9488;
    stroke-width: 2.2;
  }
  .rec-name {
    font: 700 13px var(--font-mono);
    fill: #0f172a;
  }
  .rec-type {
    font: 500 11px var(--font-mono);
    fill: #64748b;
  }
  .rec-index {
    font: 700 11.5px var(--font-mono);
    fill: #0f766e;
  }
  .field {
    font: 500 12px var(--font-mono);
    white-space: pre;
  }
  .fkey {
    fill: #475569;
  }
  .fval {
    fill: #047857;
  }
  .fval.link {
    fill: #0f766e;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 3px;
  }
  .fval.read {
    font-weight: 700;
  }
  .fval.sent {
    fill: #4338ca;
  }
  .bracket {
    fill: none;
    stroke: #64748b;
    stroke-width: 2;
    transition: stroke 0.2s;
  }
  .bracket.on {
    stroke: #0d9488;
    stroke-width: 2.6;
  }
  .bracket-head {
    fill: #64748b;
  }
  .bracket-head.on {
    fill: #0d9488;
  }

  /* ── close-up ── */
  .lift {
    fill: #fff;
    stroke: #cbd5e1;
    stroke-width: 1.2;
    filter: drop-shadow(0 4px 12px rgba(15, 23, 42, 0.1));
  }
  .drawn {
    stroke: #94a3b8;
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .drawn.thin {
    stroke: #cbd5e1;
    stroke-width: 1.6;
  }
  .label {
    font: 500 11.5px var(--font-sans);
    fill: #64748b;
  }
  .to-record {
    stroke: #94a3b8;
    stroke-width: 1.4;
    stroke-dasharray: 4 4;
  }
  .to-record-head {
    fill: #94a3b8;
  }

  /* ── dark panels ── */
  .dark {
    fill: #0f172a;
  }
  .dark-head {
    font: 700 11px var(--font-sans);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    fill: #94a3b8;
  }
  .dark-head.quiet {
    letter-spacing: 0.02em;
    text-transform: none;
    font-weight: 500;
    fill: #64748b;
  }
  .dark-tag {
    font: 700 11.5px var(--font-mono);
    fill: #5eead4;
  }
  .dark-rule {
    stroke: #1e293b;
    stroke-width: 1;
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
  .code.struck {
    fill: #fca5a5;
    text-decoration: line-through;
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

  /* ── counters and the answer ── */
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
  .tile-sub {
    font: 500 11.5px var(--font-sans);
    fill: #64748b;
  }
  .result-card {
    fill: #eef2ff;
    stroke: #c7d2fe;
    stroke-width: 1.2;
  }
  .result-bar {
    fill: #6366f1;
  }
  .result-label {
    font: 700 11px var(--font-sans);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    fill: #4338ca;
  }
  .result-json {
    font: 700 17px var(--font-mono);
    fill: #1e1b4b;
  }
  .result-sub {
    font: 500 12px var(--font-sans);
    fill: #475569;
  }
</style>
