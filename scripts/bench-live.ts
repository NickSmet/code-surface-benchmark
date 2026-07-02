/**
 * Live end-to-end benchmark + correctness harness.
 *
 *   npm run bench:live                    # hits http://localhost:5173, 1 iteration
 *   BENCH_RUNS=5 npm run bench:live       # 5 iterations, medians + ranges
 *   BENCH_BASE=http://… npm run bench:live
 *
 * Requires the dev server to be running in another terminal (`npm run dev`).
 *
 * For every preconfigured task it drives BOTH surfaces against the real,
 * running server (the same SSE endpoint the UI uses), parses the stream,
 * collects the final metrics, and checks the answer against ground truth
 * computed directly from the mock inventory:
 *
 *   - granular read: the exact power state and public IP
 *   - filter + aggregate: the exact grand total (any $-amount within ±$1)
 *   - bulk write: the full expected write set (every untagged resource
 *     tagged, and the exact set of idle VMs deallocated)
 *   - single lookup: the exact count and group names
 *
 * Correctness is a measured outcome, not a gate: a surface can complete a
 * run and still be marked incorrect. The process exits non-zero only when
 * runs fail to complete (transport/model errors).
 *
 * Prints a comparison table and writes docs/live-results.{md,json} for the
 * README / talk appendix. With BENCH_RUNS>1 the tables report the median
 * [min–max] across iterations per surface.
 *
 * Runs sequentially (not in parallel) so latency numbers aren't muddied by
 * the two surfaces contending for the same model TPM quota. Each run gets a
 * fresh cache-busting nonce server-side, so every iteration is cold-cache
 * comparable (see README "What's measured").
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildInventory } from '../src/lib/inventory/fixtures/builders';
import { computeGroundTruth } from '../src/lib/inventory/truth';
import { checksForTask, type Check } from '../src/lib/bench-checks';
import { TASKS } from '../src/lib/tasks';
import type { BenchEvent, RunMetrics } from '../src/lib/agent/sse-protocol';
import type { ChangeRow } from '../src/lib/inventory/projection';

const BASE = process.env.BENCH_BASE ?? 'http://localhost:5173';
const RUNS = Math.max(1, Math.floor(Number(process.env.BENCH_RUNS ?? '1')) || 1);
const PER_RUN_TIMEOUT_MS = 240_000;
const SURFACES = ['catalog', 'code'] as const;
type SurfaceId = (typeof SURFACES)[number];

// Ground truth computed from the canonical inventory (shared with the UI verdicts).
const truth = computeGroundTruth(buildInventory());

// ── SSE driver ─────────────────────────────────────────────────────────────
interface RunResult {
  surface: SurfaceId;
  ok: boolean;
  errorMessage?: string;
  isStub: boolean;
  model: string;
  metrics: RunMetrics;
  finalText: string;
  toolNames: string[];
  diffRows: number;
  diffFieldCounts: Record<string, number>;
  diffResourceNames: string[];
  deallocatedNames: string[];
}

function emptyRunResult(surface: SurfaceId, model = '?'): RunResult {
  return {
    surface,
    ok: false,
    isStub: true,
    model,
    metrics: {
      turns: 0,
      toolCalls: 0,
      promptTokens: 0,
      cachedPromptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      toolSchemaTokens: 0,
      elapsedMs: 0
    },
    finalText: '',
    toolNames: [],
    diffRows: 0,
    diffFieldCounts: {},
    diffResourceNames: [],
    deallocatedNames: []
  };
}

function parseFrames(buf: string): { events: BenchEvent[]; rest: string } {
  const events: BenchEvent[] = [];
  let rest = buf;
  let idx: number;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    for (const line of block.split('\n')) {
      if (line.startsWith('data:')) {
        const json = line.slice(5).trim();
        if (json) {
          try {
            events.push(JSON.parse(json) as BenchEvent);
          } catch {
            /* ignore partial */
          }
        }
      }
    }
  }
  return { events, rest };
}

async function runOne(surface: SurfaceId, prompt: string): Promise<RunResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PER_RUN_TIMEOUT_MS);
  const res = await fetch(`${BASE}/backend/bench/${surface}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ task: prompt }),
    signal: ac.signal
  });
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    throw new Error(`HTTP ${res.status} from ${surface} endpoint`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const out = emptyRunResult(surface);

  const handle = (ev: BenchEvent): void => {
    switch (ev.type) {
      case 'meta':
        out.isStub = ev.isStub;
        out.model = ev.model;
        out.metrics = ev.metrics;
        break;
      case 'turn':
      case 'complete':
        out.metrics = ev.metrics;
        break;
      case 'tool_call':
        out.toolNames.push(ev.name);
        break;
      case 'tool_result':
        if (ev.diff) {
          const rows = ev.diff as ChangeRow[];
          out.diffRows += rows.length;
          for (const row of rows) {
            out.diffFieldCounts[row.field] = (out.diffFieldCounts[row.field] ?? 0) + 1;
            if (!out.diffResourceNames.includes(row.resourceName)) out.diffResourceNames.push(row.resourceName);
            if (row.field === 'powerState' && row.after === 'deallocated' && !out.deallocatedNames.includes(row.resourceName)) {
              out.deallocatedNames.push(row.resourceName);
            }
          }
        }
        break;
    }
    if (ev.type === 'complete') {
      out.ok = true;
      out.finalText = ev.finalText ?? '';
    }
    if (ev.type === 'error') {
      out.ok = false;
      out.errorMessage = ev.message;
      out.metrics = ev.metrics;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const { events, rest } = parseFrames(buf);
      buf = rest;
      for (const ev of events) handle(ev);
    }
  } finally {
    clearTimeout(timer);
  }
  return out;
}

// ── Per-task correctness checks (shared with the UI, see src/lib/bench-checks) ──
function checksFor(taskId: string, r: RunResult): Check[] {
  return checksForTask(taskId, truth, {
    ok: r.ok && !r.errorMessage,
    finalText: r.finalText,
    diffFieldCounts: r.diffFieldCounts,
    deallocatedNames: r.deallocatedNames
  });
}

// ── Run the matrix ─────────────────────────────────────────────────────────
const fmtUsd = (n: number): string => (n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(4)}`);
const ratio = (a: number, b: number): string => (b > 0 && a > 0 ? `${(a / b).toFixed(1)}x` : '—');
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const range = (xs: number[], fmt: (n: number) => string): string => {
  if (xs.length <= 1) return '';
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? '' : ` [${fmt(lo)}–${fmt(hi)}]`;
};

interface TaskRuns {
  taskId: string;
  task: string;
  expect: string;
  perSurface: Record<SurfaceId, Array<{ result: RunResult; checks: Check[] }>>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const isRateLimited = (r: RunResult): boolean => !r.ok && /429|rate.?limit/i.test(r.errorMessage ?? '');

async function main(): Promise<void> {
  console.log(`live bench → ${BASE} (${RUNS} run${RUNS === 1 ? '' : 's'})`);
  console.log('ground truth:', JSON.stringify(truth));

  // Confirm we're actually live before spending tokens.
  const info = (await (await fetch(`${BASE}/backend/info`)).json()) as {
    provider: { isStub: boolean; model: string; label: string };
  };
  console.log(`provider: ${info.provider.label} (stub=${info.provider.isStub})\n`);
  if (info.provider.isStub)
    console.warn('WARNING: server is on the STUB provider — numbers below are not from a live model.\n');

  const taskRuns: TaskRuns[] = TASKS.map((t) => ({
    taskId: t.id,
    task: t.label,
    expect: t.expect,
    perSurface: { catalog: [], code: [] }
  }));

  let transportFailures = 0;

  for (let run = 1; run <= RUNS; run++) {
    if (RUNS > 1) console.log(`── run ${run}/${RUNS} ──`);
    for (const [i, task] of TASKS.entries()) {
      process.stdout.write(`▶ ${task.label}\n`);
      for (const surface of SURFACES) {
        process.stdout.write(`   ${surface} … `);
        let result: RunResult;
        // Retry on provider rate limits (429) so TPM bursts don't poison the
        // correctness tallies — a throttled run says nothing about the surface.
        for (let attempt = 0; ; attempt++) {
          try {
            result = await runOne(surface, task.prompt);
            const m = result.metrics;
            process.stdout.write(
              `${result.ok ? 'ok' : 'ERROR'} | turns ${m.turns} tools ${m.toolCalls} tok ${m.totalTokens} (${m.promptTokens}p/${m.cachedPromptTokens} cached/${m.completionTokens}c) ${fmtUsd(m.costUsd)} ${(m.elapsedMs / 1000).toFixed(1)}s${result.errorMessage ? ` — ${result.errorMessage.split('\n')[0]}` : ''}\n`
            );
          } catch (err) {
            process.stdout.write(`EXCEPTION — ${err instanceof Error ? err.message : String(err)}\n`);
            result = emptyRunResult(surface, info.provider.model);
            result.errorMessage = err instanceof Error ? err.message : String(err);
          }
          if (!isRateLimited(result) || attempt >= 2) break;
          process.stdout.write(`   rate-limited — waiting 60s, retry ${attempt + 1}/2 … `);
          await sleep(60_000);
          process.stdout.write(`\n   ${surface} (retry) … `);
        }
        if (!result.ok || result.errorMessage) transportFailures += result.ok ? 0 : 1;
        taskRuns[i].perSurface[surface].push({ result, checks: checksFor(task.id, result) });
      }
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n══════════════ RESULTS ══════════════');
  const mdLines: string[] = [];
  mdLines.push(`# Live benchmark — ${info.provider.label}`);
  mdLines.push('');
  mdLines.push(
    `Model: \`${info.provider.model}\` · stub: \`${info.provider.isStub}\` · runs per task: **${RUNS}** · generated ${new Date().toISOString()}`
  );
  mdLines.push('');
  mdLines.push(
    'Each run is cold-cache (a per-run nonce busts the provider prompt cache), and each answer is checked against ground truth computed from the inventory. "Correct" means every check passed, including exact totals and complete write sets.'
  );
  mdLines.push('');
  mdLines.push(
    `| Task | Surface | Correct | Round trips | Tool calls | Total tok${RUNS > 1 ? ' (median [range])' : ''} | Cost | Latency |`
  );
  mdLines.push('|---|---|---|--:|--:|--:|--:|--:|');

  for (const row of taskRuns) {
    const med: Record<SurfaceId, { turns: number; tools: number; tok: number; cost: number; ms: number }> = {
      catalog: { turns: 0, tools: 0, tok: 0, cost: 0, ms: 0 },
      code: { turns: 0, tools: 0, tok: 0, cost: 0, ms: 0 }
    };

    for (const s of SURFACES) {
      const runs = row.perSurface[s];
      const toks = runs.map((r) => r.result.metrics.totalTokens);
      const costs = runs.map((r) => r.result.metrics.costUsd);
      med[s] = {
        turns: median(runs.map((r) => r.result.metrics.turns)),
        tools: median(runs.map((r) => r.result.metrics.toolCalls)),
        tok: median(toks),
        cost: median(costs),
        ms: median(runs.map((r) => r.result.metrics.elapsedMs))
      };
      const correctRuns = runs.filter((r) => r.checks.every((c) => c.pass)).length;
      mdLines.push(
        `| ${row.task} | ${s} | **${correctRuns}/${RUNS}** | ${med[s].turns} | ${med[s].tools} | ${Math.round(med[s].tok)}${range(toks, (n) => String(Math.round(n)))} | ${fmtUsd(med[s].cost)} | ${(med[s].ms / 1000).toFixed(1)}s |`
      );
    }
    mdLines.push(
      `| **${row.task} — code advantage** | | | **${ratio(med.catalog.turns, med.code.turns)}** | | **${ratio(med.catalog.tok, med.code.tok)}** tok | **${ratio(med.catalog.cost, med.code.cost)}** | **${ratio(med.catalog.ms, med.code.ms)}** |`
    );

    console.log(`\n■ ${row.task}  (expected winner: ${row.expect})`);
    for (const s of SURFACES) {
      const runs = row.perSurface[s];
      const correctRuns = runs.filter((r) => r.checks.every((c) => c.pass)).length;
      console.log(
        `   ${s}: correct ${correctRuns}/${RUNS} | median ${med[s].turns} turns, ${Math.round(med[s].tok)} tok, ${fmtUsd(med[s].cost)}, ${(med[s].ms / 1000).toFixed(1)}s`
      );
      for (const [runIdx, r] of runs.entries()) {
        for (const chk of r.checks) {
          if (!chk.pass) console.log(`     [FAIL] ${s} run ${runIdx + 1}: ${chk.label}${chk.detail ? ` — ${chk.detail}` : ''}`);
        }
      }
    }
    console.log(
      `   advantage (medians): ${ratio(med.catalog.tok, med.code.tok)} fewer tokens, ${ratio(med.catalog.cost, med.code.cost)} cheaper`
    );
  }

  // Per-run appendix so every number in the summary is auditable.
  if (RUNS > 1) {
    mdLines.push('');
    mdLines.push('## Per-run detail');
    mdLines.push('');
    mdLines.push('| Task | Surface | Run | Correct | Round trips | Tool calls | Prompt tok | Cached | Completion | Total | Cost | Latency |');
    mdLines.push('|---|---|--:|---|--:|--:|--:|--:|--:|--:|--:|--:|');
    for (const row of taskRuns) {
      for (const s of SURFACES) {
        for (const [runIdx, r] of row.perSurface[s].entries()) {
          const m = r.result.metrics;
          const correct = r.checks.every((c) => c.pass);
          mdLines.push(
            `| ${row.task} | ${s} | ${runIdx + 1} | ${correct ? 'yes' : `no (${r.checks.filter((c) => !c.pass).map((c) => (c.detail ? `${c.label} — ${c.detail}` : c.label)).join('; ')})`} | ${m.turns} | ${m.toolCalls} | ${m.promptTokens} | ${m.cachedPromptTokens} | ${m.completionTokens} | ${m.totalTokens} | ${fmtUsd(m.costUsd)} | ${(m.elapsedMs / 1000).toFixed(1)}s |`
          );
        }
      }
    }
  }

  // Write artifacts for the README / talk appendix.
  const here = dirname(fileURLToPath(import.meta.url));
  const docs = resolve(here, '..', 'docs');
  mkdirSync(docs, { recursive: true });
  writeFileSync(resolve(docs, 'live-results.md'), mdLines.join('\n') + '\n');
  writeFileSync(
    resolve(docs, 'live-results.json'),
    JSON.stringify(
      { base: BASE, provider: info.provider, runs: RUNS, truth, generatedAt: new Date().toISOString(), tasks: taskRuns },
      null,
      2
    ) + '\n'
  );
  console.log(`\nwrote docs/live-results.md and docs/live-results.json`);

  const allCorrect = taskRuns.every((row) => SURFACES.every((s) => row.perSurface[s].every((r) => r.checks.every((c) => c.pass))));
  console.log(
    allCorrect
      ? '\n✅ every run passed every ground-truth check'
      : '\nℹ️  some runs failed ground-truth checks (see FAIL lines above) — that is a finding, not a harness error'
  );
  process.exit(transportFailures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
