---
task: Validate Workflow
owner: "@workflow-qa-lead"
owner_type: agent
atomic_layer: task
Input: |
  - workflow_package: Discovery, topology, task contracts and automation decisions
Output: |
  - qa_verdict: PASS, CONCERNS or FAIL with evidence and owning phase
Checklist:
  - "[ ] Verify topology and contract validity independently"
  - "[ ] Verify authority and exception boundaries"
  - "[ ] Return defects without repairing them inside QA"
---

# Validate Workflow

**Owner:** `@workflow-qa-lead`

Independently verify actor/system references, topology, branch coverage,
contract validity, output ownership, automation classification and authority
boundaries. Issue PASS only for the mapped design; the verdict never authorizes
execution or external side effects.
