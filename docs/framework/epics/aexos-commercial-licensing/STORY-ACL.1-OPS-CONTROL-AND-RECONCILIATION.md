# Story ACL.1: CLI operational control and automatic reconciliation

| Field | Value |
| --- | --- |
| Story ID | ACL.1 |
| Epic | AEXOS Paid-Only Commercial Licensing |
| Status | InReview |
| Executor | `@dev` |
| Quality gate | `@architect`, `@qa`, `@devops` |
| Scope | Dark/shadow infrastructure only; no live charge or enforcement |

## Status

**InReview**

## Executor assignment

```yaml
executor: '@dev'
quality_gate: '@architect'
quality_gate_tools:
  - npm run lint
  - npm run typecheck
  - npm test
  - npm run build
  - focused authorization and reconciliation integration tests
```

## Story

As a Cyryx licensing operator, I want a CLI-first control plane with a read-only
observability surface and automatic reconciliation, so that payment and
entitlement failures are visible, auditable and recoverable without editing the
database manually.

## Acceptance criteria

- [x] A privileged CLI can inspect a customer, subscription, entitlement,
      license, seats and relevant webhook ledger entries without exposing
      secrets or project content.
- [x] The CLI supports dry-run reconciliation of one subscription/customer and
      an explicit apply mode; mutations require a reason and write an audit row.
- [x] A batch reconciler compares Stripe authority with local billing and
      entitlement state, repairs only documented deterministic differences and
      records unresolved differences for operator action.
- [x] Failed/stale webhook events are visible and can be retried idempotently;
      successful/ignored events cannot be destructively replayed.
- [x] Manual grant, restore, revoke and seat recovery are bounded, attributable,
      expiring where applicable and never mint payment authority.
- [x] Liveness and readiness are separate; readiness checks database and
      required configuration without returning secret values.
- [x] Any dashboard is read-only and consumes the same operator report contract;
      every control remains available through CLI.
- [x] Unit/integration tests cover authentication, audit completeness,
      idempotency, dry-run/apply, stale-event recovery and namespace isolation.
- [x] Existing AEXOS and non-AEXOS Stripe records remain isolated.

## Tasks / subtasks

- [x] Define the strict operator report and audit schemas. (AC: 1, 2, 5)
- [x] Add database migration for operator actions and reconciliation findings. (AC: 2, 3, 5)
- [x] Implement CLI inspection, reconciliation, webhook retry and bounded recovery commands. (AC: 1-5)
- [x] Implement scheduled/batch reconciliation with dry-run as the default. (AC: 3, 4)
- [x] Add readiness probe and read-only observability projection. (AC: 6, 7)
- [x] Add unit/integration tests and operator runbook. (AC: 8, 9)

## Dev notes

- The payment provider proves transaction events; only the License Authority
  issues entitlements. `[Source: ARCHITECTURE.md#authority-boundaries]`
- The license service may receive only licensing and privacy-bounded operational
  metadata, never project content. `[Source: ARCHITECTURE.md#data-and-privacy]`
- Infrastructure must ship dark before shadow comparison and enforcement.
  `[Source: ARCHITECTURE.md#migration-and-rollback]`
- Duplicate purchase and webhook-ordering behavior are security gates.
  `[Source: ARCHITECTURE.md#security-gates]`

## CodeRabbit integration

- Primary type: Integration; secondary: Database, API, Security; complexity: High.
- Pre-commit: `@dev`; pre-PR/deployment: `@devops`; security/data review: `@architect`, `@qa`.
- Focus: authorization, audit immutability, least privilege, idempotency,
  namespace isolation, safe retry and secret redaction.
- Self-healing: `@dev` light mode, two iterations, CRITICAL only.

Quality gate tasks:

- [x] Pre-commit (`@dev`): review uncommitted implementation; if CodeRabbit is
      unavailable, use the repository's lint, typecheck, test, security and diff gates.
- [ ] Pre-PR (`@devops`): review the exact committed diff against `main`.
- [ ] Pre-deployment (`@devops`): report-only review of configuration, secrets,
      rollback and operator recovery.

## Testing

- Unit tests for strict parsing, authorization, redaction and state classification.
- Database integration tests for immutable audit rows, dry-run/apply,
  idempotent retry and concurrent reconciliation claims.
- HTTP tests for liveness/readiness separation and read-only observability.
- Negative tests prove that missing credentials, cross-namespace records,
  invalid operator input and stale data do not mutate entitlement state.
- Full server gates: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build` and `npm audit --audit-level=high`.

## File list

- [x] `C:/tmp/aexos-license-server/migrations/0003_operational_control.sql`
- [x] `C:/tmp/aexos-license-server/migrations/0004_operator_action_outcomes.sql`
- [x] `C:/tmp/aexos-license-server/lib/operations.ts`
- [x] `C:/tmp/aexos-license-server/lib/ops-auth.ts`
- [x] `C:/tmp/aexos-license-server/scripts/license-ops.mjs`
- [x] `C:/tmp/aexos-license-server/app/api/v1/ops/route.ts`
- [x] `C:/tmp/aexos-license-server/app/api/v1/internal/reconcile/route.ts`
- [x] `C:/tmp/aexos-license-server/app/ops/page.tsx`
- [x] `C:/tmp/aexos-license-server/app/ready/route.ts`
- [x] `C:/tmp/aexos-license-server/tests/unit/ops-auth.test.ts`
- [x] `C:/tmp/aexos-license-server/tests/integration/operations.test.ts`
- [x] `C:/tmp/aexos-license-server/docs/operations.md`

## Dev Agent Record

### Debug log

- 2026-08-27: hosted migration status failed before connection because the
  configured DNS target was unavailable; migrations were applied only to the
  isolated local Supabase instance via `.env.test.local`.
- 2026-08-27: self-critique found a mutation-before-audit/idempotency gap.
  Migration `0004` and intent/outcome claims now record each request before
  mutation and suppress duplicate `requestId` execution.

### Completion notes

- Added a CLI-first control plane; all mutations default to dry-run and require
  actor, reason, UUID request id and explicit `--apply`.
- Added read-only `/ops` UI using the same secret-redacted report contract.
- Added automatic batch reconciliation behind `CRON_SECRET`, bounded recovery,
  failed/stale webhook retry, readiness and append-only operator evidence.
- Local evidence: migration `0004` applied; lint and typecheck pass; 74/74 tests
  pass; production build passes; `npm audit --audit-level=high` reports zero
  vulnerabilities.

## Project structure notes

- Commercial authority remains in the separate `aexos-license-server` repository.
- The public framework repository owns the story and client contract but does
  not receive Stripe secrets or direct database credentials.
- The observability projection cannot become a second mutation authority.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-08-27 | 0.1.0 | Initial draft for CLI operations and reconciliation | `@sm` |
| 2026-08-27 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready | `@po` |
| 2026-08-27 | 0.2.0 | Development started (guided autonomous execution) — Status: Ready → InProgress | `@dev` |
| 2026-08-27 | 0.3.0 | Operational CLI, read-only panel, reconciliation and audited idempotency implemented — Status: InProgress → InReview | `@dev` |
