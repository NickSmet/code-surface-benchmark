/**
 * The needle: the smallest set of things each question really depends on,
 * taken from the repo's ground truth. Screens draw it as a dashed outline so
 * "what the agent touched" can be read against "what it needed".
 */

import type { Inventory } from '$lib/inventory/types';
import { computeGroundTruth } from '$lib/inventory/truth';
import type { TaskId } from './answers';

export interface Needle {
  /** Resources whose data the answer (or the write set) is built from. */
  resourceIds: Set<string>;
  /** Resource groups, for questions that are about groups rather than resources. */
  groupNames: Set<string>;
  mode: 'read' | 'write';
  /** One sentence: what the question depends on. */
  caption: string;
}

export function needleFor(task: TaskId, inv: Inventory): Needle {
  const truth = computeGroundTruth(inv);
  const byId = new Map(inv.resources.map((r) => [r.id, r]));

  switch (task) {
    case 'granular-read': {
      const vm = inv.resources.find((r) => r.name === 'web-prod-03');
      const ids = new Set<string>();
      if (vm?.type === 'virtualMachine') {
        ids.add(vm.id);
        ids.add(vm.nicId);
        const nic = byId.get(vm.nicId);
        if (nic?.type === 'networkInterface' && nic.publicIpId) ids.add(nic.publicIpId);
      }
      return {
        resourceIds: ids,
        groupNames: new Set(),
        mode: 'read',
        caption: 'One VM, the network interface it points at, and the public IP behind that.'
      };
    }
    case 'filter-aggregate': {
      const sub = inv.subscriptions.find((s) => s.name === truth.prodSubName);
      const ids = new Set(
        inv.resources
          .filter((r) => r.type === 'virtualMachine' && r.subscriptionId === sub?.id && r.powerState === 'running')
          .map((r) => r.id)
      );
      return {
        resourceIds: ids,
        groupNames: new Set(),
        mode: 'read',
        caption: `The ${ids.size} running VMs in ${truth.prodSubName}: only their cost and tag count matter.`
      };
    }
    case 'bulk-write': {
      const ids = new Set(truth.expectedBulkDiff.map((row) => row.resourceId));
      return {
        resourceIds: ids,
        groupNames: new Set(),
        mode: 'write',
        caption: `${ids.size} resources to change: untagged app-staging resources plus the idle VMs anywhere in the estate.`
      };
    }
    case 'single-lookup':
      return {
        resourceIds: new Set(),
        groupNames: new Set(truth.prodGroups),
        mode: 'read',
        caption: `${truth.prodGroupCount} resource groups. Not one resource record is needed.`
      };
  }
}
