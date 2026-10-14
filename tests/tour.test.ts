import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInventory } from '../src/lib/inventory/fixtures/builders';
import type { VirtualMachine } from '../src/lib/inventory/types';
import { buildProjection, diffProjection } from '../src/lib/inventory/projection';
import { computeGroundTruth } from '../src/lib/inventory/truth';
import { sameChanges } from '../src/lib/bench-checks';
import { runBench } from '../src/lib/agent/loop';
import { MAX_ITERATIONS } from '../src/lib/agent/limits';
import { createCatalogSurface } from '../src/lib/surfaces/catalog';
import { createCodeSurface } from '../src/lib/surfaces/code';
import { CODE_TOOLS, OPERATE_NAME } from '../src/lib/surfaces/code/schemas';
import { SCHEMA_DOC } from '../src/lib/surfaces/code/helpers';
import type { Surface } from '../src/lib/surfaces/types';
import type { ChatTurnArgs, ProviderClient, ProviderToolCall } from '../src/lib/agent/providers/types';
import { buildEstateModel } from '../src/lib/tour/estate';
import { createCatalogSim } from '../src/lib/tour/catalog-sim';
import { callId, toolMessageTokens, type Replay } from '../src/lib/tour/replay';
import { CATALOG_ROUTES, replayCatalog } from '../src/lib/tour/scenarios';
import { needleFor } from '../src/lib/tour/needles';
import { countMarks, dominantKind, marksAt } from '../src/lib/tour/touch';
import { estimateTokens, fmtTokens } from '../src/lib/tour/tokens';
import { factsFromCodeResult, formatAnswer, type TaskId } from '../src/lib/tour/answers';
import { readFileSync } from 'node:fs';
import { runTracked } from '../src/lib/tour/code-run';
import { CONTRACT_PROBES, TASK_ORDER, parseSolutionPrograms } from '../src/lib/tour/programs';
import { codeTouches, replayCode } from '../src/lib/tour/code-compare';
import { PART_KEYS, billedAt, billedSplit, callSummary, costFacts, lastFrame, promptSplit, runBill, stepBadge, turnAt, turnFlow, turnResultTokens } from '../src/lib/tour/replay-view';
import { clipLines, isJson, prettyJson, tokenizeJson } from '../src/lib/tour/json-highlight';
import { answerFor, backToModelTokens, compareSurfaces, comparisonHeadline, comparisonLesson, groupDiff, outcomeCaption, probeResult, replayRun, seenBy } from '../src/lib/tour/code-view';
import {
  FEATURES,
  FEATURE_IDS,
  FRESH_QUESTIONS,
  buildLadder,
  buildToolRungs,
  coverage,
  EXAMPLE_QUERIES,
  definitionTokens,
  evaluateExpression,
  keywords,
  rungFacts,
  queryContent,
  queryTool,
  runQuery,
  type FeatureId,
  type QueryOut
} from '../src/lib/tour/language';
import {
  ACTS,
  AT,
  GATE,
  LAST_STEP,
  LEFT,
  OBJ,
  PROGRAM_MAX_LINES,
  RIGHT,
  STEP_IDS,
  ZOOM,
  actOf,
  buildObjectStage,
  cellPose,
  chipProgress,
  chipRect,
  closeUpOpacity,
  contractOpacity,
  ease,
  estateOpacity,
  findSweep,
  flightWindow,
  indexSweep,
  landed,
  landedCount,
  linkDraw,
  mixPose,
  poseAt,
  programLineOpacity,
  programOpacity,
  reach,
  recordFieldsOpacity,
  recordsOpacity,
  resultOpacity,
  seg,
  shortSubId,
  type Pose,
  type StepId
} from '../src/lib/tour/object-stage';
import { contractExcerpt, programBlocks, shapeForDisplay, stepCopy, tokenizeLine, traceAccess, type CopyFacts } from '../src/lib/tour/object-trace';

const truth = computeGroundTruth(buildInventory());

test('tokens: same ceil(chars/4) estimate the benchmark loop uses', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(fmtTokens(1234), '1,234');
  assert.equal(fmtTokens(28113), '28.1k');
});

test('estate model: every resource is drawn exactly once, grouped like the inventory', () => {
  const inv = buildInventory();
  const model = buildEstateModel(inv);
  assert.equal(model.totals.resources, 194);
  assert.equal(model.totals.vms, 44);
  assert.equal(model.totals.groups, 6);
  assert.equal(model.totals.subscriptions, 2);

  const seen = new Map<string, number>();
  for (const u of model.units) for (const m of u.members) seen.set(m.id, (seen.get(m.id) ?? 0) + 1);
  assert.equal(seen.size, inv.resources.length);
  assert.ok([...seen.values()].every((n) => n === 1), 'no resource drawn twice');

  for (const u of model.units) {
    for (const m of u.members) {
      assert.equal(model.resourceById.get(m.id)?.resourceGroup, u.groupName, `${m.name} lives in ${u.groupName}`);
    }
  }
  for (const g of model.groups) {
    const expected = inv.resources.filter((r) => r.resourceGroup === g.name).length;
    assert.equal(g.resourceCount, expected, g.name);
  }
  assert.equal(model.subscriptions.reduce((n, s) => n + s.resourceCount, 0), 194);

  const hero = model.unitById.get(inv.resources.find((r) => r.name === 'web-prod-03')!.id)!;
  assert.deepEqual(hero.members.slice(0, 3).map((m) => m.role), ['vm', 'nic', 'pip']);
  assert.equal(new Set(inv.resources.map((r) => r.name)).size, 194, 'resource names are unique (list rows map back to ids by name)');
});

test('catalog sim returns byte-identical tool results to the real catalog surface', async () => {
  const simInv = buildInventory();
  const realInv = buildInventory();
  const sim = createCatalogSim(simInv);
  const real = createCatalogSurface(undefined, realInv);
  const calls: Array<[string, Record<string, unknown>]> = [
    ['list_subscriptions', {}],
    ['list_resource_groups', { subscriptionName: 'Production' }],
    ['list_resources', { type: 'virtualMachine', subscriptionName: 'Production' }],
    ['get_resource', { name: 'web-prod-03' }],
    ['get_resource', { name: 'no-such-thing' }],
    ['update_resource_tags', { name: 'dev-box-02', tags: { env: 'x' } }],
    ['set_power_state', { name: 'dev-box-02', state: 'deallocated' }],
    ['set_power_state', { name: 'web-prod-03-nic', state: 'running' }],
    ['nope', {}]
  ];
  for (const [name, args] of calls) {
    const a = sim.dispatch(name, args);
    const b = await real.dispatch(name, args);
    assert.equal(a.content, b.content, name);
    assert.equal(Boolean(a.error), Boolean(b.error), `${name} error flag`);
    assert.deepEqual(a.diff ?? [], b.diff ?? [], `${name} diff`);
  }
  assert.equal(sim.systemPrompt, real.systemPrompt);
  assert.deepEqual(sim.tools, real.tools);
});

test('granular read: three dependent reads, four turns, correct answer, three full reads touched', () => {
  const r = replayCatalog({ task: 'granular-read' });
  assert.equal(r.totals.calls, 3);
  assert.equal(r.totals.turns, 4);
  assert.deepEqual(r.calls.map((c) => c.turn), [1, 2, 3]);
  assert.match(r.finalText, /running/);
  assert.match(r.finalText, /20\.103\.47\.219/);

  const needle = needleFor('granular-read', buildInventory());
  assert.equal(needle.resourceIds.size, 3);
  const marks = marksAt(r.touches, 99).resources;
  assert.equal(marks.size, 3);
  for (const id of needle.resourceIds) assert.equal(dominantKind(marks.get(id)), 'read');
  // The transcript is replayed every turn, so each turn's prompt is strictly larger.
  const prompts = r.turns.map((t) => t.promptTokens);
  assert.ok(prompts.every((p, i) => i === 0 || p > prompts[i - 1]));
  assert.equal(r.totals.billedTokens, r.totals.promptTokens + r.totals.completionTokens);
});

test('billing matches the real agent loop turn by turn (same messages, same ceil(chars/4))', async () => {
  const replay = replayCatalog({ task: 'granular-read' });
  const inv = buildInventory();
  const surface = createCatalogSurface(undefined, inv);
  const scripted: ProviderToolCall[][] = replay.turns.map((t) =>
    t.calls.map((c) => ({ id: callId(c.step), type: 'function' as const, function: { name: c.name, arguments: c.argsText } }))
  );
  let turn = 0;
  const provider: ProviderClient = {
    label: 'scripted',
    model: 'scripted',
    isStub: true,
    async chatTurn(args: ChatTurnArgs) {
      const chars =
        args.systemPrompt.length +
        args.messages.reduce((n, m) => n + JSON.stringify(m).length, 0) +
        (args.tools ? JSON.stringify(args.tools).length : 0);
      const calls = scripted[turn] ?? [];
      const content = calls.length ? '' : replay.finalText;
      const completion = calls.length
        ? calls.reduce((n, c) => n + estimateTokens(c.function.name + c.function.arguments), 0)
        : estimateTokens(content);
      turn += 1;
      const p = Math.ceil(chars / 4);
      return { content, toolCalls: calls, usage: { promptTokens: p, cachedPromptTokens: 0, completionTokens: completion, totalTokens: p + completion } };
    }
  };
  let metrics: { promptTokens: number; completionTokens: number; turns: number; toolCalls: number } | null = null;
  for await (const e of runBench({ provider, surface, task: replay.task, env: {} })) {
    if (e.type === 'complete') metrics = e.metrics;
  }
  assert.ok(metrics);
  assert.equal(metrics!.turns, replay.totals.turns);
  assert.equal(metrics!.toolCalls, replay.totals.calls);
  assert.equal(metrics!.promptTokens, replay.totals.promptTokens);
  assert.equal(metrics!.completionTokens, replay.totals.completionTokens);
});

test('filter + aggregate: exact total on both routes; survey route is the 19-call variant', () => {
  const broad = replayCatalog({ task: 'filter-aggregate', route: 'broad' });
  assert.equal(broad.totals.calls, 1);
  assert.match(broad.finalText, /\$5,461\.22/);
  assert.match(broad.finalText, /web-prod: \$2,920\.31/);
  assert.match(broad.finalText, /data-prod: \$1,852\.60/);
  assert.match(broad.finalText, /platform-prod: \$688\.31/);
  assert.match(broad.finalText, /Running VMs with no tags: none/);

  const survey = replayCatalog({ task: 'filter-aggregate', route: 'survey' });
  assert.equal(survey.totals.calls, 19, 'one list plus eighteen per-VM reads');
  assert.equal(survey.totals.turns, 3);
  assert.equal(survey.finalText, broad.finalText, 'both routes reach the same answer');
  assert.ok(survey.totals.billedTokens > broad.totals.billedTokens * 2);
});

test('bulk write: 38 calls reproduce the exact ground-truth write set', () => {
  const before = buildProjection(buildInventory());
  const r = replayCatalog({ task: 'bulk-write' });
  assert.equal(r.totals.calls, 38);
  assert.equal(r.calls.filter((c) => c.name === 'update_resource_tags').length, 33);
  assert.equal(r.calls.filter((c) => c.name === 'set_power_state').length, 4);
  assert.deepEqual(r.turns.map((t) => t.calls.length), [1, 37, 0]);

  const rows = diffProjection(before, buildProjection(r.inventory));
  assert.equal(rows.length, 70);
  assert.ok(sameChanges(rows, truth.expectedBulkDiff));

  const needle = needleFor('bulk-write', buildInventory());
  assert.equal(needle.resourceIds.size, 37);
  const counts = countMarks(marksAt(r.touches, 99).resources);
  assert.equal(counts.written, 37);
  assert.equal(counts.listed, 194 - 37);
  assert.equal(counts.touched, 194);
  assert.equal(counts.listed + counts.read + counts.scanned + counts.written, counts.touched);

  const trickle = replayCatalog({ task: 'bulk-write', batchSize: 10 });
  assert.equal(trickle.totals.calls, 38);
  assert.deepEqual(trickle.turns.map((t) => t.calls.length), [1, 10, 10, 10, 7, 0]);
  assert.ok(trickle.totals.billedTokens > r.totals.billedTokens, 'fewer parallel calls per turn means more replay');
  const one = replayCatalog({ task: 'bulk-write', batchSize: 1 });
  assert.equal(one.totals.turns, 39);
  assert.ok(one.totals.billedTokens > trickle.totals.billedTokens);
});

test('single lookup: one narrow call touches groups, not resources', () => {
  const r = replayCatalog({ task: 'single-lookup' });
  assert.equal(r.totals.calls, 1);
  assert.equal(r.finalText, formatAnswer({ task: 'single-lookup', names: ['web-prod', 'data-prod', 'platform-prod'] }));
  assert.match(r.finalText, /3 resource groups: web-prod, data-prod, platform-prod/);
  const marks = marksAt(r.touches, 99);
  assert.equal(marks.resources.size, 0);
  assert.equal(marks.groups.size, 3);
  const needle = needleFor('single-lookup', buildInventory());
  assert.deepEqual([...needle.groupNames].sort(), [...truth.prodGroups].sort());
});

test('touch marks: precedence, first-step tracking and step cut-off', () => {
  const marks = marksAt(
    [
      { step: 1, kind: 'listed', resourceId: 'a', tokens: 10 },
      { step: 2, kind: 'read', resourceId: 'a', tokens: 50 },
      { step: 3, kind: 'written', resourceId: 'a', fields: ['tags.env'] },
      { step: 2, kind: 'scanned', resourceId: 'b', fields: ['id', 'name'] },
      { step: 4, kind: 'listed', resourceId: 'c' }
    ],
    3
  ).resources;
  assert.equal(marks.has('c'), false, 'steps after the cut-off are not shown');
  const a = marks.get('a')!;
  assert.equal(dominantKind(a), 'written');
  assert.deepEqual(a.steps, [1, 2, 3]);
  assert.equal(a.tokens, 60);
  assert.equal(dominantKind(marks.get('b')), 'scanned');
  assert.deepEqual(marks.get('b')!.fields, ['id', 'name']);
});


// ── code runner ────────────────────────────────────────────────────────────
const docs = readFileSync(new URL('../docs/solution-path-examples.md', import.meta.url), 'utf8');
const programs = parseSolutionPrograms(docs);
const run = (code: string, rationale?: string, inv = buildInventory()) =>
  runTracked({ code, projection: buildProjection(inv), rationale });
const heroId = buildInventory().resources.find((r) => r.name === 'web-prod-03')!.id;

test('reference programs are parsed from the documented, verified source', () => {
  assert.deepEqual(Object.keys(programs), TASK_ORDER);
  for (const p of Object.values(programs)) assert.match(p.code, /function main\(/);
  assert.ok(programs['bulk-write'].rationale);
});

test('code runner: granular read follows references and records exactly which fields it read', () => {
  const inv = buildInventory();
  const o = run(programs['granular-read'].code, undefined, inv);
  assert.equal(o.status, 'ok');
  assert.deepEqual(JSON.parse(o.resultText!), { powerState: 'running', publicIp: '20.103.47.219' });
  assert.equal(o.mode, 'read');
  assert.equal(o.diff.length, 0);

  // Building the id index reads `id` on every resource: the runtime scanned all 194...
  assert.equal(Object.keys(o.scanned).length, 194);
  assert.equal(o.totals.resourcesScanned, 194);
  // ...but only three were read for their content.
  const vm = inv.resources.find((r) => r.name === 'web-prod-03') as any;
  const nic = inv.resources.find((r) => r.id === vm.nicId) as any;
  assert.ok(['id', 'name', 'powerState', 'nicId'].every((f) => o.scanned[vm.id].includes(f)));
  assert.ok(o.scanned[nic.id].includes('publicIpId'));
  assert.ok(o.scanned[nic.publicIpId].includes('ipAddress'));
  const deep = Object.entries(o.scanned).filter(([, f]) => f.some((x) => !['id', 'name', 'type'].includes(x)));
  assert.equal(deep.length, 3, 'exactly the VM, its NIC and its public IP were read beyond a lookup key');
  // Only two scalar facts come back, so no resource entered the model's context.
  assert.deepEqual(o.returned, {});
  assert.deepEqual(o.named, []);
});

test('code runner: aggregate is exact and the whole estate is scanned for it', () => {
  const o = run(programs['filter-aggregate'].code);
  const r = JSON.parse(o.resultText!);
  assert.equal(r.totalMonthly, 5461.22);
  // The reference program adds floats naively (platform-prod comes back as 688.3100000000001); compare in cents.
  const cents = Object.fromEntries(Object.entries(r.byResourceGroup as Record<string, number>).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  assert.deepEqual(cents, truth.prodRunningByGroup);
  assert.deepEqual(r.untaggedRunningVms, []);
  assert.equal(o.diff.length, 0);
  assert.equal(o.totals.resourcesScanned, 194);
  assert.deepEqual(o.namedGroups.sort(), [...truth.prodGroups].sort());
});

test('code runner: bulk write derives the exact 70-row change set from what the code did', () => {
  const o = run(programs['bulk-write'].code, programs['bulk-write'].rationale);
  assert.equal(o.status, 'ok');
  assert.equal(o.mode, 'read_write');
  assert.equal(o.diff.length, 70);
  assert.ok(sameChanges(o.diff, truth.expectedBulkDiff));
  assert.equal(o.resourcesAffected, 37);
  assert.deepEqual(JSON.parse(o.resultText!).deallocated, truth.expectedDeallocNames);
  assert.equal(JSON.parse(o.content).rationale, programs['bulk-write'].rationale);
  // Writes were observed as they happened, and agree with the derived diff.
  const writtenIds = new Set(o.diff.map((d) => d.resourceId));
  assert.deepEqual(new Set(Object.keys(o.attempted)), writtenIds);
  // The four deallocated VMs are named in the result the model receives.
  assert.equal(o.named.length >= 4, true);
  const events = codeTouches(o);
  assert.equal(events.filter((e) => e.kind === 'written').length, 37);
  assert.equal(events.filter((e) => e.kind === 'scanned' && e.resourceId).length, 194);
});

test('code runner: single lookup never touches a resource record, only groups', () => {
  const o = run(programs['single-lookup'].code);
  assert.deepEqual(JSON.parse(o.resultText!), { count: 3, names: ['web-prod', 'data-prod', 'platform-prod'] });
  assert.equal(Object.keys(o.scanned).length, 0);
  assert.equal(Object.keys(o.scannedGroups).length, 6);
  assert.equal(o.namedGroups.length, 3);
});

test('code runner: returning a record directly puts it in context in full (serialize phase)', () => {
  const o = run(`function main(data) { return data.resources.find((r) => r.name === 'web-prod-03'); }`);
  assert.ok(o.returned[heroId].length >= 10, 'every field of the record was read to build the result text');
  assert.ok(!o.returned[heroId].includes('toJSON'), 'language-level probes are not counted as reads');
  assert.deepEqual(Object.keys(o.returned), [heroId]);
  assert.ok(o.named.includes(heroId));
});

test('contract probes behave exactly as the UI claims', () => {
  const byId = Object.fromEntries(CONTRACT_PROBES.map((p) => [p.id, p]));
  const outcome = (id: string) => run(byId[id].code);

  const tag = outcome('tag');
  assert.equal(tag.status, 'ok');
  assert.deepEqual(tag.diff.map((d) => [d.field, d.op, d.after]), [['tags.reviewed', 'add', 'yes']]);

  const power = outcome('power');
  assert.equal(power.status, 'ok');
  assert.deepEqual(power.diff.map((d) => [d.field, d.before, d.after]), [['powerState', 'running', 'stopped']]);

  const cost = outcome('cost');
  assert.equal(cost.status, 'rejected');
  assert.equal(cost.error, 'web-prod-03: costMonthly is read-only');
  assert.equal(cost.errorResource, 'web-prod-03');
  assert.deepEqual(cost.attempted[heroId], ['costMonthly']);
  assert.equal(cost.diff.length, 0, 'a rejected proposal proposes nothing');

  assert.equal(outcome('tag-type').status, 'rejected');
  assert.match(outcome('tag-type').error!, /Invalid tag monthly/);
  assert.match(outcome('new-field').error!, /web-prod-03-nic: adding or removing resource fields is unsupported/);
  assert.equal(outcome('delete').error, 'Adding or removing resources is unsupported');

  const hidden = outcome('internal');
  assert.equal(hidden.status, 'ok');
  assert.deepEqual(JSON.parse(hidden.resultText!), { name: 'web-prod-03' }, 'internal fields are simply absent');

  const net = outcome('network');
  assert.equal(net.status, 'error');
  assert.match(net.error!, /fetch is not a function/);
  // 'loop' is exercised in the browser: a synchronous infinite loop can only be stopped by terminating its worker.
  assert.ok(byId.loop);
});

test('code runner: errors and missing main are reported, not thrown', () => {
  assert.equal(run('function main(data) { throw new Error("boom"); }').error, 'boom');
  assert.match(run('const x = 1;').error!, /must define function main/);
  assert.equal(run('function main( {').status, 'error');
});

test('both surfaces state the same answer, and the code surface re-reads far fewer tokens on multi-step work', () => {
  const inv = buildInventory();
  const totals: Record<string, { catalog: number; code: number }> = {};
  for (const task of TASK_ORDER) {
    const p = programs[task];
    const o = run(p.code, p.rationale);
    const facts = factsFromCodeResult(task, JSON.parse(o.resultText!));
    assert.ok(facts, task);
    const finalText = formatAnswer(facts!);
    const catalog = replayCatalog({ task });
    assert.equal(finalText, catalog.finalText, `${task}: same final answer on both surfaces`);
    const code = replayCode({ task: catalog.task, code: p.code, rationale: p.rationale, outcome: o, inventory: inv, finalText });
    assert.equal(code.totals.calls, 1);
    assert.equal(code.totals.turns, 2);
    totals[task] = { catalog: catalog.totals.billedTokens, code: code.totals.billedTokens };
  }
  // Multi-step work: the catalogue re-reads several times more.
  assert.ok(totals['bulk-write'].catalog > totals['bulk-write'].code * 2, JSON.stringify(totals));
  assert.ok(totals['granular-read'].catalog > totals['granular-read'].code, JSON.stringify(totals));
  // The counter-case: one narrow tool is cheaper than shipping the code surface's heavier description.
  assert.ok(totals['single-lookup'].catalog < totals['single-lookup'].code, JSON.stringify(totals));
});

test('replay view: billing by frame ends at the run total and never goes down', () => {
  for (const task of TASK_ORDER) {
    const r = replayCatalog({ task });
    assert.equal(lastFrame(r), r.calls.length + 1);
    assert.equal(billedAt(r, 0), 0, 'nothing is billed before the first request');
    assert.equal(billedAt(r, lastFrame(r)), r.totals.billedTokens, `${task}: the final frame carries the whole bill`);
    let prev = 0;
    for (let f = 0; f <= lastFrame(r); f++) {
      const b = billedAt(r, f);
      assert.ok(b >= prev, `${task}: billed went down at frame ${f}`);
      prev = b;
    }
  }
});

test('replay view: parallel calls share one turn, and a turn is billed when it is sent', () => {
  const r = replayCatalog({ task: 'bulk-write' });
  // call 1 is the survey (turn 1); calls 2..38 are one parallel turn (turn 2); the answer is turn 3
  assert.equal(turnAt(r, 1), 1);
  assert.equal(turnAt(r, 2), 2);
  assert.equal(turnAt(r, 38), 2);
  assert.equal(turnAt(r, 39), 3);
  assert.equal(billedAt(r, 2), billedAt(r, 38), 'every call in one turn shares that turn\u2019s bill');
  assert.ok(billedAt(r, 39) > billedAt(r, 38));
});

test('replay view: cost facts count the transcript once against what was billed', () => {
  const read = costFacts(replayCatalog({ task: 'granular-read' }));
  assert.equal(read.billed, 5894);
  assert.equal(read.once, 1655);
  assert.ok(Math.abs(read.multiple - 3.56) < 0.01, String(read.multiple));
  assert.ok(read.fixedShare > 0.6 && read.fixedShare < 0.75, 'most of a tiny run is re-sent tool definitions');

  const many = replayCatalog({ task: 'bulk-write', batchSize: 1 });
  const slow = costFacts(many);
  assert.equal(many.totals.turns, 39);
  assert.ok(slow.multiple > 40, 'one call per turn pays for the transcript dozens of times over');
  assert.ok(slow.fixedShare < 0.1, 'here the history, not the definitions, is the bill');
});

test('replay view: captions and badges describe what each call touched', () => {
  const inv = buildInventory();
  const model = buildEstateModel(inv);
  const nameOf = (id: string) => model.resourceById.get(id)?.name ?? id;

  const read = replayCatalog({ task: 'granular-read' });
  assert.equal(callSummary(read.calls[0], nameOf), 'Read web-prod-03 in full.');
  const pod = model.unitById.get(model.unitIdOf.get(model.resourceIdByName.get('web-prod-03')!)!)!;
  assert.equal(stepBadge(pod, marksAt(read.touches, 1)), '1');
  assert.equal(stepBadge(pod, marksAt(read.touches, 3)), '1\u20133');

  const bulk = replayCatalog({ task: 'bulk-write' });
  assert.match(callSummary(bulk.calls[0], nameOf), /^194 resources came back/);
  assert.match(callSummary(bulk.calls[1], nameOf), /^Changed /);

  const lookup = replayCatalog({ task: 'single-lookup' });
  assert.equal(callSummary(lookup.calls[0], nameOf), '3 resource groups came back.');
  assert.equal(stepBadge(pod, marksAt([], 5)), null);
});

/** Every run the tools screen can show: each question, each route, and each way of batching calls. */
function allCatalogRuns(): Array<{ label: string; task: TaskId; replay: Replay }> {
  const runs: Array<{ label: string; task: TaskId; replay: Replay }> = [];
  for (const task of TASK_ORDER) {
    for (const route of CATALOG_ROUTES[task]) {
      const base = replayCatalog({ task, route: route.id });
      runs.push({ label: `${task}/${route.id}`, task, replay: base });
      // Batching only changes runs that make parallel calls.
      if (base.turns.some((t) => t.calls.length > 1)) {
        for (const batchSize of [10, 1]) {
          runs.push({ label: `${task}/${route.id}, ${batchSize} per turn`, task, replay: replayCatalog({ task, route: route.id, batchSize }) });
        }
      }
    }
  }
  return runs;
}

/** Every run the screens draw: the tools screen's nine, the eight rungs of the ladder, and each question on both surfaces of the code screen. */
function allScreenRuns(): Array<{ label: string; replay: Replay }> {
  const runs = allCatalogRuns().map(({ label, replay }) => ({ label: `tools: ${label}`, replay }));
  const cmp = compareSurfaces('filter-aggregate', programs['filter-aggregate']);
  for (const r of buildLadder(buildInventory(), cmp.code)) runs.push({ label: `rung ${r.n}: ${r.title}`, replay: r.replay });
  for (const task of TASK_ORDER) {
    const c = compareSurfaces(task, programs[task]);
    runs.push({ label: `${task}: catalogue`, replay: c.catalog }, { label: `${task}: code`, replay: c.code });
  }
  return runs;
}

/**
 * Play a replay's calls through the real agent loop with a scripted model. The loop must read and
 * write exactly what the replay says, turn by turn, and hand the model back the very same bytes.
 */
async function auditAgainstLoop(label: string, surface: Surface, replay: Replay): Promise<void> {
  const scripted: ProviderToolCall[][] = replay.turns.map((t) =>
    t.calls.map((c) => ({ id: callId(c.step), type: 'function' as const, function: { name: c.name, arguments: c.argsText } }))
  );
  const prompt: number[] = [];
  const completion: number[] = [];
  let lastResults: string[] = [];
  let turn = 0;
  const provider: ProviderClient = {
    label: 'scripted',
    model: 'scripted',
    isStub: true,
    async chatTurn(args: ChatTurnArgs) {
      const chars = args.systemPrompt.length + args.messages.reduce((n, m) => n + JSON.stringify(m).length, 0) + (args.tools ? JSON.stringify(args.tools).length : 0);
      lastResults = args.messages.flatMap((m) => (m.role === 'tool' ? [m.content] : []));
      const calls = scripted[turn] ?? [];
      const content = calls.length ? '' : replay.finalText;
      const out = calls.length ? calls.reduce((n, c) => n + estimateTokens(c.function.name + c.function.arguments), 0) : estimateTokens(content);
      turn += 1;
      const p = Math.ceil(chars / 4);
      prompt.push(p);
      completion.push(out);
      return { content, toolCalls: calls, usage: { promptTokens: p, cachedPromptTokens: 0, completionTokens: out, totalTokens: p + out } };
    }
  };
  let metrics: { promptTokens: number; completionTokens: number; turns: number; toolCalls: number } | null = null;
  let stopped: string | null = null;
  for await (const e of runBench({ provider, surface, task: replay.task, env: {} })) {
    if (e.type === 'complete') metrics = e.metrics;
    if (e.type === 'error') {
      metrics = e.metrics;
      stopped = e.message;
    }
  }
  assert.ok(metrics, label);
  // The benchmark's loop gives a model MAX_ITERATIONS turns. A replay that needs more is a what-if:
  // the loop agrees with it turn by turn up to the cap and then stops the run.
  const played = replay.turns.slice(0, MAX_ITERATIONS);
  if (replay.turns.length > MAX_ITERATIONS) assert.match(stopped ?? '', new RegExp(`did not finish within ${MAX_ITERATIONS} turns`), label);
  else assert.equal(stopped, null, `${label}: the loop finishes the run`);
  // The replay says the same thing the real loop measured, turn by turn, not just in total.
  assert.deepEqual(prompt, played.map((t) => t.promptTokens), `${label}: input per turn`);
  assert.deepEqual(completion, played.map((t) => t.completionTokens), `${label}: output per turn`);
  assert.equal(metrics!.turns, played.length, `${label}: turns`);
  assert.equal(metrics!.toolCalls, played.reduce((n, t) => n + t.calls.length, 0), `${label}: calls`);
  assert.equal(metrics!.promptTokens, played.reduce((n, t) => n + t.promptTokens, 0), `${label}: input total`);
  assert.equal(metrics!.completionTokens, played.reduce((n, t) => n + t.completionTokens, 0), `${label}: output total`);
  // Same sizes could still hide different text. What the model reads back is, byte for byte, what the replay holds.
  assert.ok(lastResults.length > 0, `${label}: the model was handed results`);
  assert.deepEqual(lastResults, replay.calls.slice(0, lastResults.length).map((c) => c.content), `${label}: the results the model reads back`);
}

test('billing audit: the tools screen covers nine runs, and every one is billed exactly like the real agent loop, turn by turn', async () => {
  const runs = allCatalogRuns();
  assert.equal(runs.length, 9, runs.map((r) => r.label).join(' | '));
  for (const run of runs) await auditAgainstLoop(run.label, createCatalogSurface(undefined, buildInventory()), run.replay);
});

test('billing audit: the code surface, for every question, is billed exactly like the real agent loop, turn by turn', async () => {
  for (const task of TASK_ORDER) {
    const { code } = compareSurfaces(task, programs[task]);
    assert.equal(code.turns.length, 2, `${task}: write the program, then state the answer`);
    await auditAgainstLoop(`${task}/code`, createCodeSurface(undefined, buildInventory()), code);
  }
});

test('billing audit: exactly two what-if runs are longer than the benchmark lets a model go', () => {
  const tooLong = allCatalogRuns()
    .filter((r) => r.replay.turns.length > MAX_ITERATIONS)
    .map((r) => `${r.label}: ${r.replay.turns.length} turns`);
  // The screen says so next to these two, and only these two.
  assert.deepEqual(tooLong, ['filter-aggregate/survey, 1 per turn: 20 turns', 'bulk-write/standard, 1 per turn: 39 turns']);
});

test('billing audit: each request is the one before plus the last turn’s calls and results, and nothing else', () => {
  for (const { label, replay } of allScreenRuns()) {
    replay.turns.forEach((turn, i) => {
      for (const c of turn.calls) {
        const wrapped = JSON.stringify({ role: 'tool', tool_call_id: c.id, content: c.content });
        assert.equal(c.resultSentTokens, estimateTokens(wrapped), `${label}, call ${c.step}: a result costs what its whole message costs`);
        assert.ok(c.resultSentTokens >= c.resultTokens, `${label}, call ${c.step}: the wrapper only adds`);
        assert.equal(c.callTokens, estimateTokens(c.name + c.argsText), `${label}, call ${c.step}: output is the name and the arguments`);
      }
      if (i === 0) return;
      // Rebuild what the previous turn put into the conversation from the recorded calls alone.
      const prev = replay.turns[i - 1];
      const assistant = {
        role: 'assistant',
        content: '',
        tool_calls: prev.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.argsText } }))
      };
      const added =
        JSON.stringify(assistant).length +
        prev.calls.reduce((n, c) => n + JSON.stringify({ role: 'tool', tool_call_id: c.id, content: c.content }).length, 0);
      const grew = turn.promptTokens - prev.promptTokens;
      // Both requests are rounded up once, so the growth can differ from added/4 by less than a token.
      assert.ok(Math.abs(grew - added / 4) < 1, `${label}, turn ${turn.n}: grew by ${grew}, the previous turn added ${added / 4}`);
      // What the model wrote last turn comes back as input, wrapped, so it can only be bigger.
      assert.ok(promptSplit(replay.turns, i).fresh.calls >= prev.completionTokens, `${label}, turn ${turn.n}: the calls come back at least as large as they were written`);
    });
  }
});

test('billing audit: a turn writes only its calls, the last turn writes only the answer, and the totals are their sum', () => {
  for (const { label, replay } of allScreenRuns()) {
    const { turns, totals } = replay;
    const last = turns[turns.length - 1];
    turns.slice(0, -1).forEach((t) => {
      assert.ok(t.calls.length > 0, `${label}, turn ${t.n}: every turn before the last makes a call`);
      assert.equal(t.text, '', `${label}, turn ${t.n}: a turn that calls tools writes no answer`);
      assert.equal(t.completionTokens, t.calls.reduce((n, c) => n + c.callTokens, 0), `${label}, turn ${t.n}: it writes exactly its calls`);
    });
    assert.equal(last.calls.length, 0, `${label}: the last turn makes no call`);
    assert.equal(last.text, replay.finalText);
    assert.equal(last.completionTokens, estimateTokens(replay.finalText), `${label}: the last turn writes the answer`);
    assert.equal(last.completionTokens, totals.answerTokens);
    assert.ok(last.completionTokens * 10 < last.promptTokens, `${label}: the answer is tiny next to everything it re-reads`);
    assert.equal(totals.turns, turns.length);
    assert.equal(totals.calls, replay.calls.length);
    assert.equal(totals.promptTokens, turns.reduce((n, t) => n + t.promptTokens, 0));
    assert.equal(totals.completionTokens, turns.reduce((n, t) => n + t.completionTokens, 0));
    assert.equal(totals.billedTokens, totals.promptTokens + totals.completionTokens);
    assert.deepEqual(
      turns.flatMap((t) => t.calls.map((c) => c.step)),
      replay.calls.map((c) => c.step),
      `${label}: calls are numbered in the order the turns made them`
    );
  }
});

test('billing audit: the bill so far splits into what was read and what was written, and ends at the run total', () => {
  for (const { label, replay } of allScreenRuns()) {
    assert.deepEqual(billedSplit(replay, 0), { input: 0, output: 0 }, `${label}: nothing is billed before the first request`);
    let prev = 0;
    for (let f = 0; f <= lastFrame(replay); f++) {
      const b = billedSplit(replay, f);
      const turn = turnAt(replay, f);
      assert.equal(b.input + b.output, billedAt(replay, f), `${label}, frame ${f}`);
      assert.equal(b.input, replay.turns.filter((t) => t.n <= turn).reduce((n, t) => n + t.promptTokens, 0), `${label}, frame ${f}: input`);
      assert.ok(b.input + b.output >= prev, `${label}, frame ${f}: never goes down`);
      prev = b.input + b.output;
    }
    assert.deepEqual(
      billedSplit(replay, lastFrame(replay)),
      { input: replay.totals.promptTokens, output: replay.totals.completionTokens },
      `${label}: the last frame carries the whole bill`
    );
    // The first call's frame already includes the first turn's request and the call it wrote.
    const first = replay.turns[0];
    assert.deepEqual(billedSplit(replay, 1), { input: first.promptTokens, output: first.completionTokens }, `${label}: frame 1 is turn 1 read and written`);
  }
});

test('billing audit: a turn in plain terms is what it read (cached + new) and what it wrote', () => {
  for (const { label, replay } of allScreenRuns()) {
    replay.turns.forEach((t, i) => {
      const flow = turnFlow(replay.turns, i);
      assert.equal(flow.cached + flow.fresh, flow.input, `${label}, turn ${t.n}: cached + new is everything it read`);
      assert.equal(flow.input, t.promptTokens);
      assert.equal(flow.output, t.completionTokens);
      assert.equal(flow.calls, t.calls.length);
      assert.equal(flow.cached, i === 0 ? 0 : replay.turns[i - 1].promptTokens, `${label}, turn ${t.n}: what is cached is the whole request before`);
    });
  }
});

test('billing audit: a whole run is what it read (repeated + new) plus what it wrote, for every run on every screen', () => {
  const runs = allScreenRuns();
  assert.equal(runs.length, 9 + 8 + 8, runs.map((r) => r.label).join(' | '));
  for (const { label, replay } of runs) {
    const b = runBill(replay);
    const last = replay.turns[replay.turns.length - 1];
    assert.equal(b.cached + b.fresh, b.input, `${label}: repeated + new is everything it read`);
    assert.equal(b.input + b.output, b.total, `${label}: read + written is the bill`);
    assert.equal(b.total, replay.totals.billedTokens, `${label}: the bill is the run's total`);
    assert.equal(b.output, replay.turns.reduce((n, t) => n + t.completionTokens, 0), `${label}: output`);
    // Each request holds the one before it, so what is new adds up to the last request, once.
    assert.equal(b.fresh, last.promptTokens, `${label}: new text, added up, is the finished conversation`);
    assert.equal(b.cached, replay.turns.slice(0, -1).reduce((n, t) => n + t.promptTokens, 0), `${label}: repeated text is every request but the last, read once more`);
    assert.deepEqual({ input: b.input, output: b.output }, billedSplit(replay, lastFrame(replay)), `${label}: the bill the replay screen ends on`);
    // Every run here makes at least one call, so something is read twice.
    assert.ok(b.cached > 0 && b.fresh > 0 && b.output > 0, label);
  }
});

test('billing audit: a result is sized one way on every screen, as the whole message the conversation carries', () => {
  for (const { label, replay } of allScreenRuns()) {
    for (const c of replay.calls) {
      assert.equal(c.resultSentTokens, toolMessageTokens(c.id, c.content), `${label}, call ${c.step}`);
      assert.ok(c.resultSentTokens >= c.resultTokens, `${label}, call ${c.step}: the message around a result only adds`);
    }
    for (const t of replay.turns) assert.equal(turnResultTokens(t), t.calls.reduce((n, c) => n + c.resultSentTokens, 0), `${label}, turn ${t.n}`);
  }
  // On the code screen, the tile, the caption and the replay's result are one number, for every question.
  for (const task of TASK_ORDER) {
    const outcome = run(programs[task].code, programs[task].rationale);
    const { code } = compareSurfaces(task, programs[task]);
    assert.equal(backToModelTokens(outcome), code.calls[0].resultSentTokens, `${task}: what comes back to the model`);
    assert.equal(backToModelTokens(outcome), turnResultTokens(code.turns[0]), `${task}: and what turn 1 adds`);
    assert.ok(backToModelTokens(outcome) > estimateTokens(outcome.content), `${task}: more than the bare text`);
  }
});

test('code run: the program in the editor is billed as the two-turn conversation it is', () => {
  for (const task of TASK_ORDER) {
    const program = programs[task];
    const outcome = run(program.code, program.rationale);
    const mine = replayRun(task, program, outcome);
    const reference = compareSurfaces(task, program);
    assert.deepEqual(mine.totals, reference.code.totals, `${task}: the reference run is the run the comparison bills`);
    assert.deepEqual(runBill(mine), runBill(reference.code));
    assert.equal(mine.finalText, answerFor(task, outcome), `${task}: it ends on the answer for this result`);
    assert.equal(mine.finalText, reference.catalog.finalText, `${task}: the same words as the catalogue`);

    const [first, second] = [turnFlow(mine.turns, 0), turnFlow(mine.turns, 1)];
    // Turn 1 reads the setup and the question for the first time, and writes the program.
    const args = JSON.stringify(program.rationale ? { rationale: program.rationale, code: program.code } : { code: program.code });
    assert.equal(first.cached, 0, `${task}: nothing was sent before`);
    assert.equal(first.fresh, first.input, `${task}: so all of it is new`);
    assert.equal(first.output, estimateTokens(OPERATE_NAME + args), `${task}: what it writes is the call: the tool's name and the program`);
    assert.equal(mine.calls[0].callTokens, first.output);
    // Turn 2 reads all of turn 1 again, plus its own call and the result, and writes the answer.
    assert.equal(second.cached, mine.turns[0].promptTokens, `${task}: it reads the whole first request again`);
    assert.ok(second.fresh > turnResultTokens(mine.turns[0]), `${task}: what is new is its own call and the result`);
    assert.equal(second.output, estimateTokens(mine.finalText), `${task}: it writes the answer`);
    assert.equal(mine.turns[1].calls.length, 0);
  }

  // A program that fails is a call and its error: the model would read the error and try again.
  const broken = 'function main(data) { throw new Error("boom"); }';
  const failed = run(broken);
  const replay = replayRun('granular-read', { code: broken }, failed);
  assert.equal(replay.calls.length, 1);
  assert.equal(replay.calls[0].error, true);
  assert.equal(replay.calls[0].content, failed.content);
  assert.equal(turnResultTokens(replay.turns[0]), backToModelTokens(failed));
  assert.equal(turnFlow(replay.turns, 0).output, estimateTokens(OPERATE_NAME + JSON.stringify({ code: broken })));
});

test('replay view: each request splits into what it repeats and what is new', () => {
  const all = allCatalogRuns();
  const runs = all.map((r) => r.replay);
  const sum = (p: Record<(typeof PART_KEYS)[number], number>): number => PART_KEYS.reduce((n, k) => n + p[k], 0);
  for (const r of runs) {
    const fixed = r.turns[0].parts.system + r.turns[0].parts.tools;
    r.turns.forEach((turn, i) => {
      const s = promptSplit(r.turns, i);
      const where = `${r.task}, turn ${turn.n}`;
      // The numbers a reader sees must add up exactly: cached + new = what the turn sent.
      assert.equal(s.cachedTokens + s.freshTokens, turn.promptTokens, `${where}: cached + new is the whole request`);
      assert.equal(sum(s.cached), s.cachedTokens, `${where}: the cached parts add up to the cached total`);
      assert.equal(sum(s.fresh), s.freshTokens, `${where}: the new parts add up to the new total`);
      for (const k of PART_KEYS) assert.ok(s.cached[k] >= 0 && s.fresh[k] >= 0, `${where}: no negative part`);
      if (i === 0) {
        assert.equal(s.cachedTokens, 0, 'nothing has been sent before the first request');
        assert.equal(s.fresh.calls + s.fresh.results, 0, 'the first request holds no calls yet');
        assert.ok(Math.abs(s.fresh.fixed - fixed) <= PART_KEYS.length, 'the first request sends the instructions and tools for the first time');
      } else {
        assert.equal(s.cachedTokens, r.turns[i - 1].promptTokens, `${where}: what repeats is exactly the previous request`);
        assert.ok(Math.abs(s.cached.fixed - fixed) <= PART_KEYS.length, `${where}: instructions and tools repeat`);
        assert.ok(Math.abs(s.cached.user - turn.parts.user) <= PART_KEYS.length, `${where}: the question repeats`);
        assert.equal(s.fresh.fixed + s.fresh.user, 0, `${where}: only calls and results can be new`);
        assert.ok(s.fresh.calls > 0 && s.fresh.results > 0, `${where}: the last turn added a call and its result`);
      }
    });
  }
  // With one call per turn, a request is the previous one plus exactly one call and its result.
  const slow = all.find((r) => r.label === 'filter-aggregate/survey, 1 per turn')!.replay;
  assert.equal(slow.turns.length, 20);
  const last = promptSplit(slow.turns, 19);
  assert.ok(last.cachedTokens > 8 * last.freshTokens, 'late in a long run almost everything is repeated');
});

test('json view: tokens reassemble the text exactly and tell keys, strings, numbers and literals apart', () => {
  const text = prettyJson('{"a":1,"b":[true,null,"x"],"c":{"d":-2.5,"e":"say \\"hi\\": now"}}');
  const tokens = tokenizeJson(text);
  assert.equal(tokens.map((t) => t.s).join(''), text);
  const kindOf = (s: string) => tokens.find((t) => t.s.trim() === s)?.k;
  assert.equal(kindOf('"a"'), 'key');
  assert.equal(kindOf('"d"'), 'key');
  assert.equal(kindOf('1'), 'num');
  assert.equal(kindOf('-2.5'), 'num');
  assert.deepEqual(
    tokenizeJson('[1e5, -2.5E-3, 0.5]').filter((t) => t.k === 'num').map((t) => t.s.trim()),
    ['1e5', '-2.5E-3', '0.5'],
    'exponents are numbers too'
  );
  assert.equal(kindOf('true'), 'lit');
  assert.equal(kindOf('null'), 'lit');
  assert.equal(kindOf('"x"'), 'str');
  assert.equal(kindOf('"say \\"hi\\": now"'), 'str', 'a colon inside a string does not make it a key');
  assert.equal(tokens.filter((t) => t.k === 'key').length, 5);

  // Anything at all comes back whole, even text that is not JSON.
  for (const raw of ['', '   ', 'Error: resource not found', '{"a": "unterminated', '[1, 2,', '\u2026 12 more characters', '"\\']) {
    assert.equal(tokenizeJson(raw).map((t) => t.s).join(''), raw, JSON.stringify(raw));
  }
  assert.equal(isJson('{"a":1}'), true);
  assert.equal(isJson('Error: resource not found'), false);
  assert.equal(prettyJson('Error: resource not found'), 'Error: resource not found');
  assert.equal(prettyJson('{"a":[1]}'), '{\n  "a": [\n    1\n  ]\n}');
});

test('json view: every real tool result reassembles, and long ones are clipped to whole lines', () => {
  let longest = '';
  for (const r of [replayCatalog({ task: 'granular-read' }), replayCatalog({ task: 'filter-aggregate', route: 'survey' }), replayCatalog({ task: 'bulk-write' })]) {
    for (const c of r.calls) {
      const shown = prettyJson(c.content);
      assert.equal(tokenizeJson(shown).map((t) => t.s).join(''), shown, `${r.task} step ${c.step}`);
      if (shown.length > longest.length) longest = shown;
    }
  }
  const lines = longest.split('\n').length;
  assert.ok(lines > 1500, 'the whole-estate listing is well over a thousand lines');
  const clip = clipLines(longest, 200);
  assert.equal(clip.text.split('\n').length, 200);
  assert.equal(clip.more, lines - 200);
  assert.equal(clip.text, longest.split('\n').slice(0, 200).join('\n'));

  assert.deepEqual(clipLines('a\nb\nc', 2), { text: 'a\nb', more: 1 });
  assert.deepEqual(clipLines('a\nb\nc', 1), { text: 'a', more: 2 });
  assert.deepEqual(clipLines('a\nb', 5), { text: 'a\nb', more: 0 });
  assert.deepEqual(clipLines('one line', 3), { text: 'one line', more: 0 });
  assert.deepEqual(clipLines('a\nb', Infinity), { text: 'a\nb', more: 0 });
});

// ── code screen helpers ────────────────────────────────────────────────────
test('code view: the caption states what the run scanned, what came back and what it changed', () => {
  assert.equal(outcomeCaption(null).tone, 'idle');

  const read = run(programs['granular-read'].code);
  const cap = outcomeCaption(read);
  assert.equal(cap.tone, 'ok');
  assert.match(cap.text, /^Looked at 194 resources inside the runtime\./);
  assert.match(cap.text, /No individual resource reached the model, only the answer: \u2248 \d+ tokens\./, 'two scalar values came back, not records');
  assert.deepEqual(seenBy(read), { resources: 0, groups: 0 });

  // Returning a record itself is different: that resource enters the model's context in full.
  const whole = run("function main(data) { return data.resources.filter((r) => r.name === 'web-prod-03'); }");
  // The record carries the ids of its NIC and disks and its group name, so those are named in what came back too.
  assert.deepEqual(seenBy(whole), { resources: 4, groups: 1 });
  assert.match(outcomeCaption(whole).text, /4 resources and 1 resource group name reached the model, as \u2248 \d+ tokens\./);

  // The aggregate names the three production groups in its answer, and nothing else from the estate.
  const aggregate = outcomeCaption(run(programs['filter-aggregate'].code));
  assert.match(aggregate.text, /^Looked at 194 resources inside the runtime\. 3 resource group names reached the model, as \u2248 \d+ tokens\.$/);

  const write = run(programs['bulk-write'].code, programs['bulk-write'].rationale);
  const wcap = outcomeCaption(write);
  assert.match(wcap.text, /Proposed \d+ changes to 37 resources\. Nothing is applied until it is approved\./);
  assert.match(outcomeCaption(write, 'approved').text, /Approved, and applied to this copy of the estate\.$/);
  assert.match(outcomeCaption(write, 'declined').text, /Declined, so nothing changed\.$/);

  const lookup = outcomeCaption(run(programs['single-lookup'].code));
  assert.match(lookup.text, /resource groups? inside the runtime/);
  assert.match(lookup.text, /3 resource group names reached the model/);

  for (const bad of ['function main(data) { throw new Error("boom"); }', 'function main(data) { data.resources[0].costMonthly = 1; }']) {
    const c = outcomeCaption(run(bad));
    assert.equal(c.tone, 'bad');
    assert.match(c.text, /Nothing was applied\./);
  }
});

test('code runner: reads of resource-group fields are counted like reads of resource fields', () => {
  const lookup = run(programs['single-lookup'].code);
  assert.equal(lookup.totals.resourcesScanned, 0, 'this question never touches a resource');
  assert.equal(Object.keys(lookup.scannedGroups).length, 6);
  assert.ok(lookup.totals.propertyReads >= 6, String(lookup.totals.propertyReads));
});

test('code view: the change set is grouped per resource without losing or reordering rows', () => {
  const write = run(programs['bulk-write'].code, programs['bulk-write'].rationale);
  const groups = groupDiff(write.diff);
  assert.equal(groups.length, write.resourcesAffected);
  assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), write.diff.length);
  assert.deepEqual(groups.flatMap((g) => g.rows), [...write.diff].sort((a, b) => groups.findIndex((g) => g.resourceId === a.resourceId) - groups.findIndex((g) => g.resourceId === b.resourceId)));
  assert.deepEqual(groupDiff([]), []);
});

test('code view: every contract probe behaves as documented, and a mismatch is reported as one', () => {
  for (const p of CONTRACT_PROBES.filter((x) => x.id !== 'loop')) {
    const r = probeResult(p, run(p.code));
    assert.ok(r.met, `${p.id}: ${r.headline}`);
  }
  // The same verdicts applied to a program that does something else are not met.
  const idle = run('function main(data) { return 1; }');
  const byId = Object.fromEntries(CONTRACT_PROBES.map((p) => [p.id, p]));
  assert.equal(probeResult(byId.tag, idle).met, false);
  assert.equal(probeResult(byId.cost, idle).met, false);
  assert.equal(probeResult(byId.network, idle).met, false);
  assert.equal(probeResult(byId.loop, idle).met, false);
  assert.match(probeResult(byId.cost, run(byId.cost.code)).headline, /costMonthly is read-only/);
});

test('code view: the head-to-head says the same thing about both surfaces, including where the catalogue wins', () => {
  const c = Object.fromEntries(TASK_ORDER.map((t) => [t, compareSurfaces(t, programs[t])])) as Record<TaskId, ReturnType<typeof compareSurfaces>>;
  for (const t of TASK_ORDER) assert.ok(c[t].sameAnswer, `${t}: same answer`);
  assert.equal(c['bulk-write'].winner, 'code');
  assert.ok(c['bulk-write'].ratio > 2, String(c['bulk-write'].ratio));
  assert.equal(c['granular-read'].winner, 'code');
  assert.equal(c['single-lookup'].winner, 'catalog', 'the counter-case is kept');
  assert.match(comparisonHeadline(c['bulk-write']), /^At its best, the catalogue is billed \d+(\.\d)?\u00d7 the tokens of the code surface\.$/);
  assert.match(comparisonHeadline(c['single-lookup']), /^Here the catalogue wins/);
});

test('code view: each lesson quotes the numbers it was computed from', () => {
  const read = comparisonLesson(compareSurfaces('granular-read', programs['granular-read']));
  assert.match(read, /chains 3 calls over 4 turns/);
  assert.match(read, /makes 1 call/);
  const bulk = comparisonLesson(compareSurfaces('bulk-write', programs['bulk-write']));
  assert.match(bulk, /38 calls/);
  const agg = comparisonLesson(compareSurfaces('filter-aggregate', programs['filter-aggregate']));
  assert.match(agg, /so 21 summaries are enough/);
  assert.match(agg, /19 calls and \u2248 11\.7k tokens/);
  const one = comparisonLesson(compareSurfaces('single-lookup', programs['single-lookup']));
  assert.match(one, /1,312 tokens of setup per turn, against \u2248 1,014/);
});

// ── the ladder and the language ────────────────────────────────────────────
const ALL = new Set<FeatureId>(FEATURE_IDS);
const NONE = new Set<FeatureId>();
const rowsOf = (o: QueryOut): Array<Record<string, unknown>> => (o.ok && o.kind === 'rows' ? o.rows : []);

test('ladder: eight tool designs reach the same answer, and the three taxes show up where the article says', () => {
  const cmp = compareSurfaces('filter-aggregate', programs['filter-aggregate']);
  const ladder = buildLadder(buildInventory(), cmp.code);
  assert.equal(ladder.length, 8);
  assert.deepEqual(ladder.map((r) => r.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(ladder.map((r) => r.id), ['per-property', 'one-tool', 'aspect', 'aspects', 'filter', 'calculator', 'query', 'code']);
  for (const r of ladder) assert.equal(r.replay.finalText, cmp.code.finalText, `${r.id}: same final sentence`);

  // Round-trip tax: consolidating removes calls; the aspect parameter brings some back when a question spans two aspects,
  // and the calculator adds the calls that carry the figures to it.
  assert.deepEqual(ladder.map((r) => r.replay.totals.calls), [58, 22, 40, 22, 1, 5, 2, 1]);
  assert.ok(ladder[2].replay.totals.calls > ladder[1].replay.totals.calls);

  // Schema tax: after the one-tool rung, every rung's definitions are longer than the last.
  const setup = ladder.map((r) => r.setupTokens);
  assert.ok(setup[0] > setup[1], 'fourteen tools cost more than one');
  for (let i = 2; i < 8; i++) assert.ok(setup[i] > setup[i - 1], `rung ${i + 1} defines more than rung ${i}`);

  // The honest part: the query language is the cheapest bill for the question it was built for, and a calculator
  // makes the sums exact at a price: it bills more than the plain list.
  const billed = ladder.map((r) => r.replay.totals.billedTokens);
  assert.equal(Math.min(...billed), billed[6]);
  assert.ok(billed[6] < billed[7], 'the language beats code on its own question');
  assert.ok(billed[5] > billed[4], 'the calculator costs more than the list it adds up');
  for (const r of ladder) assert.equal(r.bill.total, r.replay.totals.billedTokens, `${r.id}: the bar is the bill`);
  assert.deepEqual(ladder[7].bill, runBill(cmp.code), 'the last rung is the very run the code screen compares');
});

test('the tool rungs are the ladder without the code rung, so a screen that only wants the tools does not run the program', () => {
  const cmp = compareSurfaces('filter-aggregate', programs['filter-aggregate']);
  const full = buildLadder(buildInventory(), cmp.code);
  const tools = buildToolRungs(buildInventory());
  assert.equal(tools.length, 7);
  assert.deepEqual(tools.map((r) => [r.id, r.n, r.bill]), full.slice(0, 7).map((r) => [r.id, r.n, r.bill]));
});

test('calculator: the arithmetic of a tool that parses text, and fails with a message instead of guessing', () => {
  const value = (s: string): number | string => {
    const out = evaluateExpression(s);
    return out.ok ? out.value : out.error;
  };
  assert.equal(value('12.5 + 30.1'), 42.6);
  assert.equal(value('2 * (3 + 4)'), 14);
  assert.equal(value('2 + 3 * 4'), 14, 'multiplication binds tighter than addition');
  assert.equal(value('10 - 4 - 3'), 3, 'subtraction runs left to right');
  assert.equal(value('-2 * 3'), -6);
  assert.equal(value('.5 + .5'), 1);
  assert.equal(value('0.1 + 0.2'), 0.3, 'adding cents does not come back as 0.30000000000000004');
  assert.equal(value('1/4'), 0.25);
  // Anything that is not arithmetic is refused, and says where.
  assert.equal(value('1 / 0'), 'Division by zero.');
  assert.equal(value('1 +'), 'The expression ends where a number should be.');
  assert.equal(value('(1 + 2'), 'A parenthesis is not closed.');
  assert.match(String(value('process.exit(1)')), /^Expected a number at position 1, found "p"\./);
  assert.match(String(value('1 2')), /^Unexpected "2" at position 3\./);
  assert.match(String(value('')), /ends where a number should be/);
});

test('calculator rung: every sum the model asks for is the sum of the costs the list returned, and every cost is copied in', () => {
  const inv = buildInventory();
  const calc = buildToolRungs(inv).find((r) => r.id === 'calculator')!;
  const filter = buildToolRungs(inv).find((r) => r.id === 'filter')!;
  const prod = inv.subscriptions.find((s) => s.name === 'Production')!.id;
  const running = inv.resources.filter((r): r is VirtualMachine => r.type === 'virtualMachine' && r.subscriptionId === prod && r.powerState === 'running');
  const groups = [...new Set(running.map((v) => v.resourceGroup))];
  const sums = calc.replay.calls.filter((c) => c.name === 'calculate');
  // One sum per resource group and one for the total, all in one turn after the list.
  assert.equal(sums.length, groups.length + 1);
  assert.deepEqual(calc.replay.turns.map((t) => t.calls.length), [1, sums.length, 0]);
  assert.equal(calc.replay.totals.calls, 1 + sums.length);
  // Each result is the sum of the costs in that call's own expression, to the cent.
  for (const c of sums) {
    const costs = String(c.args.expression).split('+').map((s) => Number(s));
    assert.ok(costs.every(Number.isFinite), `${c.argsText} holds only numbers`);
    assert.equal(JSON.parse(c.content).result, Math.round(costs.reduce((n, x) => n + x * 100, 0)) / 100);
  }
  // The costs it copies are the estate's: the group sums cover every running VM once, and the total covers them all.
  const copied = sums.slice(0, groups.length).flatMap((c) => String(c.args.expression).split('+').map(Number));
  assert.deepEqual([...copied].sort((a, b) => a - b), running.map((v) => v.costMonthly).sort((a, b) => a - b));
  assert.equal(String(sums[groups.length].args.expression).split('+').length, running.length);
  // And the price of it: more calls, one more turn, and a bigger bill than the plain list, for the same sentence.
  assert.ok(calc.replay.totals.turns > filter.replay.totals.turns);
  assert.ok(calc.bill.total > filter.bill.total);
  assert.ok(calc.bill.output > filter.bill.output, 'the figures are written out');
  assert.equal(calc.replay.finalText, filter.replay.finalText);
  assert.deepEqual(calc.tools.map((t) => t.function.name), ['list_resources', 'get_resource', 'calculate']);
});

test('query language: filter, group, aggregate, project, order and page behave like the data says', () => {
  const inv = buildInventory();
  const running = [
    { field: 'type', op: '=', value: 'virtualMachine' },
    { field: 'subscription', op: '=', value: 'Production' },
    { field: 'powerState', op: '=', value: 'running' }
  ];
  const sums = rowsOf(runQuery(inv, { where: running, groupBy: ['resourceGroup'], aggregate: [{ fn: 'sum', field: 'costMonthly', as: 'total' }] }, NONE));
  const byGroup = Object.fromEntries(sums.map((r) => [r.resourceGroup, r.total]));
  assert.deepEqual(byGroup, { 'web-prod': 2920.31, 'data-prod': 1852.6, 'platform-prod': 688.31 });

  const count = rowsOf(runQuery(inv, { from: 'resources', aggregate: [{ fn: 'count' }] }, NONE));
  assert.deepEqual(count, [{ count: 194 }]);

  const top = runQuery(inv, { where: [{ field: 'type', op: '=', value: 'virtualMachine' }], select: ['name', 'costMonthly'], orderBy: [{ field: 'costMonthly', dir: 'desc' }], limit: 3 }, NONE);
  assert.ok(top.ok && top.kind === 'rows');
  const costs = rowsOf(top).map((r) => Number(r.costMonthly));
  assert.deepEqual(costs, [...costs].sort((a, b) => b - a));
  assert.equal(top.ok && top.kind === 'rows' && top.nextOffset, 3, 'more rows remain, so the result says where to resume');
  assert.equal(top.ok && top.kind === 'rows' && top.total, 44);

  const page2 = rowsOf(runQuery(inv, { where: [{ field: 'type', op: '=', value: 'virtualMachine' }], select: ['name'], limit: 3, offset: 3, orderBy: [{ field: 'name' }] }, NONE));
  assert.equal(page2.length, 3);

  const groups = rowsOf(runQuery(inv, { from: 'resourceGroups', where: [{ field: 'subscription', op: '=', value: 'Production' }], select: ['name'] }, NONE));
  assert.deepEqual(groups.map((g) => g.name), ['web-prod', 'data-prod', 'platform-prod']);

  // Tag filters, containment, existence and lists.
  assert.ok(rowsOf(runQuery(inv, { where: [{ field: 'name', op: 'contains', value: 'dev-box' }], select: ['name'] }, NONE)).length >= 4);
  assert.equal(rowsOf(runQuery(inv, { where: [{ field: 'type', op: 'in', value: ['disk', 'publicIp'] }], aggregate: [{ fn: 'count' }] }, NONE))[0].count, inv.resources.filter((r) => r.type === 'disk' || r.type === 'publicIp').length);
});

test('query language: mistakes are explained, and a missing feature says which one', () => {
  const inv = buildInventory();
  const err = (q: unknown, f = NONE) => runQuery(inv, q, f);
  const unknownParam = err({ join: [] });
  assert.ok(!unknownParam.ok && unknownParam.needs === 'join' && /Unknown parameter "join"/.test(unknownParam.error));
  assert.equal((err({ compute: {} }) as { needs?: string }).needs, 'compute');
  assert.equal((err({ update: { set: {} } }) as { needs?: string }).needs, 'update');
  assert.equal((err({ queries: [] }) as { needs?: string }).needs, 'batch');
  assert.equal((err({ bogus: 1 }) as { needs?: string }).needs, undefined, 'an unknown parameter that is no feature suggests nothing');
  assert.match((err({ where: [{ field: 'nope', op: '=', value: 1 }] }) as { error: string }).error, /^Unknown field "nope" on resources\. Known fields: id, name/);
  assert.match((err({ where: [{ field: 'name', op: '~', value: 1 }] }) as { error: string }).error, /Unsupported operator "~"/);
  assert.match((err({ aggregate: [{ fn: 'median', field: 'costMonthly' }] }) as { error: string }).error, /Unsupported aggregate "median"\. Supported: count, sum, avg, min, max\./);
  assert.match((err({ from: 'disks' }) as { error: string }).error, /from must be one of/);
  assert.match((err({ limit: 500 }) as { error: string }).error, /limit must be an integer from 1 to 200/);
  assert.match((err('select *') as { error: string }).error, /must be a JSON object/);
  assert.match((err({ compute: { x: { fn: 'divide', field: 'costMonthly' } } }, ALL) as { error: string }).error, /Unsupported compute function "divide"\. Supported: daysSince\./);
});

test('query language: updates obey the same contract as the code surface and never touch the estate', () => {
  const inv = buildInventory();
  const before = JSON.stringify(inv);
  const tag = runQuery(inv, { where: [{ field: 'name', op: '=', value: 'web-prod-03' }], update: { set: { 'tags.reviewed': 'yes' } } }, ALL);
  assert.ok(tag.ok && tag.kind === 'update');
  assert.equal(tag.ok && tag.kind === 'update' && tag.changes.length, 1);
  assert.equal(JSON.stringify(inv), before, 'dry run: the estate is unchanged');

  const again = runQuery(inv, { where: [{ field: 'name', op: '=', value: 'web-prod-03' }], update: { set: { 'tags.owner': inv.resources.find((r) => r.name === 'web-prod-03')!.tags.owner } } }, ALL);
  assert.equal(again.ok && again.kind === 'update' && again.changes.length, 0, 'a value that already matches is skipped');

  const refuse = (set: Record<string, unknown>, where = [{ field: 'name', op: '=', value: 'web-prod-03' }]) => runQuery(inv, { where, update: { set } }, ALL);
  assert.match((refuse({ costMonthly: '0' }) as { error: string }).error, /Unsupported field to set: costMonthly/);
  assert.match((refuse({ 'tags.n': 5 }) as { error: string }).error, /Tag values must be strings/);
  assert.match((refuse({ powerState: 'asleep' }) as { error: string }).error, /powerState must be one of/);
  assert.match((refuse({ powerState: 'stopped' }, [{ field: 'name', op: '=', value: 'web-prod-03-nic' }]) as { error: string }).error, /only be set on virtual machines/);
  assert.match((runQuery(inv, { update: { set: { 'tags.a': 'b' } }, select: ['name'] }, ALL) as { error: string }).error, /cannot be combined/);
  assert.match((runQuery(inv, { from: 'resourceGroups', update: { set: { 'tags.a': 'b' } } }, ALL) as { error: string }).error, /Only resources can be updated/);
});

test('query language: references, computed values and batches', () => {
  const inv = buildInventory();
  const joined = rowsOf(runQuery(inv, { where: [{ field: 'name', op: '=', value: 'web-prod-03' }], join: [{ via: 'nicId', as: 'nic' }, { via: 'nic.publicIpId', as: 'pip' }], select: ['powerState', 'pip.ipAddress'] }, ALL));
  assert.deepEqual(joined, [{ powerState: 'running', 'pip.ipAddress': '20.103.47.219' }]);
  // A reference that points nowhere drops the row, as the description says.
  const withIp = rowsOf(runQuery(inv, { where: [{ field: 'type', op: '=', value: 'virtualMachine' }], join: [{ via: 'nicId', as: 'nic' }, { via: 'nic.publicIpId', as: 'pip' }], select: ['name'] }, ALL));
  const expected = inv.resources.filter((r) => r.type === 'virtualMachine' && (inv.resources.find((n) => n.id === r.nicId) as { publicIpId?: string } | undefined)?.publicIpId).length;
  assert.equal(withIp.length, expected);
  assert.ok(withIp.length < 44);

  const idle = rowsOf(runQuery(inv, { where: [{ field: 'type', op: '=', value: 'virtualMachine' }, { field: 'idleDays', op: '>', value: 30 }], compute: { idleDays: { fn: 'daysSince', field: 'lastActivityAt' } }, select: ['name', 'idleDays'] }, ALL));
  const truthIdle = computeGroundTruth(inv).expectedBulkDiff.filter((r) => r.field === 'powerState').map((r) => r.resourceName).sort();
  const idleDeallocatable = idle.map((r) => String(r.name)).filter((n) => truthIdle.includes(n)).sort();
  assert.deepEqual(idleDeallocatable, truthIdle, 'every VM the benchmark calls idle is idle here too');
  assert.ok(idle.every((r) => Number(r.idleDays) > 30));

  const batch = runQuery(inv, { queries: [{ from: 'subscriptions' }, { from: 'resourceGroups', select: ['name'], limit: 2 }] }, ALL);
  assert.ok(batch.ok && batch.kind === 'batch' && batch.results.length === 2);
  assert.match(queryContent(batch), /^\{"results":\[\{"total":2/);
  assert.ok(!runQuery(inv, { queries: [{ queries: [] }] }, ALL).ok, 'batches do not nest');
});

test('query language: the tool definition grows with every feature, and so does the vocabulary', () => {
  const sizes: number[] = [];
  const words: number[] = [];
  const on = new Set<FeatureId>();
  sizes.push(definitionTokens([queryTool(on)]));
  words.push(keywords(queryTool(on)).length);
  for (const f of FEATURES) {
    on.add(f.id);
    assert.match(queryTool(on).function.description, new RegExp('`' + f.param + '`'), `${f.id}: its semantics are written into the description`);
    sizes.push(definitionTokens([queryTool(on)]));
    words.push(keywords(queryTool(on)).length);
  }
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] > sizes[i - 1], `size ${sizes.join(', ')}`);
  for (let i = 1; i < words.length; i++) assert.ok(words[i] > words[i - 1], `words ${words.join(', ')}`);
  assert.ok(sizes[sizes.length - 1] > sizes[0] * 1.5);
});

test('coverage: each feature unlocks what the article says, and every answer matches the code surface', () => {
  const inv = buildInventory();
  const code = Object.fromEntries(TASK_ORDER.map((t) => [t, compareSurfaces(t, programs[t])])) as Record<TaskId, ReturnType<typeof compareSurfaces>>;
  const by = (f: Set<FeatureId>) => Object.fromEntries(coverage(f, inv).map((p) => [p.task, p]));

  const none = by(NONE);
  assert.equal(none['single-lookup'].calls, 1);
  assert.equal(none['filter-aggregate'].calls, 2);
  assert.equal(none['granular-read'].calls, 3, 'without references the model chains three queries, copying ids');
  assert.ok(!none['bulk-write'].ok && none['bulk-write'].needs === 'update');

  assert.equal(by(new Set<FeatureId>(['join']))['granular-read'].calls, 1);
  assert.equal(by(new Set<FeatureId>(['batch']))['filter-aggregate'].calls, 1);
  assert.equal(by(new Set<FeatureId>(['update']))['bulk-write'].calls, 2);
  assert.equal(by(new Set<FeatureId>(['update', 'batch']))['bulk-write'].calls, 1);

  for (const features of [ALL, new Set<FeatureId>(['update']), new Set<FeatureId>(['update', 'compute'])]) {
    const plans = by(features);
    for (const t of TASK_ORDER) {
      if (!plans[t].ok) continue;
      assert.equal(plans[t].answer, code[t].code.finalText, `${t} with [${[...features]}]: same sentence as the code surface`);
    }
  }
  // The write is the same write: the language's change set equals the benchmark's expected diff.
  for (const features of [new Set<FeatureId>(['update']), new Set<FeatureId>(['update', 'compute']), ALL]) {
    const w = by(features)['bulk-write'];
    assert.ok(w.ok && w.changes);
    assert.ok(sameChanges(w.changes!, computeGroundTruth(inv).expectedBulkDiff), `bulk write with [${[...features]}]`);
  }
  assert.equal(by(new Set<FeatureId>(['update']))['bulk-write'].reason?.startsWith('Without computed values'), true);
  assert.equal(by(ALL)['bulk-write'].reason, undefined);
});

test('fresh questions: one is unlocked by a feature, the others need features nobody has built, and code answers all of them', () => {
  const inv = buildInventory();
  const proj = buildProjection(inv);
  const q = Object.fromEntries(FRESH_QUESTIONS.map((f) => [f.id, f]));
  const code = (id: string) => {
    const o = runTracked({ code: q[id].code, projection: proj });
    assert.equal(o.status, 'ok', `${id}: ${o.error}`);
    return JSON.parse(o.resultText!);
  };

  // disks: needs "follow references", and then the language and the code agree row for row.
  const off = runQuery(inv, q.disks.query, NONE);
  assert.ok(!off.ok && off.needs === 'join');
  const on = rowsOf(runQuery(inv, q.disks.query, ALL));
  const disks = code('disks') as Array<{ disk: string; vm: string }>;
  assert.ok(on.length > 0 && on.length === disks.length, `${on.length} vs ${disks.length}`);
  assert.deepEqual(on.map((r) => r.name).sort(), disks.map((d) => d.disk).sort());

  // median, share, ratio: refused even with every feature on, each for a different missing feature.
  assert.match((runQuery(inv, q.median.query, ALL) as { error: string }).error, /Unsupported aggregate "median"/);
  assert.match((runQuery(inv, q.share.query, ALL) as { error: string }).error, /Unknown field "untagged"/);
  assert.match((runQuery(inv, q.ratio.query, ALL) as { error: string }).error, /Unsupported compute function "divide"/);
  assert.equal((runQuery(inv, q.ratio.query, NONE) as { needs?: string }).needs, 'compute');

  // ...and the code gives the right answer, checked against a direct computation from the estate.
  const median = code('median') as Record<string, number>;
  const vms = inv.resources.filter((r) => r.type === 'virtualMachine' && r.powerState === 'running');
  for (const [group, value] of Object.entries(median)) {
    const costs = vms.filter((v) => v.resourceGroup === group).map((v) => v.costMonthly).sort((a, b) => a - b);
    const m = costs.length >> 1;
    assert.equal(value, costs.length % 2 ? costs[m] : (costs[m - 1] + costs[m]) / 2, group);
  }
  assert.ok(Object.keys(median).length >= 3);

  const share = code('share') as Array<{ group: string; share: number }>;
  const rate = (rs: typeof inv.resources) => rs.filter((r) => Object.keys(r.tags).length === 0).length / rs.length;
  const overall = rate(inv.resources);
  for (const g of share) assert.ok(g.share > overall && g.share <= 1, g.group);
  const expectedGroups = inv.resourceGroups
    .map((g) => g.name)
    .filter((n) => Math.round(rate(inv.resources.filter((r) => r.resourceGroup === n)) * 100) / 100 > overall);
  assert.deepEqual(share.map((g) => g.group).sort(), expectedGroups.sort());

  const ratio = code('ratio') as Array<{ vm: string; perVcpu: number }>;
  assert.equal(ratio.length, 5);
  assert.deepEqual(ratio.map((r) => r.perVcpu), [...ratio.map((r) => r.perVcpu)].sort((a, b) => b - a));
  const best = Math.max(...inv.resources.filter((r) => r.type === 'virtualMachine').map((r) => Math.round((r.costMonthly / (r as { vcpus: number }).vcpus) * 100) / 100));
  assert.equal(ratio[0].perVcpu, best);
});

test('every plan that works says how, and every one that does not says what is missing', () => {
  const inv = buildInventory();
  for (const features of [NONE, new Set<FeatureId>(['update']), new Set<FeatureId>(FEATURE_IDS)]) {
    for (const p of coverage(features, inv)) {
      if (p.ok) assert.ok(p.how && p.how.endsWith('.'), `${p.task} how`);
      else assert.ok(p.reason && p.needs, `${p.task} says what is missing`);
    }
  }
});

test('ladder facts quote the replay, and every example query runs once the features it names are on', () => {
  const cmp = compareSurfaces('filter-aggregate', programs['filter-aggregate']);
  const ladder = buildLadder(buildInventory(), cmp.code);
  const facts = ladder.map(rungFacts);
  assert.match(facts[0][0], /^58 calls over 4 turns\.$/);
  assert.match(facts[0][1], /^15 tools to describe: \u2248 1,137 tokens/);
  assert.match(facts[1][1], /each of its results is \u2248 \d+ tokens/);
  const lookups = ladder[1].replay.calls.filter((c) => c.name === 'get_vm_properties');
  // A result's size is what the conversation carries, here as everywhere else.
  const mean = Math.round(lookups.reduce((n, c) => n + c.resultSentTokens, 0) / lookups.length);
  assert.ok(facts[1][1].includes(`each of its results is \u2248 ${mean} tokens`), 'the fact quotes the mean of the lookups the call list shows');
  assert.equal(fmtTokens(ladder[0].bill.total), '11.2k', 'the bill the row shows is the one the bar draws');
  assert.match(facts[4][0], /^1 call over 2 turns/);
  // The calculator's figures are counted in the calls the replay holds, not typed in.
  const calcCalls = ladder[5].replay.calls.filter((c) => c.name === 'calculate');
  const figures = calcCalls.reduce((n, c) => n + String(c.args.expression).split('+').length, 0);
  const written = calcCalls.reduce((n, c) => n + c.callTokens, 0);
  assert.equal(facts[5][0], `${ladder[5].replay.totals.calls} calls over ${ladder[5].replay.totals.turns} turns.`);
  assert.ok(facts[5][1].includes(`copies ${figures} figures into ${calcCalls.length} calls: \u2248 ${fmtTokens(written)} tokens`), facts[5][1]);
  assert.match(facts[6][1], /^The cheapest bill here/);
  assert.match(facts[7][1], /1,312 tokens of setup per turn/);

  const inv = buildInventory();
  const needs: Record<string, FeatureId[]> = { cost: [], groups: [], ip: ['join'], tag: ['update'], idle: ['compute'] };
  for (const e of EXAMPLE_QUERIES) {
    const without = runQuery(inv, e.query, NONE);
    assert.equal(without.ok, needs[e.id].length === 0, `${e.id} without features`);
    if (!without.ok) assert.equal(without.needs, needs[e.id][0], `${e.id}: the error names the feature`);
    assert.ok(runQuery(inv, e.query, new Set(needs[e.id])).ok, `${e.id} with ${needs[e.id]}`);
  }
});

// ── the object screen: the estate becomes one plain object, then a program reads it ──

const objInv = buildInventory();
const objProj = buildProjection(objInv);
const objStage = buildObjectStage(objInv, objProj, { vmName: 'web-prod-03' });
const objCode = programs['granular-read'].code;
const objTrace = traceAccess(objCode, objProj);
const objFacts: CopyFacts = {
  trace: objTrace,
  resources: objStage.counts.resources,
  subscriptions: objStage.counts.subscriptions,
  groups: objStage.counts.groups,
  vmName: 'web-prod-03'
};

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;
function assertPose(actual: Pose, expected: Pose, what: string): void {
  for (const k of ['cx', 'cy', 'w', 'h', 'r'] as const) assert.ok(near(actual[k], expected[k]), `${what}: ${k} is ${actual[k]}, expected ${expected[k]}`);
}
/** The positions of motion `t` from `from` to `to`, `step` apart. */
function sweepOf(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let t = from; t <= to + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}
const objRecord = (i: number): Record<string, unknown> => objProj.resources[i] as unknown as Record<string, unknown>;

test('object stage: one glyph per resource, in data.resources order, from its own pod to its own cell', () => {
  assert.equal(objStage.glyphs.length, objProj.resources.length);
  assert.deepEqual(objStage.counts, { subscriptions: 2, groups: 6, resources: 194 });
  const cells = new Set<string>();
  objStage.glyphs.forEach((g, i) => {
    const r = objProj.resources[i];
    assert.equal(g.index, i);
    assert.equal(g.id, r.id, `glyph ${i} is the resource at data.resources[${i}]`);
    assert.equal(g.type, r.type);
    assert.deepEqual(g.cell, cellPose(i));
    cells.add(`${g.cell.cx},${g.cell.cy}`);
    const card = objStage.groups.find((c) => c.name === g.groupName)!;
    assert.ok(g.estate.cx > card.x && g.estate.cx < card.x + card.w && g.estate.cy > card.y && g.estate.cy < card.y + card.h, `${g.name} starts inside ${g.groupName}`);
    assert.ok(g.cell.cx - g.cell.w / 2 >= RIGHT.x && g.cell.cx + g.cell.w / 2 <= RIGHT.x + RIGHT.w, `${g.name}: its cell is inside the object's card`);
  });
  assert.equal(cells.size, 194, 'no two resources share a cell');
  const lastCell = cellPose(193);
  assert.ok(lastCell.cy + lastCell.h / 2 < OBJ.recordsY - 24, 'the array ends above the records caption');
  assert.ok(objStage.groups.every((c) => c.x + c.w <= LEFT.x + LEFT.w && c.y + c.h <= LEFT.y + LEFT.h), 'the estate fits the left zone');
  assert.equal(objStage.groups.reduce((n, c) => n + c.count, 0), 194, 'the group cards carry every resource');
});

test("object stage: the question's pod gets the close-up, and its three records are the ones the program reads", () => {
  const vm = objProj.resources.find((r) => r.name === 'web-prod-03');
  assert.ok(vm && vm.type === 'virtualMachine');
  const nic = objProj.resources.find((r) => r.id === vm.nicId);
  assert.ok(nic && nic.type === 'networkInterface' && nic.publicIpId);
  const pipId = nic.publicIpId as string;
  const idx = (id: string): number => objProj.resources.findIndex((r) => r.id === id);
  assert.deepEqual(objStage.focus, { vm: idx(vm.id), nic: idx(nic.id), pip: idx(pipId) });
  assert.deepEqual(
    objStage.records.map((r) => [r.role, r.index]),
    [['vm', objStage.focus.vm], ['nic', objStage.focus.nic], ['pip', objStage.focus.pip]]
  );

  const zoomed = objStage.glyphs.filter((g) => g.zoom);
  assert.deepEqual(zoomed.map((g) => g.index).sort((a, b) => a - b), [...objStage.podIndexes].sort((a, b) => a - b));
  assert.deepEqual(zoomed.map((g) => g.role).sort(), ['dataDisk', 'nic', 'osDisk', 'pip', 'vm']);
  assert.equal(new Set(zoomed.map((g) => g.unitId)).size, 1, 'the close-up is of one pod');
  assert.deepEqual(objStage.glyphs.flatMap((g) => (g.focus ? [g.focus] : [])).sort(), ['nic', 'pip', 'vm']);

  // The picture and the run agree: the program touched exactly these three records, and its search stopped at the VM.
  assert.deepEqual(objTrace.usedIndexes, [objStage.focus.pip, objStage.focus.nic, objStage.focus.vm].sort((a, b) => a - b));
  assert.equal(objTrace.nameReadUpTo, objStage.focus.vm);
  assert.equal(objTrace.nameReads, objStage.focus.vm + 1);
  assert.equal(objTrace.idReads, 194);
  assert.equal(objTrace.scanned, 194);

  // The enlarged glyphs sit on the centre lines of the records they stand for, left of the object.
  for (const r of objStage.records) {
    const z = ZOOM[r.role];
    assert.equal(z.cy, r.y + r.h / 2, `${r.role}: the close-up lines up with its record`);
    assert.ok(z.cx + z.w / 2 < RIGHT.x && z.cx - z.w / 2 > LEFT.x);
  }
});

test('object stage: the record cards show the real values, and mark the fields the run read or followed', () => {
  for (const card of objStage.records) {
    const real = objRecord(card.index);
    assert.equal(card.name, real.name);
    assert.equal(card.id, real.id);
    for (const f of card.fields) {
      const verbatim = JSON.stringify(real[f.key]);
      const shortened = JSON.stringify(`\u2026/${String(real[f.key]).split('/').pop()}`);
      assert.ok(f.value === verbatim || f.value === shortened, `${card.name}.${f.key} shows ${f.value}`);
      if (f.kind === 'read') assert.equal(f.value, verbatim, `${card.name}.${f.key} is what the answer quotes, so it is not shortened`);
      if (f.kind === 'ref' || f.kind === 'id') assert.equal(f.value, shortened, `${card.name}.${f.key} is an id, shown short`);
    }
    const marked = card.fields.filter((f) => f.kind === 'read' || f.kind === 'ref').map((f) => f.key).sort();
    const read = objTrace.fieldsByIndex[card.index].filter((k) => k !== 'id' && k !== 'name').sort();
    assert.deepEqual(marked, read, `${card.name}: the fields marked on the card are the fields the run read`);
  }
  const quoted = (role: string): string[] => objStage.records.find((r) => r.role === role)!.fields.filter((f) => f.kind === 'read').map((f) => f.value);
  assert.deepEqual(quoted('vm'), [JSON.stringify(objTrace.result.powerState)]);
  assert.deepEqual(quoted('pip'), [JSON.stringify(objTrace.result.publicIp)]);
});

test('object stage: refuses a question it cannot show', () => {
  assert.throws(() => buildObjectStage(objInv, objProj, { vmName: 'no-such-vm' }), /No VM named/);
  assert.throws(() => buildObjectStage(objInv, objProj, { vmName: 'web-prod-03-nic' }), /No VM named/, 'a NIC is not a VM');
  assert.throws(() => buildObjectStage(objInv, objProj, { vmName: 'sql-host-01' }), /no public IP/);
});

test('choreography: every glyph is in its pod at the start and in its cell at the end, and the flights fit the flatten step', () => {
  let lastLanding = 0;
  for (const g of objStage.glyphs) {
    assertPose(poseAt(g, 0), g.estate, `${g.name} at the start`);
    assertPose(poseAt(g, LAST_STEP), g.cell, `${g.name} at the end`);
    const [a, b] = flightWindow(g);
    assert.ok(a >= AT.links && b <= AT.flatten, `${g.name}: flight ${a}..${b} sits inside the flatten step`);
    lastLanding = Math.max(lastLanding, b);
    if (g.zoom) {
      assertPose(poseAt(g, AT.links), g.zoom, `${g.name} is fully enlarged when the flatten step begins`);
      const after = poseAt(g, AT.links + 1e-6);
      assert.ok(Math.hypot(after.cx - g.zoom.cx, after.cy - g.zoom.cy) < 0.01, `${g.name}: the hand-over from close-up to flight does not jump`);
    } else {
      for (const t of [0, 0.5, 1, 1.5, AT.links]) assertPose(poseAt(g, t), g.estate, `${g.name} waits in its pod until the flatten step (t=${t})`);
    }
  }
  assert.ok(lastLanding < AT.flatten);
  assert.equal(landedCount(objStage.glyphs, AT.links), 0);
  assert.equal(landedCount(objStage.glyphs, AT.flatten), 194);
  let before = 0;
  for (const t of sweepOf(0, 10, 0.05)) {
    const n = landedCount(objStage.glyphs, t);
    assert.ok(n >= before, `the count of resources in data.resources only grows (t=${t})`);
    before = n;
  }
  for (const g of objStage.glyphs) assert.ok(landed(g, 0) === 0 && landed(g, 10) === 1);
  assert.equal(contractOpacity(lastLanding), 0, 'the description arrives after the last resource has landed');
});

test('choreography: the flights pour in through the gate, level with the array, and never cross the headings', () => {
  assert.ok(GATE.x < RIGHT.x && GATE.y > OBJ.resourcesLabelY && GATE.y < OBJ.recordsY, 'the gate is just outside the card, level with the array');
  for (const g of objStage.glyphs) {
    const [a, b] = flightWindow(g);
    let closest = Infinity;
    for (let k = 0; k <= 1500; k++) {
      const p = poseAt(g, a + ((b - a) * k) / 1500);
      closest = Math.min(closest, Math.hypot(p.cx - GATE.x, p.cy - GATE.y));
      if (p.cx - p.w / 2 >= RIGHT.x) {
        assert.ok(p.cy - p.h / 2 > OBJ.resourcesLabelY, `${g.name}: inside the object it stays below the subscriptions, groups and the array's label (top at ${(p.cy - p.h / 2).toFixed(1)})`);
      }
    }
    assert.ok(closest < 4, `${g.name} passes through the gate (closest ${closest.toFixed(1)})`);
  }
});

test("choreography: the estate's headings fly into the object and have landed before the glyphs set off", () => {
  const chips = objStage.chips;
  assert.deepEqual(chips.map((c) => c.kind), ['subscription', 'subscription', 'group', 'group', 'group', 'group', 'group', 'group']);
  const headingsBottom = OBJ.groupsChipY + 2 * OBJ.chipH + 6;
  for (const c of chips) {
    assert.deepEqual(chipRect(c, 0), c.fromRect);
    const end = chipRect(c, AT.containers);
    for (const k of ['x', 'y', 'w', 'h'] as const) assert.ok(near(end[k], c.toRect[k]), `${c.label}: lands on its slot (${k})`);
    assert.equal(chipProgress(c, AT.containers), 1);
    assert.ok(c.toRect.x >= RIGHT.x && c.toRect.x + c.toRect.w <= RIGHT.x + RIGHT.w, `${c.label}: its slot is inside the object's card`);
    assert.ok(c.toRect.y + c.toRect.h <= headingsBottom && headingsBottom < OBJ.resourcesLabelY - 12, `${c.label}: its slot is above the array`);
  }
  chips.forEach((a, i) =>
    chips.slice(i + 1).forEach((b) => {
      const apart = a.toRect.x + a.toRect.w <= b.toRect.x || b.toRect.x + b.toRect.w <= a.toRect.x || a.toRect.y + a.toRect.h <= b.toRect.y || b.toRect.y + b.toRect.h <= a.toRect.y;
      assert.ok(apart, `${a.label} and ${b.label} have their own slots`);
    })
  );
  // What changes on the way: a group's count becomes its location, a subscription gains its (short) id.
  for (const c of chips.filter((x) => x.kind === 'subscription')) {
    const sub = objProj.subscriptions.find((s) => s.name === c.label)!;
    assert.equal(c.to.side, shortSubId(sub.id));
  }
  for (const c of chips.filter((x) => x.kind === 'group')) {
    const group = objProj.resourceGroups.find((g) => g.name === c.label)!;
    assert.equal(c.to.side, group.location);
    assert.equal(c.from.side, String(objProj.resources.filter((r) => r.resourceGroup === c.label).length));
  }
  assert.equal(shortSubId('sub-7f3a9c20-prod'), 'sub-7f3a\u2026prod');
  assert.equal(shortSubId('plain'), 'plain');
});

test('choreography: the layers hand the left half from the estate to the description to the program', () => {
  for (const t of sweepOf(0, 10, 0.05)) {
    const layers = {
      estate: estateOpacity(t),
      closeUp: closeUpOpacity(t),
      records: recordsOpacity(t),
      fields: recordFieldsOpacity(t),
      contract: contractOpacity(t),
      program: programOpacity(t),
      result: resultOpacity(t),
      nicLink: linkDraw('nic', t),
      pipLink: linkDraw('pip', t)
    };
    for (const [name, v] of Object.entries(layers)) assert.ok(v >= 0 && v <= 1, `${name} at t=${t} is ${v}`);
    assert.ok(layers.nicLink >= layers.pipLink, 'the NIC bracket is drawn before the public-IP one');
  }
  assert.equal(estateOpacity(0), 1);
  assert.ok(estateOpacity(AT.contract) < 0.001, 'the estate has gone when the description arrives');
  assert.equal(closeUpOpacity(0), 0);
  assert.ok(closeUpOpacity(AT.links) > 0.99);
  assert.equal(closeUpOpacity(AT.flatten), 0, 'the close-up has gone when the flatten step is done');
  assert.equal(recordsOpacity(0), 0);
  assert.equal(recordsOpacity(AT.links), 1);
  assert.ok(contractOpacity(AT.contract) > 0.99 && contractOpacity(AT.program) === 0);
  assert.ok(programOpacity(AT.contract) === 0 && programOpacity(AT.program) === 1);
  assert.ok(resultOpacity(AT.ip) === 0 && resultOpacity(AT.return) === 1);
  const lines = objCode.split('\n').length;
  for (let i = 0; i < lines; i++) assert.ok(programLineOpacity(i, AT.program + 0.05) > 0.999, `line ${i + 1} is up before the first sweep starts`);
});

test('choreography: the sweeps count what the run really read, and a reached marker never falls', () => {
  assert.equal(indexSweep(objTrace.idReads, AT.contract), 0);
  assert.equal(indexSweep(objTrace.idReads, AT.index), objTrace.idReads);
  assert.equal(findSweep(objTrace.nameReadUpTo, AT.index), 0);
  assert.equal(findSweep(objTrace.nameReadUpTo, AT.find), objTrace.nameReads);
  let ids = 0;
  let names = 0;
  for (const t of sweepOf(4, 8, 0.02)) {
    const i = indexSweep(objTrace.idReads, t);
    const n = findSweep(objTrace.nameReadUpTo, t);
    assert.ok(i >= ids && n >= names, `the sweeps only grow (t=${t})`);
    ids = i;
    names = n;
  }
  for (const step of [AT.find, AT.nic, AT.ip, AT.return]) {
    assert.equal(reach(step, step - 1), 0, `step ${step} has not been reached before it starts`);
    assert.equal(reach(step, step), 1, `step ${step} has been reached when it ends`);
    let before = 0;
    for (const t of sweepOf(step - 1, 10, 0.05)) {
      const v = reach(step, t);
      assert.ok(v >= before, `reach(${step}) never falls (t=${t})`);
      before = v;
    }
  }
  assert.ok(ease(0) === 0 && ease(1) === 1 && near(ease(0.5), 0.5));
  assert.ok(seg(0.5, 0, 1) === 0.5 && seg(-1, 0, 1) === 0 && seg(2, 0, 1) === 1);
  const mid = mixPose({ cx: 0, cy: 0, w: 10, h: 10, r: 0 }, { cx: 10, cy: 20, w: 20, h: 30, r: 4 }, 0.5);
  assert.deepEqual(mid, { cx: 5, cy: 10, w: 15, h: 20, r: 2 });
});

test('steps and acts: eleven steps in three acts, and each act starts where its first step does', () => {
  assert.equal(STEP_IDS.length, 11);
  assert.equal(new Set(STEP_IDS).size, 11);
  assert.equal(LAST_STEP, 10);
  STEP_IDS.forEach((id, i) => assert.equal(AT[id], i));
  assert.deepEqual(
    STEP_IDS.map((_, i) => actOf(i)),
    ['reshape', 'reshape', 'reshape', 'reshape', 'describe', 'read', 'read', 'read', 'read', 'read', 'read']
  );
  assert.deepEqual(ACTS.map((a) => a.first), [0, 4, 5]);
  for (const a of ACTS) assert.equal(actOf(a.first), a.id);
});

test('trace: the reference program is run for real, and the screen quotes what it did', () => {
  const real = runTracked({ code: objCode, projection: objProj });
  assert.equal(real.status, 'ok');
  assert.equal(objTrace.resultText, real.resultText);
  assert.equal(objTrace.backTokens, backToModelTokens(real), 'the same audited figure the code screen shows');
  assert.equal(objTrace.scanned, real.totals.resourcesScanned);
  assert.equal(objTrace.propertyReads, real.totals.propertyReads);

  // The answer is the inventory's own, not a copy of it.
  const vm = objInv.resources.find((r) => r.name === 'web-prod-03');
  assert.ok(vm && vm.type === 'virtualMachine');
  const nic = objInv.resources.find((r) => r.id === vm.nicId);
  assert.ok(nic && nic.type === 'networkInterface');
  const pip = objInv.resources.find((r) => r.id === nic.publicIpId);
  assert.ok(pip && pip.type === 'publicIp');
  assert.deepEqual(objTrace.result, { powerState: vm.powerState, publicIp: pip.ipAddress });
  assert.ok(objTrace.backTokens > 0 && objTrace.backTokens < 100, 'what goes back is a couple of values, not the estate');

  assert.throws(() => traceAccess('function main(data) { throw new Error("nope"); }', objProj), /did not run/);
});

test('blocks: each access step lights the lines that do its work, found by what they say', () => {
  const lines = objCode.split('\n');
  assert.ok(lines.length <= PROGRAM_MAX_LINES, `the program has ${lines.length} lines and the panel holds ${PROGRAM_MAX_LINES}`);
  const b = programBlocks(objCode);
  assert.match(lines[b.index[1]], /new Map\(/);
  assert.match(lines[b.find[1]], /\.find\(/);
  assert.match(lines[b.find[1]], /web-prod-03/);
  assert.match(lines[b.nic[1]], /vm\.nicId/);
  assert.match(lines[b.ip[1]], /publicIpId/);
  assert.match(lines[b.ret[0]], /^\s*(\/\/|return)/);
  assert.match(lines[b.ret[1]], /^\s*\};?\s*$/);
  const ordered = [b.index, b.find, b.nic, b.ip, b.ret];
  ordered.forEach(([first, last], i) => {
    assert.ok(first <= last);
    if (i > 0) assert.ok(ordered[i - 1][1] < first, 'the blocks run in order and do not overlap');
  });
  assert.ok(b.index[0] < b.index[1] && lines[b.index[0]].trim().startsWith('//'), 'the comment above a step belongs to it');

  // The highlight follows the code; a line that has gone is an error, not a wrong highlight.
  const moved = programBlocks(`// header\n${objCode}`);
  assert.deepEqual(moved.find, [b.find[0] + 1, b.find[1] + 1]);
  assert.deepEqual(moved.ret, [b.ret[0] + 1, b.ret[1] + 1]);
  assert.throws(() => programBlocks(objCode.replace('new Map(', 'new Set(')), /exactly one "index by id" line .* found 0/);
  assert.throws(() => programBlocks(objCode.replace('const vm =', 'const other = data.resources.find((r) => r.id === 1);\n  const vm =')), /exactly one "find by name" line .* found 2/);
});

test('tokenizer: runs join back to the line, and strings, keywords, numbers and comments are told apart', () => {
  for (const line of objCode.split('\n')) assert.equal(tokenizeLine(line).map((t) => t.text).join(''), line, `line: ${line}`);
  assert.deepEqual(tokenizeLine("const n = 3; // x 'y' 4"), [
    { text: 'const', cls: 'keyword' },
    { text: ' n = ', cls: 'plain' },
    { text: '3', cls: 'number' },
    { text: '; ', cls: 'plain' },
    { text: "// x 'y' 4", cls: 'comment' }
  ]);
  assert.deepEqual(tokenizeLine("'a//b'"), [{ text: "'a//b'", cls: 'string' }], 'a // inside a string is not a comment');
  assert.deepEqual(tokenizeLine(''), []);
  assert.deepEqual(tokenizeLine("r.name === 'web-prod-03'").map((t) => t.cls), ['plain', 'string'], 'a number inside a string stays in the string');
});

test('contract: the excerpt is cut from the tool description the model really gets', () => {
  const ex = contractExcerpt(SCHEMA_DOC);
  assert.ok(CODE_TOOLS[0].function.description.includes(SCHEMA_DOC), 'the excerpt quotes the real description');
  assert.equal(ex.shape[0], 'type Projection = {');
  assert.equal(ex.shape[ex.shape.length - 1], '};');
  for (const key of ['generatedAt', 'subscriptions', 'resourceGroups', 'resources']) assert.ok(ex.shape.some((l) => l.includes(`${key}:`)), `the shape names ${key}`);
  assert.match(ex.references.join(' '), /References are by id: a VM's nicId identifies a networkInterface/);
  for (const l of [...ex.shape, ...ex.references]) assert.ok(SCHEMA_DOC.includes(l.trim()), `quoted verbatim: ${l}`);

  const shown = shapeForDisplay(ex.shape);
  assert.equal(shown.length, ex.shape.length);
  assert.deepEqual(shown.flatMap((l) => (l.note ? [l.note] : [])), ['ALL resources, flat.'], 'only the note that teaches something is kept');
  assert.ok(shown.every((l) => !l.code.includes('//')));

  assert.throws(() => contractExcerpt('// nothing to see here'), /no `type Projection` block/);
  assert.throws(() => contractExcerpt(SCHEMA_DOC.replace('// References are by id', '// Things are by id')), /does not explain references/);
});

test('copy: every step has narration, and its numbers come from the run', () => {
  for (const id of STEP_IDS) {
    const c = stepCopy(id, objFacts);
    assert.ok(c.label.length > 0 && c.text.length > 20, `${id} has a label and a sentence`);
    assert.ok(!/undefined|NaN|\[object/.test(c.text), `${id}: ${c.text}`);
  }
  const text = (id: StepId, over: Partial<CopyFacts> = {}): string => stepCopy(id, { ...objFacts, ...over }).text;
  assert.match(text('estate'), /all 194 resources/);
  assert.match(text('containers'), /2 subscriptions and 6 resource groups/);
  assert.match(text('links'), /web-prod-03 does not contain its NIC/);
  assert.match(text('index'), /194 records read/);
  assert.match(text('find'), /15 names/);
  assert.match(text('find'), /resources\[14\]/);
  assert.match(text('return'), /2 values, \u2248 40 tokens/);
  // Change the run and the words change with it.
  const other = { ...objTrace, idReads: 7, nameReads: 3, nameReadUpTo: 2, backTokens: 1234, result: { a: 1, b: 2, c: 3 } };
  assert.match(text('index', { trace: other }), /7 records read/);
  assert.match(text('find', { trace: other }), /3 names.*resources\[2\]/);
  assert.match(text('return', { trace: other }), /3 values, \u2248 1,234 tokens/);
});
