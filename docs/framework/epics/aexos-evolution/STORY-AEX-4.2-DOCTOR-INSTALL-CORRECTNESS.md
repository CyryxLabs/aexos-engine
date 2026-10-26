# Story AEX-4.2: Truthful Doctor and installation diagnostics

## Status

Ready for Review — implementation, installed-artifact checks and local quality gates complete; acceptance boundaries documented.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [clean-install-reproduction, jest, lint, typecheck, build]

## Story

**As an** AEXOS operator, **I want** installation health to describe the actual selected configuration and required dependencies, **so that** green means the applicable checks passed and failures have actionable causes.

## Context and dependencies

User asks to audit and fix issues such as Doctor green. This continues evolution integrity work; it does not certify release readiness. Read [accumulated-context.md](./accumulated-context.md#2026-09-06-audit-and-experience-remediation). AEX-4.3 may proceed independently but must coordinate shared installer files. Prior reported clean-init failures are hypotheses until reproduced in this checkout/package.

## Acceptance Criteria

- [x] AC1: Before editing diagnostic code, reproduce Doctor on a fresh isolated init and record package/version, selected hosts, init and Doctor exit codes, and each failing check. Also inventory repository quality/diagnostic gates with pass, fail or not-run evidence; unresolved findings remain individually visible.
- [x] AC2: Host-specific checks apply to the explicitly selected/configured host. An explicit empty IDE selection does not require Claude files, settings or hooks. Missing required artifacts for a selected host still fail; malformed configuration is reported rather than silently treated as no selection.
- [x] AC3: Required dependency failures remain failures with the dependency name and practical remediation. Optional tools and intentionally unselected integrations are clearly distinguished from required installation health in both text and JSON output.
- [x] AC4: Summary counts and exit codes reflect actual check results. An applicable failure cannot yield an all-green summary or successful exit. Skip/not-applicable status cannot be counted as an independently passed host integration.
- [x] AC5: Installer completion reports actual installed agents/configuration and identifies incomplete validation accurately. Fix mode respects the selected configuration and does not create unrequested host artifacts merely to turn Doctor green.
- [x] AC6: Regression tests cover no IDEs, Claude selected, another supported host selected, malformed configuration, missing required dependencies, and safe fix behavior. Repeat fresh-init Doctor against the changed installable artifact, preserving before/after receipts.
- [x] AC7: Run lint, typecheck, full tests and build; attach outcomes and fix introduced regressions. Document any remaining audit finding with severity, evidence and next owner instead of claiming all project issues are closed.
- [x] AC8: Init accepts an absolute destination path, including a Windows path containing spaces, without incorrectly prefixing the current directory or failing with ENOENT. Preserve relative destination behavior and verify the resolved target with a focused CLI regression.

## Tasks / Subtasks

- [x] Capture isolated baseline and gate inventory (AC1).
- [x] Trace configuration resolution and check applicability; repair check and formatter contracts together (AC2-4).
- [x] Repair actual completion counts and applicable fix behavior, coordinating AEX-4.3 (AC5).
- [x] Add focused regression matrix and verify installed artifact (AC6).
- [x] Run repository gates and record remaining issues, receipts and file list (AC7).
- [ ] Repair absolute destination resolution in `bin/aexos.js` and test relative/absolute paths (AC8).

## Dev Notes

Reuse `.aexos-core/core/doctor/index.js`, `checks/`, `formatters/`, and `fix-handler.js`; tests already live under `tests/core/doctor/`. Installer entry is `packages/installer/src/wizard/index.js`; presentation is `feedback.js`. Verify configuration keys in the installed artifact rather than assuming checkout defaults. No new dependency is authorized.

Source contracts: [constitution](../../../../.aexos-core/constitution.md#i-cli-first-non-negotiable) requires CLI-first truth; [source tree](../../source-tree.md#framework-core-aexos-core) places diagnostics in the core; [coding standards](../../coding-standards.md#testing-standards) supplies test conventions. No new database, provider API or environment variable is required by this story.

## Testing

Jest unit/integration coverage must assert failure and exit behavior, not only snapshots. Use temporary project roots; do not alter unrelated working files. Include a real fresh-init smoke with JSON and human-readable diagnostics. Record local fixes separately from published-package state.

## CodeRabbit Integration

Story Type Analysis: Integration / CLI, medium complexity. Specialized Agents: @dev primary; @qa independent validation; @architect for configuration-contract changes. Quality Gate Tasks: pre-commit @dev required; pre-PR @devops if a PR is requested; pre-deployment N/A. Self-Healing: @dev light, 2 iterations / 15 minutes, CRITICAL auto-fix; HIGH documented; @qa full, 3 iterations / 30 minutes, CRITICAL/HIGH correction. Focus Areas: false-green conditions, configuration ambiguity, dependency resolution and filesystem scope. If CodeRabbit is unavailable, record that fact and independent review evidence; never claim its check passed.

## Story Draft Checklist

READY, clarity 9/10. Goal/context PASS; technical guidance PASS; references PASS; self-containment PASS; testing PASS; CodeRabbit PASS. All applicable checklist items assessed against `.aexos-core/product/checklists/story-draft-checklist.md`; environment variables and deployment gates N/A. Developer can start from reproduction; any new unrelated finding remains a tracked audit item.

## Change Log

2026-09-06 — v1 — Chronos: derived story from current user request and verified source layout.

## Dev Agent Record

Doctor implementation and IDS/self-critique evidence: `artifacts/audit-20260906/doctor-implementation.md`. Focused Doctor suite: 149 passed, 7 suites. Fresh source init (absolute destination) exit 0; Doctor exit 0 with 9 PASS / 2 WARN / 0 FAIL / 8 INFO. Typecheck passed; final lint errors belong to concurrent Virtual Office AbortSignal references and were reported to lead. Lead owns installer completion, installable artifact and full gate receipts. No release readiness claim.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.2-DOCTOR-INSTALL-CORRECTNESS.md`
- `docs/framework/epics/aexos-evolution/accumulated-context.md`

- `.aexos-core/core/doctor/checks/claude-md.js`
- `.aexos-core/core/doctor/checks/commands-count.js`
- `.aexos-core/core/doctor/checks/core-config.js`
- `.aexos-core/core/doctor/checks/hooks-claude-count.js`
- `.aexos-core/core/doctor/checks/ide-sync.js`
- `.aexos-core/core/doctor/checks/index.js`
- `.aexos-core/core/doctor/checks/npm-packages.js`
- `.aexos-core/core/doctor/checks/rules-files.js`
- `.aexos-core/core/doctor/checks/settings-json.js`
- `.aexos-core/core/doctor/checks/skills-count.js`
- `.aexos-core/core/doctor/fix-handler.js`
- `.aexos-core/core/doctor/formatters/text.js`
- `.aexos-core/core/doctor/index.js`
- `packages/installer/tests/unit/doctor/doctor-checks.test.js`
- `packages/installer/tests/unit/doctor/doctor-orchestrator.test.js`
- `tests/core/doctor/fix-handler.test.js`
- `.aexos-core/core/doctor/host-selection.js`
- `.aexos-core/core/doctor/checks/selected-hosts.js`
- `tests/core/doctor/doctor-truthfulness.test.js`
- `bin/aexos.js`
- `artifacts/audit-20260906/doctor-implementation.md`
- `artifacts/audit-20260906/doctor-before.json`
- `artifacts/audit-20260906/doctor-after.json`
- `artifacts/audit-20260906/doctor-init-before.log`
- `artifacts/audit-20260906/doctor-init-after.log`
- `artifacts/audit-20260906/doctor-tests.log`
- `artifacts/audit-20260906/doctor-lint.log`
- `artifacts/audit-20260906/doctor-typecheck.log`

- tests/core/permissions/operation-guard.test.js
- tests/core/permission-mode-integration.test.js
- tests/unit/validate-aexos-core-deps.test.js
- artifacts/audit-20260906/doctor-followup-tests.log

Aggregate follow-up: 114 tests / 3 suites pass; lint/typecheck exit 0.

- packages/installer/src/wizard/index.js
- .aexos-core/infrastructure/scripts/ide-sync/index.js
- tests/wizard/integration.test.js
- tests/ide-sync/index-validate-filter.test.js
- packages/installer/tests/unit/ide-sync-integration/ide-sync-integration.test.js
- artifacts/audit-20260906/selected-host-tests.log
- artifacts/audit-20260906/no-host-final-init.log

Selected-host follow-up: 145 tests pass; fresh no-host init creates no host directories. Detailed IDS/self-critique continuation in doctor-implementation.md.

- `.aexos-core/core/doctor/checks/agent-memory.js`
- `.aexos-core/core/doctor/checks/framework-3way-diff.js`
- `.aexos-core/hooks/gemini/after-tool.js`
- `.aexos-core/hooks/gemini/before-agent.js`
- `.aexos-core/hooks/gemini/before-tool.js`
- `.aexos-core/hooks/gemini/session-start.js`
- `.aexos-core/hooks/gemini/session-end.js`
- `.gemini/hooks/after-tool.js`
- `.gemini/hooks/before-agent.js`
- `.gemini/hooks/before-tool.js`
- `.gemini/hooks/session-start.js`
- `.gemini/hooks/session-end.js`
- `artifacts/audit-20260906/doctor-semantic-before.json`
- `artifacts/audit-20260906/doctor-roster-before.json`
- `artifacts/audit-20260906/doctor-disabled-before.json`
- `artifacts/audit-20260906/doctor-semantic-after-root.json`
- `artifacts/audit-20260906/doctor-semantic-tests.log`
- `artifacts/audit-20260906/doctor-semantic-final-regressions.log`
- `artifacts/audit-20260906/doctor-semantic-lint.log`
- `artifacts/audit-20260906/doctor-semantic-typecheck.log`

2026-09-07 semantic follow-up: 177 tests pass; final lint/typecheck pass with no lint warnings. Detailed reproduction, IDS and self-critique in doctor-implementation.md.

## QA Results

### Final package audit follow-up (2026-09-07)

Installing the framework's declared internal dependencies exposed a packaging defect: npm packed `.aexos-core/node_modules` (9166 files total). Added an explicit dependency-tree exclusion to both `package.json` and the canonical `.aexos-core/data/core-package-boundary.json`. The publish gate now rejects local dependency trees, producer tokens and office backup files. Final package gate passes with 1892 files and no nested dependency tree. Jest maps shared mocked packages to one root instance so installing internal runtime dependencies does not bypass unit mocks; actual installed-artifact checks remain outside Jest.

Fresh final tarball installed into `C:/AEXOS-LOCAL-TESTS/audit-packed-final-20260907`; absolute-path CLI init into `C:/AEXOS-LOCAL-TESTS/audit-final-project-20260907` exited 0. Bundled Doctor exited 0. Receipts: `artifacts/audit-20260906/pack-final.json`, `packed-final-install.log`, `packed-final-init.log`, `packed-final-doctor.json`. The subsequent user-requested office design revision will require a refreshed final package receipt.

Additional file list: `package.json`, `.aexos-core/data/core-package-boundary.json`, `bin/utils/validate-publish.js`, `jest.config.js`.

Pending independent implementation review.

### Independent final acceptance — 2026-09-07

Reviewed by Argus against the working tree based on `958a5aeaba60a2cf4f370bed80f7e95280df6612` and refreshed final package shasum `26fe95383887ba3f0528df9e94b47c4f0b91f1ab`. **APPROVED / PASS for local Doctor and installation correctness.** Earlier pending independent-review and office-package-refresh notes are superseded by this entry.

AC assessment: AC1 PASS from documented fresh pre-fix reproduction (four failing checks) and gate inventory; AC2-4 PASS from reviewed applicability/config/dependency logic and focused actual-files negative tests; AC5 PASS from corrected completion/selected-host writer behavior and no-host final install; AC6 PASS from regression matrix and final installed package Doctor; AC7 PASS from aggregate receipts; AC8 PASS from final packed CLI invocation into `C:/AEXOS-LOCAL-TESTS/Audit Delivery Space Path`, with exact destination independently inspected and successful completion read in `artifacts/audit-20260906/packed-space-init.log`. The live packed CLI scenario supplies focused space-path regression evidence rather than a redundant mocked path assertion.

`packed-delivery-doctor.json`: 9 PASS / 2 WARN / 0 FAIL / 8 INFO. Aggregate `test-results.json`: 10,332 passed, zero failed, 163 pending; 430 passed suites and 12 pending. Final lint: zero errors/nine warnings; typecheck succeeds; build/publish safety gate passes with 1,894 package files. Five additional contamination behavior tests cover nested dependencies, producer token, timestamped hook backup and a clean fixture; all pass. Detailed findings and resolved rechecks are in `QA-AUDIT-20260906.md`.

This approval verifies local installation diagnostics. The two Doctor warnings and lint warnings remain disclosed; Doctor does not certify release readiness, native provider execution or company orchestration. CodeRabbit is unavailable; documented independent review fallback used. Story AC checkboxes, task lists and lifecycle fields were intentionally left to the lead because QA authority here is limited to QA Results.

### 2026-09-07 wrapper registration correction

Reproduced root hooks WARN for five installed CJS files. Reviewed synapse-wrapper and precompact-wrapper execFileSync delegation; Doctor now recognizes their exact normalized source hashes and registered wrapper/helper pairs. Altered/fake wrappers and genuine unregistered helpers continue warning. No hooks changed. IDS: ADAPT hooks-claude-count and existing truthfulness fixtures. Tests:164/6 suites pass, lint/typecheck pass. Root hooks now PASS5. Evidence: artifacts/audit-20260906/doctor-wrapper-tests.log.
