<script lang="ts">
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { Check, ChevronRight, Play, Plus, X } from '@lucide/svelte';
  import solutionDoc from '../../../../docs/solution-path-examples.md?raw';
  import { buildInventory } from '$lib/inventory/fixtures/builders';
  import { buildProjection } from '$lib/inventory/projection';
  import BillLine from '$lib/components/tour/BillLine.svelte';
  import FlowLine from '$lib/components/tour/FlowLine.svelte';
  import RunBar from '$lib/components/tour/RunBar.svelte';
  import RunLegend from '$lib/components/tour/RunLegend.svelte';
  import StatTile from '$lib/components/tour/StatTile.svelte';
  import Tip from '$lib/components/tour/Tip.svelte';
  import TourNav from '$lib/components/tour/TourNav.svelte';
  import { compareSurfaces } from '$lib/tour/code-view';
  import { runTracked } from '$lib/tour/code-run';
  import { CACHE_TIP } from '$lib/tour/explain';
  import {
    EXAMPLE_QUERIES,
    FEATURES,
    FEATURE_IDS,
    FRESH_QUESTIONS,
    TASK_LABEL,
    buildLadder,
    coverage,
    definitionTokens,
    keywords,
    queryContent,
    queryTool,
    rungFacts,
    runQuery,
    type FeatureId,
    type QueryOut,
    type RungId
  } from '$lib/tour/language';
  import { parseSolutionPrograms } from '$lib/tour/programs';
  import { callId, toolMessageTokens } from '$lib/tour/replay';
  import { turnFlow, turnResultTokens, type TurnFlow } from '$lib/tour/replay-view';
  import { taskPrompt } from '$lib/tour/scenarios';
  import { fmtTokens } from '$lib/tour/tokens';
  import { fmtInt } from '$lib/utils';

  const programs = parseSolutionPrograms(solutionDoc);
  /** Read-only: queries never change it (updates return a change set), and plans work on copies. */
  const estate = buildInventory();
  const compare = compareSurfaces('filter-aggregate', programs['filter-aggregate']);
  const ladder = buildLadder(estate, compare.code);
  const projection = buildProjection(estate);
  const question = taskPrompt('filter-aggregate');

  /** The code surface's own tool definition, to hold the language's against. */
  const codeDefinition = compare.code.turns[0].parts.tools;
  const baseDefinition = definitionTokens([queryTool(new Set())]);
  const baseWords = keywords(queryTool(new Set())).length;
  const maxBilled = Math.max(...ladder.map((r) => r.bill.total));
  const maxResult = Math.max(...ladder.flatMap((r) => r.replay.calls.map((c) => c.resultSentTokens)));
  const RUNG_IDS = ladder.map((r) => r.id);

  /** JSON for reading: short objects stay on one line, long ones open up. */
  const inline = (v: unknown): string => {
    if (Array.isArray(v)) return v.length ? `[${v.map(inline).join(', ')}]` : '[]';
    if (v && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>);
      return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
    }
    return JSON.stringify(v);
  };
  function pretty(v: unknown, depth = 0): string {
    const flat = inline(v);
    if (flat.length + depth * 2 <= 78 || v === null || typeof v !== 'object') return flat;
    const pad = '  '.repeat(depth + 1);
    const end = '  '.repeat(depth);
    if (Array.isArray(v)) return `[\n${v.map((x) => pad + pretty(x, depth + 1)).join(',\n')}\n${end}]`;
    const entries = Object.entries(v as Record<string, unknown>);
    return `{\n${entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${pretty(x, depth + 1)}`).join(',\n')}\n${end}}`;
  }
  const reformat = (text: string): string => {
    try {
      return pretty(JSON.parse(text));
    } catch {
      return text;
    }
  };

  /** What to add to the story at the rungs where the bill alone would mislead. */
  const AFTER: Partial<Record<RungId, string>> = {
    query: 'It is the cheapest row for this question because this is the question it was built for. What happens when the questions change is below.',
    code: 'Its bill is higher than the query language here. What that buys is below.'
  };

  // The code answers to the fresh questions do not depend on anything the visitor does, so run them once.
  const codeAnswers = FRESH_QUESTIONS.map((q) => runTracked({ code: q.code, projection }));

  // ── state (in the URL, so a configuration can be shared) ───────────
  const params = page.url.searchParams;
  const startRung = RUNG_IDS.includes(params.get('rung') as RungId) ? (params.get('rung') as RungId) : 'per-property';
  const startFeatures = (params.get('f') ?? '').split(',').filter((f): f is FeatureId => FEATURE_IDS.includes(f as FeatureId));

  let selected = $state<RungId>(startRung);
  let features = $state<FeatureId[]>(startFeatures);
  let exampleId = $state<string>(EXAMPLE_QUERIES[0].id);
  let queryText = $state(pretty(EXAMPLE_QUERIES[0].query));
  type Ran = { out: QueryOut | null; parseError: string | null; ranText: string };
  function execute(text: string, on: ReadonlySet<FeatureId>): Ran {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { out: null, parseError: e instanceof Error ? e.message : String(e), ranText: text };
    }
    return { out: runQuery(estate, parsed, on), parseError: null, ranText: text };
  }
  let outcome = $state.raw<Ran>(execute(pretty(EXAMPLE_QUERIES[0].query), new Set(startFeatures)));
  let showFull = $state(false);
  let showAllResult = $state(false);
  let rungEls = $state<HTMLElement[]>([]);

  // ── derived ────────────────────────────────────────────────────────
  const featureSet = $derived(new Set(features));
  const rung = $derived(ladder.find((r) => r.id === selected)!);
  const facts = $derived(rungFacts(rung));
  const next = $derived(ladder[ladder.findIndex((r) => r.id === selected) + 1] ?? null);
  const tool = $derived(queryTool(featureSet));
  const definition = $derived(definitionTokens([tool]));
  const words = $derived(keywords(tool).length);
  const cover = $derived(coverage(featureSet, estate));
  const answered = $derived(cover.filter((p) => p.ok).length);
  const fresh = $derived(
    FRESH_QUESTIONS.map((q, i) => {
      const out = runQuery(estate, q.query, featureSet);
      return { q, out, needs: out.ok ? undefined : out.needs, code: codeAnswers[i] };
    })
  );
  const missing = $derived(outcome.out && !outcome.out.ok ? outcome.out.needs : undefined);
  const freshAnswered = $derived(fresh.filter((f) => f.out.ok).length);
  const codeAnswered = codeAnswers.filter((o) => o.status === 'ok').length;
  const stale = $derived(outcome.ranText !== queryText);
  const toolsJson = $derived(pretty(rung.tools));
  const sameCount = (out: QueryOut, code: string): boolean => {
    if (!out.ok || out.kind !== 'rows') return false;
    try {
      const v = JSON.parse(code);
      return Array.isArray(v) && v.length === out.count;
    } catch {
      return false;
    }
  };
  const scale = $derived(Math.max(definition, codeDefinition, 1200));

  // ── actions ────────────────────────────────────────────────────────
  function syncUrl(): void {
    // Ids only, so nothing needs escaping, and the commas stay readable.
    const qs = [selected !== 'per-property' ? `rung=${selected}` : '', features.length ? `f=${features.join(',')}` : ''].filter(Boolean).join('&');
    try {
      replaceState(page.url.pathname + (qs ? `?${qs}` : ''), page.state);
    } catch {
      /* router not ready: the URL is a convenience, not state */
    }
  }

  function select(id: RungId): void {
    selected = id;
    showFull = false;
    syncUrl();
  }

  function onRungKey(e: KeyboardEvent, i: number): void {
    const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ladder.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(ladder.length - 1, to));
    select(ladder[j].id);
    rungEls[j]?.focus();
  }

  function toggle(id: FeatureId, on?: boolean): void {
    const has = features.includes(id);
    const want = on ?? !has;
    if (want === has) return;
    features = want ? FEATURE_IDS.filter((f) => features.includes(f) || f === id) : features.filter((f) => f !== id);
    syncUrl();
    // The last query that ran, run again: its answer is what the new feature changes.
    outcome = execute(outcome.ranText, featureSet);
  }

  function run(): void {
    outcome = execute(queryText, featureSet);
    showAllResult = false;
  }

  function load(id: string): void {
    const ex = EXAMPLE_QUERIES.find((e) => e.id === id);
    if (!ex) return;
    exampleId = id;
    queryText = pretty(ex.query);
    run();
  }

  function onEditorKey(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  }

  const label = (id: FeatureId): string => FEATURES.find((f) => f.id === id)?.label ?? id;
  const clip = (text: string, max = 2600): string => (text.length > max ? `${text.slice(0, max)}\n… ${fmtInt(text.length - max)} more characters` : text);

  /** The model-facing view of a result, and how many tokens that is. */
  const shown = $derived.by(() => {
    if (!outcome.out) return null;
    const text = queryContent(outcome.out);
    const body = reformat(text);
    // Counted as the model receives it, the same way the replays count a result.
    return { text: showAllResult ? body : clip(body), tokens: toolMessageTokens(callId(1), text), long: body.length > 2600 };
  });

  /** Names of what a tool takes, for the one-line list in the detail panel. */
  function paramsOf(t: { function: { parameters: unknown } }): string {
    const props = (t.function.parameters as { properties?: Record<string, unknown> }).properties ?? {};
    return Object.keys(props).join(', ');
  }

  /** One model turn that made calls: what it read and wrote, what came back, and the calls grouped by tool. */
  type Wave = { turn: number; flow: TurnFlow; result: number; groups: Array<{ name: string; count: number; example: string; tokens: number }> };
  const waves = $derived.by<Wave[]>(() =>
    rung.replay.turns.flatMap((t, i) => {
      if (t.calls.length === 0) return [];
      const byName = new Map<string, { name: string; count: number; example: string; tokens: number }>();
      for (const c of t.calls) {
        const g = byName.get(c.name) ?? { name: c.name, count: 0, example: c.argsText, tokens: 0 };
        g.count += 1;
        // As the next request carries it, so these add up to the turn's result.
        g.tokens += c.resultSentTokens;
        byName.set(c.name, g);
      }
      return [{ turn: t.n, flow: turnFlow(rung.replay.turns, i), result: turnResultTokens(t), groups: [...byName.values()] }];
    })
  );
  /** The last turn reads everything and writes the answer. */
  const answerFlow = $derived(turnFlow(rung.replay.turns, rung.replay.turns.length - 1));
</script>

<svelte:head>
  <title>A catalogue that grows a language · From tools to code surfaces</title>
</svelte:head>

<header class="head">
  <div class="head-text">
    <p class="t-kicker">③ A catalogue that grows a language</p>
    <h1 class="t-h1">Every fix adds vocabulary.</h1>
    <p class="t-lead">
      Push a tool catalogue to answer more in fewer calls and it grows, one parameter at a time, into a query language. Here is one question put to seven tool designs. All seven reach the same answer.
    </p>
  </div>
  <section class="t-panel t-panel-pad ask" aria-label="The question">
    <span class="ctl-label">The question, the same on every rung</span>
    <p class="ask-text">{question}</p>
  </section>
</header>

<section class="t-panel t-panel-pad ladder-panel" aria-label="Seven tool designs">
  <div class="cols">
    <span aria-hidden="true"></span>
    <span class="c-name" aria-hidden="true">Tool design</span>
    <span class="c-calls" aria-hidden="true"><b>Round trips.</b> One square per call, darker for a bigger result. One group per model turn.</span>
    <span class="c-setup" aria-hidden="true"><b>Schema tax.</b> Sent every turn</span>
    <span class="c-bill"><span><b>Billed.</b> Tokens read and written, at full price.</span><RunLegend /></span>
  </div>
  <div class="ladder" role="radiogroup" aria-label="Tool designs, from one tool per property to code">
    {#each ladder as r, i (r.id)}
      {@const t = r.replay.totals}
      <button
        type="button"
        role="radio"
        class="rung"
        class:on={selected === r.id}
        aria-checked={selected === r.id}
        tabindex={selected === r.id ? 0 : -1}
        bind:this={rungEls[i]}
        onclick={() => select(r.id)}
        onkeydown={(e) => onRungKey(e, i)}
      >
        <span class="n">{r.n}</span>
        <span class="titles">
          <strong>{r.title}</strong>
          <code title={r.signature}>{r.signature}</code>
        </span>
        <span class="calls" role="img" aria-label="{t.calls} {t.calls === 1 ? 'call' : 'calls'} over {t.turns - 1} {t.turns - 1 === 1 ? 'turn' : 'turns'} of tool calls">
          {#each r.replay.turns.filter((x) => x.calls.length > 0) as turn (turn.n)}
            <span class="wave">
              {#each turn.calls as c (c.id)}
                <span class="call-sq" style:opacity={0.3 + 0.7 * Math.min(1, c.resultTokens / Math.min(maxResult, 600))} title="{c.name} {c.argsText}"></span>
              {/each}
            </span>
          {/each}
          <span class="count">{t.calls} {t.calls === 1 ? 'call' : 'calls'}</span>
        </span>
        <span class="setup-num"><i class="narrow">Sent every turn:</i> ≈ {fmtInt(r.setupTokens)}</span>
        <span class="bill">
          <RunBar bill={r.bill} scale={maxBilled} />
          <b>≈ {fmtTokens(r.bill.total)}</b>
        </span>
      </button>
    {/each}
  </div>
  <p class="ladder-legend"><b>Billed.</b> Tokens read and written, at full price. <RunLegend /></p>
  <div class="story" aria-live="polite">
    <div class="story-body">
      <p class="story-k">{next ? `What pushes you from rung ${rung.n} to rung ${next.n}` : 'Where it lands'}</p>
      <p class="story-text">{rung.pressure}</p>
      {#if AFTER[rung.id]}<p class="story-after">{AFTER[rung.id]}</p>{/if}
    </div>
    <div class="story-actions">
      {#if next}
        <button type="button" class="t-btn primary" onclick={() => select(next.id)}>Next: {next.title} <ChevronRight size={16} /></button>
      {:else}
        <a class="t-btn primary" href="/tour/object">See how the estate becomes that object <ChevronRight size={16} /></a>
      {/if}
      {#if rung.id === 'query'}<a class="t-btn" href="#grow">Try growing it</a>{/if}
    </div>
  </div>
</section>

<section class="t-panel t-panel-pad detail" aria-label="Rung {rung.n}: {rung.title}">
  <div class="d-head">
    <p class="t-kicker">Under the hood, rung {rung.n} of {ladder.length}</p>
    <h2 class="d-title">{rung.title}</h2>
  </div>
  <div class="d-grid">
    <div class="d-col">
      <h3 class="t-h2">What the model is given</h3>
      {#if rung.tools.length > 6}
        <div class="tool-chips">
          {#each rung.tools as t (t.function.name)}
            <code class="tn chip" title="{t.function.name}({paramsOf(t)})">{t.function.name}</code>
          {/each}
        </div>
        <p class="d-note">≈ {fmtInt(rung.setupTokens)} tokens of instructions and tool definitions, sent again on every turn.</p>
        <details bind:open={showFull}>
          <summary>Show the definitions as the model receives them</summary>
          <pre class="code defs">{toolsJson}</pre>
        </details>
      {:else if rung.tools.length > 0}
        <ul class="tool-list">
          {#each rung.tools as t (t.function.name)}
            <li><code class="tn">{t.function.name}</code><span class="tp">({paramsOf(t)})</span></li>
          {/each}
        </ul>
        <p class="d-note">≈ {fmtInt(rung.setupTokens)} tokens of instructions and tool definitions, sent again on every turn.</p>
        <details bind:open={showFull}>
          <summary>Show the definitions as the model receives them</summary>
          <pre class="code defs">{toolsJson}</pre>
        </details>
      {:else}
        <ul class="tool-list">
          <li><code class="tn">operate_inventory</code><span class="tp">(code, rationale)</span></li>
        </ul>
        <p class="d-note">
          ≈ {fmtInt(rung.setupTokens)} tokens of instructions and one tool whose description holds the shape of the data. See how the estate becomes that object on the <a href="/tour/object">next screen</a>.
        </p>
      {/if}
    </div>

    <div class="d-col">
      <h3 class="t-h2">What it does</h3>
      <ol class="waves-list">
        {#each waves as w (w.turn)}
          <li>
            <span class="wn">Turn {w.turn}</span>
            <span class="wbody">
              <FlowLine flow={w.flow} result={w.result} />
              {#each w.groups as g (g.name)}
                <span class="wline"><b>{g.count > 1 ? `${g.count} × ` : ''}</b><code>{g.name}</code> <span class="t-muted">{g.count > 1 ? `result ≈ ${fmtInt(Math.round(g.tokens / g.count))} each` : `result ≈ ${fmtInt(g.tokens)}`}</span></span>
              {/each}
            </span>
          </li>
        {/each}
        <li>
          <span class="wn">Turn {rung.replay.totals.turns}</span>
          <span class="wbody"><FlowLine flow={answerFlow} /></span>
        </li>
      </ol>
    </div>

    <div class="d-col">
      <h3 class="t-h2">What it costs</h3>
      <ul class="fact-list">
        <li>{facts[0]}</li>
        <li class="bill-sum"><BillLine bill={rung.bill} /></li>
        {#each facts.slice(1) as f (f)}<li>{f}</li>{/each}
      </ul>
      <p class="d-note">
        Estimated as ceil(characters ÷ 4) a message, every token at full price, the way the benchmark counts. <Tip text={CACHE_TIP}>Cached input</Tip> usually costs about a tenth.
      </p>
    </div>
  </div>
</section>

<section id="grow" class="t-panel t-panel-pad language" aria-label="Grow the language">
  <div class="l-head">
    <div>
      <h2 class="t-h2">Grow the language</h2>
      <p class="l-lead">
        This is rung 6, working. Every feature below is one more thing the model has to be told, and one more thing somebody has to build and keep correct.
      </p>
    </div>
    <div class="l-tiles">
      <StatTile compact label="Definition" value={'≈ ' + fmtInt(definition)} sub={definition === baseDefinition ? 'tokens, as designed' : `+${Math.round(((definition - baseDefinition) / baseDefinition) * 100)}% on the first design`} />
      <StatTile compact label="Keywords to learn" value={words} sub={words === baseWords ? 'as designed' : `${words - baseWords} more`} />
      <StatTile compact label="Benchmark tasks" value="{answered} of 4" sub="it can do" tone={answered === 4 ? 'var(--good)' : undefined} />
    </div>
  </div>

  <div class="l-grid">
    <div class="l-col">
      <h3 class="t-h2">Add a feature</h3>
      <ul class="feats">
        {#each FEATURES as f (f.id)}
          {@const on = featureSet.has(f.id)}
          <li>
            <button type="button" role="switch" aria-checked={on} class="feat" class:on onclick={() => toggle(f.id)}>
              <span class="sw-track" aria-hidden="true"><span class="sw-knob"></span></span>
              <span class="f-body">
                <strong>{f.label}</strong>
                <span class="f-lets">{f.lets}</span>
                <code class="f-param">+ {f.param}</code>
              </span>
            </button>
          </li>
        {/each}
      </ul>

      <div class="meter" aria-label="Definition size against the code tool">
        <p class="m-label">Tool definition, in tokens</p>
        <div class="m-track">
          <span class="m-fill" style:width="{(definition / scale) * 100}%"></span>
          <span class="m-mark" style:left="{(codeDefinition / scale) * 100}%"></span>
        </div>
        <p class="m-legend">
          <span><i class="sw rest"></i> <code>query_resources</code> ≈ {fmtInt(definition)}</span>
          <span><i class="sw mark"></i> code tool ≈ {fmtInt(codeDefinition)}</span>
        </p>
        {#if definition > codeDefinition}
          <p class="m-over" role="status">The language's definition is now longer than the code tool's, and it still cannot take a median.</p>
        {/if}
      </div>
    </div>

    <div class="l-col">
      <h3 class="t-h2">What it can do</h3>
      <ul class="cov">
        {#each cover as p (p.task)}
          <li class="cov-row" class:no={!p.ok}>
            <span class="cov-mark" aria-hidden="true">{#if p.ok}<Check size={16} />{:else}<X size={16} />{/if}</span>
            <span class="cov-body">
              <strong>{TASK_LABEL[p.task]}</strong>
              {#if p.ok}
                <span class="cov-sub">{p.calls} {p.calls === 1 ? 'call' : 'calls'}. {p.how}</span>
                {#if p.reason}<span class="cov-sub warn">{p.reason}</span>{/if}
              {:else}
                <span class="cov-sub">{p.reason}</span>
                {#if p.needs}
                  <button type="button" class="t-btn sm add" onclick={() => toggle(p.needs!, true)}><Plus size={14} /> Turn on “{label(p.needs)}”</button>
                {/if}
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    </div>

    <div class="l-col try">
      <h3 class="t-h2">Try a query</h3>
      <div class="examples" role="group" aria-label="Example queries">
        {#each EXAMPLE_QUERIES as e (e.id)}
          <button type="button" class="probe" class:on={exampleId === e.id} aria-pressed={exampleId === e.id} onclick={() => load(e.id)}>{e.label}</button>
        {/each}
      </div>
      <textarea
        class="editor"
        bind:value={queryText}
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        rows={Math.min(16, Math.max(7, queryText.split('\n').length))}
        aria-label="A query for query_resources, as JSON"
        aria-describedby="q-hint"
        onkeydown={onEditorKey}
      ></textarea>
      <div class="q-foot">
        <button type="button" class="t-btn primary" onclick={run}><Play size={15} fill="currentColor" /> Run</button>
        <span class="kbd" id="q-hint">or Ctrl or ⌘ + Enter. It reads a copy: nothing here changes the estate.</span>
      </div>

      {#if outcome.parseError}
        <p class="fail" role="alert"><strong>Not valid JSON.</strong> {outcome.parseError}</p>
      {:else if outcome.out}
        <div class="res" class:stale>
          {#if !outcome.out.ok}
            <p class="fail" role="alert">
              <strong>{outcome.out.error}</strong>
              {#if missing}
                <button type="button" class="t-btn sm add" onclick={() => toggle(missing, true)}><Plus size={14} /> Turn on “{label(missing)}”</button>
              {/if}
            </p>
          {/if}
          {#if shown}
            <p class="res-note">What comes back to the model, formatted for reading · ≈ {fmtInt(shown.tokens)} tokens{outcome.out.ok && outcome.out.kind === 'update' ? ' · a dry run: the change set is not applied' : ''}</p>
            <pre class="code out">{shown.text}</pre>
            {#if shown.long}
              <button type="button" class="t-btn sm" onclick={() => (showAllResult = !showAllResult)}>{showAllResult ? 'Show less' : 'Show all'}</button>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </div>
</section>

<section class="t-panel t-panel-pad fresh" aria-label="Questions the language was not built for">
  <div class="fr-head">
    <div>
      <h2 class="t-h2">Questions it was not built for</h2>
      <p class="l-lead">
        Four questions nobody planned for. The language, with the features you have switched on above, on the left. The same question as ordinary code, run for real over the same estate, on the right.
      </p>
    </div>
    <div class="fr-score" role="status">
      <span><b>{freshAnswered}</b> of {FRESH_QUESTIONS.length} in the language</span>
      <span><b>{codeAnswered}</b> of {FRESH_QUESTIONS.length} in code</span>
    </div>
  </div>

  <ul class="fr-list">
    {#each fresh as f, i (f.q.id)}
      <li class="fr-row">
        <div class="fr-q">
          <span class="fr-n">{i + 1}</span>
          <p>{f.q.question}</p>
        </div>
        <div class="fr-lang" class:yes={f.out.ok}>
          <p class="fr-tag">{f.out.ok ? 'The language answers it' : 'The language refuses it'}</p>
          {#if f.out.ok}
            {#if f.out.kind === 'rows'}
              <p class="fr-text">{f.out.count} {f.out.count === 1 ? 'row comes' : 'rows come'} back{sameCount(f.out, f.code.resultText ?? '') ? ', the same as the code finds' : ''}.</p>
              <pre class="code out">{clip(pretty(f.out.rows.slice(0, 3)), 420)}</pre>
            {/if}
          {:else}
            <p class="fr-text t-mono">{f.out.error}</p>
            <p class="fr-next">It would need: <strong>{f.q.next}</strong>.</p>
            {#if f.needs}
              {@const need = f.needs}
              <button type="button" class="t-btn sm add" onclick={() => toggle(need, true)}><Plus size={14} /> Turn on “{label(need)}”</button>
            {/if}
          {/if}
        </div>
        <div class="fr-code">
          <p class="fr-tag">Answered by code, {f.code.durationMs < 1 ? 'under 1' : Math.round(f.code.durationMs)} ms</p>
          <pre class="code out">{clip(f.code.resultText ? reformat(f.code.resultText) : (f.code.error ?? ''), 700)}</pre>
          <details>
            <summary>Show the program</summary>
            <pre class="code prog">{f.q.code}</pre>
          </details>
        </div>
      </li>
    {/each}
  </ul>

  <p class="t-callout wrap">
    <strong>The language stops where somebody stopped building it.</strong> The code tool's description is the same ≈ {fmtInt(codeDefinition)} tokens whatever you ask, because it describes the data, and filter, group, sort and divide are things the model already knows.
    <a href="/tour/object">See how the estate becomes that object</a>.
  </p>
</section>

<TourNav prev={{ href: '/tour/tools', label: 'Naive tools' }} next={{ href: '/tour/object', label: 'Reshape the estate into an object' }} />

<style>
  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 560px);
    gap: 20px;
    align-items: start;
  }
  .head-text {
    min-width: 0;
  }
  .ask {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 12px 14px;
  }
  .ask-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
    color: var(--color-text-secondary);
  }
  .ctl-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  @media (max-width: 1100px) {
    .head {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* ── ladder ─────────────────────────────────────────────────────── */
  .ladder-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cols,
  .rung {
    display: grid;
    grid-template-columns: 32px minmax(220px, 1.1fr) minmax(250px, 1.35fr) 96px minmax(210px, 1fr);
    gap: 14px;
    align-items: center;
  }
  .cols {
    padding: 0 12px;
    font-size: 12.5px;
    line-height: 1.3;
    color: var(--color-text-muted);
  }
  .cols b {
    color: var(--color-text-secondary);
  }
  .c-setup {
    text-align: right;
  }
  .ladder {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rung {
    width: 100%;
    padding: 9px 12px;
    text-align: left;
    border: 1px solid var(--color-border-default);
    border-radius: 12px;
    background: white;
    transition: border-color 0.12s, background 0.12s;
  }
  .rung:hover {
    background: var(--color-hover-bg);
  }
  .rung.on {
    border-color: var(--color-brand);
    background: var(--color-brand-bg);
    box-shadow: inset 3px 0 0 var(--color-brand);
  }
  .rung:focus-visible {
    outline: 2px solid var(--color-brand);
    outline-offset: 2px;
  }
  .n {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--color-expanded-bg);
    font-size: 13px;
    font-weight: 800;
    color: var(--color-text-secondary);
  }
  .rung.on .n {
    background: var(--color-brand);
    color: white;
  }
  .titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .titles strong {
    font-size: 15px;
  }
  .titles code {
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .calls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px 10px;
    min-width: 0;
  }
  .wave {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 3px;
    border-radius: 6px;
    background: var(--color-expanded-bg);
    max-width: 100%;
  }
  .call-sq {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    background: #4f46e5;
  }
  .count {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .narrow {
    display: none;
    font-style: normal;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .setup-num {
    text-align: right;
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-secondary);
  }
  .bill {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .bill b {
    min-width: 62px;
    text-align: right;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }
  .c-bill {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* The legend is in the header when there is one, and under the list when the header is gone. */
  .ladder-legend {
    display: none;
    margin: 0;
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .ladder-legend b {
    color: var(--color-text-secondary);
  }
  .sw.rest {
    background: #6366f1;
  }
  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin: 0 2px 0 6px;
    border-radius: 3px;
    vertical-align: -1px;
  }
  .sw.mark {
    background: #0f172a;
  }
  @media (max-width: 1100px) {
    .cols {
      display: none;
    }
    .ladder-legend {
      display: block;
    }
    .rung {
      grid-template-columns: 32px minmax(0, 1fr);
    }
    .calls,
    .setup-num,
    .bill {
      grid-column: 2;
      text-align: left;
    }
    .narrow {
      display: inline;
    }
  }

  .story {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-top: 4px;
    padding: 12px 16px;
    border-left: 3px solid #b45309;
    border-radius: 0 12px 12px 0;
    background: #fffbeb;
  }
  .story-body {
    min-width: 0;
  }
  .story-body p {
    margin: 0;
  }
  .story-k {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #92400e;
  }
  .story-text {
    margin-top: 2px;
    font-size: 15px;
    line-height: 1.45;
    color: #78350f;
  }
  .story-after {
    margin-top: 6px;
    font-size: 14px;
    line-height: 1.45;
    color: #78350f;
    font-weight: 650;
  }
  .story-actions {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
  }
  @media (max-width: 1100px) {
    .story {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  /* ── detail ─────────────────────────────────────────────────────── */
  .detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .d-title {
    margin: 2px 0 0;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  .d-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 22px;
  }
  @media (max-width: 1100px) {
    .d-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .d-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .tool-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 190px;
    overflow: auto;
    font-size: 13px;
  }
  .tn {
    font-family: var(--font-mono);
    font-weight: 650;
    color: var(--color-text-primary);
  }
  .tp {
    font-family: var(--font-mono);
    color: var(--color-text-muted);
  }
  .d-note {
    margin: 0;
    font-size: 13.5px;
    color: var(--color-text-secondary);
  }
  .code {
    margin: 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: #0f172a;
    color: #e2e8f0;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre;
    overflow: auto;
  }
  .defs {
    max-height: 300px;
    margin-top: 6px;
    font-size: 11.5px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  details summary {
    cursor: pointer;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .waves-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .waves-list li {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 10px;
    align-items: baseline;
    font-size: 13.5px;
  }
  .wn {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-brand);
  }
  .wbody {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .wline code {
    font-family: var(--font-mono);
    font-size: 12.5px;
  }
  .fact-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 14px;
    color: var(--color-text-secondary);
  }
  .fact-list li:first-child {
    font-weight: 650;
    color: var(--color-text-primary);
  }
  .tool-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    padding: 2px 7px;
    border-radius: 6px;
    background: var(--color-expanded-bg);
    font-size: 12px;
  }

  /* ── language ───────────────────────────────────────────────────── */
  .language,
  .fresh {
    display: flex;
    flex-direction: column;
    gap: 14px;
    scroll-margin-top: 84px;
  }
  .l-head,
  .fr-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
  }
  .l-lead {
    margin: 4px 0 0;
    max-width: 74ch;
    font-size: 14.5px;
    color: var(--color-text-secondary);
  }
  .l-tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 22px;
    flex: none;
  }
  .l-grid {
    display: grid;
    grid-template-columns: minmax(250px, 0.85fr) minmax(250px, 1fr) minmax(300px, 1.3fr);
    gap: 22px;
    align-items: start;
  }
  .l-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  @media (max-width: 1100px) {
    .l-head,
    .fr-head {
      flex-direction: column;
    }
    .l-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .feats,
  .cov {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .feat {
    width: 100%;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 12px;
    text-align: left;
    border: 1px solid var(--color-border-default);
    border-radius: 11px;
    background: white;
    transition: border-color 0.12s, background 0.12s;
  }
  .feat:hover {
    background: var(--color-hover-bg);
  }
  .feat.on {
    border-color: var(--color-brand);
    background: var(--color-brand-bg);
  }
  .feat:focus-visible {
    outline: 2px solid var(--color-brand);
    outline-offset: 2px;
  }
  .sw-track {
    flex: none;
    width: 34px;
    height: 20px;
    margin-top: 2px;
    border-radius: 999px;
    background: var(--color-border-strong);
    position: relative;
    transition: background 0.15s;
  }
  .sw-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: white;
    transition: transform 0.15s;
  }
  .feat.on .sw-track {
    background: var(--color-brand);
  }
  .feat.on .sw-knob {
    transform: translateX(14px);
  }
  @media (prefers-reduced-motion: reduce) {
    .sw-track,
    .sw-knob {
      transition: none;
    }
  }
  .f-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .f-body strong {
    font-size: 14.5px;
  }
  .f-lets {
    font-size: 13px;
    color: var(--color-text-secondary);
  }
  .f-param {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .meter {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .m-label,
  .res-note {
    margin: 0;
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .m-track {
    position: relative;
    height: 16px;
    border-radius: 5px;
    background: var(--color-expanded-bg);
  }
  .m-fill {
    display: block;
    height: 100%;
    border-radius: 5px;
    background: #6366f1;
    transition: width 0.25s ease;
  }
  .m-mark {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 3px;
    margin-left: -1px;
    border-radius: 2px;
    background: #0f172a;
  }
  .m-legend {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 12.5px;
    color: var(--color-text-secondary);
  }
  .m-legend code {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .m-legend .sw {
    margin-left: 0;
  }
  .m-over {
    margin: 0;
    padding: 8px 12px;
    border-radius: 9px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    font-size: 13.5px;
    color: #78350f;
  }
  @media (prefers-reduced-motion: reduce) {
    .m-fill {
      transition: none;
    }
  }

  .cov-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px;
    padding: 9px 12px;
    border: 1px solid #a7f3d0;
    border-radius: 11px;
    background: #f0fdf9;
  }
  .cov-row.no {
    border-color: #fecaca;
    background: #fff7f7;
  }
  .cov-mark {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: var(--good);
    color: white;
  }
  .cov-row.no .cov-mark {
    background: #dc2626;
  }
  .cov-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    font-size: 14px;
  }
  .cov-sub {
    font-size: 13px;
    color: var(--color-text-secondary);
  }
  .cov-sub.warn {
    color: #92400e;
  }
  .add {
    margin-top: 4px;
  }

  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .probe {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--color-border-strong);
    background: white;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .probe:hover {
    background: var(--color-hover-bg);
    border-color: var(--color-text-dim);
  }
  .probe.on {
    background: var(--color-brand);
    border-color: var(--color-brand);
    color: white;
  }
  .editor {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid #1e293b;
    border-radius: 10px;
    background: #0f172a;
    color: #e2e8f0;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.5;
    tab-size: 2;
    white-space: pre;
    overflow: auto;
    resize: vertical;
  }
  .editor:focus-visible {
    outline: 2px solid var(--color-brand);
    outline-offset: 2px;
  }
  .q-foot {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .kbd {
    font-size: 12.5px;
    color: var(--color-text-muted);
  }
  .res {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .res.stale {
    opacity: 0.55;
  }
  .out {
    max-height: 260px;
  }
  .fail {
    margin: 0;
    padding: 8px 12px;
    border-radius: 9px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    font-size: 13.5px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  /* ── fresh questions ────────────────────────────────────────────── */
  .fr-score {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 14px;
    color: var(--color-text-secondary);
    text-align: right;
  }
  .fr-score b {
    font-size: 20px;
    color: var(--color-text-primary);
  }
  .fr-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .fr-row {
    display: grid;
    grid-template-columns: minmax(180px, 0.8fr) minmax(240px, 1.1fr) minmax(280px, 1.3fr);
    gap: 16px;
    padding: 12px;
    border: 1px solid var(--color-border-default);
    border-radius: 12px;
    background: white;
    align-items: start;
  }
  @media (max-width: 1100px) {
    .fr-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .fr-q {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .fr-q p {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .fr-n {
    flex: none;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--color-expanded-bg);
    font-size: 12.5px;
    font-weight: 800;
    color: var(--color-text-secondary);
  }
  .fr-lang,
  .fr-code {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 10px;
  }
  .fr-lang {
    background: #fff7f7;
    border: 1px solid #fecaca;
  }
  .fr-lang.yes {
    background: #fffbeb;
    border-color: #fde68a;
  }
  .fr-code {
    background: #f0fdf9;
    border: 1px solid #a7f3d0;
  }
  .fr-tag {
    margin: 0;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .fr-text {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
  }
  .fr-next {
    margin: 0;
    font-size: 13.5px;
    color: var(--color-text-secondary);
  }
  .fr-code .out {
    max-height: 150px;
  }
  .prog {
    margin-top: 6px;
    font-size: 12px;
  }
  .wrap {
    margin: 0;
  }
</style>
