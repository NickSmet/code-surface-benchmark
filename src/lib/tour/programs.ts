/**
 * The pre-recorded "model-written" programs, and the probes that show the
 * contract holding.
 *
 * The four reference programs are not copied here: they are parsed out of
 * docs/solution-path-examples.md, the same file `npm test` already executes
 * against the ground truth. The tour can therefore never drift from a program
 * the benchmark has verified.
 */

import type { TaskId } from './answers';

export const TASK_ORDER: TaskId[] = ['granular-read', 'filter-aggregate', 'bulk-write', 'single-lookup'];

export interface CodeProgram {
  task: TaskId;
  code: string;
  /** Only writes carry a rationale in the tool call. */
  rationale?: string;
}

const RATIONALE: Partial<Record<TaskId, string>> = {
  'bulk-write': 'Tag untagged app-staging resources and deallocate non-deallocated VMs idle for more than 30 days.'
};

/** Pull the four ```js blocks out of the solution-path document, in task order. */
export function parseSolutionPrograms(markdown: string): Record<TaskId, CodeProgram> {
  const blocks = [...markdown.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1].trimEnd());
  if (blocks.length !== TASK_ORDER.length) {
    throw new Error(`Expected ${TASK_ORDER.length} reference programs in solution-path-examples.md, found ${blocks.length}`);
  }
  return Object.fromEntries(
    TASK_ORDER.map((task, i) => [task, { task, code: blocks[i], rationale: RATIONALE[task] } satisfies CodeProgram])
  ) as Record<TaskId, CodeProgram>;
}

export type ProbeVerdict = 'allowed' | 'rejected' | 'hidden' | 'blocked' | 'timeout';

export interface ContractProbe {
  id: string;
  /** What the code is trying to do, in a few words. */
  label: string;
  layer: 'see' | 'change' | 'do';
  verdict: ProbeVerdict;
  /** One sentence on why the runtime answers the way it does. */
  why: string;
  code: string;
}

const hero = `data.resources.find((r) => r.name === 'web-prod-03')`;

/** Each probe's outcome is asserted in tests/tour.test.ts, so the UI never claims a behaviour the runtime does not have. */
export const CONTRACT_PROBES: ContractProbe[] = [
  {
    id: 'tag',
    label: 'Add a tag',
    layer: 'change',
    verdict: 'allowed',
    why: 'Tags with string values are on the write allowlist, so this becomes a one-row diff for review.',
    code: `function main(data) {\n  const vm = ${hero};\n  vm.tags.reviewed = 'yes';\n}`
  },
  {
    id: 'power',
    label: 'Stop a VM',
    layer: 'change',
    verdict: 'allowed',
    why: 'powerState on a virtual machine is the other writable field.',
    code: `function main(data) {\n  const vm = ${hero};\n  vm.powerState = 'stopped';\n}`
  },
  {
    id: 'cost',
    label: 'Change a cost',
    layer: 'change',
    verdict: 'rejected',
    why: 'Every field outside the allowlist is read-only. One bad edit rejects the whole proposal; nothing is applied.',
    code: `function main(data) {\n  const vm = ${hero};\n  vm.costMonthly = 0;\n}`
  },
  {
    id: 'tag-type',
    label: 'Tag with a number',
    layer: 'change',
    verdict: 'rejected',
    why: 'Tag values must be strings; the diff step checks the data contract, not just the field name.',
    code: `function main(data) {\n  const vm = ${hero};\n  vm.tags.monthly = 120;\n}`
  },
  {
    id: 'new-field',
    label: 'Invent a field',
    layer: 'change',
    verdict: 'rejected',
    why: 'Adding or removing fields changes the shape of the record, which the contract forbids.',
    code: `function main(data) {\n  const nic = data.resources.find((r) => r.name === 'web-prod-03-nic');\n  nic.powerState = 'running';\n}`
  },
  {
    id: 'delete',
    label: 'Delete a resource',
    layer: 'change',
    verdict: 'rejected',
    why: 'Membership is read-only: the set of resources cannot grow or shrink.',
    code: `function main(data) {\n  data.resources.pop();\n}`
  },
  {
    id: 'internal',
    label: 'Read internal fields',
    layer: 'see',
    verdict: 'hidden',
    why: 'The projection omitted them before the code ran. They are not blocked; they do not exist.',
    code: `function main(data) {\n  const vm = ${hero};\n  return { internalId: vm._internalId, billing: vm._billingAccount, name: vm.name };\n}`
  },
  {
    id: 'network',
    label: 'Call the network',
    layer: 'do',
    verdict: 'blocked',
    why: 'Network APIs are not on the allowlist. (Demo-level only: this runtime is not a security boundary.)',
    code: `function main(data) {\n  return fetch('https://example.com');\n}`
  },
  {
    id: 'loop',
    label: 'Loop forever',
    layer: 'do',
    verdict: 'timeout',
    why: 'Runs get a time limit; the worker is terminated and nothing else is affected.',
    code: `function main(data) {\n  while (true) {}\n}`
  }
];
