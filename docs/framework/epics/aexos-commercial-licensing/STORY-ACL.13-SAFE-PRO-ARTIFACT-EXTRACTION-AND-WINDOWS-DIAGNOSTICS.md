# Story ACL.13: Safe Pro artifact extraction and Windows diagnostics

| Field | Value |
| --- | --- |
| Story ID | ACL.13 |
| Epic | AEXOS Commercial Licensing |
| Priority | P0 |
| Status | Done — bounded local scope; independent QA APPROVED |
| Executor | `@dev` |
| Quality gate | `@architect`, independent `@qa` |
| Quality gate tools | Adversarial TGZ tests; shell-free argv tests; stderr/privacy regressions; installed artifact checks |
| Depends on | Existing signed acquisition contract and ACL.10 source/version resolver correction |

## Story

As an AEXOS installer user, I want verified Pro archives extracted without invoking npm, Windows npm operations executed without command-shell reinterpretation, and useful private error messages, so that clean-machine installation remains safe and failures can be diagnosed without leaking credentials or printing unrelated registry noise.

## Verified context and scope

The owner requested the next P0 installer-hardening correction. Current `packages/installer/src/wizard/pro-setup.js` invokes npm to extract the temporary artifact, uses `--silent` for extraction/target installation and falls back to `npm.cmd` with `shell: true` on Windows. `generateNativeMachineId()` calls `node-machine-id`, whose registry subprocess can emit stderr before the installer catches failure.

The supplied AIOX reference at `C:/AEXOS-LOCAL-TESTS/diagnostic-upstream-20260908-115604/aiox-core/packages/installer/src/wizard/pro-setup.js` demonstrates in-process `tar` extraction, discovery of npm's JavaScript entry point beside Node, and more useful npm log levels. Its remaining `npm.cmd` shell fallback and unqualified `strip: 1` extraction are reference material, not an approved AEXOS security design. Preserve AEXOS signed-descriptor verification, byte digest/size checks, target ownership and rollback.

[AUTO-DECISION] Scope → bounded installer helpers and focused tests. ACL.10 target-first implemented-package resolution, scaffold rejection, legacy metadata compatibility and artifact-version precedence remain unchanged. No licensing policy, paid gate, package default version, publishing, provider call or global host change is included.

[AUTO-DECISION] Archive dependency → `tar` is not currently declared in the root or installer manifest and does not resolve from the root checkout. Verify whether another existing packaged archive implementation satisfies the required safety contract before adding anything. If none does, the architect must select and document the minimal archive dependency and its exact lockfile/security evidence; do not depend on a transitive/global package or blindly import upstream dependencies. This routine technical selection does not authorize additional product features.

## Acceptance criteria

- [x] AC1: `extractProArtifactToTemp` extracts the already verified TGZ in-process into an installer-owned temporary directory, without npm, a shell, lifecycle scripts or network access. Require the expected npm `package/` layout and usable `package.json` for the existing `@aexos/pro` contract; preserve the helper's result contract. Reject malformed/truncated archives, absolute/drive/UNC/traversal paths, links or special entries that can escape containment, and unsafe duplicate/type collisions. Bound extracted resources as well as compressed size to avoid archive expansion exhaustion. Failure removes only installer-owned temporary output and leaves user-owned files unchanged.
- [x] AC2: Signed acquisition still validates current descriptor authority, product/account/entitlement/machine/package/version/platform/channel, pinned signature, byte size and SHA-256 before extraction. Extraction safety also applies to validly signed malicious archives. Preserve token confinement, redirect restrictions and existing cleanup/rollback behavior. Do not weaken these checks or mark a review/scaffold package as paid functionality to exercise extraction.
- [x] AC3: Windows npm execution resolves an existing `npm-cli.js` through the current npm/npx entry point or verified Node installation layout, then invokes it with `process.execPath` and an argv array, without `npm.cmd`, `cmd.exe` or `shell: true`. If no safe entry point exists, return a clear actionable error instead of unsafe shell fallback. Preserve supported non-Windows execution and intentional cwd/timeout/hidden-window behavior. Tests cover missing `npm_execpath`, npx sibling discovery, bundled npm, invalid paths, spaces, trailing separators and shell metacharacters as literal arguments.
- [x] AC4: Genuine target installation may still use npm to resolve runtime dependencies, retaining explicit target anchoring, workspace isolation, `--ignore-scripts`, no-save/no-lock behavior and existing target-install fallback semantics. Replace silent failure suppression with meaningful captured npm errors (for example the existing upstream error-level approach). Render bounded secret-safe diagnostics: redact bearer tokens, URL credentials/signed query values and configured secrets; strip unsafe terminal controls. Preserve useful error reason/code without dumping raw environment or provider payloads. No arbitrary target manifest overwrite or ancestor installation regression.
- [x] AC5: Suppress incidental Windows registry stderr only around native machine-identity probing; successful stable IDs and existing native-unavailable fallback behavior remain unchanged. Do not globally mute stderr, hide unrelated installer failures, replace the identity algorithm, or change persisted machine identity. Cover successful probing, denied/missing registry access, fallback and restored stderr after exceptions; record native Windows evidence when available and label simulated tests accurately.
- [x] AC6: Add meaningful adversarial extraction, npm invocation, diagnostic-redaction and machine-probe regressions using existing test conventions. Verify a freshly packed Core candidate in an isolated project under `C:/AEXOS-LOCAL-TESTS/`, with exact Core/archive hashes, safe paths containing spaces/metacharacters, user-file preservation and Doctor results. Run relevant existing signed-artifact, target-install, source/version and machine-ID regressions plus lint, typecheck, tests, build and Core package-boundary checks. Independent architecture/QA review confirms the safety boundaries. Local extraction/install mechanics do not certify payment/provider acceptance or release readiness.

## Tasks and ownership

- [x] Inspect current installer, ACL.10 changes and exact upstream counterpart; identify available dependency gap and prepare this Ready scope.
- [x] Architect selects the existing usable archive implementation or minimal reviewed dependency; record package/lockfile scope before integration (AC1).
- [x] Implement confined in-process extraction while preserving signed acquisition and cleanup (AC1-AC2).
- [x] Implement shell-free Windows npm discovery/invocation and useful redacted target-install errors (AC3-AC4).
- [x] Bound native identity-probe noise suppression without changing identity/fallback (AC5).
- [x] Run adversarial and packed installed checks, all affected gates and independent review; update exact file/evidence inventory (AC6).

Primary owner `@dev`: `packages/installer/src/wizard/pro-setup.js` and focused tests under `tests/installer/` and existing machine-ID test locations. A small same-module archive/diagnostic helper may be factored if necessary. Package manifest/lockfile changes are permitted only for the architect-confirmed minimal archive implementation. Coordinate helper ownership before edits; do not change unrelated machine-ID runtime modules or prior ACL.10 behavior. Story author owns this document only; no commit or source edit by `@po`.

## Dev guidance and risk

Temporary extraction and optional target npm installation serve different purposes. The former copies verified static content; the latter can populate runtime dependencies for existing CLI consumers. Replacing temporary extraction does not authorize removal of target dependency installation. Existing `acquireProArtifactSourceDir` may return verified extracted content with a warning when target caching fails; preserve that contract and make the warning truthful and secret-safe.

Do not rely only on the archive library's default traversal behavior or `strip: 1`: validate allowed entry types, normalized destination paths and extraction limits, and verify no file outside the temporary root changes. Choose compatibility behavior for legitimate npm metadata entries deliberately and test it. Avoid custom full archive parsers when a maintained implementation can satisfy the contract.

Primary risks are archive escape/expansion, shell argument reinterpretation, secret-bearing npm diagnostics and identity drift. Roll back only this story's exact source/test/dependency edits; temporary cleanup must verify resolved ownership boundaries. Keep prior accepted consumer projects intact and use a new disposable directory for installed checks. No system services, registry writes, global npm installation or provider mutation is needed.

References:

- [ACL.10](STORY-ACL.10-PRO-RESOLUTION-AND-INTERNAL-CONTENT-REVIEW.md): resolver preservation and internal fixture limitations.
- [ACL.8](STORY-ACL.8-AUTHENTICATED-PRIVATE-ARTIFACT-DELIVERY.md#acceptance-criteria): signed acquisition and token/byte verification boundary.
- [ADR-AEX-011](../aexos-evolution/adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md#decision): free Core/private authenticated paid artifact distribution.
- [Accumulated context](../aexos-evolution/accumulated-context.md#2026-09-06-audit-and-experience-remediation): preserve concurrent work and distinct evidence gates.

## CodeRabbit Integration

**Type:** Installer/security integration. **Complexity:** Medium. **Risk:** High for archive handling and subprocess arguments. **Agents:** `@dev` implementation, `@architect` archive/transport design review, independent `@qa` acceptance, `@devops` exclusively for any later PR/push.

- [ ] Pre-commit: configured automated review or explicit unavailable result plus independent review under existing graceful degradation.
- [ ] Pre-PR: `@devops` checks exact diff, dependency/security evidence and accepted gates.
- Pre-deployment: N/A; no publishing/provider deployment in scope.

Self-healing: `@dev` light, 2 iterations/15 minutes for critical; `@qa` full, 3 iterations/30 minutes for critical/high; `@devops` reports only. Focus on archive confinement, bounded extraction, unchanged signed authority, literal argv, redaction, identity stability and user-file preservation.

## Story validation

The brownfield completeness/safety/information checks and story-draft checklist pass for goal/context, technical guidance, references, self-containment, testability and review planning. The explicit bounded archive-library selection is assigned to architecture and cannot be silently replaced with an undeclared global dependency. **Ready** authorizes this implementation scope; no safety or provider acceptance is claimed before verification.

## File list

- Created: `docs/framework/epics/aexos-commercial-licensing/STORY-ACL.13-SAFE-PRO-ARTIFACT-EXTRACTION-AND-WINDOWS-DIAGNOSTICS.md`.
- Planned: installer helper source/tests named above; minimal architect-approved package/lockfile change only if required; privacy-safe verification receipts and isolated packed fixtures.

## Dev Agent Record

Implemented by Vulcan / `@dev`, 2026-09-08; independent QA APPROVED; final combined gates passed.

IDS decisions: ADAPT `pro-setup.js` and existing auth/target-install tests; CREATE same-feature `pro-artifact-extractor.js` because no existing packaged archive implementation met this verified contract; CREATE two focused regression suites instead of duplicating the production parser. REUSE maintained `tar@7.5.22` after architect review of the official node-tar security contract. Root and standalone installer both declare exact production dependency; root override uses `$tar`, and the root lock records integrity `sha512-MFO/QzvtAOmJbkhOaCTvbGcFN9L9b+JunIsDwaKljSOdcLMea3NJ1k9Usz/rjdfSXTq4dfzfeS7W4p4YOAAHeA==`. Registry engines require Node >=18, matching installer support. No standalone installer lock previously existed. `npm audit --omit=dev --json` reports zero vulnerabilities; receipt `artifacts/commercial-readiness-20260908/acl13/production-audit.json`.

Extraction uses a compressed cap of 100 MiB, synchronous gunzip capped at 128 MiB, 100 MiB total file content, 32 MiB per entry, 64 KiB package metadata and 10,000 entries. Both maintained tar passes consume the same preflighted Buffer. This bounds memory/decompression work; it is not a streaming implementation. Effective PAX and raw-header paths are checked, including Windows unsafe segments, NFC/case collisions, parent/file conflicts, unsupported types, links and complete end blocks. Unicode names remain supported. Owner/mode restoration from untrusted archive metadata is disabled. Output lives in a newly created private subtree; failure deletes that subtree only. Static internal review archives retain scaffold/unimplemented markers and are not licensed runtime acceptance.

Signed acquisition still verifies before extraction and now passes the expected signed-request version for exact package metadata comparison. Target npm remains separate, shell-free on Windows, with explicit prefix/workspace isolation/no scripts/no save/no lock. Captured diagnostics retain useful errors while removing terminal controls, bearer/configured secrets, URL credentials and query values, capped at 2,000 characters. Native machine identity continues using the existing library and hash algorithm; only its synchronous Windows registry subprocess receives captured stderr, restored in finally.

Self-critique 5.5/6.5: addressed preflight/extraction byte substitution by using one Buffer; path normalization evasion by validating effective plus raw paths; decompression exhaustion through explicit expanded cap; signed metadata-version mismatch through exact binding; shell reinterpretation through Node argv; incidental registry stderr through a scoped synchronous wrapper. Regression tests prove malicious signed payload rejection before target installation, extraction confinement/collision/limits, literal metacharacters, redaction and restored subprocess behavior. QA identified Windows `C:/...` path misclassification; fixed while retaining rejection of drive-relative `C:...`.

Focused command: `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/installer/pro-artifact-extractor.test.js tests/installer/pro-installer-diagnostics.test.js tests/installer/pro-setup-auth.test.js tests/installer/pro-setup-target-install.test.js tests/installer/pro-setup-signed-artifact.test.js tests/installer/pro-source-resolution.test.js` initially passed 95/95. Following the additional Windows-path regression, the diagnostic suite passed 8/8. Targeted ESLint passed without warnings. Combined exact-source gates are delegated to `@devops`; no partial source result is release acceptance.

Final canonical candidate: `C:/AEXOS-LOCAL-TESTS/acl13-packed-20260908/aexos-core-6.0.0-alpha.1.tgz`, SHA-256 `db2e658f950d2b221687a52f0bcb933acd682b9c582e7b4bada544ce56404c9f`, 1,918 files and 44,772,398 bytes after separately owned Core package-boundary corrections and the shared metadata helper. Previous `d4ed...`, `dd7575...` and `b91aa...` candidates were superseded. Packed acceptance command: `node artifacts/commercial-readiness-20260908/verify-acl13-packed.cjs`; current receipt/logs are under `artifacts/commercial-readiness-20260908/acl13/`. No provider secrets or production trust changes are used. Source freeze excludes later documentation/evidence updates; this is not an immutable approved release.

Further QA redaction correction includes service-role/private-key/credential/auth environment names and every nonempty configured value, including short secrets; longest configured values are replaced first. Bearer/URL redaction precedes configured replacement so a secret equal to `Bearer` or `https` cannot disable token/URL sanitization. Diagnostic suite now passes 10/10 and targeted ESLint is clean.

Final packed receipt completed successfully at `2026-09-08T16:37:29.021Z`, bound
to `db2e658f...`: all four installer/detector implementation hashes match source;
tar is 7.5.22; all 146 review file hashes match; modified user content survives
repeat scaffolding; Doctor before/after both exit 0 with 8 PASS / 2 WARN / 0 FAIL;
real Windows native identity is available and stable. Exact commands and hashes
are retained in `acl13/packed-receipt.json`. Final focused command uses
`node node_modules/jest/bin/jest.js --runInBand --runTestsByPath` with the six
installer suites listed above plus `tests/pro/pro-detector.test.js`; all 122
tests in seven suites pass (`acl13/final-focused-tests.log`). The two Doctor
warnings remain explicit; no wholly green/no-warning or provider claim is made.

Standalone dependency/module proof is separate: `node artifacts/commercial-readiness-20260908/verify-acl13-standalone.cjs` installed TGZ SHA-256 `08f408376680baef560dfd4f56939a41c9af5aedbf18f29da7eb586a3fc04042` without repository hoisting. Its own tar 7.5.22 (Node >=18) extracted all 146 review files and production audit was zero. A prior explicit module-load probe found ACL.10's bundled-Core detector import failed in standalone layout. The reopened ACL.10 correction moved the unchanged predicate into one installer-local shared helper; the final actual standalone wizard module now loads, expected operations are exported and scaffold availability remains false. `standalone-receipt.json` certifies those operations, explicitly not the whole authenticated wizard/provider journey. Final focused developer verification passes seven suites / 122 tests, with targeted ESLint exit 0; independent QA accepted 86 detector/resolver/auth/diagnostic tests and the unchanged shared predicate.

Changed files: `packages/installer/src/wizard/pro-setup.js`; new `packages/installer/src/wizard/pro-artifact-extractor.js`; `package.json`; `package-lock.json`; `packages/installer/package.json`; `tests/installer/pro-setup-auth.test.js`; `tests/installer/pro-setup-target-install.test.js`; new `tests/installer/pro-artifact-extractor.test.js`; new `tests/installer/pro-installer-diagnostics.test.js`; this story and the scoped verification script/receipts above. Coordinated ACL.10 reuse correction: `bin/utils/pro-detector.js`, new `packages/installer/src/utils/pro-package-metadata.js`, `tests/pro/pro-detector.test.js` and the ACL.10 regression record. Existing unrelated edits were preserved; no commit/push/publication occurred.

## QA Results

**APPROVED — bounded installer hardening (2026-09-08).** Independent review
accepted archive preflight/limits, unchanged signed acquisition, literal Windows
argv, restored native-probe behavior and secret-safe diagnostics. The reported
Windows forward-slash and configured-secret gaps were fixed and re-tested.

Final Core TGZ SHA-256:
`db2e658f950d2b221687a52f0bcb933acd682b9c582e7b4bada544ce56404c9f`;
standalone installer:
`08f408376680baef560dfd4f56939a41c9af5aedbf18f29da7eb586a3fc04042`.
QA recomputed both hashes, matched installed source, independently loaded the
standalone wizard and reviewed the actual 146-file extraction, user preservation,
Doctor exit 0 before/after and stable native probe receipts. Inert review content
remains unavailable as implemented Pro.

Final unchanged public lint/typecheck/test/build gates pass: 10,589 tests passed,
zero failed, 172 optional/legacy/private-conditional skips; mandatory contracts
have zero skips. QA matched 4,325 source hashes with no drift. See
`artifacts/commercial-readiness-20260908/acl13-qa.md` for evidence and resolved
findings. This does not certify the full authenticated wizard, payment/provider
journey, signing authority, paid release or all native-host behavior.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready bounded P0 extraction, Windows invocation and diagnostic hardening. | Themis / `@po` |
