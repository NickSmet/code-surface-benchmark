/**
 * Shared benchmark checks. State checks compare exact ids/fields/values.
 * Free-text answer checks are deliberately labelled heuristics: passing them
 * is not proof that every statement in the answer is correct.
 */
import type { GroundTruth } from './inventory/truth';
import type { ChangeRow } from './inventory/projection';

export interface Check {
  label: string;
  pass: boolean;
  detail?: string;
}

export interface RunFacts {
  ok: boolean;
  finalText: string;
  /** Only successfully applied tool diffs; excludes declined/error results. */
  appliedDiffs: ChangeRow[];
  /** Independently observed final state versus the starting snapshot. */
  stateDiff: ChangeRow[] | null;
}

export function factsFromDiffs(ok: boolean, finalText: string, appliedDiffs: ChangeRow[], stateDiff: ChangeRow[] | null): RunFacts {
  return { ok, finalText, appliedDiffs, stateDiff };
}

export function extractAmounts(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')));
}

const cents = (n: number): number => Math.round(n * 100);
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Key and compare every column; row order has no effect on a write set. */
export function sameChanges(actual: ChangeRow[], expected: ChangeRow[]): boolean {
  const encode = (row: ChangeRow): string => JSON.stringify([
    row.resourceId, row.resourceName, row.resourceType, row.field, row.op, row.before, row.after
  ]);
  const left = actual.map(encode).sort(), right = expected.map(encode).sort();
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

export function checksForTask(taskId: string, truth: GroundTruth, facts: RunFacts): Check[] {
  const text = facts.finalText.toLowerCase().replace(/[*`_]/g, '');
  const lines = text.split(/\r?\n/);
  const checks: Check[] = [
    { label: 'completed with a final answer', pass: facts.ok && text.trim().length > 0 },
    { label: 'final estate state was recorded', pass: facts.stateDiff !== null }
  ];
  if (taskId === 'bulk-write') {
    checks.push({
      label: 'applied exactly the expected resource ids, fields and values, with no extra writes',
      pass: sameChanges(facts.appliedDiffs, truth.expectedBulkDiff),
      detail: `${facts.appliedDiffs.length} applied rows; expected ${truth.expectedBulkDiff.length}`
    });
    checks.push({
      label: 'final estate matches the complete expected state change',
      pass: facts.stateDiff !== null && sameChanges(facts.stateDiff, truth.expectedBulkDiff)
    });
    return checks;
  }

  checks.push({ label: 'read task made no changes', pass: facts.appliedDiffs.length === 0 && facts.stateDiff?.length === 0 });
  if (taskId === 'granular-read') {
    checks.push({ label: `answer mentions public IP ${truth.heroPublicIp}`, pass: text.includes(truth.heroPublicIp) });
    checks.push({ label: `answer mentions power state ${truth.heroPowerState}`, pass: new RegExp(`\\b${escapeRegex(truth.heroPowerState)}\\b`).test(text) });
  } else if (taskId === 'filter-aggregate') {
    // Match each label to the numbers after it on the same line, stopping at
    // the next group/total label. Handles usual bullet lists and Markdown tables.
    const labels = [...Object.keys(truth.prodRunningByGroup).map(escapeRegex), '\\b(?:grand\\s+)?total\\b'];
    const segments = (label: string): string[] => lines.flatMap((line) => {
      const found = new RegExp(label, 'i').exec(line);
      if (!found) return [];
      const rest = line.slice(found.index + found[0].length);
      const next = new RegExp(labels.join('|'), 'i').exec(rest);
      return [next ? rest.slice(0, next.index) : rest];
    });
    const hasAmount = (label: string, expected: number): boolean => segments(label).some((s) => extractAmounts(s).some((n) => cents(n) === cents(expected)));
    checks.push({ label: `answer associates total with $${truth.prodRunningTotal.toFixed(2)} (cent precision)`, pass: hasAmount('\\b(?:grand\\s+)?total\\b', truth.prodRunningTotal) });
    for (const [group, amount] of Object.entries(truth.prodRunningByGroup)) {
      checks.push({ label: `answer associates ${group} with $${amount.toFixed(2)}`, pass: hasAmount(escapeRegex(group), amount) });
    }
    const untaggedLines = lines.filter((line) => /untagged|no tags|without tags|have tags|tagged/.test(line));
    const none = untaggedLines.some((line) =>
      /(?:untagged|without tags|no tags).*\b(?:none|no|0|zero)\b|\b(?:none|no|0|zero)\b.*(?:untagged|without tags|no tags)|\ball\b.*(?:tagged|have tags)/.test(line)
    );
    checks.push({
      label: truth.prodUntaggedRunningNames.length ? 'answer lists every untagged running production VM' : 'answer explicitly reports no untagged running production VMs',
      pass: truth.prodUntaggedRunningNames.length
        ? truth.prodUntaggedRunningNames.every((name) => untaggedLines.some((line) => line.includes(name.toLowerCase())))
        : none
    });
  } else if (taskId === 'single-lookup') {
    const count = String(truth.prodGroupCount);
    checks.push({ label: `answer states resource-group count ${count}`, pass: new RegExp(`\\b${count}\\s+resource\\s+groups?\\b|\\b(?:count|resource\\s+groups?)\\s*[:=]\\s*${count}\\b`).test(text) });
    for (const group of truth.prodGroups) checks.push({ label: `answer names ${group}`, pass: text.includes(group.toLowerCase()) });
  } else {
    checks.push({ label: 'task has a configured checker', pass: false });
  }
  return checks;
}
