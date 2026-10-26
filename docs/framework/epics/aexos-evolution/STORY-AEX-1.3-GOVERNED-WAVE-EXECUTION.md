# STORY-AEX-1.3 — Governed Wave Execution

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Architecture:** [Wave 1 — AEX-1.3](./ARCHITECTURE-WAVE-1.md#aex-13--real-parallelism)  
**Status:** Done  
**Executor:** `@dev`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Depends on:** AEX-1.1 and AEX-1.2 (`Done`)

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

As the AEXOS orchestrator, I want dependency waves to execute through the
governed `AgentRuntime` with bounded concurrency so that independent work can
overlap without allowing undeclared execution, output collisions or false
success.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | `WaveExecutor` consumes the real `WaveAnalyzer.analyzeWaves()` result and resolves its task identifiers to executable task definitions without changing the analyzer's DAG semantics. |
| AC2 | Every non-empty task wave executes through an injected `AgentRuntime`; an explicit legacy `taskExecutor` may be adapted for the migration window, but absence of both fails with `AGENT_RUNTIME_REQUIRED`. The no-op success executor is removed. |
| AC3 | `maxParallel` is a positive integer and demonstrably bounds the number of in-flight runtime calls while preserving result order. |
| AC4 | Tasks with valid, non-overlapping declared `produces` may overlap. A task without a contract is isolated into a serial lane and is never assumed conflict-free. |
| AC5 | Two tasks in the same candidate parallel lane that declare the same normalized output path fail during planning with `WAVE_OUTPUT_CONFLICT`, before any provider call. |
| AC6 | Runtime requests preserve each task's `agentId`, task id, prompt, story, budget, contract, project root and timeout; provider results remain normalized by AEX-1.2. |
| AC7 | A failed task makes the wave unsuccessful; dependent later waves do not execute unless the existing non-critical continuation policy explicitly permits it. Critical failures remain fail-closed. |
| AC8 | Execution events and metrics report observed runtime work; empty workflows may return success, but no non-empty workflow can return success without execution. |
| AC9 | Focused tests prove the concurrency ceiling, measurable overlap, conflict preflight, serial handling of uncontracted tasks, analyzer compatibility, runtime request propagation and missing-runtime failure. Repository quality gates pass. |

## Tasks / Subtasks

- [x] Adapt the existing wave pipeline to the governed runtime (AC: 1, 2, 6, 8)
  - [x] Normalize `analyzeWaves()` output and task lookup from `context.tasks`.
  - [x] Add a runtime worker that calls `AgentRuntime.execute()` with the unchanged task contract and governance fields.
  - [x] Retain only an explicit, observable legacy callback adapter for the migration window.
  - [x] Delete the default no-op success path.
- [x] Add safe lane planning (AC: 3–5)
  - [x] Validate `maxParallel` and use an order-preserving bounded promise pool.
  - [x] Normalize declared output paths through the AEX-1.1 contract boundary.
  - [x] Reject duplicate produced paths before execution.
  - [x] Schedule uncontracted tasks serially.
- [x] Make wave failure and observability truthful (AC: 7–8)
  - [x] Preserve critical/non-critical continuation semantics without executing dependent waves after a blocking failure.
  - [x] Record completed waves and derive metrics only from observed results.
- [x] Add and update focused tests (AC: 1–9)
  - [x] Replace default-executor assertions with missing-runtime rejection assertions.
  - [x] Cover real analyzer shape, conflict preflight, runtime propagation and bounded overlap.
  - [x] Preserve backward-compatibility coverage for the explicit legacy adapter.
- [x] Run focused and repository quality gates; update this checklist and Dev Agent Record (AC: 9)

## Dev Notes

### Existing assets to adapt

- `.aexos-core/workflow-intelligence/engine/wave-analyzer.js` exposes
  `analyzeWaves(workflowId, { customTasks })` and returns task identifiers grouped
  by topological wave. The existing executor incorrectly calls `analyze()`.
  [Source: `ARCHITECTURE-WAVE-1.md#AEX-1.3 — Real parallelism`]
- `.aexos-core/core/execution/wave-executor.js` already owns lifecycle events,
  timeout handling, rate-limit integration and wave metrics, but its missing
  executor fallback currently reports `success: true` without doing work.
  [Source: `ARCHITECTURE-WAVE-1.md#The gap in one diagram`]
- `.aexos-core/core/orchestration/parallel-executor.js` contains an
  order-preserving bounded thunk pool. Reuse its proven scheduling shape rather
  than starting promises before admission.
  [Source: `ARCHITECTURE-WAVE-1.md#AEX-1.3 — Real parallelism`]
- `.aexos-core/core/execution/agent-runtime.js` is the only governed execution
  boundary and normalizes provider results. Do not duplicate governance or
  provider logic inside `WaveExecutor`.
  [Source: `STORY-AEX-1.2-AGENT-RUNTIME.md#Acceptance Criteria`]
- `.aexos-core/core/execution/task-contract.js` is the AEX-1.1 authority for
  contract/path validation. Do not infer file ownership from prose.
  [Source: `ARCHITECTURE-WAVE-1.md#AEX-1.1 — Task I/O contract · keystone`]

### Execution rules

- No new dependency is approved; use ES2022, CommonJS and Node.js primitives.
- Parallelism here means independent tasks/lanes. It is distinct from
  multi-provider execution of one prompt.
- This story performs no Git merge, push, PR, tag or release. Any future lane
  fan-in requiring a Git merge remains under `@devops` authority.
- Worktree provisioning is not allowed to mutate or reset the current dirty
  checkout. This story establishes a lane-context seam (`projectRoot`) that an
  isolation provider can supply; destructive merge automation is out of scope.
- ClickUp synchronization was unavailable during drafting. This framework story
  remains tracked at its canonical repository path.

## 🤖 CodeRabbit Integration

### Story Type Analysis

- **Primary:** Architecture / execution.
- **Secondary:** Security and backward compatibility.
- **Complexity:** High.

### Specialized Agent Assignment

- **Primary:** `@dev` for implementation and focused tests.
- **Architecture gate:** `@architect` for runtime/contract boundary review.
- **Final gate:** `@qa` for independent acceptance and regression review.
- **Remote operations:** `@devops` only if publication is later authorized.

### Quality Gate Tasks

- [x] Pre-completion (`@dev`): focused Jest, lint and typecheck.
- [x] Architecture (`@architect`): confirm reuse of the runtime, analyzer and
      task-contract boundaries without a competing execution path.
- [ ] Final QA (`@qa`): acceptance trace, full regression and package build.
- [ ] Pre-PR (`@devops`): only after explicit remote-operation authorization.

### Self-Healing Configuration

- `@dev` light mode, maximum 2 iterations, CRITICAL findings only.
- HIGH findings are documented for QA; no automated scope expansion.

### Focus Areas

- False-success removal and missing-runtime behavior.
- Admission-before-start concurrency limiting and deterministic result order.
- Declared-output normalization and conflict rejection before provider calls.
- Error containment, timeout behavior and explicit compatibility boundaries.

If CodeRabbit CLI is unavailable, repository tests and manual QA remain the
operative gate under the configured graceful degradation.

## Testing Requirements

```powershell
npx jest tests/core/wave-executor.test.js tests/core/execution/wave-executor.test.js --runInBand
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
```

Required probes:

1. At least four independent tasks with `maxParallel: 2` produce peak concurrency
   of exactly two and lower wall time than serialized execution.
2. Duplicate declared output paths reject before the runtime call count changes.
3. Two uncontracted tasks never overlap.
4. Analyzer output containing task ids resolves against the supplied task corpus.
5. A non-empty execution without runtime or explicit legacy adapter rejects.

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted from approved Release 6.0 program | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (9/10) — Status: Draft → Ready | @po |
| 2026-09-04 | 0.3.0 | Development started (autonomous mode) — Status: Ready → InProgress | @dev |
| 2026-09-04 | 1.0.0 | Governed wave execution implemented and architecture gate passed — Status: InProgress → InReview | @dev / @architect |
| 2026-09-04 | 1.0.1 | QA Gate PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Debug Log References

- `npx jest tests/core/wave-executor.test.js tests/core/execution/wave-executor.test.js tests/core/execution/task-contract.test.js tests/core/execution/governed-wave-executor.test.js --runInBand` — PASS, 4 suites / 76 tests.
- `npm run lint` — PASS.
- `npm run typecheck` — PASS.
- `npm test -- --runInBand --silent` — PASS, 400 suites / 9,942 tests; 12 suites / 163 tests skipped by repository configuration.
- `npm run build` — PASS, publish safety gate and dependency completeness.
- `npm audit --json` — PASS, 0 known vulnerabilities.

### Completion Notes

- Replaced the false-success no-op path with a required governed runtime and an explicit observable legacy adapter.
- Connected the executor to the real `analyzeWaves()` API and resolved analyzer task identifiers against the supplied corpus.
- Added admission-before-start bounded concurrency, serial isolation for uncontracted tasks and pre-provider rejection of normalized output collisions.
- Corrected wave wall-time measurement so serial work is not reported as parallel efficiency.
- Architecture gate: PASS after the wall-time correction; no competing provider or governance boundary introduced.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-1.3-GOVERNED-WAVE-EXECUTION.md` (added)
- `.aexos-core/core/execution/task-contract.js` (updated from AEX-1.1 working tree state)
- `.aexos-core/core/execution/wave-executor.js` (modified)
- `tests/core/wave-executor.test.js` (modified)
- `tests/core/execution/wave-executor.test.js` (modified)
- `tests/core/execution/governed-wave-executor.test.js` (added)

## QA Results

### Review Date: 2026-09-04

### Reviewed By: Argus (Test Architect)

### Reviewed Revision: working-tree:93f54520ae4d1eb10a22b8ce5027c2483eb3f5421f9e60a0fa26ed3d5be7a45b

### Code Quality Assessment

The implementation reuses the canonical `WaveAnalyzer`, task-contract and
`AgentRuntime` boundaries. Admission occurs before promises start, missing
runtime and output conflicts fail closed, and no non-empty path retains the
former no-op success behavior.

### Requirements Traceability

- AC1: analyzer-shape and task-id resolution test.
- AC2: missing-runtime rejection and explicit legacy-adapter test.
- AC3–AC4: peak-concurrency, deterministic ordering and serial-lane tests.
- AC5: exact and normalized duplicate-output preflight tests.
- AC6: governed runtime-request propagation test plus AEX-1.2 regression suite.
- AC7: critical-failure abort and existing continuation-policy regression tests.
- AC8: execution-event, observed wall-time and false-success regression tests.
- AC9: 76 focused tests and 9,942 repository tests passed.

### Compliance Check

- Coding Standards: ✓ lint and typecheck passed.
- Project Structure: ✓ implementation remains in the existing execution layer.
- Testing Strategy: ✓ deterministic unit/integration-boundary probes plus full regression.
- All ACs Met: ✓ AC1–AC9 covered with no P0 gap.

### Security and Reliability Review

Contract path traversal and normalized output collisions are rejected before a
provider call. Missing runtime, invalid results, timeouts and critical failures
cannot become successful execution. `npm audit` reported zero known
vulnerabilities.

### Performance Considerations

`maxParallel` is enforced by an admission-before-start worker pool. Metrics use
measured wave wall time, preventing serial tasks from appearing parallel.

### Review Tool Availability

CodeRabbit CLI and the referenced legacy `qa-master-checklist.md` were not
available in this checkout. The story's documented graceful-degradation path
was used: manual architecture/QA review plus focused tests, full regression,
lint, typecheck, build safety and dependency audit.

### Gate Status

Gate: PASS → docs/qa/gates/AEX-1.3-governed-wave-execution.yml

### Lifecycle Transition

PASS: InReview → Done.
