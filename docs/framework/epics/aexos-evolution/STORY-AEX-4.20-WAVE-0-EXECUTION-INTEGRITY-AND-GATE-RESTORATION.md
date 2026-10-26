# Story AEX-4.20: Wave 0 Execution Integrity and Gate Restoration

## Status

Done

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [jest, negative-execution-regression, lint, typecheck, build, installed-entrypoint-smoke]

## Story

**As an** AEXOS operator, **I want** every executable entrypoint and required validation path to fail closed and the repository gates to report the exact candidate truthfully, **so that** no unexecuted, rejected, or test-broken work can be presented as complete.

## Context and dependencies

The October 10 audit found two false-completion paths beyond the previously accepted AEX-4.5 scope. `autonomous-build-loop.js` can return success and requested filenames when no executor is injected; the standalone CLI constructs that loop without an executor, while `build-orchestrator.js` does inject one. `workflow-orchestrator.js` can warn on failed required output, post-action, or checklist validation and still mark a phase complete and dispatch downstream work. This story closes those exact paths without reopening or rewriting AEX-4.5's accepted history.

The same audited candidate is not gate-green: the default Jest run has five reproducible `ProjectStatusLoader` test failures and lint has ten errors in existing artifact scripts. The loader is correct to recognize a repository when a temporary directory is created beneath the ancestor repository at `C:/Users/ppetr`; its tests must isolate the filesystem boundary. Those tests also use an `execa` API shape incompatible with installed v5 and catch blocks swallow assertion failures. TTL cases and all ten lint errors must be repaired truthfully; source behavior must not be weakened to satisfy defective tests.

This is Wave 0. AEX-4.21 cannot claim an accepted installed SDLC journey until this story supplies a reproducible exact-candidate baseline.

## Acceptance Criteria

- [x] AC1: Preserve a bounded pre-fix reproduction for both audited execution defects and current gate failures, binding source paths, callers, exact Git/tree identity when available, commands, exits, and logs. The evidence distinguishes the standalone no-executor path from the injected `BuildOrchestrator` path and preserves earlier accepted story histories without retroactive status edits.
- [x] AC2: Every executable `AutonomousBuildLoop` entrypoint requires a real executor before execution. Missing executor returns or throws an explicit unsupported/not-executed failure, never reports requested files as modified, and never emits successful completion. An explicitly selected preview/fixture mode remains labeled simulated or not executed and cannot satisfy implementation acceptance. Negative tests cover direct API and standalone CLI construction; positive tests cover injected-executor success and failure.
- [x] AC3: A workflow phase with provider failure, missing required output, failed post-action, checklist rejection, checklist exception, or required outcome-verification failure persists an explicit failed/blocked state, does not enter `completedPhases`, does not invoke completion callbacks as accepted work, and does not dispatch dependent phases. Positive tests prove a valid phase completes and preserve the optional delivery-confidence gate's distinct final-summary behavior.
- [x] AC4: Governed runtime dispatch from the workflow path carries the selected task contract and requires acceptance on supported automated phases. Execution success and acceptance success remain separate evidence. Missing or invalid required acceptance cannot be converted to a warning-only completion, while legacy interactive guidance remains explicitly non-certified rather than receiving invented contracts.
- [x] AC5: Repair the five reproducible `ProjectStatusLoader` test failures by creating truly isolated temporary repositories or non-repositories, using the installed `execa` v5 function API, and ensuring assertion failures escape test helpers. Cover cache/TTL behavior with deterministic clocks or bounded waits and prove both repository and non-repository results. Do not change truthful source detection merely because an ancestor directory is a Git repository.
- [x] AC6: Resolve all ten current lint errors in the audited artifact scripts with behavior-preserving edits or an explicitly reviewed repository policy change. Do not hide errors through blanket exclusions, disabled rules, generated-file deletion, or lower thresholds. Preserve unrelated dirty work and record every changed lint path.
- [x] AC7: On one exact reviewable candidate, run focused negative/positive execution tests, the isolated status-loader suite, `npm run lint -- --no-cache`, `npm run typecheck -- --incremental false`, `npm test -- --runInBand`, and `npm run build`. Required commands exit zero with no swallowed assertion, skipped required case, or stale historical receipt. Any default exclusions and warnings remain disclosed; no provider, release, or production claim is inferred.

## Tasks / Subtasks

- [x] Capture exact pre-fix probes and candidate identity without modifying earlier evidence (AC1).
- [x] Make AutonomousBuildLoop and its standalone CLI fail closed without an executor; preserve explicit preview semantics (AC2).
- [x] Enforce phase validation, required acceptance, failed state, and downstream blocking in WorkflowOrchestrator (AC3–AC4).
- [x] Correct ProjectStatusLoader test isolation, execa usage, assertion propagation, and TTL coverage (AC5).
- [x] Repair the ten lint errors without blanket suppression (AC6).
- [x] Run focused and full gates on the same candidate and publish bounded receipts for QA (AC7).

## Dev Notes

Start at `.aexos-core/core/execution/autonomous-build-loop.js`, its direct CLI construction near the audited `975–991` region, `.aexos-core/core/execution/build-orchestrator.js`, and `.aexos-core/core/orchestration/workflow-orchestrator.js`. Line numbers may drift; resolve symbols and callers before editing. Reuse `.aexos-core/core/execution/{agent-runtime,task-contract,outcome-verifier}.js` rather than adding another execution engine.

For the status tests, inspect the current ProjectStatusLoader suite and helper imports before choosing the temporary-directory strategy. The regression must demonstrate that a directory beneath an ancestor Git worktree is a repository and that a genuinely isolated path is not. A broad source exception for temp paths would be incorrect.

No new dependency, browser control, provider call, release action, or blanket task-schema migration belongs here. `AEX-4.5` remains accepted for its recorded September candidate; this story owns only newly audited paths and current-candidate restoration.

[AUTO-DECISION] Earlier stories remain incomplete → proceed because the founder explicitly authorized all stories in the comprehensive plan; keep this story Draft and preserve prior status history.

## Testing

Use adversarial unit and integration tests that assert return value, persisted phase state, emitted events/callbacks, artifact claims, and downstream dispatch together. Include a positive injected executor and valid workflow phase so fail-closed changes do not eliminate supported execution. Run the exact full-gate commands from AC7 after all relevant inputs stop changing.

## CodeRabbit Integration

Story Type Analysis: Integration / Architecture / Test Infrastructure, high risk. Primary agent: @dev. Independent quality gate: @qa. Supporting review: @architect for execution/acceptance contracts; @devops only if a later PR is requested. Pre-commit review and focused regressions are required; pre-PR review is pending; deployment is outside scope. Self-healing: @dev light, two iterations / 15 minutes, CRITICAL auto-fix and HIGH documented; @qa full, three iterations / 30 minutes, CRITICAL/HIGH correction. Focus areas: false completion, required acceptance, state ordering, downstream blocking, filesystem isolation, swallowed assertions, lint suppression, and exact-candidate evidence. CodeRabbit unavailability must be recorded, not counted as a pass.

## References and provenance limits

- [AEX-4.5 accepted fail-closed history](STORY-AEX-4.5-FAIL-CLOSED-EXECUTION-INTEGRITY.md#independent-final-acceptance--2026-09-07) — preserve; do not rewrite its evidence.
- [Accumulated context](accumulated-context.md#2026-09-06-audit-and-experience-remediation) — cross-story ownership and dirty-work constraints.
- Audit `REPORT.md`, sections **Priority defects and integration gaps**, **Delivery sequence and observable acceptance**, and **Validation results** at `C:/Users/ppetr/.codex/visualizations/2026/10/10/01a12817-25bc-7500-87cc-a8367f1de09f/aexos-audit/REPORT.md`.
- Audit `review.md`, sections **P1 — autonomous loop** and **P1 — workflow completion**, and `validation.md` gate table in the same audit directory.

The pinned AIOX source shares the autonomous-loop fallback; that is defect provenance, not authority to copy upstream code or proof of parity. Audit fixtures and mocks do not establish live-provider behavior.

## Story Draft Checklist

READY, clarity 10/10. Goal/context PASS; technical guidance PASS; references PASS; self-containment PASS; testing PASS; CodeRabbit PASS. Positive and negative paths, dependencies, exclusions, exact gate commands, and evidence limits are explicit. Implementation and QA acceptance remain pending.

## PO Validation Notes

**Verdict:** GO (10/10 readiness; high confidence). Validated on 2026-10-10 against the story template, PO checklist, accumulated epic context, current source seams, and the bounded audit report, review, and gate evidence.

- Testability and negative paths: PASS. AC2-AC5 require observable failure state, callbacks/events, downstream blocking, direct and CLI no-executor behavior, injected-executor success/failure, checklist exceptions, deterministic repository/non-repository fixtures, and TTL behavior. AC7 binds focused and full gates to one reviewable candidate.
- Dependencies and runtime reuse: PASS. The story reuses `AutonomousBuildLoop`, `BuildOrchestrator`, `WorkflowOrchestrator`, `AgentRuntime`, task contracts, and the outcome verifier; it introduces no competing execution engine or dependency. AEX-4.21 is correctly downstream.
- Scope and provenance: PASS. The story confines work to the newly audited paths, preserves AEX-4.5's accepted historical scope, distinguishes audit evidence from provider/runtime proof, and excludes provider, release, production, and blanket schema work.
- Implementation handoff: PASS. Source symbols, callers, expected failure semantics, test matrix, full-gate commands, dirty-work preservation, and evidence limits are explicit. No unresolved ambiguity blocks development.
- Quality boundary: Status `Ready` means the draft is implementable. Implementation evidence and independent `@qa` acceptance remain pending and are not claimed by this validation.

## File List

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.20-WAVE-0-EXECUTION-INTEGRITY-AND-GATE-RESTORATION.md`.
- Modified: `.aexos-core/core/execution/autonomous-build-loop.js`.
- Modified: `.aexos-core/core/orchestration/workflow-orchestrator.js`.
- Modified: `.aexos-core/core/orchestration/context-manager.js`.
- Modified: `.aexos-core/core/sdc/story-meta.js`.
- Modified: `.aexos-core/infrastructure/tests/project-status-loader.test.js`.
- Modified: `tests/core/autonomous-build-loop.test.js`.
- Created: `tests/core/orchestration/workflow-orchestrator-integrity.test.js`.
- Created: `tests/core/orchestration/context-manager-failure-sticky.test.js`.
- Modified: `tests/unit/sdc/story-meta.test.js`.
- Modified: `eslint.config.js`.
- Modified: `artifacts/commercial-readiness-20260908/aex-4.13/integrate-guidance.cjs`.
- Modified: `artifacts/commercial-readiness-20260908/aex-4.14/inventory-prerequisites.cjs`.
- Modified: `artifacts/commercial-readiness-20260908/premium-installer-ux/assemble.cjs`.
- Coordination only: `docs/framework/epics/aexos-evolution/{ROADMAP,accumulated-context}.md`.

## Dev Agent Record

The first implementation candidate was **not accepted**. Baseline source/hash inventory and patch backups are in the external `aexos-implementation/baseline/` directory named in accumulated context. The advisory independent review rejected candidate `c9f94e1dd553b415c71b0b045c82df80f04e9236ef88c6a2f939d2eee08495db` despite passing focused tests. Corrections now cover sticky parallel failure persistence, verification workspace binding, invented modified-file checkpoint claims, and strict gate booleans. The initial full-suite run was interrupted after those findings; it is not a completed gate result. Corrected source passed 255 tests across seven focused suites, owned-file ESLint and typecheck. Final evidence: wave0-final-candidate.json, wave0-post-gates-candidate.json, wave0-final-full-tests.json/log, wave0-final-gates.json, wave0-final-lint.log, wave0-final-typecheck.log, wave0-final-build.log and wave0-independent-rereview.md. Final gates passed: 450 suites / 10,928 tests passed; 12 suites / 163 tests remain skipped by existing configuration; zero failed. Lint passed with 267 existing warnings, typecheck passed, and build/package safety passed with 1,948 files. Before/after gate manifests match exactly across 3,631 inventoried paths (sourceHash 5a0964cd75d9d526a7c029c5dad9e920105d828003cec5b3750b35545a1f2c30). Independent re-review passed 294 tests in nine suites and found no remaining blocking defect; final QA lifecycle gate is pending receipt review. Subsequent checklist/status/evidence edits are administrative and do not change tested runtime or tests.

Bounded evidence before the review fixes: status-loader 31 tests passed; SDC parser and related suites 35 tests passed; execution-focused 80 tests passed; independent focused review 116 tests passed; lint zero errors and 267 existing warnings; typecheck passed; build/package safety passed with 1,948 files. These results are not final-candidate acceptance. Final focused and full gates must be rerun after source stabilization.

Additional required correction: the SDC status parser previously treated lifecycle words inside annotations as authoritative (for example, Draft with an implementation annotation). It now recognizes the leading lifecycle label and has regression coverage. This avoids advancing a Draft story before PO validation.

Evidence directory: `C:/Users/ppetr/.codex/visualizations/2026/10/10/01a12817-25bc-7500-87cc-a8367f1de09f/aexos-implementation/evidence/`. Relevant records: `lead-slice.md`, `integrity-implementation-log.md`, `wave0-independent-review.md`, `wave0-candidate.json`, `status-loader.json`, `sdc-parser.log`, `lint.log`, `typecheck.log`, and `wave0-build.log`. CodeRabbit is unavailable; native independent review is recorded separately and does not constitute external/provider acceptance.

## QA Results

Advisory native independent review: **NEEDS_WORK**, four reproduced defects recorded in `wave0-independent-review.md`. All four findings are fixed; independent source re-review found no blocking defect. Final lifecycle acceptance remains pending QA confirmation of the completed full-gate receipts.

### Review Date: 2026-10-10

### Reviewed By: Argus (independent native Codex QA)

### Reviewed Revision: sha256:5b1cf594f0f59c2700c6166417f8a159535650b66396dcc9a5a1982606e57e28

**Final independent decision: PASS.** AC1–AC7 reviewed against the preserved audit/baseline, corrected runtime/tests, and final exact-candidate receipts. The initial four findings are resolved: durable parallel failure/handoff revocation, verification workspace binding, truthful no-op file evidence, and strict gate booleans. Independent re-review passed 294 tests across nine suites plus adversarial persistence/workspace probes.

Gate: PASS → docs/qa/gates/AEX-4.20-wave-0-execution-integrity-and-gate-restoration.yml

Tested source manifest: `5a0964cd75d9d526a7c029c5dad9e920105d828003cec5b3750b35545a1f2c30` across 3,631 paths; final and post-gate manifests match. Current runtime/tests match; only this story's administrative text changed afterward. Story digest convention: SHA-256 of UTF-8 story text after CRLF-to-LF normalization, excluding only complete exact H2 sections Status, QA Results, and Change Log (heading and body through next H2 or EOF); all other text retained. Recompute with external `wave0-story-digest.cjs`.

Final receipts: 450 suites / 10,928 tests passed; 12 suites / 163 tests skipped; zero failed. Lint exit 0 with 267 existing warnings; typecheck exit 0; build/package-safety exit 0, 1,948 package files. Receipts are `wave0-final-full-tests.json/log`, `wave0-final-gates.json`, and final lint/typecheck/build logs in the evidence directory above. Existing Jest exclusions include private runtime/artifact services, Playwright, selected platform/native-runner, legacy tools/ClickUp/manifest/install-transaction, squad templates and licensing; service integrations are skipped by default. They are not claimed passed.

CodeRabbit unavailable; this is native independent QA, not external certification. Provider/runtime acceptance, installed downstream SDLC journeys, release, deployment, upstream parity and commercial validation are outside this gate.

**Lifecycle instruction:** PASS authorizes InReview → Done and a 0.1.3 QA change-log row. The lead applies this mechanical transition on the independent QA decision because this reviewer's role permits story changes only within QA Results. No source changes were made by QA.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-10 | 0.1.2 | Development started under the user-approved native Codex quota exception; source baseline backed up, PO GO and SDC validation recorded. | @dev / lead |
| 2026-10-10 | 0.1 | Draft Wave 0 integrity and current-gate restoration contract from the approved audit plan. | Chronos / `@sm` |
| 2026-10-10 | 0.1.1 | Validated GO (10/10) — Status: Draft → Ready; implementation and independent QA acceptance remain pending. | @po |


| 2026-10-10 | 0.1.3 | QA Gate PASS — Status: InReview → Done; mechanical transition by coordinator on Argus independent QA decision. | @qa decision / lead applied |

| 2026-10-10 | 0.1.4 | Administrative closure after independent QA PASS; Done preserved. [closure-key: AEX-4.20:digest:sha256:5b1cf594f0f59c2700c6166417f8a159535650b66396dcc9a5a1982606e57e28] | @po / lead |
