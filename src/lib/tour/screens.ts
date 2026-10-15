/**
 * The screens of the tour, in the order the talk takes them. One list, so the step bar, the presenter's rail and
 * the keys that cross from one screen to the next can never disagree about what comes after what.
 */
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
}

export const SCREENS: readonly TourScreen[] = [
  { id: 'estate', href: '/tour/estate', end: '/tour/estate?lens=context', title: 'The estate', hint: '194 things, many ways to look' },
  { id: 'tools', href: '/tour/tools', end: '/tour/tools?step=999', title: 'Naive tools', hint: 'One call at a time' },
  { id: 'strains', href: '/tour/strains', end: '/tour/strains?at=10', title: 'Where it strains', hint: 'Each question strains the tools somewhere else' },
  { id: 'language', href: '/tour/language', end: '/tour/language?rung=code', title: 'A language', hint: 'The catalogue grows up' },
  { id: 'object', href: '/tour/object', end: '/tour/object?step=10', title: 'The object', hint: 'Reshape the estate into plain data' },
  { id: 'code', href: '/tour/code', end: '/tour/code?ex=break&step=2', title: 'Code surface', hint: 'Programs over the object' },
  { id: 'results', href: '/tour/results', end: '/tour/results?show=why', title: 'Results', hint: 'How each method holds up as the model gets weaker' }
];

/** The screen a path belongs to, or -1 for anything else (`/tour` itself, say). */
export function screenIndexOf(pathname: string): number {
  return SCREENS.findIndex((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
}

/**
 * The screen `delta` places from the one the path is on, or null at either end of the talk.
 * Going forward you arrive at its first beat, going back at its last: it is one deck, walked in either direction.
 */
export function crossTo(pathname: string, delta: 1 | -1): { screen: TourScreen; href: string } | null {
  const i = screenIndexOf(pathname);
  const next = SCREENS[i + delta];
  if (i < 0 || !next) return null;
  return { screen: next, href: delta > 0 ? next.href : next.end };
}
