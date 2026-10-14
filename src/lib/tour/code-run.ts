/**
 * Run model-written JavaScript against the projection — and watch what it touches.
 *
 * Same contract as the benchmark's code surface (surfaces/code/index.ts):
 * `function main(data, ctx)`, reads return values, writes mutate `data`, and
 * the runtime derives the change set with `diffProjection`, rejecting the
 * whole proposal if any edit is outside the contract.
 *
 * The addition is instrumentation. `data` is handed to the code wrapped in
 * Proxies that log every property read and write per resource, in two phases:
 *
 *   run        reads while the code executes   → the runtime "scanned" these
 *   serialize  reads while the return value is → these resources went into the
 *              turned into text                  model's context in full
 *
 * Pure TypeScript with no DOM or Node APIs, so the same function runs in a Web
 * Worker in the browser and under `tsx --test`.
 *
 * NOT a security boundary. Globals are allowlisted and network/worker APIs are
 * shadowed, but model code can still reach the real global object; the repo's
 * node:vm executor carries the same caveat. A Worker plus a time limit keeps a
 * runaway loop from freezing the page, nothing more.
 */

import { diffProjection, type ChangeRow, type ProjectionView } from '$lib/inventory/projection';
import { makeCtx } from '$lib/surfaces/code/helpers';

export interface RunRequest {
  code: string;
  projection: ProjectionView;
  /** The model's one-line rationale for writes (echoed in the tool result, like the real surface). */
  rationale?: string;
}

export type RunStatus = 'ok' | 'error' | 'rejected' | 'timeout';

export interface RunOutcome {
  status: RunStatus;
  /** Exception message, diff-validation message, or timeout note. */
  error?: string;
  /** Name of the resource a rejection was about, parsed from the message. */
  errorResource?: string;
  durationMs: number;
  /** Tool-result text exactly as the model would receive it. */
  content: string;
  hasResult: boolean;
  resultText: string | null;
  logs: string[];
  diff: ChangeRow[];
  mode: 'read' | 'write' | 'read_write';
  resourcesAffected: number;
  /** resource id → distinct fields read while the code ran. */
  scanned: Record<string, string[]>;
  /** resource id → fields read while serializing the result (returned in full). */
  returned: Record<string, string[]>;
  /** resource group name → fields read. */
  scannedGroups: Record<string, string[]>;
  /** resource id → fields the code tried to assign (also recorded for rejected runs). */
  attempted: Record<string, string[]>;
  /** Ids of resources whose name or id appears as a string in the result. */
  named: string[];
  /** Resource-group names that appear as strings in the result. */
  namedGroups: string[];
  totals: { resourcesScanned: number; propertyReads: number; resourcesReturned: number };
}

type FieldLog = Map<string, Set<string>>;

interface Tracker {
  phase: 'run' | 'serialize';
  run: FieldLog;
  returned: FieldLog;
  writes: FieldLog;
  groups: FieldLog;
  reads: number;
}

function note(log: FieldLog, key: string, field: string): void {
  let set = log.get(key);
  if (!set) log.set(key, (set = new Set()));
  set.add(field);
}

function toRecord(log: FieldLog): Record<string, string[]> {
  return Object.fromEntries([...log].map(([k, v]) => [k, [...v]]));
}

type Obj = Record<string, unknown>;

/** Lookups the language itself performs (JSON.stringify probes toJSON, await probes then, …); not real reads. */
const INCIDENTAL = new Set(['toJSON', 'then', 'constructor', 'valueOf', 'toString', 'inspect', 'nodeType', '$$typeof']);

/** Wrap the projection so every read/write the code performs is logged. */
function trackProjection(data: ProjectionView, tracker: Tracker): ProjectionView {
  const cache = new WeakMap<object, object>();
  const readLog = (): FieldLog => (tracker.phase === 'run' ? tracker.run : tracker.returned);

  const wrapTags = (tags: Obj, id: string): Obj => {
    const hit = cache.get(tags);
    if (hit) return hit as Obj;
    const proxy = new Proxy(tags, {
      get(t, prop, receiver) {
        if (typeof prop !== 'string' || INCIDENTAL.has(prop)) return Reflect.get(t, prop, receiver);
        tracker.reads += 1;
        note(readLog(), id, `tags.${prop}`);
        return Reflect.get(t, prop);
      },
      has(t, prop) {
        if (typeof prop === 'string') note(readLog(), id, `tags.${prop}`);
        return Reflect.has(t, prop);
      },
      set(t, prop, value) {
        if (typeof prop === 'string') note(tracker.writes, id, `tags.${prop}`);
        return Reflect.set(t, prop, value);
      },
      deleteProperty(t, prop) {
        if (typeof prop === 'string') note(tracker.writes, id, `tags.${prop}`);
        return Reflect.deleteProperty(t, prop);
      },
      defineProperty(t, prop, desc) {
        if (typeof prop === 'string') note(tracker.writes, id, `tags.${prop}`);
        return Reflect.defineProperty(t, prop, desc);
      }
    });
    cache.set(tags, proxy);
    return proxy;
  };

  const wrapResource = (target: Obj): Obj => {
    const hit = cache.get(target);
    if (hit) return hit as Obj;
    const id = String(target.id);
    const proxy = new Proxy(target, {
      get(t, prop, receiver) {
        if (typeof prop !== 'string' || INCIDENTAL.has(prop)) return Reflect.get(t, prop, receiver);
        tracker.reads += 1;
        note(readLog(), id, prop);
        const value = Reflect.get(t, prop);
        if (prop === 'tags' && value && typeof value === 'object') return wrapTags(value as Obj, id);
        return value;
      },
      has(t, prop) {
        if (typeof prop === 'string') note(readLog(), id, prop);
        return Reflect.has(t, prop);
      },
      set(t, prop, value) {
        if (typeof prop === 'string') note(tracker.writes, id, prop);
        return Reflect.set(t, prop, value);
      },
      deleteProperty(t, prop) {
        if (typeof prop === 'string') note(tracker.writes, id, prop);
        return Reflect.deleteProperty(t, prop);
      },
      defineProperty(t, prop, desc) {
        if (typeof prop === 'string') note(tracker.writes, id, prop);
        return Reflect.defineProperty(t, prop, desc);
      }
    });
    cache.set(target, proxy);
    return proxy;
  };

  const wrapGroup = (target: Obj): Obj => {
    const hit = cache.get(target);
    if (hit) return hit as Obj;
    const name = String(target.name);
    const proxy = new Proxy(target, {
      get(t, prop, receiver) {
        if (typeof prop !== 'string' || INCIDENTAL.has(prop)) return Reflect.get(t, prop, receiver);
        tracker.reads += 1;
        note(tracker.groups, name, prop);
        return Reflect.get(t, prop);
      }
    });
    cache.set(target, proxy);
    return proxy;
  };

  const wrapList = (list: unknown[], wrapItem: (o: Obj) => Obj): unknown[] => {
    const hit = cache.get(list);
    if (hit) return hit as unknown[];
    const proxy = new Proxy(list, {
      get(arr, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const item = arr[Number(prop)];
          return item && typeof item === 'object' ? wrapItem(item as Obj) : item;
        }
        return Reflect.get(arr, prop, receiver);
      }
    });
    cache.set(list, proxy);
    return proxy;
  };

  return new Proxy(data, {
    get(t, prop, receiver) {
      if (prop === 'resources' && Array.isArray(t.resources)) return wrapList(t.resources, wrapResource);
      if (prop === 'resourceGroups' && Array.isArray(t.resourceGroups)) return wrapList(t.resourceGroups, wrapGroup);
      return Reflect.get(t, prop, receiver);
    }
  });
}

/** Names that exist only in the browser/worker; shadowed so model code gets a clear error instead. */
const SHADOWED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'postMessage', 'indexedDB', 'caches', 'self', 'globalThis', 'Function'];

/** The allowlist, identical to the benchmark's node:vm context. */
export const ALLOWED_GLOBALS = ['data', 'ctx', 'console', 'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Map', 'Set'] as const;

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function stringLeaves(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 12 || value === null) return;
  if (typeof value === 'string') out.add(value);
  else if (Array.isArray(value)) for (const v of value) stringLeaves(v, out, depth + 1);
  else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Obj)) {
      out.add(k);
      stringLeaves(v, out, depth + 1);
    }
  }
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function emptyOutcome(partial: Partial<RunOutcome>): RunOutcome {
  return {
    status: 'ok',
    durationMs: 0,
    content: '',
    hasResult: false,
    resultText: null,
    logs: [],
    diff: [],
    mode: 'read',
    resourcesAffected: 0,
    scanned: {},
    returned: {},
    scannedGroups: {},
    attempted: {},
    named: [],
    namedGroups: [],
    totals: { resourcesScanned: 0, propertyReads: 0, resourcesReturned: 0 },
    ...partial
  };
}

/** An outcome for failures that happen outside the run itself (timeout, worker crash). */
export function failedOutcome(status: Exclude<RunStatus, 'ok' | 'rejected'>, error: string, durationMs: number): RunOutcome {
  return emptyOutcome({ status, error, durationMs, content: JSON.stringify({ error }) });
}

/** Run `code` against a fresh copy of `projection` and report everything that happened. */
export function runTracked(req: RunRequest): RunOutcome {
  const started = now();
  const before = req.projection;
  const after = structuredClone(req.projection) as ProjectionView;
  const tracker: Tracker = { phase: 'run', run: new Map(), returned: new Map(), writes: new Map(), groups: new Map(), reads: 0 };
  const logs: string[] = [];
  const sandboxConsole = {
    log: (...a: unknown[]) => void logs.push(a.map(stringify).join(' ')),
    warn: (...a: unknown[]) => void logs.push(a.map(stringify).join(' ')),
    error: (...a: unknown[]) => void logs.push(a.map(stringify).join(' '))
  };

  const snapshot = (partial: Partial<RunOutcome>): RunOutcome =>
    emptyOutcome({
      durationMs: now() - started,
      logs: logs.slice(0, 20),
      scanned: toRecord(tracker.run),
      returned: toRecord(tracker.returned),
      scannedGroups: toRecord(tracker.groups),
      attempted: toRecord(tracker.writes),
      totals: {
        resourcesScanned: tracker.run.size,
        propertyReads: tracker.reads,
        resourcesReturned: tracker.returned.size
      },
      ...partial
    });

  let result: unknown;
  let resultText: string | null = null;
  try {
    const tracked = trackProjection(after, tracker);
    const ctx = makeCtx(after);
    // Same wrapper as the benchmark's node:vm executor: strict mode, code in an IIFE, then call main.
    const body =
      '"use strict";\nreturn (function () {\n' +
      req.code +
      '\n  if (typeof main !== "function") {\n    throw new Error("Sandbox code must define function main(data, ctx)");\n  }\n  return main(data, ctx);\n})();';
    const run = new Function(...ALLOWED_GLOBALS, ...SHADOWED, body) as (...args: unknown[]) => unknown;
    const globals: unknown[] = [tracked, ctx, sandboxConsole, JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp, Map, Set];
    result = run(...globals, ...SHADOWED.map(() => undefined));
    // Turning the result into text is itself a read: any record returned directly is "in context".
    tracker.phase = 'serialize';
    resultText = result === undefined ? null : (JSON.stringify(result) ?? null);
    tracker.phase = 'run';
  } catch (err) {
    return snapshot({ status: 'error', error: err instanceof Error ? err.message : String(err), content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) });
  }

  let diff: ChangeRow[];
  try {
    diff = diffProjection(before, after);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const colon = message.indexOf(': ');
    return snapshot({
      status: 'rejected',
      error: message,
      errorResource: colon > 0 ? message.slice(0, colon) : undefined,
      content: JSON.stringify({ error: message })
    });
  }

  const hasResult = result !== undefined && resultText !== null;
  const parsed: unknown = hasResult ? JSON.parse(resultText as string) : undefined;
  const resourcesAffected = new Set(diff.map((d) => d.resourceId)).size;
  const mode = diff.length === 0 ? 'read' : hasResult ? 'read_write' : 'write';
  const content = JSON.stringify({
    mode,
    ...(hasResult ? { result: parsed } : {}),
    ...(diff.length > 0 ? { changeCount: diff.length, resourcesAffected, rationale: req.rationale ?? '' } : {}),
    logs: logs.slice(0, 20)
  });

  const named: string[] = [];
  const namedGroups: string[] = [];
  if (hasResult) {
    const strings = new Set<string>();
    stringLeaves(parsed, strings);
    for (const r of before.resources as unknown as Array<{ id: string; name: string }>) {
      if (strings.has(r.name) || strings.has(r.id)) named.push(r.id);
    }
    for (const g of before.resourceGroups) if (strings.has(g.name)) namedGroups.push(g.name);
  }

  return snapshot({ status: 'ok', content, hasResult, resultText, diff, mode, resourcesAffected, named, namedGroups });
}
