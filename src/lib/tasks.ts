/**
 * The preconfigured benchmark tasks (the buttons). Each fires both surfaces
 * in parallel against the same live model. Tuned to surface the contrast,
 * including one counter-case where the catalogue is competitive.
 */

export type ExpectedWinner = 'code' | 'catalog' | 'tie';

export interface BenchTask {
  id: string;
  label: string;
  description: string;
  prompt: string;
  /** Which surface we expect to win — sets the chip colour. */
  expect: ExpectedWinner;
}

export const TASKS: BenchTask[] = [
  {
    id: 'granular-read',
    label: 'Granular read',
    description: 'Power state + public IP of one VM (multi-hop: VM → NIC → public IP).',
    prompt:
      'What is the current power state and the public IP address of the VM named "web-prod-03"? Give me just those two facts.',
    expect: 'code'
  },
  {
    id: 'filter-aggregate',
    label: 'Filter + aggregate',
    description: 'Total monthly cost of running VMs in prod, by resource group; flag untagged.',
    prompt:
      'Across the Production subscription, what is the total estimated monthly cost of all VMs that are currently running, broken down by resource group? State the exact grand total as a number (for example "$1,234.56"). Also list any of those running VMs that have no tags at all.',
    expect: 'code'
  },
  {
    id: 'bulk-write',
    label: 'Targeted bulk write',
    description: 'Tag every untagged resource in app-staging; deallocate VMs idle > 30 days.',
    prompt:
      'In resource group "app-staging", add the tags env=staging and owner=app-team to every resource that currently has no tags. Separately, for any virtual machine in the estate that has been idle for more than 30 days and is not already deallocated, deallocate it. Summarise what you changed.',
    expect: 'code'
  },
  {
    id: 'single-lookup',
    label: 'Single lookup',
    description: 'One narrow lookup — where a direct tool can be competitive.',
    prompt: 'How many resource groups are in the Production subscription, and what are their names?',
    expect: 'tie'
  }
];
