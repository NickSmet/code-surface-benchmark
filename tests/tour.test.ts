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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { failedOutcome, runTracked } from '../src/lib/tour/code-run';
import { CONTRACT_PROBES, TASK_ORDER, parseSolutionPrograms } from '../src/lib/tour/programs';
import { codeTouches, replayCode } from '../src/lib/tour/code-compare';
import { PART_KEYS, billedAt, billedSplit, callSummary, costFacts, lastFrame, promptSplit, runBill, stepBadge, turnAt, turnFlow, turnResultTokens } from '../src/lib/tour/replay-view';
import { clipLines, isJson, prettyJson, tokenizeJson } from '../src/lib/tour/json-highlight';
import { answerFor, backToModelTokens, compareSurfaces, comparisonHeadline, comparisonLesson, groupDiff, outcomeCaption, probeResult, replayRun, seenBy, type Decision } from '../src/lib/tour/code-view';
import { applyChangeRows } from '../src/lib/inventory/apply';
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
  planTask,
  rungFacts,
  queryContent,
  queryTool,
  runQuery,
  type FeatureId,
  type QueryOut,
  type RungId
} from '../src/lib/tour/language';
import { ORIGIN, buildStrains, strainLink, withOrigin } from '../src/lib/tour/strains';
import { SCREENS, WORKSHOP_ONLY, WORKSHOP_SCREENS, crossTo, isWorkshopPath, screenIndexOf, screensOf } from '../src/lib/tour/screens';
import { FORMAT_COOKIE, formatOf, parseFormat } from '../src/lib/tour/format';
import {
  BLOCKS,
  HOW,
  OUTCOMES,
  PLAN_SCREENS,
  QUESTIONS_FROM,
  QUESTION_MINUTES,
  TOTAL_MINUTES,
  WELCOME_BEATS,
  WORKSHOP_IDS,
  WRAP_BEATS,
  blockOf,
  minutesOf,
  panelBeats,
  parseAt,
  rangeOf,
  type Block
} from '../src/lib/tour/workshop';
import { LENS_ORDER } from '../src/lib/tour/lenses';
import { EXERCISE_IDS, compact, exercisesOf, fieldsPerRow, groupsOf, parseTurn, sameAnswer, swap, turnBeats, turnHref, type Exercise } from '../src/lib/tour/turn';
import { ASKS, SEEDS, TAKEAWAY, recapOf } from '../src/lib/tour/wrap';
import { beatActionFor, globalActionFor, moveFor, typingIn, type BeatAction } from '../src/lib/tour/beat-keys';
import { modeOf, parseMode } from '../src/lib/tour/mode';
import { QUERY_KEYS, buildBeats, buildStages, describeQuery, pickFields, shortIds, showArgs, solvedRows } from '../src/lib/tour/strain-stage';
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
import {
  ARMS,
  CODE,
  GROUPS,
  METHODS,
  MODELS,
  MODEL_ORDER,
  NEXT_LABEL,
  OTHERS,
  REPORTED,
  RESULTS,
  RESULTS_BEATS,
  SOURCE,
  TASK_SETS,
  UNPLANNED_MODEL,
  armsOn,
  buildResults,
  cellIn,
  cellOf,
  cheapest,
  cheapestRun,
  chipHref,
  codeSpan,
  fmtPrice,
  fmtTimes,
  fmtUsd,
  hostedSpan,
  modelOf,
  multiples,
  nextCheapest,
  othersOn,
  othersSpan,
  parseResults,
  parseResultsBeat,
  perThousandRight,
  perThousandRuns,
  perfectOn,
  planeStateOf,
  priceDrop,
  priceLine,
  resultsHref,
  setCell,
  type ArmId,
  type Cell,
  type ModelKey,
  type ResultsBeatId,
  type TaskSet
} from '../src/lib/tour/results';
import {
  PLOT,
  RESTS,
  X_HI,
  X_LO,
  X_TICKS,
  Y_MAX,
  Y_MIN,
  Y_TICKS,
  fmtTick,
  labelClashes,
  labelsFor,
  ladderFrac,
  mixPose as mixMarker,
  namedArms,
  poseAt as markerAt,
  poseOf,
  presence,
  textWidth,
  trailOf,
  wilson,
  xOf,
  yOf,
  type Pose as Marker
} from '../src/lib/tour/plane';
import {
  ANSWER_WIDTH,
  EDITABLE,
  EXAMPLES,
  MAX_ANSWER_LINES,
  PHASE_U,
  REVIEW_ROWS,
  U_START,
  answerAt,
  answerCard,
  answerItems,
  bandsOf,
  billStrip,
  bodyBand,
  buildExample,
  chromeAt,
  defOf,
  displayLines,
  exampleBeats,
  exampleHref,
  freshOf,
  lineAlpha,
  lineHeightFor,
  parseExampleState,
  probeFor,
  retBand,
  reviewAt,
  reviewCard,
  settledAt,
  sweepAt,
  wrapWords,
  TOLD_LINES,
  cursorOf,
  execLinesOf,
  flagAt,
  toldCard,
  toldLines,
  type ExampleDef,
  type ExampleId
} from '../src/lib/tour/example-stage';
import {
  DECLINED_NOTE,
  DROPPED_FIELDS,
  GATES,
  GUARD_BEATS,
  GUARD_PANELS,
  PRODUCTION_RULE,
  PROGRAMS,
  RULES,
  applyApproved,
  beatIndex,
  beatOf,
  buildGuard,
  declinedContent,
  evaluateRule,
  evaluateRules,
  execLinesFor,
  flagsFor,
  gateOf,
  gateStates,
  guardHref,
  movedOn,
  programOf,
  refusedByRule,
  stoppedAt,
  type BeatId,
  type GateId,
  type ProgramId
} from '../src/lib/tour/guard';

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

// ── where the naive tools strain ───────────────────────────────────────────

test('strains: five scenarios, each the tools screen\'s own replay, and what each says is its shape', () => {
  const inv = buildInventory();
  const rows = buildStrains(inv, buildToolRungs(inv));
  assert.deepEqual(rows.map((r) => r.id), ['chain', 'arithmetic', 'fan-out', 'recital', 'fits']);
  for (const r of rows) {
    assert.ok(CATALOG_ROUTES[r.task].some((x) => x.id === r.route && x.label === r.title), `${r.id}: a route the tools screen has, under its name`);
    assert.deepEqual(r.bill, runBill(replayCatalog({ task: r.task, route: r.route })), `${r.id}: the bill is the tools screen's`);
    assert.equal(r.calls, r.replay.totals.calls);
    assert.equal(r.rounds, r.replay.turns.filter((t) => t.calls.length > 0).length);
    assert.equal(r.widest, Math.max(...r.replay.turns.map((t) => t.calls.length)));
  }
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  // A chain is calls one to a turn; a fan-out is many calls in one turn; one list and one lookup is neither.
  assert.deepEqual([by.chain.calls, by.chain.rounds, by.chain.widest], [3, 3, 1]);
  assert.deepEqual([by.arithmetic.calls, by.arithmetic.rounds, by.arithmetic.widest], [1, 1, 1]);
  assert.ok(by['fan-out'].widest > 1 && by['fan-out'].rounds === 2);
  assert.ok(by.recital.widest > 1 && by.recital.rounds === 2);
  assert.deepEqual([by.fits.calls, by.fits.rounds], [1, 1]);
  // The same question on two routes is the same question: one row is the best case, the other the cautious one.
  assert.equal(by.arithmetic.task, by['fan-out'].task);
  assert.ok(by['fan-out'].calls > by.arithmetic.calls);
  assert.equal(by.fits.fix, null, 'a narrow tool has nothing to fix');
  for (const id of ['chain', 'arithmetic', 'fan-out', 'recital'] as const) assert.ok(by[id].fix && by[id].fix.adds && by[id].fix.cta, `${id} has a fix`);
});

test('strains: every number in the copy is read off the replay, the estate or the plan it is about', () => {
  const inv = buildInventory();
  const rungs = buildToolRungs(inv);
  const by = Object.fromEntries(buildStrains(inv, rungs).map((r) => [r.id, r]));
  const prod = inv.subscriptions.find((s) => s.name === 'Production')!.id;
  const vms = inv.resources.filter((r): r is VirtualMachine => r.type === 'virtualMachine' && r.subscriptionId === prod);
  const running = vms.filter((v) => v.powerState === 'running');
  const rung = (id: RungId) => rungs.find((r) => r.id === id)!;

  assert.ok(by.chain.strain.text.startsWith(`${by.chain.calls} calls, one to a turn:`), by.chain.strain.text);
  assert.ok(by.arithmetic.strain.text.includes(`lists ${vms.length} VMs, ${running.length} of them running`), by.arithmetic.strain.text);
  assert.ok(
    by['fan-out'].strain.text.startsWith(`${by['fan-out'].calls} calls: a list, then a lookup for each of the ${running.length} running VMs.`),
    by['fan-out'].strain.text
  );
  assert.ok(by['fan-out'].strain.text.includes(`did the same job in ${by.arithmetic.calls} call,`), 'the contrast quotes the other route');
  const writes = by.recital.replay.calls.filter((c) => c.name !== 'list_resources');
  const listed = by.recital.replay.calls[0].resultSentTokens;
  const spelled = writes.reduce((n, c) => n + c.callTokens, 0);
  assert.ok(by.recital.strain.text.startsWith(`${by.recital.calls} calls: a ${fmtTokens(listed)}-token list, then ${writes.length} single-resource writes.`), by.recital.strain.text);
  assert.ok(by.recital.strain.text.includes(`\u2248 ${fmtTokens(spelled)} tokens of calls`), by.recital.strain.text);
  assert.equal(by.recital.calls, 1 + writes.length);
  assert.equal(by.fits.strain.text, `1 call, ${fmtTokens(by.fits.replay.calls[0].resultSentTokens)} tokens back. The tool does exactly what the question asks.`);

  // The fixes quote the plans and the rungs they point at.
  const joined = planTask('granular-read', new Set<FeatureId>(['join']), buildInventory());
  assert.ok(joined.ok && joined.calls === 1);
  assert.ok(by.chain.fix!.text.includes(`${joined.calls} call, not ${by.chain.calls}`), by.chain.fix!.text);
  // The calculator card quotes no bill. The row's bill is the tools screen's; the ladder prices a calculator against its own
  // plain list, a different tool design, so two totals for one question side by side would contradict each other.
  assert.ok(!/\d/.test(by.arithmetic.fix!.text), by.arithmetic.fix!.text);
  assert.ok(rung('calculator').bill.total > rung('filter').bill.total, 'the claim the card makes without a number: exact, not cheaper');
  assert.notEqual(by.arithmetic.bill.total, rung('filter').bill.total, 'the two designs really do bill differently, which is why the card leaves the figures to the ladder');
  // The ladder starts further back than the tools screen's cautious route, and the card says so.
  assert.ok(by['fan-out'].calls < rung('per-property').replay.totals.calls, 'the cautious route is not the ladder\u2019s first rung');
  assert.ok(
    by['fan-out'].fix!.text.endsWith(`starts further back, with one tool per property: ${rung('per-property').replay.totals.calls} calls for this question, and ${rung('filter').replay.totals.calls} call by rung ${rung('filter').n}.`),
    by['fan-out'].fix!.text
  );
  const edited = planTask('bulk-write', new Set<FeatureId>(['update']), buildInventory());
  assert.ok(edited.ok);
  assert.ok(by.recital.fix!.text.endsWith(`takes ${edited.calls} calls, not ${by.recital.calls}.`), by.recital.fix!.text);
});

test('the tools screen claims no rate: its lessons are structural, and the measured runs live on the Results screen', () => {
  // A lesson that says "off by 5-11% every time" on screen 2 contradicts screen 7, where the newer models get these sums right.
  for (const [task, routes] of Object.entries(CATALOG_ROUTES)) {
    for (const r of routes) assert.ok(!/%|benchmark|every time|always|never|swung/i.test(r.lesson), `${task}/${r.id}: ${r.lesson}`);
  }
  assert.equal(CATALOG_ROUTES['filter-aggregate'][0].lesson, 'One well-designed list call is enough. Then the model adds the figures in prose, and nothing checks the sum.');
});

test('strains: every fix links to a rung or a feature the language screen really has', () => {
  const inv = buildInventory();
  const rungIds = new Set<string>(buildToolRungs(inv).map((r) => r.id));
  for (const r of buildStrains(inv, buildToolRungs(inv))) {
    if (!r.fix) continue;
    const url = new URL(r.fix.href, 'http://tour.test');
    assert.equal(url.pathname, '/tour/language', `${r.id}: the language screen`);
    const rung = url.searchParams.get('rung');
    if (rung) assert.ok(rungIds.has(rung) || rung === 'code', `${r.id}: rung ${rung} exists`);
    const features = (url.searchParams.get('f') ?? '').split(',').filter(Boolean);
    for (const f of features) assert.ok(FEATURE_IDS.includes(f as FeatureId), `${r.id}: feature ${f} exists`);
    // A feature is switched on in the step that grows the language, so the link lands there.
    if (features.length) assert.equal(url.searchParams.get('stage'), 'grow', `${r.id}: the feature is shown where it is switched on`);
    assert.ok(!(rung && url.searchParams.get('stage')), `${r.id}: a link names a rung or a step, not both`);
  }
  assert.equal(strainLink(null), '/tour/language');
  assert.equal(strainLink('calculator'), '/tour/language?rung=calculator');
  assert.equal(strainLink('query', ['join', 'update'], true), '/tour/language?stage=grow&f=join,update');
});

test('strains: a link carries the beat it was followed from, and the language screen reads it back', () => {
  const href = withOrigin(strainLink('calculator'), 4);
  assert.equal(href, '/tour/language?rung=calculator&from=strains:4');
  assert.equal(withOrigin('/tour/language', 2), '/tour/language?from=strains:2');
  const from = new URL(href, 'http://tour.test').searchParams.get('from') ?? '';
  assert.deepEqual(ORIGIN.exec(from)?.slice(1), ['4']);
  assert.equal(ORIGIN.exec('strains:'), null);
  assert.equal(ORIGIN.exec('elsewhere:4'), null);
});

// ── the stage under each strain ────────────────────────────────────────────

test('strain stage: shortening an id keeps its last segment, and leaves everything else alone', () => {
  const id = '/subscriptions/sub-7f3a9c20-prod/resourceGroups/web-prod/providers/Microsoft.Network/networkInterfaces/web-prod-03-nic';
  assert.equal(shortIds(`"${id}"`), '"\u2026/web-prod-03-nic"');
  assert.equal(shortIds('web-prod-03'), 'web-prod-03');
  assert.equal(showArgs({ id }), '{ id: "\u2026/web-prod-03-nic" }');
  assert.equal(showArgs({}), '{ }');
  assert.equal(showArgs({ name: 'web-prod-03', tags: { env: 'staging' } }), '{ name: "web-prod-03", tags: {"env":"staging"} }');
  assert.equal(pickFields('{"a":1,"b":{"c":"x"},"d":[1]}', ['c', 'a', 'zzz']), 'c: "x"\na: 1', 'in the order asked, skipping what is not there');
});

test('strain stage: each strain draws the calls of its own replay, one card for each, and what the fix draws is its plan', () => {
  const inv = buildInventory();
  const rungs = buildToolRungs(inv);
  const strains = buildStrains(inv, rungs);
  const stages = buildStages(strains, inv, rungs);
  assert.deepEqual(stages.map((s) => s.id), strains.map((s) => s.id));
  const by = Object.fromEntries(stages.map((s) => [s.id, s]));
  const row = Object.fromEntries(strains.map((s) => [s.id, s]));
  const rung = (id: RungId) => rungs.find((r) => r.id === id)!;

  // A pane's headline count is the run's own count, and its words are the row's.
  for (const s of stages) {
    const r = row[s.id];
    assert.equal(s.problem.calls, r.calls);
    assert.equal(s.problem.text, r.strain.text);
    assert.equal(s.problem.label, r.strain.label);
    assert.equal(s.fix === null, r.fix === null);
    if (s.fix && r.fix) {
      assert.equal(s.fix.text, r.fix.text);
      assert.equal(s.fix.href, r.fix.href);
      assert.equal(s.fix.adds, r.fix.adds);
    }
    for (const pane of [s.problem, s.fix]) {
      if (!pane) continue;
      const keys = pane.cards.map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length, `${s.id}: card keys are unique within a pane`);
      for (const c of pane.cards) assert.ok(c.title && (c.kind === 'more' || c.args), `${s.id}: ${c.key} says what the call was`);
    }
  }

  // A chain: one card for each call, in order and in its own turn; the ids the model copied are marked on both ends.
  const chain = row.chain.replay.calls;
  assert.deepEqual(by.chain.problem.cards.map((c) => c.title), chain.map((c) => c.name));
  assert.deepEqual(by.chain.problem.cards.map((c) => c.turn), chain.map((c) => c.turn));
  assert.deepEqual(by.chain.problem.cards.map((c) => c.wrote), chain.map((c) => c.callTokens));
  assert.deepEqual(by.chain.problem.cards.map((c) => c.sent), chain.map((c) => row.chain.replay.turns[c.turn - 1].promptTokens));
  assert.ok(by.chain.problem.cards[1].sent! > by.chain.problem.cards[0].sent!, 'each turn sends the whole conversation again');
  assert.equal(by.chain.problem.linked, true);
  for (const i of [1, 2]) {
    const mark = by.chain.problem.cards[i].marks[0];
    assert.ok(mark, `card ${i} has a copied id`);
    assert.ok((chain[i].args.id as string).endsWith(mark.slice(1)), 'the mark is the end of the id the call really asked for');
    assert.ok(by.chain.problem.cards[i].args.includes(mark), 'drawn on the call that copies it');
    assert.ok(by.chain.problem.cards[i - 1].result.includes(mark), 'and on the result it was copied from');
    assert.ok(by.chain.problem.cards[i - 1].marks.includes(mark));
  }
  const vm = JSON.parse(chain[0].content) as { powerState: string };
  assert.ok(by.chain.problem.cards[0].result.includes(`powerState: "${vm.powerState}"`), 'the answer\u2019s own field is picked out');
  const ip = (JSON.parse(chain[2].content) as { ipAddress: string }).ipAddress;
  assert.equal(by.chain.problem.cards[2].result, `ipAddress: "${ip}"`);
  // The fix is the plan's one query, run on the estate, and it finds the same address.
  const joined = planTask('granular-read', new Set<FeatureId>(['join']), buildInventory());
  assert.equal(by.chain.fix!.calls, joined.calls);
  assert.equal(by.chain.fix!.cards.length, joined.calls);
  assert.equal(by.chain.fix!.cards[0].args, describeQuery(joined.queries[0] as Record<string, unknown>));
  assert.ok(by.chain.fix!.cards[0].result.includes(`"${ip}"`) && by.chain.fix!.cards[0].result.includes(vm.powerState));
  assert.equal(by.chain.fix!.cards[0].wrote, estimateTokens(`query_resources${JSON.stringify(joined.queries[0])}`), 'a planned call is counted the way a replayed one is');
  // What a turn sends is shown on the chain only: the other strains\u2019 runs use other prompts, so the figures would not compare.
  for (const s of stages.filter((x) => x.id !== 'chain')) {
    for (const c of [...s.problem.cards, ...(s.fix?.cards ?? [])]) assert.equal(c.sent, null, `${s.id}: ${c.key}`);
  }

  // Arithmetic: the list, then a card for the model adding the figures itself; the fix is the calculator rung's own calls.
  const list = row.arithmetic.replay.calls[0];
  const vms = (JSON.parse(list.content) as { count: number }).count;
  assert.deepEqual(by.arithmetic.problem.cards.map((c) => c.kind), ['call', 'sum']);
  assert.ok(by.arithmetic.problem.cards[0].result.startsWith(`count: ${vms}\n`));
  const calc = rung('calculator').replay.calls.filter((c) => c.name === 'calculate');
  const first = String(calc[0].args.expression).split(' + ')[0];
  assert.ok(by.arithmetic.problem.cards[0].result.includes(first), 'the first figure is on the list\u2026');
  assert.ok(by.arithmetic.problem.cards[1].args.startsWith(first), '\u2026and is the first one the model adds');
  assert.deepEqual([by.arithmetic.problem.cards[0].marks, by.arithmetic.problem.cards[1].marks], [[first], [first]]);
  const grand = /Grand total \$([\d,]+\.\d\d)/.exec(row.arithmetic.replay.finalText)![1];
  assert.ok(by.arithmetic.problem.cards[1].result.includes(`Grand total $${grand}`), 'the sum the model wrote is the answer the replay ends on');
  assert.equal(by.arithmetic.fix!.calls, rung('calculator').replay.totals.calls);
  assert.deepEqual(by.arithmetic.fix!.cards.map((c) => c.kind), ['same', 'call', 'call', 'more']);
  assert.equal(by.arithmetic.fix!.cards[0].key, by.arithmetic.problem.cards[0].key, 'the list is one card, drawn once on each side, and the fix says it is the same call');
  assert.equal(by.arithmetic.fix!.cards[0].title, list.name);
  assert.deepEqual(by.arithmetic.fix!.cards.slice(1, 3).map((c) => c.result), calc.slice(0, 2).map((c) => c.content), 'what the calculator returned');
  assert.ok(by.arithmetic.fix!.cards[1].marks.includes(first), 'the first figure is on the first sum, too');
  assert.equal(by.arithmetic.fix!.cards[3].title, `+ ${calc.length - 2} more`);
  const figures = calc.reduce((n, c) => n + String(c.args.expression).split('+').length, 0);
  assert.ok(by.arithmetic.fix!.legend!.startsWith(`${figures} figures copied`), by.arithmetic.fix!.legend!);
  const running = (JSON.parse(list.content) as { resources: Array<{ powerState: string }> }).resources.filter((v) => v.powerState === 'running').length;
  assert.equal(figures, 2 * running, 'every running VM\u2019s cost is written twice: once in its group\u2019s sum, once in the total');

  // Fan-out: the list, two of the lookups, and a tile for the rest; the fix is the one list, beside the ladder's counts.
  const lookups = row['fan-out'].replay.calls.filter((c) => c.name === 'get_resource');
  assert.deepEqual(by['fan-out'].problem.cards.map((c) => c.kind), ['call', 'call', 'call', 'more']);
  assert.equal(by['fan-out'].problem.cards[3].title, `+ ${lookups.length - 2} more`);
  assert.equal(by['fan-out'].problem.cards[1].args, showArgs(lookups[0].args));
  assert.equal(by['fan-out'].fix!.calls, row.arithmetic.calls, 'the fix is the broad list, which is one call');
  assert.equal(by['fan-out'].fix!.cards.length, 1);
  assert.equal(by['fan-out'].fix!.cards[0].key, by['fan-out'].problem.cards[0].key, 'the list card is the same card on both sides');
  assert.deepEqual(by['fan-out'].fix!.ladder!.map((r) => [r.id, r.calls]), (['per-property', 'one-tool', 'aspect', 'aspects', 'filter'] as const).map((id) => [id, rung(id).replay.totals.calls]));
  assert.equal(by['fan-out'].fix!.ladder!.at(-1)!.calls, by['fan-out'].fix!.calls, 'the last rung is the one call');

  // Recital: the list, the first write of each kind, and a tile for the rest; the fix is the plan's two updates.
  const writes = row.recital.replay.calls.filter((c) => c.name !== 'list_resources');
  const kinds = [...new Set(writes.map((c) => c.name))];
  assert.deepEqual(by.recital.problem.cards.slice(1, 1 + kinds.length).map((c) => c.title), kinds);
  assert.equal(by.recital.problem.cards.at(-1)!.title, `+ ${writes.length - kinds.length} more`);
  const edited = planTask('bulk-write', new Set<FeatureId>(['update']), buildInventory());
  assert.equal(by.recital.fix!.calls, edited.calls);
  assert.deepEqual(by.recital.fix!.cards.map((c) => c.args), (edited.queries as Array<Record<string, unknown>>).map((q) => describeQuery(q)));
  const matched = by.recital.fix!.cards.map((c) => Number(/matched: (\d+)/.exec(c.result)![1]));
  const tagged = edited.changes!.filter((c) => c.field === 'tags.env').length;
  const stopped = edited.changes!.filter((c) => c.field === 'powerState').length;
  assert.deepEqual(matched, [tagged, stopped], 'each update touches what the replay\u2019s writes touched');
  assert.equal(tagged + stopped, writes.length, 'one write for each resource the update changes');

  // Nothing strains: one card, no fix.
  assert.equal(by.fits.fix, null);
  assert.equal(by.fits.problem.cards.length, 1);
  assert.equal(by.fits.problem.cards[0].result, 'names: web-prod, data-prod, platform-prod');
});

test('strain stage: a query is shown in lines that leave out nothing it says', () => {
  const inv = buildInventory();
  const queries = [
    ...(planTask('granular-read', new Set<FeatureId>(['join']), structuredClone(inv)).queries as Array<Record<string, unknown>>),
    ...(planTask('bulk-write', new Set<FeatureId>(['update']), structuredClone(inv)).queries as Array<Record<string, unknown>>),
    ...(planTask('filter-aggregate', new Set<FeatureId>(), structuredClone(inv)).queries as Array<Record<string, unknown>>)
  ];
  for (const q of queries) {
    assert.ok(Object.keys(q).every((k) => (QUERY_KEYS as readonly string[]).includes(k)), `describeQuery knows every key of ${JSON.stringify(q).slice(0, 60)}`);
    assert.equal(describeQuery(q).split('\n').length, Object.keys(q).length, 'one line for each key');
  }
  assert.equal(
    describeQuery({ from: 'resources', where: [{ field: 'name', op: '=', value: 'web-prod-03' }, { field: 'tagCount', op: '=', value: 0 }], join: [{ via: 'nicId', as: 'nic' }], select: ['powerState'] }),
    'from resources\nwhere name = "web-prod-03" and tagCount = 0\njoin nicId as nic\nselect powerState'
  );
  assert.equal(
    describeQuery({ from: 'resources', update: { set: { 'tags.env': 'staging', powerState: 'deallocated' } } }),
    'from resources\nupdate set tags.env = "staging", powerState = "deallocated"'
  );
});

test('strain stage: the beats are the overview, then a problem and a fix for each row, and a solved row stays solved', () => {
  const inv = buildInventory();
  const strains = buildStrains(inv, buildToolRungs(inv));
  const beats = buildBeats(strains);
  assert.equal(beats.length, 1 + strains.length * 2);
  assert.deepEqual(beats[0], { row: null, phase: 'overview', caption: beats[0].caption });
  assert.deepEqual(beats.slice(1).map((b) => [b.row, b.phase]), strains.flatMap((_, i) => [[i, 'problem'], [i, 'fix']]));
  assert.equal(new Set(beats.map((b) => b.caption)).size, beats.length, 'every beat says where it is');
  assert.ok(beats.at(-1)!.caption.endsWith('keep it'), 'the narrow row ends the tour of the strains');
  // The row that is put right, beat by beat: none, none, one, one, two, \u2026, all five.
  assert.deepEqual(beats.map((_, at) => solvedRows(beats, at).size), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  assert.deepEqual([...solvedRows(beats, 4)], [0, 1]);
  for (let at = 1; at < beats.length; at++) {
    for (const r of solvedRows(beats, at - 1)) assert.ok(solvedRows(beats, at).has(r), `row ${r} is still solved at beat ${at}`);
  }
  assert.equal(solvedRows(beats, -3).size, 0, 'a beat before the first is the overview');
  assert.equal(solvedRows(beats, 99).size, strains.length, 'a beat past the last is the last');
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

test('one tool, one size: the language screen and the object screen both quote the code tool\u2019s whole definition', () => {
  // The language screen reads it off the ladder's own code replay; the object screen counts it from the schema.
  // They have to be the same number, or the talk says the code tool is 1,041 tokens on one screen and 926 on the next.
  const fromLadder = compareSurfaces('filter-aggregate', programs['filter-aggregate']).code.turns[0].parts.tools;
  const fromSchema = estimateTokens(JSON.stringify(CODE_TOOLS));
  assert.equal(fromLadder, fromSchema);
  assert.ok(estimateTokens(CODE_TOOLS[0].function.description) < fromSchema, 'the description alone is smaller: that is the number the object screen no longer shows');
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

// ── the code screen: the object screen's stage, with programs running on it ──

const exInv = buildInventory();
const exProj = buildProjection(exInv);
const exSource = (def: ExampleDef): { code: string; rationale?: string } =>
  def.kind === 'task' && def.task ? programs[def.task] : { code: freshOf(def)!.code };
const exBuild = (id: ExampleId) => {
  const def = defOf(id);
  const src = exSource(def);
  const outcome = runTracked({ code: src.code, projection: exProj, rationale: src.rationale });
  const strip = def.kind === 'task' && def.task ? billStrip(def.task, programs[def.task]) : undefined;
  return { def, src, outcome, view: buildExample({ def, program: src, outcome, inv: exInv, strip }) };
};
const runsOnItsOwn = EXAMPLES;

test('examples: sixteen beats in five examples, and each beat is a URL the screen reads back', () => {
  const beats = exampleBeats();
  assert.equal(beats.length, 16);
  assert.deepEqual(EXAMPLES.map((e) => [e.id, e.phases.length]), [['cost', 3], ['tag', 4], ['disks', 3], ['ratio', 3], ['lookup', 3]]);
  assert.equal(new Set(beats.map((b) => b.href)).size, 16, 'every beat has a URL of its own');
  assert.equal(beats[0].href, '/tour/code', 'the screen opens on the first example, with no parameters');
  assert.equal(exampleHref('tag', 2), '/tour/code?ex=tag&step=2');
  for (const b of beats) {
    const url = new URL(b.href, 'http://tour.test');
    assert.deepEqual(parseExampleState(url.searchParams), { id: b.id, step: b.step }, b.href);
    assert.equal(b.phase, defOf(b.id).phases[b.step]);
  }
  // Only the writing example has a review, and it comes last.
  assert.deepEqual(beats.filter((b) => b.phase === 'review').map((b) => b.id), ['tag']);
  assert.deepEqual(beats.filter((b) => b.id === 'tag').map((b) => b.phase), ['write', 'run', 'answer', 'review']);
  // A program of the room's own is not one of this screen's examples: the screens that let a program be edited draw the same stage with it.
  assert.ok(!EXAMPLES.some((e) => e.id === EDITABLE.id));
  assert.equal(defOf(EDITABLE.id), EDITABLE);
  assert.deepEqual(EDITABLE.phases, ['see', 'change', 'do']);
});

test('examples: whatever the URL says, the screen lands on a beat that exists', () => {
  const at = (qs: string) => parseExampleState(new URLSearchParams(qs));
  assert.deepEqual(at(''), { id: 'cost', step: 0 });
  assert.deepEqual(at('ex=nope&step=1'), { id: 'cost', step: 1 }, 'an unknown example is the first');
  assert.deepEqual(at('ex=tag&step=9'), { id: 'tag', step: 3 }, 'a step past the end is the last');
  assert.deepEqual(at('ex=tag&step=-1'), { id: 'tag', step: 0 });
  assert.deepEqual(at('ex=disks&step=abc'), { id: 'disks', step: 0 });
  assert.deepEqual(at('step=1.5'), { id: 'cost', step: 0 });
  assert.deepEqual(at('ex=break&step=2'), { id: 'cost', step: 2 }, 'the program of one\u2019s own moved to the guard screen: an old link lands on the first example');
});

test('examples: every program fits its panel, at a size that can be read from the back of a room', () => {
  for (const def of runsOnItsOwn) {
    const src = exSource(def);
    const lines = displayLines(src.code);
    assert.ok(Math.max(...lines.map((l) => l.length)) <= 84, `${def.id}: the longest line is ${Math.max(...lines.map((l) => l.length))} characters`);
    assert.ok(lineHeightFor(lines.length, Boolean(src.rationale)) >= 20, `${def.id}: ${lines.length} lines`);
    assert.ok(lines.every((l) => l.trim() !== ''), 'blank lines are dropped');
    assert.match(lines[0], /^function main\(/);
    assert.equal(lines[lines.length - 1], '}');
  }
  // Long programs shrink to fit; short ones stop growing at the object screen's size.
  assert.equal(lineHeightFor(3), 21.5);
  assert.ok(lineHeightFor(40) < lineHeightFor(30));
  assert.ok(lineHeightFor(27, true) < lineHeightFor(27, false), 'a rationale takes a line of its own');
});

test('examples: the body of a program, and the line that returns its answer, are found by what they say', () => {
  assert.deepEqual(bandsOf(['function main(data) {', '  const a = 1;', '  return a;', '}']), { body: [1, 2], ret: [2, 2] });
  assert.deepEqual(bandsOf(['function main(data) {', '  const xs = data.resources;', '  return xs', '    .map((r) => r.name);', '}']), { body: [1, 3], ret: [2, 3] }, 'a return that runs over lines is one band');
  assert.deepEqual(bandsOf(['function main(data) {', '}']), { body: [1, 1], ret: null });
  assert.deepEqual(bandsOf(['function main(data) {', '  const f = () => {', '    return 1;', '  };', '  return f();', '}']).ret, [4, 4], 'a nested return is not the answer');
  for (const def of runsOnItsOwn) {
    const lines = displayLines(exSource(def).code);
    const { body, ret } = bandsOf(lines);
    assert.ok(ret, `${def.id} returns something`);
    assert.match(lines[ret![0]], /^ {2}return\b/);
    assert.ok(body[0] === 1 && body[1] === lines.length - 2, def.id);
  }
});

test('examples: the counters are what the run did, and the cost example says what it really scanned and used', () => {
  const cost = exBuild('cost');
  assert.equal(cost.view.status, 'ok');
  assert.deepEqual(
    [cost.view.counters.scanned, cost.view.counters.scannedUnit, cost.view.counters.reads, cost.view.counters.used, cost.view.counters.usedLabel],
    [194, 'records', cost.outcome.totals.propertyReads, 18, 'records it used']
  );
  assert.equal(cost.view.counters.reads, 394);
  assert.equal(cost.view.marks.used.size, needleFor('filter-aggregate', exInv).resourceIds.size, 'the records it used are the benchmark\'s needle');
  assert.equal(cost.view.counters.tokens, backToModelTokens(cost.outcome));
  assert.equal(Object.keys(cost.view.marks.depth).length, 194, 'every record has a depth: how many fields were read');

  const tag = exBuild('tag');
  assert.deepEqual([tag.view.counters.usedLabel, tag.view.counters.used, tag.view.counters.usedSub], ['proposed changes', 70, 'fields on 37 resources']);
  assert.equal(tag.view.marks.written.size, 37);
  assert.equal(tag.view.marks.refused.size, 0);
  assert.equal(tag.view.counters.reads, 609);

  const disks = exBuild('disks');
  assert.equal(answerItems(disks.outcome), 16, 'sixteen disks belong to a stopped or deallocated VM');
  assert.equal(disks.view.marks.used.size, 32, 'the sixteen disks and their sixteen VMs');
  const stopped = new Set(['stopped', 'deallocated']);
  const vms = new Map(exInv.resources.map((r) => [r.id, r]));
  const expected = exInv.resources.filter((r) => r.type === 'disk' && r.attachedToVmId && stopped.has((vms.get(r.attachedToVmId) as VirtualMachine | undefined)?.powerState ?? ''));
  assert.equal(expected.length, 16, 'the estate agrees with the program');

  const ratio = exBuild('ratio');
  assert.equal(answerItems(ratio.outcome), 5);
  const rows = JSON.parse(ratio.outcome.resultText!) as Array<{ vm: string; perVcpu: number }>;
  assert.deepEqual(rows, [...rows].sort((a, b) => b.perVcpu - a.perVcpu), 'most expensive first');
  const vmsOnly = exInv.resources.filter((r): r is VirtualMachine => r.type === 'virtualMachine');
  const top = [...vmsOnly].sort((a, b) => b.costMonthly / b.vcpus - a.costMonthly / a.vcpus)[0];
  assert.equal(rows[0].vm, top.name);
  assert.equal(rows[0].perVcpu, Math.round((top.costMonthly / top.vcpus) * 100) / 100, 'rounded to the cent by the program, not the model');

  const lookup = exBuild('lookup');
  assert.deepEqual(
    [lookup.view.counters.scannedUnit, lookup.view.counters.scanned, lookup.view.counters.usedLabel, lookup.view.counters.used],
    ['groups', 6, 'groups it used', 3]
  );
  assert.equal(lookup.outcome.totals.resourcesScanned, 0, 'no resource record is read');
});

test('examples: the answer is cut to its card, and says how much was cut', () => {
  const disks = answerCard(exBuild('disks').outcome);
  assert.equal(disks.tone, 'ok');
  assert.equal(disks.label, 'back to the model');
  assert.equal(disks.lines.length, MAX_ANSWER_LINES - 1, 'one line is kept back for "n more"');
  assert.equal(disks.more, 10, 'sixteen entries, six shown');
  for (const e of runsOnItsOwn) {
    const a = exBuild(e.id).view.answer;
    assert.ok(a.lines.length <= MAX_ANSWER_LINES, e.id);
    assert.ok(a.lines.every((l) => l.length <= ANSWER_WIDTH), `${e.id}: no line is wider than the card`);
    assert.ok(a.tokens > 0 && a.tokens < 300, `${e.id}: ${a.tokens} tokens`);
  }
  assert.deepEqual(wrapWords('error: Invalid tag monthly: keys must be supported and values must be strings', 40), ['error: Invalid tag monthly: keys must be', '  supported and values must be strings']);
  assert.deepEqual(wrapWords('short', 40), ['short']);
  // A write is told the counts it needs for its summary and nothing more.
  const tag = exBuild('tag').view.answer;
  assert.ok(tag.lines.some((l) => /^changeCount: 70$/.test(l)));
  assert.ok(tag.lines.some((l) => /^resourcesAffected: 37$/.test(l)));
});

test('examples: the change set for review says what it is made of, and how much is not listed', () => {
  const r = reviewCard(exBuild('tag').outcome)!;
  assert.equal(r.resources, 37);
  assert.equal(r.fields, 70);
  assert.equal(r.summary, 'tags on 33 resources  \u00b7  power state on 4');
  assert.equal(r.rows.length, REVIEW_ROWS);
  assert.equal(r.hidden, 37 - REVIEW_ROWS);
  assert.ok(r.rows.some((x) => /^powerState .* \u2192 /.test(x.changes)), 'a power change is among the rows shown, so the list shows both kinds');
  assert.ok(r.rows.some((x) => x.changes.startsWith('+ ')), 'and so is a tag');
  assert.equal(r.rows[0].changes.startsWith('+ '), true);
  // Nothing to review when nothing changed, or when the run was refused.
  assert.equal(reviewCard(exBuild('cost').outcome), null);
  assert.equal(reviewCard(run(CONTRACT_PROBES.find((p) => p.id === 'cost')!.code)), null);
  for (const e of runsOnItsOwn.filter((x) => x.id !== 'tag')) assert.equal(exBuild(e.id).view.review, null, e.id);
});

test('examples: what each example is up against says the truth about who wins, including where the catalogue does', () => {
  const cost = exBuild('cost').view.strip;
  assert.equal(cost?.kind, 'bill');
  if (cost?.kind === 'bill') {
    assert.equal(cost.winner, 'tie');
    assert.equal(cost.headline, 'About the same bill on both surfaces.');
    assert.deepEqual(cost.bars.map((b) => b.id), ['catalog', 'code']);
    assert.equal(cost.scale, Math.max(cost.bars[0].bill.total, cost.bars[1].bill.total));
  }
  const tag = exBuild('tag').view.strip;
  assert.equal(tag?.kind === 'bill' && tag.winner, 'code');
  assert.match(tag?.kind === 'bill' ? tag.headline : '', /^At its best, the catalogue is billed 8\.0\u00d7 the tokens of the code surface\.$/);
  assert.equal(tag?.kind === 'bill' && tag.bars[0].calls, 38, 'one call to read, thirty-seven to write');
  const lookup = exBuild('lookup').view.strip;
  assert.equal(lookup?.kind === 'bill' && lookup.winner, 'catalog', 'the counter-case is kept');
  assert.match(lookup?.kind === 'bill' ? lookup.headline : '', /^Here the catalogue wins/);
  // The two questions the language could not ask are shown refused by the language, then answered by code.
  const disks = exBuild('disks').view.strip;
  assert.deepEqual(disks, { kind: 'language', refused: 'Unknown parameter "join". This tool does not support it.', needs: 'Follow references' });
  const ratio = exBuild('ratio').view.strip;
  assert.deepEqual(ratio, { kind: 'language', refused: 'Unknown parameter "compute". This tool does not support it.', needs: 'Arithmetic in computed values' });
  assert.equal(freshOf(defOf('disks'))?.id, 'disks');
  assert.equal(freshOf(defOf('cost')), null);
});

test('examples: the narration quotes the run it narrates, and no sentence is left half-made', () => {
  for (const e of runsOnItsOwn) {
    const { def, view } = exBuild(e.id);
    assert.deepEqual(Object.keys(view.copy), [...def.phases], `${e.id}: one sentence for each beat`);
    for (const [phase, text] of Object.entries(view.copy)) {
      assert.ok(text && text.length > 40, `${e.id} ${phase}`);
      assert.ok(!/undefined|NaN|null|\[object|\{\}/.test(text), `${e.id} ${phase}: ${text}`);
    }
  }
  const cost = exBuild('cost').view.copy;
  assert.match(cost.run ?? '', /194 records are scanned and not one is sent to the model; the 18 that pass every filter/);
  assert.match(cost.run ?? '', /394 field reads, no tokens/);
  assert.match(cost.answer ?? '', /\u2248 63 tokens/);
  const tag = exBuild('tag').view.copy;
  assert.match(tag.run ?? '', /70 field changes on 37 resources/);
  assert.match(tag.review ?? '', /37 resources, 70 fields/);
  assert.match(exBuild('disks').view.copy.answer ?? '', /^16 disks come back, \u2248 248 tokens/);
  assert.match(exBuild('ratio').view.copy.answer ?? '', /^5 rows come back/);
  assert.match(exBuild('lookup').view.copy.run ?? '', /6 resource groups and no resource record\. 3 of the groups are Production's/);
  assert.match(exBuild('lookup').view.copy.answer ?? '', /A narrow tool would have done this too, and for less\./);
});

test('examples: a program of one\u2019s own is shown as the model would be told, and the loop is never run here', () => {
  const def = defOf(EDITABLE.id);
  assert.deepEqual(def.phases, ['see', 'change', 'do']);
  for (const p of CONTRACT_PROBES) {
    // The loop would hang a synchronous run: on the page it goes through the worker, here it is the worker's own answer.
    const outcome = /while \(true\)/.test(p.code)
      ? failedOutcome('timeout', 'Stopped after 1500 ms. The run took too long, so its worker was terminated.', 1500)
      : runTracked({ code: p.code, projection: exProj });
    const view = buildExample({ def, program: { code: p.code }, outcome, inv: exInv });
    assert.equal(probeFor(p.code)?.id, p.id, 'a program on screen is recognised as the probe it was loaded from');
    assert.ok(probeResult(p, outcome).met, `${p.id}: ${probeResult(p, outcome).headline}`);
    assert.equal(view.answer.tone, outcome.status === 'ok' ? 'ok' : 'bad', p.id);
    assert.ok(view.copy.see?.startsWith(p.label), p.id);
    assert.equal(view.copy.see, view.copy.change);
    assert.equal(view.copy.see, view.copy.do);
    assert.equal(view.marks.written.size, outcome.status === 'ok' ? outcome.resourcesAffected : 0, `${p.id}: only a change that was accepted is drawn as one`);
    assert.equal(view.marks.refused.size > 0, outcome.status === 'rejected' && Object.keys(outcome.attempted).length > 0, `${p.id}: a refused change shows what it tried`);
  }
  // A refused write shows the cell it tried to change; an error or a time limit has nothing to circle.
  const cost = CONTRACT_PROBES.find((p) => p.id === 'cost')!;
  const refused = buildExample({ def, program: { code: cost.code }, outcome: runTracked({ code: cost.code, projection: exProj }), inv: exInv });
  assert.equal(refused.marks.refused.size, 1);
  assert.equal(refused.answer.label, 'refused: what the model is told');
  assert.deepEqual(refused.answer.lines, ['error: web-prod-03: costMonthly is read-only']);
  const loop = buildExample({ def, program: { code: 'function main(data) {\n  while (true) {}\n}' }, outcome: failedOutcome('timeout', 'Stopped after 1500 ms.', 1500), inv: exInv });
  assert.equal(loop.answer.label, 'stopped: what the model is told');
  assert.equal(loop.marks.refused.size, 0);
  // A program someone typed is still a program: it gets a sentence of its own, and the program is not mistaken for a probe.
  const typed = buildExample({ def, program: { code: 'function main(data) { return 1; }' }, outcome: runTracked({ code: 'function main(data) { return 1; }', projection: exProj }), inv: exInv });
  assert.equal(probeFor('function main(data) { return 1; }'), null);
  assert.match(typed.copy.do ?? '', /^Your program\. The runtime answered ok\./);
});

test('examples: the motion places everything in order, and each beat rests where it should', () => {
  // The program writes itself in line by line, then the sweep runs, then the answer arrives, then the review.
  for (const i of [0, 12, 26]) {
    assert.equal(lineAlpha(i, U_START), 0, `line ${i} is not there yet`);
    assert.equal(lineAlpha(i, 0), 1, `line ${i} is written by the time the program is complete`);
  }
  assert.ok(lineAlpha(0, -0.8) > lineAlpha(20, -0.8), 'top to bottom');
  assert.equal(chromeAt(U_START), 0);
  assert.equal(chromeAt(0), 1);
  assert.equal(sweepAt(0), 0);
  assert.equal(sweepAt(1), 1);
  assert.equal(settledAt(0.5), 0);
  assert.equal(settledAt(1), 1);
  assert.equal(answerAt(1), 0);
  assert.equal(answerAt(2), 1);
  assert.equal(reviewAt(2), 0);
  assert.equal(reviewAt(3), 1);
  // The body of the program is lit while it runs, its return while the answer comes back, and never both at rest.
  assert.equal(bodyBand(0), 0);
  assert.ok(bodyBand(0.6) > 0.99);
  assert.equal(bodyBand(1.5), 0);
  assert.equal(retBand(0.6), 0);
  assert.ok(retBand(1.6) > 0.99);
  assert.equal(retBand(2.5), 0);
  assert.deepEqual(PHASE_U, { write: 0, run: 1, answer: 2, review: 3, see: 2, change: 2, do: 2 });
  for (const b of exampleBeats()) assert.ok(PHASE_U[b.phase] >= 0 && PHASE_U[b.phase] <= 3);
});

// ── security and writes: the six gates ───────────────────────────────────────

const gInv = buildInventory();
const gProj = buildProjection(gInv);
const gVms = gInv.resources.filter((r): r is VirtualMachine => r.type === 'virtualMachine');
const gProd = gInv.subscriptions.find((s) => s.name === 'Production')!;
const gRunning = gVms.filter((v) => v.powerState === 'running').sort((a, b) => b.costMonthly - a.costMonthly);
const walkFiles = (dir: URL): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walkFiles(new URL(`${d.name}/`, dir)) : [new URL(d.name, dir).pathname]));
const guardAddress = (href: string): URLSearchParams => new URL(href, 'http://tour.test').searchParams;

/** A program through the gates the way the screen runs it. The program that never returns goes through the worker on the page: here it is the worker's own answer. */
function guardOf(beat: BeatId, id: ProgramId, opts: { decision?: Decision; ruleOn?: boolean; inv?: typeof gInv } = {}) {
  const p = PROGRAMS[id];
  const inv = opts.inv ?? gInv;
  const outcome = p.worker ? failedOutcome('timeout', 'Stopped after 1500 ms. The run took too long, so its worker was terminated.', 1500) : undefined;
  return buildGuard({ beat, code: p.code, rationale: p.rationale, inv, projection: buildProjection(inv), decision: opts.decision, ruleOn: opts.ruleOn, outcome });
}
const sliceOf = (code: string, f: { line: number; col?: readonly [number, number] }): string => code.split('\n')[f.line].slice(f.col![0], f.col![1]);

test('guard: six gates in the order a program meets them, five of them the benchmark\u2019s runtime and one of them the tour\u2019s', () => {
  assert.deepEqual(GATES.map((g) => g.id), ['read', 'run', 'change', 'rule', 'review', 'apply']);
  assert.deepEqual(GATES.filter((g) => g.home === 'yours').map((g) => g.id), ['rule'], 'only the rule is not in the runtime');
  assert.ok(GATES.every((g) => g.says.endsWith('.') && g.label.length > 0));
  assert.equal(gateOf('rule').home, 'yours');
  assert.deepEqual(RULES, [PRODUCTION_RULE]);
  assert.equal(PRODUCTION_RULE.text, 'No power-state change in Production without a person.');
  assert.deepEqual([...DROPPED_FIELDS].sort(), ['_billingAccount', '_internalId']);
  // The claim on the screen ("yours", not the runtime\u2019s) holds: no file the benchmark runs on has the rule.
  for (const dir of ['agent', 'surfaces', 'inventory']) {
    for (const file of walkFiles(new URL(`../src/lib/${dir}/`, import.meta.url))) {
      assert.ok(!/production-power|No power-state change/.test(readFileSync(file, 'utf8')), `${file} does not have the rule`);
    }
  }
  // The things the screen says the runtime does are in it: the whole proposal refused on one bad edit, the decline and the re-check as it lands.
  const loop = readFileSync(new URL('../src/lib/agent/loop.ts', import.meta.url), 'utf8');
  assert.ok(loop.includes(DECLINED_NOTE), 'the decline note is the loop\u2019s own');
  assert.ok(loop.includes("status: 'not_applied'"), 'and so is the refusal when the apply fails');
  assert.deepEqual(JSON.parse(declinedContent()), { status: 'declined', note: DECLINED_NOTE });
});

test('guard: the rule reads the change set the runtime derived, so it holds however the program was written', () => {
  const top = gRunning.slice(0, 3);
  assert.ok(top.every((v) => v.subscriptionId === gProd.id), 'the three most expensive running VMs are all in Production');
  const reach = guardOf('rule', 'reach');
  assert.equal(reach.raw.status, 'ok', 'valid for the contract: the runtime has nothing against it');
  assert.equal(reach.raw.diff.length, 3);
  assert.equal(reach.hit?.offenders.length, 3);
  assert.equal(reach.hit?.total, 3);
  assert.deepEqual(reach.hit!.offenders.map((r) => r.resourceName).sort(), top.map((v) => v.name).sort());
  assert.match(reach.hit!.message, /^production-power: 3 of 3 changes set a power state in Production \(sql-host-0\d, sql-host-0\d, sql-host-0\d\)\. A person has to make those\. Nothing was applied\.$/);
  // Refused whole, like any bad edit, and the model is told in the contract's own shape.
  const refused = refusedByRule(reach.raw, reach.hit!);
  assert.equal(refused.status, 'rejected');
  assert.deepEqual(JSON.parse(refused.content), { error: reach.hit!.message });
  assert.equal(refused.hasResult, false);
  assert.deepEqual(Object.keys(refused.attempted).sort(), top.map((v) => v.id).sort());
  assert.equal(reach.example.answer.tone, 'bad');
  assert.equal(reach.example.answer.label, 'refused: what the model is told');
  assert.equal(reach.endU, 2, 'nothing goes to a person');
  assert.equal(reach.example.review, null);
  // Narrowed to outside Production, the rule has nothing to say, and the three are the next most expensive.
  const narrow = guardOf('review', 'narrow');
  assert.equal(narrow.hit, null);
  assert.deepEqual(narrow.raw.diff.map((r) => r.resourceName).sort(), gRunning.filter((v) => v.subscriptionId !== gProd.id).slice(0, 3).map((v) => v.name).sort());
  assert.ok(narrow.raw.diff.every((r) => !top.some((t) => t.id === r.resourceId)));
  // Turned off, the same program goes to a person.
  const off = guardOf('rule', 'reach', { ruleOn: false });
  assert.equal(off.hit, null);
  assert.equal(off.endU, 3);
  assert.equal(off.gates.rule, 'skip');
  assert.equal(off.gates.review, 'hold');
  assert.equal(off.example.review?.resources, 3);
  // The rule reads rows, not text: another program, another way to say it, the same refusal; a tag in Production, or a power change outside it, passes.
  const other = (code: string) => evaluateRules(RULES, run(code).diff, gProj);
  const host = gVms.find((v) => v.subscriptionId === gProd.id && v.powerState === 'running')!;
  const lab = gVms.find((v) => v.subscriptionId !== gProd.id && v.powerState === 'running')!;
  assert.equal(other(`function main(data) {\n  data.resources.forEach((r) => {\n    if (r.name === '${host.name}') r['powerState'] = 'stopped';\n  });\n}`)?.offenders.length, 1);
  assert.equal(other(`function main(data) {\n  const r = data.resources.find((x) => x.name === '${host.name}');\n  r.tags.reviewed = 'yes';\n}`), null);
  assert.equal(other(`function main(data) {\n  const r = data.resources.find((x) => x.name === '${lab.name}');\n  r.powerState = 'stopped';\n}`), null);
  assert.equal(other('function main(data) {\n  return 1;\n}'), null, 'a program that changes nothing has nothing to refuse');
  assert.equal(evaluateRule(PRODUCTION_RULE, [], gProj), null);
  const noProd = { ...gProj, subscriptions: gProj.subscriptions.filter((s) => s.name !== 'Production') };
  assert.equal(evaluateRule(PRODUCTION_RULE, reach.raw.diff, noProd), null, 'with no Production there is nothing to protect');
});

test('guard: each program meets the gates the screen says it does, and stops at the first one that refuses it', () => {
  type Gates = Partial<Record<GateId, string>>;
  const expect: Array<[ProgramId, BeatId, Gates]> = [
    ['read', 'read', { read: 'note', run: 'pass', change: 'skip', rule: 'skip', review: 'skip', apply: 'skip' }],
    ['internal', 'read', { read: 'note', run: 'pass', change: 'skip' }],
    ['network', 'run', { read: 'pass', run: 'stop', change: 'idle', rule: 'idle', review: 'idle', apply: 'idle' }],
    ['loop', 'run', { read: 'pass', run: 'stop', change: 'idle' }],
    ['change', 'change', { read: 'pass', run: 'pass', change: 'stop', rule: 'idle', review: 'idle' }],
    ['tag-type', 'change', { run: 'pass', change: 'stop' }],
    ['new-field', 'change', { run: 'pass', change: 'stop' }],
    ['delete', 'change', { run: 'pass', change: 'stop' }],
    ['tag', 'try', { run: 'pass', change: 'pass', rule: 'pass', review: 'hold', apply: 'idle' }],
    ['reach', 'rule', { run: 'pass', change: 'pass', rule: 'stop', review: 'idle', apply: 'idle' }],
    ['narrow', 'review', { run: 'pass', change: 'pass', rule: 'pass', review: 'hold', apply: 'idle' }]
  ];
  assert.deepEqual(expect.map(([id]) => id).sort(), Object.keys(PROGRAMS).sort(), 'every program is covered');
  const stops: Record<ProgramId, GateId | null> = { read: null, internal: null, network: 'run', loop: 'run', change: 'change', 'tag-type': 'change', 'new-field': 'change', delete: 'change', tag: 'review', reach: 'rule', narrow: 'review' };
  for (const [id, beat, gates] of expect) {
    const v = guardOf(beat, id);
    for (const [g, status] of Object.entries(gates)) assert.equal(v.gates[g as GateId], status, `${id}: ${g}`);
    assert.equal(v.at, stops[id], `${id}: where it stops`);
    // A refusal is the last gate that was reached: nothing after a stop was ever looked at.
    const order = GATES.map((g) => v.gates[g.id]);
    const stop = order.indexOf('stop');
    if (stop >= 0) assert.ok(order.slice(stop + 1).every((s) => s === 'idle'), `${id}: nothing after the stop`);
    // The lines flagged are lines of the program, one flag to a line, and only the program's own statements.
    const lines = PROGRAMS[id].code.split('\n');
    assert.equal(new Set(v.flags.map((f) => f.line)).size, v.flags.length, `${id}: one flag to a line`);
    for (const f of v.flags) {
      assert.ok(f.line >= 0 && f.line < lines.length && lines[f.line].trim() !== '', `${id}: flag on line ${f.line}`);
      assert.ok(f.text.length > 0 && f.text.length <= 32, `${id}: "${f.text}" fits its pill`);
      if (f.col) assert.ok(f.col[0] >= 0 && f.col[1] > f.col[0] && f.col[1] <= lines[f.line].length, `${id}: the underline is inside the line`);
      assert.equal(f.col !== undefined, f.tone !== 'ok', `${id}: only what was refused or missing is underlined`);
    }
    assert.ok(v.stop === null || (v.stop >= 0 && v.stop < lines.length), `${id}: the cursor stops on a line`);
    assert.ok(!/undefined|NaN|null|\[object|Infinity/.test(v.lead + v.ask), `${id}: ${v.lead}`);
    assert.equal(v.ask, PROGRAMS[id].ask);
    assert.ok(v.lead.length > 40 && v.lead.length <= 330, `${id}: ${v.lead.length} characters of narration`);
  }
});

test('guard: what each refusal says, and the line it points at, are the runtime\u2019s own words and the program\u2019s own text', () => {
  const flagsOf = (id: ProgramId, beat: BeatId = 'try') => guardOf(beat, id).flags.map((f) => [f.line, f.tone, f.text, f.at, f.col ? sliceOf(PROGRAMS[id].code, f) : null]);
  // Read: what the projection left out is not an error, and it is not there. It is underlined where it was read, and said in the answer.
  const read = guardOf('read', 'read');
  assert.deepEqual(read.absent, ['_billingAccount']);
  assert.deepEqual(flagsOf('read'), [[4, 'note', 'not in the projection', 'cursor', '_billingAccount']]);
  assert.equal(read.raw.status, 'ok');
  assert.deepEqual(JSON.parse(read.raw.content).result, { name: 'web-prod-03' }, 'the field is gone from the answer: nothing to read, nothing to leak');
  assert.equal(read.example.answer.tone, 'note');
  assert.equal(read.example.answer.foot, '_billingAccount is not in the result.\nNever in the object, so there was nothing to read.');
  assert.equal(read.example.ret !== null, true, 'a program that finished reaches its return');
  const internal = guardOf('read', 'internal');
  assert.deepEqual(internal.absent, ['_internalId', '_billingAccount']);
  assert.deepEqual(flagsOf('internal').map((f) => f[4]), ['_internalId', '_billingAccount']);
  assert.match(internal.example.answer.foot!, /^_internalId and _billingAccount are not in the result\.\n/);
  assert.ok(internal.example.answer.foot!.split('\n').every((l) => l.length <= ANSWER_WIDTH), 'each line of it fits the card');
  assert.ok(PROGRAMS.internal.code.split('\n').every((l) => l.length <= 70), 'one statement to a line, so nothing runs off the panel');
  // Run: no network, and a clock.
  const net = guardOf('run', 'network');
  assert.equal(net.raw.status, 'error');
  assert.match(net.raw.error ?? '', /^fetch is not (a function|defined)$/);
  assert.deepEqual(flagsOf('network'), [[2, 'bad', 'no network', 'cursor', 'fetch']]);
  assert.equal(net.stop, 2);
  assert.equal(net.example.ret, null, 'it never got to the return');
  assert.equal(net.example.answer.label, 'error: what the model is told');
  const loop = guardOf('run', 'loop');
  assert.equal(loop.raw.status, 'timeout');
  assert.deepEqual(flagsOf('loop'), [[1, 'bad', 'never returns', 'cursor', 'while (true)']]);
  assert.equal(loop.example.answer.label, 'stopped: what the model is told');
  assert.match(loop.raw.error!, /^Stopped after 1500 ms\./);
  assert.match(loop.lead, /not a security boundary/);
  assert.match(net.lead, /not a security boundary/);
  // Change: the contract's strings, a flag on the line that broke it, and what was fine is dropped with the rest.
  const change = guardOf('change', 'change');
  assert.equal(change.raw.error, 'web-prod-03: costMonthly is read-only');
  assert.deepEqual(flagsOf('change'), [
    [3, 'bad', 'read-only', 'diff', 'costMonthly'],
    [2, 'ok', 'allowed, dropped with the rest', 'diff', null]
  ]);
  assert.match(change.lead, /the valid tag change was dropped with it/);
  assert.match(guardOf('change', 'tag-type').raw.error ?? '', /^Invalid tag monthly: keys must be supported and values must be strings/);
  assert.deepEqual(flagsOf('tag-type', 'change').map((f) => f.slice(1, 4)), [['bad', 'tags are strings', 'diff']]);
  assert.deepEqual(flagsOf('new-field', 'change').map((f) => f.slice(1, 4)), [['bad', 'cannot add a field', 'diff']]);
  assert.deepEqual(flagsOf('delete', 'change').map((f) => f.slice(1, 4)), [['bad', 'cannot add or remove', 'diff']]);
  // Rule, review: where a change set is refused by a rule, or goes on to a person.
  assert.deepEqual(flagsOf('reach', 'rule').map((f) => [f[1], f[2], f[3], f[4]]), [['bad', '3 of 3 refused by your rule', 'diff', 'powerState']]);
  assert.deepEqual(flagsOf('narrow', 'review').map((f) => [f[1], f[2], f[3], f[4]]), [['ok', 'goes to review', 'diff', null]]);
  assert.deepEqual(flagsOf('tag').map((f) => [f[1], f[2]]), [['ok', 'goes to review']]);
  // A comment is not code: the flag goes to the line that really does it.
  const commented = ['function main(data) {', "  // vm._billingAccount would be the billing account", "  const vm = data.resources[0];", '  return vm._billingAccount;', '}'];
  const out = run(commented.join('\n'));
  assert.deepEqual(flagsFor(commented, out, gProj).flags.map((f) => f.line), [3]);
});

test('guard: a person decides, the decline is the loop\u2019s own note, and the estate is never touched', () => {
  const before = JSON.stringify(gInv);
  const pending = guardOf('review', 'narrow');
  assert.equal(pending.gates.review, 'hold');
  assert.equal(pending.told, null, 'nothing is told until somebody decides');
  assert.equal(pending.applied, null);
  assert.equal(pending.endU, 3);
  assert.deepEqual(pending.example.review?.rows.map((r) => r.name), pending.raw.diff.map((r) => r.resourceName).filter((n, i, all) => all.indexOf(n) === i), 'a row for each resource, in the order the change set has them');
  assert.equal(pending.example.review?.hidden, 0);
  // Declined: the model is told not to retry, and nothing was written.
  const declined = guardOf('review', 'narrow', { decision: 'declined' });
  assert.equal(declined.gates.review, 'stop');
  assert.equal(declined.gates.apply, 'idle');
  assert.equal(declined.at, 'review');
  assert.equal(declined.applied, null);
  assert.equal(declined.told?.tone, 'quiet');
  assert.equal(declined.told!.lines.join(' ').replace(/\s+/g, ' '), `status: "declined" note: "${DECLINED_NOTE}"`);
  assert.equal(declined.example.counters.tokensSub, 'tokens: told not to retry');
  assert.ok(declined.example.counters.tokens < pending.example.counters.tokens, 'the refusal note is shorter than the write summary');
  assert.match(declined.lead, /^Declined: nothing changed\. The model is told not to retry this change set/);
  // Approved: the runtime's own write result goes back to the model, and the three resources carry the change in the copy.
  const approved = guardOf('review', 'narrow', { decision: 'approved' });
  assert.equal(approved.applied?.ok, true);
  assert.equal(approved.applied?.content, approved.raw.content, 'the model reads what a write would have returned');
  assert.equal(approved.told?.tone, 'ok');
  assert.deepEqual(GATES.map((g) => approved.gates[g.id]), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
  assert.equal(approved.example.marks.written.size, 3);
  assert.match(approved.lead, /^Approved: the 3 resources now carry the change, in this copy of the estate\./);
  assert.equal(JSON.stringify(gInv), before, 'the estate the screen was given is the estate it still has');
  // The apply, run for real over a copy: the same change set lands on the estate it was derived from.
  const copy = structuredClone(gInv);
  applyChangeRows(copy, [...approved.raw.diff]);
  for (const row of approved.raw.diff) assert.equal((copy.resources.find((r) => r.id === row.resourceId) as VirtualMachine).powerState, 'deallocated');
  // A decision on a run with nothing to decide is no decision: nothing to review, nothing told.
  const stopped = guardOf('review', 'network', { decision: 'approved' });
  assert.equal(stopped.applied, null);
  assert.equal(stopped.told, null);
  assert.equal(guardOf('review', 'reach', { decision: 'approved' }).applied, null, 'a change set the rule refused never reaches a person');
});

test('guard: approval is not the end, because applying checks the proposal against the estate as it is now', () => {
  const rows = guardOf('apply', 'narrow').raw.diff;
  const moved = movedOn(gInv, rows);
  assert.equal(moved.resource, 'ci-runner-04', 'while the change set waited, someone else dealt with the second VM');
  assert.equal(moved.note, 'already deallocated');
  assert.equal((moved.inv.resources.find((r) => r.name === 'ci-runner-04') as VirtualMachine).powerState, 'deallocated');
  assert.equal((gInv.resources.find((r) => r.name === 'ci-runner-04') as VirtualMachine).powerState, 'running', 'the estate itself was not moved');
  assert.deepEqual(movedOn(gInv, []).resource, '');
  // The runtime's own apply refuses it, whole, in its own words; the unmoved estate takes it.
  assert.throws(() => applyChangeRows(structuredClone(moved.inv), [...rows]), /Stale or invalid power-state change/);
  assert.doesNotThrow(() => applyChangeRows(structuredClone(gInv), [...rows]));
  // Before approval the person sees the diff as it was derived, with no hint of what has moved. After, the refused row says so.
  const waiting = guardOf('apply', 'narrow');
  assert.equal(waiting.movedOn, 'ci-runner-04');
  assert.ok(waiting.example.review!.rows.every((r) => r.note === undefined), 'nothing in the diff gives the move away');
  assert.equal(waiting.gates.apply, 'idle');
  assert.match(waiting.lead, /someone else deallocated ci-runner-04\. Approve it, and see\.$/);
  const refused = guardOf('apply', 'narrow', { decision: 'approved' });
  assert.equal(refused.applied?.ok, false);
  assert.equal(refused.applied?.error, 'Stale or invalid power-state change');
  assert.deepEqual(JSON.parse(refused.applied!.content), { error: 'Stale or invalid power-state change', status: 'not_applied' });
  assert.equal(refused.gates.review, 'pass');
  assert.equal(refused.gates.apply, 'stop');
  assert.equal(refused.at, 'apply');
  assert.equal(refused.example.marks.written.size, 0, 'nothing was written, so nothing is drawn as written');
  assert.deepEqual([...refused.example.marks.refused], [rows.find((r) => r.resourceName === 'ci-runner-04')!.resourceId]);
  assert.deepEqual(refused.example.review!.rows.map((r) => [r.name, r.note]), [['ci-runner-02', undefined], ['ci-runner-04', 'already deallocated'], ['ci-runner-05', undefined]]);
  assert.equal(refused.told?.tone, 'bad');
  assert.equal(refused.told?.label, 'the model is told: not applied');
  assert.equal(refused.example.counters.usedSub, 'nothing was applied');
  assert.equal(refused.example.counters.tokens, backToModelTokens({ ...refused.raw, content: refused.applied!.content }));
  assert.equal(refused.example.counters.tokensSub, 'tokens: the error it is told');
  assert.match(refused.lead, /^Not applied\. The change set was derived from an estate that has since moved, so nothing was written\./);
  // The same approval on the beat before it is not refused: the estate has not moved there.
  assert.equal(guardOf('review', 'narrow', { decision: 'approved' }).applied?.ok, true);
  assert.equal(applyApproved(gInv, rows, 'x').ok, true);
  assert.equal(applyApproved(moved.inv, rows, 'x').ok, false);
});

test('guard: where each gate stands is a function of the run, the rule and the person, and nothing else', () => {
  const ok = guardOf('rule', 'narrow').raw;
  const flow = (over: Partial<Parameters<typeof gateStates>[0]> = {}) => ({ raw: ok, hit: null, ruleOn: true, absent: [], decision: 'pending' as Decision, applied: null, ...over });
  const states = (over?: Parameters<typeof flow>[0]) => GATES.map((g) => gateStates(flow(over))[g.id]);
  assert.deepEqual(states(), ['pass', 'pass', 'pass', 'pass', 'hold', 'idle']);
  assert.deepEqual(states({ ruleOn: false }), ['pass', 'pass', 'pass', 'skip', 'hold', 'idle']);
  assert.deepEqual(states({ absent: ['x'] }), ['note', 'pass', 'pass', 'pass', 'hold', 'idle']);
  assert.deepEqual(states({ decision: 'declined' }), ['pass', 'pass', 'pass', 'pass', 'stop', 'idle']);
  assert.deepEqual(states({ decision: 'approved' }), ['pass', 'pass', 'pass', 'pass', 'pass', 'idle'], 'approved and not yet applied');
  assert.deepEqual(states({ decision: 'approved', applied: { ok: true, content: '{}' } }), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
  assert.deepEqual(states({ decision: 'approved', applied: { ok: false, content: '{}', error: 'x' } }), ['pass', 'pass', 'pass', 'pass', 'pass', 'stop']);
  const reach = guardOf('rule', 'reach');
  assert.deepEqual(states({ raw: reach.raw, hit: reach.hit }), ['pass', 'pass', 'pass', 'stop', 'idle', 'idle']);
  assert.deepEqual(states({ raw: { ...ok, status: 'rejected' } }), ['pass', 'pass', 'stop', 'idle', 'idle', 'idle']);
  assert.deepEqual(states({ raw: { ...ok, status: 'error' } }), ['pass', 'stop', 'idle', 'idle', 'idle', 'idle']);
  assert.deepEqual(states({ raw: { ...ok, status: 'timeout' } }), ['pass', 'stop', 'idle', 'idle', 'idle', 'idle']);
  assert.deepEqual(states({ raw: { ...ok, diff: [] } }), ['pass', 'pass', 'skip', 'skip', 'skip', 'skip'], 'a program that only read has nothing for the later gates to check');
  assert.equal(stoppedAt(gateStates(flow())), 'review', 'a person holding it is where it stands');
  assert.equal(stoppedAt(gateStates(flow({ decision: 'approved', applied: { ok: true, content: '{}' } }))), null);
});

test('guard: seven beats, each a URL the screen reads back, each opening on the program that makes its own gate the interesting one', () => {
  assert.deepEqual(GUARD_BEATS.map((b) => b.id), ['read', 'run', 'change', 'rule', 'review', 'apply', 'try']);
  assert.deepEqual(GUARD_PANELS.map((b) => b.href), ['/tour/guard', ...[1, 2, 3, 4, 5, 6].map((i) => `/tour/guard?at=${i}`)]);
  assert.equal(GUARD_PANELS.length, GUARD_BEATS.length);
  for (const [i, b] of GUARD_BEATS.entries()) {
    assert.equal(parseAt(guardAddress(GUARD_PANELS[i].href), GUARD_BEATS.length), i, b.id);
    assert.equal(beatIndex(b.id), i);
    assert.equal(guardHref(b.id), GUARD_PANELS[i].href);
    assert.ok(b.variants.includes(b.start), `${b.id}: it opens on one of its own programs`);
    assert.ok([b.start, ...b.variants].every((id) => PROGRAMS[id]), `${b.id}: the programs exist`);
    assert.ok(b.caption.length > 0 && b.label.length > 0);
  }
  assert.equal(parseAt(new URLSearchParams('at=99'), GUARD_BEATS.length), 6, 'an address past the end is the last beat');
  assert.deepEqual(new Set(GUARD_BEATS.flatMap((b) => b.variants)), new Set(Object.keys(PROGRAMS)), 'every program is on a beat, and no beat names one that is not');
  // The program a beat opens on does what the beat is about.
  const stopsAt = (b: BeatId): GateId | null => guardOf(b, beatOf(b).start).at;
  assert.equal(stopsAt('read'), null, 'a read finishes, with something missing');
  assert.equal(guardOf('read', 'read').gates.read, 'note');
  assert.equal(stopsAt('run'), 'run');
  assert.equal(stopsAt('change'), 'change');
  assert.equal(stopsAt('rule'), 'rule');
  assert.equal(stopsAt('review'), 'review');
  assert.equal(guardOf('review', beatOf('review').start).gates.review, 'hold');
  assert.equal(beatOf('apply').start, beatOf('review').start, 'the apply beat is the review beat\u2019s change set, a moment later');
  assert.equal(guardOf('apply', beatOf('apply').start, { decision: 'approved' }).at, 'apply');
  // The story carries on: the model is told the refusal and narrows, so the beat after the rule asks again.
  assert.equal(PROGRAMS.narrow.ask.startsWith(PROGRAMS.reach.ask), true);
  assert.match(PROGRAMS.narrow.ask, /has read the refusal, and tries again\.$/);
  assert.equal(beatOf('apply').ask?.startsWith(PROGRAMS.reach.ask.replace(/\.$/, '')), true);
  // Every program fits the panel, at a size that can be read from the back of a room.
  for (const p of Object.values(PROGRAMS)) {
    const lines = displayLines(p.code);
    assert.ok(Math.max(...lines.map((l) => l.length)) <= 84, `${p.id}: the longest line is ${Math.max(...lines.map((l) => l.length))} characters`);
    assert.ok(lineHeightFor(lines.length, Boolean(p.rationale)) >= 20, `${p.id}: ${lines.length} lines`);
    assert.match(lines[0], /^function main\(/);
    assert.equal(lines[lines.length - 1], '}');
    assert.equal(programOf(p.code)?.id, p.id, 'a program on screen is recognised as the one it was loaded from');
  }
  assert.equal(programOf('function main(data) { return 1; }'), null);
  assert.deepEqual(Object.values(PROGRAMS).filter((p) => p.worker).map((p) => p.id), ['loop'], 'only the program that never returns needs the worker\u2019s clock');
  assert.deepEqual(execLinesFor(PROGRAMS.reach.code), [1, 6, 7, 9], 'the chain is one statement, the loop and its body are two, and the return is one');
});

test('guard: the cursor steps through a program\u2019s statements, a refusal waits for its turn, and a run that stopped stays where it stopped', () => {
  const lines = PROGRAMS.reach.code.split('\n');
  const exec = execLinesFor(PROGRAMS.reach.code);
  assert.deepEqual(exec.map((i) => lines[i].trim()).slice(0, 2), ['const top = data.resources', "for (const vm of top) {"], 'a chain is one statement, and its dots are not');
  assert.ok(exec.every((i) => !/^[}\])]+[;,]?$/.test(lines[i].trim()) && !lines[i].trim().startsWith('.')), 'no closing brace, no dot-line');
  assert.deepEqual(execLinesOf(['function main(data) {', '  const a = 1;', '', '  return a;', '}'], [1, 3]), [1, 3], 'blank lines are not steps');
  assert.equal(cursorOf(exec, null, U_START), null, 'before it runs, the cursor is nowhere');
  assert.equal(cursorOf(exec, null, 0), null);
  assert.equal(cursorOf(exec, null, 1), null, 'and once it has finished');
  const seen = new Set<number>();
  for (let u = 0.06; u < 0.85; u += 0.01) seen.add(cursorOf(exec, null, u)!);
  assert.deepEqual([...seen].sort((a, b) => a - b), exec, 'every statement gets the cursor, in order');
  // A run that stopped ends on the line it stopped at, and stays there.
  const net = PROGRAMS.network.code.split('\n');
  const netExec = execLinesFor(PROGRAMS.network.code);
  assert.equal(cursorOf(netExec, 2, 1), 2);
  assert.equal(cursorOf(netExec, 2, 3), 2);
  assert.ok(net[2].includes('fetch'));
  // A flag shows as the cursor reaches it, or once the program has returned and the runtime compares before and after.
  const cursorFlag = { line: 2, tone: 'bad', text: 'no network', at: 'cursor' } as const;
  const diffFlag = { line: 5, tone: 'bad', text: 'x', at: 'diff' } as const;
  assert.equal(flagAt(cursorFlag, netExec, 2, U_START), 0);
  assert.equal(flagAt(cursorFlag, netExec, 2, 1), 1);
  assert.ok(flagAt(cursorFlag, netExec, 2, 0.7) > 0 && flagAt(cursorFlag, netExec, 2, 0.7) < 1, 'it comes in as the cursor arrives');
  let last = 0;
  for (let u = U_START; u <= 1.5; u += 0.02) {
    const f = flagAt(cursorFlag, netExec, 2, u);
    assert.ok(f >= last - 1e-12 && f >= 0 && f <= 1, `at ${u.toFixed(2)}: a flag only ever comes in`);
    last = f;
  }
  assert.equal(flagAt(diffFlag, exec, null, 0.5), 0, 'a refusal of the change set waits for the program to return');
  assert.equal(flagAt(diffFlag, exec, null, 1.2), 1);
  const early = { line: exec[0], tone: 'note', text: 'x', at: 'cursor' } as const;
  const late = { line: exec.at(-1)!, tone: 'note', text: 'x', at: 'cursor' } as const;
  let u = 0;
  while (flagAt(early, exec, null, u) < 0.5) u += 0.01;
  let v = 0;
  while (flagAt(late, exec, null, v) < 0.5) v += 0.01;
  assert.ok(u < v, 'a line near the top shows before a line near the bottom');
});

test('guard: what the model is told once a person has decided is cut to the card, keys on as few lines as they fit', () => {
  assert.equal(TOLD_LINES, 4);
  assert.deepEqual(toldLines('{"status":"declined","note":"short"}'), ['status: "declined"  note: "short"']);
  assert.deepEqual(toldLines('{"error":"x","status":"not_applied"}'), ['error: "x"  status: "not_applied"']);
  assert.deepEqual(toldLines('{"a":1,"logs":[]}'), ['a: 1'], 'an empty log says nothing');
  assert.deepEqual(toldLines('{"a":1,"logs":["x"]}'), ['a: 1  logs: ["x"]']);
  const long = toldLines(JSON.stringify({ note: 'word '.repeat(60).trim() }));
  assert.ok(long.length <= TOLD_LINES && long.every((l) => l.length <= 74), 'a long value wraps, and never wider than the card');
  const many = toldLines(JSON.stringify(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`key${i}`, 'value'.repeat(3)]))));
  assert.equal(many.length, TOLD_LINES);
  assert.ok(many.at(-1)!.endsWith('\u2026'), 'what does not fit is cut, and says so');
  assert.deepEqual(toldLines('not json at all'), ['not json at all']);
  assert.deepEqual(toldCard('{"a":1}', 'ok', 'the model is told'), { tone: 'ok', label: 'the model is told', lines: ['a: 1'] });
});

// ── the results screen: the benchmark, from an older model up to the newest ──

const MODEL_KEYS = MODELS.map((m) => m.key);
const SIX = METHODS.map((m) => m.id);
const EIGHT = ARMS.map((a) => a.id);
const SET_KEYS: TaskSet[] = ['preset', 'unplanned'];

test('results: eight methods on three models, forty runs in every cell of a set, and hosted calling on the newer two only', () => {
  assert.deepEqual(MODEL_KEYS, ['older', 'newer', 'newest'], 'the weakest first: the screen walks the model up');
  assert.deepEqual(MODEL_ORDER, MODEL_KEYS);
  assert.deepEqual(MODELS.map((m) => m.deployment), ['gpt-5.4-mini', 'gpt-5.6-luna', 'gpt-6-luna']);
  assert.equal(SOURCE.tasks * SOURCE.repetitions, 80);
  assert.deepEqual(SOURCE.groups, { preset: 'core', unplanned: 'heldout' });
  for (const set of SET_KEYS) {
    for (const m of MODEL_KEYS) {
      for (const id of SIX) {
        const c = setCell(set, m, id);
        assert.equal(c.runs, 40, `${set} ${m} ${id}: four tasks, ten runs each`);
        assert.ok(Number.isInteger(c.correct) && c.correct >= 0 && c.correct <= c.runs, `${set} ${m} ${id}`);
        assert.ok(c.totalUsd > 0 && c.totalUsd < 1, `${set} ${m} ${id}: ${c.totalUsd}`);
      }
    }
  }
  const hosted: ArmId[] = ['naive-ptc-native', 'tuned-ptc-native'];
  for (const set of SET_KEYS) {
    for (const m of ['newest', 'newer'] as const) for (const a of hosted) assert.equal(setCell(set, m, a).runs, 40, `${set} ${m} ${a}`);
    for (const a of hosted) assert.equal(cellIn(set, 'older', a), undefined, `the oldest deployment rejects hosted calling: ${a}`);
  }
  assert.deepEqual(hostedSpan(), { min: 79, max: 80 });
  // The dollars beat's cells are the two sets added up, run for run and dollar for dollar.
  for (const m of MODEL_KEYS) {
    assert.deepEqual(Object.keys(RESULTS[m]).sort(), EIGHT.filter((a) => cellIn('preset', m, a)).sort());
    for (const id of Object.keys(RESULTS[m]) as ArmId[]) {
      const [a, b] = SET_KEYS.map((s) => setCell(s, m, id));
      assert.deepEqual(cellOf(m, id), { runs: a.runs + b.runs, correct: a.correct + b.correct, totalUsd: a.totalUsd + b.totalUsd }, `${m} ${id}`);
      assert.equal(cellOf(m, id).runs, 80);
    }
  }
  assert.deepEqual(EIGHT, ['naive-direct', 'calc-direct', 'naive-ptc', 'naive-ptc-native', 'tuned-direct', 'tuned-ptc', 'tuned-ptc-native', 'code']);
  assert.deepEqual(ARMS.filter((a) => !a.hosted).map((a) => a.id), SIX, 'the six that ran everywhere are the methods the dollars beat ranks');
  assert.deepEqual(ARMS.filter((a) => a.hosted).map((a) => a.id), hosted);
  assert.deepEqual(armsOn('older').map((a) => a.id), SIX);
  assert.deepEqual(armsOn('newest').map((a) => a.id), EIGHT);
  assert.equal(OTHERS.length, 5);
  assert.ok(!OTHERS.includes(CODE));
  assert.deepEqual(Object.keys(GROUPS), ['catalogue', 'tuned', 'code']);
  assert.deepEqual(METHODS.map((m) => m.group), ['catalogue', 'catalogue', 'catalogue', 'tuned', 'tuned', 'code']);
  assert.deepEqual(ARMS.map((a) => a.shape), ['circle', 'circle', 'diamond', 'ring', 'circle', 'diamond', 'ring', 'square'], 'the shape is how the tools are called: one by one, from a program, hosted');
  assert.deepEqual(ARMS.map((a) => a.family), ['catalogue', 'calc', 'catalogue', 'catalogue', 'tuned', 'tuned', 'tuned', 'code'], 'the colour is the tool set');
  assert.deepEqual(Object.keys(TASK_SETS), SET_KEYS);
});

test('results: the snapshot is the benchmark\'s own export, cell for cell, when the export is at hand', { skip: !existsSync(new URL('../' + SOURCE.file, import.meta.url)) }, () => {
  const file = JSON.parse(readFileSync(new URL('../' + SOURCE.file, import.meta.url), 'utf8')) as {
    generatedAt: string;
    prices: Array<{ model: ModelKey; deployment: string; inputPerM: number; cachedInputPerM: number; outputPerM: number }>;
    rows: Array<{ model: ModelKey; arm: ArmId; group: string; runs: number; correct: number; totalUsd: number }>;
  };
  assert.equal(file.generatedAt, SOURCE.generatedAt);
  const held: Array<[string, (m: ModelKey, a: ArmId) => Cell | undefined]> = [
    [SOURCE.groups.preset, (m, a) => cellIn('preset', m, a)],
    [SOURCE.groups.unplanned, (m, a) => cellIn('unplanned', m, a)],
    ['all', (m, a) => RESULTS[m][a]]
  ];
  for (const [group, cell] of held) {
    const rows = file.rows.filter((r) => r.group === group);
    const ours = MODEL_KEYS.flatMap((m) => EIGHT.filter((a) => cell(m, a)).map((a) => `${m}/${a}`));
    assert.deepEqual([...ours].sort(), rows.map((r) => `${r.model}/${r.arm}`).sort(), `${group}: the same cells, no more and no fewer`);
    for (const r of rows) {
      const c = cell(r.model, r.arm)!;
      assert.equal(c.runs, r.runs, `${group} ${r.model} ${r.arm}: runs`);
      assert.equal(c.correct, r.correct, `${group} ${r.model} ${r.arm}: correct`);
      assert.ok(Math.abs(c.totalUsd - r.totalUsd) < 1e-7, `${group} ${r.model} ${r.arm}: ${c.totalUsd} against ${r.totalUsd}`);
    }
  }
  assert.deepEqual(file.prices.map((p) => p.model).sort(), [...MODEL_KEYS].sort());
  for (const p of file.prices) {
    const m = modelOf(p.model);
    assert.equal(m.deployment, p.deployment);
    assert.deepEqual(m.price, { input: p.inputPerM, cached: p.cachedInputPerM, output: p.outputPerM }, `${p.model}: the price sheet the dollars were computed with`);
  }
});

test('results: dollars print the way the benchmark\'s report prints them, and prices the way the vendors do', () => {
  // The table of section 1.4 of docs/ptc-matrix-results.md: dollars per 1,000 right answers over all eight tasks, in the screen's row order.
  const printed: Record<ModelKey, string[]> = {
    older: ['$18.7', '$13.8', '$4.09', '$6.46', '$5.63', '$2.66'],
    newer: ['$3.22', '$3.41', '$0.838', '$2.00', '$0.949', '$0.744'],
    newest: ['$1.40', '$1.48', '$0.387', '$0.851', '$0.395', '$0.286']
  };
  for (const m of MODEL_KEYS) assert.deepEqual(SIX.map((id) => fmtUsd(perThousandRight(cellOf(m, id)))), printed[m], m);
  assert.equal(fmtUsd(perThousandRight(cellOf('newer', 'naive-ptc-native'))), '$0.998');
  assert.equal(fmtUsd(perThousandRight(cellOf('newest', 'tuned-ptc-native'))), '$0.539');
  assert.equal(fmtUsd(Infinity), '\u2013', 'a method with no right answers has no price per right answer');
  assert.equal(perThousandRight({ runs: 80, correct: 0, totalUsd: 1 }), Infinity);
  assert.ok(Math.abs(perThousandRuns({ runs: 40, correct: 0, totalUsd: 0.1 }) - 2.5) < 1e-12, 'the plane ranks per run, right or wrong');
  assert.equal(fmtTimes(65.39), '65.4\u00d7');
  assert.equal(fmtTimes(13.33), '13.3\u00d7');
  assert.equal(fmtTimes(4.9048), '4.90\u00d7');
  assert.equal(fmtTimes(120.4), '120\u00d7');
  assert.deepEqual(MODEL_KEYS.map(priceLine), [
    '$0.75 in \u00b7 $0.075 cached \u00b7 $4.50 out, per 1M tokens',
    '$0.20 in \u00b7 $0.02 cached \u00b7 $1.20 out, per 1M tokens',
    '$0.10 in \u00b7 $0.01 cached \u00b7 $0.50 out, per 1M tokens'
  ]);
  assert.deepEqual([fmtPrice(0.075), fmtPrice(0.1), fmtPrice(4.5)], ['$0.075', '$0.10', '$4.50'], 'two decimals at least, and as many more as the figure needs');
  assert.deepEqual(priceDrop('older'), { min: 1, max: 1 });
  assert.deepEqual(priceDrop('newer'), { min: 3.75, max: 3.75 });
  assert.deepEqual(priceDrop('newest'), { min: 7.5, max: 9 });
});

test('results: the claims the screen makes hold for the cells they are read from', () => {
  const n = 40;
  // The code surface is right every time, on every model and on both sets of tasks: the screen's thesis.
  for (const set of SET_KEYS) for (const m of MODEL_KEYS) assert.equal(setCell(set, m, CODE).correct, n, `${set} ${m}: the code surface`);
  assert.deepEqual(codeSpan(MODEL_KEYS), { min: 80, max: 80 });
  // The other methods fall with the model. The older model breaks every one of them on the preset tasks, the newer two nearly hold them.
  assert.deepEqual(othersOn('preset', 'older').correct, { min: 21, max: 30 });
  assert.deepEqual(othersOn('preset', 'newer').correct, { min: 36, max: 40 });
  assert.deepEqual(othersOn('preset', 'newest').correct, { min: 36, max: 40 });
  assert.deepEqual(perfectOn('preset', 'older'), [CODE], 'on the older model only the code surface reaches the top');
  assert.deepEqual(perfectOn('preset', 'newer').sort(), ['code', 'tuned-ptc', 'tuned-ptc-native']);
  assert.equal(perfectOn('preset', 'newest').length, 5, 'on the newest, five methods are right every time, so price decides');
  assert.deepEqual(othersSpan(['older']), { min: 39, max: 56 }, 'over all eight tasks the older model breaks every other method');
  assert.deepEqual(othersSpan(['newer', 'newest']), { min: 76, max: 80 });
  for (const id of OTHERS) assert.ok(cellOf('older', id).correct < 60, `older ${id}`);

  // The narrative the plane tells. Where the tuned catalogue is designed for the question, it is as cheap as it gets: on the older model by a hair,
  // on the newer by more, and the code surface is the cheapest again only on the newest.
  const cheap = (set: TaskSet, m: ModelKey) => cheapestRun(set, m);
  assert.deepEqual([cheap('preset', 'older').id, fmtUsd(cheap('preset', 'older').usd), fmtUsd(perThousandRuns(setCell('preset', 'older', CODE)))], ['tuned-direct', '$2.55', '$2.57']);
  assert.deepEqual([cheap('preset', 'newer').id, fmtUsd(cheap('preset', 'newer').usd), fmtUsd(perThousandRuns(setCell('preset', 'newer', CODE)))], ['tuned-direct', '$0.729', '$0.777']);
  assert.deepEqual([cheap('preset', 'newest').id, fmtUsd(cheap('preset', 'newest').usd)], [CODE, '$0.278']);
  assert.equal(cheap('preset', 'newer').correct, 39, 'and what it saves is paid for in a wrong answer');
  // On questions nobody planned for, the code surface is the cheapest on all three, and still right every time.
  for (const m of MODEL_KEYS) assert.equal(cheap('unplanned', m).id, CODE, `${m}: cheapest on the unplanned tasks`);
  // Over all eight tasks, per right answer, it is the cheapest on all three too, which the dollars beat says.
  for (const m of MODEL_KEYS) assert.equal(cheapest(m).id, CODE, `${m}: cheapest right answer`);
  assert.deepEqual([nextCheapest('newest').id, fmtUsd(nextCheapest('newest').usd)], ['naive-ptc', '$0.387']);
  assert.deepEqual([nextCheapest('older').id, nextCheapest('older').correct], ['naive-ptc', 56]);
  // The two effects multiply into the whole, exactly, and they are the figures the report quotes.
  const x = multiples();
  assert.ok(Math.abs(x.model * x.method - x.both) < 1e-9, 'model \u00d7 method = both');
  assert.deepEqual([fmtTimes(x.both), fmtTimes(x.model), fmtTimes(x.method)], ['65.4\u00d7', '13.3\u00d7', '4.90\u00d7']);
  assert.equal(REPORTED.estateResources, buildInventory().resources.length, 'the estate the runs drove is the estate the tour shows');
  assert.equal(REPORTED.newestSmallestP, 0.12);
});

test('results: six beats, each a URL the screen reads back, the models in walking order, and the unplanned tasks turned to any of them', () => {
  assert.deepEqual(RESULTS_BEATS.map((b) => b.id), ['older', 'newer', 'newest', 'unplanned', 'dollars', 'why']);
  assert.deepEqual(RESULTS_BEATS.map((b) => b.href), [
    '/tour/results',
    '/tour/results?show=newer',
    '/tour/results?show=newest',
    '/tour/results?show=unplanned',
    '/tour/results?show=dollars',
    '/tour/results?show=why'
  ]);
  for (const b of RESULTS_BEATS) {
    assert.equal(parseResultsBeat(new URL(b.href, 'http://tour.test').searchParams), b.id, b.href);
    assert.equal(resultsHref(b.id), b.href);
    assert.ok(NEXT_LABEL[b.id].length > 0);
    assert.ok(b.caption.length > 0);
  }
  assert.deepEqual(RESULTS_BEATS.slice(0, 3).map((b) => b.caption), MODELS.map((m) => m.deployment), 'the first three beats are a model each, named as the benchmark names it');
  assert.equal(parseResultsBeat(new URLSearchParams('show=nope')), 'older', 'an unknown beat is the first');
  assert.equal(parseResultsBeat(new URLSearchParams('')), 'older');
  // A model beat is about its model. The unplanned tasks open on the newest and can be turned to the others. Nothing else is about one model.
  const at = (qs: string) => parseResults(new URLSearchParams(qs));
  assert.deepEqual(at(''), { beat: 'older', model: 'older' });
  assert.deepEqual(at('show=newer&model=older'), { beat: 'newer', model: 'newer' }, 'a model beat does not take a model from the address');
  assert.deepEqual(at('show=unplanned'), { beat: 'unplanned', model: UNPLANNED_MODEL });
  assert.equal(UNPLANNED_MODEL, 'newest', 'the walk has just ended there');
  assert.deepEqual(at('show=unplanned&model=older'), { beat: 'unplanned', model: 'older' });
  assert.deepEqual(at('show=unplanned&model=nope'), { beat: 'unplanned', model: UNPLANNED_MODEL });
  assert.equal(at('show=dollars&model=older').model, UNPLANNED_MODEL);
  assert.equal(resultsHref('unplanned', 'newest'), '/tour/results?show=unplanned', 'the model the beat opens on needs no say-so');
  assert.equal(resultsHref('unplanned', 'older'), '/tour/results?show=unplanned&model=older');
  assert.equal(resultsHref('newer', 'older'), '/tour/results?show=newer', 'a model is only ever named on the unplanned tasks');
  // The chips in the plane's header lead to the place they name, and back again.
  for (const m of MODEL_KEYS) {
    for (const set of SET_KEYS) {
      const state = parseResults(new URL(chipHref(m, set), 'http://tour.test').searchParams);
      assert.deepEqual(planeStateOf(state), { model: m, set }, `${m} ${set}`);
    }
  }
  assert.equal(planeStateOf(at('show=dollars')), null, 'the ladder and the reasons are not the plane');
  assert.equal(planeStateOf(at('show=why')), null);
});

test('results: each beat has the sentence and the figures that belong to it, and no figure is left half-made', () => {
  const views = Object.fromEntries(RESULTS_BEATS.map((b) => [b.id, buildResults(b.id)])) as Record<ResultsBeatId, ReturnType<typeof buildResults>>;
  for (const b of RESULTS_BEATS) {
    const v = views[b.id];
    assert.equal(v.beat, b.id);
    assert.equal(v.stage, b.id === 'dollars' ? 'ladder' : b.id === 'why' ? 'why' : 'plane');
    assert.equal(v.plane !== null && v.table !== null, v.stage === 'plane', `${b.id}: the plane and its table go together`);
    assert.equal(v.ladder !== null, v.stage === 'ladder');
    assert.equal(v.columns !== null, v.stage === 'why');
    assert.equal(v.tiles !== null, b.id !== 'why', `${b.id}: figures, or the reasons`);
    assert.ok(v.lead.length > 60 && v.lead.length <= 290, `${b.id}: ${v.lead.length} characters is two or three lines of narration, not four`);
    assert.ok(!/undefined|NaN|null|\[object|Infinity/.test(v.lead + JSON.stringify(v.tiles ?? []) + JSON.stringify(v.columns ?? []) + JSON.stringify(v.ladder ?? []) + v.footnote), b.id);
    assert.equal(v.aria.length > 0, v.stage === 'plane', `${b.id}: a screen reader gets the plane in words`);
    for (const t of v.tiles ?? []) assert.ok(t.value.length <= (t.compact ? 30 : 16), `${b.id}: "${t.value}" is a figure, so it fits a tile; a name is set small`);
  }
  assert.deepEqual(['older', 'newer', 'newest'].map((id) => views[id as ResultsBeatId].plane), [
    { model: 'older', set: 'preset' },
    { model: 'newer', set: 'preset' },
    { model: 'newest', set: 'preset' }
  ]);
  assert.deepEqual(views.unplanned.plane, { model: 'newest', set: 'unplanned' });
  // What is said at each of the three model beats is the cells' own.
  assert.match(views.older.lead, /^An older model, gpt-5\.4-mini, on the four preset tasks\. Only the code surface reaches the top: 40 of 40 right\. The other five get 21 to 30, at \$2\.55 to \$6\.02 per 1,000 runs against its \$2\.57\.$/);
  assert.match(views.newer.lead, /^gpt-5\.6-luna costs 3\.75 times less per token, so everything moves left, and it does the work better, so everything moves up\./);
  assert.match(views.newer.lead, /The code surface is no longer the cheapest: the tuned catalogue, called one by one, is 6% under it, at 39 of 40\. The code surface is still at 40 of 40\.$/);
  assert.match(views.newest.lead, /^gpt-6-luna costs 7\.5 to 9 times less per token than the older model\. Five methods now get 40 of 40, so price decides, and the code surface is the cheapest again: \$0\.278 per 1,000 runs against \$0\.337 for the next\.$/);
  assert.match(views.unplanned.lead, /^The same gpt-6-luna on four questions written after the tool sets were frozen\. Tuned catalogue, one by one, the cheapest other method on the preset tasks, goes from \$0\.337 to \$1\.37 per 1,000 runs: 4\.05\u00d7\. The code surface goes from \$0\.278 to \$0\.293, and still gets 40 of 40\.$/);
  assert.match(views.dollars.lead, /the code surface is the cheapest on all three models/);
  assert.match(views.why.lead, /^A reading, not a measurement/);
  assert.match(views.older.footnote, /^40 runs a marker: 4 tasks, 10 runs each\./);
  assert.match(views.older.footnote, /Rings are hosted programmatic calling, run on the two newer models only\.$/);
  assert.match(views.dollars.footnote, /^80 runs a bar: 8 tasks, 10 runs each\./);
  assert.match(views.dollars.footnote, /Hosted programmatic calling, run on the two newer models only, got 79 to 80 of 80 and is left out\.$/);
  assert.match(views.why.footnote, /^80 runs a method on each model: 8 tasks \(4 preset, 4 unplanned\), 10 runs each\./);
});

test('results: each beat\'s figures are the cells they quote', () => {
  const tiles = (id: ResultsBeatId, model?: ModelKey) => buildResults(id, model).tiles!.map((t) => [t.label, t.value]);
  assert.deepEqual(tiles('older'), [['Code surface', '40 of 40'], ['The other five', '21\u201330 of 40'], ['Cheapest per run', 'Tuned catalogue, one by one']]);
  assert.deepEqual(tiles('newer'), [['Code surface', '40 of 40'], ['The other seven', '36\u201340 of 40'], ['Cheapest per run', 'Tuned catalogue, one by one']]);
  assert.deepEqual(tiles('newest'), [['Code surface', '40 of 40'], ['The other seven', '36\u201340 of 40'], ['Cheapest per run', 'Code surface']]);
  assert.equal(buildResults('older').tiles![0].sub, 'right, at $2.57 per 1,000 runs');
  assert.equal(buildResults('older').tiles![1].sub, 'right, at $2.55 to $6.02 per 1,000 runs');
  assert.equal(buildResults('older').tiles![2].sub, '$2.55 per 1,000 runs, 30 of 40 right. The code surface: $2.57, 40 of 40.');
  assert.equal(buildResults('newer').tiles![2].sub, '$0.729 per 1,000 runs, 39 of 40 right. The code surface: $0.777, 40 of 40.');
  assert.equal(buildResults('newest').tiles![2].sub, '$0.278 per 1,000 runs. Next: tuned catalogue, one by one, $0.337, 21% more.');
  assert.deepEqual(buildResults('older').tiles!.map((t) => t.tone), ['code', 'catalogue', 'ink']);
  assert.ok(buildResults('older').tiles![2].compact, 'the cheapest is a name, so it is set small');
  // The unplanned tasks, on each model: what the best other method did, what the code surface did, and who is cheapest.
  assert.deepEqual(tiles('unplanned'), [['Tuned catalogue, one by one', '$0.337 \u2192 $1.37'], ['Code surface', '$0.278 \u2192 $0.293'], ['Cheapest on unplanned tasks', 'Code surface']]);
  assert.equal(buildResults('unplanned').tiles![0].sub, 'per 1,000 runs, preset to unplanned: 4.05\u00d7. Right: 40 of 40 on both.');
  assert.equal(buildResults('unplanned').tiles![1].sub, 'per 1,000 runs: 5% more. Right: 40 of 40 on both.');
  assert.deepEqual(tiles('unplanned', 'older').map((t) => t[1]), ['$2.55 \u2192 $6.18', '$2.57 \u2192 $2.74', 'Code surface']);
  assert.equal(buildResults('unplanned', 'older').tiles![0].sub, 'per 1,000 runs, preset to unplanned: 2.43\u00d7. Right: 30 of 40 on the preset tasks, 24 on these.', 'a method that is not as right on the second set says so');
  assert.deepEqual(tiles('unplanned', 'newer').map((t) => t[1]), ['$0.729 \u2192 $3.18', '$0.777 \u2192 $0.711', 'Code surface']);
  assert.equal(buildResults('unplanned', 'newer').tiles![1].sub, 'per 1,000 runs: 8% less. Right: 40 of 40 on both.', 'it can get cheaper too, and the tile says less');
  assert.match(buildResults('unplanned', 'older').lead, /^The same gpt-5\.4-mini on four questions/);
  assert.equal(buildResults('unplanned', 'older').plane?.model, 'older');
  // What a right answer costs: the model, the method, and both.
  assert.deepEqual(tiles('dollars'), [['The model alone', '13.3\u00d7'], ['The method alone', '4.90\u00d7'], ['Both together', '65.4\u00d7']]);
  assert.deepEqual(buildResults('dollars').tiles!.map((t) => t.op), [undefined, '\u00d7', '='], 'read as a sum');
  assert.match(buildResults('dollars').tiles![2].sub, /gpt-6-luna with the code surface, \$0\.286, against gpt-5\.4-mini with one-by-one catalogue calls, \$18\.7/);
  assert.match(buildResults('dollars').tiles![0].sub, /77 right instead of 39/);
  assert.match(buildResults('dollars').tiles![1].sub, /80 right instead of 77/);
  assert.deepEqual(buildResults('dollars').ladder!.map((r) => [r.id, r.sub, r.usd, r.tone]), [
    ['older-catalogue', '39 of 80 right', '$18.7', 'catalogue'],
    ['newest-catalogue', '77 of 80 right', '$1.40', 'catalogue'],
    ['newest-code', '80 of 80 right', '$0.286', 'code']
  ]);
  for (const r of buildResults('dollars').ladder!) {
    const f = ladderFrac(r.usdValue);
    assert.ok(f > 0 && f < 1, `${r.id}: the bar fits the axis`);
  }
  assert.ok(ladderFrac(0.286) < ladderFrac(1.4) && ladderFrac(1.4) < ladderFrac(18.7), 'the bars run in the order the prices do');
  // The reasons name the figures they rest on, and mark which of them were measured.
  const [why, limits] = buildResults('why').columns!;
  assert.deepEqual(why.points.map((p) => p.measured), [false, false, true]);
  assert.equal(why.tagged, true);
  assert.equal(limits.tagged, false);
  assert.match(why.points[2].text, /gpt-5\.4-mini, programs over the catalogue got 56 of 80 right, and over the tuned catalogue 49\./);
  assert.match(limits.points[0].text, /gpt-6-luna accuracy ties: the smallest p-value against the code surface is 0\.12\./);
  assert.match(limits.points[1].text, /within 18% of the code surface on the unplanned tasks/);
  assert.match(limits.points[2].text, /One mock estate of 194 resources, eight tasks, ten runs each\./);
  assert.match(limits.points[3].text, /single narrow lookup .* about 0\.6\u00d7 the tokens/);
  assert.match(limits.points[4].text, /not an invoice/);
});

test('results: every row is a bar for the cell it names, one row on each plane is the cheapest, and a method that did not run says so', () => {
  for (const { model, set } of RESTS) {
    const v = set === 'preset' ? buildResults(model) : buildResults('unplanned', model);
    const t = v.table!;
    assert.equal(t.model, model);
    assert.equal(t.set, set);
    assert.equal(t.deployment, modelOf(model).deployment);
    assert.equal(t.price, priceLine(model));
    assert.deepEqual(t.groups.map((g) => g.id), ['catalogue', 'tuned', 'code']);
    const rows = t.groups.flatMap((g) => g.rows);
    assert.deepEqual(rows.map((r) => r.id), EIGHT, 'the rows are the same in the same order on every model, so the bars can be compared');
    assert.equal(rows.filter((r) => r.cheapest).length, 1, `${set} ${model}: one cheapest`);
    assert.equal(rows.find((r) => r.cheapest)!.id, cheapestRun(set, model).id);
    assert.equal(t.groups[2].rows.length, 1, 'the code surface is a group of its own');
    for (const r of rows) {
      const c = cellIn(set, model, r.id);
      assert.equal(r.ran, Boolean(c), `${set} ${model} ${r.id}`);
      assert.equal(r.isCode, r.id === CODE);
      assert.ok(r.label.length <= 24, `${r.label}: the label column is narrow`);
      if (!c) {
        assert.equal(r.usd, '\u2013');
        assert.equal(r.fill, 0);
        assert.match(r.aria, /not run on gpt-5\.4-mini, which does not offer hosted programmatic calling$/);
        continue;
      }
      assert.equal(r.correct, c.correct);
      assert.equal(r.runs, 40);
      assert.equal(r.fill, c.correct / c.runs);
      assert.equal(r.usd, fmtUsd(perThousandRuns(c)));
      assert.equal(r.usdValue, perThousandRuns(c));
      assert.match(r.aria, new RegExp(`${c.correct} of 40 right, ${r.usd.replace('$', '\\$')} per 1,000 runs$`));
    }
  }
  assert.deepEqual(buildResults('older').table!.groups.flatMap((g) => g.rows).filter((r) => !r.ran).map((r) => r.id), ['naive-ptc-native', 'tuned-ptc-native']);
});

test('plane: the scales are the benchmark\'s, every cell has a place inside the frame, and the interval is the Wilson interval', () => {
  const [lo, hi] = wilson(40, 40);
  assert.ok(Math.abs(lo - 0.9124) < 1e-4 && hi === 1, `40 of 40 is 91% to 100%, not a certainty: ${lo}`);
  const [l2, h2] = wilson(21, 40);
  assert.ok(Math.abs(l2 - 0.375) < 1e-3 && Math.abs(h2 - 0.6706) < 1e-3, `21 of 40: ${l2} to ${h2}`);
  assert.deepEqual(wilson(0, 0), [0, 1], 'no runs, no knowledge');
  assert.ok(wilson(30, 40)[0] < 0.75 && wilson(30, 40)[1] > 0.75, 'the point is inside its interval');
  // The frame: a log axis of dollars per 1,000 runs and a linear one of the share right, fixed for every model and both sets.
  assert.equal(xOf(X_LO), PLOT.x0);
  assert.equal(xOf(X_HI), PLOT.x1);
  assert.equal(yOf(Y_MIN), PLOT.y1);
  assert.equal(yOf(Y_MAX), PLOT.y0);
  assert.ok(Math.abs(xOf(2) - xOf(1) - (xOf(4) - xOf(2))) < 1e-9, 'a log axis: each doubling is the same distance');
  assert.ok(X_TICKS.length >= 4 && X_TICKS.every((t) => t >= X_LO && t <= X_HI));
  assert.ok(Y_TICKS.every((t) => t >= Y_MIN - 1e-9 && t <= 1 + 1e-9) && Y_TICKS[Y_TICKS.length - 1] === 1);
  assert.equal(fmtTick(0.2), '$0.2');
  assert.equal(fmtTick(10), '$10');
  let cells = 0;
  for (const set of SET_KEYS) {
    for (const m of MODEL_KEYS) {
      for (const a of ARMS) {
        const p = poseOf(set, m, a.id);
        assert.equal(p !== null, Boolean(cellIn(set, m, a.id)), `${set} ${m} ${a.id}`);
        if (!p) continue;
        cells += 1;
        assert.ok(p.x >= PLOT.x0 && p.x <= PLOT.x1 && p.y >= PLOT.y0 && p.y <= PLOT.y1, `${set} ${m} ${a.id} is on the plane`);
        assert.ok(p.top <= p.y && p.y <= p.bottom, `${set} ${m} ${a.id}: the interval brackets the point`);
      }
    }
  }
  assert.equal(cells, 2 * (6 + 8 + 8), 'six methods on the older model, eight on each of the others, on both sets');
  // The better the model, the further left the code surface sits: the price per token fell.
  const codeXs = MODEL_KEYS.map((m) => poseOf('preset', m, CODE)!.x);
  assert.ok(codeXs[0] > codeXs[1] && codeXs[1] > codeXs[2], 'older to newest, it moves left');
});

test('plane: a marker glides between the places it was measured, a method that arrives later fades in, and the trail is where it has been', () => {
  const near = (p: Marker, q: Marker | null, why: string) => {
    assert.ok(q, why);
    for (const k of ['x', 'y', 'top', 'bottom'] as const) assert.ok(Math.abs(p[k] - q![k]) < 1e-9, `${why}: ${k}`);
  };
  for (const a of ARMS) {
    for (const [t, m] of MODEL_KEYS.entries()) {
      for (const [s, set] of SET_KEYS.entries()) {
        if (!cellIn('preset', m, a.id)) continue;
        near(markerAt(a.id, t, s), poseOf(set, m, a.id), `${a.id} at rest on ${m}, ${set}`);
      }
    }
  }
  // Halfway between two models is halfway between their places, on a straight line, so any state glides to any other.
  const a = poseOf('preset', 'older', CODE)!;
  const b = poseOf('preset', 'newer', CODE)!;
  const mid = markerAt(CODE, 0.5, 0);
  assert.ok(Math.abs(mid.x - (a.x + b.x) / 2) < 1e-9 && Math.abs(mid.y - (a.y + b.y) / 2) < 1e-9);
  near(mixMarker(a, b, 0), a, 'a mix of none is the first');
  near(mixMarker(a, b, 1), b, 'a mix of all is the second');
  // The hosted methods ran from the newer model on: before it they wait where they will arrive, invisible, and fade in on the way.
  for (const id of ['naive-ptc-native', 'tuned-ptc-native'] as const) {
    assert.equal(presence(id, 0), 0, `${id} is not there on the older model`);
    assert.equal(presence(id, 0.5), 0.5);
    assert.equal(presence(id, 1), 1);
    assert.equal(presence(id, 2), 1);
    near(markerAt(id, 0, 0), poseOf('preset', 'newer', id), `${id} waits where it will first appear`);
  }
  assert.equal(presence(CODE, 0), 1, 'the six that ran everywhere are always there');
  // The trail: the places it has been, with no dot where it stands.
  const standing = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 0.5;
  const t0 = trailOf(CODE, 0, 0);
  assert.equal(t0.ghosts.length, 0, 'at the start it has been nowhere else');
  assert.equal(t0.journey.length, 1);
  const t2 = trailOf(CODE, 2, 0);
  assert.equal(t2.journey.length, 3, 'one point for each model it has stood on');
  assert.equal(t2.ghosts.length, 2, 'two of them are places it has left');
  assert.ok(t2.ghosts.every((g) => !standing(g, markerAt(CODE, 2, 0))));
  const across = trailOf(CODE, 2, 1);
  assert.equal(across.across.length, 2);
  assert.ok(standing(across.across[1], markerAt(CODE, 2, 1)), 'the way across ends at the head');
  assert.ok(across.ghosts.every((g) => !standing(g, markerAt(CODE, 2, 1))));
  const hosted = trailOf('naive-ptc-native', 1, 0);
  assert.equal(hosted.journey.length, 1, 'a hosted method has been on one model so far');
});

test('plane: every resting place names the code surface and the cheapest, and no name runs into a marker, another name or the frame', () => {
  assert.equal(RESTS.length, 6, 'three models, two sets');
  for (const { model, set } of RESTS) {
    const named = namedArms(set, model);
    assert.equal(named[0].arm, CODE);
    assert.equal(named.length, cheapestRun(set, model).id === CODE ? 1 : 2, `${set} ${model}: the cheapest is named when it is not the code surface`);
    const labels = labelsFor(set, model);
    assert.deepEqual(labels.map((l) => l.arm), named.map((n) => n.arm));
    for (const l of labels) assert.equal(l.text.endsWith('cheapest'), l.kind === 'cheapest');
    assert.equal(labelClashes(set, model), 0, `${set} ${model}: a name is in the clear`);
  }
  assert.ok(textWidth('Code surface') > 60 && textWidth('Code surface') < 120);
});

test('the tour is eight screens and the workshop eleven, every screen either names is a page, and every page links only to pages', () => {
  const routes = new URL('../src/routes/tour/', import.meta.url);
  const pages = readdirSync(routes, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(new URL(`${d.name}/+page.svelte`, routes))).map((d) => `/tour/${d.name}`);
  const steps = SCREENS.map((s) => s.href);
  assert.deepEqual(steps, ['/tour/estate', '/tour/tools', '/tour/strains', '/tour/language', '/tour/object', '/tour/code', '/tour/guard', '/tour/results']);
  const workshop = WORKSHOP_SCREENS.map((s) => s.href);
  assert.deepEqual([...pages].sort(), [...workshop].sort(), 'no page is missing from the workshop, and no workshop step is missing a page');
  for (const d of pages) {
    const src = readFileSync(new URL(`../src${d.replace('/tour', '/routes/tour')}/+page.svelte`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/href: '(\/tour\/[a-z]+)[?']/g)) assert.ok(pages.includes(m[1]), `${d} links to ${m[1]}`);
  }
  const results = readFileSync(new URL('../src/lib/tour/results.ts', import.meta.url), 'utf8');
  assert.ok(!/href: '\/tour\/(?!results)/.test(results), 'the results module does not link out');
  const guard = readFileSync(new URL('../src/lib/tour/guard.ts', import.meta.url), 'utf8');
  assert.ok(!/href: '\/tour\/(?!guard)/.test(guard), 'the guard module does not link out');
});

// ── presenter mode ───────────────────────────────────────────────────────────

test('presenter: the screens are one list, and from any screen the one before and the one after are found', () => {
  assert.deepEqual(SCREENS.map((s) => s.id), ['estate', 'tools', 'strains', 'language', 'object', 'code', 'guard', 'results']);
  assert.equal(screenIndexOf('/tour/code'), 5);
  assert.equal(screenIndexOf('/tour/code/'), 5);
  assert.equal(screenIndexOf('/tour/guard'), 6);
  assert.equal(screenIndexOf('/tour/results'), 7);
  assert.equal(screenIndexOf('/tour'), -1);
  assert.equal(screenIndexOf('/tour/codex'), -1, 'a path that only starts like a screen is not that screen');
  assert.equal(screenIndexOf('/'), -1);
  // Going on arrives at the first beat of the next screen; going back arrives at the last beat of the one before.
  assert.deepEqual(crossTo('/tour/tools', 1), { screen: SCREENS[2], href: '/tour/strains' });
  assert.deepEqual(crossTo('/tour/strains', -1), { screen: SCREENS[1], href: SCREENS[1].end });
  assert.deepEqual(crossTo('/tour/code', 1), { screen: SCREENS[6], href: '/tour/guard' });
  assert.deepEqual(crossTo('/tour/results', -1), { screen: SCREENS[6], href: SCREENS[6].end }, 'back from the results is the last beat of the guard rails');
  assert.equal(crossTo('/tour/estate', -1), null, 'the talk has a first screen');
  assert.equal(crossTo('/tour/results', 1), null, 'and a last');
  assert.equal(crossTo('/tour', 1), null);
});

test('presenter: the address a screen is entered at from behind is that screen\u2019s last beat', () => {
  const inv = buildInventory();
  const at = (i: number) => new URL(SCREENS[i].end, 'http://tour.test');
  const page = (id: string) => readFileSync(new URL(`../src/routes/tour/${id}/+page.svelte`, import.meta.url), 'utf8');

  // The estate: the colourings, and then the whole of it as the model is handed it.
  assert.equal(at(0).searchParams.get('lens'), 'context');
  assert.match(page('estate'), /const MODES: Mode\[\] = \[\.\.\.LENS_ORDER, 'context'\];/, 'context is the last of the estate\u2019s steps');
  // The replay has no fixed length, so its address says "far enough" and the screen clamps it. Far enough is further than any of them.
  const longest = Math.max(
    ...TASK_ORDER.flatMap((task) => CATALOG_ROUTES[task].flatMap((r) => [undefined, 10, 1].map((batchSize) => lastFrame(replayCatalog({ task, route: r.id, batchSize }))))),
  );
  assert.ok(Number(at(1).searchParams.get('step')) > longest, `the longest replay ends at frame ${longest}`);
  // Where it strains: the last beat.
  assert.equal(Number(at(2).searchParams.get('at')), buildBeats(buildStrains(inv, buildToolRungs(inv))).length - 1);
  // The language: the last rung is the code.
  assert.equal(at(3).searchParams.get('rung'), 'code');
  assert.match(page('language'), /\[\.\.\.RUNG_IDS\.filter\(\(id\) => id !== 'code'\), 'grow', 'limits', 'code'\]/, 'the code rung comes last');
  // The object, the code surface, the guard rails and the results: the last step, the last beat of the last example, the last beat, the last beat.
  assert.equal(Number(at(4).searchParams.get('step')), LAST_STEP);
  const lastExample = exampleBeats().at(-1)!;
  assert.deepEqual(parseExampleState(at(5).searchParams), { id: lastExample.id, step: lastExample.step });
  assert.equal(Number(at(5).searchParams.get('step')), lastExample.step, 'spelled out, so the address is not odd to look at');
  assert.equal(Number(at(6).searchParams.get('at')), GUARD_BEATS.length - 1);
  assert.equal(at(6).href, new URL(GUARD_PANELS.at(-1)!.href, 'http://tour.test').href, 'the guard rails end on their last panel');
  assert.equal(parseResultsBeat(at(7).searchParams), RESULTS_BEATS.at(-1)!.id);
});

test('presenter keys: arrows, Page and Space step, Shift jumps a group, Home and End go to the ends', () => {
  const key = (k: string, mods: Record<string, boolean> = {}) => beatActionFor({ key: k, ...mods });
  assert.equal(key('ArrowRight'), 'next');
  assert.equal(key('PageDown'), 'next');
  assert.equal(key(' '), 'next');
  assert.equal(key('ArrowLeft'), 'back');
  assert.equal(key('PageUp'), 'back');
  assert.equal(key(' ', { shiftKey: true }), 'back');
  assert.equal(key('ArrowRight', { shiftKey: true }), 'group-next');
  assert.equal(key('ArrowLeft', { shiftKey: true }), 'group-back');
  assert.equal(key('Home'), 'first');
  assert.equal(key('End'), 'last');
  for (const mod of ['metaKey', 'ctrlKey', 'altKey']) assert.equal(key('ArrowRight', { [mod]: true }), null, `${mod} and an arrow is not a step`);
  assert.equal(key('ArrowDown'), null, 'up and down are left to scrolling');
  assert.equal(key('a'), null);
});

test('presenter keys: stepping past an end crosses to the next screen; a group is a run of steps with one name', () => {
  const groups = ['a', 'a', 'a', 'b', 'b', 'c'];
  const move = (action: BeatAction, at: number, g: readonly string[] = groups) => moveFor(action, at, g);
  assert.deepEqual(move('next', 0), { to: 1 });
  assert.deepEqual(move('next', 5), { cross: 1 });
  assert.deepEqual(move('back', 3), { to: 2 });
  assert.deepEqual(move('back', 0), { cross: -1 });
  assert.deepEqual(move('first', 4), { to: 0 });
  assert.equal(move('first', 0), null, 'Home on the first step has nowhere to go');
  assert.deepEqual(move('last', 1), { to: 5 });
  assert.equal(move('last', 5), null);
  // Shift and right: the first step of the next group, from anywhere in this one.
  assert.deepEqual(move('group-next', 0), { to: 3 });
  assert.deepEqual(move('group-next', 2), { to: 3 });
  assert.deepEqual(move('group-next', 3), { to: 5 });
  assert.deepEqual(move('group-next', 5), { cross: 1 }, 'past the last group is the next screen');
  // Shift and left: the start of this group, and from the start, the start of the one before.
  assert.deepEqual(move('group-back', 2), { to: 0 });
  assert.deepEqual(move('group-back', 4), { to: 3 });
  assert.deepEqual(move('group-back', 3), { to: 0 });
  assert.deepEqual(move('group-back', 5), { to: 3 });
  assert.deepEqual(move('group-back', 0), { cross: -1 });
  // One group is the whole screen; a name used twice with something between is two groups.
  assert.deepEqual(move('group-next', 1, ['x', 'x', 'x']), { cross: 1 });
  assert.deepEqual(move('group-next', 0, ['a', 'b', 'a']), { to: 1 });
  assert.deepEqual(move('group-next', 1, ['a', 'b', 'a']), { to: 2 });
  assert.deepEqual(move('group-back', 2, ['a', 'b', 'a']), { to: 1 });
  // However it goes, it ends on a step that exists.
  for (const action of ['next', 'back', 'group-next', 'group-back', 'first', 'last'] as const) {
    for (let at = 0; at < groups.length; at += 1) {
      const m = move(action, at);
      if (m && 'to' in m) assert.ok(m.to >= 0 && m.to < groups.length && m.to !== at, `${action} from ${at} goes to ${m.to}`);
    }
  }
});

test('presenter keys: screens are Option or Alt with an arrow, Command or Control with Shift and an arrow, or the brackets', () => {
  const key = (k: string, mods: Record<string, boolean> = {}) => globalActionFor({ key: k, ...mods });
  assert.deepEqual(key('ArrowRight', { altKey: true }), { screen: 1 });
  assert.deepEqual(key('ArrowLeft', { altKey: true }), { screen: -1 });
  assert.deepEqual(key('ArrowRight', { metaKey: true, shiftKey: true }), { screen: 1 });
  assert.deepEqual(key('ArrowLeft', { ctrlKey: true, shiftKey: true }), { screen: -1 });
  assert.equal(key('ArrowRight', { metaKey: true }), null, 'Command and an arrow is the browser\u2019s history');
  assert.equal(key('ArrowRight'), null, 'a plain arrow is the screen\u2019s own');
  assert.equal(key('ArrowRight', { shiftKey: true }), null, 'Shift and an arrow is a jump of groups, on the screen');
  assert.equal(key('ArrowRight', { altKey: true, metaKey: true }), null);
  assert.deepEqual(key(']'), { screen: 1 });
  assert.deepEqual(key('['), { screen: -1 });
  assert.equal(key('p'), 'present');
  assert.equal(key('P', { shiftKey: true }), 'present');
  assert.equal(key('h'), 'help');
  assert.equal(key('?', { shiftKey: true }), 'help');
  assert.equal(key('f'), 'fullscreen');
  assert.equal(key('Escape'), 'close');
  assert.equal(key('p', { metaKey: true }), null, 'Command P is the browser\u2019s');
  assert.equal(key('f', { ctrlKey: true }), null);
  assert.equal(key('x'), null);
});

test('presenter keys: a key typed into a field belongs to the field', () => {
  assert.equal(typingIn({ tagName: 'TEXTAREA' }), true);
  assert.equal(typingIn({ tagName: 'INPUT' }), true);
  assert.equal(typingIn({ tagName: 'SELECT' }), true);
  assert.equal(typingIn({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(typingIn({ tagName: 'BUTTON' }), false);
  assert.equal(typingIn({ tagName: 'BODY' }), false);
  assert.equal(typingIn(null), false);
});

test('presenter mode: a link\u2019s own say-so comes first, then what was remembered, and reading when neither says', () => {
  assert.equal(parseMode('present'), 'present');
  assert.equal(parseMode('read'), 'read');
  assert.equal(parseMode('PRESENT'), null);
  assert.equal(parseMode(''), null);
  assert.equal(parseMode(null), null);
  assert.equal(modeOf(null, null), 'read');
  assert.equal(modeOf(null, 'present'), 'present');
  assert.equal(modeOf('read', 'present'), 'read', 'a link can turn it off');
  assert.equal(modeOf('present', 'read'), 'present', 'and on');
  assert.equal(modeOf('nonsense', 'present'), 'present', 'what is not a mode is not said');
  assert.equal(modeOf(undefined, 'nonsense'), 'read');
});

test('presenter mode: every screen takes part in the keys, and hides its Back and Next row under one class', () => {
  for (const s of WORKSHOP_SCREENS) {
    const src = readFileSync(new URL(`../src/routes/tour/${s.id}/+page.svelte`, import.meta.url), 'utf8');
    assert.ok(src.includes('<BeatNav') || src.includes('<BeatKeys'), `${s.id} has no step keys and does not tell the rail how far along it is`);
    if (src.includes('<BeatNav')) assert.match(src, /<div class="nav">\s*<BeatNav/, `${s.id}: the BeatNav row must be .nav, the one class presenter mode hides`);
  }
  const nav = readFileSync(new URL('../src/lib/components/tour/TourNav.svelte', import.meta.url), 'utf8');
  assert.match(nav, /<nav class="nav"/, 'the Back and Next pair is .nav too');
  const css = readFileSync(new URL('../src/lib/components/tour/tour.css', import.meta.url), 'utf8');
  assert.match(css, /\.tour\.present \.nav\s*\{\s*display: none !important;/, 'presenter mode hides every .nav');
  assert.match(css, /\.tour\.present\s*\{[^}]*--tour-top: 0px;/, 'and gives the step bar\u2019s height back');
  // The screen names that only orient a reader ("③ Where it strains") go too: the rail says where we are, and ③ needs the room at 820.
  assert.match(css, /\.tour\.present \.t-chrome\s*\{\s*display: none;/, 'presenter mode hides what only orients a reader');
  for (const [id, name] of [['strains', '③ Where it strains'], ['language', '④ A catalogue that grows a language']] as const) {
    const src = readFileSync(new URL(`../src/routes/tour/${id}/+page.svelte`, import.meta.url), 'utf8');
    assert.match(src, new RegExp(`<p class="t-kicker t-chrome">\\s*${name}`), `${id}: the screen name is the one kicker presenter mode hides`);
  }
});

test('examples: each beat names its example as its group, so Shift and an arrow jump from one example to the next', () => {
  const beats = exampleBeats();
  assert.ok(beats.every((b) => b.group === b.id));
  assert.deepEqual([...new Set(beats.map((b) => b.group))], EXAMPLES.map((e) => e.id));
  const groups = beats.map((b) => b.group);
  // From the middle of the tagging example, one jump forward is the first beat of the disks, and one back is the first of the tagging.
  const tagStep = beats.findIndex((b) => b.id === 'tag' && b.step === 2);
  assert.deepEqual(moveFor('group-next', tagStep, groups), { to: beats.findIndex((b) => b.id === 'disks' && b.step === 0) });
  assert.deepEqual(moveFor('group-back', tagStep, groups), { to: beats.findIndex((b) => b.id === 'tag' && b.step === 0) });
});

// ── the workshop ─────────────────────────────────────────────────────────────

const text = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const at = (href: string) => new URL(href, 'http://workshop.test');

test('workshop: the eight keep their numbers and their order, three screens go around them, and the three take no number', () => {
  assert.deepEqual(WORKSHOP_SCREENS.map((s) => s.id), ['welcome', 'estate', 'tools', 'strains', 'language', 'object', 'code', 'guard', 'turn', 'results', 'wrap']);
  assert.deepEqual(WORKSHOP_SCREENS.filter((s) => s.n !== undefined).map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(WORKSHOP_SCREENS.filter((s) => s.n === undefined).map((s) => s.id), [...WORKSHOP_ONLY]);
  assert.ok(WORKSHOP_SCREENS.every((s) => (s.n === undefined) === (s.mark !== undefined)), 'a screen without a number has a mark to draw in its place');
  assert.equal(screensOf('tour'), SCREENS);
  assert.equal(screensOf('workshop'), WORKSHOP_SCREENS);
  assert.ok(!SCREENS.some((s) => WORKSHOP_ONLY.includes(s.id)), 'the tour does not have them');
});

test('workshop: only the three screens the tour does not have put a visitor in the workshop', () => {
  for (const id of WORKSHOP_ONLY) {
    assert.equal(isWorkshopPath(`/tour/${id}`), true, id);
    assert.equal(isWorkshopPath(`/tour/${id}/`), true, id);
  }
  for (const s of SCREENS) assert.equal(isWorkshopPath(s.href), false, `${s.id} is in both`);
  assert.equal(isWorkshopPath('/tour/welcomed'), false, 'a path that only starts like a screen is not that screen');
  assert.equal(isWorkshopPath('/tour'), false);
  assert.equal(isWorkshopPath('/'), false);
});

test('workshop: the screen before and the one after come from the list the visitor walks', () => {
  const turn = WORKSHOP_SCREENS.find((s) => s.id === 'turn')!;
  const guard = WORKSHOP_SCREENS.find((s) => s.id === 'guard')!;
  assert.deepEqual(crossTo('/tour/code', 1, WORKSHOP_SCREENS), { screen: guard, href: '/tour/guard' }, 'the room has seen the programs before it sees the gates');
  assert.deepEqual(crossTo('/tour/guard', 1, WORKSHOP_SCREENS), { screen: turn, href: '/tour/turn' }, 'and has the keyboard once it has seen the gates');
  assert.deepEqual(crossTo('/tour/turn', -1, WORKSHOP_SCREENS), { screen: guard, href: guard.end });
  assert.equal(crossTo('/tour/guard', 1)?.screen.id, 'results', 'the tour goes from the guard rails straight to the results');
  assert.deepEqual(crossTo('/tour/results', -1, WORKSHOP_SCREENS), { screen: turn, href: turn.end }, 'back from the results is the last of the exercises');
  assert.equal(crossTo('/tour/estate', -1, WORKSHOP_SCREENS)?.screen.id, 'welcome');
  assert.equal(crossTo('/tour/welcome', -1, WORKSHOP_SCREENS), null, 'the workshop starts at the welcome');
  assert.equal(crossTo('/tour/wrap', 1, WORKSHOP_SCREENS), null, 'and ends with the questions');
  assert.equal(screenIndexOf('/tour/welcome'), -1, 'the tour has no welcome');
  assert.equal(screenIndexOf('/tour/welcome', WORKSHOP_SCREENS), 0);
  assert.equal(screenIndexOf('/tour/code', WORKSHOP_SCREENS), 6);
  assert.equal(screenIndexOf('/tour/guard', WORKSHOP_SCREENS), 7);
  assert.equal(screenIndexOf('/tour/results', WORKSHOP_SCREENS), 9);
});

test('workshop: the address each new screen is entered at from behind is its real last beat', () => {
  const end = (id: string) => at(WORKSHOP_SCREENS.find((s) => s.id === id)!.end);
  assert.equal(Number(end('welcome').searchParams.get('at')), WELCOME_BEATS.length - 1);
  assert.equal(end('welcome').href, at(WELCOME_BEATS.at(-1)!.href).href);
  assert.equal(Number(end('wrap').searchParams.get('at')), WRAP_BEATS.length - 1);
  assert.equal(end('wrap').href, at(WRAP_BEATS.at(-1)!.href).href);
  const beats = turnBeats({ filter: 'A filter', field: 'A field', rule: 'A rule' });
  assert.equal(end('turn').href, at(beats.at(-1)!.href).href);
  assert.deepEqual(parseTurn(end('turn').searchParams), { id: 'rule', step: 1 });
});

test('workshop format: a link\u2019s own say-so comes first, then what was remembered, and the tour when neither says', () => {
  assert.equal(parseFormat('workshop'), 'workshop');
  assert.equal(parseFormat('tour'), 'tour');
  assert.equal(parseFormat('WORKSHOP'), null);
  assert.equal(parseFormat(''), null);
  assert.equal(parseFormat(null), null);
  assert.equal(formatOf(null, null), 'tour');
  assert.equal(formatOf(null, 'workshop'), 'workshop');
  assert.equal(formatOf('tour', 'workshop'), 'tour', 'a link can turn it off');
  assert.equal(formatOf('workshop', 'tour'), 'workshop', 'and on');
  assert.equal(formatOf('nonsense', 'workshop'), 'workshop', 'what is not a format is not said');
  assert.equal(formatOf(undefined, 'nonsense'), 'tour');
  assert.equal(FORMAT_COOKIE, 'tour-format');
});

test('workshop: /workshop opens the welcome, presented, in the workshop format', () => {
  const route = text('src/routes/workshop/+page.ts');
  const target = route.match(/redirect\(307, '([^']+)'\)/)?.[1];
  assert.ok(target, 'the route redirects');
  const url = at(target!);
  assert.equal(url.pathname, '/tour/welcome');
  assert.equal(parseMode(url.searchParams.get('mode')), 'present');
  assert.equal(parseFormat(url.searchParams.get('format')), 'workshop');
  assert.equal(isWorkshopPath(url.pathname), true);
});

test('the plan: ninety minutes from the first screen to the last, the last twenty for questions, in the order the workshop walks', () => {
  assert.deepEqual(PLAN_SCREENS, WORKSHOP_IDS);
  let minute = 0;
  for (const b of BLOCKS) {
    assert.equal(b.from, minute, `${b.screen} starts where the one before ends`);
    assert.ok(minutesOf(b) > 0, `${b.screen} has time`);
    minute = b.to;
  }
  assert.equal(minute, TOTAL_MINUTES);
  assert.equal(BLOCKS.reduce((n, b) => n + minutesOf(b), 0), TOTAL_MINUTES);
  assert.equal(TOTAL_MINUTES, 90);
  assert.equal(QUESTION_MINUTES, 20);
  assert.equal(QUESTIONS_FROM, 70);
  assert.deepEqual(BLOCKS.filter((b) => b.to > QUESTIONS_FROM).map((b) => b.screen), ['wrap'], 'the questions are on the last screen alone');
  assert.equal(BLOCKS.at(-1)!.to - QUESTIONS_FROM, QUESTION_MINUTES);
  assert.equal(rangeOf(blockOf('tools')!), '8\u201319 min');
  assert.deepEqual(BLOCKS.map((b) => minutesOf(b)), [3, 5, 11, 7, 7, 7, 8, 8, 6, 6, 22], 'the minutes of each block, the last one with the questions in it');
  assert.equal(blockOf('nowhere'), null);
  assert.ok(BLOCKS.every((b) => b.gist.length > 0 && b.title.length > 0));
});

test('the plan: what the room is asked, and the numbers the agenda quotes, are the ones the screens show', () => {
  const inv = buildInventory();
  const n = inv.resources.length;
  assert.equal(n, 194);
  assert.match(blockOf('estate')!.gist, new RegExp(`^${n} resources, wired together\\. One question needs ${needleFor('granular-read', inv).resourceIds.size} of them\\.$`));
  assert.match(blockOf('estate')!.ask!, new RegExp(`How many of the ${n} records`));
  const tools = replayCatalog({ task: 'granular-read' });
  assert.match(blockOf('tools')!.ask!, new RegExp(`The answer is ${tools.turns.at(-1)!.completionTokens} tokens\\.`));
  assert.match(blockOf('language')!.ask!, new RegExp(`^Four questions nobody planned for`));
  assert.equal(FRESH_QUESTIONS.length, 4);
  assert.match(blockOf('object')!.ask!, new RegExp(`reads all ${n} records`));
  assert.equal(run(programs['filter-aggregate'].code).totals.resourcesScanned, n, 'the program does read every record');
  assert.equal(EXAMPLES.filter((e) => e.kind === 'fresh').length, 2, 'two questions nobody planned for on the code screen');
  assert.match(blockOf('code')!.gist, /two questions nobody planned for/);
  assert.match(blockOf('results')!.gist, /^Three models, eight tasks: what holds as the model gets weaker/);
  assert.equal(MODELS.length, 3);
  assert.equal(METHODS.length, 6);
  assert.ok(MODELS.every((m) => METHODS.every((x) => cellOf(m.key, x.id).runs === 80)));
  const older = [setCell('preset', 'older', CODE), othersOn('preset', 'older').correct.max] as const;
  assert.match(blockOf('results')!.ask!, new RegExp(`On the older model the code surface gets ${older[0].correct} of ${older[0].runs}\\. Of the other five methods, how many of ${older[0].runs} does the best one get\\?`));
  assert.equal(older[1], 30, 'the answer the room is asked for');
  assert.match(blockOf('guard')!.gist, new RegExp(`^${['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][GATES.length]} gates`), 'the plan says as many gates as the screen has');
  assert.match(blockOf('guard')!.ask!, /stop the three most expensive running VMs/);
  assert.ok(blockOf('guard')!.ask!.includes(`"${PRODUCTION_RULE.text}"`), 'the room is asked about the rule the screen shows, in its words');
  assert.equal(PLAN_SCREENS.filter((id) => blockOf(id)!.ask).length, 10, 'ten blocks ask the room something, and the last one is the questions');
});

test('the welcome: three beats, three outcomes in the three ways a talk can leave someone better off, and how the room is asked to work', () => {
  assert.deepEqual(WELCOME_BEATS.map((b) => b.href), ['/tour/welcome', '/tour/welcome?at=1', '/tour/welcome?at=2']);
  assert.deepEqual(OUTCOMES.map((o) => o.verb), ['Understand', 'Try', 'Judge']);
  assert.ok(OUTCOMES.every((o) => !/[!]/.test(o.text)));
  assert.equal(HOW.length, 4);
  assert.match(HOW[1].text, new RegExp(`last ${QUESTION_MINUTES} minutes`));
  assert.match(HOW.map((h) => h.text).join(' '), /github\.com\/NickSmet\/code-surface-benchmark/);
  assert.match(HOW.map((h) => h.text).join(' '), /\/workshop/);
  // A screen of panels: one lit per beat, and an address that is not a beat is the first.
  assert.equal(parseAt(new URLSearchParams(''), 3), 0);
  assert.equal(parseAt(new URLSearchParams('at=2'), 3), 2);
  assert.equal(parseAt(new URLSearchParams('at=9'), 3), 2);
  assert.equal(parseAt(new URLSearchParams('at=-4'), 3), 0);
  assert.equal(parseAt(new URLSearchParams('at=1.5'), 3), 0);
  assert.equal(parseAt(new URLSearchParams('at=x'), 3), 0);
  assert.deepEqual(panelBeats('/tour/x', ['a', 'b']), [{ href: '/tour/x', caption: 'a' }, { href: '/tour/x?at=1', caption: 'b' }]);
  assert.deepEqual(WRAP_BEATS.map((b) => b.href), ['/tour/wrap', '/tour/wrap?at=1', '/tour/wrap?at=2']);
});

// ── your turn ────────────────────────────────────────────────────────────────

const exercises = (): Exercise[] => exercisesOf({ programs, ratio: FRESH_QUESTIONS.find((q) => q.id === 'ratio')!.code });
const exercise = (id: string): Exercise => exercises().find((e) => e.id === id)!;
const runEx = (e: Exercise, code: string) => run(code, e.base.rationale);
const tilesOf = (e: Exercise, code: string): string[] => e.tiles(runEx(e, code)).map((t) => t.value);
const round2 = (x: number): number => Math.round(x * 100) / 100;

test('your turn: every change is the base program with one place swapped, and each place is found exactly once', () => {
  const all = exercises();
  assert.deepEqual(all.map((e) => e.id), [...EXERCISE_IDS]);
  for (const e of all) {
    assert.ok(e.changes.length >= 2, `${e.id}: the change the room is asked for, and something to try after it`);
    assert.equal(new Set(e.changes.map((c) => c.id)).size, e.changes.length);
    assert.equal(new Set(e.changes.map((c) => c.label)).size, e.changes.length);
    assert.ok(e.predict.endsWith('?'), `${e.id}: the room is asked a question`);
    for (const code of [e.base.code, ...e.changes.map((c) => c.code)]) {
      assert.ok(!code.split('\n').some((l) => l.trim() === ''), `${e.id}: a blank line is drawn as a line of nothing, so the programs have none`);
      assert.match(code, /function main\(/);
    }
    for (const c of e.changes) assert.notEqual(c.code, e.base.code, `${e.id}/${c.id} changes something`);
  }
  assert.equal(swap('a b c', 'b', 'x'), 'a x c');
  assert.throws(() => swap('a b c', 'x', 'y'), /no longer the one/);
  assert.throws(() => swap('a a', 'a', 'b'), /no longer the one/);
  assert.equal(compact('a\n\n  \nb\n'), 'a\nb');
  // The bases are the benchmark's own programs and the tour's, with nothing but blank lines left out.
  assert.equal(exercise('filter').base.code, compact(programs['filter-aggregate'].code));
  assert.equal(exercise('rule').base.code, compact(programs['bulk-write'].code));
  assert.equal(exercise('rule').base.rationale, programs['bulk-write'].rationale);
  assert.equal(exercise('field').base.code, FRESH_QUESTIONS.find((q) => q.id === 'ratio')!.code);
});

test('your turn, a filter: West Europe takes platform-prod out, and the runtime still scans every record', () => {
  const inv = buildInventory();
  const e = exercise('filter');
  const prod = inv.subscriptions.find((s) => s.name === 'Production')!;
  const vms = inv.resources.filter((r): r is VirtualMachine => r.type === 'virtualMachine' && r.subscriptionId === prod.id && r.powerState === 'running');
  const total = (rows: VirtualMachine[]) => round2(rows.reduce((n, r) => n + r.costMonthly, 0));
  const money = (x: number) => `$${x.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const base = runEx(e, e.base.code);
  assert.deepEqual(groupsOf(base).sort(), ['data-prod', 'platform-prod', 'web-prod']);
  assert.deepEqual(tilesOf(e, e.base.code), ['3', money(total(vms)), '194', `\u2248 ${backToModelTokens(base)}`]);
  assert.equal(money(total(vms)), '$5,461.22', 'the number the strip opens on');

  const west = vms.filter((r) => r.location === 'westeurope');
  const ref = runEx(e, e.changes[0].code);
  assert.deepEqual(groupsOf(ref).sort(), ['data-prod', 'web-prod']);
  assert.deepEqual(tilesOf(e, e.changes[0].code), ['2', money(total(west)), '194', `\u2248 ${backToModelTokens(ref)}`]);
  assert.equal(money(total(west)), '$4,772.91');
  assert.ok(backToModelTokens(ref) < backToModelTokens(base), 'a smaller answer is a smaller bill');
  assert.equal(ref.totals.resourcesScanned, base.totals.resourcesScanned, 'a filter changes what is kept, not what is read');
  assert.match(e.says(base, ref), /^platform-prod drops out, and the total goes from \$5,461\.22 to \$4,772\.91\. The runtime still scans all 194 records/);

  const stopped = runEx(e, e.changes[1].code);
  assert.equal(stopped.status, 'ok');
  assert.match(e.says(base, stopped), /^data-prod drops out, and the total goes from \$5,461\.22 to \$728\.43\./);
  assert.match(e.says(base, runEx(e, 'function main() { throw new Error("no") }')), /^The change did not run: /);
});

test('your turn, a field: two more fields cost the model about twice the answer, the whole record about sixteen times, and the scan does not move', () => {
  const inv = buildInventory();
  const e = exercise('field');
  const base = runEx(e, e.base.code);
  const two = runEx(e, e.changes[0].code);
  const whole = runEx(e, e.changes[1].code);
  assert.deepEqual([base, two, whole].map(fieldsPerRow), [2, 4, 19]);
  assert.deepEqual([base, two, whole].map((o) => o.totals.resourcesScanned), [194, 194, 194]);
  assert.deepEqual([base, two, whole].map(backToModelTokens), [79, 145, 1237]);
  assert.deepEqual(tilesOf(e, e.changes[0].code), ['4', '\u2248 145', '194', '414']);
  assert.deepEqual(tilesOf(e, e.changes[1].code), ['19', '\u2248 1,237', '194', '1,089']);
  // The extra reads are the extra fields on every VM: forty-four of them, two more each.
  const vms = inv.resources.filter((r) => r.type === 'virtualMachine');
  assert.equal(two.totals.propertyReads - base.totals.propertyReads, vms.length * 2);
  assert.match(e.says(base, two), /\(1\.8\u00d7\)\. It reads 88 more fields/);
  assert.match(e.says(base, whole), /\(15\.7\u00d7\)/);
  // Ground truth: the five dearest VMs per vCPU, and the fields asked for are theirs.
  const top = (vms as VirtualMachine[])
    .map((v) => ({ v, perVcpu: round2(v.costMonthly / v.vcpus) }))
    .sort((a, b) => b.perVcpu - a.perVcpu)
    .slice(0, 5);
  const rows = (JSON.parse(two.content) as { result: Array<{ vm: string; perVcpu: number; size: string; group: string }> }).result;
  assert.deepEqual(rows.map((r) => r.vm), top.map((t) => t.v.name));
  assert.deepEqual(rows.map((r) => r.size), top.map((t) => t.v.vmSize));
  assert.deepEqual(rows.map((r) => r.group), top.map((t) => t.v.resourceGroup));
});

test('your turn, a rule: a narrower rule is a smaller change set, derived by the runtime, and the model is told about the same', () => {
  const inv = buildInventory();
  const e = exercise('rule');
  const base = runEx(e, e.base.code);
  const vmsOnly = runEx(e, e.changes[0].code);
  const idle = runEx(e, e.changes[1].code);
  const env = runEx(e, e.changes[2].code);
  assert.deepEqual([base, vmsOnly, idle, env].map((o) => [o.diff.length, o.resourcesAffected]), [[70, 37], [18, 11], [68, 35], [37, 37]]);
  assert.deepEqual(tilesOf(e, e.changes[0].code), ['18', '11', '194', `\u2248 ${backToModelTokens(vmsOnly)}`]);
  // Ground truth: the VMs the narrower rule tags, two tags each, and the VMs it deallocates, one power state each.
  const untaggedVms = (inv.resources as VirtualMachine[]).filter((r) => r.type === 'virtualMachine' && r.resourceGroup === 'app-staging' && Object.keys(r.tags).length === 0);
  const summary = (o: typeof base) => (JSON.parse(o.content) as { result: { taggedCount: number; deallocatedCount: number } }).result;
  assert.equal(summary(vmsOnly).taggedCount, untaggedVms.length);
  assert.equal(vmsOnly.diff.length, 2 * untaggedVms.length + summary(vmsOnly).deallocatedCount);
  assert.equal(summary(base).deallocatedCount, summary(vmsOnly).deallocatedCount, 'the second rule is the same in both');
  assert.equal(summary(idle).deallocatedCount, 2, 'two of the four have been idle for ninety days');
  assert.equal(env.diff.every((d) => d.field !== 'tags.owner'), true, 'no owner tag when only the env tag is asked for');
  assert.match(e.says(base, vmsOnly), /^The change set goes from 70 field changes on 37 resources to 18 on 11\./);
  assert.ok(backToModelTokens(vmsOnly) < 2 * backToModelTokens(base), 'the model is told about the same');
  // Nothing was applied: the estate is exactly as it was.
  assert.deepEqual(inv, buildInventory());
});

test('your turn: an answer is the same as the reference only when the answer and the change set are', () => {
  const e = exercise('rule');
  const ref = runEx(e, e.changes[0].code);
  assert.equal(sameAnswer(ref, ref), true);
  assert.equal(sameAnswer(ref, runEx(e, e.base.code)), false);
  assert.equal(sameAnswer(ref, runEx(e, e.changes[1].code)), false);
  // A different program with the same effect is the same answer.
  assert.equal(sameAnswer(ref, runEx(e, e.changes[0].code + '\n// the same, with a comment')), true);
  const broken = runEx(e, 'function main() { throw new Error("no") }');
  assert.equal(broken.status, 'error');
  assert.equal(sameAnswer(broken, broken), false, 'a run that failed is not an answer');
});

test('your turn: six beats, two to an exercise, each a URL the screen reads back', () => {
  const beats = turnBeats({ filter: 'A filter', field: 'A field', rule: 'A rule' });
  assert.deepEqual(beats.map((b) => b.href), ['/tour/turn', '/tour/turn?step=1', '/tour/turn?ex=field', '/tour/turn?ex=field&step=1', '/tour/turn?ex=rule', '/tour/turn?ex=rule&step=1']);
  for (const b of beats) assert.deepEqual(parseTurn(at(b.href).searchParams), { id: b.id, step: b.step }, b.href);
  assert.deepEqual(beats.map((b) => b.group), ['filter', 'filter', 'field', 'field', 'rule', 'rule'], 'Shift and an arrow jump from one exercise to the next');
  assert.equal(beats[0].caption, 'A filter \u00b7 Predict');
  assert.equal(beats[1].caption, 'A filter \u00b7 Result');
  assert.equal(turnHref('filter'), '/tour/turn');
  assert.deepEqual(parseTurn(new URLSearchParams('ex=nope&step=7')), { id: 'filter', step: 0 });
  assert.deepEqual(parseTurn(new URLSearchParams('step=1')), { id: 'filter', step: 1 });
  assert.deepEqual(moveFor('group-next', 0, beats.map((b) => b.group)), { to: 2 });
});

// ── the last screen ──────────────────────────────────────────────────────────

test('the wrap: each line of the recap is read off the run it summarises, and says no more than the screens showed', () => {
  const inv = buildInventory();
  const lines = recapOf({ inv, projection: buildProjection(inv), programs });
  assert.equal(lines.length, 6);
  assert.deepEqual(lines.map((l) => l.screens), [[2], [3], [4], [5, 6], [7], [8]]);
  const billed = costFacts(replayCatalog({ task: 'granular-read' })).billed;
  assert.equal(billed, 5894);
  assert.match(lines[0].text, new RegExp(`^One question took 3 narrow calls\\. The run was billed \u2248 5,894 tokens for a 14-token answer`));
  assert.match(lines[2].text, /refused 4 of the 4 questions nobody had planned for\.$/);
  assert.match(lines[3].text, /The cost question scans 194 records and sends back \u2248 63 tokens\. The tagging rule is 70 field changes on 37 resources, held for a person to approve\.$/);
  assert.equal(
    lines[4].text,
    'A program reads only the projection, with 2 internal fields left out. A write is a change set the runtime derives, so a rule of yours can read it. The one we showed refused 3 of 3 power changes in Production. What passes goes to a person as a diff, and is checked again as it lands.'
  );
  assert.equal(DROPPED_FIELDS.length, 2);
  assert.match(lines[5].text, /^80 of 80 on all three models\. On the older one the other methods got 39 to 56\. A narrow lookup is the exception: a direct call costs 0\.6\u00d7 the tokens\.$/);
  assert.equal(REPORTED.lookupDirectCallTokens, '0.6\u00d7');
  assert.deepEqual([codeSpan(['newest', 'newer', 'older']).min, othersSpan(['older']).min, othersSpan(['older']).max], [80, 39, 56]);
  assert.ok(lines.every((l) => !/secure|safe|guarantee/i.test(l.text)));
});

test('the wrap: six questions about an estate that is not this one, the claims about running code are the README\u2019s, and the files named are in the repository', () => {
  assert.equal(ASKS.length, 6);
  assert.deepEqual(ASKS.map((a) => a.screens), [[3, 6], [2, 3], [5, 7], [6, 7], [7], [8]], 'each question points at the screens that answered it: the projection at the object and at the first gate, the writes at the code surface and the last gates');
  for (const a of ASKS) {
    assert.ok(a.title.endsWith('?'), a.title);
    assert.ok(a.screens.length > 0 && a.screens.every((s) => SCREENS.some((x) => x.n === s)), `${a.title} points at screens that exist`);
  }
  const readme = text('README.md');
  assert.match(readme, /It is not a security sandbox/);
  assert.match(readme, /isolated process\/container\/microVM/);
  const where = ASKS.find((a) => a.title === 'Where does the code run?')!;
  assert.match(where.because, /not a security sandbox/);
  assert.match(where.because, /isolated process, container or microVM, with credentials kept outside it/);
  assert.ok(!/\b(is|are) (safe|secure)\b/i.test(ASKS.map((a) => a.because).join(' ')), 'the sandbox is never called secure');
  for (const f of TAKEAWAY.files) assert.ok(existsSync(new URL(`../${f.path}`, import.meta.url)), `${f.path} is in the repository`);
  assert.equal(TAKEAWAY.open, '/workshop');
  assert.equal(SEEDS.length, 3);
});

test('the workshop screens keep to the tour\u2019s frame: a step row that presenter mode hides, and the rail told how far along they are', () => {
  for (const id of WORKSHOP_ONLY) {
    const src = text(`src/routes/tour/${id}/+page.svelte`);
    assert.match(src, /<div class="screen">/, `${id}: the same frame as the others`);
    assert.match(src, /<div class="nav">\s*<BeatNav/, `${id}: the step row is .nav`);
    assert.match(src, /<svelte:head>\s*<title>[^<]+· From tools to code surfaces<\/title>/, `${id}: a title`);
  }
  assert.match(text('src/routes/tour/welcome/+page.svelte'), /beats=\{WELCOME_BEATS\}/);
  assert.match(text('src/routes/tour/wrap/+page.svelte'), /beats=\{WRAP_BEATS\}/);
  assert.match(text('src/routes/tour/turn/+page.svelte'), /beats=\{BEATS\}/);
  // Everything that walks the screens walks the visitor's list, not the tour's.
  for (const f of ['BeatNav', 'BeatKeys', 'PresenterRail', 'TourStepper']) {
    const src = text(`src/lib/components/tour/${f}.svelte`);
    assert.match(src, /presenter\.screens/, `${f} reads the screens the visitor walks`);
    assert.ok(!/\bSCREENS\b/.test(src.replace(/WORKSHOP_SCREENS/g, '')), `${f} does not read the tour's seven`);
  }
});

test('presenter: a screen that is leaving does not answer keys for the one arriving, and takes down only its own report', () => {
  // A screen that has been left can stay in the page for a moment (a fade that has not finished) with the address already the next screen's.
  for (const f of ['BeatNav', 'BeatKeys']) {
    const src = text(`src/lib/components/tour/${f}.svelte`);
    assert.match(src, /const home = untrack\(\(\) => page\.url\.pathname\);/, `${f}: the address it was shown at`);
    assert.match(src, /page\.url\.pathname !== home/, `${f}: its keys are for that address alone`);
    assert.match(src, /presenter\.report\(mine\)/, `${f}: it reports one object, and keeps it`);
    assert.match(src, /if \(mine\) presenter\.release\(mine\)/, `${f}: and takes down that one`);
    assert.ok(!/presenter\.report\(null\)/.test(src), `${f}: never the next screen's report`);
  }
  const presenter = text('src/lib/tour/presenter.svelte.ts');
  assert.match(presenter, /beat = \$state\.raw<BeatReport \| null>\(null\);/, 'the report is compared by identity, so it is not proxied');
  assert.match(presenter, /release\(b: BeatReport\): void \{\s*if \(this\.beat === b\) this\.beat = null;\s*\}/);
  // On Your turn the beat follows the stage: a program that has run is the result, whoever wrote it.
  const turn = text('src/routes/tour/turn/+page.svelte');
  assert.match(turn, /function follow\(out: RunOutcome\): void \{[\s\S]*?const step = out === baseOutcome \? 0 : 1;[\s\S]*?replaceState: true/);
  assert.match(turn, /function land\(out: RunOutcome, src: string\): void \{[\s\S]*?follow\(out\);/);
});

// ── the script ───────────────────────────────────────────────────────────────
// docs/workshop-script.md is what the presenter reads from. These hold it to the plan, to the screens and to the saved
// results, so that it cannot say twelve minutes where the rail says nine, or a figure the screen does not show.

const script = text('docs/workshop-script.md');
interface Section {
  heading: string;
  lines: string[];
}
const sections: Section[] = [];
for (const line of script.split('\n')) {
  if (line.startsWith('## ')) sections.push({ heading: line.slice(3), lines: [] });
  else sections.at(-1)?.lines.push(line);
}
const sectionNamed = (heading: string): Section => {
  const found = sections.filter((s) => s.heading === heading);
  assert.equal(found.length, 1, `one section called "${heading}"`);
  return found[0];
};
const bodyOf = (s: Section): string => s.lines.join('\n');
/** The cells of a table row, split on the bars that are not escaped. */
const cellsOf = (row: string): string[] => row.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim());
/** The rows of a section's tables that have this many cells, the headers and the rules included. */
const tableRows = (s: Section, cells: number): string[][] => s.lines.filter((l) => l.startsWith('|')).map(cellsOf).filter((r) => r.length === cells);
/** "1:30" as seconds: null for any other text. */
const secondsOf = (cell: string): number | null => {
  const m = cell.match(/^(\d+):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const group = (n: number): string => n.toLocaleString('en-US');
/** The heading a block's section has: its screen's number as a circled digit, its title, and its place in the ninety. */
const headingOf = (b: Block): string => {
  const n = WORKSHOP_SCREENS.find((s) => s.id === b.screen)!.n;
  return `${n === undefined ? '' : `${String.fromCodePoint(0x2460 + n - 1)} `}${b.title} \u00b7 ${rangeOf(b)}`;
};
const sectionOf = (screen: string): Section => sectionNamed(headingOf(blockOf(screen)!));
/** How many beats each screen has, counted from what the screen walks and not from the script. */
function beatCounts(): Record<string, number> {
  const inv = buildInventory();
  const cmp = compareSurfaces('filter-aggregate', programs['filter-aggregate']);
  return {
    welcome: WELCOME_BEATS.length,
    estate: LENS_ORDER.length + 1,
    tools: lastFrame(replayCatalog({ task: 'granular-read' })) + 1,
    strains: buildBeats(buildStrains(inv, buildToolRungs(inv))).length,
    language: buildLadder(inv, cmp.code).length - 1 + 3,
    object: STEP_IDS.length,
    code: exampleBeats().length,
    guard: GUARD_BEATS.length,
    turn: turnBeats({ filter: 'a', field: 'b', rule: 'c' }).length,
    results: RESULTS_BEATS.length,
    wrap: WRAP_BEATS.length
  };
}

test('the script: a section for each block of the plan, in its order, and under it the ask, the beats and the minutes the plan gives', () => {
  const counts = beatCounts();
  const timed = sections.filter((s) => /\u00b7 \d+\u2013\d+ min$/.test(s.heading));
  assert.deepEqual(timed.map((s) => s.heading), BLOCKS.map(headingOf), 'the sections are the plan\u2019s blocks, in its order, called what the agenda calls them');
  for (const b of BLOCKS) {
    const s = sectionOf(b.screen);
    assert.equal(bodyOf(s).includes('**Ask.**'), b.ask !== undefined, `${b.screen}: a section has an ask when the plan has one`);
    if (b.ask) assert.ok(s.lines.includes(`**Ask.** ${b.ask}`), `${b.screen}: the room is asked what the plan says`);
    assert.equal(Number(bodyOf(s).match(/\*\*Beats\.\*\* (\d+)/)?.[1]), counts[b.screen], `${b.screen}: the script counts the beats the screen has`);
    const holds = tableRows(s, 4).map((r) => secondsOf(r[3])).filter((x): x is number => x !== null);
    assert.equal(sum(holds), minutesOf(b) * 60, `${b.screen}: the holds come to ${mmss(sum(holds))} and the plan gives ${minutesOf(b)} minutes`);
  }
});

test('the script: the run of show is the plan row for row, and the totals it quotes are the plan\u2019s and the screens\u2019', () => {
  const counts = beatCounts();
  const rows = tableRows(sectionNamed('Run of show'), 4).filter((r) => / min$/.test(r[0]));
  assert.equal(rows.length, BLOCKS.length);
  BLOCKS.forEach((b, i) => {
    assert.equal(rows[i][0], rangeOf(b), `${b.screen}: its minutes`);
    assert.ok(b.ask === undefined ? rows[i][2].startsWith('(none') : rows[i][2] === b.ask, `${b.screen}: what the room is asked`);
    assert.equal(Number(rows[i][3]), counts[b.screen], `${b.screen}: its beats`);
  });
  const beats = sum(Object.values(counts));
  assert.equal(beats, 84);
  assert.equal(WORKSHOP_SCREENS.length, 11);
  assert.equal(SCREENS.length, 8);
  assert.equal(beats - counts.welcome - counts.turn - counts.wrap, 72, 'the 22-minute talk is the eight screens, and the tour script says 72 beats');
  assert.match(text('docs/tour-script.md'), /Eight screens, 72 beats\./);
  assert.match(text('docs/tour-script.md'), /about 22 minutes/);
  for (const said of [
    `Eleven screens, ${beats} beats`,
    `is ${beats - 1} presses`,
    `${TOTAL_MINUTES} minutes online: ${QUESTIONS_FROM} of talk, ${QUESTION_MINUTES} for questions`,
    `Talk ends at minute ${QUESTIONS_FROM}`,
    `**Minute ${QUESTIONS_FROM}.**`,
    `**Minute ${TOTAL_MINUTES - 5}.**`,
    `**Minute ${TOTAL_MINUTES - 1}.**`
  ]) {
    assert.ok(script.includes(said), `the script says "${said}"`);
  }
  assert.equal(BLOCKS.filter((b) => b.ask).length, 10);
  for (const said of ['at ten marked moments', 'Ten times I will stop', 'Ten predictions in the chat']) assert.ok(script.includes(said), said);
});

test('the script: the time checks fall where the blocks end, and the cuts add up to what each block says it saves', () => {
  const checks = tableRows(sectionNamed('Keeping time'), 3).filter((r) => /^\d+$/.test(r[0]));
  assert.deepEqual(checks.map((r) => Number(r[0])), BLOCKS.slice(0, -1).map((b) => b.to), 'a check at the end of every block but the last');
  const cutSection = sectionNamed('If the clock says otherwise');
  const cuts = tableRows(cutSection, 3).map((r) => secondsOf(r[2])).filter((x): x is number => x !== null);
  const saved = BLOCKS.flatMap((b) => {
    const m = bodyOf(sectionOf(b.screen)).match(/\*\*If you are behind\.\*\*[^\n]*? Saves (\d+:\d{2})\./);
    return m ? [secondsOf(m[1])!] : [];
  });
  assert.ok(saved.length >= 8);
  assert.deepEqual([...cuts].sort((a, b) => a - b), [...saved].sort((a, b) => a - b), 'the cuts listed at the end are the ones each block gives');
  assert.ok(bodyOf(cutSection).includes(`Together they are ${mmss(sum(cuts))}.`));
});

test('the script: the figures it quotes on the tools screen, the code screen, Your turn and the results are the ones the screens compute', () => {
  const has = (s: Section, q: string): void => assert.ok(bodyOf(s).includes(q), `"${q}" is in "${s.heading}"`);

  // ② the six narrow tools on the question: what each turn sends, and what the run was billed.
  const tools = replayCatalog({ task: 'granular-read' });
  const [t1, t2, t3] = tools.turns;
  const bill = runBill(tools);
  const facts = costFacts(tools);
  const two = sectionOf('tools');
  has(two, `${t1.parts.system} of instructions`);
  has(two, `${group(t2.promptTokens)} tokens against ${group(t1.promptTokens)}`);
  has(two, `input ${group(t3.promptTokens)}`);
  has(two, `${group(bill.input)} in, ${bill.output} out`);
  has(two, `${facts.multiple.toFixed(1)} times`);
  has(two, `${Math.round(facts.fixedShare * 100)} percent`);
  has(two, `about ${group(Math.round(facts.billed / 100) * 100)}`);
  // ④ the code tool's definition against the six narrow tools'.
  has(sectionOf('language'), `${group(estimateTokens(JSON.stringify(CODE_TOOLS)))} tokens against ${t1.parts.tools}`);

  // ⑥ the programs, run on the object.
  const six = sectionOf('code');
  const cost = exBuild('cost');
  const tag = exBuild('tag');
  const disks = exBuild('disks');
  const ratio = exBuild('ratio');
  const lookup = exBuild('lookup');
  const strip = (e: ReturnType<typeof exBuild>): { pair: string; times: string } => {
    const s = e.view.strip;
    assert.equal(s?.kind, 'bill');
    if (s?.kind !== 'bill') return { pair: '', times: '' };
    const [cat, code] = s.bars;
    return {
      pair: `Catalogue best case ${group(cat.bill.total)}, ${cat.calls} call; Code surface ${group(code.bill.total)}, ${code.calls} call`,
      times: (code.bill.total / cat.bill.total).toFixed(1)
    };
  };
  const c = (e: ReturnType<typeof exBuild>) => e.view.counters;
  has(six, strip(cost).pair);
  has(six, strip(lookup).pair);
  has(six, `billed ${strip(lookup).times} times as much`);
  has(six, `Scanned ${c(cost).scanned} (${c(cost).reads} field reads`);
  has(six, `Records it used ${c(cost).used} of ${c(cost).scanned}`);
  has(six, `Scanned ${c(tag).scanned} (${c(tag).reads} field reads), Proposed changes: ${c(tag).used} ${c(tag).usedSub}`);
  has(six, `${c(disks).scanned} scanned (${c(disks).reads} field reads), ${c(disks).used} records used`);
  has(six, `${c(lookup).used} of ${c(lookup).scanned}`);
  for (const e of [cost, tag, disks, ratio, lookup]) has(six, `\u2248 ${c(e).tokens} tokens`);
  has(six, reviewCard(tag.outcome)!.summary.replace(/\s+/g, ' '));

  // ⑦ the gates: what each program is told, the line the screen flags, and what is said of the rule, the person and the apply.
  const gates = sectionOf('guard');
  const flagged = (v: ReturnType<typeof guardOf>, i = 0): string => `Line ${v.flags[i].line + 1} is flagged "${v.flags[i].text}"`;
  const gRead = guardOf('read', 'read');
  const gNet = guardOf('run', 'network');
  const gChange = guardOf('change', 'change');
  const gReach = guardOf('rule', 'reach');
  const gNarrow = guardOf('review', 'narrow');
  for (const v of [gRead, gNet, gChange, gReach]) has(gates, `(\u2248 ${v.example.answer.tokens} tokens)`);
  for (const v of [gRead, gNet, gReach, gNarrow]) has(gates, flagged(v));
  const [badEdit, goodEdit] = gChange.flags;
  has(gates, `Line ${goodEdit.line + 1} green ("${goodEdit.text}"), line ${badEdit.line + 1} red ("${badEdit.text}")`);
  has(gates, `\`error: ${gNet.raw.error}\``);
  has(gates, `\`error: ${gChange.raw.error}\``);
  has(gates, `error: ${gReach.hit!.message}`);
  has(gates, `The answer is ${gReach.hit!.offenders.length} of ${gReach.hit!.total}:`);
  has(gates, 'Stopped after 1500 ms.');
  has(gates, gNarrow.example.review!.rows.map((r) => r.name).join(', '));
  has(gates, `"${gNarrow.example.review!.resources} resources, ${gNarrow.example.review!.fields} fields"`);
  const gStale = guardOf('apply', 'narrow', { decision: 'approved' });
  has(gates, gStale.told!.lines[0]);
  has(gates, `"${gStale.example.review!.rows.find((r) => r.note)!.note}"`);
  has(gates, movedOn(gInv, gStale.raw.diff).resource);

  // Your turn: the tiles before and after each change.
  const turn = sectionOf('turn');
  const filter = exercise('filter');
  const field = exercise('field');
  const rule = exercise('rule');
  const tile = (e: Exercise, code: string, i: number): string => tilesOf(e, code)[i];
  const arrow = (e: Exercise, to: string, i: number): string => `${tile(e, e.base.code, i)} \u2192 ${tile(e, to, i)}`;
  for (const i of [0, 1, 2, 3]) has(turn, `${tile(filter, filter.base.code, i)} \u2192 ?`);
  for (const i of [0, 1]) has(turn, `${tile(rule, rule.base.code, i)} \u2192 ?`);
  has(turn, tile(filter, filter.changes[0].code, 1));
  has(turn, tile(filter, filter.changes[1].code, 1));
  for (const i of [0, 1, 2, 3]) has(turn, arrow(field, field.changes[0].code, i));
  has(turn, tile(field, field.changes[1].code, 1).replace('\u2248 ', ''));
  for (const i of [0, 1, 3]) has(turn, arrow(rule, rule.changes[0].code, i));
  const idle = runEx(rule, rule.changes[1].code);
  const env = runEx(rule, rule.changes[2].code);
  has(turn, `${idle.diff.length} fields on ${idle.resourcesAffected} resources`);
  has(turn, `${env.diff.length} fields on the same ${env.resourcesAffected} resources`);

  // ⑧ the measured results, model by model.
  const eight = sectionOf('results');
  const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const pre = (m: ModelKey, a: ArmId): Cell => setCell('preset', m, a);
  const usd = (set: TaskSet, m: ModelKey, a: ArmId): string => fmtUsd(perThousandRuns(setCell(set, m, a)));
  const FIVE: ArmId[] = ['naive-direct', 'calc-direct', 'naive-ptc', 'tuned-direct', 'tuned-ptc'];
  const rest = othersOn('preset', 'older');
  assert.equal(pre('older', CODE).correct, pre('older', CODE).runs);
  const tied = FIVE.filter((a) => pre('older', a).correct === rest.correct.max).length;
  has(eight, `The best of the other five gets ${rest.correct.max} of ${pre('older', CODE).runs}, and ${NUM[tied]} of them do.`);
  has(eight, `Catalogue ${pre('older', 'naive-direct').correct}, ${pre('older', 'calc-direct').correct} and ${pre('older', 'naive-ptc').correct}; Tuned ${pre('older', 'tuned-direct').correct} and ${pre('older', 'tuned-ptc').correct}`);
  has(eight, `The other five get between ${rest.correct.min} and ${rest.correct.max}`);
  has(eight, `${pre('older', 'naive-ptc').correct} and ${pre('older', 'tuned-ptc').correct}. And the code surface`);
  const slow = cheapestRun('preset', 'older');
  has(eight, `${usd('preset', 'older', CODE)} per thousand runs, against ${fmtUsd(slow.usd)} for the cheapest method, which gets ${slow.correct}`);
  has(eight, `Code surface ${pre('older', CODE).correct} of ${pre('older', CODE).runs}, ${usd('preset', 'older', CODE)}`);
  // The middle model: everything cheaper and better, and the code surface no longer the cheapest.
  const mid = cheapestRun('preset', 'newer');
  assert.equal(mid.id, 'tuned-direct');
  const under = Math.round((1 - mid.usd / perThousandRuns(pre('newer', CODE))) * 100);
  has(eight, `${+priceDrop('newer').min.toFixed(2)} times less per token`);
  has(eight, `${usd('preset', 'newer', 'tuned-direct')} against ${usd('preset', 'newer', CODE)}) at ${pre('newer', 'tuned-direct').correct} of ${pre('newer', 'tuned-direct').runs}`);
  has(eight, `is ${NUM[under]} percent under it and gets ${mid.correct}`);
  // The newest: five methods at the top, and the code surface the cheapest.
  const next = cheapestRun('preset', 'newest', ARMS.filter((a) => a.id !== CODE).map((a) => a.id));
  assert.deepEqual(priceDrop('newest'), { min: 7.5, max: 9 });
  has(eight, 'seven and a half to nine times less per token');
  assert.equal(perfectOn('preset', 'newest').length, 5);
  has(eight, 'Five methods now get forty of forty');
  has(eight, `the code surface furthest left, ${usd('preset', 'newest', CODE)}`);
  const cents = (u: number): number => Math.round(u * 100);
  has(eight, `${cents(perThousandRuns(pre('newest', CODE)))} cents per thousand runs against ${cents(next.usd)} for the next, which is ${Math.round((next.usd / perThousandRuns(pre('newest', CODE)) - 1) * 100)} percent more`);
  // Four questions nobody planned for.
  const wide = perThousandRuns(setCell('unplanned', 'newest', 'tuned-direct')) / perThousandRuns(pre('newest', 'tuned-direct'));
  has(eight, `${usd('preset', 'newest', 'tuned-direct')} \u2192 ${usd('unplanned', 'newest', 'tuned-direct')} (${fmtTimes(wide)})`);
  has(eight, `${usd('preset', 'newest', CODE)} \u2192 ${usd('unplanned', 'newest', CODE)}`);
  assert.equal(Math.round(wide), 4);
  has(eight, 'four times');
  // What a right answer costs, and the two effects that multiply.
  const x = multiples();
  const right = (m: ModelKey, a: ArmId): string => fmtUsd(perThousandRight(cellOf(m, a)));
  has(eight, `${right('older', 'naive-direct')}, ${right('newest', 'naive-direct')} and ${right('newest', CODE)} per 1,000 right answers`);
  for (const q of [fmtTimes(x.model), fmtTimes(x.method), fmtTimes(x.both)]) has(eight, q);
  assert.equal(Math.round(x.model), 13);
  assert.ok(x.method > 4.5 && x.method < 5);
  assert.equal(Math.round(x.both), 65);
  has(eight, 'thirteen times cheaper');
  has(eight, 'nearly five times cheaper');
  has(eight, 'sixty-five times');
  assert.equal(right('older', 'naive-direct'), '$18.7');
  assert.equal(cents(perThousandRight(cellOf('newest', CODE))), 29);
  has(eight, 'eighteen dollars seventy against twenty-nine cents per thousand right answers');
  // Why: the one measured thing, and what the screen says it does not show.
  has(eight, `programs over the catalogue got ${cellOf('older', 'naive-ptc').correct} of 80, and over the tuned catalogue ${cellOf('older', 'tuned-ptc').correct}`);
  const whyText = (buildResults('why').columns ?? []).flatMap((c) => c.points.map((p) => p.text)).join(' ');
  has(eight, `within ${whyText.match(/within (\d+)%/)![1]} percent of the code surface on the unplanned tasks`);
  has(eight, `one mock estate of ${REPORTED.estateResources} resources`);
  has(eight, `${REPORTED.lookupDirectCallTokens.replace('\u00d7', '')} times the tokens`);
  // The recap's last line is the same snapshot, over all eight tasks.
  const older = othersSpan(['older']);
  has(sectionOf('wrap'), `the others got ${older.min} to ${older.max}`);
  // What the questions section says of programs over the catalogue: on the newer models they cost between a quarter and a half of one-by-one calls.
  const share = (['newest', 'newer'] as ModelKey[]).flatMap((m) =>
    (['naive', 'tuned'] as const).map((k) => cellOf(m, `${k}-ptc` as ArmId).totalUsd / cellOf(m, `${k}-direct` as ArmId).totalUsd)
  );
  assert.ok(Math.min(...share) >= 0.25 && Math.max(...share) <= 0.5, `${share.map((s) => s.toFixed(2)).join(', ')}`);
  has(sectionNamed('Questions you will get'), 'between a quarter and a half of calling the same tools one by one');
  has(sectionNamed('Questions you will get'), `On the older model they fall to ${cellOf('older', 'naive-ptc').correct}, and to ${cellOf('older', 'tuned-ptc').correct} over the tuned catalogue`);
});

test('the script: its pictures, its links to other documents and the addresses it gives all lead somewhere', () => {
  const docs = (p: string) => new URL(`../docs/${p}`, import.meta.url);
  const pictures = [...script.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(pictures.length >= 25);
  for (const p of pictures) assert.ok(existsSync(docs(p)), `${p} is a picture under docs/`);

  for (const m of script.matchAll(/(?<!!)\[[^\]]+\]\(([^)#]+\.md)(#[^)]*)?\)/g)) {
    assert.ok(existsSync(docs(m[1])), `${m[1]} is a document under docs/`);
    if (!m[2]) continue;
    const slugs = [...readFileSync(docs(m[1]), 'utf8').matchAll(/^#{1,6} (.+)$/gm)].map((h) => h[1].toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-'));
    assert.ok(slugs.includes(m[2].slice(1)), `${m[1]} has a heading for ${m[2]}`);
  }
  // A file named in backticks is in the repository. The saved runs are not always there (they are a local export), so they are not asked for.
  for (const m of script.matchAll(/`((?:src|docs|tests|scripts)\/[\w./-]+)`/g)) {
    if (!m[1].startsWith('docs/runs/')) assert.ok(existsSync(new URL(`../${m[1]}`, import.meta.url)), `${m[1]} is in the repository`);
  }

  const pages = new Set(['/workshop', ...WORKSHOP_SCREENS.map((s) => s.href)]);
  const urls = [...script.matchAll(/`((?:\/tour\/|\/workshop)[^`\s]*)`/g)].map((m) => m[1]);
  assert.ok(urls.length >= 20);
  const isBeat = (u: URL): boolean => {
    const q = u.searchParams;
    const whole = u.pathname + u.search;
    switch (u.pathname) {
      case '/tour/welcome': return !q.has('at') || parseAt(q, WELCOME_BEATS.length) === Number(q.get('at'));
      case '/tour/wrap': return !q.has('at') || parseAt(q, WRAP_BEATS.length) === Number(q.get('at'));
      case '/tour/guard': return !q.has('at') || parseAt(q, GUARD_BEATS.length) === Number(q.get('at'));
      case '/tour/turn': { const t = parseTurn(q); return turnHref(t.id, t.step) === whole; }
      case '/tour/code': { const s = parseExampleState(q); return exampleHref(s.id, s.step) === whole; }
      case '/tour/results': return resultsHref(parseResultsBeat(q)) === whole;
      case '/tour/object': return !q.has('step') || (Number.isInteger(Number(q.get('step'))) && Number(q.get('step')) >= 0 && Number(q.get('step')) <= LAST_STEP);
      case '/tour/tools': return !q.has('step') || (Number.isInteger(Number(q.get('step'))) && Number(q.get('step')) >= 0);
      case '/tour/language': return !q.has('stage') || ['grow', 'limits'].includes(q.get('stage')!);
      default: return true;
    }
  };
  for (const u of urls) {
    const url = at(u);
    assert.ok(pages.has(url.pathname), `${u} is a screen`);
    assert.ok(isBeat(url), `${u} is a beat the screen reads back`);
  }
});

test('the scripts: every picture they show exists, and none is left over from a screen that is gone', () => {
  const docs = (p: string) => new URL(`../docs/${p}`, import.meta.url);
  const shown = new Set<string>();
  for (const file of ['tour-script.md', 'workshop-script.md']) {
    for (const m of readFileSync(docs(file), 'utf8').matchAll(/\]\(((?:tour-script|workshop-script)\/[^)\s]+\.jpg)\)/g)) {
      assert.ok(existsSync(docs(m[1])), `${file}: ${m[1]} is a picture under docs/`);
      shown.add(m[1]);
    }
  }
  for (const dir of ['tour-script', 'workshop-script']) {
    for (const f of readdirSync(docs(`${dir}/`))) assert.ok(shown.has(`${dir}/${f}`), `${dir}/${f} is shown by a script`);
  }
});
