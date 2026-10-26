# STORY-AEX-1.2 — Governed AgentRuntime

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Architecture:** [ADR-AEX-001](./adr/ADR-AEX-001-AGENT-RUNTIME-INTERFACE.md) · [ADR-AEX-003](./adr/ADR-AEX-003-GOVERNANCE-HOT-PATH.md)  
**Status:** Done  
**Executor:** `@dev`  
**Quality Gate:** `@qa`

## Story

As the AEXOS orchestrator, I want one required runtime boundary for agent work so
that an absent executor cannot be reported as a successful or dispatched task.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | `AgentRuntime` validates requests and exposes `execute()` plus `capabilities()`. |
| AC2 | Every execution evaluates budget, intent and story governance before the provider is called. |
| AC3 | Approval and rejection evidence include an intent hash without persisting prompt or secret content. |
| AC4 | Provider results normalize to `success`, `status`, `output`, `produced`, `usage` and evidence. |
| AC5 | Declared task outputs are checked through AEX-1.1 before success is returned. |
| AC6 | WorkflowOrchestrator accepts `runtime`; legacy `dispatchSubagent` is adapted only as a deprecated explicit executor. |
| AC7 | Executing a workflow phase without either runtime or explicit legacy executor throws `AGENT_RUNTIME_REQUIRED`; `pending_dispatch` is removed. |
| AC8 | Focused and repository gates pass and unrelated working-tree changes remain untouched. |

## Tasks / Subtasks

- [x] Implement governed runtime and provider adapter (AC: 1–5)
- [x] Wire WorkflowOrchestrator to the runtime boundary (AC: 6–7)
- [x] Add request, governance, output and compatibility tests (AC: 1–8)
- [x] Run focused and repository quality gates (AC: 8)
- [x] Update Dev Agent Record and file list (AC: 8)

## Dev Notes

- Reuse `.aexos-core/core/permissions/dispatch-governance.js` and the existing
  AI provider interface; add no dependency.
- The runtime owns governance reachability. Callers cannot mark a result as
  successful before `execute()` returns.
- Keep the legacy callback adapter for one migration window, but remove the
  manual/pending fallback.
- Do not log or persist raw prompts in governance evidence.

## Testing Requirements

```powershell
npx jest tests/core/execution/agent-runtime.test.js tests/core/orchestration/workflow-orchestrator-profile-propagation.test.js --runInBand
npm run lint
npm run typecheck
npm test -- --runInBand --silent
```

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted and validated Ready | @sm / @po |
| 2026-09-04 | 1.0.0 | Runtime implemented and full regression passed | @dev |
| 2026-09-04 | 1.0.1 | QA PASS; explicit legacy adapter retained for migration | @qa |

## Dev Agent Record

### Debug Log References

- Focused runtime/orchestrator gate: 2 suites, 8 tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Full regression: 399 suites / 9,932 tests passed; 12 suites / 163 tests
  skipped; exit 0.

### Completion Notes

- Added a governed provider execution boundary with request/result validation.
- Governance always runs before the provider and records hash-only approval or
  rejection evidence.
- Successful structured outputs are checked against their task contract.
- WorkflowOrchestrator now requires a runtime at execution time. The prior
  `pending_dispatch` fallback was removed.
- Explicit legacy callbacks are wrapped in a deprecated adapter for one major
  migration window and remain observable as such.

### File List

- `.aexos-core/core/execution/agent-runtime.js` (added)
- `.aexos-core/core/orchestration/workflow-orchestrator.js` (modified)
- `tests/core/execution/agent-runtime.test.js` (added)
- `tests/core/orchestration/workflow-orchestrator-profile-propagation.test.js` (modified)
- `docs/framework/epics/aexos-evolution/STORY-AEX-1.2-AGENT-RUNTIME.md`

## QA Results

### Gate

**PASS** — AC1–AC8 are covered by focused tests and full regression. See
`docs/qa/gates/AEX-1.2-governed-agent-runtime.yml`.

### Residual risk

`dispatchSubagent` remains as an explicit deprecated adapter. It no longer has a
manual fallback, but removing the adapter itself is reserved for the stable 6.0
migration gate after all internal callers use `runtime` directly.

