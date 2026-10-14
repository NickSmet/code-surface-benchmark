/**
 * Pure helpers behind the code-surface screen: what to say about a run, how to
 * group its change set for review, whether a contract probe behaved the way
 * the contract says it should, and the head-to-head with the catalogue.
 *
 * Kept out of the page so every sentence the screen prints is tested.
 */

import { buildInventory } from '$lib/inventory/fixtures/builders';
import { buildProjection, type ChangeRow } from '$lib/inventory/projection';
import type { Inventory } from '$lib/inventory/types';
import { factsFromCodeResult, formatAnswer, type TaskId } from './answers';
import { replayCode } from './code-compare';
import { runTracked, type RunOutcome } from './code-run';
import type { CodeProgram, ContractProbe } from './programs';
import { callId, toolMessageTokens, type Replay } from './replay';
import { CATALOG_ROUTES, replayCatalog, taskPrompt } from './scenarios';
import { fmtTokens } from './tokens';

const plural = (n: number, one: string, many = one + 's'): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** How much of the answer reached the model, in resources and resource groups. */
export function seenBy(o: RunOutcome): { resources: number; groups: number } {
  const ids = new Set([...Object.keys(o.returned), ...o.named]);
  return { resources: ids.size, groups: o.namedGroups.length };
}

/**
 * What the model was handed back, as tokens: the tool result as the conversation carries it, which
 * is what every later request is billed for. It is the same number the replays show for a result.
 * This is the only thing from the run that enters the model's context.
 */
export function backToModelTokens(o: RunOutcome): number {
  return toolMessageTokens(callId(1), o.content);
}

export interface Caption {
  tone: 'idle' | 'ok' | 'bad';
  text: string;
}

export type Decision = 'pending' | 'approved' | 'declined';

/** One sentence under the map: what this run did to the estate and what the model got back. */
export function outcomeCaption(o: RunOutcome | null, decision: Decision = 'pending'): Caption {
  if (!o) return { tone: 'idle', text: 'Run the program to see what it reads, what comes back to the model, and what it changes.' };
  switch (o.status) {
    case 'rejected':
      return { tone: 'bad', text: `Rejected: ${o.error}. Nothing was applied.` };
    case 'error':
      return { tone: 'bad', text: `The program stopped with an error: ${o.error}. Nothing was applied.` };
    case 'timeout':
      return { tone: 'bad', text: 'The program ran past the time limit, so its worker was terminated. Nothing was applied.' };
    case 'ok':
      break;
  }
  const groupsScanned = Object.keys(o.scannedGroups).length;
  const scanned = [
    o.totals.resourcesScanned > 0 && plural(o.totals.resourcesScanned, 'resource'),
    groupsScanned > 0 && plural(groupsScanned, 'resource group')
  ].filter(Boolean);
  const looked = scanned.length ? `Looked at ${scanned.join(' and ')} inside the runtime.` : 'Looked at nothing in the estate.';
  const tokens = fmtTokens(backToModelTokens(o));
  if (o.diff.length > 0) {
    const fate =
      decision === 'approved'
        ? 'Approved, and applied to this copy of the estate.'
        : decision === 'declined'
          ? 'Declined, so nothing changed.'
          : 'Nothing is applied until it is approved.';
    return {
      tone: 'ok',
      text: `${looked} Proposed ${plural(o.diff.length, 'change')} to ${plural(o.resourcesAffected, 'resource')}. ${fate}`
    };
  }
  const seen = seenBy(o);
  const came = [seen.resources > 0 && plural(seen.resources, 'resource'), seen.groups > 0 && plural(seen.groups, 'resource group name')].filter(Boolean);
  const back = came.length
    ? `${came.join(' and ')} reached the model, as \u2248 ${tokens} tokens.`
    : `No individual resource reached the model, only the answer: \u2248 ${tokens} tokens.`;
  return { tone: 'ok', text: `${looked} ${back}` };
}

export interface DiffGroup {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  rows: ChangeRow[];
}

/** The change set grouped per resource, in the order the program first touched them. */
export function groupDiff(rows: readonly ChangeRow[]): DiffGroup[] {
  const groups = new Map<string, DiffGroup>();
  for (const row of rows) {
    let g = groups.get(row.resourceId);
    if (!g) {
      g = { resourceId: row.resourceId, resourceName: row.resourceName, resourceType: row.resourceType, rows: [] };
      groups.set(row.resourceId, g);
    }
    g.rows.push(row);
  }
  return [...groups.values()];
}

/** "env" for `tags.env`; the field name itself otherwise. */
export function fieldLabel(row: ChangeRow): string {
  return row.field.startsWith('tags.') ? row.field.slice('tags.'.length) : row.field;
}

export interface ProbeResult {
  /** The runtime did what the contract says. */
  met: boolean;
  headline: string;
}

/** Did the runtime answer this probe the way the contract promises? Also the sentence to show for it. */
export function probeResult(probe: ContractProbe, o: RunOutcome): ProbeResult {
  const got = `The runtime said ${o.status}${o.error ? `: ${o.error}` : ''}.`;
  switch (probe.verdict) {
    case 'allowed':
      return o.status === 'ok' && o.diff.length > 0
        ? { met: true, headline: `Accepted: ${plural(o.diff.length, 'change')} proposed for review.` }
        : { met: false, headline: `This was meant to be accepted. ${got}` };
    case 'rejected':
      return o.status === 'rejected'
        ? { met: true, headline: `Rejected: ${o.error}. The whole proposal is refused; nothing is applied.` }
        : { met: false, headline: `This was meant to be rejected. ${got}` };
    case 'hidden':
      return o.status === 'ok' && !/internalId|billing/i.test(o.resultText ?? '')
        ? { met: true, headline: 'The internal fields came back undefined, so they dropped out of the result. They were never in the data.' }
        : { met: false, headline: `The internal fields were meant to be absent. ${got}` };
    case 'blocked':
      return o.status === 'error'
        ? { met: true, headline: `Blocked: ${o.error}. Only the listed globals exist inside the runtime.` }
        : { met: false, headline: `This was meant to be blocked. ${got}` };
    case 'timeout':
      return o.status === 'timeout'
        ? { met: true, headline: 'Stopped at the time limit. The worker was terminated; nothing else was affected.' }
        : { met: false, headline: `This was meant to hit the time limit. ${got}` };
  }
}

export interface Comparison {
  task: TaskId;
  catalog: Replay;
  code: Replay;
  /** Both surfaces end by stating the same facts in the same words. */
  sameAnswer: boolean;
  /** Catalogue tokens billed ÷ code tokens billed. Above 1, the code surface is cheaper. */
  ratio: number;
  winner: 'code' | 'catalog' | 'tie';
}

function safeParse(text: string | null): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** What the model says once it has this result: the answer, in the benchmark's wording, when the result carries the facts. */
export function answerFor(task: TaskId, o: RunOutcome): string {
  const facts = factsFromCodeResult(task, safeParse(o.resultText));
  return facts ? formatAnswer(facts) : (o.resultText ?? '');
}

/** One run of a program as the two-turn conversation it is, billed like every other replay. */
export function replayRun(task: TaskId, program: Pick<CodeProgram, 'code' | 'rationale'>, outcome: RunOutcome, inventory: Inventory = buildInventory()): Replay {
  return replayCode({ task: taskPrompt(task), code: program.code, rationale: program.rationale, outcome, inventory, finalText: answerFor(task, outcome) });
}

/** The reference program for a task, replayed against the best-case catalogue route for the same task. */
export function compareSurfaces(task: TaskId, program: CodeProgram): Comparison {
  const outcome = runTracked({ code: program.code, projection: buildProjection(buildInventory()), rationale: program.rationale });
  const catalog = replayCatalog({ task });
  const code = replayRun(task, program, outcome);
  const finalText = code.finalText;
  const ratio = catalog.totals.billedTokens / Math.max(1, code.totals.billedTokens);
  return {
    task,
    catalog,
    code,
    sameAnswer: finalText === catalog.finalText,
    ratio,
    winner: ratio >= 1.15 ? 'code' : ratio <= 0.87 ? 'catalog' : 'tie'
  };
}

/** The verdict line above the comparison bars. */
export function comparisonHeadline(c: Comparison): string {
  const times = (n: number): string => (n >= 10 ? Math.round(n).toString() : n.toFixed(1)) + '\u00d7';
  if (c.winner === 'code') return `At its best, the catalogue is billed ${times(c.ratio)} the tokens of the code surface.`;
  if (c.winner === 'catalog') return `Here the catalogue wins: the code surface is billed ${times(1 / c.ratio)} the tokens of one narrow tool.`;
  return 'About the same bill on both surfaces.';
}

/** One or two sentences on why the head-to-head came out this way. Every number is read off the two replays. */
export function comparisonLesson(c: Comparison): string {
  const cat = c.catalog.totals;
  const code = c.code.totals;
  switch (c.task) {
    case 'granular-read':
      return `The catalogue chains ${cat.calls} calls over ${cat.turns} turns, and every turn re-sends the instructions, the tool definitions and the transcript so far. The code surface makes ${plural(code.calls, 'call')} and the model reads only the answer.`;
    case 'filter-aggregate': {
      const survey = CATALOG_ROUTES[c.task].some((r) => r.id === 'survey') ? replayCatalog({ task: c.task, route: 'survey' }) : null;
      const tail = survey
        ? ` If the model surveys instead, listing and then fetching each VM, the catalogue needs ${survey.totals.calls} calls and \u2248 ${fmtTokens(survey.totals.billedTokens)} tokens.`
        : '';
      const listed = new Set(c.catalog.touches.filter((t) => t.kind === 'listed' && t.resourceId).map((t) => t.resourceId)).size;
      return `The catalogue's best case is one list_resources call: it already filters by type and subscription, and its summaries carry the cost, tag count and power state this question needs, so ${listed} summaries are enough. The two land close because that tool happens to fit the question.${tail}`;
    }
    case 'bulk-write':
      return `The catalogue states the change set one call at a time: ${cat.calls} calls, each result landing in the transcript. The code surface states the rule once and the runtime derives the diff.`;
    case 'single-lookup':
      return `One narrow tool is the right shape for a one-step lookup. The code surface has to describe the whole object first (\u2248 ${fmtTokens(code.fixedTokens)} tokens of setup per turn, against \u2248 ${fmtTokens(cat.fixedTokens)}) to answer a question that needed one list call. Code surfaces earn their keep on multi-step work, not on lookups.`;
  }
}
