# Story ACL.8: Authenticated private artifact delivery integration

| Field | Value |
| --- | --- |
| Story ID | ACL.8 |
| Epic | AEXOS Commercial Licensing |
| Status | InProgress — local integration approved; native delivery remains gated |
| Executor | `@dev` |
| Quality gate | `@architect`, independent `@qa` |
| Depends on | ACL.2 corrected authority; ACL.7 verified paid-account admission; AEX-3.8 signed artifact contract |
| External acceptance | Actual signing/private-origin configuration and ACL.5 Preview evidence; ACL.6 owns promotion |

## Story

As an authenticated AEXOS customer with a valid paid entitlement, I want the existing installer to acquire the exact authorized private Pro bundle from the License Authority's supported artifact endpoint, so that purchase and activation lead to a verified installation rather than a missing route or local-only download ticket.

## Context and scope

The owner authorized commercial sale-readiness work. The 2026-09-07 architecture audit found that the installer calls `POST /api/v1/pro/artifact-url`, but the current License Authority at `C:/AEXOS-license-server` has no route implementing it. AEX-3.8 already supplies the signed-descriptor schema, public verifier and transport-neutral private service; its HTTP adapter uses process-local tickets and explicitly requires a durable private origin for deployment. The public trust store is intentionally empty until a real release key is provisioned.

The current installer request targets package `@aexos/pro`, squad `pro-library`, format `tgz`, and the exact requested version/platform/channel. This story preserves that contract and the current public Core/private paid-bundle boundary. It does not implement the earlier proposed full-engine paid-only migration or remove the currently working free first value.

[AUTO-DECISION] Reuse AEX-3.8's strict descriptor contract, authority rules and public verifier as the interoperability boundary. The architect and lead selected a server-local TypeScript implementation, tested against the real Core verifier, with no runtime cross-repository imports or new signing protocol. Its completed local adapter tests do not prove the missing License Authority route or hosted delivery.

[AUTO-DECISION] Keep cache defects in ACL.2, financial admission in ACL.7, real provider certification in ACL.5 and promotion in ACL.6. Website/account UI work is separate; this story does not redesign `aexos.cyryxlabs.com`, set prices/terms, create payment products, change `legacy`/`enforce`, publish or release.

[AUTO-DECISION] Track locally under the framework epic. No ClickUp or external-message action is required. Preserve [accumulated context](../aexos-evolution/accumulated-context.md#2026-09-06-audit-and-experience-remediation) and concurrent changes across the framework and License Authority repositories.

### Prerequisite evidence audit

The following is a 2026-09-07 review of existing story records, not a rerun or hosted certification. Earlier `C:/tmp` checkout paths and local test counts are historical.

| Story | Recorded state and relevant limit | Relationship to ACL.8 |
| --- | --- | --- |
| ACL.1 | InReview; local operational/reconciliation tests and audit implemented; pre-PR/deployment gates open. | Reuse operator/audit authority. |
| ACL.2 | InProgress; real release verification key open; current cache expiry/grace/denial defects reopened under R1-R5. | Correct runtime authority; real signing remains an external gate. |
| ACL.3 | InProgress; local lifecycle work present; first-admission issues delegated to ACL.7, with two original AC still open. | Preserve payment/lifecycle policy; do not equate subscription state with payment. |
| ACL.4 | InReview; deterministic local resilience matrix and twenty synthetic cycles reported. | Useful regression baseline, not provider evidence. |
| ACL.5 | Draft; record reports zero certified Preview cycles and unverified Checkout/Portal/provider invoice. | Owns actual deployed/provider certification. |
| ACL.6 | InProgress; promotion record is ineligible; shadow/beta/signing/approval gates remain open. | Owns exact-candidate promotion; ACL.8 does not enable enforcement. |
| ACL.7 | Done with explicit local QA PASS, while its original AC checkboxes remain unchecked; hosted/private-delivery certification is expressly excluded. | Reuse verified paid admission; reconcile its checklist against current evidence without treating Done as release approval. |
| AEX-3.8 | Done for local signed service/verifier/HTTP adapter; trust store empty, durable origin and deployment excluded. | Foundation being integrated here, not duplicated product functionality. |

## Acceptance criteria

- [ ] AC1: The License Authority implements the existing `POST /api/v1/pro/artifact-url` request/response contract in a server-local TypeScript service preserving AEX-3.8's authority rules and interoperability with the real Core verifier. No runtime import from another checkout is required. Revalidate the short-lived bearer access token and authenticated/verified account server-side; an arbitrary email, checkout redirect, local buyer flag or client-supplied entitlement does not authorize a descriptor. Missing/invalid authorization produces a typed, secret-safe failure.
- [ ] AC2: Before descriptor issuance, resolve current remote paid entitlement authority using ACL.7 payment evidence and the canonical signed-entitlement decision. Reject expired, revoked/held, wrong-product, wrong-machine, seat-invalid, wrong-plan or missing `aexos.squads.<squad>` scope. A recent cache or a past qualifying invoice cannot override a current denial. The Artifact Service distributes an authorized package and never mints or extends entitlement.
- [ ] AC3: Strictly validate and bind the existing request fields (`product`, `squadId`, `package`, `version`, `format`, `machineId`, `platform`, `releaseChannel`, `cyryxCoreVersion`) to the exact allowed registry record and the `aexos.squad-artifact/v1` descriptor. Preserve the established field names/schema. Unknown or malformed input and unavailable/mismatched versions fail closed; no fallback to another package, channel, public GitHub archive, or historical npm artifact is used.
- [ ] AC4: Use the existing Postgres persistence for an immutable exact artifact registry and durable issuance/denial audit, and the existing Supabase private Storage capability for short-lived signed URLs. Wire an externally held Ed25519 signing key and revalidate current entitlement/seat/freshness before issuing authority. Deployed download authorization cannot depend on the test adapter's process-local `Map`. Missing private bucket/key/registry, unsafe origin/path, digest/size drift or signing failure returns not-configured/denied rather than an unsigned or public download. Prove configured delivery behavior across a process restart or separate request instance; document URL expiration and revocation limits. No new provider or dependency is added.
- [ ] AC5: Preserve the public installer's pinned-key verification of the descriptor signature and all account/entitlement/machine/package/version/platform/channel bindings before download, then verify byte size and SHA-256 before extraction. Send the bearer token only to the License Authority, never to the artifact origin or a redirect. Failure removes installer-owned temporary state and leaves user-owned files unchanged. Real production trust keys are added only from the approved external key ceremony; deterministic test keys cannot become production trust.
- [ ] AC6: Record bounded audit decisions/reasons and privacy-safe identifiers for issuance and denial without exposing access tokens, entitlement signatures, private keys, signed download credentials, artifact bytes, project content or customer PII. Reuse the License Authority's audited operational contract. Readiness exposes only whether required configuration is available and cannot return secret values.
- [ ] AC7: Run an end-to-end integration through the actual License Authority route and existing `InlineLicenseClient`/installer acquisition path, not only the transport-neutral test adapter. Cover valid authorized delivery plus absent/forged/unverified auth, unpaid/held/revoked/expired entitlement, wrong scope/machine/seat/version/channel, missing configuration, unknown/substituted signing key, tampered descriptor/payload, expiry, restart behavior and token non-disclosure. Bind the accepted descriptor and installed bytes to a recorded artifact hash; distinguish deterministic local fixtures from actual hosted/provider evidence.
- [ ] AC8: Run focused service/client/server regressions and lint, typecheck, tests and build for every changed repository, plus the framework's Core package-boundary check and relevant dependency/security checks. The public npm payload must still exclude private signing code, keys and paid bundle contents. Independent @architect/@qa review must assess the route, authorization/delivery boundary and the exact tested package before local Ready for Review.
- [ ] AC9: Record exact commands, source/installed/deployed identities as applicable, results, configuration prerequisites and residual release gates. Missing real signing/private-origin/Preview evidence remains explicitly unverified and blocks hosted sale-readiness under ACL.5/ACL.6; local fixtures cannot close those gates. No live charge, legal/payment-term change, `legacy`/`enforce` switch, repository-visibility change, npm publication or release is performed by this story.

## Tasks and ownership

- [x] Discover the existing private-delivery contract and missing hosted route; validate this story draft (AC1-AC9).
- [x] Root traces the current service/client/server wiring and implements the server-local TypeScript service and authenticated route against the current descriptor protocol (AC1-AC3).
- [x] `artifact_data` implements the exclusive Postgres migration/store for immutable exact registry, current entitlement/seat/freshness lookup and durable audit, coordinating its contract with root (AC2-AC4, AC6).
- [x] Root integrates signing, existing Supabase private Storage signed URLs, fail-closed readiness and route/service tests; the earlier local HTTP adapter remains test-only (AC1-AC4, AC6).
- [ ] Assigned @dev preserves/verifies the public client trust, download and extraction boundary (AC5).
- [ ] Assigned @qa/@dev adds route-through-installer, adversarial and restart tests, then executes all affected repository gates (AC7-AC8).
- [ ] Lead/@devops records actual external configuration availability and hands hosted certification/promotion evidence to ACL.5/ACL.6 without claiming those gates complete (AC9).
- [ ] Independent @architect/@qa reviews the exact local result and records PASS/CONCERNS/FAIL before story completion.

Current ownership: `artifact_data` exclusively owns the License Authority migration/store; root owns its signing, private-storage adapter, service, route and service/route tests. They agree the store interface before integration and do not edit each other's files. Preserve the public Core verifier as the protocol test oracle; any necessary framework change requires a separate explicit file assignment. Coordinate shared entitlement changes with the ACL.2 owner. @sm owns documentation only and never edits application source or commits.

### External hosted-delivery gates — remain open

- [ ] Real Ed25519 key ceremony and approved public trust key, with private material outside source/client packages.
- [ ] Actual private Supabase bucket and exact paid artifact record/object, including immutable version, size and SHA-256.
- [ ] Exact deployed Preview identity, isolated persistence and real authenticated private delivery evidence under ACL.5.
- [ ] Required provider-backed Checkout/Portal/invoice cycle certification and cleanup under ACL.5; shadow/beta/legal/commercial/founder promotion evidence remains ACL.6 scope.

Current operational observations supplied by the lead: Stripe connector reauthentication is blocked, and the connected Vercel team listing returned no projects. Neither observation is proof that the commercial service is configured. No real provider mutation has been performed for this story. These external gates must not be checked from mocks, test keys, local route success or stale environment assumptions.

## Dev notes and source contracts

- Current License Authority checkout: `C:/AEXOS-license-server`. Earlier stories cite `C:/tmp/aexos-license-server`; treat those as historical paths. The expected new route is `C:/AEXOS-license-server/app/api/v1/pro/artifact-url/route.ts`, following the current server route structure. Server entitlement/registry/audit adapters and their final file names must follow that repository's existing conventions.
- Current installer entry is `acquireProArtifactSourceDir` in `packages/installer/src/wizard/pro-setup.js`, calling `InlineLicenseClient.getProArtifactUrl`. Preserve the exact requested artifact identity and existing signed-descriptor verifier rather than adding another download path. `[Source: architecture audit of the existing installer contract, 2026-09-07]`
- Reuse the protocol and authorization requirements of `pro/artifact-service/signed-squad-artifact-service.js` and its existing authentication, current entitlement, verification, registry, key and audit boundaries. Implement server-local TypeScript for the License Authority deployment and validate its output with `packages/installer/src/licensing/paid-squad-artifact.js`; do not import executable code from a sibling checkout at runtime. `pro/artifact-service/README.md` explicitly states that the minimal local HTTP adapter's tickets are not a production storage mechanism. `[Source: pro/artifact-service/README.md; architecture/lead direction, 2026-09-07]`
- The strict schema is `.aexos-core/schemas/paid-squad-artifact-v1.schema.json`; public verification is `packages/installer/src/licensing/paid-squad-artifact.js`; pinned keys are in `packages/installer/src/licensing/artifact-trust-store.json`. Empty production keys are an explicit fail-closed prerequisite, not permission to ship a fixture key. `[Source: STORY-AEX-3.8, Release Boundary](../aexos-evolution/STORY-AEX-3.8-SIGNED-PAID-SQUAD-ARTIFACTS.md#release-boundary)`
- Only the License Authority issues entitlements. The artifact descriptor binds authenticated subject/entitlement, machine, package/version/platform/channel, byte size/digest, expiration and key identifier. `[Source: ARCHITECTURE.md#authority-boundaries; ARCHITECTURE.md#authenticated-artifact-descriptor]`
- Account-first admission and direct Supabase Auth remain unchanged; passwords are not sent through the License Authority application route. `[Source: ARCHITECTURE.md#cli-authentication-contract; STORY-ACL.7-VERIFIED-PAID-ACCOUNT-ADMISSION.md#qa-results]`
- Public Core excludes private service/artifact content under the current distribution decision. Preserve that current architecture while integrating private paid bundles. `[Source: ../aexos-evolution/adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md#decision]`
- New framework JavaScript remains CommonJS/ES2022 using existing dependencies; the server retains its current TypeScript/Next.js conventions. The selected backing design uses its existing Postgres and Supabase capabilities, not a new payment, identity or storage vendor. `[Source: ../../tech-stack.md#core-runtime; existing License Authority architecture; architecture/lead direction, 2026-09-07]`

## Verification plan

Reuse existing root tests in `tests/unit/licensing/paid-squad-artifact*.test.js`, `tests/integration/paid-squad-artifact-http.test.js` and `tests/installer/pro-setup-signed-artifact.test.js`. Add actual License Authority route integration in that repository's `tests/integration/` convention. Record the exact test files and executed commands after implementation; passing AEX-3.8's local adapter test alone is insufficient for AC7.

From each affected repository, execute `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. From `C:/AEXOS`, also execute `npm run validate:core-package` and the affected signed-artifact regressions. Record relevant dependency/security scan findings rather than suppressing existing failures. Test fixtures are isolated, explicitly non-production, and cannot initiate live payments or production key provisioning.

The evidence report separates code/route integration, private-origin durability, real signing/public trust, exact artifact installation, hosted Preview/provider certification and final promotion. ACL.5 owns the real Checkout/Portal/invoice 20-cycle requirement; ACL.6 owns shadow/beta/approval and release promotion. Website, account UI and published offer validation are independent workstreams.

## CodeRabbit integration

- Primary type: Security; secondary: API/Integration; complexity: High.
- Primary executor: @dev; architecture review: @architect; independent final gate: @qa.
- Pre-commit: @dev reviews current changes. Pre-PR/deployment: @devops only if separately required by the lead; this story does not add a publication requirement.
- Focus: auth/entitlement confusion, signed request binding, private origin durability, credential leakage, artifact substitution, temp cleanup and public-package boundary.
- Self-healing: @dev light, two iterations/15 minutes, CRITICAL fixes and HIGH documented; @qa full, three iterations/30 minutes, CRITICAL/HIGH correction; @devops report-only.
- Record actual CodeRabbit availability/results. If unavailable under repository policy, use independent review and required gates; do not claim an automated review pass.

## Story-draft checklist

READY for dark implementation; clarity 9/10. This does not certify hosted delivery or commercial release. Applied `.aexos-core/product/checklists/story-draft-checklist.md` with the current architecture audit, ACL.1-ACL.7 records, AEX-3.8, schema/service contract and accumulated context.

| Category | Result | Basis |
| --- | --- | --- |
| Goal and context | PASS | Missing server integration is concrete; prior implemented foundation and certification dependencies are separated. |
| Technical guidance | PASS | Existing request/schema, client/service/server locations, authority and storage boundaries are identified. |
| References | PASS | Specific architecture/previous-story sections and contract files are linked or named with purpose. |
| Self-containment | PASS | AC1-AC9 define exact paid-bundle scope, negative cases, external prerequisites and no release mutation. |
| Testing | PASS | Actual route-through-client integration, restart and package security are distinct from local fixtures and hosted proof. |
| CodeRabbit | PASS | Executor, independent gates, security focus, self-healing and unavailable-tool handling are explicit. |

Developer perspective: implementation can proceed on route/adapters, configuration validation and isolated contract tests. A configured production key/private origin is an external acceptance dependency; it must not be fabricated to make a green result. A new schema, website design, commercial policy or provider choice is not needed to start.

## Current file list

- `docs/framework/epics/aexos-commercial-licensing/STORY-ACL.8-AUTHENTICATED-PRIVATE-ARTIFACT-DELIVERY.md` — story and implementation evidence; complete source/test inventory is recorded in Dev Agent Record below.

## Dev Agent Record and QA

2026-09-08: Local integration implemented and independently approved. The actual
route is exercised over HTTP by the existing InlineLicenseClient, then by the
Core signature/payload verifier. Local provider/DB fixtures are explicitly
distinguished from native acceptance; no deployed/private-TGZ installation is claimed.

Independent review found and closed three defects: provider URL lifetime exceeding
the paid deadline after network latency, lack of catalog withdrawal, and historical
invoice reuse for an unpaid renewal. URL capability expiry is now checked against
an absolute cutoff; catalog withdrawal is append-only and checked before issuance;
invoice line service coverage is persisted and required by reconciliation,
admission and artifact authorization. Missing legacy coverage is never invented.

Source/file list (relative to `C:/AEXOS-license-server`):

- `app/api/v1/pro/artifact-url/route.ts`
- `lib/artifact-signing.ts`, `lib/private-artifact-storage.ts`
- `lib/paid-artifact-service.ts`, `lib/paid-artifact-store.ts`
- `lib/billing.ts`, `lib/billing-admission.ts`
- `lib/stripe-authority-gateway.ts`, `lib/stripe-reconciliation-store.ts`
- `migrations/0003_paid_artifact_delivery.sql`
- `tests/unit/paid-artifact-service.test.ts`, `tests/unit/private-artifact-storage.test.ts`
- `tests/unit/paid-artifact-store.test.ts`, `tests/unit/stripe-authority-gateway.test.ts`
- `tests/integration/paid-artifact-route.local.test.ts`
- `tests/integration/paid-artifact-database.local.test.ts`
- `.env.example`, `docs/private-artifact-delivery.md`

Verification: server lint/build/typecheck exit 0; 155 tests pass, 43 explicitly
skip absent native infrastructure. Core aggregate 10,524 pass/0 fail/163 skip;
package boundary exit 0; both production dependency audits report zero vulnerabilities.
Independent local review APPROVED. Receipts and exact commands are recorded in
`C:/AEXOS/artifacts/commercial-readiness-20260908/`.

Open acceptance: native migration/RLS execution (Docker/database unavailable),
real signing/private Storage/catalog provisioning, immutable approved Pro TGZ,
actual hosted account/payment/download/extraction/installation/recovery, and
ACL.5/ACL.6 certification. The Stripe connector requires reauthentication; the
connected Vercel team lists no projects. The public website still has proposal
pricing/contact CTAs, not a verified live billing journey. No live charge,
deployment, key ceremony, npm publication or enforcement promotion occurred.

## Native database acceptance — 2026-09-08

- [x] Execute migrations 0001–0003 on native PostgreSQL in a disposable loopback-only database and verify transaction rollback.
- [x] Exercise production grant lookup and atomic issuance SQL against native data: legacy/expired invoice denial, current coverage allow, wrong machine/platform, renewed unpaid period, revoked license, released seat, missing scope, past-due state, holds, withdrawal and stale authority rejection.
- [x] Verify forced RLS under browser roles and immutable registry/issuance/denial/revocation records.
- [x] Record exact source hashes, PostgreSQL version, test exit and stopped cluster without credentials.
- [ ] Apply migration and repeat the hosted account/payment/download/install journey in the correctly isolated Preview environment (ACL.5).

The earlier Docker/database-unavailable observation is now superseded for the
**local native database gate only**. Docker itself still fails at its runtime
socket; no reset or system modification was performed. Portable PostgreSQL 17.11
from the official EDB HTTPS download was isolated under
`C:/AEXOS-LOCAL-TESTS/acl8-postgres-20260908`, with no service or PATH installation.
One native acceptance test containing the full matrix passed with zero skips;
seven existing store regressions passed and TypeScript validation passed.
Full lint observed concurrent key-provisioning script import errors, reported to
its owning lead for correction; the changed native test passes focused lint.

Updated file list: `C:/AEXOS-license-server/tests/integration/paid-artifact-database.local.test.ts`.
Evidence and reproducible harness:
`C:/AEXOS/artifacts/commercial-readiness-20260908/native-db/verification.md`,
`native-receipt.json`, `native-test.log`, `run-native-acceptance.cjs`.
No production migration, provider-derived backfill, hosted payment acceptance,
release promotion or signing trust acceptance is implied by this result.

## Change log

### Protected Preview signing follow-through — 2026-09-08

The owner's continuation explicitly requested provisioning and verification of
real signing material. A real Ed25519 Preview key was generated outside the
repository and protected with Windows DPAPI CurrentUser. Its public fingerprint
and real recovery/signature verification are recorded in
`artifacts/commercial-readiness-20260908/preview-key-receipt.json`. The Core release
trust store remains unchanged; this is not production signing acceptance.

- [x] Provide an explicit operator Preview ceremony, refuse existing key overwrite and production key IDs, and verify protected recovery against public trust.
- [x] Distinguish Vercel Preview from production builds and reject unknown environments; production rejects Preview/test/fixture keys.
- [x] Verify real DPAPI round-trip and rejection of substituted public trust; record secret-free receipt.
- [ ] Bind approved immutable commercial TGZ, private hosted bucket, Preview deployment and reviewed public trust to actual hosted delivery.

Updated server file list: `scripts/provision-artifact-key.mjs`,
`lib/artifact-signing.ts`, `tests/unit/provision-artifact-key.test.ts`,
`tests/unit/paid-artifact-service.test.ts`, `docs/private-artifact-delivery.md`.
The earlier CommonJS lint failure was corrected by using an ES module consistent
with existing operator scripts. Full server lint/build/typecheck/test now exit 0:
170 tests pass and 43 require separately configured integration infrastructure.
The native PostgreSQL acceptance was executed separately: eight pass, zero skips
(seven connection isolation guards and one native SQL cycle). Independent QA
found and verified correction of a pg URL-option hostname override in the test
harness; it now rejects query/fragment options and uses explicit loopback fields.
Continuation verdict: APPROVED for local scope in
`artifacts/commercial-readiness-20260908/continuation-qa.md`.
Private-source inspection found `CyryxLabs/aexos-pro` main at
`e0e8ccee248e4131e573c82408546e4ee4ac0eb4` still contains scaffold package
`@cyryx-squads/pro@0.0.0` and incomplete license terms; it is not an approved
`@aexos/pro` release artifact.

2026-09-07 — v1 — Chronos: created bounded ACL.8 from the current missing License Authority route and AEX-3.8 production-integration gap; current free-core/private-paid boundary and ACL.5/ACL.6 certification gates preserved.
