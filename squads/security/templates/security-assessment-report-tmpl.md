# Security Assessment — {{assessment_id}}

## Scope and authorization

- Scope: {{scope}}
- Exclusions: {{exclusions}}
- Active-testing authorization: {{authorization_reference}}
- Assessed at: {{assessed_at}}

## Domain coverage

| Domain | Agent | Evidence | Result |
|---|---|---|---|
| Threat model | Stride | {{threat_evidence}} | {{threat_result}} |
| AppSec | Bastion | {{appsec_evidence}} | {{appsec_result}} |
| Platform/supply chain | Provenance | {{platform_evidence}} | {{platform_result}} |
| AI security | Harness | {{ai_security_evidence}} | {{ai_security_result}} |
| Offensive validation | Rook | {{offensive_evidence}} | {{offensive_result}} |

## Findings

{{findings_table}}

## Deterministic verdict

Attach the unchanged output of `aexos security assess`.

**Verdict:** {{verdict}}

## Remediation handoff

{{remediation_owners_and_retest_conditions}}

Security assessed and will retest. It did not implement remediation or approve release.
