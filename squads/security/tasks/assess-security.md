---
task: Assess Security
owner: "@security-chief"
owner_type: agent
atomic_layer: task
Input: |
  - scope: Systems, repositories, environments and exclusions being assessed
  - authorization: Written authorization for any active or offensive testing
  - evidence: Design, code, configuration, SBOM, test and runtime evidence
  - domains_assessed: threat-model, appsec, platform, ai-security, offensive
Output: |
  - findings: Evidence-backed findings with id, domain, severity, status and owner
  - assessment_json: Machine-readable input for aexos security assess
  - verdict: PASS | CONCERNS | FAIL from the deterministic engine
  - handoff: Remediation owners and retest requirements; no implementation
Checklist:
  - "[ ] Scope, exclusions and authorization recorded"
  - "[ ] All five specialist domains explicitly assessed"
  - "[ ] Every finding has reproducible evidence and a named remediation owner"
  - "[ ] Accepted risk has human owner, rationale and future expiry"
  - "[ ] Deterministic CLI verdict attached without manual override"
  - "[ ] No remediation implemented by the Security squad"
---

# Assess Security

## Procedure

1. Aegis records scope, exclusions and testing authorization.
2. Stride maps assets, trust boundaries, attack surfaces and abuse cases.
3. Bastion reviews application controls using OWASP Top 10 and ASVS.
4. Provenance reviews dependencies, SBOM, CI/CD, infrastructure and data controls.
5. Harness reviews model context, tool authority, injection, exfiltration, blast
   radius and spend-cap bypass.
6. Rook performs only explicitly authorized adversarial validation, then chains
   reproducible findings and retests claimed fixes.
7. Aegis arbitrates severity, validates any human risk acceptance and runs
   `aexos security assess <assessment.json>`.
8. Route remediation to the owning delivery agent. Security specifies the
   verification condition and later retests; it never makes the fix.

## Hard stops

- No authorization: no active or offensive test.
- Missing evidence: record `NOT ASSESSED`, never infer PASS.
- Open critical/high: `FAIL`.
- Accepted material risk: at least `CONCERNS` until expiry or resolution.
- Never expose secrets, exploit third-party targets, or claim legal/compliance
  certification.
