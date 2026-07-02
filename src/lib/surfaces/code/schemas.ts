/**
 * The code surface: one object tool. The agent writes ordinary JavaScript
 * against plain projected data - patterns it has known since pre-training -
 * instead of learning a catalogue of bespoke actions.
 */

import type { ToolSchema } from '$lib/agent/providers/types';
import { SCHEMA_DOC } from './helpers';

export const OPERATE_NAME = 'operate_inventory';

export const CODE_TOOLS: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: OPERATE_NAME,
      description: [
        'Operate on the inventory by running JavaScript against one plain projected object.',
        'Provide code that defines `function main(data, ctx) { ... }`.',
        'For reads, return any JSON-serialisable value. For writes, mutate `data` in place; the runtime diffs your mutated projection against the original, derives the change set, and applies it (a reviewer may hold it for approval first).',
        'A single script may both return a summary and mutate data. Prefer one pass over `data.resources` where possible.',
        'If you mutate data, include a short rationale. Mutate tags and scalar fields only, for example `r.tags.owner` or `r.powerState`.',
        'When the user asks for a state change, assign the target field on `data`; for example, deallocation is `r.powerState = "deallocated"` for VMs that are not already deallocated.',
        '',
        'Projection shape and examples:',
        SCHEMA_DOC
      ].join('\n'),
      parameters: {
        type: 'object',
        required: ['code'],
        additionalProperties: false,
        properties: {
          code: { type: 'string', description: 'function main(data, ctx) { return ...; /* optionally mutate data */ }' },
          rationale: { type: 'string', description: 'Optional one-sentence explanation when the code mutates data.' }
        }
      }
    }
  }
];
