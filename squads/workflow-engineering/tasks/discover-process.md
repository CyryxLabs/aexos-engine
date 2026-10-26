---
task: Discover Process
owner: "@process-discovery-lead"
owner_type: agent
atomic_layer: task
Input: |
  - scope: Confirmed process boundary
  - evidence: Interviews, artifacts, system records and policy references
Output: |
  - discovery_record: Trigger, outcome, actors, systems, steps, exceptions and evidence
Checklist:
  - "[ ] Separate observed current state, policy and proposed future state"
  - "[ ] Record every unknown as an explicit gap"
  - "[ ] Capture rework and exception paths"
---

# Discover Process

**Owner:** `@process-discovery-lead`

Capture scope, trigger, expected outcome, actors, systems, current-state steps,
handoffs, exceptions and evidence sources. Mark policy statements and proposed
future-state changes separately from observed behavior. Unanswered questions
remain explicit gaps.
