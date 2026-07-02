/**
 * Sanity-check / preview of the mock inventory.
 *
 *   npm run seed:demo
 *
 * Prints headline stats and verifies the entities the canned tasks rely on.
 */

import { buildInventory } from '../src/lib/inventory/fixtures/builders';
import { buildProjection } from '../src/lib/inventory/projection';
import type { NetworkInterface, PublicIp, VirtualMachine } from '../src/lib/inventory/types';

const inv = buildInventory();
const byType: Record<string, number> = {};
for (const r of inv.resources) byType[r.type] = (byType[r.type] ?? 0) + 1;

console.log('generatedAt:', inv.generatedAt);
console.log('subscriptions:', inv.subscriptions.map((s) => `${s.name} (${s.id})`).join(', '));
console.log('resource groups:', inv.resourceGroups.map((g) => g.name).join(', '));
console.log('total resources:', inv.resources.length);
console.table(byType);

// Approx token cost of dumping everything (rough: 4 chars/token).
const fullJson = JSON.stringify(inv.resources);
console.log('full-resource JSON chars:', fullJson.length, '(~', Math.round(fullJson.length / 4), 'tokens)');

// ── Task-referenced invariants ──
const hero = inv.resources.find(
  (r): r is VirtualMachine => r.type === 'virtualMachine' && r.name === 'web-prod-03'
);
if (!hero) throw new Error('FAIL: web-prod-03 missing');
const nic = inv.resources.find((r): r is NetworkInterface => r.id === hero.nicId);
const pip = nic?.publicIpId ? inv.resources.find((r): r is PublicIp => r.id === nic.publicIpId) : null;
console.log(`web-prod-03: powerState=${hero.powerState}, nic=${nic?.name}, publicIp=${pip?.ipAddress ?? 'NONE'}`);
if (!pip) throw new Error('FAIL: web-prod-03 has no public IP');

const stagingUntagged = inv.resources.filter(
  (r) => r.resourceGroup === 'app-staging' && Object.keys(r.tags).length === 0
);
console.log('app-staging untagged resources:', stagingUntagged.length);
if (stagingUntagged.length === 0) throw new Error('FAIL: expected untagged resources in app-staging');

const now = new Date(inv.generatedAt).getTime();
const idleVms = inv.resources.filter(
  (r): r is VirtualMachine =>
    r.type === 'virtualMachine' &&
    (now - new Date(r.lastActivityAt).getTime()) / 86_400_000 > 30
);
console.log('VMs idle > 30 days:', idleVms.length, '(e.g.', idleVms.slice(0, 3).map((v) => v.name).join(', '), ')');
if (idleVms.length === 0) throw new Error('FAIL: expected idle VMs');

const runningProdVms = inv.resources.filter(
  (r): r is VirtualMachine =>
    r.type === 'virtualMachine' && r.powerState === 'running' && r.subscriptionId.includes('prod') && r.resourceGroup.endsWith('-prod')
);
const prodVmCost = runningProdVms.reduce((s, v) => s + v.costMonthly, 0);
console.log('running prod VMs:', runningProdVms.length, '→ $/mo', Math.round(prodVmCost));

const projection = buildProjection(inv);
const sample = projection.resources.find((r) => (r as { name: string }).name === 'web-prod-03');
console.log('projection strips internals:', !('_internalId' in (sample as object)) && !('_billingAccount' in (sample as object)));

console.log('\nOK — dataset invariants hold.');
