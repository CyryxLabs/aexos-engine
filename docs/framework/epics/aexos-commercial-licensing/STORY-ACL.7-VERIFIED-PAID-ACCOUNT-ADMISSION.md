# Story ACL.7: Verified paid-account admission

| Field | Value |
| --- | --- |
| Story ID | ACL.7 |
| Epic | AEXOS Paid-Only Commercial Licensing |
| Status | Done |
| Executor | `@dev` |
| Quality gate | `@architect`, `@qa` |
| Quality gate tools | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, focused Vitest/Jest, `git diff --check` |
| Depends on | ACL.1 operational audit, ACL.3 lifecycle, ACL.5 Preview certification |

## Story

As an AEXOS buyer, I want activation to rely on my authenticated account and a
reconciled paid Stripe invoice, so that neither a checkout redirect, an
unsettled subscription nor an arbitrary email can unlock the paid engine.

## Acceptance criteria

- [ ] A Stripe-backed buyer becomes active only after a verified qualifying
      `invoice.paid` is durably recorded for an allowlisted AEXOS subscription,
      positive amount, expected currency and matching customer identity.
- [ ] `customer.subscription.*`, `checkout.session.completed`, `active` and
      `trialing` cannot independently grant the first paid entitlement; no trial
      exists unless a later explicit promotional policy authorizes it.
- [ ] Duplicate and out-of-order invoice/subscription events converge without
      double grant, while refund, dispute, chargeback, `past_due`, `unpaid`,
      pause and recovery behavior remains deterministic.
- [ ] The CLI authenticates directly with Supabase Auth using public provider
      configuration; a customer password never transits a License Authority
      application endpoint or appears in logs.
- [ ] The purchase journey is account-first. CLI activation does not expose a
      buyer/account-enumeration endpoint and does not silently create accounts.
- [ ] The activation endpoint revalidates the access token, verified email,
      active paid evidence, entitlement period and seat before issuing a signed
      machine-bound entitlement.
- [ ] The installer purchase link resolves to the official AEXOS product page,
      and failures provide purchase/recovery guidance without leaking secrets.
- [ ] Unit and integration tests cover unpaid-active, trialing, paid,
      duplicate, out-of-order, wrong currency, zero amount, identity mismatch,
      refund/hold and recovered-payment cases.
- [ ] Main and License Server lint, typecheck, tests and build pass; no Preview,
      deploy, publish, release, repository-visibility or `enforce` mutation is
      performed by this story.

## Tasks / subtasks

- [x] Add durable qualifying-invoice evidence and reconciliation queries.
      (AC: 1-3, 6)
- [x] Make subscription classification payment-aware and trial-free by default.
      (AC: 1-3)
- [x] Replace missing License Authority password proxy routes with direct
      Supabase Auth client calls discovered through public auth configuration.
      (AC: 4-6)
- [x] Correct purchase/recovery URLs and remove account-enumeration assumptions
      from the installer flow. (AC: 5, 7)
- [x] Add adversarial fixtures and run all local gates. (AC: 8, 9)

## Dev notes

- Payment admission requires `invoice.paid`; redirects and subscription state
  are not payment authority.
  `[Source: ARCHITECTURE.md#payment-admission-rule]`
- The purchase flow is account-first and passwords go directly to Supabase
  Auth; activation receives only the short-lived access token.
  `[Source: ARCHITECTURE.md#cli-authentication-contract]`
- Stripe-backed entitlements remain subject to financial holds and terminal
  lifecycle revocation.
  `[Source: PRD-AEXOS-PAID-LICENSING.md#fr1-purchase-to-entitlement]`
- The current paid candidate remains dark/non-enforcing until Preview, legal,
  artifact and release gates pass.
  `[Source: ARCHITECTURE.md#migration-and-rollback]`

## Project structure notes

- Framework installer work belongs under `packages/installer/` and framework
  tests under `tests/`, following `docs/framework/story-locations.md`.
- License Authority code remains in the separately linked local repository
  `C:/tmp/aexos-license-server`; its migrations and tests are part of this
  story's file list but do not change deployment state.

## CodeRabbit integration

- Primary type: Security; secondary: API, Database, Integration; complexity:
  High.
- Primary agents: `@dev`, `@architect`; pre-commit and pre-PR review required.
- [ ] Pre-commit (`@dev`): review uncommitted payment/auth changes.
- [ ] Pre-PR (`@devops`): review the exact candidate against `main` before any
      PR is created.
- Focus: payment-proof confusion, auth credential handling, webhook ordering,
  identity binding, database constraints and secret-safe errors.
- Self-healing: `@dev` light mode, two iterations, CRITICAL only; HIGH findings
  are documented for `@qa`.

## File list

- [x] `docs/framework/epics/aexos-commercial-licensing/ARCHITECTURE.md`
- [x] `docs/framework/epics/aexos-commercial-licensing/STORY-ACL.7-VERIFIED-PAID-ACCOUNT-ADMISSION.md`
- [x] `package.json`
- [x] `packages/installer/src/licensing/commercial-license-gate.js`
- [x] `packages/installer/src/wizard/pro-setup.js`
- [x] `packages/installer/src/wizard/i18n.js`
- [x] `tests/installer/pro-setup-auth.test.js`
- [x] `C:/tmp/aexos-license-server/app/api/v1/auth/activate-pro/route.ts`
- [x] `C:/tmp/aexos-license-server/app/api/v1/auth/config/route.ts`
- [x] `C:/tmp/aexos-license-server/lib/billing.ts`
- [x] `C:/tmp/aexos-license-server/lib/stripe-client.ts`
- [x] `C:/tmp/aexos-license-server/migrations/0006_verified_paid_invoices.sql`
- [x] `C:/tmp/aexos-license-server/tests/integration/activate-pro.test.ts`
- [x] `C:/tmp/aexos-license-server/tests/integration/stripe-entitlements.test.ts`
- [x] `C:/tmp/aexos-license-server/tests/integration/commercial-cycle-certification.test.ts`
- [x] `C:/tmp/aexos-license-server/tests/unit/auth-config.test.ts`
- [x] `C:/tmp/aexos-license-server/tests/unit/paid-invoice-evidence.test.ts`

## Dev Agent Record

- Added a private, RLS-protected paid-invoice ledger. Subscription lifecycle
  alone now persists a blocked state; only qualifying positive USD
  `invoice.paid` evidence bound to the exact AEXOS subscription, customer and
  email can reconcile an entitlement.
- Activation rechecks the authenticated Supabase user, verified email, current
  paid period, invoice evidence, financial holds, plan seat ceiling and machine
  binding before returning a signed entitlement.
- The installer discovers only public Supabase Auth configuration and sends the
  password directly to Supabase. Normal and CI flows neither enumerate buyer
  accounts nor silently sign users up.
- Migration 0006 was applied only to the isolated local Supabase stack. No
  Preview/Production database, Stripe configuration, deploy, publish, release,
  repository visibility or `legacy`/`enforce` state was changed.
- Evidence: AEXOS lint/typecheck/build pass and 9,917 tests pass; License Server
  lint/typecheck/build pass and 89 tests pass, including the 20-cycle suite;
  both production dependency audits report zero vulnerabilities.

## SM validation

- Goal/context: PASS.
- Technical guidance: PASS; uses existing Stripe, Supabase and installer
  boundaries with no new dependency.
- References/self-containment: PASS.
- Testing guidance: PASS; adversarial payment and identity cases are explicit.
- CodeRabbit: PASS; security/API/database/integration scope documented.
- ClickUp sync: not available in this session; local framework story is the
  canonical record.

## QA Results

**Gate: PASS for ACL.7 local implementation.** This verdict does not certify
Preview, Production, Stripe live mode, private artifact delivery or paid-only
public distribution.

- Payment proof: qualifying invoice evidence is durable, positive, USD-only,
  namespace/price allowlisted through its subscription and bound to the exact
  customer, subscription and normalized email. Duplicate writes are
  idempotent and older subscription events cannot overwrite newer authority.
- Negative paths: `active`, `trialing`, zero amount, wrong currency, wrong
  customer/subscription, forged Stripe buyer state and financial holds fail
  closed. `past_due` continuity remains time bounded; terminal states revoke.
- Identity: installer passwords go from the CLI directly to the discovered
  Supabase Auth endpoint. The License Authority receives only an access token
  for activation and does not expose the former buyer/account pre-check.
- Activation: the endpoint independently rechecks current invoice evidence,
  entitlement period, hold state and plan seats before issuing a machine-bound
  entitlement; an `is_active` buyer row alone is insufficient for Stripe.
- Evidence: AEXOS lint, typecheck and package build pass; 397 suites pass with
  9,917 tests (12 suites/163 tests skipped by their existing environment
  conditions). License Server lint, typecheck and Next build pass; the isolated
  local Supabase suite passes 89/89, including 20 complete commercial cycles.
  `git diff --check` passes and both production dependency audits report zero
  vulnerabilities.
- Automated review: CodeRabbit was unavailable because this Windows host has
  no usable WSL `bash`; manual security/database/API review was completed.
- Residual release gates: Preview secrets and isolated DB, authenticated real
  Stripe Checkout/Portal/`invoice.paid`, private artifact service, legal terms,
  beta cohort evidence and explicit `legacy` promotion remain required under
  ACL.5/ACL.6 and a follow-up private-distribution story.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-08-27 | 0.1.0 | Initial draft from the paid-distribution authority audit | `@sm` |
| 2026-08-27 | 0.2.0 | Validated GO (9/10) — Status: Draft → Ready | `@po` |
| 2026-08-27 | 0.3.0 | Implemented verified payment admission and direct Supabase Auth — Status: Ready → InReview | `@dev` |
| 2026-08-27 | 0.4.0 | QA PASS for local ACL.7 scope — Status: InReview → Done; external release gates remain open | `@qa` |
