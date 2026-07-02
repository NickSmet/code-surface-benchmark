/**
 * OpenAI / Azure OpenAI Chat Completions provider.
 *
 * Plain `fetch`, no SDK. Reads `usage` off every response and returns it,
 * so the loop can sum billed tokens across every round trip.
 *
 * Configuration, in precedence order:
 *   1. Azure OpenAI — when AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY are
 *      both set (a deployment is how Azure names the model; defaults to
 *      OPENAI_MODEL if AZURE_OPENAI_DEPLOYMENT is unset).
 *   2. Plain OpenAI — OPENAI_API_KEY is all you need. OPENAI_MODEL and
 *      OPENAI_BASE_URL are optional; a base URL alone (no key) also works,
 *      for local OpenAI-compatible servers (Ollama, LM Studio, vLLM).
 *
 * Returns null when neither is configured; the caller falls back to the
 * deterministic stub so the UI still runs offline.
 */

import type { ChatTurnArgs, ChatTurnResult, ProviderClient, ProviderToolCall, Usage } from './types';

export type OpenAiEnv = Record<string, string | undefined>;

const DEFAULT_MODEL = 'gpt-5.4-mini';

// Blank env vars (VAR= or VAR="" lines) must read as unset, not empty strings.
const read = (value: string | undefined): string | undefined =>
  value && value.trim() !== '' ? value : undefined;

export function createOpenAiProvider(env: OpenAiEnv): ProviderClient | null {
  const azureEndpoint = read(env.AZURE_OPENAI_ENDPOINT);
  const azureApiKey = read(env.AZURE_OPENAI_API_KEY);
  const openaiApiKey = read(env.OPENAI_API_KEY);
  const openaiBaseUrl = read(env.OPENAI_BASE_URL);
  const baseUrl = openaiBaseUrl ?? 'https://api.openai.com/v1';

  const isAzure = !!azureEndpoint && !!azureApiKey;
  // Local OpenAI-compatible servers usually ignore auth, so a custom base URL
  // counts as configured even without a key.
  const apiKey = isAzure ? azureApiKey : (openaiApiKey ?? (openaiBaseUrl ? 'sk-local' : undefined));
  if (!apiKey) return null;

  const model =
    read(env.OPENAI_MODEL) ??
    read(env.AZURE_OPENAI_DEPLOYMENT) ??
    DEFAULT_MODEL;
  const azureDeployment = read(env.AZURE_OPENAI_DEPLOYMENT) ?? model;
  const azureApiVersion = read(env.AZURE_OPENAI_API_VERSION) ?? '2024-08-01-preview';

  function endpoint(): string {
    if (isAzure) {
      const ep = azureEndpoint!.replace(/\/+$/, '');
      return `${ep}/openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;
    }
    return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  function authHeaders(): Record<string, string> {
    if (isAzure) return { 'api-key': apiKey! };
    return { Authorization: `Bearer ${apiKey}` };
  }

  return {
    label: isAzure ? `azure:${azureDeployment}` : `openai:${model}`,
    model,
    isStub: false,
    async chatTurn(args: ChatTurnArgs): Promise<ChatTurnResult> {
      // Reasoning models (gpt-5*, o-series) only allow the default temperature
      // and spend completion budget on hidden reasoning tokens — so omit
      // temperature and give generous headroom to avoid truncated/empty turns.
      const isReasoning = /gpt-5|gpt-4\.5|^o\d/i.test(model);
      const body: Record<string, unknown> = {
        model,
        messages: [{ role: 'system', content: args.systemPrompt }, ...args.messages],
        max_completion_tokens: 16000
      };
      if (!isReasoning) body.temperature = 0;
      if (args.tools && args.tools.length > 0) {
        body.tools = args.tools;
        body.tool_choice = 'auto';
      }

      const resp = await fetch(endpoint(), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 600)}`);
      }
      const json = (await resp.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
          };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
        };
      };
      const choice = json.choices?.[0]?.message;
      const toolCalls: ProviderToolCall[] =
        choice?.tool_calls?.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments }
        })) ?? [];

      const usage: Usage = {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        cachedPromptTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens:
          json.usage?.total_tokens ??
          (json.usage?.prompt_tokens ?? 0) + (json.usage?.completion_tokens ?? 0)
      };

      return { content: choice?.content ?? '', toolCalls, usage };
    }
  };
}
