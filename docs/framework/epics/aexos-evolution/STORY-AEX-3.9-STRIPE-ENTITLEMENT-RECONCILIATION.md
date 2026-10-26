# STORY-AEX-3.9 — AEXOS-Scoped Stripe Entitlement Reconciliation

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Commercial Architecture:** [AEXOS Paid Licensing Architecture](../aexos-commercial-licensing/ARCHITECTURE.md)  
**Status:** Done  
**Executor:** `@dev`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Depends on:** AEX-3.8 (`Done`)  
**Implementation Repository:** `C:/AEXOS-license-server` (`CyryxLabs/aexos-license-server`, private)

## Story

As the AEXOS License Authority, I want every AEXOS Stripe event reconciled into
one durable, idempotent and product-scoped payment decision so that Checkout,
Portal, invoices, refunds, disputes, chargebacks, pauses and recovery can never
grant or retain paid access from an unsigned browser claim or stale event.

## Current-State Finding

- The historical ACL.3/ACL.7 records refer to an uncommitted checkout under
  `C:/tmp/aexos-license-server`; that directory no longer exists.
- The private remote is recoverable and was cloned to the persistent path
  `C:/AEXOS-license-server` at `09a6ec2`, but it contains only the pre-Stripe
  activation baseline. The deployed Vercel hostname currently serves the
  default “Create Next App” page and returns 404 for `/ready` and
  `/api/v1/auth/config`.
- Therefore historical test counts are not accepted as current evidence. This
  story reconstructs and re-tests the Stripe authority against the real remote
  baseline without changing Production, Preview, Stripe or Supabase state.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | Stripe configuration is server-only and fail closed. Product, Price, currency, success/cancel URLs and Portal return URL come from explicit AEXOS allowlists; no client-supplied product, amount, currency or redirect becomes authority. |
| AC2 | Checkout is account-first: a verified authenticated Supabase subject receives an idempotent Checkout Session for exactly one allowlisted AEXOS Price. Existing active/pending duplicate purchase state is rejected or deterministically reused. Checkout completion never grants entitlement. |
| AC3 | Customer Portal creation requires the authenticated subject to own the exact AEXOS Stripe customer. It cannot open another customer or cross into non-AEXOS products. |
| AC4 | Webhooks require a valid Stripe signature over the raw body. A durable unique event ledger records processing status; authoritative Stripe invoice/subscription/charge/dispute objects are retrieved server-side before reconciliation. Duplicate delivery is idempotent and stale events cannot overwrite newer authority. |
| AC5 | First paid admission requires a qualifying `invoice.paid`: positive paid amount, expected currency, allowlisted AEXOS Price/Product, matching customer/subscription and normalized authenticated identity. `checkout.session.completed`, `active`, `trialing` or a local buyer flag cannot grant first access. |
| AC6 | Subscription `active`, `incomplete`, `past_due`, `unpaid`, `paused`, cancellation-at-period-end, `canceled` and `incomplete_expired`, plus refund and dispute/chargeback lifecycle, map to explicit entitlement states and financial holds. Recovery requires current Stripe authority and cannot override a manual/security hold. |
| AC7 | Refund, dispute, chargeback, pause, recovery, duplicate and out-of-order events converge deterministically without double grant, cross-product contamination or silent email-based entitlement transfer. Every allow/deny/hold/recover decision is attributable and secret-safe. |
| AC8 | Database migrations enforce unique provider event/object authority, normalized identity, AEXOS namespace, paid-invoice evidence and RLS/default-deny boundaries. Migration application is not part of this local story. |
| AC9 | Unit and integration tests cover Checkout, Portal, `invoice.paid`, all state mappings, wrong price/product/currency/customer/identity, zero amount, invalid signature, duplicate/out-of-order delivery, refund, dispute/chargeback, pause and payment recovery. Tests use Stripe fixtures/fakes locally; they do not claim real provider certification. |
| AC10 | License Server lint, typecheck, tests, build, dependency audit and diff check pass. No Vercel deploy, Stripe/Supabase mutation, migration application, secret pull, commit, push, tag, publish or `legacy` → `enforce` change occurs. |

## Tasks / Subtasks

- [x] Add strict Stripe/AEXOS configuration and provider client boundary. (AC: 1)
- [x] Add authenticated Checkout and Portal application services/routes. (AC: 2–3)
- [x] Add durable event/payment/hold schema and idempotent reconciliation engine. (AC: 4–8)
- [x] Change activation admission from `buyers.is_active` to current qualifying paid evidence. (AC: 5–7)
- [x] Add exhaustive unit/integration fixtures and state-matrix documentation. (AC: 6–9)
- [x] Run gates and record local versus provider-certified release boundaries. (AC: 10)

## Dev Notes

- The License Authority is the only entitlement issuer; Stripe proves payment
  events but never issues an AEXOS entitlement.
  `[Source: ../aexos-commercial-licensing/ARCHITECTURE.md#authority-boundaries]`
- First admission requires verified `invoice.paid`; Checkout redirects and
  subscription state are insufficient.
  `[Source: ../aexos-commercial-licensing/ARCHITECTURE.md#payment-admission-rule]`
- Password authentication remains direct to Supabase Auth; License Authority
  routes receive a short-lived access token, not the customer password.
  `[Source: ../aexos-commercial-licensing/ARCHITECTURE.md#cli-authentication-contract]`
- Real Checkout/Portal/webhook certification and the 20 complete provider
  cycles remain AEX-3.11 work. This story provides locally deterministic
  implementation evidence only.

## Project Structure Notes

- Story/governance remains in this AEXOS repository.
- Commercial backend implementation belongs to the private repository at
  `C:/AEXOS-license-server`; do not copy its source into the public Core npm
  package or paid squad artifact.
- Use the official server-side Stripe SDK with an exact locked version. No
  Stripe secret, webhook secret, Supabase key or customer PII enters fixtures,
  logs, documentation or Git.

## Testing Requirements

```powershell
Set-Location -LiteralPath 'C:\AEXOS-license-server'
npm run lint
npm run typecheck
npm test
npm run build
npm audit --json
git diff --check
```

## CodeRabbit Integration

- Primary type: Security; secondary: API, Database, Integration; complexity:
  Critical.
- [ ] Pre-commit (`@dev`): review uncommitted payment, signature, identity and
  database changes.
- [ ] Pre-PR (`@devops`): review the exact candidate against `main`; no PR is
  authorized by this story.
- Focus: webhook signature/raw body, idempotency, ordering, namespace/Price
  allowlists, identity binding, financial hold recovery and secret leakage.

## File List

- [x] `C:/AEXOS/docs/framework/epics/aexos-evolution/STORY-AEX-3.9-STRIPE-ENTITLEMENT-RECONCILIATION.md`
- [x] `C:/AEXOS-license-server/.env.example`
- [x] `C:/AEXOS-license-server/package.json`
- [x] `C:/AEXOS-license-server/package-lock.json`
- [x] `C:/AEXOS-license-server/lib/stripe-config.ts`
- [x] `C:/AEXOS-license-server/lib/stripe-client.ts`
- [x] `C:/AEXOS-license-server/lib/billing.ts`
- [x] `C:/AEXOS-license-server/lib/billing-admission.ts`
- [x] `C:/AEXOS-license-server/lib/billing-commerce-store.ts`
- [x] `C:/AEXOS-license-server/lib/billing-http.ts`
- [x] `C:/AEXOS-license-server/lib/stripe-authority-gateway.ts`
- [x] `C:/AEXOS-license-server/lib/stripe-commerce-gateway.ts`
- [x] `C:/AEXOS-license-server/lib/stripe-commerce.ts`
- [x] `C:/AEXOS-license-server/lib/stripe-reconciliation-store.ts`
- [x] `C:/AEXOS-license-server/lib/stripe-reconciliation.ts`
- [x] `C:/AEXOS-license-server/lib/stripe-webhook.ts`
- [x] `C:/AEXOS-license-server/lib/api.ts`
- [x] `C:/AEXOS-license-server/lib/licenses.ts`
- [x] `C:/AEXOS-license-server/app/api/v1/auth/activate-pro/route.ts`
- [x] `C:/AEXOS-license-server/app/api/v1/license/activate/route.ts`
- [x] `C:/AEXOS-license-server/app/api/v1/billing/checkout/route.ts`
- [x] `C:/AEXOS-license-server/app/api/v1/billing/portal/route.ts`
- [x] `C:/AEXOS-license-server/app/api/v1/webhooks/stripe/route.ts`
- [x] `C:/AEXOS-license-server/migrations/0002_stripe_entitlement_authority.sql`
- [x] `C:/AEXOS-license-server/docs/stripe-state-matrix.md`
- [x] `C:/AEXOS-license-server/README.md`
- [x] `C:/AEXOS-license-server/tests/integration/activate-pro.test.ts`
- [x] `C:/AEXOS-license-server/tests/integration/billing-routes.local.test.ts`
- [x] `C:/AEXOS-license-server/tests/integration/license-endpoints.test.ts`
- [x] `C:/AEXOS-license-server/tests/integration/seat-concurrency.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/activate-pro-paid-admission.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/billing-admission.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/stripe-config.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/billing.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/seat-claim.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/stripe-authority-gateway.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/stripe-commerce-gateway.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/stripe-commerce.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/stripe-migration.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/stripe-reconciliation-store.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/stripe-reconciliation.test.ts`
- [x] `C:/AEXOS-license-server/tests/unit/stripe-webhook.test.ts`

## SM Validation

- Goal/context: PASS — exact AEX-3.9 Sprint 3 outcome.
- Technical guidance: PASS — restores the existing external License Authority
  boundary without changing AEXOS execution architecture.
- Historical evidence: explicitly rejected as current proof because the
  original working checkout is absent and the remote predates Stripe work.
- Provider boundary: PASS — local implementation is separated from AEX-3.11
  real Sandbox certification.

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story reconstructed from the approved program, current remote and preserved ACL contracts — Status: Draft | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (9/10) — Status: Draft → Ready | @po / @architect |
| 2026-09-04 | 0.3.0 | Development started on the recovered private baseline — Status: Ready → InProgress | @dev |
| 2026-09-04 | 0.4.0 | Added fail-closed Stripe configuration, dependency remediation, financial decision matrix and unapplied durable schema — Status remains InProgress | @dev |
| 2026-09-04 | 0.5.0 | Completed local Checkout, Portal, signed webhook reconciliation, paid admission, exact subscription/license binding and deterministic recovery coverage — Status: InProgress → InReview | @dev |
| 2026-09-04 | 0.6.0 | Independent critical-path review passed after three payment-authority defects were corrected — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Debug Log References

- Recovered `CyryxLabs/aexos-license-server` into persistent
  `C:/AEXOS-license-server` at remote revision `09a6ec2`; working tree was clean
  and contained the documented pre-Stripe baseline.
- Public deployed hostname probe: root returned the default “Create Next App”;
  `/ready` and `/api/v1/auth/config` returned 404. No deployed licensing
  authority is claimed.
- Baseline dependency audit found four high-severity transitive findings.
  Upgraded Next.js/eslint-config-next from 16.2.12 to 16.3.4, pinned Stripe
  22.6.1 and overrode vulnerable Nano ID to 3.3.18; final audit reports zero
  known vulnerabilities across 523 dependencies.
- Final local gates: lint PASS with no warnings; typecheck PASS; production
  build PASS; deterministic tests PASS (14 files, 109 tests). Three
  provider-backed suites (42 tests) were explicitly skipped because no
  authorized Stripe/Supabase environment was loaded; their skip is not counted
  as provider certification.
- `npm audit --json` reports zero known vulnerabilities across 523 dependencies;
  `git diff --check` and the changed-file secret scan pass.
- CodeRabbit pre-commit was attempted, but the available WSL environment has no
  `bash` executable. The unavailable optional reviewer was recorded rather than
  treated as release evidence or a blocker; repository lint, typecheck, tests,
  build, audit and manual critical-path review were used.
- Manual review found and corrected three payment-authority defects before the
  final gate: a won dispute retained a hold when the charge also had a refund;
  reconciliation could update every historical licence for a user; and the
  activation response could expose an expiry later than the paid period.

### Completion Notes

- Checkout and Portal require verified authenticated identity, strict AEXOS
  Product/Price/currency/redirect allowlists, dedicated customer ownership and
  durable Checkout idempotency. Checkout completion records state but never
  grants entitlement.
- The raw request body is verified with the official Stripe SDK. Relevant
  objects are retrieved server-side and reconciled through a durable event
  lease/ledger with stale-event protection and secret-safe decisions.
- First admission now requires exact positive `invoice.paid` evidence and
  current active subscription authority; the legacy buyer flag is not read.
- Refund, dispute, chargeback, pause and recovery converge through explicit
  holds. Manual/security holds remain dominant.
- Each subscription binds to exactly one issued licence. Binding rechecks paid
  authority transactionally, limits the client-visible expiry to the Stripe
  period, and seat creation requires a still-active, unexpired licence row.
- Migration `0002` remains unapplied and all real Stripe/Supabase/Preview work
  remains explicitly deferred to AEX-3.11.

### Definition of Done Self-Assessment

- [x] Functional requirements and AC1–AC10 are implemented for the authorized
  local/fake-provider scope.
- [x] Structure, stack, API contracts, security handling and configuration
  follow the repository guidance; no secrets or browser authority were added.
- [x] Required deterministic unit and route-integration tests pass; live suites
  are visibly skipped and not misrepresented as certification.
- [x] Edge cases include wrong identity/Price/Product/currency, zero payment,
  signature/mode failure, duplicate/out-of-order events, refunds, disputes,
  chargebacks, pause, recovery and activation/revocation races.
- [x] Lint, typecheck, tests, build, dependency audit, diff check and secret scan
  pass. Stripe 22.6.1 is pinned; Next.js was remediated to 16.3.4 and Nano ID to
  3.3.18, all recorded in package metadata.
- [x] README, state matrix, file list, debug log, completion notes and change log
  are current. Provider certification remains a documented follow-up, not an
  incomplete AC of this local story.
- [x] Developer confirms all applicable DoD items are addressed and the story
  is ready for independent QA review.

## QA Results

### Gate Decision: PASS

- Reviewed Checkout, Portal, webhook signature/raw body, provider re-fetch,
  event lease/idempotency, stale ordering, paid-invoice admission, hold recovery,
  exact license binding, paid-period expiry and seat-claim race boundaries.
- Fixed during review: won-dispute recovery could remain held by unrelated
  refund state; reconciliation could mutate historical user licences; and the
  activation response could exceed the paid period or create a seat after a
  concurrent revocation.
- Final evidence: lint PASS; typecheck PASS; build PASS; 14 deterministic test
  files / 109 tests PASS; dependency audit 0 vulnerabilities / 523
  dependencies; diff and changed-file secret scan PASS.
- Three real provider/database suites (42 tests) remain skipped without an
  authorized environment and are not counted as Stripe, Supabase, Preview or
  Production certification.
- CodeRabbit is unavailable because the installed WSL environment cannot
  launch `bash`; no CodeRabbit result is claimed.
- Gate artifact:
  `docs/qa/gates/AEX-3.9-stripe-entitlement-reconciliation.yml`.
- Release boundary remains closed. Migration application, real Checkout/Portal,
  webhook delivery, failure injection and twenty Sandbox cycles belong to
  AEX-3.11 before shadow/beta/enforce progression.
