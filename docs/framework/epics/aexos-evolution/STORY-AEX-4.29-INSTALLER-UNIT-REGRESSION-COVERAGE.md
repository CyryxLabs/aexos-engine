# Story AEX-4.29: Installer Unit Regression Coverage

## Status

Done

Accepted after independent QA and root global gates. The bounded closure below supersedes pending implementation notes; no broader story or release approval is inferred.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [focused-jest, default-suite-inclusion-check, assertion-review, lint, typecheck, full-jest]

## Story

**As an** AEXOS maintainer, **I want** the local installer question and configuration-validator unit suites to run in the default test suite with expectations aligned to the approved installer contract, **so that** regressions in the current three-question English-only flow and local configuration validation cannot remain hidden behind the integration-test switch.

## Context and Scope

A targeted recheck ran only `tests/wizard/questions.test.js` and `tests/unit/wizard/validation/config-validator.test.js` with `SKIP_INTEGRATION_TESTS=false`. It executed 43 tests: 35 passed and 8 failed. Both files are local unit coverage: the question suite inspects deterministic question definitions, and the validator suite mocks `fs` and `js-yaml`. They are currently nested under `describeIntegration`, which `tests/setup.js` skips when `SKIP_INTEGRATION_TESTS=true`, so the default suite can omit this coverage.

Seven failures in `questions.test.js` expect superseded presentation details: emoji markers, a recommendation label, a four-question sequence containing the removed language prompt, or obsolete/case-sensitive copy. The accepted AEX-4.3 behavior is an English-only three-question sequence with explicit semantic names and descriptions. The eighth failure is in the validator suite's positive `.env` case: its blanket `fs.existsSync(true)` says `.mcp.json` exists while the read mock returns empty content, correctly producing an MCP parse/schema error and making the supposed success fixture invalid.

This is a test-only coverage correction. Preserve AEX-4.3's independently approved English-only minimal installer, visual selectors, question definitions, order, choices, descriptions, defaults, review/change/cancel flow, and all other accepted behavior. Do not edit product code to satisfy stale assertions.

[AUTO-DECISION] Coverage classification → use ordinary `describe` for these two suites because they perform no external integration, provider, network, process, package-install, or real filesystem work.

[AUTO-DECISION] Assertion authority → derive expectations from the current approved semantic fields and exact three-question sequence: `projectType`, `selectedIDEs`, `selectedTechPreset`. Emoji and recommendation wording are not required contracts for profile choices.

[AUTO-DECISION] Positive fixture repair → make the successful validator fixture return a valid `.mcp.json` payload or report that the optional file is absent. Preserve explicit invalid-JSON/schema coverage and do not make production validation more permissive.

## Acceptance Criteria

- [x] **AC1 — Preserve the original failure receipt.** Retain the supplied JSON and log showing exactly 2 failed suites, 43 executed tests, 35 passed and 8 failed, and reference them in implementation/QA evidence. Do not overwrite or reinterpret the baseline as a passing run.
- [x] **AC2 — Restore default execution.** Replace `describeIntegration` with ordinary `describe` in only `tests/wizard/questions.test.js` and `tests/unit/wizard/validation/config-validator.test.js`. A default Jest invocation with the repository's normal environment must execute both suites without requiring `SKIP_INTEGRATION_TESTS=false`; prove execution through test results, not file discovery alone.
- [x] **AC3 — Align question assertions to the accepted contract.** Assert semantic values, clear names/descriptions, defaults where contractually required, and the exact three-question order `projectType`, `selectedIDEs`, `selectedTechPreset`. Remove stale requirements for emoji markers, a profile recommendation label, the former language question, `Greenfield`/`Brownfield` display terms, or obsolete copy. Keep coverage for both project types, both profile modes, IDE selection, tech preset, environment/MCP helpers, lookup behavior, validators, and useful descriptions.
- [x] **AC4 — Preserve AEX-4.3 behavior.** Make no change to `packages/installer/src/wizard/questions.js` or other product files. The current English-only minimal flow, semantic option descriptions, host choices, visual selector behavior and review/change/cancel flow remain unchanged. Mechanical status binding or normalization of AEX-4.3 is out of scope.
- [x] **AC5 — Repair the positive MCP fixture.** Correct the successful validator fixture so every mocked existing file has valid, intentional content. The success case must pass for the intended reason, while missing optional MCP configuration, invalid JSON, invalid schema/parse behavior, environment errors, core-config errors and `.gitignore` errors remain meaningfully asserted.
- [x] **AC6 — No assertion weakening.** Do not replace precise behavior checks with only existence, type, truthiness, snapshots, unconditional passes, broad catch/ignore logic, or assertions copied from the implementation without semantic verification. Independent `@qa` must compare changed assertions with AEX-4.3 and current question definitions and confirm that removed assertions were stale presentation requirements rather than active behavior.
- [x] **AC7 — Focused and default-suite proof.** The two focused suites pass at least 43 meaningful tests after correction. A default-suite run must report both files as executed and passing without the integration opt-in. Any new tests must protect a distinct contract; the count must not be inflated with duplicate or trivial assertions.
- [x] **AC8 — Preserve repository policy and external-suite boundaries.** Do not change dependencies, Jest/global setup, environment defaults, test scripts, manifests, configuration, product source, or other integration/external suites. Run focused lint applicable to the two changed test files. Root ownership retains `npm run lint`, `npm run typecheck`, `npm test`, and any other required global gates; their results must be reported separately and no unavailable or failing global gate may be represented as passing.

## Tasks / Subtasks

- [x] Preserve and cite the original JSON/log receipt and record before-change suite classification and counts (AC1).
- [x] Reclassify only the two local suites from `describeIntegration` to ordinary `describe`, including nested blocks (AC2, AC8).
- [x] Update the seven stale question assertions to verify current semantic values, descriptions and exact three-question order without changing installer source (AC3, AC4, AC6).
- [x] Correct the successful validator fixture's `.mcp.json` existence/content relationship and retain strong negative MCP/configuration assertions (AC5, AC6).
- [x] Run the focused suites under the default environment and with the explicit integration-enabled environment to show consistent execution and at least 43 passes (AC2, AC7).
- [x] Run focused lint, then hand the exact diff and receipts to independent `@qa` for assertion-strength and approved-flow review (AC6, AC8).
- [x] Root owner runs and records the required global gates; keep their evidence distinct from the focused story proof (AC8).

## Dev Notes

### Existing integration points

- `tests/setup.js:28` defines `describeIntegration` from `SKIP_INTEGRATION_TESTS`; ordinary Jest `describe` is the correct local-unit boundary.
- `tests/wizard/questions.test.js` imports question factories directly and performs no I/O.
- `tests/unit/wizard/validation/config-validator.test.js` mocks both `fs` and `js-yaml`; it performs no real filesystem or MCP access.
- `packages/installer/src/wizard/questions.js` is the current behavior reference and is explicitly read-only for this story.
- AEX-4.3 is the product/UX authority. Its current visual revision is independently approved, English-only, and uses three questions in the order stated in AC3.

### Failure mapping

| Suite | Failures | Required correction |
| --- | ---: | --- |
| `tests/wizard/questions.test.js` | 7 | Remove stale emoji/recommendation/language/four-question/obsolete-copy assumptions; assert current semantic choices, descriptions and order. |
| `tests/unit/wizard/validation/config-validator.test.js` | 1 | Make the positive fixture's `.mcp.json` state valid and intentional; keep parse/schema negatives strict. |

### Rollback and risk

Rollback is the exact two-test-file diff. The main risk is making tests green by deleting useful assertions or reverting approved product behavior. AC3, AC4, AC6 and independent QA control that risk. No runtime, dependency, data, deployment, security, provider, billing or external communication change is authorized.

## Testing

Minimum implementation evidence:

1. Before receipt: the supplied 43-test, 8-failure JSON/log pair remains unchanged.
2. Focused default-environment run of both files: 43 or more meaningful tests executed, 0 failed, 0 skipped.
3. Focused `SKIP_INTEGRATION_TESTS=false` run of both files: same suites execute and pass, proving no environment-sensitive hiding.
4. Default repository suite receipt identifies both test files as executed and passing without an integration opt-in.
5. Focused lint for the two changed test files.
6. Independent QA diff review confirms semantic coverage, valid positive fixtures, preserved negative assertions, no product edit and no approved-flow regression.
7. Root-owned `npm run lint`, `npm run typecheck`, and `npm test` remain required global gates and are reported independently.

## CodeRabbit Integration

**Story type:** Test / regression coverage. **Complexity:** Low. **Risk:** Medium because stale expectations could pressure an approved UX revert or be weakened into non-protective tests.

Primary agent: `@dev`. Independent quality gate: `@qa`. Pre-commit review focuses on suite classification, assertion strength, semantic coverage, fixture validity and scope confinement. Pre-PR CodeRabbit review is required only if a PR is later authorized and the configured CLI is available; deployment is outside scope. CodeRabbit unavailability must be recorded and does not replace independent QA.

## References and Evidence

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.3-PREMIUM-INSTALLER-UX.md` — approved installer behavior and evidence boundary.
- `docs/framework/epics/aexos-evolution/accumulated-context.md` — AEX-4.3 ownership of terminal installer presentation and truthful completion.
- `tests/setup.js:28` — integration-suite skip control.
- `packages/installer/src/wizard/questions.js` — current semantic question definitions; read-only in this story.
- `tests/wizard/questions.test.js` — seven stale assertion failures and hidden local question coverage.
- `tests/unit/wizard/validation/config-validator.test.js` — one invalid positive fixture and hidden fully mocked validator coverage.
- `coverage/local-unit-recheck.json` — SHA-256 `4095202FA0E5C8B3F4FB0838AC315CA15FBF1E148415CD036619AC7D3084672E`.
- `coverage/local-unit-recheck.log` — SHA-256 `08B3C53626816D322CC3A5813B9AD4EB37654F2D90B07DB00FF287E452812582`.

The two external evidence paths are rooted at `C:/Users/ppetr/.codex/visualizations/2026/10/10/01a12817-25bc-7500-87cc-a8367f1de09f/aexos-implementation/continuation-20261011/host-resolution-20261011/`.

## PO Readiness Rationale

The issue is reproduced, bounded to two test files, and mapped one-for-one to eight failures. Current product behavior and the no-product-change boundary are explicit. Acceptance distinguishes focused correction, default-suite inclusion, independent assertion review and root-owned global gates. No product decision, external dependency or architectural change is missing. The story is Ready for implementation at 10/10 specification clarity; implementation, QA acceptance, whole-story completion and release remain pending.

## File List

Planned implementation files only:

- `tests/wizard/questions.test.js`
- `tests/unit/wizard/validation/config-validator.test.js`

Story preparation artifacts:

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.29-INSTALLER-UNIT-REGRESSION-COVERAGE.md`
- `coverage/story-validation.md` under the external evidence root stated above.

No product source, existing story, roadmap, manifest, dependency, Jest setup, package script or configuration file is in implementation scope.

## Dev Agent Record

Root implementation under the native Codex allowance corrected exactly the two listed test files. Both default and explicit integration-enabled focused runs passed 43/43 tests in two suites with zero skips. Focused ESLint passed. The original 35-pass/8-failure receipt is preserved unchanged. Source product files and the approved AEX-4.3 flow were not edited. Exact before bytes, commands and JSON/log receipts are retained in the external evidence root under backup/installer/ and coverage/{focused-default,focused-opt-in}.{json,log}, plus coverage/focused-lint.log. Independent assertion review and root globals are separate pending gates; their current receipts will be recorded under coverage/review.md and evidence/continuation-gates.json.

## QA Results

Independent R2 bounded PASS: 45 default-environment tests, scoped lint and six independent MCP scenarios passed. Exact report is external host-resolution-20261011/coverage/review.md. Original FAIL and false-success reproduction are retained. Root-owned full-suite inclusion and global gates also passed; see the closure below.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-11 | 1.0 | Created bounded follow-up story from the reproduced installer unit-coverage gap; validated Ready for implementation. | Themis (PO) |


### 2026-10-11 bounded story closure

Root accepted this bounded correction after independent R2 QA (45 paired tests and six MCP scenarios), focused lint and all four global gates. Default full Jest executed both unit files (29 question tests and 16 validator tests); zero skipped in these files. The retained RED evidence remains unchanged. Global receipt: external host-resolution-20261011/evidence/continuation-gates.json; full results: continuation-tests.json; independent source review: coverage/review.md. CodeRabbit CLI was not available and no paid review was invoked. AEX-4.30 exclusively owns the one-line product change; AEX-4.29 retains its test-only scope. This closure does not close AEX-4.3 or AEX-4.21–4.28, certify native replacement/recovery, or authorize release.

This status/checklist update follows the unchanged-source global run and packaging. Its document-only delta is recorded in evidence/story-closure-delta.json; no tested source, fixture or dependency changed. The already built archive retains the pre-closure lifecycle text and remains the exact installed verification artifact.
