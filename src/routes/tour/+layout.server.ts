import { FORMAT_COOKIE, FORMAT_MAX_AGE, formatOf, parseFormat } from '$lib/tour/format';
import { MODE_COOKIE, MODE_MAX_AGE, modeOf, parseMode } from '$lib/tour/mode';
import type { LayoutServerLoad } from './$types';

/**
 * The server renders the chrome the visitor chose the first time, so there is no flash of the step bar on a screen
 * that is being presented, and no wrong list of screens. `?mode=present|read` and `?format=tour|workshop` choose them
 * from a link, and the choices are remembered. Each reads only its own parameter, so the load does not run again
 * when the visitor moves from one screen to the next.
 */
export const load: LayoutServerLoad = ({ cookies, url }) => {
  const mode = parseMode(url.searchParams.get('mode'));
  if (mode) cookies.set(MODE_COOKIE, mode, { path: '/', maxAge: MODE_MAX_AGE, sameSite: 'lax', httpOnly: false });
  const format = parseFormat(url.searchParams.get('format'));
  if (format) cookies.set(FORMAT_COOKIE, format, { path: '/', maxAge: FORMAT_MAX_AGE, sameSite: 'lax', httpOnly: false });
  return {
    present: modeOf(mode, cookies.get(MODE_COOKIE)) === 'present',
    format: formatOf(format, cookies.get(FORMAT_COOKIE))
  };
};
