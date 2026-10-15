import { MODE_COOKIE, MODE_MAX_AGE, modeOf, parseMode } from '$lib/tour/mode';
import type { LayoutServerLoad } from './$types';

/**
 * The server renders the chrome the visitor chose the first time, so there is no flash of the step bar on a screen
 * that is being presented. `?mode=present` and `?mode=read` choose it from a link, and the choice is remembered.
 */
export const load: LayoutServerLoad = ({ cookies, url }) => {
  const asked = parseMode(url.searchParams.get('mode'));
  if (asked) cookies.set(MODE_COOKIE, asked, { path: '/', maxAge: MODE_MAX_AGE, sameSite: 'lax', httpOnly: false });
  return { present: modeOf(asked, cookies.get(MODE_COOKIE)) === 'present' };
};
