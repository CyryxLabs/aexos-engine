---
task: Scope Security Assessment
owner: "@security-chief"
owner_type: agent
atomic_layer: task
Input: |
  - requested_scope: Systems, repositories and environments requested
  - authorization: Written authorization and active-testing limitations
Output: |
  - assessment_scope: Included assets, exclusions, domain coverage and authorization boundary
Checklist:
  - "[ ] Included assets and environments named"
  - "[ ] Exclusions and unavailable evidence named"
  - "[ ] Active-testing authorization recorded or offensive work disabled"
---

# Scope Security Assessment

Aegis defines exactly what is and is not assessed, records authorization, and
requires all five specialist domains. Missing access becomes `NOT ASSESSED`,
never an inferred PASS. This task performs no implementation.
