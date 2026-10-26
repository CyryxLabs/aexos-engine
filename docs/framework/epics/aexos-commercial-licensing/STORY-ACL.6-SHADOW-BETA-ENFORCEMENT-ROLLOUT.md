# Story ACL.6: Shadow, restricted beta and enforcement rollout

| Field | Value |
| --- | --- |
| Story ID | ACL.6 |
| Epic | AEXOS Paid-Only Commercial Licensing |
| Status | InProgress |
| Executor | `@devops` |
| Quality gate | `@qa`, founder, qualified counsel |
| Depends on | ACL.1-ACL.5 and all epic release blockers |

## Story

As the product owner, I want a reversible shadow-to-beta rollout with explicit
promotion gates, so that `legacy` changes to `enforce` only for an exact signed
candidate proven safe for customers.

## Acceptance criteria

- [ ] Shadow mode evaluates every production entrypoint without blocking users
      and reports decision coverage and disagreement.
- [ ] Promotion requires zero unknown entrypoints, zero destructive recovery
      findings and no unresolved CRITICAL/HIGH entitlement defect.
- [ ] Restricted beta uses an allowlisted cohort, explicit support/rollback and
      the same signed artifact later considered for release.
- [ ] Rollback restores the previous candidate without deleting user data or
      altering terms of previously distributed versions.
- [x] `package.json` remains `legacy` until Preview, shadow, beta, legal,
      commercial, signing, artifact and independent QA gates are all recorded.
- [x] Only `@devops` may change the release candidate, deploy, publish, tag or
      push; founder approval is required for final `enforce` promotion.

## Tasks / subtasks

- [x] Implement shadow decision telemetry without project content. (AC: 1, 2)
- [x] Define beta cohort, support and rollback runbooks. (AC: 3, 4)
- [x] Add machine-readable promotion gate. (AC: 2, 5, 6)
- [ ] Execute shadow and beta evidence collection. (AC: 1-6)

## Dev notes

- Migration order is dark infrastructure, signed fixtures, shadow decisions,
  approvals, paid candidate, migration tests and exact-candidate enforcement.
  `[Source: ARCHITECTURE.md#migration-and-rollback]`
- Rollback never changes rights of an already distributed version or deletes
  customer data. `[Source: ARCHITECTURE.md#migration-and-rollback]`
- Every executable entrypoint must resolve one canonical state.
  `[Source: PRD-AEXOS-PAID-LICENSING.md#fr3-runtime-enforcement]`

## CodeRabbit integration

- Primary type: Deployment; secondary: Security, Architecture; complexity: High.
- Pre-deployment is report-only under `@devops`; exact-artifact QA is mandatory.

## File list

- [x] `scripts/licensing-shadow-report.js`
- [x] `scripts/licensing-promotion-gate.js`
- [x] `docs/guides/licensing-shadow-beta-runbook.md`
- [x] `artifacts/licensing/promotion-evidence.example.json`

## Current rollout state

- Shadow telemetry, allowlisted beta behavior and the machine-readable
  promotion gate are implemented locally.
- The promotion gate currently returns `eligible: false`; Preview, real
  provider cycles, shadow coverage, restricted beta, recovery, signed artifact,
  independent QA, legal, commercial and founder gates remain open.
- `package.json` remains `legacy`. No deploy, publish, tag, push or enforcement
  promotion was performed.
