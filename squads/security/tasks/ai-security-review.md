---
task: Review Agentic AI Security
owner: "@ai-security-lead"
owner_type: agent
atomic_layer: task
Input: |
  - assessment_scope: Approved agent, model, memory and tool scope
  - evidence: Prompts, retrieval fixtures, capability policies and spend controls
Output: |
  - ai_security_findings: OWASP LLM and MITRE ATLAS-grounded findings
Checklist:
  - "[ ] Direct and indirect prompt injection paths assessed"
  - "[ ] Tool escalation, egress and context exfiltration assessed"
  - "[ ] Blast radius, memory poisoning and spend-cap bypass assessed"
---

# Review Agentic AI Security

Harness tests deterministic boundaries around model-mediated behavior. Model
instructions alone never satisfy a security control. No broader capability is
granted merely to simplify the assessment.
