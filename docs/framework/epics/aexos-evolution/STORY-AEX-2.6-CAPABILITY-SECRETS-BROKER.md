# STORY-AEX-2.6 — Capability and Secrets Broker

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Decision:** [ADR-AEX-012](./adr/ADR-AEX-012-CAPABILITY-LEASE-BROKER.md)  
**Status:** Done  
**Executor:** `@dev`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Depends on:** AEX-1.2 and AEX-1.4 (`Done`)

## Story

As the AEXOS execution boundary, I want agents to receive explicit, expiring
and revocable capability leases so that external tools and secrets are usable
without ambient authority or credential exposure.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | `core/permissions` exposes one deny-by-default broker with an injected authorization policy; no policy or a denial produces a stable `CAPABILITY_DENIED` error and no lease. |
| AC2 | Approved leases are HMAC-signed, short-lived and bound to exact agent, task, capability, normalized allowed actions, resource hash and scope hash; payload and evidence contain no raw resource, secret or policy material. |
| AC3 | Missing, malformed, tampered, expired, revoked, identity-mismatched or action-denied use fails closed with stable `CAPABILITY_*` codes before the protected operation executes. |
| AC4 | A lease can be inspected without its bearer token, listed as sanitized metadata and revoked immediately by token or lease id; every grant, rejection, use and revocation has prompt-free, secret-free audit evidence. |
| AC5 | An injected secret resolver is called only after lease verification for `secret:read`; the secret exists only inside the supplied callback and is never persisted or emitted by the broker. Missing resolver/ref and direct secret return fail closed. |
| AC6 | `AgentRuntime.execute()` verifies every declared `requiredCapabilities` lease after dispatch governance and before provider execution. Missing broker or invalid lease leaves provider call count zero; result evidence exposes sanitized capability metadata only. |
| AC7 | Deterministic tests use injected secrets, clocks and nonces to prove least privilege, action scope, expiry, revocation, tamper, identity/resource mutation, secret non-disclosure and runtime ordering. |
| AC8 | Focused tests plus repository lint, typecheck, test, build and dependency audit pass; this story adds no ambient credential reader, tool implementation, remote authority, provider choice or release operation. |

## Tasks / Subtasks

- [x] Implement the process-local capability lease broker (AC: 1–4)
  - [x] Validate and normalize exact lease identities and allowed actions.
  - [x] Sign, authenticate, expire, inspect, list and revoke leases.
  - [x] Emit sanitized audit records and fail closed on audit sink failure.
- [x] Add the just-in-time secret-use boundary (AC: 3–5)
  - [x] Require a verified `secret:read` action and injected resolver.
  - [x] Keep raw resource identifiers and secret values out of tokens and evidence.
  - [x] Block direct return of the resolved secret from the callback.
- [x] Integrate capability verification into `AgentRuntime` (AC: 6)
  - [x] Verify all requirements before provider execution.
  - [x] Pass only sanitized capability metadata into runtime evidence.
  - [x] Preserve existing governance, output validation and compatibility adapters.
- [x] Add deterministic unit and runtime tests (AC: 1–8)
- [x] Run focused and repository quality gates; update this story and QA record (AC: 8)

## Dev Notes

- Extend `core/permissions`; do not create a second authority subsystem.
- Leases are process-local authorization artifacts, not license keys or provider
  credentials. Restart invalidation is intentional in this story.
- The policy sees raw request identifiers so it can decide; signed claims and
  evidence retain only resource/scope hashes.
- The default TTL is one minute and the hard maximum is five minutes.
- Secret resolvers are injected functions. The broker must never read process
  environment variables, files, keychains or remote stores by itself.
- No CLI tool is exposed by this infrastructure-only story. The first concrete
  capabilities become CLI-operable through their owning stories, beginning
  with the Cerberus gateway.
- This story performs no Git commit, push, PR, tag, npm publish or deployment.

## Testing Requirements

```powershell
npx jest tests/unit/capability-broker.test.js tests/core/execution/agent-runtime-capabilities.test.js --runInBand
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
npm audit --json
```

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted from the approved Sprint 2 outcome and ADR-AEX-012 | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (8/8); deny-by-default and process-local boundary accepted | @po / @architect |
| 2026-09-04 | 0.3.0 | Development started in autonomous mode — Status: Ready → InProgress | @dev |
| 2026-09-04 | 1.0.0 | Broker, secret boundary and runtime integration completed — Status: InProgress → InReview | @dev |
| 2026-09-04 | 1.0.1 | Independent QA PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Debug Log References

- Focused broker/governance/runtime gate: 4 suites, 39 tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Full regression: 402 suites / 9,970 tests passed; 12 suites / 163 tests skipped; exit 0.
- `npm run build`: publish safety gate passed with 3,550 packaged files and no paid `pro/` content.
- `npm audit --json`: zero known vulnerabilities across 679 dependencies.
- CodeRabbit CLI: unavailable; deterministic security tests and repository gates used per the story fallback.

### Completion Notes

- Added a deny-by-default process-local broker with HMAC-signed, expiring and immediately revocable capability leases.
- Bound grants to exact agent, task, capability, normalized actions, resource hash and scope hash; no raw resource enters claims or audit evidence.
- Added just-in-time secret resolution behind `secret:read`, normalized resolver/operation failures and direct-return exfiltration blocking.
- Integrated required capability verification after dispatch governance and before provider execution; provider adapters receive sanitized lease metadata only.
- Added deterministic coverage for policy denial, TTL narrowing, tamper, expiry, revocation, identity/action mismatch, audit failure and secret non-disclosure.

### File List

- `docs/framework/epics/aexos-evolution/adr/ADR-AEX-012-CAPABILITY-LEASE-BROKER.md` (added)
- `docs/framework/epics/aexos-evolution/STORY-AEX-2.6-CAPABILITY-SECRETS-BROKER.md` (added)
- `.aexos-core/core/permissions/capability-broker.js` (added)
- `.aexos-core/core/permissions/dispatch-governance.js` (modified)
- `.aexos-core/core/permissions/index.js` (modified)
- `.aexos-core/core/execution/agent-runtime.js` (modified)
- `tests/unit/capability-broker.test.js` (added)
- `tests/core/execution/agent-runtime-capabilities.test.js` (added)

## QA Results

### Gate

**PASS** — AC1–AC8 are covered by focused broker/runtime tests and full
repository regression. See
`docs/qa/gates/AEX-2.6-capability-secrets-broker.yml`.

### Residual risk

Lease authority is intentionally process-local. Restart invalidates all leases,
and revocation is not distributed across hosts. No current evidence supports a
claim of durable or multi-host capability continuity; that requires a future
authenticated authority and failure certification.
