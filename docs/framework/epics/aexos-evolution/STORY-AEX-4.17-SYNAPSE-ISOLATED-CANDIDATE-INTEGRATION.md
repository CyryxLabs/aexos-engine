# Story AEX-4.17: SYNAPSE isolated candidate integration

| Field | Value |
| --- | --- |
| Story ID | AEX-4.17 |
| Epic | AEXOS Evolution |
| Status | Ready for Review — source gates passed; final archive identity and acceptance recorded outside the package |
| Executor | `@devops` candidate assembly; root `@dev` portable fixture |
| Quality gate | Independent `@qa`; `@po` evidence coherence |
| Dependencies | Accepted AEX-4.10 runtime fix and architecture; accepted AEX-4.14 Slice 1 integration plan |
| Quality gate tools | Exact base/hunk inspection; portable installed-package fixture; focused and full candidate gates; package/source hashes |

## Story

As an AEXOS maintainer, I want the accepted SYNAPSE portability correction reconstructed and verified as its own reviewable candidate on upstream main, so that it can progress toward normal integration without waiting for the unrelated first-value PR or inheriting unreviewed alpha changes.

## Verified context and scope

AEX-4.10 accepted the bounded runtime fix and actual installed tests in a combined local package. AEX-4.14 accepted a dependency-complete **plan**, explicitly leaving candidate assembly outside its documentation ownership. Neither completion proves an isolated Slice 1 commit or package on main. This story performs that next authorized step; it does not reopen the fix or certify other planned slices.

DevOps freshly confirmed main `5342f5a7c1ab6212087da2011265c11f1002503f` and existing PR #4 head `d848c7f58ad4a8da3afc93398ec608be4bf4d23a`, still blocked on normal review. Slice 1 is independent of the PR's changed runtime files. The accepted runtime diff is the bounded manifest comment and whole-distribution/ENOENT-only selection in `hook-runtime.js`, with matching regressions. Baseline already supplies domain loader, path utilities, engine, session manager and `js-yaml`.

[AUTO-DECISION] AEX-4.17 is available. Create this bounded integration story because original AEX-4.10 local acceptance and AEX-4.14 planning do not authorize claiming a reconstructed candidate has been verified. Existing user continuation authorizes assembly, local fixes within these AC and verification now; no extra user approval checkpoint is introduced. The previously accepted architecture is sufficient. DevOps owns isolated `codex/synapse-package-portability` reconstruction in an isolated worktree; root owns the public fixture. No remote operation is part of this story.

## Acceptance criteria

- [x] AC1: Create and record an isolated candidate from exact main `5342f5a7c1ab6212087da2011265c11f1002503f`, preserving the shared dirty checkout and PR #4 worktree/head/body. Apply only the accepted `.aexos-core/core/synapse/runtime/hook-runtime.js` selection/comment change, its matching `tests/synapse/hook-runtime.test.js` regressions, the portable fixture below, selected public-safe story/verification documentation and the explicitly listed test-only preservation prerequisite. Verify baseline dependencies and exact included/excluded hunks before assembly. No version/dependency/lockfile change, alpha transplant, other Slice 0–5 implementation or unrelated generated registry content is included.
- [x] AC2: Add `scripts/e2e/synapse-package-runtime-smoke.js` as a portable public fixture owned by root `@dev`. It accepts an explicitly supplied **installed `@aexos/core` root**, validates that input, and invokes that installed distribution in a fresh isolated project with no project SYNAPSE runtime. It must demonstrate the installed sibling engine/session-manager identity, fixture-local manifest routing, config/TTL, session creation/reuse and state location. Verify every installed package file remains unchanged. A deliberately partial project runtime must refuse via the existing fail-soft result, never silently mix/fall back or mutate session state. Use real filesystem/modules; no workstation-specific paths, mocked runtime result or global installation. Scope cleanup to fixture-owned temporary paths and preserve supplied package/project bytes.
- [ ] AC3: Run that same fixture against a real packed/installed pre-fix baseline and the reconstructed candidate. The baseline must reproduce the missing package-runtime behavior; candidate must pass. Record exact baseline/candidate commit or tree identity, actual package versions, TGZ SHA256/inventories, install commands, fixture commands, exit codes and preserved payload hashes. Use fresh npm-only consumers and caches outside both source checkouts, with no project `.aexos-core/core/synapse` and no shared-root module alias/junction that substitutes candidate source. Existing combined-package receipts are comparison history only, never this candidate's acceptance.
- [x] AC4: Run the reconstructed candidate's focused hook-runtime, session-manager and engine tests with zero skipped required cases, then its applicable lint, typecheck, full tests, build and manifest/package checks. Capture actual script availability and commands rather than copying scripts from the dirty alpha root. Preserve project precedence, absent-versus-broken runtime handling, module loading before mutation, project manifest/config/session semantics and output compatibility. Any baseline-only gate failure must be reproduced on the unchanged base and reported separately; it must not be relabelled PASS or repaired by copying unrelated changes. Missing future public-boundary tooling is not authority to import another slice. Required candidate checks must pass before accepted status; unresolved failures remain explicit integration blockers.
- [ ] AC5: If actual gates require generated install-manifest/registry metadata, regenerate only the entries necessitated by the owned changes using the baseline's existing tooling, inspect the exact delta and preserve unrelated entries. Do not copy the root-wide generated files or leave test-created registry changes. Bind the final local reviewable candidate to its actual branch/base, local commit/tree, complete file/hunk list and freshly packed TGZ/manifest hashes; ensure verification reflects those exact bytes and repeat affected gates after any meaningful source change. If DevOps creates a local commit to seal it, it contains only reviewed story-owned content; never attribute dirty bytes to an old HEAD. No push/PR/tag/release operation is required.
- [ ] AC6: Obtain independent QA on the exact reconstructed source and installed evidence, and PO scope/evidence review. Supply a portable public verification summary with exact commands and truthful results, selected source/story context and resolvable links, excluding private artifacts, credentials and workstation-only receipt links. The local evidence may retain absolute fixture paths separately. Record the candidate as ready for normal review only when its required gates pass; no external review, merge, npm publication, paid acceptance, native host execution or broader AEXOS integration is certified. Preserve outstanding slices and provider/release gates as remaining work.

## Tasks and ownership

- [x] Verify original source/plan scope, available story ID and DevOps reconstruction ownership.
- [x] DevOps creates isolated baseline/candidate and inventories exact accepted source/test/document selections (AC1).
- [x] Root implements the portable installed-package fixture with baseline failure and payload-preserving candidate checks (AC2-AC3).
- [ ] DevOps assembles fixture/source changes and runs actual packed installed verification and candidate gates (AC3-AC4).
- [ ] Inspect any required generated delta; seal actual reviewable local identity and public-safe summary (AC5).
- [ ] Independent QA and PO review final exact candidate, file list, commands and exclusions (AC6).

DevOps owns candidate/worktree assembly and its full gates; root `@dev` owns only the new fixture in the shared source before DevOps applies its reviewed bytes. Accepted hook/test code is reused, not redesigned. `@po` owns this new story only. Coordinate a proven extra dependency with the lead within existing authorization before changing ownership; do not ask for generic user permission to perform this already authorized integration.

**Explicit gate prerequisite, owned by DevOps:** baseline `packages/installer/tests/unit/entity-registry-bootstrap.test.js` regenerates the real source registry without restoring it. Include only the two already accepted test hunks: snapshot original registry bytes/stat in `beforeAll` and restore original bytes/mode/access/modification times (or original absence) in `afterAll`; replace the timing test's shell `execSync`/silent catch with `execFileSync(process.execPath, [POPULATE_SCRIPT], ...)` so regeneration failure really fails. This exact diff was inspected against main and contains no Grok behavior. Run the suite and verify preservation. No Grok source, other installer test change or new production registry behavior is authorized by this prerequisite.

## Guidance, risks and validation

Use the AEX-4.10 whole-distribution architecture unchanged: fallback only when the entire project runtime is absent; partial, throwing, non-directory or inaccessible runtime remains fail-soft without fallback. The public fixture must resolve from its supplied installed root and leave sessions/config under its own project. Compare package inventories before and after; test success is insufficient if payload mutates. The public fixture accepts the installed Core root directly and requires no local workstation harness.

Main's package and scripts may differ from the combined alpha checkout. Record baseline behavior instead of expanding this slice to solve unrelated Doctor, CI, commercial packaging or orchestration issues. The locally packed artifact is validation material, not an authorized public distribution. Preserve existing package rights and never add private `pro/` content, credentials or provider receipts to it. Independent candidate review must distinguish source integration readiness from release readiness.

Primary risk is hidden dependence on the dirty root or a contaminated installed fixture. Mitigate through fresh consumers, explicit installed-root identity, no source aliases and exact hash comparisons. Secondary risk is generated-file drift during gates; inspect and restore only fixture/candidate-owned generated changes, never a global checkout reset. Rollback removes only the new owned worktree or its selected unaccepted patch after resolving its absolute path inside the task root; it does not touch previous accepted fixtures or PR #4.

## CodeRabbit Integration

**Type:** Runtime/package integration. **Complexity:** Medium. **Risk:** Medium. `@dev` owns fixture work; `@devops` owns Git/candidate assembly; independent `@qa` and `@po` review. Existing architect contract is reused; any actual contract change needs architect review, not an invented new approval gate.

- [ ] Pre-commit: configured automated review if available, otherwise explicit unavailability plus independent review.
- [ ] Candidate review: DevOps verifies exact scope and independent QA evidence before declaring locally ready.
- Pre-release: outside scope; normal provider/release gates remain open.

Self-healing: dev light (two iterations/15 minutes, critical); QA full (three/30, critical/high); DevOps report-only. Focus: portable real installed resolution, absent/broken runtime distinctions, payload preservation, baseline reproduction, narrow hunks and accurate local/remote claims.

## Preserved runtime contract and references

Select one runtime distribution before loading either engine or session manager.
Use installed siblings only when the entire project runtime directory is absent.
A complete project runtime takes precedence. Present partial, inaccessible,
non-directory or throwing runtimes return the existing fail-soft null result;
load both modules before any session mutation. Project manifest/domain routing,
configuration, positive TTL/default behavior, session identifiers and hook output
shape remain unchanged. State belongs to the project, never the installed package.
These are the accepted AEX-4.10 constraints, restated here without dependencies on
unrelated installer or internal planning documents.

[Candidate verification](SYNAPSE-CANDIDATE-VERIFICATION-20260908.md) provides the
portable commands, scope, baseline comparison, current gate results and limits.
The exact final TGZ hash and final installed receipt belong in the external
candidate record or normal PR review, not within the archive they identify.

## Story validation and file list

Brownfield completeness/safety/information checks and story-draft categories 1–6 PASS. Scope, accepted dependencies, baseline/current acceptance, fixture ownership, rollback and meaningful tests are concrete. **Ready** authorizes the described local reconstruction under existing user instructions; it does not certify work not yet performed.

- Created story: `docs/framework/epics/aexos-evolution/STORY-AEX-4.17-SYNAPSE-ISOLATED-CANDIDATE-INTEGRATION.md`.
- Added implementation fixture: `scripts/e2e/synapse-package-runtime-smoke.js`.
- Reused accepted source: `.aexos-core/core/synapse/runtime/hook-runtime.js`, `tests/synapse/hook-runtime.test.js`.
- Explicit test-only gate prerequisite: the two registry-preservation/fail-on-error hunks in `packages/installer/tests/unit/entity-registry-bootstrap.test.js`; no other test/source scope.
- Updated generated metadata: `.aexos-core/install-manifest.yaml` — generation timestamp and hash/size metadata for the owned hook and entity registry only; all other 1,166 entries preserved.
- Updated generated registry: `.aexos-core/data/entity-registry.yaml` — only `metadata.lastUpdated`, the existing hook's `checksum` and `lastVerified`, and the registry self-entry's `lastVerified`; all 848 entities and their structure preserved.
- Added public verification: `docs/framework/epics/aexos-evolution/SYNAPSE-CANDIDATE-VERIFICATION-20260908.md`.

## Dev Agent Record

Candidate source starts at `5342f5a7c1ab6212087da2011265c11f1002503f` on
`codex/synapse-package-portability`; package version remains 5.3.0. This is a
locally packed candidate, distinct from the registry artifact of that version.

The public fixture hash is
`6225df6001d06ce5258378ab02214e3ca82c6e9e6bb7b405e85dc1b2645998dc`.
Its actual installed baseline fails for the expected missing sibling runtime
while preserving all 3,452 files. The initial installed candidate passes all
nine behavior checks, preserves all 3,453 files and resolves 51 loaded modules
within the supplied installation. These are intermediate package observations;
final archive acceptance must be bound to the final external receipt.

Four focused suites pass 134 tests without skips. All eight candidate gates
exit 0: lint, typecheck, full tests, build, manifest, package completeness,
port denylist and registry determinism. Full tests: 9,875 passed, zero failed,
172 existing skipped tests; 394 passed and 12 skipped suites. Before/after
source inventories match. At that gate identity the install manifest preserved
all other 1,167 entries, and registry determinism retained 848 entities.
The normal post-commit hook subsequently refreshed the owned hook checksum and
verification timestamps in the existing entity registry. AC5 includes only the
four fields listed above and the corresponding manifest metadata; the final
manifest preserves the other 1,166 entries. This is an eight-file candidate,
including its two public documents. The post-commit metadata delta and affected
check results are bound separately in the external final candidate receipt.
Documentation and generated metadata were finalized separately from the full
source gates; no runtime or test behavior changes followed those gates.

See the linked verification summary for actual commands. No final archive hash
is embedded here because this document is itself packaged. Final package,
installed receipt and local commit identity remain external review evidence.

## QA Results

The portable fixture is independently approved, including invalid-input,
environment and location probes. Whole-candidate QA and the final archive's
installed result require their external review receipts. This document records
reviewable source evidence; it does not manufacture final approval, merge,
registry publication, native-host execution or paid/Office acceptance.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready actual isolated Slice 1 reconstruction and portable installed SYNAPSE verification; no remote actions. | Themis / `@po` |
