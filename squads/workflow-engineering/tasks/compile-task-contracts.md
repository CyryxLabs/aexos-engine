---
task: Compile Task Contracts
owner: "@task-contract-lead"
owner_type: agent
atomic_layer: task
Input: |
  - workflow_map: Accepted dependency-safe process topology
Output: |
  - task_contracts: One valid AEXOS Task Contract V1 per step
Checklist:
  - "[ ] Declare owner, inputs, outputs and independent verification"
  - "[ ] Reject conflicting output paths"
  - "[ ] Validate with the canonical Task Contract V1 validator"
---

# Compile Task Contracts

**Owner:** `@task-contract-lead`

For every modeled step, declare the accountable owner, typed inputs, produced
artifacts or state and independent verification using AEXOS Task Contract V1.
Reject output-path conflicts and undeclared completion evidence.
