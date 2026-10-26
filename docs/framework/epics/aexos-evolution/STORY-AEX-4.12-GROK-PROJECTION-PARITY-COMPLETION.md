# Story AEX-4.12: Grok projection parity completion

| Field | Value |
| --- | --- |
| Story ID | AEX-4.12 |
| Status | Done — independently approved local scope; native/provider acceptance excluded |
| Epic | AEXOS Evolution |
| Executor | `@dev` |
| Quality gate | `@architect`, independent `@qa` |
| Quality gate tools | Existing Grok projection validator; compatibility contract/aggregate tests; selected-host packed smoke |
| Depends on | AEX-4.8 managed Grok projection/preservation |

## Story

As an AEXOS maintainer selecting Grok, I want existing Grok projection validation included in the compatibility parity contract, so that missing or drifted managed artifacts fail the gate while native host execution remains honestly distinguished from generated-file parity.

## Context and scope

The diagnostic's historical missing-wizard claim is superseded: current wizard has seven choices including Grok, and AEX-4.8 already implements managed manifests, preservation and selected-host integration. The current ledger records 78 projection artifacts passing the existing validator. `.aexos-core/infrastructure/scripts/validate-parity.js` and its default compatibility contract still omit Grok. Close that integration gap rather than duplicating the generator, reinstalling host support or copying upstream blindly.

[AUTO-DECISION] AEX-4.12 is available. Reuse existing `scripts/validate-grok-projection.js:validateGrokProjection`, which returns `valid`, findings and `evidenceLevel: generated-projection-comparison` / `hostRuntime: NOT_ASSESSED`. Adapt its result to the aggregate without changing evidence meaning. This is a later implementation story, not authority to alter the current verification batch.

## Acceptance criteria

- [x] AC1: The main `validate:parity` execution and default `.aexos-core/infrastructure/contracts/compatibility/aexos-4.0.4.yaml` contract include Grok's existing projection validator. Normalize its result into the current aggregate schema without treating a missing/invalid result, exception or skipped required validator as success. Preserve existing Claude/Codex/Gemini checks and their failure propagation.
- [x] AC2: Reports and compatibility docs distinguish generated projection parity from native host runtime acceptance. Grok success means canonical/generated managed content matches; it cannot claim real native hooks, provider permissions, cross-host execution or sessions. Keep `hostRuntime: NOT_ASSESSED` or equivalent explicit unverified status until real host evidence exists. Artifact counts are observed metrics, not hardcoded proof.
- [x] AC3: Reuse AEX-4.8 generation/managed manifests and preservation behavior. Missing, modified, stale-owned or ownership-drifted files must fail the relevant projection gate. Validation must not rewrite the user's selected host tree, delete custom files, run a global sync or create unselected host directories. Add `validate:skills:grok` only as a compatibility alias if current naming needs it; retain the existing validator command and avoid a second implementation.
- [x] AC4: Add focused tests for aggregate Grok inclusion, result normalization, valid projection, missing/drifted artifacts, validator exception/malformed result and existing host behavior. Verify default contract enforcement and truthful human/JSON reports. Preserve supported custom-contract behavior; a contract that requires Grok cannot silently omit its validator result.
- [x] AC5: Run actual selected-Grok installation/update from a freshly packed Core candidate in an isolated fixture under `C:/AEXOS-LOCAL-TESTS/`. Record exact package/version/hash, selected host, validator output and user-file preservation; confirm unrelated host directories remain absent. Exercise parity through the supported contract/context without fabricating unselected host artifacts. Separately record native hooks/provider acceptance as unverified unless an actual Grok runtime test supplies evidence.
- [x] AC6: Run relevant existing Grok generator/preservation/installer and compatibility regressions, then lint, typecheck, tests, build and Core package-boundary checks. Record exact commands/results and independent architecture/QA review. Do not modify provider hooks, add a new control plane, change entitlement policy or claim commercial/native release readiness. Brand config semantic gaps are excluded.

## Tasks and ownership

- [x] Confirm existing Grok implementation, parity omission and available story ID; define bounded criteria.
- [x] Integrate the existing Grok validator with parity and the default compatibility contract (AC1-AC2).
- [x] Preserve read-only validation/managed ownership; add only a needed naming alias and truthful compatibility docs (AC3).
- [x] Add aggregate/contract regressions and actual selected-host packed smoke (AC4-AC5).
- [x] Run affected gates, update evidence/file list and obtain independent review (AC6).

Primary source ownership: `.aexos-core/infrastructure/scripts/validate-parity.js`, `.aexos-core/infrastructure/contracts/compatibility/aexos-4.0.4.yaml`, focused compatibility tests and their referenced compatibility documentation. A minimal adapter/export adjustment to `scripts/validate-grok-projection.js` and optional package-script alias are permitted if necessary. Coordinate package.json ownership before any alias edit. Existing generators, hooks and installer require no redesign; unexpected changes need explicit lead coordination. `@po` owns this document only.

## Guidance, risks and review

References: [diagnostic ledger](../../../../artifacts/commercial-readiness-20260908/diagnostic-status.md), [AEX-4.8](STORY-AEX-4.8-HARDENED-GROK-PROJECTION.md), [accumulated context](accumulated-context.md#2026-09-07-runtime-boundaries-and-local-observation), and the owner's historical diagnosis attachment at `C:/Users/ppetr/.codex/attachments/710e4de9-1aea-41d2-8b8e-e41da84aba91/pasted-text-1.txt`.

The existing validator already creates its own temporary comparison projection and checks managed contents without rewriting the target. Reuse it. The main risk is converting its `valid` field incorrectly or labeling projection success as native parity. Mitigate with failure-injection tests and explicit evidence levels. Rollback only the parity integration/contract/docs/test edits; preserve existing AEX-4.8 installed/user state and concurrent work.

**CodeRabbit Integration:** Integration, medium complexity/risk; `@dev` implements, `@architect` reviews contract semantics, independent `@qa` verifies. Pre-commit review or documented graceful degradation; `@devops` pre-PR if requested. No deployment in scope. Self-healing: dev light (2 iterations/15 minutes, critical), QA full (3/30, critical/high), DevOps report-only. Focus: fail propagation, read-only behavior, custom-file preservation and evidence labeling.

## Story validation and file list

Brownfield completeness/safety checks and applicable story-draft checklist categories pass. No new dependency or native provider assumption is required. Ready for later implementation; generated/native acceptance remains distinct.

- Created: this story.
- Planned: parity script, default contract, focused tests/docs, minimal existing-validator adapter or naming alias only if needed, isolated packed evidence.

## Dev Agent Record

Implemented 2026-09-08 by `@dev`, with independent architecture review in
`artifacts/commercial-readiness-20260908/aex-4.12/architecture.md`.

IDS decision: REUSE the managed Grok generator and validator; ADAPT the parity
adapter and contract. Relocate the single validator body next to the generator,
retaining the existing root command as a re-export/CLI wrapper. This minimal
portability correction is needed because installation copies `.aexos-core`
without package-root `scripts/`. No duplicate validator or global sync added.

The adapter requires schema/version, positive observed count, boolean validity,
typed findings and explicit projection-only evidence. Missing/malformed/skipped
results, findings and arbitrary thrown values fail visibly. All registered
validators still run with a custom contract. Native host execution remains
`NOT_ASSESSED`. The guide now points to the actual default contract rather than
a nonexistent 4.2.11 contract.

Regression-first run: 22 failed / 3 passed before implementation. Initial
implementation passed 44 focused tests; independent QA found malformed errors,
textual skipped flags and thrown null could evade or abort reporting. Corrected
all three and added regressions: 53 tests passed across the three focused suites.
See `artifacts/commercial-readiness-20260908/aex-4.12/focused-results.json`.
Targeted ESLint executed with `--no-ignore` for hidden Core scripts: zero errors;
six pre-existing contract-summary indentation warnings retained. Full gates are
being run against a new isolated public snapshot, not the prior story's source.

Actual package: `@aexos/core@6.0.0-alpha.1`, SHA-256
`c7b30c5504ef0e882d36afbe2c03d13623f4631f8cfa231a9953d13a86786c01`,
1,921 files. Receipt with exact commands/source bindings:
`artifacts/commercial-readiness-20260908/aex-4.12/packed-oH29OQ/receipt.json`.
Fixture: `C:/AEXOS-LOCAL-TESTS/aex412-grok-Az2AxI/project with spaces & literal!`.
Real installed CLI `install --ci --yes --ide grok` and a same-candidate repeat
both exit 0. User file and outside-managed-section rule hashes remain unchanged;
six unselected host directories stay absent. The project-copied validator exits
0 before/after without project-root scripts. Installed package hashes remain
unchanged. This repeat tests update through installation, not a registry upgrade.

For the installed maintainer custom-contract check only, the harness copied the
exact package matrix documentation (receipt records its hash); it fabricated no
host trees. Grok passed and contract violations were empty, while overall parity
correctly exited 1 for unselected hosts. Changing an actual managed agent caused
Grok and its contract to fail, without validation changing any project files.
Initial `packed/receipt.json` records a harness-only npm-init invalid package
name from the metacharacter directory; that attempt never ran the installer and
is retained as failed evidence. The successful fixture explicitly supplies a
valid npm name in its harness-created package.json.

Exact product file list:

- `.aexos-core/infrastructure/scripts/validate-parity.js`
- `.aexos-core/infrastructure/scripts/grok-skills-sync/validate.js` (relocated implementation)
- `.aexos-core/infrastructure/contracts/compatibility/aexos-4.0.4.yaml`
- `scripts/validate-grok-projection.js` (compatibility wrapper)
- `docs/ide-integration.md`
- `tests/unit/validate-parity.test.js`
- `tests/unit/grok-projection-audit.test.js`
- `packages/installer/tests/unit/entity-registry-bootstrap.test.js` (restore registry after actual regeneration; fail on subprocess errors)
- This story and evidence under `artifacts/commercial-readiness-20260908/aex-4.12/`.

No package scripts, installer/generator semantics, provider hooks, licenses or
commercial configuration changed.

Final acceptance: independent QA APPROVED the exact isolated candidate
`C:/AEXOS-LOCAL-TESTS/aex412-core-4ISL9f`. Lint, typecheck, full tests, build and
package boundary passed; 10,625 tests passed, 172 existing skips disclosed,
53 focused parity/Grok tests and 19 bootstrap tests passed. All 4,327 candidate
source files remained byte-identical. The eight scoped source/test bindings match
the current checkout. The 1,921-file packed candidate above remains the installed
mechanics evidence; the later source change corrected only the test fixture.

The first full test run exposed an existing bootstrap test that regenerated the
tracked entity registry without restoring it. Its all-green command results did
not pass source integrity and were retained. The corrected test restores original
bytes, mode and timestamps (Node Date precision) after real bootstrap verification;
subprocess failures now fail the test instead of becoming silent success. The
fresh full run proved the fix without excluding the registry from hash checks.

Concurrent AEX-4.11 README changes are deliberately separate: the original final
gate receipt retains `allPassed: false` for whole-current-checkout identity. The
scoped acceptance receipt records successful unchanged-candidate gates and the
documentation delta; it does not claim those later README bytes were in the full
run. See `artifacts/commercial-readiness-20260908/aex-4.12/gates-final/verification.md`
and `verification-summary.json`. No additional full run is needed for separately
reviewed documentation-only work. CodeRabbit was unavailable on this host;
independent architecture and QA were performed, not remote automated review.

DoD: requirements, scoped implementation, relevant regressions, real CLI
installation/update, preservation, documentation and file inventory verified.
No dependencies or provider configuration added. Native Grok hooks, real provider
communication and release certification remain outside this bounded acceptance.

## QA Results

**APPROVED — bounded AEX-4.12 implementation and exact tested snapshot.** Independent QA reproduced and verified fixes for malformed errors/skipped evidence and arbitrary thrown values; all 12 checks continue under custom contracts. Focused tests: 53 passed, zero skipped. Actual packed Core SHA-256 `c7b30c5504ef0e882d36afbe2c03d13623f4631f8cfa231a9953d13a86786c01` passed selected-Grok installation/repeat, read-only drift validation, user preservation and unselected-host absence.

Fresh isolated candidate `C:/AEXOS-LOCAL-TESTS/aex412-core-4ISL9f` passed lint, typecheck, full tests, build, parity and Core boundary at `2026-09-08T17:15:07.216Z`: 10,625 tests passed, zero failed, 172 skipped; 53 focused cases executed without skips. QA independently matched all 4,327 candidate source hashes and eight scoped bindings. The bootstrap test pollution correction restores original registry state and propagates subprocess failure; independent present/absent restoration probes passed.

The gate receipt preserves `allPassed:false` for a concurrent current-root `README.md` change belonging to authorized AEX-4.11 work. The tested candidate itself has zero source changes; approval is limited to that candidate and unchanged scoped files, not whole current-root identity or the concurrent README rewrite. Skipped tests and native Grok/provider execution remain unverified. No hosted, payment or commercial release acceptance is implied.

Full review and provenance: `artifacts/commercial-readiness-20260908/aex-4.12/qa.md`; final gates: `aex-4.12/gates-final/receipt.json` under the same evidence base. Story lifecycle/checklists remain owned by the lead.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready existing-Grok projection parity integration with native evidence boundary. | Themis / `@po` |
