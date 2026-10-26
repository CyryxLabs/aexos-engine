# Story AEX-4.30: MCP Validation Failure Status

## Status

Done

Accepted after independent QA and root global gates. The bounded closure below supersedes pending implementation notes; no broader story or release approval is inferred.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [focused-jest, validator-regression, default-suite-inclusion, eslint, independent-review]

## Story

**As an** AEXOS operator, **I want** an invalid `.mcp.json` schema to make configuration validation fail, **so that** validation never reports success while also returning an MCP schema error.

## Context and Scope

Independent AEX-4.29 QA reproduced a product defect with otherwise valid mocked files and valid JSON `.mcp.json = {}`: `validateConfigs()` returned `success: true` while `errors` contained `MCP_CONFIG_INVALID_SCHEMA`. In `validateMCPConfig`, the invalid-schema branch appends the error and returns without setting aggregate success false.

AEX-4.29 remains a test-only coverage correction and explicitly prohibits product edits. This distinct story owns the minimal product correction and the existing validator unit test. It does not reopen AEX-4.29's approved test reclassification or AEX-4.3's installer behavior.

[AUTO-DECISION] Minimal correction → set the existing aggregate validation status to false in the existing MCP invalid-schema branch. Keep the current error code, severity, message and validation order unless a focused test proves a necessary compatibility correction.

[AUTO-DECISION] Regression boundaries → add clean, isolated cases for a missing `mcpServers` key and a scalar `mcpServers` value. Both are already invalid under the existing rule; this story introduces no broader MCP schema policy.

[AUTO-DECISION] Resource route → use only the native Codex allowance and existing repository dependencies. No external paid API, provider call, package installation, publication, deployment or purchase is authorized.

## Acceptance Criteria

- [x] **AC1 — Correct aggregate failure status.** When an existing `.mcp.json` parses as valid JSON but fails the current `mcpServers` schema check, `validateConfigs()` returns `success: false` and retains the existing `MCP_CONFIG_INVALID_SCHEMA` error. It must not add a successful `MCP Config` check for the same invalid input.
- [x] **AC2 — Missing-key regression.** With otherwise valid, intentional `.env`, core-config and `.gitignore` fixtures and `.mcp.json = {}`, the unit test asserts `success` is exactly false, the MCP error collection is exactly one `MCP_CONFIG_INVALID_SCHEMA` error with the expected file/message/severity, and no MCP-success check exists.
- [x] **AC3 — Scalar regression.** With the same clean non-MCP fixtures and valid JSON containing a scalar `mcpServers` value, the unit test asserts `success` is exactly false, the same exact MCP schema error contract, and no MCP-success check. Do not broaden this story into server-entry, transport, command, URL, array, or nested-schema validation policy.
- [x] **AC4 — Preserve accepted behavior.** A valid object-valued `mcpServers` configuration, including the existing empty-object success fixture, remains successful; an absent optional `.mcp.json` remains skipped without failure; malformed JSON remains `MCP_CONFIG_PARSE_ERROR` with `success: false`. Environment, core-config and `.gitignore` validation behavior remains unchanged.
- [x] **AC5 — Confine implementation.** Change only `packages/installer/src/wizard/validation/validators/config-validator.js` and `tests/unit/wizard/validation/config-validator.test.js`. Do not edit question flow, AEX-4.29 implementation, Jest/global setup, scripts, dependencies, manifests, configuration, schemas or other validators/tests.
- [x] **AC6 — Focused and regression proof.** The validator unit suite passes with the two new meaningful schema cases under the default test environment. Run the existing paired AEX-4.29 focused suites to prove question coverage remains green, and demonstrate the validator suite executes in the default suite without an integration opt-in.
- [x] **AC7 — Independent QA and evidence truth.** Independent `@qa` reproduces both invalid-schema cases against the corrected implementation, verifies exact false status/error/no-success-check behavior, confirms preserved valid/absent/parse paths, and checks the exact two-file diff for scope. A focused pass is not a whole-story, release or global-gate claim.
- [x] **AC8 — Separate global gates.** Run focused ESLint for the two changed files. Root ownership retains `npm run lint`, `npm run typecheck`, `npm test` and any other required repository gates; record their results separately. Any unavailable or failing gate remains explicit and cannot be represented as passing.

## Tasks / Subtasks

- [x] Preserve and bind the independent false-success reproduction before editing (AC1, AC7).
- [x] Set aggregate success false in the existing MCP invalid-schema branch without changing the schema rule or error contract (AC1, AC3-5).
- [x] Add isolated missing-key and scalar-schema unit cases with otherwise valid fixtures and exact negative assertions (AC2-4).
- [x] Rerun existing valid-object, optional-absent and malformed-JSON cases and the full validator suite (AC4, AC6).
- [x] Run the paired AEX-4.29 focused suites under the default environment and verify the validator file is executed without integration opt-in (AC6).
- [x] Run focused ESLint and hand the exact two-file diff plus receipts to independent `@qa` (AC7-8).
- [x] Root owner runs and records required global gates separately (AC8).

## Dev Notes

The relevant branch is in `validateMCPConfig(results)` in `packages/installer/src/wizard/validation/validators/config-validator.js`. It already emits:

- severity: `medium`
- message: `.mcp.json missing mcpServers key`
- file: `.mcp.json`
- code: `MCP_CONFIG_INVALID_SCHEMA`

The branch must also make the aggregate result unsuccessful before returning. Keep `validateConfigs()` orchestration and all other validator behavior unchanged.

Use explicit per-path `fs.existsSync` and `fs.readFileSync` mocks so the invalid MCP case is the only failure source. `yaml.load` must return a valid core-config object for these cases. Filter MCP errors by component file/code and assert the exact error object; also assert that `result.checks` contains no `MCP Config` item with `status: 'success'`.

### Risk and rollback

The primary risk is either leaving contradictory `success/errors` output or expanding the MCP schema contract unintentionally. The two exact regression cases and preservation matrix bound that risk. Rollback is the exact two-file diff; no data, migration, runtime provider, dependency or external-system rollback is involved.

## Testing

Minimum implementation evidence:

1. Retained pre-fix reproduction for `.mcp.json = {}` showing `success: true` plus `MCP_CONFIG_INVALID_SCHEMA`.
2. Default-environment validator suite with both new schema cases passing and no skips.
3. Focused AEX-4.29 pair passing under the default environment, with this validator suite executed rather than skipped.
4. Explicit preservation checks for valid object, optional absence and malformed JSON.
5. Focused ESLint for the two implementation files.
6. Independent QA reproduction and exact two-file inventory/diff review.
7. Separately reported root-owned lint, typecheck and full-test gates.

## CodeRabbit Integration

**Story type:** Validation logic / regression. **Complexity:** Low. **Risk:** Medium because a false-success result can allow invalid configuration to appear accepted.

Primary agent: `@dev`; independent gate: `@qa`. Review focus is aggregate status/error consistency, isolated fixtures, preservation of valid/absent/parse behavior, exact scope and absence of schema-policy expansion. Use CodeRabbit only if the configured native CLI is available within the existing allowance; record unavailability. No pre-deployment gate is applicable.

## References and Evidence

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.29-INSTALLER-UNIT-REGRESSION-COVERAGE.md` — test-only boundary and validator-suite default execution.
- `packages/installer/src/wizard/validation/validators/config-validator.js` — current false-success branch.
- `tests/unit/wizard/validation/config-validator.test.js` — existing valid, absent and parse-error coverage; target for the two schema regressions.
- `coverage/review.md` — independent QA finding; SHA-256 `D7A4AC3F878F947ACFA2A29325C56A8B17B00921B69B683A0DB0571802C42E07`.
- `coverage/independent-review/invalid-schema-result.json` — reproduced result; SHA-256 `AEC942563324258C88E77CAC9F9ECD1A8C8F3CD9B4D7F19A2D1E68A974B44960`.

The external evidence paths are rooted at `C:/Users/ppetr/.codex/visualizations/2026/10/10/01a12817-25bc-7500-87cc-a8367f1de09f/aexos-implementation/continuation-20261011/host-resolution-20261011/`.

## PO Readiness Rationale

The defect is independently reproduced and its exact missing state transition is identified. The permitted change is limited to one existing product branch and one existing unit suite. Expected invalid, valid, absent and parse behaviors are explicit; schema expansion is prohibited; focused, default, independent and global evidence layers are separated. No material product decision or technical ambiguity remains. The story is Ready for implementation, while all implementation and acceptance evidence remains pending.

## File List

Planned implementation files only:

- `packages/installer/src/wizard/validation/validators/config-validator.js`
- `tests/unit/wizard/validation/config-validator.test.js`

Story preparation artifacts:

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.30-MCP-VALIDATION-FAILURE-STATUS.md`
- `coverage/mcp-story-validation.md` under the external evidence root stated above.

## Dev Agent Record

Root implementation under the native Codex allowance changed one product line: the existing MCP invalid-schema branch now sets results.success=false. The existing schema rule and diagnostic are unchanged. Two table cases protect missing and scalar mcpServers with otherwise valid mocks and exact false/error/no-success-check assertions. Existing valid, absent and parse tests gained aggregate assertions. Both new tests failed before the product fix; retain coverage/mcp-red.json/log (14 passed, 2 failed). The final focused pair passes 45 tests under default and opt-in environments, with no skips. Commands/exits and lint are recorded in coverage/focused-r2-exits.json and focused-r2-*.{json,log}; exact before bytes are in backup/installer/. QA and root global gates are separate.

## QA Results

Independent R2 bounded PASS: 45 default-environment tests, scoped lint and six independent MCP scenarios passed. Exact report is external host-resolution-20261011/coverage/review.md. Original FAIL and false-success reproduction are retained. Root-owned full-suite inclusion and global gates also passed; see the closure below.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-11 | 1.0 | Created minimal follow-up for the independently reproduced MCP invalid-schema false-success defect. | Themis (PO) |


### 2026-10-11 bounded story closure

Root accepted this bounded correction after independent R2 QA (45 paired tests and six MCP scenarios), focused lint and all four global gates. Default full Jest executed both unit files (29 question tests and 16 validator tests); zero skipped in these files. The retained RED evidence remains unchanged. Global receipt: external host-resolution-20261011/evidence/continuation-gates.json; full results: continuation-tests.json; independent source review: coverage/review.md. CodeRabbit CLI was not available and no paid review was invoked. AEX-4.30 exclusively owns the one-line product change; AEX-4.29 retains its test-only scope. This closure does not close AEX-4.3 or AEX-4.21–4.28, certify native replacement/recovery, or authorize release.

This status/checklist update follows the unchanged-source global run and packaging. Its document-only delta is recorded in evidence/story-closure-delta.json; no tested source, fixture or dependency changed. The already built archive retains the pre-closure lifecycle text and remains the exact installed verification artifact.
