/**
 * Thin provider interface — Azure OpenAI / OpenAI / deterministic stub behind
 * one shape. Mirrors the subset of the Chat Completions wire format we need,
 * plus token `usage` (the bit a benchmark lives and dies by).
 */

export type ProviderMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ProviderToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ProviderToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ToolSchema = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type Usage = {
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ChatTurnArgs = {
  systemPrompt: string;
  messages: Array<Exclude<ProviderMessage, { role: 'system' }>>;
  tools?: ToolSchema[];
};

export type ChatTurnResult = {
  content: string;
  toolCalls: ProviderToolCall[];
  usage: Usage;
};

export interface ProviderClient {
  chatTurn(args: ChatTurnArgs): Promise<ChatTurnResult>;
  /** Human-readable label, e.g. "azure:gpt-4o". */
  readonly label: string;
  /** Underlying model name, used to look up pricing. */
  readonly model: string;
  /** True for the deterministic offline stub. */
  readonly isStub: boolean;
}

export const ZERO_USAGE: Usage = { promptTokens: 0, cachedPromptTokens: 0, completionTokens: 0, totalTokens: 0 };
