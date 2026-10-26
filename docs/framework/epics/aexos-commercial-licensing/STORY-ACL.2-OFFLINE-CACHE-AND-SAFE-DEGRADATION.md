# Story ACL.2: Signed offline cache and non-destructive degradation

| Field | Value |
| --- | --- |
| Story ID | ACL.2 |
| Epic | AEXOS Paid-Only Commercial Licensing |
| Status | InProgress |
| Executor | `@dev` |
| Quality gate | `@architect`, `@qa` |
| Depends on | ACL.1 operator visibility |

## Reopened remediation — 2026-09-07

The owner authorized commercial sale-readiness work. Current architecture review reproduced false authority in `pro/license/license-cache.js`: paid `expiresAt` does not cap cache validity, and `gracePeriodDays || 7` replaces an explicit zero grace policy. The CLI's `.aexos-core/cli/commands/pro/index.js` validation path also returns on a remote `valid: false` without clearing cached authority or reporting a nonzero exit. These findings reopen the original state/transport criteria below; previous local test totals are historical and do not prove the current paths correct.

[AUTO-DECISION] Reuse ACL.2 → these are corrections to its existing deterministic expiry, denial and cache requirements. Preserve its original acceptance wording, free-core behavior, signed-entitlement authority and external key-ceremony prerequisite. The separate private artifact service is ACL.8 scope; no website, terms, plan-price or `legacy`/`enforce` change belongs here.

### Current executable remediation criteria

- [x] R1: Paid entitlement expiry bounds every effective cache/feature decision, including active/offline validity and grace. An already expired paid entitlement cannot become ACTIVE merely because the cache is recent; a refreshed local timestamp cannot extend the issuer's validity period. Offline age uses the latest successfully persisted remote validation timestamp, with the existing activation timestamp only as the documented legacy fallback; reading the cache never refreshes authority. Tests exercise `FeatureGate` and the actual CLI/runtime consumers, not only a cache helper.
- [x] R2: An explicit `gracePeriodDays: 0` remains zero. Apply a fallback only when the policy is absent; malformed present dates, negative or nonfinite durations cannot create authority. Boundary tests distinguish the instant before expiry, exact expiry and after expiry, including paid expiry before offline expiry and clock rollback, while preserving documented nonzero grace behavior within signed/paid validity restrictions.
- [x] R3: A completed remote validation that explicitly denies the license (`valid: false` or an authoritative invalid/revoked/expired result) immediately disables paid capabilities, reloads the feature decision, persists denial across a new process/cache reload, and causes `pro validate` to exit nonzero with recovery guidance. Timeout/5xx/network failure remains distinct: it may use only still-valid cached authority and cannot erase a denial or extend expiry/grace. A successful validated response preserves cache policy fields omitted by the server rather than replacing them with broader defaults; clear a persisted denial only after real authorized reactivation. Recovery-safe commands and all user-owned files remain available/intact.
- [x] R4: The canonical signed entitlement decision is authoritative wherever this correction changes cached paid-feature admission; no unsigned cache fields, local timestamps, CLI success messages or test-only production keys may override it. If real signing configuration is unavailable, report that prerequisite and retain fail-closed production behavior instead of claiming signed production acceptance.
- [x] R5: Add focused regressions covering expired/recent cache, zero/absent/nonzero grace, remote denial followed by restart, transport failure and recovery-safe commands. Record exact reproduced-before/corrected-after results and run lint, typecheck, tests and build, followed by independent @qa/@architect review. No deployment, live payment, signing-key ceremony, release or enforcement promotion is part of this local correction.

### Current remediation tasks and ownership

- [x] Reopen the story using reproduced architecture findings; validate this bounded draft.
- [x] Assigned @dev reproduces and fixes cache expiry and grace policy at the existing authority boundary (R1, R2, R4).
- [x] Assigned @dev corrects explicit denial, feature invalidation, persisted recovery state and CLI exit behavior (R3, R4).
- [x] Assigned @dev/@qa adds meaningful consumer/restart regressions and final evidence (R5).
- [ ] Independent @architect/@qa verifies no false authority remains in the corrected paths before marking the remediation accepted.

Lead assigns one writer across `pro/license/license-cache.js`, `pro/license/feature-gate.js`, `pro/license/entitlement-resolver.js` and `.aexos-core/cli/commands/pro/index.js` where necessary, with related `tests/license/` and CLI regressions. Preserve concurrent work; no broad licensing rewrite is implied. The License Authority lives at `C:/AEXOS-license-server`; historical `C:/tmp/aexos-license-server` references elsewhere in the epic are not a current checkout instruction.

### Remediation draft validation

READY for implementation, not acceptance. Goal/context PASS; technical guidance PASS; references/self-containment PASS; testing PASS; CodeRabbit PASS under the existing enabled review policy. All applicable items of `.aexos-core/product/checklists/story-draft-checklist.md` were reviewed. Database/deployment changes are not required by this correction. Cross-story coherence follows [the architecture authority boundaries](./ARCHITECTURE.md#authority-boundaries), [the runtime state machine](./ARCHITECTURE.md#runtime-state-machine) and [accumulated context](../aexos-evolution/accumulated-context.md#2026-09-06-audit-and-experience-remediation). No new product decision blocks these reproduced defect fixes.

### Current remediation evidence and file list

Pending implementation. This reopening changes only `docs/framework/epics/aexos-commercial-licensing/STORY-ACL.2-OFFLINE-CACHE-AND-SAFE-DEGRADATION.md`. The implementer must append actual changed files, command receipts and remaining limitations. Earlier checked items and test totals below remain historical except the specifically reopened criteria.

## Story

As a licensed practitioner, I want bounded offline continuity and explicit,
non-destructive recovery states, so that service or network failures never lose
my project data or silently create license authority.

## Acceptance criteria

- [ ] The License Authority returns a strict, versioned, asymmetrically signed
      entitlement envelope and the client contains verification keys only.
- [x] Cache writes are atomic/crash-safe, machine-bound and reject tamper,
      unknown schema/algorithm, key substitution, downgrade and cloning.
- [ ] Offline-valid, grace, expired, revoked, clock-rollback, transport-error and
      invalid-entitlement states are deterministic and user-visible.
- [ ] Network/server failure uses only a still-valid signed cache and never
      converts denial or expiry into authority.
- [x] Recovery commands, version/license-safe doctor, user-data export,
      uninstall and support/terms remain available in every state.
- [x] Expiry/revocation never deletes, encrypts, corrupts or blocks export of
      user-owned files.
- [x] Activation/deactivation and pending offline deactivation are idempotent.
- [x] Deterministic test keys are rejected by production builds.

## Tasks / subtasks

- [ ] Implement canonical entitlement envelope and signing/verification. (AC: 1, 2, 8)
- [x] Replace licensing cache and degradation scaffolds with production code. (AC: 2-7)
- [x] Place entitlement resolution at the canonical CLI/runtime boundary. (AC: 3-6)
- [x] Add tamper, clock, clone, crash, offline and recovery fixtures. (AC: 2-8)

## Dev notes

- Minimum envelope fields and fail-closed unknown fields are specified by the
  canonical contract. `[Source: ARCHITECTURE.md#canonical-entitlement-envelope]`
- Runtime states and transport-versus-denial behavior are canonical.
  `[Source: ARCHITECTURE.md#runtime-state-machine]`
- Recovery commands must remain available without active entitlement.
  `[Source: ARCHITECTURE.md#enforcement-placement]`
- Test-only signing keys must be rejected by production.
  `[Source: ARCHITECTURE.md#internal-development-and-ci]`

## CodeRabbit integration

- Primary type: Security; secondary: Architecture, Integration; complexity: High.
- Focus: Ed25519 verification, atomic files, clock rollback, secret handling,
  fail-closed states and data preservation.
- Self-healing: `@dev` light mode, two iterations, CRITICAL only.

## File list

- [x] `pro/license/license-cache.js`
- [x] `pro/license/license-crypto.js`
- [x] `pro/license/degradation.js`
- [x] `pro/license/entitlement-resolver.js`
- [x] `pro/license/feature-gate.js`
- [x] `pro/license/license-api.js`
- [x] `pro/license/machine-id-store.js`
- [x] `packages/installer/src/wizard/pro-setup.js`
- [x] `tests/license/`

## Dev Agent Record

### 2026-09-08 correction acceptance

R1-R5 local correction complete. Paid expiry now caps cache/feature decisions;
zero grace remains zero; malformed present time policy denies. Explicit remote
denial persists and exits 1, with a fresh-process regression. Network failure
does not erase denial. A fresh positive authoritative remote validation counts
as authorized recovery under R3; signed records require a fresh verified signed
envelope and cannot downgrade through validate or activate. Historical unsigned
legacy mode remains compatible and is not claimed to be signed production authority.

Before/after: expired paid cache `Active/allowed` -> `Expired/denied`;
zero grace `7/Grace/allowed` -> `0/Expired/denied`; remote denial
`exit 0/Active` -> `exit 1/Revoked` after process restart.

Changed files: `pro/license/license-cache.js`, `pro/license/feature-gate.js`,
`pro/license/entitlement-resolver.js`, `pro/license/license-api.js`,
`.aexos-core/cli/commands/pro/index.js`, `tests/license/acl2-cache-regression.test.js`.
Focused private suite: 225 passed across 8 suites. Root aggregate: 10,524 passed,
163 skipped, 0 failed; lint/build/typecheck and Core package boundary exit 0.
Production dependency audit: zero reported vulnerabilities. Exact commands,
receipts and independent review: `artifacts/commercial-readiness-20260908/`.

Remaining: real signed issuer/key provisioning is still open. If filesystem
permissions prevent both denial-record update and cache deletion, the running
process denies and exits nonzero; restart persistence requires repairing those
permissions. No project files are removed and no enforcement mode is promoted.

- Implemented Ed25519 schema v1, machine binding, strict unknown-field/key/
  algorithm rejection, AES-256-GCM cache, HMAC, atomic writes, native machine
  identity, bounded legacy migration and deterministic resolver states.
- 327 focused licensing tests and 40 installer/rollout tests pass. The full AEXOS
  suite passes 9,917 tests with 163 pre-existing skips.
- Remaining blocker for AC1: a real Preview/Production public verification key
  must be committed after the private-key ceremony. Only the deterministic
  test key exists today and production rejects it fail-closed.
