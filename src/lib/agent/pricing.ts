/**
 * Per-model token pricing (USD per 1M tokens) for the cost column.
 *
 * OpenAI reports cache hits as a subset of input tokens, so we bill prompt
 * tokens as: uncached input + cached input + output. Override per-deployment
 * with BENCH_PRICE_INPUT_PER_M / BENCH_PRICE_CACHED_INPUT_PER_M /
 * BENCH_PRICE_OUTPUT_PER_M in .env when Azure billing differs from the public
 * OpenAI list price.
 */

export type Price = { inputPerM: number; cachedInputPerM: number; outputPerM: number };
export type PriceBook = Price & {
  longContext?: Price;
  longContextThresholdTokens: number;
};

export type UsageForCost = {
  promptTokens: number;
  cachedPromptTokens?: number;
  completionTokens: number;
};

const LONG_CONTEXT_THRESHOLD_TOKENS = 270_000;

const price = (inputPerM: number, cachedInputPerM: number, outputPerM: number): Price => ({
  inputPerM,
  cachedInputPerM,
  outputPerM
});

const book = (shortContext: Price, longContext?: Price): PriceBook => ({
  ...shortContext,
  longContext,
  longContextThresholdTokens: LONG_CONTEXT_THRESHOLD_TOKENS
});

const TABLE: Array<{ match: RegExp; price: PriceBook }> = [
  // OpenAI Standard pricing, current detailed pricing table.
  { match: /gpt-5\.5-pro/i, price: book(price(30, 30, 180), price(60, 60, 270)) },
  { match: /gpt-5\.5/i, price: book(price(5, 0.5, 30), price(10, 1, 45)) },
  { match: /gpt-5\.4-pro/i, price: book(price(30, 30, 180), price(60, 60, 270)) },
  { match: /gpt-5\.4-mini/i, price: book(price(0.75, 0.075, 4.5)) },
  { match: /gpt-5\.4-nano/i, price: book(price(0.2, 0.02, 1.25)) },
  { match: /gpt-5\.4/i, price: book(price(2.5, 0.25, 15), price(5, 0.5, 22.5)) },

  // Compatibility fallbacks for older deployments this benchmark has used.
  { match: /gpt-5[.\d]*-nano/i, price: book(price(0.05, 0.005, 0.4)) },
  { match: /gpt-5[.\d]*-mini/i, price: book(price(0.25, 0.025, 2.0)) },
  { match: /gpt-5/i, price: book(price(1.25, 0.125, 10.0)) },
  { match: /gpt-4o-mini/i, price: book(price(0.15, 0.075, 0.6)) },
  { match: /gpt-4o/i, price: book(price(2.5, 1.25, 10)) },
  { match: /gpt-4\.1-mini/i, price: book(price(0.4, 0.1, 1.6)) },
  { match: /gpt-4\.1/i, price: book(price(2.0, 0.5, 8.0)) },
  { match: /o4-mini|o3-mini/i, price: book(price(1.1, 0.275, 4.4)) }
];

const FALLBACK: PriceBook = book(price(2.5, 2.5, 10));

function finiteNumber(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function priceFor(model: string, env: Record<string, string | undefined> = {}): PriceBook {
  const inOverride = finiteNumber(env.BENCH_PRICE_INPUT_PER_M);
  const cachedOverride = finiteNumber(env.BENCH_PRICE_CACHED_INPUT_PER_M);
  const outOverride = finiteNumber(env.BENCH_PRICE_OUTPUT_PER_M);

  if (inOverride != null && outOverride != null) {
    const shortContext = price(inOverride, cachedOverride ?? inOverride, outOverride);
    const longInOverride = finiteNumber(env.BENCH_PRICE_LONG_INPUT_PER_M);
    const longCachedOverride = finiteNumber(env.BENCH_PRICE_LONG_CACHED_INPUT_PER_M);
    const longOutOverride = finiteNumber(env.BENCH_PRICE_LONG_OUTPUT_PER_M);
    const thresholdOverride = finiteNumber(env.BENCH_LONG_CONTEXT_THRESHOLD_TOKENS);
    return {
      ...shortContext,
      longContext:
        longInOverride != null && longOutOverride != null
          ? price(longInOverride, longCachedOverride ?? longInOverride, longOutOverride)
          : undefined,
      longContextThresholdTokens: thresholdOverride ?? LONG_CONTEXT_THRESHOLD_TOKENS
    };
  }

  const hit = TABLE.find((t) => t.match.test(model));
  return hit?.price ?? FALLBACK;
}

function priceForUsage(usage: UsageForCost, prices: PriceBook): Price {
  if (prices.longContext && usage.promptTokens >= prices.longContextThresholdTokens) {
    return prices.longContext;
  }
  return prices;
}

export function costUsd(usage: UsageForCost, prices: PriceBook): number {
  const cachedPromptTokens = Math.max(0, Math.min(usage.cachedPromptTokens ?? 0, usage.promptTokens));
  const uncachedPromptTokens = Math.max(0, usage.promptTokens - cachedPromptTokens);
  const p = priceForUsage(usage, prices);

  return (
    (uncachedPromptTokens * p.inputPerM +
      cachedPromptTokens * p.cachedInputPerM +
      usage.completionTokens * p.outputPerM) /
    1_000_000
  );
}
