# Story AEX-4.17: SYNAPSE isolated candidate integration

| Field | Value |
| --- | --- |
| Story ID | AEX-4.17 |
| Epic | AEXOS Evolution |
| Status | Done — bounded local candidate accepted; inherited audit concerns and external review remain open |
| Executor | `@devops` candidate assembly; root `@dev` portable fixture |
| Quality gate | Independent `@qa`; `@po` evidence coherence |
| Dependencies | Accepted AEX-4.10 runtime fix and architecture; accepted AEX-4.14 Slice 1 integration plan |
| Quality gate tools | Exact base/hunk inspection; portable installed-package fixture; focused and full candidate gates; package/source hashes |

## Story

As an AEXOS maintainer, I want the accepted SYNAPSE portability correction reconstructed and verified as its own reviewable candidate on upstream main, so that it can progress toward normal integration without waiting for the unrelated first-value PR or inheriting unreviewed alpha changes.

## Verified context and scope

AEX-4.10 accepted the bounded runtime fix and actual installed tests in a combined local package. AEX-4.14 accepted a dependency-complete **plan**, explicitly leaving candidate assembly outside its documentation ownership. Neither completion proves an isolated Slice 1 commit or package on main. This story performs that next authorized step; it does not reopen the fix or certify other planned slices.

DevOps freshly confirmed main `5342f5a7c1ab6212087da2011265c11f1002503f` and existing PR #4 head `d848c7f58ad4a8da3afc93398ec608be4bf4d23a`, still blocked on normal review. Slice 1 is independent of the PR's changed runtime files. The accepted runtime diff is the bounded manifest comment and whole-distribution/ENOENT-only selection in `hook-runtime.js`, with matching regressions. Baseline already supplies domain loader, path utilities, engine, session manager and `js-yaml`.

[AUTO-DECISION] AEX-4.17 is available. Create this bounded integration story because original AEX-4.10 local acceptance and AEX-4.14 planning do not authorize claiming a reconstructed candidate has been verified. Existing user continuation authorizes assembly, local fixes within these AC and verification now; no extra user approval checkpoint is introduced. The previously accepted architecture is sufficient. DevOps owns isolated `codex/synapse-package-portability` reconstruction under `C:/AEXOS-LOCAL-TESTS/`; root owns the public fixture. No remote operation is part of this story.

## Acceptance criteria

- [x] AC1: Create and record an isolated candidate from exact main `5342f5a7c1ab6212087da2011265c11f1002503f`, preserving the shared dirty checkout and PR #4 worktree/head/body. Apply only the accepted `.aexos-core/core/synapse/runtime/hook-runtime.js` selection/comment change, its matching `tests/synapse/hook-runtime.test.js` regressions, the portable fixture below, selected public-safe story/verification documentation and the explicitly listed test-only preservation prerequisite. Verify baseline dependencies and exact included/excluded hunks before assembly. No version/dependency/lockfile change, alpha transplant, other Slice 0–5 implementation or unrelated generated registry content is included.
- [x] AC2: Add `scripts/e2e/synapse-package-runtime-smoke.js` as a portable public fixture owned by root `@dev`. It accepts an explicitly supplied **installed `@aexos/core` root**, validates that input, and invokes that installed distribution in a fresh isolated project with no project SYNAPSE runtime. It must demonstrate the installed sibling engine/session-manager identity, fixture-local manifest routing, config/TTL, session creation/reuse and state location. Verify every installed package file remains unchanged. A deliberately partial project runtime must refuse via the existing fail-soft result, never silently mix/fall back or mutate session state. Use real filesystem/modules; no workstation-specific paths, mocked runtime result or global installation. Scope cleanup to fixture-owned temporary paths and preserve supplied package/project bytes.
- [x] AC3: Run that same fixture against a real packed/installed pre-fix baseline and the reconstructed candidate. The baseline must reproduce the missing package-runtime behavior; candidate must pass. Record exact baseline/candidate commit or tree identity, actual package versions, TGZ SHA256/inventories, install commands, fixture commands, exit codes and preserved payload hashes. Use fresh npm-only consumers and caches outside both source checkouts, with no project `.aexos-core/core/synapse` and no shared-root module alias/junction that substitutes candidate source. Existing combined-package receipts are comparison history only, never this candidate's acceptance.
- [x] AC4: Run the reconstructed candidate's focused hook-runtime, session-manager and engine tests with zero skipped required cases, then its applicable lint, typecheck, full tests, build and manifest/package checks. Capture actual script availability and commands rather than copying scripts from the dirty alpha root. Preserve project precedence, absent-versus-broken runtime handling, module loading before mutation, project manifest/config/session semantics and output compatibility. Any baseline-only gate failure must be reproduced on the unchanged base and reported separately; it must not be relabelled PASS or repaired by copying unrelated changes. Missing future public-boundary tooling is not authority to import another slice. Required candidate checks must pass before accepted status; unresolved failures remain explicit integration blockers.
- [x] AC5: If actual gates require generated install-manifest/registry metadata, regenerate only the entries necessitated by the owned changes using the baseline's existing tooling, inspect the exact delta and preserve unrelated entries. Do not copy the root-wide generated files or leave test-created registry changes. Bind the final local reviewable candidate to its actual branch/base, local commit/tree, complete file/hunk list and freshly packed TGZ/manifest hashes; ensure verification reflects those exact bytes and repeat affected gates after any meaningful source change. If DevOps creates a local commit to seal it, it contains only reviewed story-owned content; never attribute dirty bytes to an old HEAD. No push/PR/tag/release operation is required.
- [x] AC6: Obtain independent QA on the exact reconstructed source and installed evidence, and PO scope/evidence review. Supply a portable public verification summary with exact commands and truthful results, selected source/story context and resolvable links, excluding private artifacts, credentials and workstation-only receipt links. The local evidence may retain absolute fixture paths separately. Record the candidate as ready for normal review only when its required gates pass; no external review, merge, npm publication, paid acceptance, native host execution or broader AEXOS integration is certified. Preserve outstanding slices and provider/release gates as remaining work.

## Tasks and ownership

- [x] Verify original source/plan scope, available story ID and DevOps reconstruction ownership.
- [x] DevOps creates isolated baseline/candidate and inventories exact accepted source/test/document selections (AC1).
- [x] Root implements the portable installed-package fixture with baseline failure and payload-preserving candidate checks (AC2-AC3).
- [x] DevOps assembles fixture/source changes and runs actual packed installed verification and candidate gates (AC3-AC4).
- [x] Inspect any required generated delta; seal actual reviewable local identity and public-safe summary (AC5).
- [x] Independent QA and PO review final exact candidate, file list, commands and exclusions (AC6).

DevOps owns candidate/worktree assembly and its full gates; root `@dev` owns only the new fixture in the shared source before DevOps applies its reviewed bytes. Accepted hook/test code is reused, not redesigned. `@po` owns this new story only. Coordinate a proven extra dependency with the lead within existing authorization before changing ownership; do not ask for generic user permission to perform this already authorized integration.

**Explicit gate prerequisite, owned by DevOps:** baseline `packages/installer/tests/unit/entity-registry-bootstrap.test.js` regenerates the real source registry without restoring it. Include only the two already accepted test hunks: snapshot original registry bytes/stat in `beforeAll` and restore original bytes/mode/access/modification times (or original absence) in `afterAll`; replace the timing test's shell `execSync`/silent catch with `execFileSync(process.execPath, [POPULATE_SCRIPT], ...)` so regeneration failure really fails. This exact diff was inspected against main and contains no Grok behavior. Run the suite and verify preservation. No Grok source, other installer test change or new production registry behavior is authorized by this prerequisite.

## Guidance, risks and validation

Use the AEX-4.10 whole-distribution architecture unchanged: fallback only when the entire project runtime is absent; partial, throwing, non-directory or inaccessible runtime remains fail-soft without fallback. The public fixture must resolve from its supplied installed root and leave sessions/config under its own project. Compare package inventories before and after; test success is insufficient if payload mutates. Existing workstation harness `artifacts/commercial-readiness-20260908/run-synapse-package-smoke.cjs` is a behavioral reference, not a portable publication dependency.

Main's package and scripts may differ from the combined alpha checkout. Record baseline behavior instead of expanding this slice to solve unrelated Doctor, CI, commercial packaging or orchestration issues. The locally packed artifact is validation material, not an authorized public distribution. Preserve existing package rights and never add private `pro/` content, credentials or provider receipts to it. Independent candidate review must distinguish source integration readiness from release readiness.

Primary risk is hidden dependence on the dirty root or a contaminated installed fixture. Mitigate through fresh consumers, explicit installed-root identity, no source aliases and exact hash comparisons. Secondary risk is generated-file drift during gates; inspect and restore only fixture/candidate-owned generated changes, never a global checkout reset. Rollback removes only the new owned worktree or its selected unaccepted patch after resolving its absolute path inside the task root; it does not touch previous accepted fixtures or PR #4.

## CodeRabbit Integration

**Type:** Runtime/package integration. **Complexity:** Medium. **Risk:** Medium. `@dev` owns fixture work; `@devops` owns Git/candidate assembly; independent `@qa` and `@po` review. Existing architect contract is reused; any actual contract change needs architect review, not an invented new approval gate.

- [x] Pre-commit: configured automated review if available, otherwise explicit unavailability plus independent review.
- [x] Candidate review: DevOps verifies exact scope and independent QA evidence before declaring locally ready.
- Pre-release: outside scope; normal provider/release gates remain open.

Self-healing: dev light (two iterations/15 minutes, critical); QA full (three/30, critical/high); DevOps report-only. Focus: portable real installed resolution, absent/broken runtime distinctions, payload preservation, baseline reproduction, narrow hunks and accurate local/remote claims.

## References

- [AEX-4.10](STORY-AEX-4.10-SYNAPSE-PACKAGE-RUNTIME-PORTABILITY.md#acceptance-criteria): accepted runtime behavior and original installed evidence.
- [AEX-4.14 Slice 1](RELEASE-CANDIDATE-SLICES-20260908.md#slice-1--synapse-package-portability): exact source/dependency/stack plan, independent of PR #4.
- [AEX-4.14](STORY-AEX-4.14-RELEASE-SOP-AND-CANDIDATE-TRACEABILITY.md#acceptance-criteria): planning acceptance versus subsequent candidate identity/gates.
- [SYNAPSE architecture](INSTALLER-SYNAPSE-HARDENING-CONTRACT-20260908.md#synapse-decision): preserved selection/state contract.
- [Accumulated context](accumulated-context.md): preserve parallel work and evidence boundaries.

## Story validation and file list

Brownfield completeness/safety/information checks and story-draft categories 1–6 PASS. Scope, accepted dependencies, baseline/current acceptance, fixture ownership, rollback and meaningful tests are concrete. **Ready** authorizes the described local reconstruction under existing user instructions; it does not certify work not yet performed.

- Created story: `docs/framework/epics/aexos-evolution/STORY-AEX-4.17-SYNAPSE-ISOLATED-CANDIDATE-INTEGRATION.md`.
- Added implementation fixture: `scripts/e2e/synapse-package-runtime-smoke.js`.
- Reused accepted source: `.aexos-core/core/synapse/runtime/hook-runtime.js`, `tests/synapse/hook-runtime.test.js`.
- Explicit test-only gate prerequisite: the two registry-preservation/fail-on-error hunks in `packages/installer/tests/unit/entity-registry-bootstrap.test.js`; no other test/source scope.
- Candidate public verification document: `docs/framework/epics/aexos-evolution/SYNAPSE-CANDIDATE-VERIFICATION-20260908.md`; public-safe copy of this story.
- Candidate generated install metadata: `.aexos-core/install-manifest.yaml`, restricted to generation timestamp and owned hook/registry hash/size entries.
- Confirmed AC5 generated registry scope: `.aexos-core/data/entity-registry.yaml`, only global `metadata.lastUpdated`, existing hook `checksum`/`lastVerified` and self-entry `lastVerified`; 848 entities/structure unchanged. The install manifest additionally records this registry hash/size with the owned hook and generation timestamp, preserving its other 1,166 entries. Cumulative candidate scope is eight files, including its two public documents.

## Dev Agent Record

Accepted isolated candidate: `C:/AEXOS-LOCAL-TESTS/synapse-package-portability`,
branch `codex/synapse-package-portability`, base
`5342f5a7c1ab6212087da2011265c11f1002503f`, final local commit
`33333c8cec54378e8f3d30875c3fcb8960d12460`, tree
`3cae58dd8bb70f1f08d6ebbe82bfaf1e2f4d2374`. Eight changed files match the
listed ownership. Final clean inventory: 4,248 files, SHA256
`f7bc4fc76a066edb8f5f5681190b6f19e7b31140eaac4f8bf92655da40233823`.
Version remains 5.3.0; this local candidate is distinct from published npm bytes.

Portable fixture SHA256:
`6225df6001d06ce5258378ab02214e3ca82c6e9e6bb7b405e85dc1b2645998dc`.
The same fixture against actual packed/installed baseline fails as expected with
`Absent project runtime must use the installed sibling engine`, preserving all
3,452 baseline payload files. Baseline TGZ SHA256:
`a52439a951f899bf52ae7fa26b8c324c57e5942de2a9ee3c57428a39fa728641`.
Final candidate TGZ SHA256:
`2fb13039511e029e667b0cd4ac5be0ab0ddd5cb3957b62eba9f6a1d13a7a17e9`.
All 3,455 final payloads match the committed candidate and fresh installation;
the installation lock binds this exact archive. Final fixture exits zero on
Node v24.15.0, passes nine checks, preserves all 3,455 files and verifies 51
modules physically loaded from the supplied installed package. Installed
inventory SHA256: `cd73f6a75d7b7869e101b7714cea53529d4162fb4d6a416d867d052883c3d899`.

Four focused suites pass 134 tests without skips. All eight candidate gates exit
zero: lint, typecheck, full tests, build, manifest, package completeness, port
denylist and registry determinism. Full suite: 9,875 passed, zero failed and
172 existing skipped tests; 394 passed/12 skipped suites, 406 total. Before/after
full-gate source inventory (4,247 files) remains
`c47a477d37b82fc795cbc4ea035763d5b721d5cc6f514481ff553b54fc61111c`.

The initial seven-file local commit `70a4f12` ran the normal IDS post-commit
hook. Its four-field registry metadata update and matching manifest entry were
included under AC5, retaining 848 entities and 1,166 unrelated manifest entries.
Only those two metadata files and two reviewed documents differ from the original
full-gate inventory; runtime, tests and fixture remain unchanged. Five affected
checks pass after that delta, including 19 bootstrap tests. The final package
then received its own fresh installation and nine-scenario fixture acceptance.
The original full-suite receipt is preserved rather than attributed to changed
metadata. An intermediate TGZ containing a task-created ignored registry log was
rejected; only the clean final archive above is accepted.

Evidence is under `artifacts/commercial-readiness-20260908/aex-4.17/`:
`final-candidate.json`, `candidate-gates.json`, `generated-checks.json`,
`fixture-verification.md`, baseline/final raw logs and independent reviews.
Final receipt SHA256:
`105173d8b63474e6e38e47108e3759e884203101de08e941b9e10823a45017a8`.
All eleven evidence-file hashes named by that receipt matched during PO review.

## QA Results

Independent `qa-final.md` APPROVED the exact local candidate and all six ACs.
QA independently compared all 3,455 archive payloads with committed and installed
bytes, checked final source identity and generated scope, and preserved baseline
negative controls. CodeRabbit was unavailable; the checked review alternative
is explicit unavailability plus independent QA, not automated clearance.

PO final evidence-coherence review is PASS in
`artifacts/commercial-readiness-20260908/aex-4.17/po-final.md`. All six original
ACs and six tasks are complete for bounded local integration. The frozen public
candidate story stays Ready for Review; final local acceptance is recorded here
and in external receipts without altering its packaged bytes.

The inherited unchanged lockfile audit remains CONCERNS: one high `fast-uri`
and one moderate `@humanfs/node` finding. AEX-4.18 owns their separate remediation;
this story provides no audit clearance or release approval. Existing skips add
no acceptance coverage. Normal external review, authorized draft PR delivery,
merge/publication, native providers, paid acceptance, Office and other integration
slices remain separate work. No remote action is claimed by this story.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready actual isolated Slice 1 reconstruction and portable installed SYNAPSE verification; no remote actions. | Themis / `@po` |
| 2026-09-08 | 1.1 | Local candidate accepted against final commit/archive and independent QA/PO; inherited audit and external gates retained. | Themis / `@po` |
