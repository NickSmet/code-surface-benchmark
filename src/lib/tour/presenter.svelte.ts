import { getContext, setContext } from 'svelte';
import { FORMAT_COOKIE, FORMAT_MAX_AGE } from './format';
import { MODE_COOKIE, MODE_MAX_AGE } from './mode';
import { screensOf, type Format, type TourScreen } from './screens';

/** Where the screen on show is, for the progress along the top of the page. */
export interface BeatReport {
  at: number;
  count: number;
}

/** What the pop under the rail says: the screen the talk has just arrived at, or a note about the mode. */
export type Pop = { id: number; note: string | null };

/**
 * Presenter mode: the same tour with the chrome taken away. One of these per render of the tour layout, handed down
 * by context rather than kept in a module, so a server rendering two visitors at once never mixes them up.
 */
export class Presenter {
  /** The chrome is out of the way: a thin rail along the top, no Back and Next, and the stage takes what is left. */
  on = $state(false);
  /** The tour or the workshop: which screens there are, and so what the rail, the bar and the keys walk. */
  format = $state<Format>('tour');
  helpOpen = $state(false);
  /** Raw, not proxied: `release` compares the report it is given with this one by identity. */
  beat = $state.raw<BeatReport | null>(null);
  pop = $state<Pop | null>(null);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #seq = 0;

  constructor(on: boolean, format: Format = 'tour') {
    this.on = on;
    this.format = format;
  }

  /** The screens of the talk being given. */
  get screens(): readonly TourScreen[] {
    return screensOf(this.format);
  }

  setFormat(format: Format): void {
    this.format = format;
    if (typeof document !== 'undefined') {
      document.cookie = `${FORMAT_COOKIE}=${format}; path=/; max-age=${FORMAT_MAX_AGE}; samesite=lax`;
    }
  }

  /** Called by a screen whenever it moves, so the rail can show how far through the screen the talk is. */
  report(b: BeatReport | null): void {
    this.beat = b;
  }

  /**
   * A screen that goes takes its report with it, but only its own: a screen that is leaving can outlast the one that is
   * arriving by a fade, and must not clear what the new one has already said.
   */
  release(b: BeatReport): void {
    if (this.beat === b) this.beat = null;
  }

  setOn(on: boolean): void {
    this.on = on;
    if (typeof document !== 'undefined') {
      document.cookie = `${MODE_COOKIE}=${on ? 'present' : 'read'}; path=/; max-age=${MODE_MAX_AGE}; samesite=lax`;
    }
  }

  toggle(): void {
    this.setOn(!this.on);
    this.flash(this.on ? 'Presenter mode. \u2190 \u2192 step \u00b7 \u2325\u2190 \u2325\u2192 screen \u00b7 H keys \u00b7 P to leave' : 'Reading mode', 2600);
  }

  /** Show the step bar for a moment, larger than it is at rest, with a line under it. */
  flash(note: string | null = null, ms = 1900): void {
    const id = ++this.#seq;
    this.pop = { id, note };
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (this.#seq === id) this.pop = null;
    }, ms);
  }

  dismiss(): void {
    this.#seq += 1;
    clearTimeout(this.#timer);
    this.pop = null;
  }
}

const KEY = Symbol('tour-presenter');

export function providePresenter(p: Presenter): Presenter {
  return setContext(KEY, p);
}

/** The tour's presenter. An inert one outside the tour layout, so a component never has to ask whether there is one. */
export function usePresenter(): Presenter {
  return getContext<Presenter | undefined>(KEY) ?? new Presenter(false);
}
