/**
 * Provider selection: real OpenAI/Azure OpenAI if configured, else the offline stub.
 */

import { createOpenAiProvider, type OpenAiEnv } from './openai';
import { createStubProvider } from './stub';
import type { ProviderClient } from './types';

export function selectProvider(env: OpenAiEnv): ProviderClient {
  return createOpenAiProvider(env) ?? createStubProvider();
}

export type { ProviderClient } from './types';
