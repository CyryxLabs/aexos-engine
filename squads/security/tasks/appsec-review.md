---
task: Review Application Security
owner: "@appsec-lead"
owner_type: agent
atomic_layer: task
Input: |
  - assessment_scope: Approved application scope
  - evidence: Code, tests and runtime evidence
Output: |
  - appsec_findings: OWASP Top 10 and ASVS-grounded findings with reproduction evidence
Checklist:
  - "[ ] AuthN, authZ, sessions, validation and injection reviewed"
  - "[ ] Secret and cryptographic handling reviewed"
  - "[ ] Every finding has safe reproduction and retest condition"
---

# Review Application Security

Bastion assesses application controls and returns findings. It never edits the
code or treats framework defaults as evidence that a control operated.
