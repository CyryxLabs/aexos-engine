---
task: Model Workflow
owner: "@workflow-modeling-lead"
owner_type: agent
atomic_layer: task
Input: |
  - discovery_record: Accepted process discovery evidence
Output: |
  - workflow_map: Uniquely identified steps, dependencies, branches and exception paths
Checklist:
  - "[ ] Reject unknown and self dependencies"
  - "[ ] Reject hidden cycles"
  - "[ ] Preserve explicit exception paths"
---

# Model Workflow

**Owner:** `@workflow-modeling-lead`

Translate accepted discovery evidence into uniquely identified steps and
dependencies. Represent decisions and exception paths explicitly. Reject
unknown dependencies and cycles; iterative behavior requires a separately
governed iteration policy rather than a hidden DAG loop.
