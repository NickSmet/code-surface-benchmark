import { MODE_MAX_AGE } from './mode';
import type { Format } from './screens';

/**
 * Which talk the visitor is giving: the tour or the workshop. Remembered in a cookie, like the mode, so a reload, a new
 * tab and the server-rendered page agree on which screens there are.
 */
export const FORMAT_COOKIE = 'tour-format';
export const FORMAT_MAX_AGE = MODE_MAX_AGE;

/** `tour` or `workshop`, from a query parameter or a cookie; anything else is "not said". */
export function parseFormat(value: string | null | undefined): Format | null {
  return value === 'tour' || value === 'workshop' ? value : null;
}

/** Which format a request is in: the link's own say-so first, then the cookie, and the tour when neither says. */
export function formatOf(asked: string | null | undefined, remembered: string | null | undefined): Format {
  return parseFormat(asked) ?? parseFormat(remembered) ?? 'tour';
}
