/**
 * Token arithmetic for the tour.
 *
 * Same convention the benchmark itself uses when no provider reports usage
 * (see agent/loop.ts and agent/providers/stub.ts): `ceil(chars / 4)`. It is an
 * estimate, so every place the tour shows it labels it "≈".
 */

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** `1234` → "1,234"; `28113` → "28.1k" (only above 10k, where the digits stop mattering). */
export function fmtTokens(n: number): string {
  const v = Math.round(n);
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return v.toLocaleString('en-US');
}

/** "≈ 1,234 tok" — the unit chip used across the tour. */
export function approxTokens(n: number): string {
  return `≈ ${fmtTokens(n)} tok`;
}
