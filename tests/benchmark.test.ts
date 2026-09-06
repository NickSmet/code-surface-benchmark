import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildInventory } from '../src/lib/inventory/fixtures/builders';
import { buildProjection, diffProjection, type ChangeRow } from '../src/lib/inventory/projection';
import { applyChangeRows } from '../src/lib/inventory/apply';
import { computeGroundTruth } from '../src/lib/inventory/truth';
import { checksForTask, factsFromDiffs, sameChanges } from '../src/lib/bench-checks';
import { createCodeSurface } from '../src/lib/surfaces/code';
import { createCatalogSurface } from '../src/lib/surfaces/catalog';
import { executeInventoryCode } from '../src/lib/surfaces/code/sandbox';
import { makeCtx } from '../src/lib/surfaces/code/helpers';
import { runBench } from '../src/lib/agent/loop';
import type { ProviderClient, ProviderToolCall, ChatTurnArgs } from '../src/lib/agent/providers/types';
import { ZERO_USAGE } from '../src/lib/agent/providers/types';
import type { BenchEvent } from '../src/lib/agent/sse-protocol';

const truth = computeGroundTruth(buildInventory());
const passed = (task: string, answer: string, applied: ChangeRow[] = [], state: ChangeRow[] | null = []) =>
  checksForTask(task, truth, factsFromDiffs(true, answer, applied, state)).every((c) => c.pass);
const aggregateAnswer = 'web-prod: $2,920.31\ndata-prod: $1,852.60\nplatform-prod: $688.31\nGrand total: $5,461.22\nUntagged running VMs: none.';
const tool = (name: string, args: Record<string, unknown>): ProviderToolCall =>
  ({ id: 'test-call', type: 'function', function: { name, arguments: JSON.stringify(args) } });
function provider(calls: ProviderToolCall[], inspect?: (args: ChatTurnArgs) => void): ProviderClient {
  let turn = 0;
  return { label: 'test', model: 'test', isStub: true, async chatTurn(args) {
    inspect?.(args);
    return { content: turn++ ? 'Done' : '', toolCalls: turn === 1 ? calls : [], usage: ZERO_USAGE };
  } };
}
async function collect(run: ReturnType<typeof runBench>): Promise<BenchEvent[]> {
  const events: BenchEvent[] = [];
  for await (const event of run) events.push(structuredClone(event));
  return events;
}

// These are deterministic integration regressions, not model-performance tests.
test('documented programs still solve the four tasks and apply the complete write set', () => {
  const source = readFileSync(new URL('../docs/solution-path-examples.md', import.meta.url), 'utf8');
  const codes = [...source.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(codes.length, 4);
  const results = codes.map((code, index) => {
    const inv = buildInventory(), before = buildProjection(inv), after = buildProjection(inv);
    const { result } = executeInventoryCode(code, after, makeCtx(after));
    const rows = diffProjection(before, after);
    if (index === 2) assert(sameChanges(rows, truth.expectedBulkDiff));
    else assert.equal(rows.length, 0);
    applyChangeRows(inv, rows);
    assert.deepEqual(buildProjection(inv), after);
    return JSON.parse(JSON.stringify(result));
  });
  assert.deepEqual(results[0], { powerState: 'running', publicIp: '20.103.47.219' });
  assert.equal(results[1].totalMonthly, 5461.22);
  assert.equal(results[2].taggedCount, 33);
  assert.deepEqual(results[2].deallocated, truth.expectedDeallocNames);
  assert.equal(results[3].count, 3);
});

test('both detailed surfaces omit future internal fields, and applied updates preserve them', async () => {
  const inv = buildInventory();
  const resource = inv.resources[0] as unknown as Record<string, unknown>;
  resource.futureSecret = 'private';
  assert(!Object.hasOwn(buildProjection(inv).resources[0], 'futureSecret'));
  const catalog = createCatalogSurface(undefined, inv);
  const fetched = JSON.parse((await catalog.dispatch('get_resource', { id: resource.id })).content);
  assert(!Object.hasOwn(fetched, 'futureSecret'));
  const proposal = await catalog.dispatch('update_resource_tags', { name: resource.name, tags: { reviewed: 'yes' } });
  catalog.applyDiff(proposal.diff!);
  assert.equal(resource.futureSecret, 'private');
  assert.equal((resource.tags as Record<string, string>).reviewed, 'yes');
});

test('unsupported projected edits reject the whole proposal without changing the estate', async () => {
  const edits = [
    "r._billingAccount = 'changed'", "r.powerState = 'invalid'", "r.costMonthly = -1",
    "r.nicId = null", "r.dataDiskIds.push('invented')", "r.name = 'renamed'",
    "data.resources.pop()", "data.resources.push({...r})", "data.generatedAt = 'tomorrow'",
    "r.tags = {env: 42}", "r.tags = JSON.parse('{\"__proto__\":\"bad\"}')"
  ];
  for (const edit of edits) {
    const inv = buildInventory(), original = structuredClone(inv);
    const surface = createCodeSurface(undefined, inv);
    const result = await surface.dispatch('operate_inventory', {
      code: `function main(data) { const r = data.resources.find(r => r.type === 'virtualMachine'); r.tags.reviewed = 'yes'; ${edit}; }`
    });
    assert.equal(result.error, true, edit);
    assert.equal(result.diff, undefined, edit);
    assert.deepEqual(inv, original, edit);
  }
});

test('commit rejects stale, hidden-field and invalid-state writes before applying any rows', () => {
  for (const bad of [
    { ...truth.expectedBulkDiff[0], field: '_billingAccount', after: 'changed' },
    { ...truth.expectedBulkDiff[0], before: 'stale' },
    { ...truth.expectedBulkDiff.find((r) => r.field === 'powerState')!, after: 'invalid' }
  ]) {
    const inv = buildInventory(), original = structuredClone(inv);
    assert.throws(() => applyChangeRows(inv, [truth.expectedBulkDiff[1], bad]));
    assert.deepEqual(inv, original);
  }
});

test('both surfaces produce the same expected final estate for supported bulk operations', async () => {
  const inv = buildInventory(), catalog = createCatalogSurface(undefined, inv);
  for (const row of truth.expectedBulkDiff) {
    const output = row.field === 'powerState'
      ? await catalog.dispatch('set_power_state', { name: row.resourceName, state: row.after })
      : await catalog.dispatch('update_resource_tags', { name: row.resourceName, tags: { [row.field.slice(5)]: row.after } });
    catalog.applyDiff(output.diff!);
  }
  const expected = buildInventory();
  for (const r of expected.resources) {
    if (r.resourceGroup === 'app-staging' && Object.keys(r.tags).length === 0) r.tags = { env: 'staging', owner: 'app-team' };
    if (r.type === 'virtualMachine' && truth.expectedDeallocNames.includes(r.name)) r.powerState = 'deallocated';
  }
  assert.deepEqual(inv, expected);
});

test('bulk checker rejects wrong tag targets/values, extra writes, duplicates and missing final state', () => {
  assert(passed('bulk-write', 'Done', truth.expectedBulkDiff, truth.expectedBulkDiff));
  const badValues = truth.expectedBulkDiff.map((row) => row.field.startsWith('tags.') ? { ...row, after: 'WRONG' } : row);
  const badTargets = truth.expectedBulkDiff.map((row) => row.field.startsWith('tags.') ? { ...row, resourceId: '/unrelated' } : row);
  for (const bad of [badValues, badTargets, [...truth.expectedBulkDiff, truth.expectedBulkDiff[0]], truth.expectedBulkDiff.slice(1)]) {
    assert(!passed('bulk-write', 'Done', bad, truth.expectedBulkDiff));
    assert(!passed('bulk-write', 'Done', truth.expectedBulkDiff, bad));
  }
  assert(!passed('bulk-write', 'Done', truth.expectedBulkDiff, null));
  assert(!passed('bulk-write', '', truth.expectedBulkDiff, truth.expectedBulkDiff));
});

test('aggregate checks require cent-precision amounts by group, a labelled total and the secondary answer', () => {
  assert(passed('filter-aggregate', aggregateAnswer));
  assert(!passed('filter-aggregate', 'web-prod $5461.22'));
  assert(!passed('filter-aggregate', aggregateAnswer.replace('5,461.22', '5,461.23')));
  assert(!passed('filter-aggregate', aggregateAnswer.replace('2,920.31', '2,920.30')));
  assert(!passed('filter-aggregate', aggregateAnswer.replace('Untagged running VMs: none.', '')));
  assert(!passed('filter-aggregate', aggregateAnswer, [truth.expectedBulkDiff[0]], []));
});

test('lookup requires count plus all names, and reads cannot change state', () => {
  const answer = 'Production has **3 resource groups**: web-prod, data-prod, platform-prod.';
  assert(passed('single-lookup', answer));
  assert(!passed('single-lookup', '3 web-prod'));
  assert(!passed('single-lookup', answer.replace('3 resource', '4 resource')));
  assert(!passed('single-lookup', answer, [], [truth.expectedBulkDiff[0]]));
  assert(passed('granular-read', 'running, 20.103.47.219'));
});

test('the complete broad catalog result, including all idle VMs, reaches the next model turn', async () => {
  let inspected = false;
  const client = provider([tool('list_resources', {})], (args) => {
    const response = args.messages.find((message) => message.role === 'tool');
    if (!response) return;
    inspected = true;
    assert(response.content.length > 24000);
    const parsed = JSON.parse(response.content);
    assert.equal(parsed.count, 194);
    for (const name of truth.expectedDeallocNames) assert(parsed.resources.some((r: { name: string }) => r.name === name));
  });
  const events = await collect(runBench({ provider: client, surface: createCatalogSurface(), task: 'survey', env: {} }));
  assert(inspected);
  assert.equal(events.at(-1)?.type, 'complete');
  assert(events.some((event) => event.type === 'meta' && event.configuration?.resultPolicy === 'complete'));
  assert(events.some((event) => event.type === 'turn' && event.toolCalls?.length === 1));
});

test('declined proposals remain visible in traces but the final estate stays unchanged', async () => {
  const inv = buildInventory();
  const events = await collect(runBench({
    provider: provider([tool('update_resource_tags', { name: inv.resources[0].name, tags: { reviewed: 'yes' } })]),
    surface: createCatalogSurface(undefined, inv), task: 'tag', env: {}, reviewGate: async () => 'declined'
  }));
  const result = events.find((event) => event.type === 'tool_result');
  assert(result?.type === 'tool_result' && result.diff?.length === 1 && result.approval === 'declined');
  const done = events.at(-1);
  assert(done?.type === 'complete');
  assert.deepEqual(done.stateDiff, []);
});

test('a validation failure is returned as not-applied and no earlier row leaks through', async () => {
  const surface = createCatalogSurface();
  surface.dispatch = async () => ({ content: '{"ok":true}', resultPreview: 'test', diff: [truth.expectedBulkDiff[0], { ...truth.expectedBulkDiff[1], field: '_billingAccount' }] });
  const events = await collect(runBench({ provider: provider([tool('test', {})]), surface, task: 'test', env: {} }));
  assert(events.some((event) => event.type === 'tool_result' && event.error && event.content?.includes('not_applied')));
  const done = events.at(-1);
  assert(done?.type === 'complete');
  assert.deepEqual(done.stateDiff, []);
});

test('reaching the iteration cap is an error, not successful completion', async () => {
  const client: ProviderClient = { label: 'test', model: 'test', isStub: true, async chatTurn() {
    return { content: '', toolCalls: [tool('list_subscriptions', {})], usage: ZERO_USAGE };
  } };
  const events = await collect(runBench({ provider: client, surface: createCatalogSurface(), task: 'loop', env: {} }));
  assert.equal(events.at(-1)?.type, 'error');
  assert(!events.some((event) => event.type === 'complete'));
});

test('CLI preserves full SSE evidence in a timestamped report without using a model', async () => {
  const { createServer } = await import('node:http');
  const { mkdtemp, readdir, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { TASKS } = await import('../src/lib/tasks');
  const { emptyMetrics } = await import('../src/lib/agent/sse-protocol');
  const dir = await mkdtemp(join(tmpdir(), 'code-surface-evidence-test-'));
  const answers: Record<string, string> = {
    'granular-read': 'running, 20.103.47.219',
    'filter-aggregate': aggregateAnswer,
    'bulk-write': 'Applied the requested changes.',
    'single-lookup': '3 resource groups: web-prod, data-prod, platform-prod.'
  };
  // This fake benchmark HTTP endpoint tests the CLI's transport and archive
  // path only. Its reports are temporary fixtures, never published results.
  const server = createServer(async (request, response) => {
    if (request.url === '/backend/info') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ provider: { isStub: false, model: 'test-fixture', label: 'test-fixture' } }));
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const task = TASKS.find((entry) => entry.prompt === JSON.parse(body).task)!;
    const surface = request.url!.includes('/code/') ? 'code' : 'catalog';
    const metrics = emptyMetrics();
    const diff = task.id === 'bulk-write' ? truth.expectedBulkDiff : [];
    const events: BenchEvent[] = [
      { type: 'meta', at: 0, surface, providerLabel: 'test-fixture', model: 'test-fixture', isStub: false, metrics },
      { type: 'tool_call', at: 0, seq: 1, name: 'fixture', argsPreview: 'fixture', args: { fixture: true }, code: 'function main() {}' },
      { type: 'tool_result', at: 0, seq: 1, name: 'fixture', resultPreview: 'fixture', content: JSON.stringify({ payload: 'x'.repeat(36000) }), diff },
      { type: 'complete', at: 0, metrics, finalText: answers[task.id], stateDiff: diff }
    ];
    response.setHeader('Content-Type', 'text/event-stream');
    response.end(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address === 'object');
    await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/bench-live.ts'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, BENCH_BASE: `http://127.0.0.1:${address.port}`, BENCH_RUNS: '1', BENCH_OUTPUT_DIR: dir },
      timeout: 15000
    });
    const folders = await readdir(dir);
    assert.equal(folders.length, 1);
    const report = JSON.parse(await readFile(join(dir, folders[0], 'live-results.json'), 'utf8'));
    assert.equal(report.protocolVersion, 2);
    assert.equal(report.tasks.length, 4);
    for (const task of report.tasks) {
      assert.equal(typeof task.prompt, 'string');
      for (const surface of ['catalog', 'code']) {
        const run = task.perSurface[surface][0];
        assert(run.checks.every((check: { pass: boolean }) => check.pass));
        assert.equal(run.result.events[1].args.fixture, true);
        assert(run.result.events[2].content.length > 36000);
        assert.deepEqual(run.result.stateDiff, run.result.appliedDiffs);
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
