/**
 * Ground truth for the preset tasks, computed directly from the inventory.
 * Single source for the bench-live harness and the live UI verdicts.
 */

import type { Inventory, NetworkInterface, PublicIp, VirtualMachine } from './types';

export interface GroundTruth {
  heroPowerState: string;
  heroPublicIp: string;
  prodSubName: string;
  prodGroups: string[];
  prodGroupCount: number;
  /** Exact monthly total of running VMs in the Production subscription. */
  prodRunningTotal: number;
  /** Resources in app-staging with no tags at all. */
  untaggedStagingCount: number;
  /** VMs idle > 30 days (relative to the snapshot) and not already deallocated. */
  expectedDeallocNames: string[];
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

  const prodRunningTotal =
    Math.round(
      inv.resources
        .filter(
          (r): r is VirtualMachine =>
            r.type === 'virtualMachine' && r.subscriptionId === prodSub.id && r.powerState === 'running'
        )
        .reduce((n, vm) => n + vm.costMonthly, 0) * 100
    ) / 100;

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

  return {
    heroPowerState: hero.powerState,
    heroPublicIp: heroPip.ipAddress,
    prodSubName: prodSub.name,
    prodGroups,
    prodGroupCount: prodGroups.length,
    prodRunningTotal,
    untaggedStagingCount,
    expectedDeallocNames
  };
}
