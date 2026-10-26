---
task: Classify Automation
owner: "@automation-architecture-lead"
owner_type: agent
atomic_layer: task
Input: |
  - task_contracts: Valid AEXOS Task Contract V1 artifacts
Output: |
  - automation_decisions: Eligible, governed or manual classification per task
Checklist:
  - "[ ] Treat agentic, external, side-effect and approval steps as governed"
  - "[ ] Name required capability leases"
  - "[ ] Do not execute any candidate"
---

# Classify Automation

**Owner:** `@automation-architecture-lead`

Classify each contracted task as `eligible`, `governed` or `manual`.
Agentic/external work, side effects, capability use and approval requirements
are governed by definition. Record timeout, retry, idempotency and rollback
requirements before proposing implementation.
