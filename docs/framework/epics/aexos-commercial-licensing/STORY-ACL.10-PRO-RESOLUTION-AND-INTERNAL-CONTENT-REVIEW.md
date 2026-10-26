# Story ACL.10: Correct Pro resolution and verify an internal content archive

| Field | Value |
| --- | --- |
| Story ID | ACL.10 |
| Epic | AEXOS Commercial Licensing |
| Status | Done — standalone regression independently approved; hosted acceptance excluded |
| Executor | `@dev` |
| Quality gate | Independent `@qa`, `@architect` boundary review |
| Quality gate tools | Resolver regressions; source-to-archive hash comparison; existing extraction/scaffolder checks; repository quality gates |
| Depends on | ACL.9 corrected content and its refreshed 146-file inventory |

## Story

As an AEXOS installer user, I want source and implicit version resolution to distinguish implemented Pro packages from scaffold placeholders, so that an existing usable target package is not shadowed by bundled scaffolds or failed Git bootstrap. As the product owner, I want a clearly labeled internal review archive of the audited content to verify package mechanics without presenting that archive as licensed or release-ready software.

## Verified context and boundaries

The owner's request to resolve remaining sale-readiness blockers authorizes this bounded correction and reversible local review preparation. `packages/installer/src/wizard/pro-setup.js` currently accepts bundled `pro/` merely because `pro/squads/` exists. Its bootstrap error returns before inspecting the target's `node_modules/@aexos/pro`. `getProArtifactVersion` also reads the bundled scaffold's `0.0.0` version without checking availability. By contrast, the existing exported `bin/utils/pro-detector.js:isImplementedPackage` reads JSON and rejects unreadable/malformed metadata or `aexosPro.scaffold === true` / `aexosPro.implemented === false`, while retaining compatibility with legacy packages lacking `aexosPro` metadata.

The audited Products/Marketing/Ops nomination is recorded in `artifacts/commercial-readiness-20260908/content-candidate/inventory.json` and its README. It contains 146 content files with hashes and source identity, including the ACL.9 corrections. This inventory establishes content identity, not commercial rights, completed runtime functionality or a paid grant.

[AUTO-DECISION] Scope → fix only source/version resolution and focused tests, then perform a separate local archive mechanics review. Use the existing detector semantics rather than designing a new maturity protocol. No new default artifact version, price, license policy, commercial rights, public package, production trust key, registry record, bucket or provider action is authorized by this story.

## Acceptance criteria

- [x] AC1: Source resolution selects a usable installed target package before bundled content or Git bootstrap. A candidate must have readable package metadata satisfying the existing `isImplementedPackage` semantics plus a `squads/` directory and a `pro-config.yaml` file required by the existing scaffolder. Resolution order is target package, implemented bundled package, then Git bootstrap as the last fallback. Bundled or installed packages explicitly marked scaffold/unimplemented are not usable paid sources; malformed/missing metadata is not accepted solely because a directory exists. Existing legacy packages without maturity metadata retain compatibility. A Git bootstrap failure cannot prevent selecting an already valid target package; otherwise preserve a useful bootstrap diagnostic and return no usable source when none exists.
- [x] AC2: Implicit artifact-version inference never selects the bundled scaffold's `0.0.0` merely because its package file exists. Infer from an implemented candidate only; preserve existing explicit option/environment override precedence and the existing `DEFAULT_PRO_ARTIFACT_VERSION` value. Rejecting a scaffold must not invent a replacement version or assert that the unchanged default exists in the registry. Source/version checks reuse the existing detector helper where packaging permits; any minimal compatibility adapter must match its explicit scaffold/unimplemented rejection and legacy behavior.
- [x] AC3: Focused regressions cover valid target plus bundled scaffold, valid target plus failing/unneeded Git bootstrap, scaffold-only source, malformed/missing metadata, implemented bundled fallback, legacy metadata compatibility and version override/default precedence. Existing authentication, paid-entitlement admission, pinned signature verification, artifact binding and extraction protections remain unchanged. Neither code nor test acceptance introduces a fabricated paid grant, test-mode production bypass or relaxed license gate.
- [x] AC4: Build a local internal review TGZ under a dedicated `C:/AEXOS-LOCAL-TESTS/` subtree, outside the project and release output. Its package identity is exactly `@aexos/pro@0.0.0-review.20260908`, with `private: true`, `license: UNLICENSED`, `aexosPro.scaffold: true` and `aexosPro.implemented: false`. Preserve all 146 nominated content files byte-for-byte against the refreshed inventory. Record hashes/sizes for each content file and the final TGZ, separating any minimal package/config/review metadata overlay from the 146 source files. Overlay configuration must be inert: no executable lifecycle scripts, credentials, endpoint changes or invented capability activation. Do not use this review version as an installer default.
- [x] AC5: Inspect the exact archive, exercise existing extraction/local install mechanics and invoke the existing `scaffoldProContent` API directly into a disposable accepted Core project. Compare resulting content with the inventory and record copy/preservation outcomes; preserve user-owned fixture sentinels. Run an actual fresh default CLI-only Core init and Doctor, then Doctor again after scaffolding the exact TGZ; both Doctor runs must exit zero. Preserve absent unselected host directories in that CLI-only target. Verify selected derived projections in a separate disposable fixture where supported, recording the exact accepted Core identity, commands, results and any limitation. The review package must remain unavailable under normal Pro detection. Do not invoke the licensed wizard with a fabricated entitlement or reinterpret successful copying/Doctor as paid-install acceptance.
- [x] AC6: Run relevant installer/resolver/security regressions and `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run validate:core-package` for the changed Core candidate; record exact outcomes and independent review. Keep local mechanical archive evidence distinct from approved commercial content, signed immutable release, hosted payment/download/install, and ACL.5/ACL.6 provider/promotion gates. No signing, publication, catalog/provider writes, price/terms changes or release claim occurs here.

## Tasks and ownership

- [x] Verify the resolver/version findings, existing detector semantics and available ACL.10 ID; prepare this Ready story before implementation.
- [x] Correct bounded source/version resolution in `packages/installer/src/wizard/pro-setup.js` and add focused regressions (AC1-AC3).
- [x] Independently revalidate the 146-file inventory, then assemble the inert internal review archive with an explicit overlay inventory (AC4).
- [x] Verify exact archive extraction/install/scaffolder mechanics and normal detector rejection in disposable directories; record Doctor/projection scope and results (AC5).
- [x] Run gates and independent boundary review, update exact file list and evidence references (AC6).

Story author owns this document only. Lead `@dev` owns implementation and local review tooling. Source changes are bounded to `pro-setup.js` and focused tests; a minimal existing-helper import/export adjustment is permitted only if required for reuse and explicitly recorded. Do not modify unrelated dirty work, commercial offer rights, source content, global host projections or provider settings. No Git commit is performed by the story author.

## Dev guidance and verification

Use CommonJS and existing test conventions. `isImplementedPackage` is already exported from `bin/utils/pro-detector.js`; preserve its legacy compatibility. Reuse existing source-resolution test hooks instead of expanding the product API. `getProArtifactVersion` currently checks explicit `options.proArtifactVersion`, then `AEXOS_PRO_ARTIFACT_VERSION`, then bundled metadata and finally the existing default; the defect is unvalidated implicit scaffold inference, not the operator override contract.

The archive is an internal content transport fixture. The existing `packages/installer/src/pro/pro-scaffolder.js` requires `squads/` and `pro-config.yaml`; include only the minimal inert overlay needed to inspect those mechanics, with its exact fields and hashes documented. Do not copy the unrelated Pro scaffold runtime, represent its stub exports as implemented, or mint licensing evidence. Any additional current architectural finding must be reconciled with this boundary before widening source changes.

Use a freshly packed corrected Core candidate and a dedicated consumer entirely under a new `C:/AEXOS-LOCAL-TESTS/acl10-review-*` root. Record its exact Core version and TGZ SHA-256, and exercise helpers from that installed packed candidate. Do not modify the previously accepted consumer or its `node_modules` junction; earlier installed evidence remains intact.

Risk: relaxing candidate checks would admit scaffolds; over-tightening would break older valid packages; running broad bootstrap or package lifecycle commands could mutate unrelated state. Mitigate with explicit metadata/legacy cases, target-first resolution, isolated directories, existing safe extraction/install mechanics and script-free local packaging. Rollback only this story's exact source/test changes; retained review fixtures remain labeled internal and outside the project. Do not recursively clean shared roots.

References:

- [ACL.9](STORY-ACL.9-SQUAD-HOST-COMPATIBILITY-AND-INVENTORY.md): content dependency and inventory correction.
- [ACL.8 context and scope](STORY-ACL.8-AUTHENTICATED-PRIVATE-ARTIFACT-DELIVERY.md#context-and-scope): existing paid-delivery boundary and separate hosted gates.
- [Accumulated context](../aexos-evolution/accumulated-context.md#2026-09-06-audit-and-experience-remediation): preserve concurrent work and separate evidence levels.
- [Constitution](../../../../.aexos-core/constitution.md): CLI first, authority, no invention and quality requirements.

## CodeRabbit Integration

**Type:** Integration / installer compatibility. **Complexity:** Low. **Risk:** Medium because resolver selection precedes paid-content scaffolding. **Agents:** `@dev` implementation, independent `@qa` regression acceptance, `@architect` authority boundary review, `@devops` exclusively for any later PR/push.

- [x] Pre-commit review fallback: CodeRabbit executable unavailable (`Get-Command coderabbit` returned no command); independent QA APPROVED. No CodeRabbit PASS is claimed.
- [ ] Pre-PR: `@devops` validates the exact scoped diff and gate evidence if a PR is requested.
- Pre-deployment: N/A; no deployment is in scope.

Self-healing: `@dev` light, maximum 2 iterations/15 minutes for critical issues; `@qa` full, maximum 3 iterations/30 minutes for critical/high; `@devops` reports only. Focus on scaffold rejection, legacy compatibility, source precedence, unchanged licensing authority, exact archive identity and isolated reversible review. An unavailable automated review cannot be recorded as PASS.

## Story validation

The brownfield task's completeness/safety/information checks and all applicable categories of `.aexos-core/product/checklists/story-draft-checklist.md` pass: goal/context, implementation guidance, references, self-containment, testability and review planning. API/schema/new environment configuration items are N/A. Architecture details already evidenced by the existing detector and resolver define the bounded correction. **Ready** for implementation; this status is not implementation QA or sale-readiness acceptance.

## File list

- Created: `docs/framework/epics/aexos-commercial-licensing/STORY-ACL.10-PRO-RESOLUTION-AND-INTERNAL-CONTENT-REVIEW.md`.
- Modified source: `packages/installer/src/wizard/pro-setup.js` (resolver/helper reuse and implicit version only), `packages/installer/src/pro/pro-scaffolder.js` (AC5 preservation and rollback correction).
- Created tests: `tests/installer/pro-source-resolution.test.js`.
- Modified tests: `tests/installer/pro-setup-auth.test.js` (four existing resolver fixtures), `tests/installer/pro-scaffolder.test.js`.
- Created review tools: `artifacts/commercial-readiness-20260908/verify-acl10-review-package.cjs`, `artifacts/commercial-readiness-20260908/inspect-acl10-archive.cjs`.
- Evidence: `artifacts/commercial-readiness-20260908/acl10-before.json`, `acl10-qa.md`, `acl10-review/receipt.json`, `acl10-review/file-inventory.json`, `acl10-review/verification.md`, full Core gate receipts/logs and retained pre-fix receipt/logs. Parent `verification.md` updated.
- Disposable artifacts: `C:/AEXOS-LOCAL-TESTS/acl10-review-udMgEs/`; original failed fixture retained separately. No shared consumer was overwritten.

## Dev Agent Record

### Reproduced AC5 preservation defect

The actual internal review TGZ passed pack/extract/install, all 146 content
hashes, 34 external dependency paths and Doctor before/after (8 PASS, 2 WARN,
0 FAIL, 9 INFO). The repeated default scaffold then overwrote a user-edited
Products README. The failed receipt is preserved at
`artifacts/commercial-readiness-20260908/acl10-review/receipt.before-preservation-fix.json`.
This is an implementation failure of AC5, not permission to weaken its sentinel.

Required bounded source scope extends to
`packages/installer/src/pro/pro-scaffolder.js` and
`tests/installer/pro-scaffolder.test.js`: default copying must preserve existing
user files, including active-host agent copies; overwriting requires explicit
force. Reuse the existing scaffolder and regression conventions. No new product
feature, provider operation or commercial approval is added.

Independent architecture review also identified that the old failure rollback
could remove pre-existing forced destinations and generated metadata, while leaving
core-config changes applied. AC5 preservation therefore includes rollback of this
same bounded scaffold transaction: capture only touched regular files in memory
before mutation, restore their original bytes/modes on failure, remove only newly
created files/links, and retain legacy rollback API compatibility. No persistent
backup of private configuration is introduced. Existing nonregular/link destinations
are preserved by default and rejected for forced replacement; late-failure tests
must cover content, host copies, core-config and both metadata receipts.

### Final implementation and verification

Target-first resolution reuses the existing detector, rejects scaffolds and keeps
legacy/override behavior. Default copying now preserves existing files, including
host copies. Explicit force snapshots touched regular files before mutation;
failure restores bytes/mode and removes only newly owned files/links. Exclusive
copy/open operations avoid claiming a competing writer's file on EEXIST.
The journal is in memory: no crash recovery, Windows ACL restoration or OS-level
confinement is claimed.

The corrected actual package harness passed at 2026-09-08T14:02:01Z. All 146
nominated files and three inert overlay hashes match the installed package;
19 derived projections and 34 external dependency paths verified. Three Doctor
runs each exit 0 (8 PASS / 2 WARN / 0 FAIL / 9 INFO), including after a forced
failure that restored user content, core config and both receipts. The review
package remains rejected by automatic Pro detection.

Exact commands and hashes: `artifacts/commercial-readiness-20260908/acl10-review/verification.md`.
Fresh lint/build/typecheck/test/package gates all exit 0 through 14:04:02Z;
10,559 tests passed, zero failed, 163 skipped, 441 passing suites.
No production/provider/publication or commercial rights approval occurred.

## QA Results

### Reopened AC2 standalone import regression (2026-09-08)

An actual standalone installer package module-load probe reproduced a
`MODULE_NOT_FOUND`: the Core-root absolute detector import was invalid outside
the bundled Core layout. The approved bounded reuse correction moves the
unchanged `isImplementedPackage` predicate to
`packages/installer/src/utils/pro-package-metadata.js`; both the Core detector
and installer wizard now import this single implementation. The detector's
public export and legacy/scaffold behavior remain unchanged. IDS: ADAPT the two
existing consumers; CREATE the installer-local shared helper solely to preserve
standalone packaging; ADAPT `tests/pro/pro-detector.test.js` to assert function
identity instead of duplicate logic.

Independent QA reran 86 detector/resolver/auth/diagnostic tests and accepted the
unchanged predicate. Developer rerun added extraction/target/signed coverage:
seven suites, 122 tests passed, targeted ESLint exit 0. Fresh standalone TGZ
SHA-256 `08f408376680baef560dfd4f56939a41c9af5aedbf18f29da7eb586a3fc04042`
installed without repository hoisting; the actual wizard module loads, its
expected operations are exported, and the review archive still fails availability
detection. All 146 review file hashes match and production audit is zero.
This verifies module loading and these tested operations, not an authenticated
whole-wizard/provider journey. Receipt:
`artifacts/commercial-readiness-20260908/acl13/standalone-receipt.json`.

Additional regression file list: `bin/utils/pro-detector.js`,
`packages/installer/src/utils/pro-package-metadata.js`,
`packages/installer/src/wizard/pro-setup.js`, `tests/pro/pro-detector.test.js`,
and the ACL.13 standalone verification script/receipt. **Independent QA APPROVED
the reopened regression** after final Core package and unchanged public gates:
Core SHA-256 `db2e658f950d2b221687a52f0bcb933acd682b9c582e7b4bada544ce56404c9f`;
lint/typecheck/test/build all exit 0, 10,589 public tests passed, zero failed,
172 optional or conditional skips. Mandatory distribution contracts have zero
skips. QA independently loaded the standalone wizard and matched all 4,325
source hashes before/after the final gates and to current root. See the dated
addendum in `artifacts/commercial-readiness-20260908/acl10-qa.md`. Earlier
acceptance below remains the historical resolver/scaffolder record.

Independent `@qa` APPROVED the bounded local implementation and actual archive
mechanics, including 106 independently rerun tests (29 scaffolder regressions),
source/archive hashes, preserved sentinels and fresh full gate receipts.
See `artifacts/commercial-readiness-20260908/acl10-qa.md`. Original NEEDS_WORK was
resolved by fixing the real overwrite and rollback ownership defects.
Provider/paid release acceptance remains separate.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready bounded resolver correction and internal content archive review from verified findings. | Themis / `@po` |
| 2026-09-08 | 1.1 | Completed resolver correction, actual archive-driven preservation/rollback fixes, exact package and independent QA acceptance. | `@dev` / `@qa` |
