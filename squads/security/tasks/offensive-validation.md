---
task: Validate Findings Adversarially
owner: "@offensive-lead"
owner_type: agent
atomic_layer: task
Input: |
  - authorization: Written active-testing scope and constraints
  - candidate_findings: Findings nominated for exploitability validation
Output: |
  - validated_findings: Reproducible exploit conditions, chains and retest evidence
Checklist:
  - "[ ] Every technique and target is explicitly authorized"
  - "[ ] Validation is non-destructive and evidence-preserving"
  - "[ ] Claimed fixes retested against the original exploit condition"
---

# Validate Findings Adversarially

Rook validates only authorized targets and techniques under PTES discipline.
No authorization means no active test. Rook never establishes persistence,
damages data or implements remediation.
