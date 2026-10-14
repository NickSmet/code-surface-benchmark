/**
 * Limits of the benchmark's agent loop that other code needs to know about.
 * Kept apart from the loop itself so the tour can import it without pulling
 * the loop, the surfaces and the pricing table into the browser bundle.
 */

/** Model turns a run gets. A model that has not finished by then is stopped and the run fails. */
export const MAX_ITERATIONS = 16;
