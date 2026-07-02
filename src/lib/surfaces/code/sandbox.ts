/**
 * Node VM sandbox that runs the agent's `function main(data, ctx)` against a
 * plain-data projection of the inventory.
 *
 * `data` is a projection clone — for reads we discard mutations; for writes
 * the caller diffs the mutated clone against the original to derive the
 * change set that gets applied.
 */

import vm from 'node:vm';

export interface SandboxResult {
  result: unknown;
  logs: string[];
}

export function executeInventoryCode(code: string, data: unknown, ctx: Record<string, unknown>, timeoutMs = 4000): SandboxResult {
  const logs: string[] = [];
  const sandboxConsole = {
    log: (...a: unknown[]) => logs.push(a.map(stringify).join(' ')),
    warn: (...a: unknown[]) => logs.push(a.map(stringify).join(' ')),
    error: (...a: unknown[]) => logs.push(a.map(stringify).join(' '))
  };

  const context = vm.createContext({
    data,
    ctx,
    console: sandboxConsole,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set
  });

  const wrapped = `
"use strict";
(function () {
${code}
  if (typeof main !== "function") {
    throw new Error("Sandbox code must define function main(data, ctx)");
  }
  return main(data, ctx);
})()
`.trim();

  const script = new vm.Script(wrapped, { filename: 'inventory_code.vm.js' });
  const result = script.runInContext(context, { timeout: timeoutMs });
  return { result, logs };
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
