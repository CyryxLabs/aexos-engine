# Story AEX-4.5: Fail-closed execution integrity

## Status

Ready for Review — implementation, installed-artifact checks and local quality gates complete; acceptance boundaries documented.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [jest, negative-execution-regression, lint, typecheck, build]

## Story

**As an** AEXOS operator, **I want** failed, unavailable and simulated execution distinguished from accepted real execution, **so that** the orchestrator cannot show green completion when no successful work occurred.

## Context and dependencies

The current audit identified a master-orchestrator path that marks completion before interpreting failure, an AgentInvoker simulated-success default, and a StubEpicExecutor no-op. These are architect-reported findings requiring focused reproduction before modification, not evidence that all execution is broken. This story addresses the user's comprehensive false-green audit request beneath the existing Master; no second orchestrator is introduced. Read [accumulated-context.md](./accumulated-context.md#2026-09-06-audit-and-experience-remediation). AEX-4.4 must consume the resulting truthful lifecycle state.

## Acceptance Criteria

- [x] AC1: Reproduce the reported failed-result path and identify exact MasterOrchestrator, AgentInvoker and StubEpicExecutor sources/callers before editing; retain focused pre-fix regression evidence.
- [x] AC2: A resolved execution result with `success: false`, thrown/rejected execution, or required gate rejection never produces a successful return or COMPLETED/accepted terminal status. Failure cause propagates to callers and event consumers, and success is recorded only after required execution/gates succeed.
- [x] AC3: Missing/unavailable real executor adapters fail closed or return an explicit unsupported/not-executed result. Default invocation cannot silently substitute simulated success. Simulation remains explicitly selected and marked simulated in returned evidence and status wherever supported.
- [x] AC4: A stub/no-op epic executor cannot certify actual epic execution, completed story work or artifact acceptance. Preserve legitimate explicitly requested planning/dry-run use with an unmistakable non-execution result.
- [x] AC5: Add negative regression tests for false results, thrown errors, rejected required gates, missing adapters and stub execution, plus positive real-adapter success and explicitly labeled simulation/dry-run. Assert returned success, lifecycle/event state and gate invocation where applicable.
- [x] AC6: Preserve budget, permission, task/story binding and cost-settlement behavior. Do not invent contracts for legacy tasks or convert structural contract coverage into proof of competence.
- [x] AC7: Run lint, typecheck, full tests and build; update file list and evidence. Clearly record any incompatible legacy callers or remaining unsupported adapters rather than hiding them through successful fallback.

## Tasks / Subtasks

- [x] Locate the architect-reported classes and reproduce exact callers (AC1).
- [x] Repair result/gate ordering and terminal state propagation (AC2).
- [x] Remove implicit simulated/stub success while retaining explicit dry-run semantics (AC3-4).
- [x] Add negative and positive behavior tests, checking governance compatibility (AC5-6).
- [x] Run repository gates and document changed files, receipts and remaining gaps (AC7).

## Dev Notes

Start with the existing `master-orchestrator.js`, `AgentInvoker` and `StubEpicExecutor` implementations identified by architect audit; use repository symbol discovery to resolve exact paths before modification. The known Master finding is near line 594, but line numbers may drift during concurrent work. Coordinate any events changes with AEX-4.4.

[Source: .aexos-core/constitution.md#i-cli-first-non-negotiable] preserves CLI/Master authority. [Source: STORY-AEX-4.1-UPSTREAM-EVIDENCE-ABSORPTION.md#design] distinguishes required acceptance from legacy migration and structural evidence from operational proof. [Source: docs/framework/coding-standards.md#testing-standards] supplies Jest conventions. This story introduces no database, provider API, new environment variable or dependency. Architecture audit details will be attached by the lead when available; the negative behavior contract above is sufficient to begin reproduction.

## Testing

Use focused unit/integration tests around real existing dispatch seams. A mocked failing adapter is appropriate to test error propagation but cannot establish native provider acceptance. Verify failure output and emitted status together, including gate rejection and simulation labeling. Keep existing unrelated dirty changes intact.

## CodeRabbit Integration

Story Type Analysis: Integration / Architecture, high complexity. Specialized Agents: @dev primary, @architect contract review, @qa independent acceptance. Quality Gate Tasks: pre-commit @dev required; pre-PR @devops if requested; pre-deployment N/A. Self-Healing: @dev light, 2 iterations / 15 minutes, CRITICAL auto-fix and HIGH documented; @qa full, 3 iterations / 30 minutes, CRITICAL/HIGH correction. Focus Areas: false-positive completion, async result ordering, required gate enforcement, compatibility and simulated fallback. Record unavailable CodeRabbit explicitly rather than claiming a pass.

## Story Draft Checklist

READY, clarity 9/10. Goal/context PASS; technical guidance PASS; reference effectiveness PASS; self-containment PASS; testing PASS; CodeRabbit PASS. All applicable items reviewed against `.aexos-core/product/checklists/story-draft-checklist.md`; deployment/environment-variable items N/A. Exact class paths and pre-fix behavior are deliberately AC1 verification work, with known symbols and a reported failure location supplied.

## Change Log

2026-09-06 — v1 — Chronos: added architect-reported execution false-green remediation.

## Dev Agent Record

Implemented fail-closed result/gate ordering, explicit simulation, unavailable adapter failures and placeholder epic failures. Lead additionally authorized OperationGuard classification correction. Reproduction and IDS/self-critique receipts: `artifacts/audit-20260906/execution-implementation.md`; 311 focused tests / 8 suites passed; final lint and typecheck exit 0. Native executor competence and whole-project release readiness are not established.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.5-FAIL-CLOSED-EXECUTION-INTEGRITY.md`

- `.aexos-core/core/orchestration/master-orchestrator.js`
- `.aexos-core/core/orchestration/agent-invoker.js`
- `.aexos-core/core/orchestration/executors/epic-3-executor.js`
- `.aexos-core/core/orchestration/executors/epic-4-executor.js`
- `.aexos-core/core/orchestration/executors/epic-6-executor.js`
- `.aexos-core/core/permissions/operation-guard.js`
- `tests/core/execution-truthfulness.test.js`
- `tests/core/master-orchestrator.test.js`
- `tests/core/agent-invoker.test.js`
- `tests/core/epic-executors.test.js`
- `artifacts/audit-20260906/execution-implementation.md`
- `artifacts/audit-20260906/execution-before.log`
- `artifacts/audit-20260906/operation-guard-before.log`
- `artifacts/audit-20260906/execution-tests.log`
- `artifacts/audit-20260906/execution-lint.log`
- `artifacts/audit-20260906/execution-typecheck.log`

- tests/core/permissions/operation-guard.test.js
- tests/core/permission-mode-integration.test.js
- tests/unit/validate-aexos-core-deps.test.js
- artifacts/audit-20260906/doctor-followup-tests.log

Aggregate follow-up: 114 tests / 3 suites pass; lint/typecheck exit 0.

## QA Results

Pending independent implementation review.

### Independent final acceptance — 2026-09-07

Reviewed by Argus against the working tree based on `958a5aeaba60a2cf4f370bed80f7e95280df6612` and final audit receipts. **APPROVED / PASS for AEX-4.5's local fail-closed execution-integrity scope.** Earlier pending language is superseded by this entry.

AC assessment: AC1 PASS from `execution-implementation.md` and recorded pre-fix reproduction; AC2-5 PASS from reviewed dispatcher/gate ordering and independently repeated failure, explicit nonexecution, simulation and mutating-command probes; AC6 PASS within repository regression coverage for governance compatibility; AC7 PASS from final receipts. `test-results.json` records 10,332 passed tests, zero failed and 163 pending; 430 passed suites, zero failed and 12 pending. Final lint has zero errors and nine warnings; typecheck succeeds; build/publish safety gate passes with 1,894 package files. The later office refinements have a separate 72-test passing receipt.

Review detail and resolved findings: `QA-AUDIT-20260906.md`. CodeRabbit is unavailable, not passed; the story's documented independent-review fallback was used. Missing real epic adapters now fail explicitly. Approval does not certify native executor competence, whole-company orchestration, release readiness, or OS/filesystem sandbox enforcement. OperationGuard classification is not a complete shell parser. No application source was modified by QA, and no story fields outside QA Results were changed.
