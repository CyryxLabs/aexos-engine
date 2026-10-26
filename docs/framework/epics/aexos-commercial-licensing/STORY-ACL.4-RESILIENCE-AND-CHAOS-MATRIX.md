# Story ACL.4: Licensing resilience and failure matrix

| Field | Value |
| --- | --- |
| Story ID | ACL.4 |
| Epic | AEXOS Paid-Only Commercial Licensing |
| Status | InReview |
| Executor | `@qa` with `@dev` fixes |
| Quality gate | `@architect` |
| Depends on | ACL.1-ACL.3 |

## Story

As the release owner, I want deterministic failure tests across payment,
licensing and client boundaries, so that outages and retries cannot double
charge, lose state, leak secrets or destroy customer work.

## Acceptance criteria

- [x] Automated tests cover Stripe unavailable, database unavailable, webhook
      timeout/retry, network loss, machine change, duplicate checkout and
      duplicate payment events.
- [x] Tests cover crash during cache write, clock rollback, cache tamper,
      machine clone, seat race, stale webhook processing and reconciliation.
- [x] Every failure yields a typed public result, an internal auditable record
      where possible and a documented recovery action.
- [x] No test path logs credentials, tokens, license keys, project content or
      raw private data.
- [x] User-owned project files remain byte-identical across every license state.
- [x] Test harnesses are deterministic, isolated and cannot target live mode.

## Tasks / subtasks

- [x] Build fault-injection adapters and deterministic fixtures. (AC: 1, 2, 6)
- [x] Implement state and data-integrity assertions. (AC: 3-5)
- [x] Add secret/PII scans for logs and artifacts. (AC: 4)
- [x] Produce a machine-readable resilience report. (AC: 1-6)

## Dev notes

- Security gates require replay, cache tamper, clock rollback, machine clone,
  seat race, artifact substitution and PII scans.
  `[Source: ARCHITECTURE.md#security-gates]`
- Recovery commands must be available under every failure state.
  `[Source: ARCHITECTURE.md#security-gates]`
- Licensing transitions must never mutate project knowledge.
  `[Source: PRD-AEXOS-PAID-LICENSING.md#success-metrics]`

## CodeRabbit integration

- Primary type: Security; secondary: Integration, QA; complexity: High.
- Self-healing: `@qa` full mode, three iterations, CRITICAL and HIGH.

## File list

- [x] `C:/tmp/aexos-license-server/tests/`
- [x] `tests/license/`
- [x] `scripts/licensing-resilience-matrix.js`
- [x] `artifacts/licensing/resilience-report.json`

## QA evidence

- The deterministic local matrix passes six grouped gates with live mode forced
  off, including the License Authority integration suite and 20 synthetic
  lifecycle cycles.
- A synthetic customer-project sentinel has identical SHA-256 before and after
  the matrix. The source scan found no Stripe/private-key material outside
  ignored environment and artifact locations.
- This is local resilience evidence. It does not certify a deployed Preview,
  real Checkout, Customer Portal or provider-delivered `invoice.paid`.
