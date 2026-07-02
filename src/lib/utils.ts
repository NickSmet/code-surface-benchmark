import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Compact integer formatting: 1234 -> "1,234". */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** USD with enough precision to be meaningful at tiny per-task costs. */
export function fmtUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(3);
  return '$' + n.toFixed(2);
}

/** Milliseconds -> "1.2s" / "840ms". */
export function fmtMs(ms: number): string {
  if (ms < 1000) return Math.round(ms) + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

/** "8.4x" style ratio, guarding divide-by-zero. */
export function fmtRatio(bigger: number, smaller: number): string | null {
  if (!smaller || !bigger) return null;
  const r = bigger / smaller;
  if (!isFinite(r) || r <= 1.05) return null;
  return r.toFixed(r >= 10 ? 0 : 1) + 'x';
}
