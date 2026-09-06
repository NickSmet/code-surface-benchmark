import { createRunInventory } from '$lib/inventory/store';
import { applyChangeRows } from '$lib/inventory/apply';
import { traceDiffResources, traceResources } from '$lib/inventory/overview';
import { buildProjection, diffProjection, type ChangeRow } from '$lib/inventory/projection';
import type { Inventory } from '$lib/inventory/types';
import type { Surface, ToolDispatchResult } from '$lib/surfaces/types';
import { CODE_TOOLS, OPERATE_NAME } from './schemas';
import { codeSystemPrompt } from './prompt';
import { makeCtx, preview } from './helpers';
import { executeInventoryCode } from './sandbox';

export function createCodeSurface(runNonce?: string, inv: Inventory = createRunInventory()): Surface {
  return {
    id: 'code',
    label: 'Code Surface',
    systemPrompt: codeSystemPrompt(inv.generatedAt, runNonce),
    tools: CODE_TOOLS,
    applyDiff: (rows) => applyChangeRows(inv, rows),
    async dispatch(name, args): Promise<ToolDispatchResult> {
      if (name !== OPERATE_NAME) {
        return { content: JSON.stringify({ error: `Unknown tool ${name}` }), resultPreview: `unknown tool ${name}`, error: true };
      }

      const code = typeof args.code === 'string' ? args.code : '';
      if (!code.trim()) {
        return { content: JSON.stringify({ error: 'No code provided.' }), resultPreview: 'no code', error: true, code };
      }

      const before = buildProjection(inv);
      const after = buildProjection(inv);
      let result: unknown;
      let logs: string[];
      let diff: ChangeRow[];
      try {
        const executed = executeInventoryCode(code, after, makeCtx(after));
        result = executed.result;
        logs = executed.logs;
        diff = diffProjection(before, after);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: JSON.stringify({ error: message }), resultPreview: message, error: true, code };
      }

      const resourcesAffected = new Set(diff.map((d) => d.resourceId)).size;
      const hasResult = result !== undefined;
      const mode = diff.length === 0 ? 'read' : hasResult ? 'read_write' : 'write';
      const rationale = typeof args.rationale === 'string' ? args.rationale : '';
      const clippedLogs = logs.slice(0, 20);

      const content = JSON.stringify({
        mode,
        ...(hasResult ? { result } : {}),
        ...(diff.length > 0 ? { changeCount: diff.length, resourcesAffected, rationale } : {}),
        logs: clippedLogs
      });

      const projectionTrace = traceResources(inv.resources, 'projection', name);
      const writeTrace = diff.length > 0 ? traceDiffResources(inv, diff, name) : [];
      const traceById = new Map(projectionTrace.map((resource) => [resource.id, resource]));
      for (const resource of writeTrace) traceById.set(resource.id, resource);

      const resultPreview =
        diff.length > 0
          ? `${diff.length} change${diff.length === 1 ? '' : 's'} across ${resourcesAffected} resource${resourcesAffected === 1 ? '' : 's'}${hasResult ? `; returned ${preview(result, 100)}` : ''}`
          : preview(result, 200) || 'read complete';

      return {
        content,
        resultPreview,
        code,
        diff,
        trace: {
          mode: diff.length > 0 ? 'write' : 'projection',
          resources: Array.from(traceById.values()),
          details: {
            operation: name,
            mode,
            note:
              diff.length > 0
                ? 'Code ran against a projection copy. The runtime validated the supported edits and proposed this diff; the loop applies it unless review declines it.'
                : 'Code ran once against the sanitized inventory projection. Exact per-resource reads are not instrumented in V1.',
            resourceCount: inv.resources.length,
            logCount: logs.length,
            ...(diff.length > 0 ? { changeCount: diff.length, resourcesAffected, rationale } : {})
          }
        }
      };
    }
  };
}
