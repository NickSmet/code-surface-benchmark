/**
 * Deterministic builder for the mock Azure inventory.
 *
 * A fixed-seed PRNG makes every build identical, so the benchmark numbers
 * are reproducible on stage and the named resources the canned tasks rely
 * on (e.g. `web-prod-03`) always exist with the same shape.
 *
 * Dates are anchored to a fixed SNAPSHOT_AT, not `Date.now()`, so "idle for
 * more than 30 days" is stable forever. The agent is told to reason about
 * age/idleness relative to `inventory.generatedAt`.
 */

import type {
  AppService,
  Disk,
  Inventory,
  NetworkInterface,
  PublicIp,
  Resource,
  ResourceGroup,
  SqlDatabase,
  StorageAccount,
  Subscription,
  Tags,
  VirtualMachine
} from '../types';

/** The snapshot's "now". Everything ages relative to this. */
export const SNAPSHOT_AT = '2026-06-01T09:00:00.000Z';

const SUB_PROD = 'sub-7f3a9c20-prod';
const SUB_NONPROD = 'sub-1b8e4d55-nonprod';

const SUBSCRIPTIONS: Subscription[] = [
  { id: SUB_PROD, name: 'Production' },
  { id: SUB_NONPROD, name: 'Non-Production' }
];

type RgSpec = {
  name: string;
  sub: string;
  loc: string;
  vmPrefix: string;
  vmCount: number;
  osType: 'Linux' | 'Windows';
  vmSize: string;
  /** Fraction of VMs that get a public IP. */
  publicIpRatio: number;
  appServices: number;
  storage: number;
  sql: number;
  /** 'all' | 'none' | 'partial' — how thoroughly resources are tagged. */
  tagging: 'all' | 'none' | 'partial';
  /** true => VMs are mostly idle/deallocated (old lastActivityAt). */
  idle: boolean;
};

const RG_SPECS: RgSpec[] = [
  { name: 'web-prod', sub: SUB_PROD, loc: 'westeurope', vmPrefix: 'web-prod', vmCount: 12, osType: 'Linux', vmSize: 'Standard_D4s_v5', publicIpRatio: 1, appServices: 3, storage: 1, sql: 0, tagging: 'all', idle: false },
  { name: 'data-prod', sub: SUB_PROD, loc: 'westeurope', vmPrefix: 'sql-host', vmCount: 3, osType: 'Windows', vmSize: 'Standard_E8s_v5', publicIpRatio: 0, appServices: 0, storage: 3, sql: 8, tagging: 'all', idle: false },
  { name: 'platform-prod', sub: SUB_PROD, loc: 'northeurope', vmPrefix: 'plat-prod', vmCount: 6, osType: 'Linux', vmSize: 'Standard_D2s_v5', publicIpRatio: 0.5, appServices: 1, storage: 2, sql: 0, tagging: 'all', idle: false },
  { name: 'app-staging', sub: SUB_NONPROD, loc: 'westeurope', vmPrefix: 'app-stg', vmCount: 8, osType: 'Linux', vmSize: 'Standard_B2ms', publicIpRatio: 0.5, appServices: 4, storage: 2, sql: 2, tagging: 'none', idle: false },
  { name: 'sandbox-dev', sub: SUB_NONPROD, loc: 'eastus', vmPrefix: 'dev-box', vmCount: 10, osType: 'Linux', vmSize: 'Standard_B2s', publicIpRatio: 0.3, appServices: 0, storage: 1, sql: 0, tagging: 'partial', idle: true },
  { name: 'shared-tools', sub: SUB_NONPROD, loc: 'westeurope', vmPrefix: 'ci-runner', vmCount: 5, osType: 'Linux', vmSize: 'Standard_D4s_v5', publicIpRatio: 0, appServices: 1, storage: 2, sql: 0, tagging: 'all', idle: false }
];

/** VM size -> rough monthly USD + vcpu/mem so cost rollups are realistic. */
const VM_SIZES: Record<string, { usd: number; vcpus: number; mem: number }> = {
  Standard_B2s: { usd: 30, vcpus: 2, mem: 4 },
  Standard_B2ms: { usd: 60, vcpus: 2, mem: 8 },
  Standard_D2s_v5: { usd: 140, vcpus: 2, mem: 8 },
  Standard_D4s_v5: { usd: 290, vcpus: 4, mem: 16 },
  Standard_E8s_v5: { usd: 620, vcpus: 8, mem: 64 }
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function armId(sub: string, rg: string, provider: string, kind: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/${provider}/${kind}/${name}`;
}

function daysBefore(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() - days * 86_400_000).toISOString();
}

export function buildInventory(): Inventory {
  const rng = mulberry32(0x5f3a17c);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const between = (lo: number, hi: number): number => lo + (hi - lo) * rng();
  const round = (n: number): number => Math.round(n * 100) / 100;

  const resourceGroups: ResourceGroup[] = RG_SPECS.map((s) => ({
    name: s.name,
    subscriptionId: s.sub,
    location: s.loc
  }));

  const resources: Resource[] = [];
  let internalSeq = 1000;
  const internalId = (): string => `int-${(internalSeq++).toString(16)}${Math.floor(rng() * 0xffff).toString(16)}`;
  const billing = (sub: string): string => `BA-${sub === SUB_PROD ? '0007' : '0042'}-${Math.floor(rng() * 9000 + 1000)}`;

  const baseTags = (spec: RgSpec, idx: number): Tags => {
    const env =
      spec.sub === SUB_PROD ? 'prod' : spec.name === 'app-staging' ? 'staging' : 'dev';
    const owner = pick(['platform', 'app-team', 'data-team', 'web-team']);
    const cc = pick(['cc-1001', 'cc-1002', 'cc-2010', 'cc-3050']);
    if (spec.tagging === 'all') return { env, owner, costCenter: cc };
    if (spec.tagging === 'none') return idx % 5 === 0 ? { env } : {}; // a few stragglers tagged
    // partial: ~half tagged
    return idx % 2 === 0 ? { env, owner } : {};
  };

  for (const spec of RG_SPECS) {
    // ── VMs (+ their NIC, OS disk, optional data disk, optional public IP) ──
    for (let i = 1; i <= spec.vmCount; i++) {
      const vmName = `${spec.vmPrefix}-${String(i).padStart(2, '0')}`;
      const sizeInfo = VM_SIZES[spec.vmSize];
      // NB: spread per resource below — the VM family shares tag *values*, but
      // each resource must own its tags object, or applying a write to one
      // resource would silently mutate its siblings.
      const tags = baseTags(spec, i);

      const nicName = `${vmName}-nic`;
      const osDiskName = `${vmName}-osdisk`;
      const nicId = armId(spec.sub, spec.name, 'Microsoft.Network', 'networkInterfaces', nicName);
      const osDiskId = armId(spec.sub, spec.name, 'Microsoft.Compute', 'disks', osDiskName);

      const hasPublicIp = rng() < spec.publicIpRatio;
      let publicIpId: string | null = null;
      if (hasPublicIp) {
        const pipName = `${vmName}-pip`;
        const pipId = armId(spec.sub, spec.name, 'Microsoft.Network', 'publicIPAddresses', pipName);
        publicIpId = pipId;
        const pip: PublicIp = {
          id: pipId,
          name: pipName,
          type: 'publicIp',
          location: spec.loc,
          resourceGroup: spec.name,
          subscriptionId: spec.sub,
          tags: { ...tags },
          costMonthly: round(between(3.5, 4.5)),
          createdAt: daysBefore(SNAPSHOT_AT, Math.floor(between(40, 400))),
          _internalId: internalId(),
          _billingAccount: billing(spec.sub),
          ipAddress: `20.${Math.floor(between(0, 255))}.${Math.floor(between(0, 255))}.${Math.floor(between(1, 254))}`,
          allocationMethod: 'Static',
          associatedToId: nicId
        };
        resources.push(pip);
      }

      // NIC
      const nic: NetworkInterface = {
        id: nicId,
        name: nicName,
        type: 'networkInterface',
        location: spec.loc,
        resourceGroup: spec.name,
        subscriptionId: spec.sub,
        tags: { ...tags },
        costMonthly: 0,
        createdAt: daysBefore(SNAPSHOT_AT, Math.floor(between(40, 400))),
        _internalId: internalId(),
        _billingAccount: billing(spec.sub),
        privateIp: `10.${spec.sub === SUB_PROD ? 1 : 2}.${Math.floor(between(0, 40))}.${Math.floor(between(4, 254))}`,
        publicIpId,
        vnetName: `vnet-${spec.name}`
      };
      resources.push(nic);

      // OS disk
      const osDisk: Disk = {
        id: osDiskId,
        name: osDiskName,
        type: 'disk',
        location: spec.loc,
        resourceGroup: spec.name,
        subscriptionId: spec.sub,
        tags: { ...tags },
        costMonthly: round(between(6, 18)),
        createdAt: daysBefore(SNAPSHOT_AT, Math.floor(between(40, 400))),
        _internalId: internalId(),
        _billingAccount: billing(spec.sub),
        diskSizeGb: pick([64, 128, 128, 256]),
        diskSku: 'Premium_LRS',
        attachedToVmId: armId(spec.sub, spec.name, 'Microsoft.Compute', 'virtualMachines', vmName)
      };
      resources.push(osDisk);

      // Optional data disks (prod tiers more likely)
      const dataDiskIds: string[] = [];
      const dataDiskCount = spec.sub === SUB_PROD ? (rng() < 0.5 ? 1 : 0) : 0;
      for (let d = 1; d <= dataDiskCount; d++) {
        const ddName = `${vmName}-data-${d}`;
        const ddId = armId(spec.sub, spec.name, 'Microsoft.Compute', 'disks', ddName);
        dataDiskIds.push(ddId);
        const sizeGb = pick([256, 512, 1024]);
        resources.push({
          id: ddId,
          name: ddName,
          type: 'disk',
          location: spec.loc,
          resourceGroup: spec.name,
          subscriptionId: spec.sub,
          tags: { ...tags },
          costMonthly: round(sizeGb * 0.12),
          createdAt: daysBefore(SNAPSHOT_AT, Math.floor(between(40, 400))),
          _internalId: internalId(),
          _billingAccount: billing(spec.sub),
          diskSizeGb: sizeGb,
          diskSku: 'Premium_LRS',
          attachedToVmId: armId(spec.sub, spec.name, 'Microsoft.Compute', 'virtualMachines', vmName)
        } satisfies Disk);
      }

      // The VM itself
      const idleDays = spec.idle
        ? Math.floor(between(35, 160))
        : Math.floor(between(0, 6));
      const powerState: VirtualMachine['powerState'] = spec.idle
        ? pick(['deallocated', 'deallocated', 'stopped', 'running'])
        : rng() < 0.12
          ? 'stopped'
          : 'running';

      const vm: VirtualMachine = {
        id: armId(spec.sub, spec.name, 'Microsoft.Compute', 'virtualMachines', vmName),
        name: vmName,
        type: 'virtualMachine',
        location: spec.loc,
        resourceGroup: spec.name,
        subscriptionId: spec.sub,
        tags: { ...tags },
        costMonthly: round(sizeInfo.usd * between(0.95, 1.05)),
        createdAt: daysBefore(SNAPSHOT_AT, Math.floor(between(60, 500))),
        _internalId: internalId(),
        _billingAccount: billing(spec.sub),
        vmSize: spec.vmSize,
        osType: spec.osType,
        powerState,
        vcpus: sizeInfo.vcpus,
        memoryGb: sizeInfo.mem,
        lastActivityAt: daysBefore(SNAPSHOT_AT, idleDays),
        nicId,
        osDiskId,
        dataDiskIds
      };
      resources.push(vm);
    }

    // ── Storage accounts ──
    for (let i = 1; i <= spec.storage; i++) {
      const name = `st${spec.name.replace(/-/g, '')}${String(i).padStart(2, '0')}`;
      const usedGb = Math.floor(between(50, 4000));
      resources.push({
        id: armId(spec.sub, spec.name, 'Microsoft.Storage', 'storageAccounts', name),
        name,
        type: 'storageAccount',
        location: spec.loc,
        resourceGroup: spec.name,
        subscriptionId: spec.sub,
        tags: baseTags(spec, i + 100),
        costMonthly: round(usedGb * 0.021 + 1.5),
        createdAt: daysBefore(SNAPSHOT_AT, Math.floor(between(40, 500))),
        _internalId: internalId(),
        _billingAccount: billing(spec.sub),
        storageTier: pick(['Hot', 'Hot', 'Cool']),
        redundancy: pick(['LRS', 'LRS', 'ZRS', 'GRS']),
        usedGb,
        httpsOnly: rng() < 0.85
      } satisfies StorageAccount);
    }

    // ── SQL databases ──
    for (let i = 1; i <= spec.sql; i++) {
      const name = `sqldb-${spec.name}-${String(i).padStart(2, '0')}`;
      const tier = pick(['GeneralPurpose_Gen5_2', 'GeneralPurpose_Gen5_4', 'BusinessCritical_Gen5_8']);
      const usd = tier.includes('BusinessCritical') ? between(700, 900) : tier.endsWith('_4') ? between(350, 450) : between(180, 240);
      resources.push({
        id: armId(spec.sub, spec.name, 'Microsoft.Sql', 'databases', name),
        name,
        type: 'sqlDatabase',
        location: spec.loc,
        resourceGroup: spec.name,
        subscriptionId: spec.sub,
        tags: baseTags(spec, i + 200),
        costMonthly: round(usd),
        createdAt: daysBefore(SNAPSHOT_AT, Math.floor(between(40, 500))),
        _internalId: internalId(),
        _billingAccount: billing(spec.sub),
        dbTier: tier,
        maxSizeGb: pick([100, 250, 500, 1000]),
        dbStatus: rng() < 0.85 ? 'Online' : 'Paused'
      } satisfies SqlDatabase);
    }

    // ── App services ──
    for (let i = 1; i <= spec.appServices; i++) {
      const name = `app-${spec.name}-${String(i).padStart(2, '0')}`;
      const sku = pick(['B1', 'S1', 'P1v3', 'P1v3']);
      const usd = sku === 'B1' ? 13 : sku === 'S1' ? 70 : 120;
      resources.push({
        id: armId(spec.sub, spec.name, 'Microsoft.Web', 'sites', name),
        name,
        type: 'appService',
        location: spec.loc,
        resourceGroup: spec.name,
        subscriptionId: spec.sub,
        tags: baseTags(spec, i + 300),
        costMonthly: round(usd * between(0.95, 1.1)),
        createdAt: daysBefore(SNAPSHOT_AT, Math.floor(between(40, 500))),
        _internalId: internalId(),
        _billingAccount: billing(spec.sub),
        runtime: pick(['NODE|20-lts', 'PYTHON|3.12', 'DOTNETCORE|8.0']),
        appSku: sku,
        httpsOnly: rng() < 0.9,
        appState: rng() < 0.9 ? 'Running' : 'Stopped'
      } satisfies AppService);
    }
  }

  // Guarantee the task-referenced VM exists, is running, and is reachable.
  const hero = resources.find(
    (r): r is VirtualMachine => r.type === 'virtualMachine' && r.name === 'web-prod-03'
  );
  if (hero) {
    hero.powerState = 'running';
    hero.lastActivityAt = daysBefore(SNAPSHOT_AT, 0);
    const nic = resources.find((r) => r.id === hero.nicId) as NetworkInterface | undefined;
    if (nic && !nic.publicIpId) {
      // ensure a public IP exists for the hero VM
      const pipName = 'web-prod-03-pip';
      const pipId = armId(hero.subscriptionId, hero.resourceGroup, 'Microsoft.Network', 'publicIPAddresses', pipName);
      nic.publicIpId = pipId;
      resources.push({
        id: pipId,
        name: pipName,
        type: 'publicIp',
        location: hero.location,
        resourceGroup: hero.resourceGroup,
        subscriptionId: hero.subscriptionId,
        tags: { ...hero.tags },
        costMonthly: 4,
        createdAt: daysBefore(SNAPSHOT_AT, 120),
        _internalId: internalId(),
        _billingAccount: billing(hero.subscriptionId),
        ipAddress: '20.103.47.219',
        allocationMethod: 'Static',
        associatedToId: nic.id
      } satisfies PublicIp);
    } else if (nic && nic.publicIpId) {
      const pip = resources.find((r) => r.id === nic.publicIpId) as PublicIp | undefined;
      if (pip) pip.ipAddress = '20.103.47.219';
    }
  }

  return {
    generatedAt: SNAPSHOT_AT,
    subscriptions: SUBSCRIPTIONS,
    resourceGroups,
    resources
  };
}
