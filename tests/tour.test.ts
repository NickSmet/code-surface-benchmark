import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInventory } from '../src/lib/inventory/fixtures/builders';
import { buildProjection, diffProjection } from '../src/lib/inventory/projection';
import { computeGroundTruth } from '../src/lib/inventory/truth';
import { sameChanges } from '../src/lib/bench-checks';
import { runBench } from '../src/lib/agent/loop';
import { createCatalogSurface } from '../src/lib/surfaces/catalog';
import type { ChatTurnArgs, ProviderClient, ProviderToolCall } from '../src/lib/agent/providers/types';
import { buildEstateModel } from '../src/lib/tour/estate';
import { createCatalogSim } from '../src/lib/tour/catalog-sim';
import { callId } from '../src/lib/tour/replay';
import { replayCatalog } from '../src/lib/tour/scenarios';
import { needleFor } from '../src/lib/tour/needles';
import { countMarks, dominantKind, marksAt } from '../src/lib/tour/touch';
import { estimateTokens, fmtTokens } from '../src/lib/tour/tokens';
import { factsFromCodeResult, formatAnswer, type TaskId } from '../src/lib/tour/answers';
import { readFileSync } from 'node:fs';
import { runTracked } from '../src/lib/tour/code-run';
import { CONTRACT_PROBES, TASK_ORDER, parseSolutionPrograms } from '../src/lib/tour/programs';
import { codeTouches, replayCode } from '../src/lib/tour/code-compare';
import { PART_KEYS, billedAt, callSummary, costFacts, lastFrame, promptSplit, stepBadge, turnAt } from '../src/lib/tour/replay-view';
import { clipLines, isJson, prettyJson, tokenizeJson } from '../src/lib/tour/json-highlight';
import { compareSurfaces, comparisonHeadline, comparisonLesson, groupDiff, outcomeCaption, probeResult, seenBy, splitBill } from '../src/lib/tour/code-view';
import {
  FEATURES,
  FEATURE_IDS,
  FRESH_QUESTIONS,
  buildLadder,
  coverage,
  EXAMPLE_QUERIES,
  definitionTokens,
  keywords,
  rungFacts,
  queryContent,
  queryTool,
  runQuery,
  type FeatureId,
  type QueryOut
} from '../src/lib/tour/language';

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

test('replay view: each request splits into what it repeats and what is new', () => {
  const runs = [
    replayCatalog({ task: 'granular-read' }),
    replayCatalog({ task: 'filter-aggregate', route: 'survey' }),
    replayCatalog({ task: 'filter-aggregate', route: 'survey', batchSize: 1 }),
    replayCatalog({ task: 'bulk-write' }),
    replayCatalog({ task: 'single-lookup' })
  ];
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
  const slow = runs[2];
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

test('code view: the bill split adds back up, and each lesson quotes the numbers it was computed from', () => {
  for (const t of TASK_ORDER) {
    const c = compareSurfaces(t, programs[t]);
    for (const r of [c.catalog, c.code]) {
      const { setup, rest } = splitBill(r);
      assert.equal(setup + rest, r.totals.billedTokens);
      assert.equal(setup, r.totals.fixedTokens * r.totals.turns, 'setup is the fixed tokens, re-sent once per turn');
      assert.ok(rest > 0);
    }
  }
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

// ── screen 3: the ladder and the language ──────────────────────────────────
const ALL = new Set<FeatureId>(FEATURE_IDS);
const NONE = new Set<FeatureId>();
const rowsOf = (o: QueryOut): Array<Record<string, unknown>> => (o.ok && o.kind === 'rows' ? o.rows : []);

test('ladder: seven tool designs reach the same answer, and the three taxes show up where the article says', () => {
  const cmp = compareSurfaces('filter-aggregate', programs['filter-aggregate']);
  const ladder = buildLadder(buildInventory(), cmp.code);
  assert.equal(ladder.length, 7);
  assert.deepEqual(ladder.map((r) => r.n), [1, 2, 3, 4, 5, 6, 7]);
  for (const r of ladder) assert.equal(r.replay.finalText, cmp.code.finalText, `${r.id}: same final sentence`);

  // Round-trip tax: consolidating removes calls; the aspect parameter brings some back when a question spans two aspects.
  assert.deepEqual(ladder.map((r) => r.replay.totals.calls), [58, 22, 40, 22, 1, 2, 1]);
  assert.ok(ladder[2].replay.totals.calls > ladder[1].replay.totals.calls);

  // Schema tax: after the one-tool rung, every rung's definitions are longer than the last.
  const setup = ladder.map((r) => r.setupTokens);
  assert.ok(setup[0] > setup[1], 'fourteen tools cost more than one');
  for (let i = 2; i < 7; i++) assert.ok(setup[i] > setup[i - 1], `rung ${i + 1} defines more than rung ${i}`);

  // The honest part: the query language is the cheapest bill for the question it was built for.
  const billed = ladder.map((r) => r.replay.totals.billedTokens);
  assert.equal(Math.min(...billed), billed[5]);
  assert.ok(billed[5] < billed[6], 'the language beats code on its own question');
  for (const r of ladder) assert.equal(r.split.setup + r.split.rest, r.replay.totals.billedTokens);
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
  assert.match(facts[0][0], /^58 calls over 4 turns, \u2248 11\.2k tokens billed\.$/);
  assert.match(facts[0][1], /^15 tools to describe: \u2248 1,137 tokens/);
  assert.match(facts[1][1], /each of its results is \u2248 \d+ tokens/);
  const lookups = ladder[1].replay.calls.filter((c) => c.name === 'get_vm_properties');
  const mean = Math.round(lookups.reduce((n, c) => n + c.resultTokens, 0) / lookups.length);
  assert.ok(facts[1][1].includes(`each of its results is \u2248 ${mean} tokens`), 'the fact quotes the mean of the lookups the call list shows');
  assert.match(facts[4][0], /^1 call over 2 turns/);
  assert.match(facts[5][1], /^The cheapest bill here/);
  assert.match(facts[6][1], /1,312 tokens of setup per turn/);

  const inv = buildInventory();
  const needs: Record<string, FeatureId[]> = { cost: [], groups: [], ip: ['join'], tag: ['update'], idle: ['compute'] };
  for (const e of EXAMPLE_QUERIES) {
    const without = runQuery(inv, e.query, NONE);
    assert.equal(without.ok, needs[e.id].length === 0, `${e.id} without features`);
    if (!without.ok) assert.equal(without.needs, needs[e.id][0], `${e.id}: the error names the feature`);
    assert.ok(runQuery(inv, e.query, new Set(needs[e.id])).ok, `${e.id} with ${needs[e.id]}`);
  }
});
