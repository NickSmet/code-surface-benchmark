/**
 * Replay engine: run a scripted "model" against a surface and account for
 * everything it puts into the context window.
 *
 * Nothing here calls an LLM. The script stands in for the model's decisions
 * (which tool next, with what arguments); every tool result is computed by
 * the real handlers over the real fixture, and tokens are billed the way the
 * benchmark's own loop bills them: each model turn re-sends the system
 * prompt, the tool schemas and the whole transcript so far
 * (`ceil(chars / 4)`, see agent/providers/stub.ts).
 */

import type { ProviderMessage, ProviderToolCall, ToolSchema } from '$lib/agent/providers/types';
import type { ChangeRow } from '$lib/inventory/projection';
import type { Inventory } from '$lib/inventory/types';
import { estimateTokens } from './tokens';
import type { TouchEvent } from './touch';

export interface SimResult {
  /** Exactly the text that goes back into the model's context. */
  content: string;
  /** One-line human preview. */
  preview: string;
  error?: boolean;
  diff?: ChangeRow[];
  touches: Array<Omit<TouchEvent, 'step'>>;
}

export interface SimSurface {
  id: string;
  label: string;
  systemPrompt: string;
  tools: ToolSchema[];
  /** The run's own copy of the estate; writes land here. */
  inventory: Inventory;
  dispatch(name: string, args: Record<string, unknown>): SimResult;
  applyDiff?(rows: ChangeRow[]): void;
}

export interface ReplayCall {
  /** 1-based position across the whole run. */
  step: number;
  /** Model turn that emitted this call (calls in one turn are parallel). */
  turn: number;
  id: string;
  name: string;
  args: Record<string, unknown>;
  argsText: string;
  /** Tokens the model generated to make this call. */
  callTokens: number;
  content: string;
  preview: string;
  /** Tokens the result added to the transcript. */
  resultTokens: number;
  error?: boolean;
  diff?: ChangeRow[];
  touches: TouchEvent[];
}

export interface PromptParts {
  system: number;
  tools: number;
  user: number;
  /** Model-generated tool calls already in the transcript. */
  calls: number;
  /** Tool results already in the transcript. */
  results: number;
}

export interface ReplayTurn {
  n: number;
  calls: ReplayCall[];
  /** The model's reply text — only the last turn has one. */
  text: string;
  promptTokens: number;
  completionTokens: number;
  parts: PromptParts;
}

export interface ReplayTotals {
  turns: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  billedTokens: number;
  /** Tokens of tool results over the whole run (each counted once). */
  resultTokens: number;
  /** system prompt + tool schemas: re-sent on every turn. */
  fixedTokens: number;
  schemaTokens: number;
  answerTokens: number;
}

export interface Replay {
  surfaceId: string;
  task: string;
  turns: ReplayTurn[];
  calls: ReplayCall[];
  touches: TouchEvent[];
  finalText: string;
  totals: ReplayTotals;
  /** The run's copy of the estate after all writes. */
  inventory: Inventory;
}

export interface ScriptApi {
  /** The snapshot time the system prompt tells the model about. */
  readonly snapshotAt: string;
  /** One call in its own turn — use when the next call depends on this result. */
  call<T = Record<string, any>>(name: string, args?: Record<string, unknown>): T;
  /** Independent calls emitted together in one turn (parallel tool calls). */
  parallel<T = Record<string, any>>(calls: ReadonlyArray<readonly [string, Record<string, unknown>]>): T[];
}

export interface ReplayOptions {
  /** Upper bound on calls per model turn for `parallel()`. Default: unlimited. */
  batchSize?: number;
}

export function callId(step: number): string {
  return `call_${String(step).padStart(4, '0')}`;
}

type Message = Exclude<ProviderMessage, { role: 'system' }>;

function chars(m: Message): number {
  return JSON.stringify(m).length;
}

export function runReplay(
  surface: SimSurface,
  task: string,
  script: (api: ScriptApi) => string,
  options: ReplayOptions = {}
): Replay {
  const messages: Message[] = [{ role: 'user', content: task }];
  const turns: ReplayTurn[] = [];
  const calls: ReplayCall[] = [];
  const touches: TouchEvent[] = [];
  const toolsChars = JSON.stringify(surface.tools).length;
  const systemChars = surface.systemPrompt.length;
  const batchSize = Math.max(1, options.batchSize ?? Infinity);

  const snapshot = (): { tokens: number; parts: PromptParts } => {
    let user = 0;
    let callChars = 0;
    let resultChars = 0;
    for (const m of messages) {
      if (m.role === 'user') user += chars(m);
      else if (m.role === 'assistant') callChars += chars(m);
      else resultChars += chars(m);
    }
    return {
      tokens: Math.ceil((systemChars + toolsChars + user + callChars + resultChars) / 4),
      parts: {
        system: Math.ceil(systemChars / 4),
        tools: Math.ceil(toolsChars / 4),
        user: Math.ceil(user / 4),
        calls: Math.ceil(callChars / 4),
        results: Math.ceil(resultChars / 4)
      }
    };
  };

  const runTurn = (batch: ReadonlyArray<readonly [string, Record<string, unknown>]>): Array<Record<string, any>> => {
    const turn = turns.length + 1;
    const prompt = snapshot();
    const toolCalls: ProviderToolCall[] = batch.map(([name, args], i) => ({
      id: callId(calls.length + i + 1),
      type: 'function',
      function: { name, arguments: JSON.stringify(args) }
    }));
    const completionTokens = toolCalls.reduce((n, tc) => n + estimateTokens(tc.function.name + tc.function.arguments), 0);
    messages.push({ role: 'assistant', content: '', tool_calls: toolCalls });

    const turnCalls: ReplayCall[] = [];
    const parsed: Array<Record<string, any>> = [];
    toolCalls.forEach((tc, i) => {
      const [name, args] = batch[i];
      const step = calls.length + 1;
      const res = surface.dispatch(name, args);
      if (res.diff && res.diff.length > 0 && !res.error) surface.applyDiff?.(res.diff);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: res.content });
      const events: TouchEvent[] = res.touches.map((t) => ({ ...t, step }));
      const call: ReplayCall = {
        step,
        turn,
        id: tc.id,
        name,
        args,
        argsText: tc.function.arguments,
        callTokens: estimateTokens(tc.function.name + tc.function.arguments),
        content: res.content,
        preview: res.preview,
        resultTokens: estimateTokens(res.content),
        error: res.error,
        diff: res.diff,
        touches: events
      };
      calls.push(call);
      turnCalls.push(call);
      touches.push(...events);
      parsed.push(safeParse(res.content));
    });

    turns.push({ n: turn, calls: turnCalls, text: '', promptTokens: prompt.tokens, completionTokens, parts: prompt.parts });
    return parsed;
  };

  const api: ScriptApi = {
    snapshotAt: surface.inventory.generatedAt,
    call: <T>(name: string, args: Record<string, unknown> = {}) => runTurn([[name, args]])[0] as T,
    parallel: <T>(batch: ReadonlyArray<readonly [string, Record<string, unknown>]>) => {
      const out: Array<Record<string, any>> = [];
      for (let i = 0; i < batch.length; i += batchSize) out.push(...runTurn(batch.slice(i, i + batchSize)));
      return out as T[];
    }
  };

  const finalText = script(api);

  // The final answer is one more model turn: it re-reads everything, then writes text.
  const last = snapshot();
  const answerTokens = estimateTokens(finalText);
  turns.push({ n: turns.length + 1, calls: [], text: finalText, promptTokens: last.tokens, completionTokens: answerTokens, parts: last.parts });

  const promptTokens = turns.reduce((n, t) => n + t.promptTokens, 0);
  const completionTokens = turns.reduce((n, t) => n + t.completionTokens, 0);
  const schemaTokens = estimateTokens(JSON.stringify(surface.tools));
  return {
    surfaceId: surface.id,
    task,
    turns,
    calls,
    touches,
    finalText,
    inventory: surface.inventory,
    totals: {
      turns: turns.length,
      calls: calls.length,
      promptTokens,
      completionTokens,
      billedTokens: promptTokens + completionTokens,
      resultTokens: calls.reduce((n, c) => n + c.resultTokens, 0),
      fixedTokens: Math.ceil(systemChars / 4) + schemaTokens,
      schemaTokens,
      answerTokens
    }
  };
}

function safeParse(text: string): Record<string, any> {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, any>) : { value: v };
  } catch {
    return { raw: text };
  }
}
