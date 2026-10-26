# AEXOS commercial licensing rollout

## Non-negotiable order

1. Keep the published package in `legacy` while dark infrastructure and signed
   entitlement fixtures are tested.
2. Activate `shadow` only after Preview has isolated persistence, a restricted
   Stripe sandbox key, webhook secret, entitlement signing key and operator
   recovery access.
3. Promote to `beta` only for allowlisted SHA-256 email identities. Users
   outside the cohort remain unblocked while still producing shadow coverage.
4. Change the exact signed candidate to `enforce` only after the machine-readable
   promotion gate returns `eligible: true` and `@devops` has founder approval.

## Shadow

Shadow evaluates the same installer credential path with `validationOnly: true`.
It never scaffolds paid content and never blocks installation. Telemetry is
local JSONL containing only schema version, time, entrypoint, mode, decision
and cohort flag; it contains no email, license key, project path or project
content.

```powershell
node scripts/licensing-shadow-report.js .aexos/telemetry/licensing-shadow.jsonl
```

Promotion requires all known entrypoints observed, no evaluation errors and no
unknown entrypoints.

## Restricted beta

Beta identities are stored only as normalized-email SHA-256 hashes. Provide
them through the signed candidate configuration or
`AEXOS_BETA_COHORT_HASHES`. Do not store plaintext customer email addresses in
the repository. Every beta participant needs explicit support, rollback and
data-export instructions.

Rollback restores the previous signed candidate. It must not delete a license
cache, project file, knowledge index, agent output or customer configuration.

## Enforce gate

```powershell
node scripts/licensing-promotion-gate.js artifacts/licensing/promotion-evidence.json
```

The gate requires Preview and 20 real Stripe cycles, complete shadow coverage,
restricted beta, zero critical/high defects, non-destructive recovery, signed
artifact identity, independent QA, legal/commercial approval and founder
approval. It also verifies that the checked-in package is still `legacy`; the
final mode change is a separate `@devops` action against the exact approved
candidate.
