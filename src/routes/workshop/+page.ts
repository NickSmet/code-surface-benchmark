import { redirect } from '@sveltejs/kit';

/**
 * The one address to open for the workshop: the welcome screen, in the workshop's format and presented.
 * `/tour/welcome?format=workshop&mode=read` is the same walk with the step bar and the Back and Next buttons.
 */
export function load(): never {
  redirect(307, '/tour/welcome?mode=present&format=workshop');
}
