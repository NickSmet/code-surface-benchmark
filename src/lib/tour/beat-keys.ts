/**
 * What the keys do while the tour is being presented. Pure functions over a key event and a position, so the rules
 * live in one place and are the same on every screen, whatever each screen calls its steps.
 */

/** The parts of a keyboard event that matter here, so the rules can be tested without a browser. */
export interface KeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/** Whether a key press is meant for the thing that has focus: a text field, a select, an editable block. */
export function typingIn(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!el && (el.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName ?? ''));
}

// ── among the steps of one screen ────────────────────────────────────────

export type BeatAction = 'next' | 'back' | 'group-next' | 'group-back' | 'first' | 'last';

/**
 * Arrow, Page and Space keys step; Shift jumps a whole group (an example, a turn, a rung); Home and End go to the ends.
 * Space is a step too, but a screen decides whether it is allowed to be: on a button it presses the button.
 */
export function beatActionFor(e: KeyLike): BeatAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  switch (e.key) {
    case 'ArrowRight':
      return e.shiftKey ? 'group-next' : 'next';
    case 'ArrowLeft':
      return e.shiftKey ? 'group-back' : 'back';
    case 'PageDown':
      return 'next';
    case 'PageUp':
      return 'back';
    case ' ':
      return e.shiftKey ? 'back' : 'next';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

/** Where an action leads: to another step of this screen, or off the end of it. */
export type Move = { to: number } | { cross: 1 | -1 };

/**
 * Where `action` goes from step `at`. `groups[i]` names the group step i belongs to; neighbours with the same name are one group.
 * Stepping past either end crosses to the screen on that side. Home and End stay where they are when they are already there.
 */
export function moveFor(action: BeatAction, at: number, groups: readonly string[]): Move | null {
  const last = groups.length - 1;
  switch (action) {
    case 'next':
      return at < last ? { to: at + 1 } : { cross: 1 };
    case 'back':
      return at > 0 ? { to: at - 1 } : { cross: -1 };
    case 'first':
      return at > 0 ? { to: 0 } : null;
    case 'last':
      return at < last ? { to: last } : null;
    case 'group-next': {
      const next = groups.findIndex((g, i) => i > at && g !== groups[at]);
      return next >= 0 ? { to: next } : { cross: 1 };
    }
    case 'group-back': {
      // Back to the start of this group; from its start, to the start of the one before it.
      const startOf = (i: number): number => {
        let s = i;
        while (s > 0 && groups[s - 1] === groups[i]) s -= 1;
        return s;
      };
      const start = startOf(at);
      if (start < at) return { to: start };
      return at === 0 ? { cross: -1 } : { to: startOf(at - 1) };
    }
  }
}

// ── across the talk ──────────────────────────────────────────────────────

export type GlobalAction = { screen: 1 | -1 } | 'present' | 'help' | 'fullscreen' | 'close';

/**
 * Screens: Option or Alt with an arrow, Command or Control with Shift and an arrow, or the bracket keys, which a clicker can be set to send.
 * P turns presenter mode on and off, H or ? shows the keys, F goes full screen, Escape closes what is open.
 */
export function globalActionFor(e: KeyLike): GlobalAction | null {
  const arrow = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (arrow !== 0) {
    const option = !!e.altKey && !e.metaKey && !e.ctrlKey;
    const command = (!!e.metaKey || !!e.ctrlKey) && !!e.shiftKey && !e.altKey;
    return option || command ? { screen: arrow } : null;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  switch (e.key) {
    case ']':
      return { screen: 1 };
    case '[':
      return { screen: -1 };
    case 'p':
    case 'P':
      return 'present';
    case 'h':
    case 'H':
    case '?':
      return 'help';
    case 'f':
    case 'F':
      return 'fullscreen';
    case 'Escape':
      return 'close';
    default:
      return null;
  }
}
