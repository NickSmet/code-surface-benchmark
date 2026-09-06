/**
 * A Surface is everything that differs between the two agents: the system
 * prompt, the tool schemas the model sees, and how a tool call is executed.
 * The shared loop controls some variables; the two surfaces still bundle
 * different prompts, data access, computation and write granularity.
 */

import type { ChangeRow, ProjectionView } from '$lib/inventory/projection';
import type { ToolSchema } from '$lib/agent/providers/types';

export type ToolTraceMode = 'read' | 'write' | 'projection' | 'scope';

export interface ToolTraceResource {
  id: string;
  name: string;
  type: string;
  resourceGroup: string;
  mode: ToolTraceMode;
  via: string;
}

export interface ToolTrace {
  mode: ToolTraceMode;
  resources: ToolTraceResource[];
  details: Record<string, unknown>;
}

export interface ToolDispatchResult {
  /** JSON-string content fed back to the model as the tool result. */
  content: string;
  /** Short human preview of the result for the transcript. */
  resultPreview: string;
  error?: boolean;
  /** For the code surface: the JS the agent ran (shown in the transcript). */
  code?: string;
  /** For writes: the derived change set (applied by the loop). */
  diff?: ChangeRow[];
  /** Sanitized UI metadata for presentation visualizations. */
  trace?: ToolTrace;
}

export interface Surface {
  id: 'catalog' | 'code';
  label: string;
  systemPrompt: string;
  tools: ToolSchema[];
  /** Actual run state, used for checks outside the model's context. */
  snapshot(): ProjectionView;
  /** Execute a single tool call against the run's estate copy. */
  dispatch(toolName: string, args: Record<string, unknown>): Promise<ToolDispatchResult>;
  /**
   * Apply a derived change set to the run's estate copy. The loop calls this
   * right after dispatch (direct mode) or once the reviewer approves.
   */
  applyDiff(rows: ChangeRow[]): void;
}

/** Short one-line preview of tool args for the transcript header. */
export function previewArgs(args: Record<string, unknown>): string {
  const s = JSON.stringify(args);
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
}
