# STORY-AEX-1.4 — Governance on the Hot Path

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Architecture:** [Wave 1 — AEX-1.4](./ARCHITECTURE-WAVE-1.md#aex-14--governance-on-the-hot-path)  
**Decision:** [ADR-AEX-003](./adr/ADR-AEX-003-GOVERNANCE-HOT-PATH.md)  
**Status:** Done  
**Executor:** `@dev`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Depends on:** AEX-1.1, AEX-1.2 and AEX-1.3 (`Done`)

## Executor Assignment

```yaml
executor: '@dev'
quality_gate: '@architect'
quality_gate_tools:
  - focused-jest
  - architecture-contract-review
final_qa: '@qa'
```

## Story

As the AEXOS execution boundary, I want every automated model dispatch to carry
a short-lived authorization bound to its exact intent, story and budget so that
governance cannot be bypassed or invalidated by changing the request after
approval.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | `dispatch-governance` exposes one evaluator that runs the existing budget, story-binding and intent-scan controls and, on approval, issues a short-lived signed token. Rejections expose stable codes and issue no token. |
| AC2 | The token is bound to the exact dispatch identity: agent, task, intent bytes, story binding, budget ceiling and budget scope. The runtime verifies signature, expiry and current request hash immediately before the provider call. |
| AC3 | Missing, malformed, tampered, expired, replayed or request-mismatched tokens fail closed with stable `DISPATCH_TOKEN_*` codes, and the provider call count remains zero. Token payloads contain no prompt, context, secret or raw story path. |
| AC4 | Budget state is cached in process by explicit scope (or deterministic project/story fallback), tracks committed and reserved USD, rejects dispatch at or above 100% of the ceiling, and reports pressure without changing model-routing policy. Optional persistence is scheduled/batched; evaluation performs no per-call filesystem I/O. |
| AC5 | `AgentRuntime.execute()` always evaluates and verifies through this boundary before provider execution, records sanitized approvals and rejections, settles known provider cost into the budget cache, and preserves AEX-1.2 result/output validation. |
| AC6 | A legacy injected governance function remains supported only as a policy adapter inside the token-issuing evaluator. It cannot bypass token issuance or verification and is marked observable as a compatibility capability. |
| AC7 | `aexos sdc preflight` and `core/sdc/dispatch-adapter` use the same evaluator API rather than a parallel governance implementation. Preflight retains exit `0` for approval and `5` for rejection and does not print a bearer token in normal or JSON output. |
| AC8 | Approval and rejection records include intent hash, agent/task, story id when resolved, budget ceiling/pressure, decision timestamp and stable code where applicable; they exclude raw prompt/context and signing material. |
| AC9 | Deterministic tests use injected clocks/secrets and prove approval order, prompt mutation, token tamper/expiry/replay, story/injection rejection, concurrent budget reservation, hard stop, settlement, sanitized evidence and preserved CLI exit semantics. |
| AC10 | Focused tests plus repository lint, typecheck, test, build and dependency audit pass. No routing threshold, provider choice, hook authority, remote operation or release mode changes in this story. |

## Tasks / Subtasks

- [x] Build the token-issuing governance evaluator (AC: 1–4, 8)
  - [x] Define deterministic dispatch hashing and signed, expiring token claims without raw intent data.
  - [x] Verify signature, expiry, replay and exact-request binding with stable error codes.
  - [x] Add in-process budget scope state with reservation, settlement, pressure and scheduled optional flush.
  - [x] Preserve the existing `assertDispatchGovernance()` compatibility export.
- [x] Put governance on the runtime hot path (AC: 2, 3, 5, 6, 8)
  - [x] Adapt injected legacy policy functions inside the evaluator.
  - [x] Evaluate then verify before `_executeProvider()` and settle known cost afterward.
  - [x] Record prompt-free decisions and preserve provider/output normalization.
- [x] Unify existing dispatch surfaces (AC: 7)
  - [x] Make SDC preflight call the evaluator and redact its token from output.
  - [x] Make the SDC dispatch adapter pass the exact approved payload through the same evaluator.
  - [x] Preserve preflight exit-code and literal-payload behavior.
- [x] Add focused security, budget and integration tests (AC: 1–10)
  - [x] Cover token tamper, expiry, replay and post-approval mutation before provider execution.
  - [x] Cover concurrent reservations, pressure, settlement and 100% hard stop.
  - [x] Cover sanitized approval/rejection evidence and legacy policy adaptation.
  - [x] Cover CLI preflight success/rejection and token redaction.
- [x] Run focused and repository quality gates; update this checklist and Dev Agent Record (AC: 10)

## Dev Notes

### Existing assets to extend

- `.aexos-core/core/permissions/dispatch-governance.js` already owns the
  constitutional budget, story and intent checks. Extend this module; do not
  create a competing permissions layer.
- `.aexos-core/core/execution/agent-runtime.js` already invokes governance
  before its provider and records prompt-free evidence, but does not yet issue
  or verify a request-bound token.
- `.aexos-core/cli/commands/sdc/index.js` preserves the public preflight exit
  contract. Its output is evidence, not a bearer-token transport.
- `.aexos-core/core/sdc/dispatch-adapter.js` currently calls
  `assertDispatchGovernance()` directly before invoking its worker.

### Design constraints

- Use Node.js `crypto` primitives already in the runtime; add no dependency.
- Tokens are process-local authorization artifacts, not license keys, API keys
  or long-lived credentials. They must not be persisted or logged.
- Use HMAC verification with constant-time signature comparison and an injected
  signing secret for deterministic tests. Production default may use
  process-local cryptographic randomness.
- Token TTL must be positive and bounded. A consumed token is single-use.
- A budget reservation is optional only when no cost estimate exists. Known
  provider cost must be settled. Reaching 100% blocks the next dispatch with a
  human-escalation diagnostic; this story does not choose a cheaper model.
- Persistence, when supplied, is an injected sink called by a scheduled flush;
  no token evaluation may read or write the filesystem.
- The canonical request bytes must not be enriched between evaluation and
  provider execution. Exact hashes, not prompt text, enter receipts.
- This story performs no Git commit, push, PR, tag, npm publish or production
  promotion.

## CodeRabbit Integration

- Primary review: security and architecture.
- `@dev` light self-review, maximum two fix iterations for CRITICAL findings.
- `@architect` verifies the hot-path boundary, token lifecycle and lack of a
  parallel governance implementation.
- `@qa` performs independent acceptance trace and full regression.
- If CodeRabbit CLI is unavailable, focused security tests and repository gates
  remain the operative review path.

## Testing Requirements

```powershell
npx jest tests/unit/dispatch-governance.test.js tests/core/execution/agent-runtime.test.js tests/unit/sdc/dispatch-adapter.test.js tests/integration/core-super-update-cli.test.js --runInBand
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
npm audit --json
```

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted from ADR-AEX-003 and the approved Release 6.0 program | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (10/10) — Status: Draft → Ready | @po |
| 2026-09-04 | 0.3.0 | Development started in autonomous mode — Status: Ready → InProgress | @dev |
| 2026-09-04 | 1.0.0 | Governance hot path implemented and gates passed — Status: InProgress → InReview | @dev |
| 2026-09-04 | 1.0.1 | Independent QA PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Debug Log References

- Focused governance/runtime/SDC/wave/public API gate: 9 suites, 149 tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Full regression: 400 suites / 9,954 tests passed; 12 suites / 163 tests skipped; exit 0.
- `npm run build`: publish safety gate passed with 3,547 packaged files and no paid `pro/` content.
- `npm audit --json`: zero known vulnerabilities across 679 dependencies.
- CodeRabbit CLI: unavailable; deterministic security tests and repository gates used per the story fallback.

### Completion Notes

- Added HMAC-signed, short-lived and single-use dispatch authorization bound to the exact request hash.
- Added process-local budget scopes with concurrent reservation, settlement, pressure, hard stop and optional scheduled persistence.
- `AgentRuntime` now evaluates and verifies immediately before provider execution, sanitizes evidence and releases reservations on evidence-sink failure.
- Legacy governance and executor callbacks remain observable compatibility adapters but no longer bypass token issuance or verification.
- SDC preflight and dispatch adapter now reuse the canonical evaluator and never expose the bearer token.
- Decision-sink, token, story, injection and budget failures are fail-closed with stable codes and no provider call.

### File List

- `.aexos-core/core/permissions/dispatch-governance.js` (modified)
- `.aexos-core/core/permissions/index.js` (modified)
- `.aexos-core/core/execution/agent-runtime.js` (modified)
- `.aexos-core/core/execution/wave-executor.js` (modified)
- `.aexos-core/core/orchestration/workflow-orchestrator.js` (modified)
- `.aexos-core/core/sdc/dispatch-adapter.js` (modified)
- `.aexos-core/cli/commands/sdc/index.js` (modified)
- `tests/unit/dispatch-governance.test.js` (modified)
- `tests/core/execution/agent-runtime.test.js` (modified)
- `tests/unit/sdc/dispatch-adapter.test.js` (modified)
- `tests/integration/core-super-update-cli.test.js` (modified)
- `tests/core/execution/governed-wave-executor.test.js` (modified)
- `tests/core/execution/wave-executor.test.js` (modified)
- `tests/core/wave-executor.test.js` (modified)
- `tests/core/orchestration/workflow-orchestrator-profile-propagation.test.js` (modified)
- `docs/framework/epics/aexos-evolution/STORY-AEX-1.4-GOVERNANCE-HOT-PATH.md` (added)

## QA Results

### Gate

**PASS** — AC1–AC10 are covered by focused security/runtime/CLI tests and the
full repository regression. See
`docs/qa/gates/AEX-1.4-governance-hot-path.yml`.

### Residual risk

The historical `SubagentDispatcher` still contains direct provider/Claude CLI
backends outside `AgentRuntime`. It is not a runtime-dispatch path covered by
this story, but must be migrated or retired before stable 6.0 can claim one
universal execution boundary. Compatibility adapters in `AgentRuntime` and the
wave executor remain explicit, deprecated and observable for the alpha window.
