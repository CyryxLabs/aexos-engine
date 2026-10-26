# Story ACL.3: Complete Stripe financial lifecycle

| Field | Value |
| --- | --- |
| Story ID | ACL.3 |
| Epic | AEXOS Paid-Only Commercial Licensing |
| Status | InProgress |
| Executor | `@dev` |
| Quality gate | `@architect`, `@qa`, `@devops` |
| Depends on | ACL.1 reconciliation and audit |

## Story

As the commercial operator, I want every relevant Stripe lifecycle state mapped
to an explicit entitlement decision, so that refunds, disputes, chargebacks,
pauses and payment recovery cannot leave silent or contradictory access.

## Acceptance criteria

- [ ] Subscription `active`, `incomplete`, `past_due`, `unpaid`, `paused`,
      cancellation-at-period-end, `canceled` and `incomplete_expired` map to an
      explicit documented entitlement state.
- [x] Refund, dispute/chargeback creation, update, closure, funds withdrawal and
      reinstatement events are verified, idempotent and auditable.
- [x] Payment recovery restores entitlement only from current Stripe authority,
      never from a redirect or unsigned client claim.
- [x] Out-of-order and duplicate events converge on the newest authoritative
      Stripe object without cross-product contamination.
- [x] `past_due` continuity and its deadline are visible; `unpaid` and terminal
      revocation preserve recovery and project export.
- [x] Email changes cannot silently transfer entitlement identity.
- [x] Checkout uses allowlisted AEXOS Prices/Products and dynamic payment
      methods; Portal remains self-service for payment recovery.
- [ ] Unit/integration fixtures cover all mappings and reversals.

## Tasks / subtasks

- [x] Define the financial-to-entitlement state matrix. (AC: 1, 5)
- [x] Extend verified webhook ingestion and object retrieval. (AC: 2-4)
- [x] Implement identity-drift and namespace controls. (AC: 4, 6, 7)
- [x] Add recovery/reversal fixtures and documentation. (AC: 2, 3, 8)

## Dev notes

- Refund, chargeback, cancellation and manual review must produce explicit
  states. `[Source: PRD-AEXOS-PAID-LICENSING.md#fr1-purchase-to-entitlement]`
- Runtime clients never trust browser redirects or unsigned purchase data.
  `[Source: PRD-AEXOS-PAID-LICENSING.md#fr1-purchase-to-entitlement]`
- Payment provider and License Authority are separate authorities.
  `[Source: ARCHITECTURE.md#authority-boundaries]`

## CodeRabbit integration

- Primary type: Integration; secondary: API, Security; complexity: High.
- Focus: webhook signatures, event ordering, idempotency, identity binding,
  reversals, Stripe namespace and least-privilege credentials.
- Self-healing: `@dev` light mode, two iterations, CRITICAL only.

## File list

- [x] `C:/tmp/aexos-license-server/lib/billing.ts`
- [x] `C:/tmp/aexos-license-server/lib/stripe-client.ts`
- [x] `C:/tmp/aexos-license-server/migrations/0005_financial_lifecycle.sql`
- [x] `C:/tmp/aexos-license-server/tests/integration/stripe-entitlements.test.ts`
- [x] `C:/tmp/aexos-license-server/tests/integration/commercial-cycle-certification.test.ts`
- [x] `C:/tmp/aexos-license-server/docs/stripe-state-matrix.md`

## Dev Agent Record

- Financial holds are order-safe and idempotent; refund/dispute/chargeback
  events cannot cross the AEXOS namespace.
- Billing recovery may restore only `billing:` revocations and cannot override
  a manual operator revocation.
- Server gate: lint/typecheck/build pass, 79/79 tests pass with one worker and
  audit reports zero high-or-greater vulnerabilities.
- Reopened by the 2026-08-27 payment-authority audit: `active` and `trialing`
  currently classify as entitled before a qualifying `invoice.paid` record.
  ACL.7 owns the corrective implementation and adversarial fixtures.
