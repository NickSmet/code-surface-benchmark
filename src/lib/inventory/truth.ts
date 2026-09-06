/**
 * Ground truth for the preset tasks, computed directly from the inventory.
 * Single source for the bench-live harness and the live UI verdicts.
 */

import type { Inventory, NetworkInterface, PublicIp, VirtualMachine } from './types';
import type { ChangeRow } from './projection';

export interface GroundTruth {
  heroPowerState: string;
  heroPublicIp: string;
  prodSubName: string;
  prodGroups: string[];
  prodGroupCount: number;
  /** Exact monthly total of running VMs in the Production subscription. */
  prodRunningTotal: number;
  prodRunningByGroup: Record<string, number>;
  prodUntaggedRunningNames: string[];
  /** Resources in app-staging with no tags at all. */
  untaggedStagingCount: number;
  /** VMs idle > 30 days (relative to the snapshot) and not already deallocated. */
  expectedDeallocNames: string[];
  /** Independently constructed expected changes, with ids and exact values. */
  expectedBulkDiff: ChangeRow[];
}

export function computeGroundTruth(inv: Inventory): GroundTruth {
  const snapshotMs = new Date(inv.generatedAt).getTime();
  const daysSince = (iso: string): number => (snapshotMs - new Date(iso).getTime()) / 86_400_000;

  const hero = inv.resources.find(
    (r): r is VirtualMachine => r.type === 'virtualMachine' && r.name === 'web-prod-03'
  );
  if (!hero) throw new Error('fixture invariant broken: web-prod-03 missing');
  const heroNic = inv.resources.find((r): r is NetworkInterface => r.id === hero.nicId);
  const heroPip =
    heroNic?.publicIpId ? inv.resources.find((r): r is PublicIp => r.id === heroNic.publicIpId) : null;
  if (!heroPip) throw new Error('fixture invariant broken: web-prod-03 has no public IP');

  const prodSub = inv.subscriptions.find((s) => /prod/i.test(s.name));
  if (!prodSub) throw new Error('fixture invariant broken: no Production subscription');
  const prodGroups = inv.resourceGroups
    .filter((g) => g.subscriptionId === prodSub.id)
    .map((g) => g.name)
    .sort();

  const runningProd = inv.resources.filter(
    (r): r is VirtualMachine => r.type === 'virtualMachine' && r.subscriptionId === prodSub.id && r.powerState === 'running'
  );
  const centsByGroup: Record<string, number> = {};
  for (const vm of runningProd) centsByGroup[vm.resourceGroup] = (centsByGroup[vm.resourceGroup] ?? 0) + Math.round(vm.costMonthly * 100);
  const prodRunningByGroup = Object.fromEntries(Object.entries(centsByGroup).map(([group, cents]) => [group, cents / 100]));
  const prodRunningTotal = Object.values(centsByGroup).reduce((a, b) => a + b, 0) / 100;
  const prodUntaggedRunningNames = runningProd.filter((vm) => Object.keys(vm.tags).length === 0).map((vm) => vm.name).sort();

  const untaggedStagingCount = inv.resources.filter(
    (r) => r.resourceGroup === 'app-staging' && Object.keys(r.tags).length === 0
  ).length;

  const expectedDeallocNames = inv.resources
    .filter(
      (r): r is VirtualMachine =>
        r.type === 'virtualMachine' && r.powerState !== 'deallocated' && daysSince(r.lastActivityAt) > 30
    )
    .map((r) => r.name)
    .sort();

  const expectedBulkDiff: ChangeRow[] = [];
  for (const r of inv.resources) {
    const meta = { resourceId: r.id, resourceName: r.name, resourceType: r.type };
    if (r.resourceGroup === 'app-staging' && Object.keys(r.tags).length === 0) {
      for (const [tag, value] of [['env', 'staging'], ['owner', 'app-team']]) {
        expectedBulkDiff.push({ ...meta, field: `tags.${tag}`, op: 'add', before: null, after: value });
      }
    }
    if (r.type === 'virtualMachine' && r.powerState !== 'deallocated' && daysSince(r.lastActivityAt) > 30) {
      expectedBulkDiff.push({ ...meta, field: 'powerState', op: 'edit', before: r.powerState, after: 'deallocated' });
    }
  }

  return {
    heroPowerState: hero.powerState,
    heroPublicIp: heroPip.ipAddress,
    prodSubName: prodSub.name,
    prodGroups,
    prodGroupCount: prodGroups.length,
    prodRunningTotal,
    prodRunningByGroup,
    prodUntaggedRunningNames,
    untaggedStagingCount,
    expectedDeallocNames,
    expectedBulkDiff
  };
}
