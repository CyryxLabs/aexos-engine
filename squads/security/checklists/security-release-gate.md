# Security Release Gate Checklist

- [ ] Assessment id, scope, exclusions and timestamp are present.
- [ ] Threat model covers assets, entry points and trust boundaries.
- [ ] AppSec review covers authentication, authorization, sessions, validation and secrets.
- [ ] Platform review covers SBOM/dependencies, build provenance, CI/CD and deployment configuration.
- [ ] AI security review covers prompt injection, tool escalation, exfiltration, blast radius and spend controls.
- [ ] Offensive work has written authorization and reproducible, non-destructive evidence.
- [ ] Every finding has id, domain, title, severity, status, evidence and owner.
- [ ] Every accepted finding has a human owner, rationale and unexpired date.
- [ ] `aexos security assess` output is attached unchanged.
- [ ] No Security squad agent implemented remediation or exercised release authority.

## Disposition

| Verdict | Release disposition |
|---|---|
| PASS | Security gate does not block; other gates still apply. |
| CONCERNS | Human decision required with recorded owner and expiry. |
| FAIL | Release blocked until resolution or formal acceptance changes the verdict. |
