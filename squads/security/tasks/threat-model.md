---
task: Build Threat Model
owner: "@threat-model-lead"
owner_type: agent
atomic_layer: task
Input: |
  - assessment_scope: Approved scope from Aegis
  - architecture: Components, data flows, identities and integrations
Output: |
  - threat_findings: Assets, entry points, trust boundaries, STRIDE threats and abuse cases
Checklist:
  - "[ ] Assets and security objectives named"
  - "[ ] Every trust boundary and entry point mapped"
  - "[ ] Abuse cases prioritized with evidence and owner"
---

# Build Threat Model

Stride applies Shostack's threat-modeling discipline and STRIDE to the actual
design. Unknown flows are findings. Architecture choices remain with
`@architect`; remediation remains with delivery owners.
