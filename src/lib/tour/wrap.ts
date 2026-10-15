/**
 * The last screen of the workshop: what the room has seen, what to ask of its own estate, and what to take away.
 *
 * Every number in the recap is read off the thing it is about, as the screens it points back to read it: the billed
 * run, the language's refusals, the two programs, the saved benchmark cells. The wording is fixed; the tests hold each
 * number to its source, so the last screen cannot say anything an earlier one did not show.
 */
import type { Inventory } from '$lib/inventory/types';
import type { TaskId } from './answers';
import { backToModelTokens } from './code-view';
import { runTracked, type RunRequest } from './code-run';
import { DROPPED_FIELDS, PRODUCTION_RULE, PROGRAMS, evaluateRule } from './guard';
import { FRESH_QUESTIONS, runQuery } from './language';
import type { CodeProgram } from './programs';
import { costFacts } from './replay-view';
import { CODE, REPORTED, RESULTS, cellOf, codeSpan, othersSpan, type ModelKey } from './results';
import { replayCatalog } from './scenarios';

/** One thing the room saw: the screens it was on, and what it came to. */
export interface Recap {
  /** The numbered screens the line points back to. */
  screens: readonly number[];
  text: string;
}

const MODELS = Object.keys(RESULTS) as ModelKey[];
const n = (x: number): string => x.toLocaleString('en-US');

export interface Sources {
  programs: Record<TaskId, CodeProgram>;
  inv: Inventory;
  projection: RunRequest['projection'];
}

/** The six lines of the recap, from the runs they summarise. */
export function recapOf({ programs, inv, projection }: Sources): Recap[] {
  const run = replayCatalog({ task: 'granular-read' });
  const answer = run.turns[run.turns.length - 1].completionTokens;
  const refused = FRESH_QUESTIONS.filter((q) => !runQuery(inv, q.query, new Set()).ok).length;
  const cost = runTracked({ code: programs['filter-aggregate'].code, projection });
  const tag = runTracked({ code: programs['bulk-write'].code, projection, rationale: programs['bulk-write'].rationale });
  // The guard screen's own story: the program that stops the three most expensive VMs, and the rule that reads its change set.
  const reach = runTracked({ code: PROGRAMS.reach.code, projection });
  const hit = evaluateRule(PRODUCTION_RULE, reach.diff, projection);
  const older = othersSpan(['older']);
  const code = codeSpan(MODELS);
  const runs = cellOf('older', CODE).runs;

  return [
    {
      screens: [2],
      text: `One question took ${run.totals.calls} narrow calls. The run was billed \u2248 ${n(costFacts(run).billed)} tokens for a ${answer}-token answer, because every turn sends the transcript again.`
    },
    {
      screens: [3],
      text: 'Each strain had a fix, and every fix is vocabulary: a join, a calculator, a filter, an update. Each one lengthens what is sent on every turn.'
    },
    {
      screens: [4],
      text: `Together the fixes are a query language, and as first built it refused ${refused} of the ${FRESH_QUESTIONS.length} questions nobody had planned for.`
    },
    {
      screens: [5, 6],
      text: `The code surface is one tool and a program per question. The cost question scans ${n(cost.totals.resourcesScanned)} records and sends back \u2248 ${n(backToModelTokens(cost))} tokens. The tagging rule is ${tag.diff.length} field changes on ${tag.resourcesAffected} resources, held for a person to approve.`
    },
    {
      screens: [7],
      text: `A program reads only the projection, with ${DROPPED_FIELDS.length} internal fields left out. A write is a change set the runtime derives, so a rule of yours can read it. The one we showed refused ${hit?.offenders.length ?? 0} of ${hit?.total ?? 0} power changes in Production. What passes goes to a person as a diff, and is checked again as it lands.`
    },
    {
      screens: [8],
      text: `${code.min === code.max ? `${code.min}` : `${code.min} to ${code.max}`} of ${runs} on all three models. On the older one the other methods got ${older.min} to ${older.max}. A narrow lookup is the exception: a direct call costs ${REPORTED.lookupDirectCallTokens} the tokens.`
    }
  ];
}

/** What to ask of an estate that is not this one. Each is a question the tour answered with something shown. */
export interface Ask {
  title: string;
  /** What the tour showed, in a line. */
  because: string;
  screens: readonly number[];
}

export const ASKS: readonly Ask[] = [
  {
    title: 'How wide are your questions?',
    because: 'One step, keep a narrow tool. Many steps over many records, something has to compose.',
    screens: [3, 6]
  },
  {
    title: 'What does the model carry from call to call?',
    because: 'Every result it reads is sent again on every later turn, and a sum it adds in its reply is unchecked.',
    screens: [2, 3]
  },
  {
    title: 'What can a program see?',
    because: 'The projection decides what exists: shape it, name its references, leave the internal fields out.',
    screens: [5, 7]
  },
  {
    title: 'What can it change, and who approves?',
    because: 'A short allowlist, a change set the runtime derives from before and after, rules of your own over that change set, a person who sees the diff, and a check again as it lands.',
    screens: [6, 7]
  },
  {
    title: 'Where does the code run?',
    because: 'Not in this demo\u2019s executor, which is not a security sandbox. Production needs an isolated process, container or microVM, with credentials kept outside it.',
    screens: [7]
  },
  {
    title: 'What did you measure, on your model?',
    because: 'The weaker the model, the wider the gap. Run your own questions against your own estate before you decide.',
    screens: [8]
  }
];

/** Where to go next. Only files that are in the repository. */
export const TAKEAWAY = {
  repo: 'github.com/NickSmet/code-surface-benchmark',
  run: ['npm install', 'npm run dev'],
  open: '/workshop',
  files: [
    { path: 'docs/workshop-script.md', what: 'this workshop, beat by beat' },
    { path: 'docs/solution-path-examples.md', what: 'the programs you ran' },
    { path: 'README.md', what: 'the two designs, and what running code for real takes' }
  ]
} as const;

/** Somewhere to start when the room is quiet. */
export const SEEDS: readonly string[] = [
  'What would you measure first on your own estate?',
  'Where would the code run in your stack, and what would it be allowed to touch?',
  'What would you never let a program change?'
];
