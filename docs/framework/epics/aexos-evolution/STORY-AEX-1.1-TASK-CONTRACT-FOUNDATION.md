# STORY-AEX-1.1 — Task Contract Foundation

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Architecture:** [ADR-AEX-002](./adr/ADR-AEX-002-TASK-IO-CONTRACT.md)  
**Status:** Done  
**Executor:** `@dev`  
**Quality Gate:** `@qa`  
**Quality Gate Tools:** Jest, ESLint, TypeScript, task-contract validator

## Story

As the AEXOS runtime, I want every executable task to expose a
machine-checkable contract so that dispatch, verification and parallel
scheduling never depend on optimistic prose parsing.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | A Draft-07 schema defines `inputs`, `produces` and `verify`, including stable validation error paths. |
| AC2 | A CommonJS loader reads YAML frontmatter without evaluating task content and returns `contracted`, `uncontracted` or `invalid`. |
| AC3 | `warn` mode accepts an uncontracted legacy task but marks it unsafe for parallel scheduling; `strict` mode rejects it. |
| AC4 | Invalid contracts fail in both modes and never degrade to uncontracted. |
| AC5 | Produced paths are normalized inside the project root; traversal and undeclared outputs are rejected. |
| AC6 | A deterministic CLI validator reports total, contracted, uncontracted, invalid and coverage without modifying task files. |
| AC7 | Focused tests cover valid, invalid, missing, traversal and strict/warn behavior. |
| AC8 | No existing task body is rewritten by this story. Unrelated working-tree changes remain untouched. |

## Tasks / Subtasks

- [x] Add task-contract schema and loader (AC: 1–5)
- [x] Add deterministic corpus validator and npm command (AC: 6)
- [x] Add focused unit and CLI tests (AC: 7)
- [x] Run focused and repository quality gates (AC: 7–8)
- [x] Update checklist, Dev Agent Record and file list (AC: 8)

## Dev Notes

- Canonical task source remains `.aexos-core/development/tasks/`.
- Existing `task-v3-schema.json` describes parsed task definitions; the new
  contract schema is a narrow runtime boundary and does not replace it.
- Use the existing `ajv` and `js-yaml` dependencies; add no package.
- Frontmatter parsing must accept CRLF and LF.
- An uncontracted task has unknown outputs and must be serialized by future wave
  scheduling. It must never be interpreted as producing nothing.
- Path checks use resolved paths relative to the supplied project root.

## Testing Requirements

```powershell
npx jest tests/core/execution/task-contract.test.js --runInBand
npm run validate:task-contracts
npm run lint
npm run typecheck
npm test -- --runInBand --silent
```

## 🤖 CodeRabbit Integration

- **Primary type:** Architecture / execution safety
- **Primary agent:** `@dev`
- **Quality agent:** `@qa`
- **Focus:** path traversal, schema ambiguity, silent fallback, deterministic output
- CodeRabbit is advisory when available; repository gates remain authoritative.

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted from accepted 6.0 program | @sm |
| 2026-09-04 | 0.1.1 | Validated Ready; criteria are bounded and testable | @po |
| 2026-09-04 | 1.0.0 | Contract foundation implemented and gates passed | @dev |
| 2026-09-04 | 1.0.1 | QA PASS; foundation closed with migration risk recorded | @qa |

## Dev Agent Record

### Debug Log References

- `npx jest tests/core/execution/task-contract.test.js --runInBand`: 8/8 passed.
- `npm run validate:task-contracts`: 218 tasks, 1 contracted, 217 uncontracted,
  0 invalid, 0.46% coverage, warn-mode exit 0.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test -- --runInBand --silent`: 398 suites / 9,925 tests passed;
  12 suites / 163 tests skipped; exit 0.

### Completion Notes

- Added a Draft-07 task contract with strict shape and path-aware outputs.
- Added safe CRLF/LF frontmatter parsing while distinguishing legacy Markdown
  horizontal rules from actual YAML frontmatter.
- Added warn/strict migration semantics. Legacy tasks are explicitly unsafe for
  parallel scheduling instead of being treated as output-free.
- Added output normalization and rejection for traversal, absolute declarations
  and undeclared produced files.
- Added a read-only corpus validator and seeded one existing read-only task with
  a truthful contract. The remaining migration is measured, not claimed done.

### File List

- `.aexos-core/schemas/task-contract.schema.json` (added)
- `.aexos-core/core/execution/task-contract.js` (added)
- `.aexos-core/development/tasks/analyze-cross-artifact.md` (frontmatter only)
- `scripts/validate-task-contracts.js` (added)
- `tests/core/execution/task-contract.test.js` (added)
- `package.json` (added validation command)
- `docs/framework/epics/aexos-evolution/STORY-AEX-1.1-TASK-CONTRACT-FOUNDATION.md`

## QA Results

### Gate

**PASS** — the bounded foundation satisfies AC1–AC8. See
`docs/qa/gates/AEX-1.1-task-contract-foundation.yml`.

### Traceability

- AC1–AC4: schema and loader tests cover complete, missing and partial contracts.
- AC5: focused tests cover traversal, absolute paths and undeclared outputs.
- AC6: CLI JSON report and strict exit semantics are tested.
- AC7: 8 focused tests plus full repository regression passed.
- AC8: one task received frontmatter only; its body and unrelated working-tree
  changes were preserved.

### Residual risk

The remaining 217 legacy tasks are explicitly uncontracted and `parallelSafe:
false`. Their migration is required before the 6.0 strict-mode release gate,
but is not a defect in this foundation story.
