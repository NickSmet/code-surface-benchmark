/**
 * Ground-truth correctness checks for the preset tasks. Pure functions shared
 * by the bench-live harness (node) and the live UI verdicts (browser): given
 * what a run produced (final text + the write set it applied), decide whether
 * it matches the truth computed from the inventory.
 */

import type { GroundTruth } from './inventory/truth';
import type { ChangeRow } from './inventory/projection';

export interface Check {
  label: string;
  pass: boolean;
  /** What the run actually did — shown alongside failures so a wrong verdict is auditable at a glance. */
  detail?: string;
}

/** The observable facts of one run that the checks are evaluated against. */
export interface RunFacts {
  ok: boolean;
  finalText: string;
  /** field -> number of diff rows writing it (e.g. "tags.env" -> 33). */
  diffFieldCounts: Record<string, number>;
  /** VM names with a powerState -> deallocated write. */
  deallocatedNames: string[];
}

/** Build RunFacts from raw diff rows (the UI path; bench-live accumulates while streaming). */
export function factsFromDiffs(ok: boolean, finalText: string, diffs: ChangeRow[]): RunFacts {
  const diffFieldCounts: Record<string, number> = {};
  const deallocatedNames: string[] = [];
  for (const row of diffs) {
    diffFieldCounts[row.field] = (diffFieldCounts[row.field] ?? 0) + 1;
    if (row.field === 'powerState' && row.after === 'deallocated' && !deallocatedNames.includes(row.resourceName)) {
      deallocatedNames.push(row.resourceName);
    }
  }
  return { ok, finalText, diffFieldCounts, deallocatedNames };
}

/** Every "1,234.56"-looking number in the text, parsed. */
export function extractAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/,/g, '') + (m[2] ?? ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function checksForTask(taskId: string, truth: GroundTruth, facts: RunFacts): Check[] {
  const text = facts.finalText.toLowerCase();
  const checks: Check[] = [{ label: 'completed without error', pass: facts.ok }];
  if (taskId === 'granular-read') {
    checks.push({ label: `states public IP ${truth.heroPublicIp}`, pass: facts.finalText.includes(truth.heroPublicIp) });
    checks.push({ label: `states power state "${truth.heroPowerState}"`, pass: text.includes(truth.heroPowerState) });
  } else if (taskId === 'filter-aggregate') {
    const amounts = extractAmounts(facts.finalText);
    const closest = amounts.length
      ? amounts.reduce((a, b) => (Math.abs(b - truth.prodRunningTotal) < Math.abs(a - truth.prodRunningTotal) ? b : a))
      : null;
    checks.push({
      label: `states the exact total $${truth.prodRunningTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} (±$1)`,
      pass: amounts.some((n) => Math.abs(n - truth.prodRunningTotal) <= 1),
      detail: closest === null ? 'no dollar amount found in the answer' : `closest stated amount: $${closest.toLocaleString('en-US')}`
    });
    checks.push({
      label: 'breaks down by resource group',
      pass: truth.prodGroups.some((g) => text.includes(g.toLowerCase()))
    });
  } else if (taskId === 'bulk-write') {
    checks.push({
      label: `writes tags.env on all ${truth.untaggedStagingCount} untagged resources`,
      pass: (facts.diffFieldCounts['tags.env'] ?? 0) === truth.untaggedStagingCount,
      detail: `wrote ${facts.diffFieldCounts['tags.env'] ?? 0}`
    });
    checks.push({
      label: `writes tags.owner on all ${truth.untaggedStagingCount} untagged resources`,
      pass: (facts.diffFieldCounts['tags.owner'] ?? 0) === truth.untaggedStagingCount,
      detail: `wrote ${facts.diffFieldCounts['tags.owner'] ?? 0}`
    });
    checks.push({
      label: `deallocates exactly [${truth.expectedDeallocNames.join(', ')}] (the VMs idle >30 days estate-wide)`,
      pass:
        facts.deallocatedNames.length === truth.expectedDeallocNames.length &&
        [...facts.deallocatedNames].sort().every((n, i) => n === truth.expectedDeallocNames[i]),
      detail:
        facts.deallocatedNames.length === 0
          ? 'deallocated none'
          : `deallocated [${[...facts.deallocatedNames].sort().join(', ')}]`
    });
  } else if (taskId === 'single-lookup') {
    checks.push({
      label: `states count ${truth.prodGroupCount}`,
      pass: new RegExp(`\\b${truth.prodGroupCount}\\b`).test(facts.finalText)
    });
    checks.push({
      label: 'names a Production resource group',
      pass: truth.prodGroups.some((g) => text.includes(g.toLowerCase()))
    });
  }
  return checks;
}
