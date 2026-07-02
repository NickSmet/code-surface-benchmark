/**
 * The tool catalogue: a fan of granular, single-purpose tools — the
 * conventional MCP shape. Every tool's description sits in the context
 * window before the agent does anything, and every action is a round trip.
 */

import type { ToolSchema } from '$lib/agent/providers/types';

export const CATALOG_TOOLS: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'list_subscriptions',
      description: 'List the Azure subscriptions in the tenant. Returns id and name for each.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_resource_groups',
      description: 'List resource groups, optionally filtered to one subscription (by name). Returns name, location, subscription.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subscriptionName: { type: 'string', description: 'Optional subscription name, e.g. "Production".' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_resources',
      description:
        'List resources as COMPACT summaries (name, type, resourceGroup, subscription, location, costMonthly, tagCount; ' +
        'plus powerState/vmSize/lastActivityAt for VMs). Does NOT include network wiring (NIC/public-IP ids) or other ' +
        'detail — use get_resource for the full object. Filterable by type, resourceGroup, subscriptionName.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: ['virtualMachine', 'disk', 'networkInterface', 'publicIp', 'storageAccount', 'sqlDatabase', 'appService'],
            description: 'Optional resource type filter.'
          },
          resourceGroup: { type: 'string', description: 'Optional resource-group name filter.' },
          subscriptionName: { type: 'string', description: 'Optional subscription name filter.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_resource',
      description:
        'Fetch ONE resource in full detail by name or by id (the full object, including type-specific fields and ' +
        'cross-references such as nicId / publicIpId / attachedToVmId). Follow references by calling get_resource again ' +
        'with the referenced id.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'Resource name, e.g. "web-prod-03".' },
          id: { type: 'string', description: 'Full ARM resource id (use when following a reference).' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_resource_tags',
      description:
        'Add or update tags on ONE resource. Merges into existing tags. Returns the resulting tag set. ' +
        'Call once per resource you want to tag.',
      parameters: {
        type: 'object',
        required: ['name', 'tags'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'Resource name.' },
          tags: {
            type: 'object',
            description: 'Tag key/value pairs to set, e.g. { "env": "staging", "owner": "app-team" }.',
            additionalProperties: { type: 'string' }
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_power_state',
      description: 'Change the power state of ONE virtual machine. Call once per VM.',
      parameters: {
        type: 'object',
        required: ['name', 'state'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'VM name, e.g. "dev-box-01".' },
          state: { type: 'string', enum: ['running', 'stopped', 'deallocated'], description: 'Target power state.' }
        }
      }
    }
  }
];
