# STORY-AEX-3.8 — Signed Paid Squad Artifact Service

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Architecture:** [ADR-AEX-011](./adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md)  
**Status:** Done  
**Executor:** `@dev`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Quality Gate Tools:** focused Jest, `npm run lint`, `npm run typecheck`, full Jest, `npm run build`, Core package validation, `npm audit`, `git diff --check`  
**Depends on:** AEX-3.7 (`Done`)

## Story

As the AEXOS paid-squad distributor, I want authenticated, entitlement-bound
artifact descriptors and independently verified payloads so that only a valid
AEXOS customer can acquire the exact squad/version authorized for their
machine, and no expired, revoked, wrong-product or tampered response can be
installed.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | A strict versioned descriptor binds protocol, product, authenticated subject, entitlement ID, privacy-bounded machine hash, squad, package, version, platform, release channel, artifact URL, byte size, SHA-256, issuance/expiry, entitlement freshness and signing key ID. Unknown fields, algorithms and key IDs fail closed. |
| AC2 | A private transport-neutral artifact service authenticates the request, resolves current entitlement authority and rejects absent, expired, revoked/held, wrong-product, wrong-machine, seat-invalid or missing `aexos.squads.<squad>` scope before reading or returning artifact authority. |
| AC3 | Descriptor issuance requires an injected private Ed25519 key, exact registry record and configured private HTTPS origin (localhost HTTP only in tests). Missing key/origin/record, unsafe identifiers/paths or on-disk digest/size drift fail closed. No private key or artifact payload is added to the public Core package. |
| AC4 | The public installer client accepts only pinned public verification keys, verifies the descriptor signature and all request bindings before download, then verifies payload size and SHA-256 before writing or extraction. A URL or digest without a valid descriptor signature is never authority. |
| AC5 | The existing Pro acquisition path uses the signed descriptor verifier and sends the authenticated access token only to the License Authority endpoint; download requests do not expose that token to the artifact origin. Temporary files are removed on every failure. |
| AC6 | Tests reject expired, revoked, wrong-product, wrong-machine, missing-scope, unknown-key, substituted-key, modified-descriptor, modified-payload, version-confused and registry-drift cases; a real local HTTP round trip succeeds only for a valid request. |
| AC7 | Audit events contain decision/reason and privacy-bounded identifiers but no access token, entitlement signature, private key, artifact bytes or source content. |
| AC8 | Focused tests, lint, typecheck, full regression, build, public package boundary and dependency audit pass. No deploy, publish, tag, commit, push, Stripe mutation or `legacy` → `enforce` change occurs. |

## Tasks / Subtasks

- [x] Define strict descriptor contract and public verification/download module. (AC: 1, 4–6)
- [x] Implement private registry-backed signing service and authorization boundary. (AC: 2–3, 7)
- [x] Connect signed verification to the existing installer acquisition flow. (AC: 4–5)
- [x] Add adversarial unit tests and a real local HTTP integration probe. (AC: 6–7)
- [x] Run repository gates; update story, QA record and residual-risk statement. (AC: 8)

## Dev Notes

- Non-Core squads are omitted from Core Free and fetched only through an
  authenticated artifact service. The service evaluates a signed AEXOS
  entitlement and returns a digest and signature; the installer verifies
  product, plan, expiry, machine/seat policy, digest and signature before
  extraction.  
  `[Source: adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md#decision]`
- The Artifact Service distributes artifacts but cannot mint entitlements; the
  License Authority remains the only entitlement issuer.  
  `[Source: ../aexos-commercial-licensing/ARCHITECTURE.md#authority-boundaries]`
- The authenticated descriptor must bind identity/entitlement, machine,
  package/version/platform/channel, URL, byte size, SHA-256, expiry and signing
  key. Missing private origin, signing key or exact artifact record fails
  closed.  
  `[Source: ../aexos-commercial-licensing/ARCHITECTURE.md#authenticated-artifact-descriptor]`
- Node.js 18+ native `fetch` and `crypto` are available; new dependencies are
  unnecessary.  
  `[Source: ../../tech-stack.md#core-runtime]`
- New JavaScript uses CommonJS, two-space indentation, single quotes, semicolons,
  explicit input validation and path-traversal protection.  
  `[Source: ../../coding-standards.md#javascript-typescript-standards]`
- The current installer verifies URL scheme, payload size and SHA-256, but does
  not verify a signed artifact descriptor. AEX-3.8 must extend this path rather
  than create a second installer flow.
- The previously referenced temporary License Authority checkout is not present
  on this host. This story therefore implements a transport-neutral private
  service boundary plus a real local HTTP adapter/probe in this repository; it
  does not claim a deployed server.

## Project Structure Notes

- Public verification belongs under `packages/installer/src/licensing/` and is
  included in Core Free.
- Private signing/service code belongs under `pro/artifact-service/`, which the
  AEX-3.7 package boundary excludes from the public npm tarball.
- Tests belong under `tests/unit/licensing/` and `tests/integration/`; no private
  artifact or production key is committed.

## Testing Requirements

```powershell
npx jest tests/unit/licensing/paid-squad-artifact.test.js tests/unit/licensing/paid-squad-artifact-service.test.js tests/integration/paid-squad-artifact-http.test.js tests/installer/pro-setup-signed-artifact.test.js tests/installer/pro-setup-target-install.test.js --runInBand
npm run validate:core-package
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
npm audit --json
git diff --check
```

## CodeRabbit Integration

- Primary type: Security; secondary: API, Integration; complexity: High.
- Primary agents: `@dev`, `@architect`; final independent review: `@qa`.
- [x] Pre-commit (`@dev`): attempted with the required Windows/WSL command;
      WSL could not start `bash`, so the review degraded to focused adversarial
      tests, explicit private-service lint and manual security inspection.
- [ ] Pre-PR (`@devops`): review the exact candidate against `main` before any
      future PR; no PR is authorized by this story.
- Focus: signature confusion, key substitution, request/descriptor binding,
  entitlement replay, path traversal, token leakage and fail-open behavior.
- Self-healing: `@dev` light mode, two iterations, CRITICAL only; HIGH findings
  are escalated to `@qa`.

## File List

- [x] `docs/framework/epics/aexos-evolution/STORY-AEX-3.8-SIGNED-PAID-SQUAD-ARTIFACTS.md`
- [x] `.aexos-core/schemas/paid-squad-artifact-v1.schema.json`
- [x] `packages/installer/src/licensing/artifact-trust-store.json`
- [x] `packages/installer/src/licensing/paid-squad-artifact.js`
- [x] `packages/installer/src/wizard/pro-setup.js`
- [x] `pro/artifact-service/README.md`
- [x] `pro/artifact-service/index.js`
- [x] `pro/artifact-service/signed-squad-artifact-service.js`
- [x] `tests/helpers/paid-squad-artifact-fixture.js`
- [x] `tests/unit/licensing/paid-squad-artifact.test.js`
- [x] `tests/unit/licensing/paid-squad-artifact-service.test.js`
- [x] `tests/integration/paid-squad-artifact-http.test.js`
- [x] `tests/installer/pro-setup-signed-artifact.test.js`
- [x] `tests/installer/pro-setup-target-install.test.js`

## SM Validation

- Goal/context: PASS — exact AEX-3.8 Sprint 3 outcome.
- Technical guidance: PASS — extends the current installer and existing
  entitlement boundary without changing AEXOS architecture.
- References/self-containment: PASS.
- Testing guidance: PASS — required negative cases and real local transport
  probe are explicit.
- ClickUp sync: unavailable in this session; this framework story is the
  canonical local record.

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted from the approved AEX-3.8 outcome and current installer gap — Status: Draft | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (9/10) — Status: Draft → Ready | @po / @architect |
| 2026-09-04 | 0.3.0 | Development started (yolo mode) — Status: Ready → InProgress | @dev |
| 2026-09-04 | 1.0.0 | Signed artifact descriptor, private authorization service, installer integration and adversarial coverage completed — Status: InProgress → InReview | @dev |
| 2026-09-04 | 1.0.1 | QA Gate PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Debug Log References

- Focused signed-artifact regression: 5 suites, 95 tests passed.
- Critical-module coverage: 4 suites, 87 tests passed; 100% lines, 99.5%
  statements, 96.43% branches and 95.74% functions.
- Repository regression: 419 suites and 10,206 tests passed; 12 suites and 163
  tests explicitly skipped.
- `npm run lint`, explicit `eslint --no-ignore` for `pro/artifact-service/`,
  `npm run typecheck`, `npm run validate:core-package` and `npm audit --json`
  passed. Audit result: zero known vulnerabilities across 679 dependencies.
- Core package boundary: 1,868 files, only the public `security` squad and 12
  canonical agents.
- CodeRabbit command attempted exactly through WSL; unavailable because the
  installed WSL environment could not launch `/bin/sh`/`bash`. Manual review
  and the adversarial test suite are the recorded fallback, not a CodeRabbit
  pass.

### Completion Notes

- Added a strict versioned Ed25519-signed descriptor and pinned public-key
  verifier. Unknown fields, algorithms, signing keys and invalid request
  bindings fail closed before download or write.
- Added a private, registry-backed artifact service that authenticates the
  caller, revalidates a signed current entitlement, checks machine/seat/scope,
  prevents path and symlink escape, validates artifact integrity and emits
  secret-safe audit decisions.
- Integrated descriptor verification into the existing Pro installer. Bearer
  credentials are sent only to the License Authority endpoint and never to the
  artifact origin.
- Added a real local HTTP adapter/probe plus adversarial unit/integration tests
  for authorization, signature/key substitution, replay/freshness, traversal,
  registry drift and payload tampering.
- Production remains deliberately fail closed: the versioned public trust store
  contains no release key, the private artifact service is not deployed, and
  the prior temporary License Authority checkout is absent on this host. Key
  ceremony, durable private origin and provider integration are release work,
  not claims of this repository-only story.

## QA Results

### Review Date: 2026-09-04

### Reviewed By: Argus (Test Architect)

### Reviewed Revision

`working-tree-sha256:62efb10202131de6abab07dbd639357dd06b9ad0547441ea3a630e9112573d75`

### Code Quality Assessment

The implementation extends the existing Pro acquisition path with a strict
Ed25519 root of trust and keeps private signing/distribution code outside Core
Free. Authentication, current remote entitlement, machine/seat/scope, release,
registry, path, descriptor and payload boundaries fail closed. No production
credential or paid artifact is present in the reviewed files.

### Requirements Traceability

- AC1/AC4: strict descriptor shape, pinned key, request bindings, lifetime,
  signature and payload verification are covered by public verifier unit tests.
- AC2/AC3/AC7: authentication, remote signed entitlement, seat/scope/revocation,
  exact registry, path/symlink confinement, integrity and secret-safe audit are
  covered by private-service unit tests.
- AC5: the existing `InlineLicenseClient` and installer acquisition flow use the
  signed descriptor; tests prove no bearer header is sent to the artifact
  origin and temporary state is removed on failure.
- AC6: forged/substituted keys and entitlements, stale/revoked/wrong bindings,
  traversal, registry drift, tampered payloads and malformed/oversized HTTP
  requests are rejected; the real HTTP round trip passes.
- AC8: focused/full tests, lint, typecheck, build, package boundary, dependency
  audit and diff check passed without release mutations.

### Refactoring Performed

- **Files**: `pro/artifact-service/signed-squad-artifact-service.js`,
  `tests/integration/paid-squad-artifact-http.test.js`
  - **Change**: aligned the private adapter with the existing
    `/api/v1/pro/artifact-url` client route and exercised it through the real
    `InlineLicenseClient`.
  - **Why**: the initial adapter/client route mismatch would have failed at
    integration despite isolated tests passing.
  - **How**: one canonical endpoint is now shared by the client, adapter and
    real HTTP probe. Both files were already present in the Dev File List.

### Compliance Check

- Coding Standards: PASS — CommonJS, explicit validation and fail-closed errors.
- Project Structure: PASS — verifier public; signing service private under
  `pro/`; public package gate excludes `pro/`.
- Testing Strategy: PASS — 95 focused tests and 10,206 repository tests passed;
  critical modules reached 100% line and 96.43% branch coverage.
- All ACs Met: PASS — AC1 through AC8 traced with no gaps.

### Security Review

PASS for the repository scope. Ed25519-only key handling, strict trust-store
selection, exact signed bindings, current entitlement validation, bounded I/O,
redirect rejection, path/symlink confinement and secret-safe audit were
inspected and adversarially exercised. CodeRabbit is unavailable because this
host's WSL cannot launch `bash`; no CodeRabbit pass is claimed.

### Release Boundary

This gate certifies local implementation and tests, not production release.
The public trust store is intentionally empty; the private service is not
deployed; no durable artifact origin or live License Authority wiring was
available on this host. Those conditions keep paid acquisition fail closed
until subsequent DevOps/provider gates provision and certify them.

### Gate Status

Gate: PASS → docs/qa/gates/AEX-3.8-signed-paid-squad-artifacts.yml

### Lifecycle Transition

PASS: InReview → Done.
