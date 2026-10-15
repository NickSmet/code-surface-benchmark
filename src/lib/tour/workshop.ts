/**
 * The workshop's plan: ninety minutes online, seventy of them the talk and twenty the questions.
 *
 * The plan is the one place the minutes live. The welcome screen draws the agenda from it, the rail says how long the
 * screen on show has, and a test holds docs/workshop-script.md to it, so the script, the agenda and the rail cannot
 * disagree. The minutes are targets, written by reading the screens aloud; they have not been timed with an audience.
 */
import { WORKSHOP_SCREENS } from './screens';

export interface Block {
  /** The screen the block is given on: an id from `WORKSHOP_SCREENS`. */
  screen: string;
  /** What the agenda calls it. */
  title: string;
  from: number;
  to: number;
  /** One line for the agenda: what the room has by the end of the block. */
  gist: string;
  /** What the room is asked, in the chat, before the screen answers it. Absent where the block is the talking. */
  ask?: string;
}

export const TOTAL_MINUTES = 90;
/** The last minutes, kept for the room's questions. */
export const QUESTION_MINUTES = 20;

export const BLOCKS: readonly Block[] = [
  {
    screen: 'welcome',
    title: 'Welcome',
    from: 0,
    to: 3,
    gist: 'What you leave with, and how we will work.',
    ask: 'In the chat: what do your agents work with today? A handful of narrow tools, one query tool, or code?'
  },
  {
    screen: 'estate',
    title: 'The estate and one question',
    from: 3,
    to: 9,
    gist: '194 resources, wired together. One question needs 3 of them.',
    ask: 'How many of the 194 records does "power state and public IP of web-prod-03" need?'
  },
  {
    screen: 'tools',
    title: 'One tool call at a time',
    from: 9,
    to: 21,
    gist: 'Three calls, three turns, and every turn pays again for the whole transcript.',
    ask: 'The answer is 14 tokens. Before the last turn: roughly how many tokens does the run bill?'
  },
  {
    screen: 'strains',
    title: 'Where it strains',
    from: 21,
    to: 28,
    gist: 'Four questions strain the catalogue in four places, and every fix is vocabulary.',
    ask: 'For each problem, before the fix: what would you add to the tool?'
  },
  {
    screen: 'language',
    title: 'A language',
    from: 28,
    to: 36,
    gist: 'The fixes add up to a query language, and it stops where somebody stopped building it.',
    ask: 'Four questions nobody planned for: how many does the language answer as first built?'
  },
  {
    screen: 'object',
    title: 'The object',
    from: 36,
    to: 43,
    gist: 'The estate as one plain object, its shape told once. Only the answer comes back.',
    ask: 'The program reads all 194 records. How many reach the model?'
  },
  {
    screen: 'code',
    title: 'Programs over the object',
    from: 43,
    to: 54,
    gist: 'A sum, a write for review, two questions nobody planned for, and a lookup the catalogue wins.',
    ask: 'Before the narrow lookup: which is cheaper, the code surface or one narrow tool?'
  },
  {
    screen: 'turn',
    title: 'Your turn',
    from: 54,
    to: 63,
    gist: 'Change a filter, a field and a rule. Predict, run, inspect.',
    ask: 'Each exercise asks its own prediction.'
  },
  {
    screen: 'results',
    title: 'What was measured',
    from: 63,
    to: 68,
    gist: 'Three models, six methods, 80 runs each: what holds as the model gets weaker.',
    ask: 'On the older model, how many of 80 do the other methods get right?'
  },
  {
    screen: 'wrap',
    title: 'Where each fits, then questions',
    from: 68,
    to: 90,
    gist: 'What to ask of your own estate, then your questions.'
  }
];

export const blockOf = (screenId: string): Block | null => BLOCKS.find((b) => b.screen === screenId) ?? null;

export const minutesOf = (b: Block): number => b.to - b.from;

/** "9\u201321 min", the way the rail and the agenda print a block's place in the ninety. */
export const rangeOf = (b: Block): string => `${b.from}\u2013${b.to} min`;

/** The minute the talk proper ends and the questions begin. */
export const QUESTIONS_FROM = TOTAL_MINUTES - QUESTION_MINUTES;

/** The screen ids the plan covers, in order: the same as the workshop's own list, which a test holds it to. */
export const PLAN_SCREENS: readonly string[] = BLOCKS.map((b) => b.screen);
export const WORKSHOP_IDS: readonly string[] = WORKSHOP_SCREENS.map((s) => s.id);

// ── the welcome ────────────────────────────────────────────────────────────

/** What the room can do by the end, in the three ways a talk can leave someone better off. */
export const OUTCOMES: readonly { verb: string; text: string }[] = [
  { verb: 'Understand', text: 'why a catalogue of narrow tools strains as the questions widen, and what each fix costs the model.' },
  { verb: 'Try', text: 'change a program that runs over the estate as plain data, and say what the change will do before it runs.' },
  { verb: 'Judge', text: 'when a catalogue is enough, when a code surface earns its keep, and what to measure on your own estate.' }
];

/** How the ninety minutes work, for a room that has to be told once. */
export const HOW: readonly { title: string; text: string }[] = [
  { title: 'Predict in the chat', text: 'At the marked moments, say your guess before the screen answers.' },
  { title: 'Ask whenever', text: `Questions go in the chat as they come. They are taken at the pauses, and in the last ${QUESTION_MINUTES} minutes.` },
  { title: 'No model runs live', text: 'Every run is replayed or computed over one fixed estate, so every number repeats.' },
  { title: 'Follow along, if you like', text: 'The repository is public: github.com/NickSmet/code-surface-benchmark. npm install, npm run dev, then open /workshop.' }
];

// ── a screen of panels, one lit at a time ──────────────────────────────────

export interface PanelBeat {
  href: string;
  caption: string;
}

/** The beats of a screen that is one picture lit a panel at a time: the first is the screen's own address, the rest add `?at=`. */
export const panelBeats = (base: string, captions: readonly string[]): PanelBeat[] =>
  captions.map((caption, at) => ({ href: at === 0 ? base : `${base}?at=${at}`, caption }));

/** Which beat the address names: a number in range, and the first for anything else. */
export function parseAt(search: URLSearchParams, count: number): number {
  const at = Number(search.get('at') ?? 0);
  return Number.isInteger(at) ? Math.max(0, Math.min(count - 1, at)) : 0;
}

export const WELCOME_BEATS = panelBeats('/tour/welcome', ['What you leave with', 'The ninety minutes', 'How we will work']);
export const WRAP_BEATS = panelBeats('/tour/wrap', ['What we saw', 'What to ask of your own estate', 'Take it with you, then questions']);
