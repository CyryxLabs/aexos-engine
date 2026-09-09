---
task: Arbitrate Security Verdict
owner: "@security-chief"
owner_type: agent
atomic_layer: task
Input: |
  - specialist_findings: Findings from all five required domains
  - risk_acceptances: Human-owned rationale and expiry for accepted findings
Output: |
  - assessment_json: Valid input for aexos security assess
  - verdict: Unchanged deterministic PASS | CONCERNS | FAIL output
Checklist:
  - "[ ] Severity conflicts arbitrated with evidence"
  - "[ ] All required domains explicitly declared assessed"
  - "[ ] CLI verdict attached unchanged and remediation owners named"
---

# Arbitrate Security Verdict

Aegis validates completeness and risk acceptance, then runs the deterministic
CLI gate. Aegis cannot manually downgrade the result and cannot approve a
release; `@devops` retains release authority after all gates pass.
