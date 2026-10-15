/** Presenter mode is remembered in a cookie, so a reload, a new tab and the server-rendered page all agree. */
export const MODE_COOKIE = 'tour-mode';
export const MODE_MAX_AGE = 60 * 60 * 24 * 365;

export type Mode = 'present' | 'read';

/** `present` or `read`, from a query parameter or a cookie; anything else is "not said". */
export function parseMode(value: string | null | undefined): Mode | null {
  return value === 'present' || value === 'read' ? value : null;
}

/** Which mode a request is in: the link's own say-so first, then the cookie, and reading when neither says. */
export function modeOf(asked: string | null | undefined, remembered: string | null | undefined): Mode {
  return parseMode(asked) ?? parseMode(remembered) ?? 'read';
}
