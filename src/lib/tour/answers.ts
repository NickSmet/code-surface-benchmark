/**
 * The four tasks' final answers, written once.
 *
 * Both surfaces' replays end by stating the same facts in the same words, so
 * the completion-token comparison between them is about the work, not about
 * phrasing.
 */

export type TaskId = 'granular-read' | 'filter-aggregate' | 'bulk-write' | 'single-lookup';

export type Facts =
  | { task: 'granular-read'; vm: string; powerState: string; publicIp: string | null }
  | { task: 'filter-aggregate'; byResourceGroup: Record<string, number>; total: number; untagged: string[] }
  | { task: 'bulk-write'; tagged: number; deallocated: string[] }
  | { task: 'single-lookup'; names: string[] };

export function usd(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatAnswer(f: Facts): string {
  switch (f.task) {
    case 'granular-read':
      return `${f.vm} is ${f.powerState}; its public IP is ${f.publicIp ?? 'not assigned'}.`;
    case 'filter-aggregate': {
      const rows = Object.entries(f.byResourceGroup).map(([g, n]) => `${g}: ${usd(n)}`);
      const untagged = f.untagged.length ? f.untagged.join(', ') : 'none';
      return `Running Production VMs, monthly cost by resource group — ${rows.join('; ')}. Grand total ${usd(f.total)}. Running VMs with no tags: ${untagged}.`;
    }
    case 'bulk-write':
      return `Tagged ${f.tagged} untagged resources in app-staging with env=staging and owner=app-team, and deallocated ${f.deallocated.length} idle VMs: ${f.deallocated.join(', ')}.`;
    case 'single-lookup':
      return `Production has ${f.names.length} resource groups: ${f.names.join(', ')}.`;
  }
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Read the facts back out of what the reference programs return. Returns
 * null when the result has a different shape (an edited program), in which
 * case callers fall back to showing the raw value.
 */
export function factsFromCodeResult(task: TaskId, result: unknown): Facts | null {
  const r = obj(result);
  if (!r) return null;
  switch (task) {
    case 'granular-read':
      return typeof r.powerState === 'string'
        ? { task, vm: 'web-prod-03', powerState: r.powerState, publicIp: typeof r.publicIp === 'string' ? r.publicIp : null }
        : null;
    case 'filter-aggregate': {
      const by = obj(r.byResourceGroup);
      if (!by || typeof r.totalMonthly !== 'number' || !Array.isArray(r.untaggedRunningVms)) return null;
      const byResourceGroup = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(Number(v) * 100) / 100]));
      return { task, byResourceGroup, total: Math.round(r.totalMonthly * 100) / 100, untagged: r.untaggedRunningVms.map(String) };
    }
    case 'bulk-write':
      return typeof r.taggedCount === 'number' && Array.isArray(r.deallocated)
        ? { task, tagged: r.taggedCount, deallocated: r.deallocated.map(String) }
        : null;
    case 'single-lookup':
      return Array.isArray(r.names) ? { task, names: r.names.map(String) } : null;
  }
}
