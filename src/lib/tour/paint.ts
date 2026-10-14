/**
 * How a touch becomes pixels. The map itself is a dumb renderer: parents hand
 * it a `Paint` per resource. These helpers keep the touch colours identical on
 * every screen.
 */

import { dominantKind, type TouchKind, type TouchMark } from './touch';

export interface Paint {
  /** Cell background. Omit for the neutral base. */
  fill?: string;
  /** Outline colour (scan ring). */
  ring?: string;
  ringStyle?: 'solid' | 'dashed';
  /**
   * The question depends on this resource. The map draws it as a dashed outline
   * around the whole pod (a VM is its NIC, IP and disks, not just the square).
   */
  needle?: boolean;
  /** Fade the cell out hard (legend emphasis: "everything that is not this"). */
  dim?: boolean;
  /** Fade the cell out softly (the question does not need this resource). */
  faint?: boolean;
  /** Mark the cell as freshly changed by the current step (pop animation). */
  fresh?: boolean;
}

export const COLORS = {
  neutral: '#E2E8F0',
  neutralStrong: '#CBD5E1',
  listed: '#BFC4FA',
  read: '#6366F1',
  scanned: '#0D9488',
  written: '#059669',
  needle: '#0F172A'
} as const;

export const KIND_LABEL: Record<TouchKind, string> = {
  listed: 'Summary in context',
  read: 'Full record in context',
  scanned: 'Scanned by runtime',
  written: 'Changed'
};

/** The same four words on the legend chips and on a pod's rows. */
export const KIND_SHORT: Record<TouchKind, string> = {
  listed: 'summary',
  read: 'full read',
  scanned: 'scanned',
  written: 'changed'
};

export const KIND_HINT: Record<TouchKind, string> = {
  listed: 'A one-line summary of the resource entered the model\u2019s context.',
  read: 'The whole record entered the model\u2019s context.',
  scanned: 'Code read it inside the runtime. The model never saw it.',
  written: 'A field was changed.'
};

export interface TouchPaintOptions {
  /** Highlight only this kind; everything else fades. */
  emphasis?: TouchKind | null;
  /** Resources the question actually needs (drawn as a dashed outline round the pod). */
  needle?: ReadonlySet<string>;
  /** Step that is currently being shown, to flag its resources as fresh. */
  currentStep?: number;
}

export function touchPaint(resourceId: string, mark: TouchMark | undefined, opts: TouchPaintOptions = {}): Paint {
  const paint: Paint = {};
  const kind = dominantKind(mark);
  if (kind === 'written') paint.fill = COLORS.written;
  else if (kind === 'read') paint.fill = COLORS.read;
  else if (kind === 'listed') paint.fill = COLORS.listed;

  if (mark?.scanned !== undefined) {
    paint.ring = COLORS.scanned;
    paint.ringStyle = 'solid';
  }
  // The needle is its own flag, not a ring: the map outlines the whole pod, so it
  // stays visible on top of a scan ring instead of replacing it.
  if (opts.needle?.has(resourceId)) paint.needle = true;
  if (opts.emphasis) {
    const has = mark?.[opts.emphasis] !== undefined;
    if (!has) paint.dim = true;
  }
  if (opts.currentStep !== undefined && mark?.steps.includes(opts.currentStep)) paint.fresh = true;
  return paint;
}
