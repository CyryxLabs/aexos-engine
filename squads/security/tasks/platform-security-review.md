---
task: Review Platform and Supply Chain Security
owner: "@platform-lead"
owner_type: agent
atomic_layer: task
Input: |
  - assessment_scope: Approved platform and data scope
  - evidence: Dependencies, SBOM, provenance, CI/CD and configuration evidence
Output: |
  - platform_findings: SLSA, NIST SSDF and applicable CIS-grounded findings
Checklist:
  - "[ ] Dependency and SBOM completeness assessed"
  - "[ ] Build provenance and CI/CD integrity assessed"
  - "[ ] Cloud, database/RLS and data-protection configuration assessed"
---

# Review Platform and Supply Chain Security

Provenance assesses the supplied environment and revision. It does not modify
pipelines, infrastructure, secrets or data policies; those findings route to
`@devops` or `@data-engineer`.
