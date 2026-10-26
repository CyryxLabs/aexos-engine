---
task: Engineer Workflow
owner: "@workflow-chief"
owner_type: agent
atomic_layer: task
Input: |
  - process_scope: Explicit process scope and desired outcome
  - evidence: Available interviews, artifacts, system records and policy references
Output: |
  - discovery_record: Versioned current-state process evidence
  - workflow_map: Dependency-safe process topology
  - task_contracts: AEXOS Task Contract V1 artifacts
  - automation_decisions: Eligible, governed or manual classification per step
  - qa_verdict: Independent workflow design verdict
Checklist:
  - "[ ] Route each phase to exactly one owning specialist"
  - "[ ] Preserve unresolved questions without invention"
  - "[ ] Confirm that no workflow step was executed"
---

# Engineer Workflow

**Owner:** `@workflow-chief`  
**Purpose:** Coordinate one evidence-bound process from discovery to independent QA.

## Inputs

- Explicit process scope and desired outcome.
- Available interviews, artifacts, system records and policy references.

## Procedure

1. Route discovery to `@process-discovery-lead`.
2. Route the accepted discovery record to `@workflow-modeling-lead`.
3. Route mapped steps to `@task-contract-lead`.
4. Route valid contracts to `@automation-architecture-lead`.
5. Route the complete package to `@workflow-qa-lead`.
6. Return defects to their owning phase; never repair them inside the QA pass.

## Output

A versioned process record, workflow map, Task Contract V1 set, automation
decisions and QA verdict. No workflow execution occurs.
