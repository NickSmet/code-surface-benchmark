/**
 * Screen ④: how a tool catalogue grows into a query language.
 *
 * Two things live here.
 *
 * 1. The ladder. The same question (the benchmark's aggregate task) put to
 *    eight tool designs, from "one tool per property" up to "write code".
 *    Every rung is a real set of tool definitions over the real estate; a
 *    scripted model drives it and the replay bills the tokens exactly the way
 *    the other screens do. Rungs 1-4, 6 and 7 are designs written for the
 *    tour; rung 5 uses the benchmark's own `list_resources`, and rung 6 adds a
 *    calculator to it; rung 8 is the benchmark's code surface.
 * 2. The language. Rung 7 is a small, working query language (filter, group,
 *    aggregate, project, page). Four optional features can be added to it
 *    (computed values, following references, updates, batching). Each one makes
 *    the tool definition longer and covers more tasks, and a handful of fresh
 *    questions show where it still runs out.
 */

import type { ToolSchema } from '$lib/agent/providers/types';
import { POWER_STATES, projectResource, validTagKey, type ChangeRow } from '$lib/inventory/projection';
import type { Inventory, Resource, VirtualMachine } from '$lib/inventory/types';
import { getResource, listResources } from '$lib/surfaces/catalog/handlers';
import { CATALOG_TOOLS } from '$lib/surfaces/catalog/schemas';
import { formatAnswer, type TaskId } from './answers';
import { runReplay, type Replay, type ScriptApi, type SimResult, type SimSurface } from './replay';
import { runBill, type RunBill } from './replay-view';
import { estimateTokens, fmtTokens } from './tokens';

type Row = Record<string, unknown>;
const PROD = 'Production';

// ── shared building blocks ─────────────────────────────────────────────────

function fn(name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): ToolSchema {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) } }
  } as ToolSchema;
}

function ladderPrompt(snapshotIso: string): string {
  return [
    'You are an infrastructure assistant for an Azure-style cloud estate. You operate the estate',
    'through the provided tools. Use them to answer the user precisely.',
    '',
    `The estate snapshot was taken at ${snapshotIso}. When the user asks about "idle", "stale", or`,
    '"age", reason relative to that snapshot time.',
    '',
    'When you have enough information, stop calling tools and give a concise final answer.',
    'For aggregates, show the breakdown.'
  ].join('\n');
}

const subName = (inv: Inventory, id: string): string => inv.subscriptions.find((s) => s.id === id)?.name ?? id;
const subId = (inv: Inventory, name: string): string | undefined => inv.subscriptions.find((s) => s.name.toLowerCase() === name.toLowerCase())?.id;
const vmNamed = (inv: Inventory, name: unknown): VirtualMachine | undefined =>
  inv.resources.find((r): r is VirtualMachine => r.type === 'virtualMachine' && r.name === name);

function ok(value: unknown, preview: string): SimResult {
  return { content: JSON.stringify(value), preview, touches: [] };
}
function fail(message: string): SimResult {
  return { content: JSON.stringify({ error: message }), preview: message, error: true, touches: [] };
}

/** Same arithmetic for every rung, so every rung ends with the same sentence. */
function answerFrom(vms: Array<{ group: string; cost: number; untagged: boolean; name: string }>): string {
  const byResourceGroup: Record<string, number> = {};
  for (const v of vms) byResourceGroup[v.group] = (byResourceGroup[v.group] ?? 0) + v.cost;
  for (const g of Object.keys(byResourceGroup)) byResourceGroup[g] = Math.round(byResourceGroup[g] * 100) / 100;
  const total = Math.round(Object.values(byResourceGroup).reduce((s, n) => s + n, 0) * 100) / 100;
  return formatAnswer({ task: 'filter-aggregate', byResourceGroup, total, untagged: vms.filter((v) => v.untagged).map((v) => v.name) });
}

// ── rungs 1-4: tools that answer about one VM at a time ────────────────────

/** The fourteen things the estate knows about a VM, grouped the way rung 3 groups them. */
export const VM_PROPS = [
  { key: 'location', tool: 'get_vm_location', aspect: 'general' },
  { key: 'resourceGroup', tool: 'get_vm_resource_group', aspect: 'general' },
  { key: 'createdAt', tool: 'get_vm_created_at', aspect: 'general' },
  { key: 'vmSize', tool: 'get_vm_size', aspect: 'compute' },
  { key: 'osType', tool: 'get_vm_os_type', aspect: 'compute' },
  { key: 'powerState', tool: 'get_vm_power_state', aspect: 'compute' },
  { key: 'vcpus', tool: 'get_vm_vcpus', aspect: 'compute' },
  { key: 'memoryGb', tool: 'get_vm_memory_gb', aspect: 'compute' },
  { key: 'lastActivityAt', tool: 'get_vm_last_activity_at', aspect: 'compute' },
  { key: 'osDiskId', tool: 'get_vm_os_disk_id', aspect: 'storage' },
  { key: 'dataDiskIds', tool: 'get_vm_data_disk_ids', aspect: 'storage' },
  { key: 'nicId', tool: 'get_vm_nic_id', aspect: 'network' },
  { key: 'costMonthly', tool: 'get_vm_cost_monthly', aspect: 'billing' },
  { key: 'tags', tool: 'get_vm_tags', aspect: 'billing' }
] as const;
const ASPECTS = ['general', 'compute', 'storage', 'network', 'billing'] as const;

const LIST_VMS = fn(
  'list_vms',
  'List virtual machines, optionally for one subscription (by name). Returns the name and resource group of each.',
  { subscription: { type: 'string', description: 'Optional subscription name, e.g. "Production".' } }
);
const NAME_ARG = { name: { type: 'string', description: 'The VM name.' } };

const perPropertyTools: ToolSchema[] = [
  LIST_VMS,
  ...VM_PROPS.map((p) => fn(p.tool, `Return the ${p.key} of one virtual machine.`, NAME_ARG, ['name']))
];
const oneToolTools: ToolSchema[] = [
  LIST_VMS,
  fn('get_vm_properties', 'Return every property of one virtual machine, by name.', NAME_ARG, ['name'])
];
const aspectTools: ToolSchema[] = [
  LIST_VMS,
  fn(
    'get_vm_properties',
    'Return one aspect of a virtual machine. compute: vmSize, osType, powerState, vcpus, memoryGb, lastActivityAt. storage: osDiskId, dataDiskIds. network: nicId. billing: costMonthly, tags. general: location, resourceGroup, createdAt.',
    { ...NAME_ARG, aspect: { type: 'string', enum: [...ASPECTS], description: 'Which slice of the VM to return.' } },
    ['name', 'aspect']
  )
];
const aspectsTools: ToolSchema[] = [
  LIST_VMS,
  fn(
    'get_vm_properties',
    'Return one or more aspects of a virtual machine, as an object keyed by aspect. compute: vmSize, osType, powerState, vcpus, memoryGb, lastActivityAt. storage: osDiskId, dataDiskIds. network: nicId. billing: costMonthly, tags. general: location, resourceGroup, createdAt.',
    {
      ...NAME_ARG,
      aspects: { type: 'array', items: { type: 'string', enum: [...ASPECTS] }, minItems: 1, description: 'Which slices of the VM to return.' }
    },
    ['name', 'aspects']
  )
];
const filterTools: ToolSchema[] = CATALOG_TOOLS.filter((t) => ['list_resources', 'get_resource'].includes(t.function.name));

function aspectOf(vm: VirtualMachine, aspect: string): Row {
  const full = projectResource(vm) as unknown as Row;
  return Object.fromEntries(VM_PROPS.filter((p) => p.aspect === aspect).map((p) => [p.key, full[p.key]]));
}

function vmDispatch(inv: Inventory, rung: 'per-property' | 'one-tool' | 'aspect' | 'aspects') {
  return (name: string, args: Record<string, unknown>): SimResult => {
    if (name === 'list_vms') {
      const want = typeof args.subscription === 'string' ? subId(inv, args.subscription) : undefined;
      if (typeof args.subscription === 'string' && !want) return fail(`Unknown subscription "${args.subscription}".`);
      const vms = inv.resources
        .filter((r): r is VirtualMachine => r.type === 'virtualMachine' && (!want || r.subscriptionId === want))
        .map((r) => ({ name: r.name, resourceGroup: r.resourceGroup }));
      return ok({ count: vms.length, vms }, `${vms.length} VMs`);
    }
    const vm = vmNamed(inv, args.name);
    if (!vm) return fail(`VM "${String(args.name)}" not found.`);
    const full = projectResource(vm) as unknown as Row;
    if (rung === 'per-property') {
      const prop = VM_PROPS.find((p) => p.tool === name);
      if (!prop) return fail(`Unknown tool ${name}`);
      return ok({ name: vm.name, [prop.key]: full[prop.key] }, `${vm.name}.${prop.key}`);
    }
    if (name !== 'get_vm_properties') return fail(`Unknown tool ${name}`);
    if (rung === 'one-tool') return ok(getResource(inv, { name: vm.name }), `${vm.name}, every property`);
    if (rung === 'aspect') {
      if (!ASPECTS.includes(args.aspect as (typeof ASPECTS)[number])) return fail(`Unknown aspect "${String(args.aspect)}".`);
      return ok({ name: vm.name, aspect: args.aspect, ...aspectOf(vm, String(args.aspect)) }, `${vm.name}: ${String(args.aspect)}`);
    }
    const wanted = Array.isArray(args.aspects) ? (args.aspects as string[]) : [];
    if (!wanted.length || wanted.some((a) => !ASPECTS.includes(a as (typeof ASPECTS)[number]))) return fail('aspects must list known aspects.');
    return ok({ name: vm.name, ...Object.fromEntries(wanted.map((a) => [a, aspectOf(vm, a)])) }, `${vm.name}: ${wanted.join(', ')}`);
  };
}

// ── rungs 5 and 6: filtering across resources, and a calculator on top ─────

/** The benchmark's own list and get, over a private copy of the estate. */
function listingDispatch(inv: Inventory): SimSurface['dispatch'] {
  return (name, args) => {
    if (name === 'list_resources') {
      const out = listResources(inv, args as { type?: string; resourceGroup?: string; subscriptionName?: string });
      return ok(out, `${out.count} resources`);
    }
    if (name === 'get_resource') return ok(getResource(inv, args as { name?: string }), String(args.name));
    return fail(`Unknown tool ${name}`);
  };
}

export type Calculation = { ok: true; value: number } | { ok: false; error: string };

/**
 * What a calculator tool does: numbers, + - * / and parentheses. It parses the
 * text, so nothing but arithmetic can run. The result is rounded to six places
 * so that adding cents does not come back as 1234.5600000000001.
 */
export function evaluateExpression(source: string): Calculation {
  let at = 0;
  const skip = (): void => {
    while (at < source.length && /\s/.test(source[at])) at += 1;
  };
  const peek = (): string | undefined => {
    skip();
    return source[at];
  };
  const stop = (message: string): never => {
    throw new Error(message);
  };
  const number = (): number => {
    skip();
    const m = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(source.slice(at));
    if (!m) return stop(at >= source.length ? 'The expression ends where a number should be.' : `Expected a number at position ${at + 1}, found "${source[at]}".`);
    at += m[0].length;
    return Number(m[0]);
  };
  const factor = (): number => {
    const c = peek();
    if (c === '(') {
      at += 1;
      const inner = sum();
      if (peek() !== ')') stop('A parenthesis is not closed.');
      at += 1;
      return inner;
    }
    if (c === '-') {
      at += 1;
      return -factor();
    }
    return number();
  };
  const product = (): number => {
    let v = factor();
    for (;;) {
      const c = peek();
      if (c === '*') {
        at += 1;
        v *= factor();
      } else if (c === '/') {
        at += 1;
        const d = factor();
        if (d === 0) stop('Division by zero.');
        v /= d;
      } else return v;
    }
  };
  const sum = (): number => {
    let v = product();
    for (;;) {
      const c = peek();
      if (c === '+') {
        at += 1;
        v += product();
      } else if (c === '-') {
        at += 1;
        v -= product();
      } else return v;
    }
  };
  try {
    const value = sum();
    if (peek() !== undefined) stop(`Unexpected "${source[at]}" at position ${at + 1}.`);
    return { ok: true, value: Math.round(value * 1e6) / 1e6 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const calculatorTool = fn(
  'calculate',
  'Evaluate an arithmetic expression and return the result. Numbers, + - * / and parentheses, for example "12.5 + 30.1".',
  { expression: { type: 'string', description: 'The expression to evaluate.' } },
  ['expression']
);
const calculatorTools: ToolSchema[] = [...filterTools, calculatorTool];

function calculatorDispatch(inv: Inventory): SimSurface['dispatch'] {
  const listing = listingDispatch(inv);
  return (name, args) => {
    if (name !== 'calculate') return listing(name, args);
    const out = evaluateExpression(typeof args.expression === 'string' ? args.expression : '');
    return out.ok ? ok({ result: out.value }, String(out.value)) : fail(out.error);
  };
}

// ── rung 7: the query language ─────────────────────────────────────────────

export type FeatureId = 'compute' | 'join' | 'update' | 'batch';

export interface Feature {
  id: FeatureId;
  label: string;
  /** The tool parameter it adds. */
  param: string;
  /** What it lets a question do. */
  lets: string;
  /** The sentence the tool description gains. This is the prose the model has to learn. */
  prose: string;
}

export const FEATURES: Feature[] = [
  {
    id: 'compute',
    label: 'Computed values',
    param: 'compute',
    lets: 'Compare something derived from a field, such as days idle.',
    prose:
      ' `compute` defines named values per row, usable in where, select and orderBy: {"idleDays": {"fn": "daysSince", "field": "lastActivityAt"}}. Supported functions: daysSince (whole days between the field and the snapshot time).'
  },
  {
    id: 'join',
    label: 'Follow references',
    param: 'join',
    lets: 'Cross from a VM to its NIC to its public IP in one query.',
    prose:
      ' `join` follows a reference: [{"via": "<field holding a resource id>", "as": "<alias>"}] adds the referenced resource as <alias>, so <alias>.field works in where, select, groupBy and orderBy. Joins apply in order, so a later join may start from an earlier alias (via: "nic.publicIpId"). Rows whose reference is empty are dropped.'
  },
  {
    id: 'update',
    label: 'Updates',
    param: 'update',
    lets: 'Change every matching resource, not just read it.',
    prose:
      ' `update` changes every row that `where` matches: {"set": {"tags.<key>": "<string>", "powerState": "running|stopped|deallocated"}}. Only resources can be updated, only string tags and a VM\'s powerState can be set, and a value that already matches is skipped. It cannot be combined with groupBy, aggregate or select. Returns how many rows matched and how many changes were made.'
  },
  {
    id: 'batch',
    label: 'Batches',
    param: 'queries',
    lets: 'Send several queries in one call.',
    prose: ' `queries` runs several queries in order in one call: pass it instead of the other parameters. Each result is returned in the same order.'
  }
];
export const FEATURE_IDS: FeatureId[] = FEATURES.map((f) => f.id);

const BASE_PARAMS = ['from', 'where', 'groupBy', 'aggregate', 'select', 'orderBy', 'limit', 'offset'] as const;
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'in', 'contains', 'exists'] as const;
const AGGS = ['count', 'sum', 'avg', 'min', 'max'] as const;
const COMPUTE_FNS = ['daysSince'] as const;
const FROMS = ['resources', 'resourceGroups', 'subscriptions'] as const;

const BASE_DESCRIPTION =
  'Query the estate. Rows come from `from` (resources, resourceGroups or subscriptions). Each resource row has its fields flattened: name, type, location, resourceGroup, subscription (name), costMonthly, tagCount, tags.<key>, ' +
  'and the type-specific fields such as powerState, vcpus or nicId. Evaluation order: where, then groupBy and aggregate, then select, then orderBy, then offset and limit. ' +
  '`where` is a list of {field, op, value} conditions combined with AND. Operators: =, !=, >, >=, <, <=, in (value is a list), contains (substring), exists (value true or false). ' +
  'Aggregate functions: count, sum, avg, min, max. With groupBy the result has one row per group (the group keys plus each aggregate); without it, a single row. ' +
  'Results are paged: at most `limit` rows (default 50, maximum 200); when more remain the result carries `nextOffset`.';

/** The tool definition the model is given. Its length is the schema tax, and it grows with every feature. */
export function queryTool(features: ReadonlySet<FeatureId>): ToolSchema {
  const on = FEATURES.filter((f) => features.has(f.id));
  const field = { type: 'string', description: 'A field path, e.g. resourceGroup or tags.env.' };
  const properties: Record<string, unknown> = {
    from: { type: 'string', enum: [...FROMS], description: 'What to query. Default resources.' },
    where: {
      type: 'array',
      description: 'Conditions combined with AND.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { field, op: { type: 'string', enum: [...OPS] }, value: { description: 'The value to compare with.' } },
        required: ['field', 'op']
      }
    },
    groupBy: { type: 'array', items: field, description: 'Fields to group by.' },
    aggregate: {
      type: 'array',
      description: 'Aggregates to compute per group.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { fn: { type: 'string', enum: [...AGGS] }, field, as: { type: 'string', description: 'Name of the result column.' } },
        required: ['fn']
      }
    },
    select: { type: 'array', items: field, description: 'Fields to return. Default all.' },
    orderBy: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { field, dir: { type: 'string', enum: ['asc', 'desc'] } },
        required: ['field']
      }
    },
    limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum rows to return. Default 50.' },
    offset: { type: 'integer', minimum: 0, description: 'Rows to skip, for paging.' }
  };
  if (features.has('compute')) {
    properties.compute = {
      type: 'object',
      description: 'Named values computed per row.',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: { fn: { type: 'string', enum: [...COMPUTE_FNS] }, field },
        required: ['fn', 'field']
      }
    };
  }
  if (features.has('join')) {
    properties.join = {
      type: 'array',
      description: 'References to follow.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { via: field, as: { type: 'string', description: 'Alias for the referenced resource.' } },
        required: ['via', 'as']
      }
    };
  }
  if (features.has('update')) {
    properties.update = {
      type: 'object',
      additionalProperties: false,
      description: 'Changes to make to every matching resource.',
      properties: { set: { type: 'object', description: 'Field path to new value.', additionalProperties: { type: 'string' } } },
      required: ['set']
    };
  }
  if (features.has('batch')) {
    properties.queries = { type: 'array', description: 'Several queries to run in order.', items: { type: 'object' } };
  }
  return fn('query_resources', BASE_DESCRIPTION + on.map((f) => f.prose).join(''), properties);
}

/** Words the model has to learn to use the tool: parameter names, operators, functions, directions. */
export function keywords(tool: ToolSchema): string[] {
  const words = new Set<string>();
  const walk = (node: unknown, key?: string): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.enum)) for (const e of n.enum) if (key !== 'from') words.add(String(e));
    if (n.properties && typeof n.properties === 'object') {
      for (const [k, v] of Object.entries(n.properties as Record<string, unknown>)) {
        words.add(k);
        walk(v, k);
      }
    }
    if (n.items) walk(n.items, key);
    if (n.additionalProperties && typeof n.additionalProperties === 'object') walk(n.additionalProperties, key);
  };
  walk(tool.function.parameters);
  words.delete('field');
  words.delete('value');
  return [...words];
}

export interface Cond {
  field: string;
  op: string;
  value?: unknown;
}

export type QueryOut =
  | { ok: true; kind: 'rows'; from: string; total: number; count: number; rows: Row[]; nextOffset?: number }
  | { ok: true; kind: 'update'; matched: number; changed: number; changes: ChangeRow[] }
  | { ok: true; kind: 'batch'; results: QueryOut[] }
  | { ok: false; error: string; needs?: FeatureId };

const bad = (error: string, needs?: FeatureId): QueryOut => ({ ok: false, error, ...(needs ? { needs } : {}) });

const get = (row: Row, path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Row)[k] : undefined), row);

function test(v: unknown, op: string, want: unknown): boolean {
  switch (op) {
    case '=':
      return v === want;
    case '!=':
      return v !== want;
    case '>':
      return v != null && (v as number | string) > (want as number | string);
    case '>=':
      return v != null && (v as number | string) >= (want as number | string);
    case '<':
      return v != null && (v as number | string) < (want as number | string);
    case '<=':
      return v != null && (v as number | string) <= (want as number | string);
    case 'in':
      return Array.isArray(want) && want.includes(v);
    case 'contains':
      return typeof v === 'string' && typeof want === 'string' && v.includes(want);
    case 'exists':
      return (v !== undefined && v !== null) === (want !== false);
    default:
      return false;
  }
}

function viewOf(inv: Inventory, from: string): Row[] {
  if (from === 'resources') {
    return inv.resources.map((r) => ({
      ...(projectResource(r) as unknown as Row),
      subscription: subName(inv, r.subscriptionId),
      tagCount: Object.keys(r.tags).length
    }));
  }
  if (from === 'resourceGroups') return inv.resourceGroups.map((g) => ({ name: g.name, location: g.location, subscription: subName(inv, g.subscriptionId) }));
  return inv.subscriptions.map((s) => ({ id: s.id, name: s.name }));
}

const isList = (v: unknown): v is unknown[] => Array.isArray(v);
const isObj = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);

function runOne(inv: Inventory, q: Row, features: ReadonlySet<FeatureId>): QueryOut {
  const from = q.from === undefined ? 'resources' : q.from;
  if (typeof from !== 'string' || !(FROMS as readonly string[]).includes(from)) return bad(`from must be one of ${FROMS.join(', ')}.`);
  let rows = viewOf(inv, from);
  const known = new Set(rows.flatMap((r) => Object.keys(r)));
  const aliases = new Set<string>();

  // Every field path must start with something the rows actually have.
  const unknownField = (path: unknown): string | null => {
    if (typeof path !== 'string' || !path) return 'Field names must be non-empty strings.';
    const head = path.split('.')[0];
    return known.has(head) || aliases.has(head) ? null : `Unknown field "${head}" on ${from}. Known fields: ${[...known, ...aliases].join(', ')}.`;
  };

  if (q.join !== undefined) {
    if (!isList(q.join)) return bad('join must be a list of {via, as}.');
    for (const j of q.join) {
      if (!isObj(j) || typeof j.via !== 'string' || typeof j.as !== 'string') return bad('Each join needs "via" and "as".');
      const e = unknownField(j.via);
      if (e) return bad(e);
      const byId = new Map(inv.resources.map((r) => [r.id, projectResource(r) as unknown as Row]));
      const next: Row[] = [];
      for (const row of rows) {
        const target = byId.get(String(get(row, j.via)));
        if (target) next.push({ ...row, [j.as]: target });
      }
      rows = next;
      aliases.add(j.as);
    }
  }

  if (q.compute !== undefined) {
    if (!isObj(q.compute)) return bad('compute must be an object of named values.');
    const at = new Date(inv.generatedAt).getTime();
    for (const [name, spec] of Object.entries(q.compute)) {
      if (!isObj(spec) || typeof spec.fn !== 'string') return bad(`compute.${name} needs a "fn".`);
      if (!(COMPUTE_FNS as readonly string[]).includes(spec.fn)) return bad(`Unsupported compute function "${spec.fn}". Supported: ${COMPUTE_FNS.join(', ')}.`);
      const e = unknownField(spec.field);
      if (e) return bad(e);
      for (const row of rows) {
        const v = get(row, String(spec.field));
        row[name] = typeof v === 'string' ? Math.floor((at - new Date(v).getTime()) / 86_400_000) : null;
      }
      known.add(name);
    }
  }

  if (q.where !== undefined) {
    if (!isList(q.where)) return bad('where must be a list of {field, op, value}.');
    for (const c of q.where) {
      if (!isObj(c) || typeof c.op !== 'string') return bad('Each condition needs "field" and "op".');
      const e = unknownField(c.field);
      if (e) return bad(e);
      if (!(OPS as readonly string[]).includes(c.op)) return bad(`Unsupported operator "${c.op}". Supported: ${OPS.join(', ')}.`);
    }
    const conds = q.where as Cond[];
    rows = rows.filter((row) => conds.every((c) => test(get(row, c.field), c.op, c.value)));
  }

  // ── writes ──
  if (q.update !== undefined) {
    if (q.groupBy !== undefined || q.aggregate !== undefined || q.select !== undefined) return bad('update cannot be combined with groupBy, aggregate or select.');
    if (from !== 'resources') return bad('Only resources can be updated.');
    if (!isObj(q.update) || !isObj(q.update.set) || Object.keys(q.update.set).length === 0) return bad('update needs a non-empty "set".');
    const set = q.update.set;
    for (const [path, value] of Object.entries(set)) {
      if (path === 'powerState') {
        if (typeof value !== 'string' || !POWER_STATES.includes(value)) return bad(`powerState must be one of ${POWER_STATES.join(', ')}.`);
      } else if (path.startsWith('tags.')) {
        if (!validTagKey(path.slice(5)) || typeof value !== 'string') return bad(`Tag values must be strings (${path}).`);
      } else {
        return bad(`Unsupported field to set: ${path}. Only string tags and powerState can be set.`);
      }
    }
    const byId = new Map(inv.resources.map((r) => [r.id, r]));
    const changes: ChangeRow[] = [];
    const touched = new Set<string>();
    for (const row of rows) {
      const r = byId.get(String(row.id)) as Resource;
      for (const [path, value] of Object.entries(set)) {
        if (path === 'powerState') {
          if (r.type !== 'virtualMachine') return bad(`powerState can only be set on virtual machines (matched ${r.type} "${r.name}").`);
          if (r.powerState === value) continue;
          changes.push({ resourceId: r.id, resourceName: r.name, resourceType: r.type, field: 'powerState', op: 'edit', before: r.powerState, after: value });
        } else {
          const tag = path.slice(5);
          const before = Object.hasOwn(r.tags, tag) ? r.tags[tag] : null;
          if (before === value) continue;
          changes.push({ resourceId: r.id, resourceName: r.name, resourceType: r.type, field: path, op: before === null ? 'add' : 'edit', before, after: value });
        }
        touched.add(r.id);
      }
    }
    return { ok: true, kind: 'update', matched: rows.length, changed: touched.size, changes };
  }

  // ── reads ──
  for (const key of ['groupBy', 'select'] as const) {
    if (q[key] === undefined) continue;
    if (!isList(q[key])) return bad(`${key} must be a list of fields.`);
    for (const f of q[key] as unknown[]) {
      const e = unknownField(f);
      if (e) return bad(e);
    }
  }
  const aggs = q.aggregate === undefined ? [] : q.aggregate;
  if (!isList(aggs)) return bad('aggregate must be a list of {fn, field, as}.');
  for (const a of aggs) {
    if (!isObj(a) || typeof a.fn !== 'string') return bad('Each aggregate needs a "fn".');
    if (!(AGGS as readonly string[]).includes(a.fn)) return bad(`Unsupported aggregate "${a.fn}". Supported: ${AGGS.join(', ')}.`);
    if (a.fn !== 'count' || a.field !== undefined) {
      const e = unknownField(a.field);
      if (e) return bad(e);
    }
  }

  let out: Row[];
  if (aggs.length > 0 || q.groupBy !== undefined) {
    const keys = (q.groupBy as string[] | undefined) ?? [];
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const k = JSON.stringify(keys.map((f) => get(row, f)));
      groups.set(k, [...(groups.get(k) ?? []), row]);
    }
    if (keys.length === 0 && groups.size === 0) groups.set('[]', []);
    out = [...groups.values()].map((members) => {
      const row: Row = {};
      keys.forEach((f) => (row[f] = members.length ? get(members[0], f) : null));
      for (const a of aggs as Row[]) {
        const nums = members.map((m) => get(m, String(a.field))).filter((v): v is number => typeof v === 'number');
        const name = typeof a.as === 'string' ? a.as : a.field ? `${a.fn}_${a.field}` : String(a.fn);
        const sum = nums.reduce((s, n) => s + n, 0);
        row[name] =
          a.fn === 'count' ? (a.field === undefined ? members.length : members.filter((m) => get(m, String(a.field)) != null).length)
          : a.fn === 'sum' ? Math.round(sum * 100) / 100
          : a.fn === 'avg' ? (nums.length ? Math.round((sum / nums.length) * 100) / 100 : null)
          : a.fn === 'min' ? (nums.length ? Math.min(...nums) : null)
          : nums.length ? Math.max(...nums) : null;
      }
      return row;
    });
  } else if (q.select !== undefined) {
    out = rows.map((row) => Object.fromEntries((q.select as string[]).map((f) => [f, get(row, f)])));
  } else {
    out = rows;
  }

  if (q.orderBy !== undefined) {
    if (!isList(q.orderBy)) return bad('orderBy must be a list of {field, dir}.');
    for (const o of q.orderBy) {
      if (!isObj(o) || typeof o.field !== 'string') return bad('Each orderBy needs a "field".');
      const sample = out[0];
      if (sample && !(o.field in sample) && get(sample, o.field) === undefined) return bad(`Cannot order by "${o.field}": it is not in the result.`);
    }
    const order = q.orderBy as Array<{ field: string; dir?: string }>;
    out = [...out].sort((a, b) => {
      for (const o of order) {
        const x = get(a, o.field) as number | string;
        const y = get(b, o.field) as number | string;
        if (x === y) continue;
        return (x < y ? -1 : 1) * (o.dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
  }

  const limit = q.limit === undefined ? 50 : Number(q.limit);
  const offset = q.offset === undefined ? 0 : Number(q.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return bad('limit must be an integer from 1 to 200.');
  if (!Number.isInteger(offset) || offset < 0) return bad('offset must be an integer of 0 or more.');
  const page = out.slice(offset, offset + limit);
  const more = offset + limit < out.length;
  return { ok: true, kind: 'rows', from, total: out.length, count: page.length, rows: page, ...(more ? { nextOffset: offset + limit } : {}) };
}

/** Run one query (or a batch) against the estate. Never throws; never changes `inv` (updates return their change set). */
export function runQuery(inv: Inventory, input: unknown, features: ReadonlySet<FeatureId>): QueryOut {
  if (!isObj(input)) return bad('The query must be a JSON object.');
  for (const key of Object.keys(input)) {
    if ((BASE_PARAMS as readonly string[]).includes(key)) continue;
    const feat = FEATURES.find((f) => f.param === key);
    if (feat && features.has(feat.id)) continue;
    return bad(`Unknown parameter "${key}". This tool does not support it.`, feat?.id);
  }
  if (input.queries !== undefined) {
    if (!isList(input.queries) || input.queries.some((x) => !isObj(x) || 'queries' in x)) return bad('queries must be a list of query objects.');
    return { ok: true, kind: 'batch', results: input.queries.map((x) => runQuery(inv, x, features)) };
  }
  return runOne(inv, input, features);
}

/** Exactly what goes back into the model's context: no change rows, no bookkeeping. */
export function queryContent(out: QueryOut): string {
  const view = (o: QueryOut): unknown => {
    if (!o.ok) return { error: o.error };
    if (o.kind === 'update') return { matched: o.matched, changed: o.changed, changes: o.changes.length };
    if (o.kind === 'batch') return { results: o.results.map(view) };
    return { total: o.total, count: o.count, rows: o.rows, ...(o.nextOffset !== undefined ? { nextOffset: o.nextOffset } : {}) };
  };
  return JSON.stringify(view(out));
}

function queryDispatch(inv: Inventory, features: ReadonlySet<FeatureId>) {
  return (name: string, args: Record<string, unknown>): SimResult => {
    if (name !== 'query_resources') return fail(`Unknown tool ${name}`);
    const out = runQuery(inv, args, features);
    const content = queryContent(out);
    const preview = !out.ok ? out.error : out.kind === 'rows' ? `${out.count} rows` : out.kind === 'update' ? `${out.changes.length} changes` : `${out.results.length} results`;
    return { content, preview, error: !out.ok, touches: [], ...(out.ok && out.kind === 'update' ? { diff: out.changes } : {}) };
  };
}

// ── the same question, on every rung ───────────────────────────────────────

const PROD_RUNNING = [
  { field: 'type', op: '=', value: 'virtualMachine' },
  { field: 'subscription', op: '=', value: PROD },
  { field: 'powerState', op: '=', value: 'running' }
];

type Listed = { vms: Array<{ name: string; resourceGroup: string }> };
type Fact = { name: string; resourceGroup: string; powerState?: string; costMonthly?: number; tags?: Record<string, string>; tagCount?: number };

export type RungId = 'per-property' | 'one-tool' | 'aspect' | 'aspects' | 'filter' | 'calculator' | 'query' | 'code';

export interface Rung {
  id: RungId;
  n: number;
  title: string;
  /** The tool definitions, in one line. */
  signature: string;
  /** What gets in the way, which is the reason for the next rung. */
  pressure: string;
  tools: ToolSchema[];
  replay: Replay;
  /** Tokens sent on every turn before the question: instructions plus tool definitions. */
  setupTokens: number;
  /** The run's bill: what the model read (repeated and new) and what it wrote. */
  bill: RunBill;
}

function surfaceFor(inv: Inventory, id: string, label: string, tools: ToolSchema[], dispatch: SimSurface['dispatch']): SimSurface {
  return { id, label, systemPrompt: ladderPrompt(inv.generatedAt), tools, inventory: inv, dispatch };
}

function scripts(): Record<Exclude<RungId, 'code'>, (api: ScriptApi) => string> {
  const call = (api: ScriptApi, name: string, args: Record<string, unknown>) => api.call(name, args);
  return {
    'per-property': (api) => {
      const list = call(api, 'list_vms', { subscription: PROD }) as Listed;
      const states = api.parallel<{ powerState: string }>(list.vms.map((v) => ['get_vm_power_state', { name: v.name }] as const));
      const running = list.vms.filter((_, i) => states[i].powerState === 'running');
      const got = api.parallel<{ costMonthly?: number; tags?: Record<string, string> }>([
        ...running.map((v) => ['get_vm_cost_monthly', { name: v.name }] as const),
        ...running.map((v) => ['get_vm_tags', { name: v.name }] as const)
      ]);
      return answerFrom(
        running.map((v, i) => ({ name: v.name, group: v.resourceGroup, cost: got[i].costMonthly ?? 0, untagged: Object.keys(got[running.length + i].tags ?? {}).length === 0 }))
      );
    },
    'one-tool': (api) => {
      const list = call(api, 'list_vms', { subscription: PROD }) as Listed;
      const full = api.parallel<Fact>(list.vms.map((v) => ['get_vm_properties', { name: v.name }] as const));
      return answerFrom(
        full.filter((v) => v.powerState === 'running').map((v) => ({ name: v.name, group: v.resourceGroup, cost: v.costMonthly ?? 0, untagged: Object.keys(v.tags ?? {}).length === 0 }))
      );
    },
    aspect: (api) => {
      const list = call(api, 'list_vms', { subscription: PROD }) as Listed;
      const compute = api.parallel<{ powerState: string }>(list.vms.map((v) => ['get_vm_properties', { name: v.name, aspect: 'compute' }] as const));
      const running = list.vms.filter((_, i) => compute[i].powerState === 'running');
      const billing = api.parallel<{ costMonthly: number; tags: Record<string, string> }>(running.map((v) => ['get_vm_properties', { name: v.name, aspect: 'billing' }] as const));
      return answerFrom(running.map((v, i) => ({ name: v.name, group: v.resourceGroup, cost: billing[i].costMonthly, untagged: Object.keys(billing[i].tags).length === 0 })));
    },
    aspects: (api) => {
      const list = call(api, 'list_vms', { subscription: PROD }) as Listed;
      const both = api.parallel<{ compute: { powerState: string }; billing: { costMonthly: number; tags: Record<string, string> } }>(
        list.vms.map((v) => ['get_vm_properties', { name: v.name, aspects: ['compute', 'billing'] }] as const)
      );
      return answerFrom(
        list.vms
          .map((v, i) => ({ v, d: both[i] }))
          .filter(({ d }) => d.compute.powerState === 'running')
          .map(({ v, d }) => ({ name: v.name, group: v.resourceGroup, cost: d.billing.costMonthly, untagged: Object.keys(d.billing.tags).length === 0 }))
      );
    },
    filter: (api) => {
      const list = call(api, 'list_resources', { type: 'virtualMachine', subscriptionName: PROD }) as { resources: Fact[] };
      return answerFrom(
        list.resources.filter((v) => v.powerState === 'running').map((v) => ({ name: v.name, group: v.resourceGroup, cost: v.costMonthly ?? 0, untagged: v.tagCount === 0 }))
      );
    },
    // The same list, but the sums go through the calculator. It cannot see the estate, so every cost the
    // question needs is copied into a call: once for its resource group's sum, once for the total.
    calculator: (api) => {
      const list = call(api, 'list_resources', { type: 'virtualMachine', subscriptionName: PROD }) as { resources: Fact[] };
      const running = list.resources.filter((v) => v.powerState === 'running');
      const groups = [...new Set(running.map((v) => v.resourceGroup))];
      const plus = (vms: Fact[]): string => vms.map((v) => v.costMonthly ?? 0).join(' + ');
      const sums = api.parallel<{ result: number }>([
        ...groups.map((g) => ['calculate', { expression: plus(running.filter((v) => v.resourceGroup === g)) }] as const),
        ['calculate', { expression: plus(running) }]
      ]);
      const cents = (n: number): number => Math.round(n * 100) / 100;
      return formatAnswer({
        task: 'filter-aggregate',
        byResourceGroup: Object.fromEntries(groups.map((g, i) => [g, cents(sums[i].result)])),
        total: cents(sums[groups.length].result),
        untagged: running.filter((v) => v.tagCount === 0).map((v) => v.name)
      });
    },
    query: (api) => {
      const [sums, bare] = api.parallel<{ rows: Row[] }>([
        ['query_resources', { from: 'resources', where: PROD_RUNNING, groupBy: ['resourceGroup'], aggregate: [{ fn: 'sum', field: 'costMonthly', as: 'total' }] }],
        ['query_resources', { from: 'resources', where: [...PROD_RUNNING, { field: 'tagCount', op: '=', value: 0 }], select: ['name'] }]
      ]);
      const byResourceGroup = Object.fromEntries(sums.rows.map((r) => [String(r.resourceGroup), Number(r.total)]));
      const total = Math.round(Object.values(byResourceGroup).reduce((s, n) => s + n, 0) * 100) / 100;
      return formatAnswer({ task: 'filter-aggregate', byResourceGroup, total, untagged: bare.rows.map((r) => String(r.name)) });
    }
  };
}

const PRESSURE: Record<RungId, string> = {
  'per-property':
    'Every fact about every VM is its own round trip, and the list of tools is already long. So you consolidate.',
  'one-tool': 'Better, until the tool returns a record of a few hundred tokens when the agent only needs a power state. So you add a parameter.',
  aspect: 'Now the agent can ask for a slice. But the schema has grown, and a question that spans two aspects still takes two calls. So you make it an array.',
  aspects: 'Fewer round trips. But the tool still answers about one VM at a time, so the agent has to visit every VM. So you add filtering across VMs.',
  filter:
    'One call, because the summary happens to carry what the question needs. But the model adds the figures itself, by inference, and nothing checks the sum. So you give it a calculator.',
  calculator:
    'The sums are exact now. But the calculator cannot see the estate: the model reads each figure, writes it back into a call, and still does the grouping itself. So the arithmetic moves next to the data, and the filter grows to cover grouped results, aggregation, only some fields and pages of results.',
  query:
    'You have built a query language. It was not designed as one: its syntax lives in the schema and its semantics in prose, and every new kind of question needs another feature.',
  code: 'Instead of adding expressive power to a JSON interface, expose the objects and let the model express the operation in code. Filter, map, group, join and aggregate are operations it already knows.'
};

/**
 * Rungs 1-7: the question put to seven designs of tool. None of them needs the
 * code surface, so a screen that only wants the tools can stop here.
 */
export function buildToolRungs(inv: Inventory): Rung[] {
  const task = 'Across the Production subscription, what is the total estimated monthly cost of all VMs that are currently running, broken down by resource group? Also list any of those running VMs that have no tags.';
  const run = scripts();
  const mk = (
    id: Exclude<RungId, 'code'>,
    n: number,
    title: string,
    signature: string,
    tools: ToolSchema[],
    dispatch: SimSurface['dispatch']
  ): Rung => {
    const replay = runReplay(surfaceFor(inv, id, title, tools, dispatch), task, run[id]);
    return {
      id,
      n,
      title,
      signature,
      pressure: PRESSURE[id],
      tools,
      replay,
      setupTokens: replay.totals.fixedTokens,
      bill: runBill(replay)
    };
  };
  const fresh = (): Inventory => structuredClone(inv);
  const none = new Set<FeatureId>();
  const qTool = queryTool(none);
  return [
    mk('per-property', 1, 'One tool per property', 'get_vm_power_state(name) \u00b7 get_vm_cost_monthly(name) \u00b7 get_vm_tags(name) \u00b7 \u2026 \u00d714', perPropertyTools, vmDispatch(fresh(), 'per-property')),
    mk('one-tool', 2, 'One tool, every property', 'get_vm_properties(name)', oneToolTools, vmDispatch(fresh(), 'one-tool')),
    mk('aspect', 3, 'An aspect parameter', 'get_vm_properties(name, aspect)', aspectTools, vmDispatch(fresh(), 'aspect')),
    mk('aspects', 4, 'An array of aspects', 'get_vm_properties(name, aspects[])', aspectsTools, vmDispatch(fresh(), 'aspects')),
    mk('filter', 5, 'Filtering across VMs', 'list_resources(type, resourceGroup, subscriptionName) \u00b7 get_resource(name)', filterTools, listingDispatch(fresh())),
    mk('calculator', 6, 'A calculator', 'list_resources(\u2026) \u00b7 get_resource(name) \u00b7 calculate(expression)', calculatorTools, calculatorDispatch(fresh())),
    mk('query', 7, 'A query language', 'query_resources({ from, where, groupBy, aggregate, select, orderBy, limit, offset })', [qTool], queryDispatch(fresh(), none))
  ];
}

/**
 * One question on eight tool designs. `codeReplay` is the code surface's run
 * of the same question (see `compareSurfaces`), since it needs the reference
 * program, which the page loads.
 */
export function buildLadder(inv: Inventory, codeReplay: Replay): Rung[] {
  return [
    ...buildToolRungs(inv),
    {
      id: 'code',
      n: 8,
      title: 'Code over the object',
      signature: 'operate_inventory({ code })  \u2192  function main(data, ctx)',
      pressure: PRESSURE.code,
      tools: [],
      replay: codeReplay,
      setupTokens: codeReplay.totals.fixedTokens,
      bill: runBill(codeReplay)
    }
  ];
}

/** Tokens of a tool definition, as the replay bills it. */
export function definitionTokens(tools: ToolSchema[]): number {
  return estimateTokens(JSON.stringify(tools));
}

// ── what the language can answer, and what it takes ─────────────────────────

export interface TaskPlan {
  task: TaskId;
  ok: boolean;
  calls: number;
  /** The queries it takes, in order. */
  queries: unknown[];
  answer?: string;
  /** The feature that is missing, when it cannot be done. */
  needs?: FeatureId;
  /** How it gets done, in a sentence. */
  how?: string;
  reason?: string;
  /** The change set a write plan produced, so it can be checked against the ground truth. */
  changes?: ChangeRow[];
}

const NAME_IS = (name: string) => [{ field: 'name', op: '=', value: name }];

/** Plan, run and answer one of the four benchmark tasks with the language as it stands. */
export function planTask(task: TaskId, features: ReadonlySet<FeatureId>, inv: Inventory): TaskPlan {
  const rows = (out: QueryOut): Row[] => (out.ok && out.kind === 'rows' ? out.rows : []);
  switch (task) {
    case 'single-lookup': {
      const q = { from: 'resourceGroups', where: [{ field: 'subscription', op: '=', value: PROD }], select: ['name'] };
      const names = rows(runQuery(inv, q, features)).map((r) => String(r.name));
      return { task, ok: true, calls: 1, queries: [q], how: 'One query on the group list.', answer: formatAnswer({ task, names }) };
    }
    case 'filter-aggregate': {
      const qa = { from: 'resources', where: PROD_RUNNING, groupBy: ['resourceGroup'], aggregate: [{ fn: 'sum', field: 'costMonthly', as: 'total' }] };
      const qb = { from: 'resources', where: [...PROD_RUNNING, { field: 'tagCount', op: '=', value: 0 }], select: ['name'] };
      const sums = rows(runQuery(inv, qa, features));
      const byResourceGroup = Object.fromEntries(sums.map((r) => [String(r.resourceGroup), Number(r.total)]));
      const total = Math.round(Object.values(byResourceGroup).reduce((s, n) => s + n, 0) * 100) / 100;
      const untagged = rows(runQuery(inv, qb, features)).map((r) => String(r.name));
      const batch = features.has('batch');
      return {
        task,
        ok: true,
        calls: batch ? 1 : 2,
        queries: batch ? [{ queries: [qa, qb] }] : [qa, qb],
        how: batch ? 'Both parts in one batched call.' : 'One query for each part of the question.',
        answer: formatAnswer({ task, byResourceGroup, total, untagged })
      };
    }
    case 'granular-read': {
      if (features.has('join')) {
        const q = {
          from: 'resources',
          where: NAME_IS('web-prod-03'),
          join: [{ via: 'nicId', as: 'nic' }, { via: 'nic.publicIpId', as: 'pip' }],
          select: ['powerState', 'pip.ipAddress']
        };
        const row = rows(runQuery(inv, q, features))[0] ?? {};
        return {
          task,
          ok: true,
          calls: 1,
          queries: [q],
          how: 'One query that follows the references.',
          answer: formatAnswer({ task, vm: 'web-prod-03', powerState: String(row.powerState), publicIp: (row['pip.ipAddress'] as string) ?? null })
        };
      }
      // Without a way to follow a reference the model chains three queries, copying each id into the next.
      const q1 = { from: 'resources', where: NAME_IS('web-prod-03'), select: ['powerState', 'nicId'] };
      const vm = rows(runQuery(inv, q1, features))[0] ?? {};
      const q2 = { from: 'resources', where: [{ field: 'id', op: '=', value: vm.nicId }], select: ['publicIpId'] };
      const nic = rows(runQuery(inv, q2, features))[0] ?? {};
      const q3 = { from: 'resources', where: [{ field: 'id', op: '=', value: nic.publicIpId }], select: ['ipAddress'] };
      const pip = rows(runQuery(inv, q3, features))[0] ?? {};
      return {
        task,
        ok: true,
        calls: 3,
        queries: [q1, q2, q3],
        how: 'Three queries, copying each id into the next.',
        answer: formatAnswer({ task, vm: 'web-prod-03', powerState: String(vm.powerState), publicIp: (pip.ipAddress as string) ?? null })
      };
    }
    case 'bulk-write': {
      if (!features.has('update')) {
        return { task, ok: false, calls: 0, queries: [], needs: 'update', reason: 'The language only reads. Nothing in it can change a resource.' };
      }
      const cutoff = new Date(new Date(inv.generatedAt).getTime() - 30 * 86_400_000).toISOString();
      const idle = features.has('compute')
        ? { field: 'idleDays', op: '>', value: 30 }
        : { field: 'lastActivityAt', op: '<', value: cutoff };
      const tag = {
        from: 'resources',
        where: [{ field: 'resourceGroup', op: '=', value: 'app-staging' }, { field: 'tagCount', op: '=', value: 0 }],
        update: { set: { 'tags.env': 'staging', 'tags.owner': 'app-team' } }
      };
      const stop = {
        from: 'resources',
        ...(features.has('compute') ? { compute: { idleDays: { fn: 'daysSince', field: 'lastActivityAt' } } } : {}),
        where: [{ field: 'type', op: '=', value: 'virtualMachine' }, { field: 'powerState', op: '!=', value: 'deallocated' }, idle],
        update: { set: { powerState: 'deallocated' } }
      };
      const a = runQuery(inv, tag, features);
      const b = runQuery(inv, stop, features);
      const changes = [a, b].flatMap((o) => (o.ok && o.kind === 'update' ? o.changes : []));
      const batch = features.has('batch');
      return {
        task,
        ok: true,
        calls: batch ? 1 : 2,
        queries: batch ? [{ queries: [tag, stop] }] : [tag, stop],
        how: batch ? 'Both rules in one batched call.' : 'One update for each rule.',
        answer: formatAnswer({
          task,
          tagged: changes.filter((c) => c.field === 'tags.env').length,
          deallocated: changes.filter((c) => c.field === 'powerState').map((c) => c.resourceName)
        }),
        reason: features.has('compute') ? undefined : `Without computed values the model must work out the cutoff date (${cutoff.slice(0, 10)}) itself.`,
        changes
      };
    }
  }
}

export const TASK_LABEL: Record<TaskId, string> = {
  'granular-read': 'Follow a VM to its public IP',
  'filter-aggregate': 'Cost of running VMs by group',
  'bulk-write': 'Tag and deallocate in bulk',
  'single-lookup': 'List production groups'
};

/** All four tasks with the language as it stands. The change set of the write is returned too, for checking. */
export function coverage(features: ReadonlySet<FeatureId>, inv: Inventory): TaskPlan[] {
  return (['single-lookup', 'filter-aggregate', 'granular-read', 'bulk-write'] as TaskId[]).map((t) => planTask(t, features, structuredClone(inv)));
}

// ── questions the language was not built for ───────────────────────────────

export interface FreshQuestion {
  id: string;
  question: string;
  /** What the model would try in the query language. */
  query: unknown;
  /** What the next feature would have to be. */
  next: string;
  /** The same question as ordinary code. */
  code: string;
}

export const FRESH_QUESTIONS: FreshQuestion[] = [
  {
    id: 'disks',
    question: 'Which disks are attached to VMs that are stopped or deallocated?',
    query: {
      from: 'resources',
      where: [{ field: 'type', op: '=', value: 'disk' }, { field: 'vm.powerState', op: 'in', value: ['stopped', 'deallocated'] }],
      join: [{ via: 'attachedToVmId', as: 'vm' }],
      select: ['name', 'vm.name', 'vm.powerState']
    },
    next: 'Follow references',
    code: `function main(data) {
  const byId = new Map(data.resources.map((r) => [r.id, r]));
  return data.resources
    .filter((r) => r.type === 'disk' && ['stopped', 'deallocated'].includes(byId.get(r.attachedToVmId)?.powerState))
    .map((r) => ({ disk: r.name, vm: byId.get(r.attachedToVmId).name }));
}`
  },
  {
    id: 'median',
    question: 'What is the median monthly cost of the running VMs in each resource group?',
    query: {
      from: 'resources',
      where: [{ field: 'type', op: '=', value: 'virtualMachine' }, { field: 'powerState', op: '=', value: 'running' }],
      groupBy: ['resourceGroup'],
      aggregate: [{ fn: 'median', field: 'costMonthly', as: 'median' }]
    },
    next: 'A median aggregate',
    code: `function main(data) {
  const costs = {};
  for (const r of data.resources) {
    if (r.type === 'virtualMachine' && r.powerState === 'running') (costs[r.resourceGroup] ||= []).push(r.costMonthly);
  }
  return Object.fromEntries(Object.entries(costs).map(([g, c]) => {
    c.sort((a, b) => a - b);
    const m = c.length >> 1;
    return [g, c.length % 2 ? c[m] : (c[m - 1] + c[m]) / 2];
  }));
}`
  },
  {
    id: 'share',
    question: 'Which resource groups have a larger share of untagged resources than the estate as a whole?',
    query: { from: 'resources', groupBy: ['resourceGroup'], aggregate: [{ fn: 'avg', field: 'untagged', as: 'share' }] },
    next: 'Nested aggregation',
    code: `function main(data) {
  const rate = (rs) => rs.filter((r) => Object.keys(r.tags).length === 0).length / rs.length;
  const overall = rate(data.resources);
  const groups = {};
  for (const r of data.resources) (groups[r.resourceGroup] ||= []).push(r);
  return Object.entries(groups)
    .map(([g, rs]) => ({ group: g, share: Math.round(rate(rs) * 100) / 100 }))
    .filter((g) => g.share > overall);
}`
  },
  {
    id: 'ratio',
    question: 'Which five VMs cost the most per vCPU?',
    query: {
      from: 'resources',
      where: [{ field: 'type', op: '=', value: 'virtualMachine' }],
      compute: { costPerVcpu: { fn: 'divide', field: 'costMonthly', by: 'vcpus' } },
      orderBy: [{ field: 'costPerVcpu', dir: 'desc' }],
      limit: 5
    },
    next: 'Arithmetic in computed values',
    code: `function main(data) {
  return data.resources
    .filter((r) => r.type === 'virtualMachine')
    .map((r) => ({ vm: r.name, perVcpu: Math.round((r.costMonthly / r.vcpus) * 100) / 100 }))
    .sort((a, b) => b.perVcpu - a.perVcpu)
    .slice(0, 5);
}`
  }
];

// ── what to say about each rung ────────────────────────────────────────────

const plural = (n: number, one: string, many = one + 's'): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * Facts about a rung, every one read off its replay. The first is the shape of the run; what it
 * adds up to is shown beside it from `rung.bill`, so the two cannot disagree.
 */
export function rungFacts(r: Rung): string[] {
  const t = r.replay.totals;
  // The per-VM lookups, not the one list that finds the VMs, so the number matches the "each" in the call list.
  const lookups = r.replay.calls.filter((c) => !c.error && c.name !== 'list_vms');
  const avg = lookups.length ? Math.round(lookups.reduce((n, c) => n + c.resultSentTokens, 0) / lookups.length) : 0;
  const shape = `${plural(t.calls, 'call')} over ${plural(t.turns, 'turn')}.`;
  switch (r.id) {
    case 'per-property':
      return [shape, `${plural(r.tools.length, 'tool')} to describe: \u2248 ${fmtTokens(r.setupTokens)} tokens before the question, sent again on every turn.`];
    case 'one-tool':
      return [shape, `One tool is cheap to describe (\u2248 ${fmtTokens(r.setupTokens)} tokens), but each of its results is \u2248 ${fmtTokens(avg)} tokens, for a question that needs three fields.`];
    case 'aspect':
      return [shape, 'The question spans two aspects, compute for the power state and billing for cost and tags, so each running VM takes two calls.'];
    case 'aspects':
      return [shape, 'One call per VM, but the agent cannot tell which VMs are running without asking about all of them.'];
    case 'filter':
      return [shape, 'One call, because the summary happens to carry the cost, tag count and power state this question needs.'];
    case 'calculator': {
      const sums = r.replay.calls.filter((c) => c.name === 'calculate');
      const written = sums.reduce((n, c) => n + c.callTokens, 0);
      const figures = sums.reduce((n, c) => n + String(c.args.expression).split('+').length, 0);
      return [
        shape,
        `The calculator cannot see the estate, so the model copies ${plural(figures, 'figure')} into ${plural(sums.length, 'call')}: \u2248 ${fmtTokens(written)} tokens it has to write, of figures it had already read.`
      ];
    }
    case 'query':
      return [shape, `The cheapest bill here, because this is the kind of question the language was built for. Its definition is already \u2248 ${fmtTokens(r.setupTokens)} tokens per turn.`];
    case 'code':
      return [shape, `\u2248 ${fmtTokens(r.setupTokens)} tokens of setup per turn. That is the shape of the data, and it does not grow with the questions.`];
  }
}

/** Queries to load into the playground, each in the language as the article describes it. */
export const EXAMPLE_QUERIES: Array<{ id: string; label: string; query: unknown }> = [
  {
    id: 'cost',
    label: 'Cost by group',
    query: { from: 'resources', where: PROD_RUNNING, groupBy: ['resourceGroup'], aggregate: [{ fn: 'sum', field: 'costMonthly', as: 'total' }] }
  },
  { id: 'groups', label: 'Production groups', query: { from: 'resourceGroups', where: [{ field: 'subscription', op: '=', value: PROD }], select: ['name'] } },
  {
    id: 'ip',
    label: 'VM to public IP',
    query: {
      from: 'resources',
      where: NAME_IS('web-prod-03'),
      join: [{ via: 'nicId', as: 'nic' }, { via: 'nic.publicIpId', as: 'pip' }],
      select: ['powerState', 'pip.ipAddress']
    }
  },
  {
    id: 'tag',
    label: 'Tag untagged staging resources',
    query: {
      from: 'resources',
      where: [{ field: 'resourceGroup', op: '=', value: 'app-staging' }, { field: 'tagCount', op: '=', value: 0 }],
      update: { set: { 'tags.env': 'staging', 'tags.owner': 'app-team' } }
    }
  },
  {
    id: 'idle',
    label: 'Idle VMs',
    query: {
      from: 'resources',
      compute: { idleDays: { fn: 'daysSince', field: 'lastActivityAt' } },
      where: [{ field: 'type', op: '=', value: 'virtualMachine' }, { field: 'idleDays', op: '>', value: 30 }],
      select: ['name', 'idleDays'],
      orderBy: [{ field: 'idleDays', dir: 'desc' }]
    }
  }
];
