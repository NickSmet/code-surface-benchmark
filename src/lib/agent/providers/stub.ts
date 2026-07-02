/**
 * Deterministic offline stub.
 *
 * No network. It fabricates *plausible* tool traffic per surface so the UI,
 * the loop, and the metrics machinery all work without any API keys — but the
 * tool dispatch still runs against the REAL inventory, so transcripts show
 * real data (only the model's "reasoning" is stubbed). Token usage is
 * estimated from char counts so the cost/scoreboard columns populate.
 *
 * Clearly labelled as a stub in the UI; the live benchmark uses a real
 * OpenAI or Azure OpenAI model.
 */

import type { ChatTurnArgs, ChatTurnResult, ProviderClient, ProviderToolCall, Usage } from './types';

const estTokens = (s: string): number => Math.ceil(s.length / 4);

function estimateUsage(args: ChatTurnArgs, completion: string): Usage {
  const msgChars =
    args.systemPrompt.length +
    args.messages.reduce((n, m) => n + JSON.stringify(m).length, 0) +
    (args.tools ? JSON.stringify(args.tools).length : 0);
  const p = Math.ceil(msgChars / 4);
  const c = estTokens(completion);
  return { promptTokens: p, cachedPromptTokens: 0, completionTokens: c, totalTokens: p + c };
}

function lastUserTask(args: ChatTurnArgs): string {
  for (let i = args.messages.length - 1; i >= 0; i--) {
    const m = args.messages[i];
    if (m.role === 'user') return m.content;
  }
  return '';
}

function toolResultCount(args: ChatTurnArgs): number {
  return args.messages.filter((m) => m.role === 'tool').length;
}

function call(name: string, argsObj: Record<string, unknown>, n: number): ProviderToolCall {
  return { id: `call_stub_${n}`, type: 'function', function: { name, arguments: JSON.stringify(argsObj) } };
}

function codeForTask(task: string): { name: string; args: Record<string, unknown> } {
  const t = task.toLowerCase();
  if (t.includes('untagged') || (t.includes('tag') && !t.includes('count'))) {
    return {
      name: 'operate_inventory',
      args: {
        rationale: 'Tag untagged resources in app-staging and deallocate VMs idle for more than 30 days.',
        code: [
          'function main(data) {',
          "  const changed = [];",
          "  const deallocated = [];",
          "  for (const r of data.resources) {",
          "    if (r.resourceGroup === 'app-staging' && Object.keys(r.tags).length === 0) {",
          "      r.tags.env = 'staging'; r.tags.owner = 'app-team';",
          '      changed.push(r.name);',
          '    }',
          "    if (r.type === 'virtualMachine' && r.powerState !== 'deallocated' && ctx.daysSince(r.lastActivityAt) > 30) {",
          "      r.powerState = 'deallocated';",
          '      deallocated.push(r.name);',
          '    }',
          '  }',
          '  return { tagged: changed.length, deallocated: deallocated.length };',
          '}'
        ].join('\n')
      }
    };
  }
  if (t.includes('idle') || t.includes('stop')) {
    return {
      name: 'operate_inventory',
      args: {
        rationale: 'Deallocate VMs idle for more than 30 days.',
        code: [
          'function main(data) {',
          '  const now = new Date(data.generatedAt).getTime();',
          '  let n = 0;',
          "  for (const r of data.resources) {",
          "    if (r.type === 'virtualMachine' && r.powerState !== 'deallocated' &&",
          '        (now - new Date(r.lastActivityAt).getTime()) / 86400000 > 30) {',
          "      r.powerState = 'deallocated'; n++;",
          '    }',
          '  }',
          '  return { deallocated: n };',
          '}'
        ].join('\n')
      }
    };
  }
  if (t.includes('cost') || t.includes('running')) {
    return {
      name: 'operate_inventory',
      args: {
        code: [
          'function main(data) {',
          '  const byRg = {};',
          "  for (const r of data.resources) {",
          "    if (r.type === 'virtualMachine' && r.powerState === 'running' && r.resourceGroup.endsWith('-prod')) {",
          '      byRg[r.resourceGroup] = (byRg[r.resourceGroup] || 0) + r.costMonthly;',
          '    }',
          '  }',
          '  return byRg;',
          '}'
        ].join('\n')
      }
    };
  }
  if (t.includes('public ip') || t.includes('web-prod-03') || t.includes('power state')) {
    return {
      name: 'operate_inventory',
      args: {
        code: [
          'function main(data) {',
          "  const vm = data.resources.find(r => r.name === 'web-prod-03');",
          '  const nic = data.resources.find(r => r.id === vm.nicId);',
          '  const pip = data.resources.find(r => r.id === nic.publicIpId);',
          '  return { powerState: vm.powerState, publicIp: pip ? pip.ipAddress : null };',
          '}'
        ].join('\n')
      }
    };
  }
  return {
    name: 'operate_inventory',
    args: { code: 'function main(data) {\n  return { resourceCount: data.resources.length };\n}' }
  };
}

export function createStubProvider(): ProviderClient {
  return {
    label: 'stub:offline',
    model: 'stub',
    isStub: true,
    async chatTurn(args: ChatTurnArgs): Promise<ChatTurnResult> {
      const toolNames = new Set((args.tools ?? []).map((t) => t.function.name));
      const isCode = toolNames.has('operate_inventory');
      const step = toolResultCount(args);
      const task = lastUserTask(args);

      // ── Code surface: one tool call, then finalise ──
      if (isCode) {
        if (step === 0) {
          const choice = codeForTask(task);
          const content = '';
          return { content, toolCalls: [call(choice.name, choice.args, 1)], usage: estimateUsage(args, JSON.stringify(choice.args)) };
        }
        const content =
          'Done (stubbed answer — set OPENAI_API_KEY (or Azure OpenAI vars) in .env for a real run). ' +
          'The code surface answered this with a single object-tool call.';
        return { content, toolCalls: [], usage: estimateUsage(args, content) };
      }

      // ── Catalog surface: several round trips, then finalise ──
      if (step === 0) {
        return { content: '', toolCalls: [call('list_resources', { type: 'virtualMachine' }, 1)], usage: estimateUsage(args, 'list') };
      }
      if (step === 1) {
        return { content: '', toolCalls: [call('get_resource', { name: 'web-prod-03' }, 2)], usage: estimateUsage(args, 'get') };
      }
      if (step === 2) {
        return { content: '', toolCalls: [call('list_resources', { resourceGroup: 'web-prod' }, 3)], usage: estimateUsage(args, 'list2') };
      }
      const content =
        'Done (stubbed answer — set OPENAI_API_KEY (or Azure OpenAI vars) in .env for a real run). ' +
        'The tool catalogue needed several round trips, each re-sending the growing transcript.';
      return { content, toolCalls: [], usage: estimateUsage(args, content) };
    }
  };
}
