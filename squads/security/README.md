# AEXOS Security Squad

Core Free assessment squad for threat modeling, application security,
authorized offensive validation, platform/supply-chain security and agentic AI
security.

Entry point: `@security-chief` (Aegis). Run the deterministic release gate with:

```powershell
aexos security assess assessment.json
```

The squad produces findings and a `PASS`, `CONCERNS` or `FAIL` verdict. It does
not modify code, run unapproved penetration tests, push, publish or release.
