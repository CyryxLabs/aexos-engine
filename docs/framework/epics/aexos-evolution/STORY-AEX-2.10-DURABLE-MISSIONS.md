# STORY-AEX-2.10 — Durable Missions and Checkpoints

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Status:** Done  
**Executor:** `@dev`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Depends on:** AEX-1.1, AEX-1.4, AEX-2.6 and AEX-2.9 (`Done`)

## Story

As an AEXOS operator, I want mission progress and evidence to survive process
failure so that a governed Cerberus mission can resume without replaying
completed work, changing its plan or duplicating an uncertain external side
effect.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | A strict `aexos.mission/v1` plan requires a safe mission identity, project, active story reference and ordered steps; every step contains one immutable `aexos.cerberus/v1` request and unique idempotency identity. |
| AC2 | Mission state is stored below an explicit project/state root using atomic replace, bounded JSON, a plan hash and an integrity hash; malformed, oversized, path-traversing, tampered or plan-drifted state fails closed with stable `MISSION_*` errors. |
| AC3 | Every state transition appends a sequence-checked SHA-256 evidence chain with timestamp and sanitized payload; raw documents, prompts, worker output, capability tokens and idempotency keys are never persisted. |
| AC4 | A single-owner lock prevents concurrent run/resume. A lock from a dead local process can be reclaimed with evidence; an active or unverifiable owner blocks execution. |
| AC5 | Completed steps are never dispatched again. Failed steps may retry; a step found `running` after restart is replayed only with the exact original request and idempotency identity, and its recovery is recorded before dispatch. |
| AC6 | The durable runner checkpoints `running`, `failed`, `completed` and terminal mission state around an injected executor; a checkpoint write failure never fabricates success and leaves recoverable evidence from the preceding durable transition. |
| AC7 | `aexos cerberus mission run|resume|status` operates through the AEX-2.9 gateway, issues fresh process-local capability leases after restart, uses an explicit worker path and returns stable exit codes without installing or discovering Cerberus. |
| AC8 | Tests simulate crash-after-side-effect, restart with a fresh process/runtime, deduplicated replay, skipped completed work, plan drift, state tamper, lock contention, failed retry and an end-to-end CLI ingest mission; all repository gates pass. |

## Tasks / Subtasks

- [x] Add and validate the immutable mission plan contract (AC: 1, 5)
- [x] Implement atomic, integrity-bound mission state and evidence chain (AC: 2–3)
- [x] Implement single-owner lock and safe stale-lock recovery (AC: 4)
- [x] Implement deterministic run/resume lifecycle around an injected executor (AC: 5–6)
- [x] Add Cerberus mission CLI using fresh least-privilege leases (AC: 7)
- [x] Add crash, tamper, concurrency, retry and CLI integration tests (AC: 1–8)
- [x] Run focused and repository gates; update story and QA record (AC: 8)

## Dev Notes

- Exactly-once delivery cannot be manufactured locally after an unknown crash.
  The safe boundary is at-least-once replay with the exact stable idempotency key
  and worker-side deduplication; state records only its hash.
- Capability leases are intentionally process-local and are never checkpointed.
  Resume must acquire a new exact lease for the same step and worker.
- The state store persists sanitized receipts and hashes, not knowledge material
  or provider output. Cerberus remains subordinate to AEXOS.
- This story does not change the legacy build/session recovery managers.
- No Git, PR, tag, publish, external scan or Production operation is authorized.

## Testing Requirements

```powershell
npx jest tests/core/execution/durable-mission.test.js tests/integration/cerberus-mission-cli.test.js --runInBand
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
npm audit --json
```

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted from the approved AEX-2.10 Sprint 2 outcome | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (8/8); idempotent replay and fail-closed recovery boundaries accepted | @po / @architect |
| 2026-09-04 | 0.3.0 | Development started — Status: Ready → InProgress | @dev |
| 2026-09-04 | 1.0.0 | Durable store, runner and Cerberus mission CLI completed — Status: InProgress → InReview | @dev |
| 2026-09-04 | 1.0.1 | Independent QA PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Debug Log References

- Focused durable mission/CLI gate: 2 suites, 11 tests passed.
- Fresh-process crash/restart probe exited at the injected crash boundary, reclaimed its dead lock and resumed to completion with one logical side effect.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Full regression: 414 suites / 10,112 tests passed; 12 suites / 163 tests skipped; exit 0.
- `npm run build`: publish safety gate passed with 3,629 packaged files and no paid `pro/` content.
- `npm audit --json`: zero known vulnerabilities across 679 dependencies.
- CLI help probe passed for `cerberus mission run`.
- `git diff --check`: passed.

### Completion Notes

- Added a strict story-bound mission plan containing immutable, unique Cerberus request and idempotency identities.
- Added immutable atomically published checkpoints with size bounds, plan/state hashes and a sequence-checked evidence hash chain.
- Added a single-owner process lock that blocks live contention and records recovery when reclaiming a dead owner.
- Added deterministic run/resume semantics: completed steps are skipped; failed and uncertain-running steps replay only with the exact original identity.
- Kept all capability leases process-local; each resumed Cerberus dispatch obtains a fresh exact `cerberus.knowledge` lease through the AEX-2.9 gateway.
- Added `aexos cerberus mission run|resume|status` and proved ingest, failure, tamper, drift, oversize, contention and actual cross-process crash recovery.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-2.10-DURABLE-MISSIONS.md` (added)
- `.aexos-core/schemas/mission-v1.schema.json` (added)
- `.aexos-core/core/execution/durable-mission.js` (added)
- `.aexos-core/cli/commands/cerberus/index.js` (modified)
- `tests/core/execution/durable-mission.test.js` (added)
- `tests/integration/cerberus-mission-cli.test.js` (added)
- `tests/fixtures/durable-mission-process.js` (added)
- `tests/fixtures/cerberus-mission.json` (added)

## QA Results

### Gate

**PASS** — AC1–AC8 are covered by contract, persistence, lock, lifecycle,
cross-process recovery, Cerberus CLI and full repository regression evidence.
See `docs/qa/gates/AEX-2.10-durable-missions.yml`.

### Residual risk

At-least-once replay is intentionally used for a step left `running` by a crash;
non-duplication therefore depends on the external worker honoring the stable
idempotency identity. The local SHA-256 integrity chain detects corruption and
uncoordinated state changes but is not a trust boundary against an administrator
who can rewrite both state and hashes. Production worker and CKP.3 native
extraction/storage certification remain separate release work.
