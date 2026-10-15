/**
 * The screens of the tour, in the order the talk takes them. One list, so the step bar, the presenter's rail and
 * the keys that cross from one screen to the next can never disagree about what comes after what.
 *
 * There are two talks. The tour is seven screens, about twenty minutes. The workshop is the same seven with three
 * more around them (a welcome, a screen to work on, and the questions) for ninety. A visitor is in one or the other
 * (see `format.ts`), and `screensOf` is the list that visitor walks.
 */
export type Format = 'tour' | 'workshop';

/** What marks a screen in the step bar when it has no number: the three that only the workshop has. */
export type Mark = 'welcome' | 'turn' | 'wrap';

export interface TourScreen {
  /** The path segment: the screen lives at `/tour/<id>`. */
  id: string;
  /** Where the screen opens: its first beat. */
  href: string;
  /** Where it opens when somebody arrives from the screen after it: its last beat. A test holds each one to the screen's real last beat; the replay's has no fixed length, so it says "far enough" and the screen clamps. */
  end: string;
  title: string;
  /** One line: the tooltip of the step bar, and what the rail says when the talk gets here. */
  hint: string;
  /** The screen's number in the talk (the 3 of "③ Where it strains"), which does not change with the format. Absent on the workshop's own screens. */
  n?: number;
  mark?: Mark;
}

/** The tour: seven screens. */
export const SCREENS: readonly TourScreen[] = [
  { id: 'estate', n: 1, href: '/tour/estate', end: '/tour/estate?lens=context', title: 'The estate', hint: '194 things, many ways to look' },
  { id: 'tools', n: 2, href: '/tour/tools', end: '/tour/tools?step=999', title: 'Naive tools', hint: 'One call at a time' },
  { id: 'strains', n: 3, href: '/tour/strains', end: '/tour/strains?at=10', title: 'Where it strains', hint: 'Each question strains the tools somewhere else' },
  { id: 'language', n: 4, href: '/tour/language', end: '/tour/language?rung=code', title: 'A language', hint: 'The catalogue grows up' },
  { id: 'object', n: 5, href: '/tour/object', end: '/tour/object?step=10', title: 'The object', hint: 'Reshape the estate into plain data' },
  { id: 'code', n: 6, href: '/tour/code', end: '/tour/code?ex=break&step=2', title: 'Code surface', hint: 'Programs over the object' },
  { id: 'results', n: 7, href: '/tour/results', end: '/tour/results?show=why', title: 'Results', hint: 'How each method holds up as the model gets weaker' }
];

const WELCOME: TourScreen = { id: 'welcome', mark: 'welcome', href: '/tour/welcome', end: '/tour/welcome?at=2', title: 'Welcome', hint: 'What you leave with, and how we will work' };
const TURN: TourScreen = { id: 'turn', mark: 'turn', href: '/tour/turn', end: '/tour/turn?ex=rule&step=1', title: 'Your turn', hint: 'Change a program, predict what moves' };
const WRAP: TourScreen = { id: 'wrap', mark: 'wrap', href: '/tour/wrap', end: '/tour/wrap?at=2', title: 'Questions', hint: 'What to take away, then your questions' };

/** The workshop: the tour, with a welcome before it, a turn at the keyboard after the code surface, and the questions last. */
export const WORKSHOP_SCREENS: readonly TourScreen[] = [WELCOME, ...SCREENS.slice(0, 6), TURN, SCREENS[6], WRAP];

export const screensOf = (format: Format): readonly TourScreen[] => (format === 'workshop' ? WORKSHOP_SCREENS : SCREENS);

/** The screens that exist only in the workshop. Opening one of them puts the visitor in it. */
export const WORKSHOP_ONLY: readonly string[] = [WELCOME.id, TURN.id, WRAP.id];

const underPath = (pathname: string, href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);

export const isWorkshopPath = (pathname: string): boolean => WORKSHOP_SCREENS.some((s) => WORKSHOP_ONLY.includes(s.id) && underPath(pathname, s.href));

/** The screen a path belongs to, or -1 for anything else (`/tour` itself, say). */
export function screenIndexOf(pathname: string, screens: readonly TourScreen[] = SCREENS): number {
  return screens.findIndex((s) => underPath(pathname, s.href));
}

/**
 * The screen `delta` places from the one the path is on, or null at either end of the talk.
 * Going forward you arrive at its first beat, going back at its last: it is one deck, walked in either direction.
 */
export function crossTo(pathname: string, delta: 1 | -1, screens: readonly TourScreen[] = SCREENS): { screen: TourScreen; href: string } | null {
  const i = screenIndexOf(pathname, screens);
  const next = screens[i + delta];
  if (i < 0 || !next) return null;
  return { screen: next, href: delta > 0 ? next.href : next.end };
}
