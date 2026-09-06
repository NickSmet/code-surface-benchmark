# Solution Path Examples

This document shows how the same agent task tends to unfold against the two benchmark surfaces:

- The catalog surface exposes granular functions shaped like MCP tools, such as `get_resource`, `list_resources`, `update_resource_tags`, and `set_power_state`.
- The code surface exposes one tool, `operate_inventory`, which runs JavaScript against a projected inventory object. Returned values answer read questions. Mutations become a reviewable diff. The canonical inventory is not changed.

The executor uses `node:vm` for local demonstration, not secure isolation. Only tags and VM power state are writable; unsupported edits are rejected. See the [README security and scope notes](../README.md). These examples show mock state changes, not transactional cloud operations.

The paths below are representative, not guaranteed transcripts. A live model may choose a slightly different order, especially on the catalog surface. The point is to make the logical work visible.

## 1. Granular Read: VM Power State and Public IP

### Task

What is the current power state and the public IP address of the VM named `web-prod-03`? Give just those two facts.

### Task Meaning

The real system has to answer two questions:

- Read the VM named `web-prod-03`.
- Read `powerState` from that VM.
- Follow `vm.nicId` to the network interface.
- Follow `nic.publicIpId` to the public IP resource.
- Read `publicIp.ipAddress`.

No state should be updated.

In the fixture, the answer is:

- `powerState`: `running`
- `publicIp`: `20.103.47.219`

### Tool-Calling Path

The catalog has a natural multi-hop path because each detailed resource read is one tool call.

```json
{ "tool": "get_resource", "args": { "name": "web-prod-03" } }
```

The model reads the VM object:

- `powerState` is `running`.
- `nicId` points to the VM's network interface.

```json
{ "tool": "get_resource", "args": { "id": "<vm.nicId>" } }
```

The model reads the NIC object:

- `publicIpId` points to the public IP resource.

```json
{ "tool": "get_resource", "args": { "id": "<nic.publicIpId>" } }
```

The model reads the public IP object:

- `ipAddress` is `20.103.47.219`.

Then it can answer the user. The logical operation is small, but the surface turns it into three detailed reads.

### Code-Surface Path

The code surface does the same reference chasing inside one script.

```text
operate_inventory({ code })
```

```js
function main(data) {
  // Index all projected resources by id so references can be followed locally.
  const byId = new Map(data.resources.map((r) => [r.id, r]));

  // Find the named VM in the flat projected resource array.
  const vm = data.resources.find((r) => r.name === 'web-prod-03');
  if (!vm) return { error: 'VM not found' };

  // Follow VM -> NIC -> public IP using ids in the projection.
  const nic = byId.get(vm.nicId);
  const pip = nic && nic.publicIpId ? byId.get(nic.publicIpId) : null;

  // Return only the two facts the user asked for.
  return {
    powerState: vm.powerState,
    publicIp: pip ? pip.ipAddress : null
  };
}
```

The runtime reports `mode: "read"` because the script returned a value and did not mutate the projection.

## 2. Filter + Aggregate: Running Production VM Cost

### Task

Across the Production subscription, what is the total estimated monthly cost of all VMs that are currently running, broken down by resource group? Also list any of those running VMs that have no tags at all.

### Task Meaning

The real system has to:

- Identify the `Production` subscription.
- Consider only resources in that subscription.
- Filter to resources where `type` is `virtualMachine`.
- Filter again to `powerState === "running"`.
- Sum `costMonthly` by `resourceGroup`.
- For the same running VMs, list any with zero tags.

No state should be updated.

In the fixture:

- `web-prod`: USD 2,920.31/month
- `data-prod`: USD 1,852.60/month
- `platform-prod`: USD 688.31/month
- Total: USD 5,461.22/month
- Untagged running production VMs: none

### Tool-Calling Path

The best catalog path is short because `list_resources` returns compact summaries with the fields needed for this aggregate.

```json
{
  "tool": "list_resources",
  "args": {
    "type": "virtualMachine",
    "subscriptionName": "Production"
  }
}
```

The model can then compute the answer from returned summaries:

- Keep rows where `powerState` is `running`.
- Group by `resourceGroup`.
- Sum `costMonthly`.
- Treat `tagCount === 0` as "no tags".

This is the honest middle case for the benchmark. A well-designed catalog tool can be competitive when one tool returns exactly the right summary. The catch is that the model has to choose this broad summary path. A more cautious model may call `get_resource` on many VMs to verify details, which turns the same logical task into many calls.

### Code-Surface Path

The code surface makes the broad scan explicit.

```text
operate_inventory({ code })
```

```js
function main(data) {
  // Resolve the subscription id once; resources refer to subscriptions by id.
  const prod = data.subscriptions.find((s) => s.name === 'Production');
  if (!prod) return { error: 'Production subscription not found' };

  const byResourceGroup = {};
  const untaggedRunningVms = [];

  for (const r of data.resources) {
    // Only running VMs in the Production subscription participate in the aggregate.
    if (r.subscriptionId !== prod.id) continue;
    if (r.type !== 'virtualMachine') continue;
    if (r.powerState !== 'running') continue;

    // Add this VM's monthly cost to its resource-group bucket.
    byResourceGroup[r.resourceGroup] =
      (byResourceGroup[r.resourceGroup] || 0) + r.costMonthly;

    // Track the secondary question using the same filtered set.
    if (Object.keys(r.tags).length === 0) {
      untaggedRunningVms.push(r.name);
    }
  }

  return {
    byResourceGroup,
    totalMonthly: Object.values(byResourceGroup).reduce((sum, n) => sum + n, 0),
    untaggedRunningVms
  };
}
```

The runtime reports `mode: "read"`. The script returns an aggregate object and produces no diff.

## 3. Targeted Bulk Write: Tag Staging and Deallocate Idle VMs

### Task

In resource group `app-staging`, add the tags `env=staging` and `owner=app-team` to every resource that currently has no tags. Separately, for any virtual machine in the estate that has been idle for more than 30 days and is not already deallocated, deallocate it. Summarise what you changed.

### Task Meaning

The real system has to evaluate two independent predicates:

- Tagging predicate:
  - Resource is in `app-staging`.
  - Resource has zero tags.
  - Updates: `tags.env = "staging"` and `tags.owner = "app-team"`.
- Deallocation predicate:
  - Resource is a VM.
  - `ctx.daysSince(lastActivityAt) > 30`.
  - `powerState` is not already `deallocated`.
  - Update: `powerState = "deallocated"`.

Writes are expressed as a derived diff and applied to the run's copy of the estate (never to the canonical seed inventory).

In the fixture, this means:

- 33 `app-staging` resources receive two tags each.
- 4 VMs are deallocated: `dev-box-02`, `dev-box-05`, `dev-box-08`, and `dev-box-10`.
- The projected-object diff has 70 rows: 33 `tags.env` additions, 33 `tags.owner` additions, and 4 `powerState` edits.

### Tool-Calling Path

The most compact catalog path still fans out because writes are one-resource-at-a-time.

First the model surveys resources:

```json
{ "tool": "list_resources", "args": {} }
```

From the summaries, it identifies:

- All untagged resources in `app-staging`.
- All non-deallocated VMs idle for more than 30 days.

Then it has to call the write tools once per affected resource.

```json
{
  "tool": "update_resource_tags",
  "args": {
    "name": "app-stg-01-pip",
    "tags": { "env": "staging", "owner": "app-team" }
  }
}
```

That pattern repeats for 33 staging resources.

```json
{
  "tool": "set_power_state",
  "args": {
    "name": "dev-box-02",
    "state": "deallocated"
  }
}
```

That pattern repeats for the 4 matching VMs.

Even with a good initial survey, this fixture implies 38 catalog calls: one broad read plus 37 per-resource writes. Each mutation is forced through a separate tool call.

### Code-Surface Path

The code surface evaluates both predicates in one pass over the projected object.

```text
operate_inventory({
  rationale: "Tag untagged app-staging resources and deallocate non-deallocated VMs idle for more than 30 days.",
  code
})
```

```js
function main(data, ctx) {
  const tagged = [];
  const deallocated = [];

  for (const r of data.resources) {
    // Write 1: add the required tags to untagged app-staging resources.
    if (r.resourceGroup === 'app-staging' && Object.keys(r.tags).length === 0) {
      r.tags.env = 'staging';
      r.tags.owner = 'app-team';
      tagged.push(r.name);
    }

    // Write 2: deallocate VMs that are idle by the snapshot clock.
    if (
      r.type === 'virtualMachine' &&
      r.powerState !== 'deallocated' &&
      ctx.daysSince(r.lastActivityAt) > 30
    ) {
      r.powerState = 'deallocated';
      deallocated.push(r.name);
    }
  }

  // Return a human-scale summary. The runtime separately computes the field diff.
  return {
    taggedCount: tagged.length,
    deallocatedCount: deallocated.length,
    deallocated
  };
}
```

The runtime reports `mode: "read_write"` because the script both returns a summary and mutates the projected object. It diffs the before and after projections and returns the reviewable change set. The canonical inventory remains unchanged.

The implication is the core design difference: the catalog makes each mutation the unit of interaction; the code surface makes the whole projected object the unit of interaction and lets the runtime recover the field-level change set.

## 4. Single Lookup: Production Resource Groups

### Task

How many resource groups are in the Production subscription, and what are their names?

### Task Meaning

The real system has to:

- Identify resource groups whose subscription is `Production`.
- Count them.
- Return their names.

No state should be updated.

In the fixture, the answer is:

- Count: 3
- Names: `web-prod`, `data-prod`, `platform-prod`

### Tool-Calling Path

This is where the catalog is naturally strong.

```json
{
  "tool": "list_resource_groups",
  "args": {
    "subscriptionName": "Production"
  }
}
```

One narrow tool returns exactly the needed rows. The model counts them and answers.

### Code-Surface Path

The code surface can also solve it in one call, but it still pays for the larger object-tool description.

```text
operate_inventory({ code })
```

```js
function main(data) {
  // Resolve the subscription id from the human-readable subscription name.
  const prod = data.subscriptions.find((s) => s.name === 'Production');
  if (!prod) return { error: 'Production subscription not found' };

  // Filter resource groups by subscription id and return only the facts asked for.
  const names = data.resourceGroups
    .filter((g) => g.subscriptionId === prod.id)
    .map((g) => g.name);

  return { count: names.length, names };
}
```

The runtime reports `mode: "read"`.

This is the counter-case the article should keep. A projected object surface is not automatically better. For a narrow lookup with a narrow tool, the catalog has less to explain and less to carry.

## What These Examples Show

The difference is not that one side is "tools" and the other side is "no tools." Both are in-process function-tool surfaces; either could be exposed over MCP. This repository does not measure MCP transport. The difference is the unit of work the function exposes.

The catalog says:

- Here are the supported operations.
- Express each operation as a tool call; independent calls can share a model turn.
- The transcript becomes the working memory between operations.
- Writes are naturally reviewable because every write is its own tool call.

The code surface says:

- Here is an allowlisted projection with a validated write contract.
- Read and transform it with ordinary code.
- Return values for read answers.
- Mutate the projection to write.
- Let the runtime derive the change set that actually gets applied.

That can change the model-token cost profile. The code runtime handles intermediate computation and data movement, returning only selected results. Multi-hop reads and bulk transformations can use fewer model turns or smaller payloads; tool calls and model turns are distinct. The tradeoff is that the projected object and sandbox become real API design work: the shape must be understandable, stable enough for agents to use, and strict enough that diffs mean what reviewers think they mean.
