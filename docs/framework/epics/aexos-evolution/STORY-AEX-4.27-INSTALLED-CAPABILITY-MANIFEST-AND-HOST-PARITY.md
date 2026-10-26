# Story AEX-4.27: Installed Capability Manifest and Host Parity

## Status

Done

Current original-scope acceptance (2026-10-16): Independent R2 and current installed manifest verification:2035payload files/8capabilities;paid and native-host evidence explicitly NOT_ASSESSED where unavailable Core Free alone is accepted. Grok behaviors and unavailable native/provider effects remain NOT_ASSESSED as AC5-AC6 permit; no universal host or five-repository runtime certification is claimed.

Source/installed evidence is rebound to archive `300a4f64505f1778439b99a5176758db69d8dc0221ff60689066824355146936`: all 2,035 installed payload hashes and 14,727 dependency hashes match accepted bytes; packaged product code matches the checkout. Fresh frozen-baseline lint/typecheck/build and 498 suites / 11,551 tests passed; 147 tests remain skipped. The correlation test-only addition followed the full baseline and passed its affected 36-test matrix. Independent closure review: external `ordinary-integration-20261012/current-parity-readiness/original-scope-independent-review.md` (JSON SHA-256 `c6c2bee5b9cf75cfbd53d07ca43397dfb8e3019c0b5a119bf730d011222e9f9d`).

This current decision supersedes earlier generic pending/dependency wording only for the original AC contract. Broader joined SDLC, host, provider and production claims remain separately bounded. AEX-4.21/AEX-4.23 positive replacement integration and separately requested AEX-4.28 hardening remain open. No paid API, publication or product-code change was introduced.

### 2026-10-26 production integration follow-up

This follow-up records the official-clean-main production integration without rewriting the historical Done decision or its acceptance evidence. The integrated candidate passed the complete repository run of 568 suites / 12,829 tests with 50 skips before the final scoped installer and installed-harness corrections; 115 targeted tests and the relevant lint rule passed after those corrections. The final actual archive is SHA-256 `63c1db9f32f3e2c84c94abd712fe25410788d7498235906fa7d262bc105c4fa7`, with 2,108 archive entries, 21 Synapse entries and all four required public Claude helper wrappers.

That exact TGZ was installed into separate cold Claude Code and Codex consumers. Both selected-host receipts passed, `dev`, `qa` and `aexos-master` greetings executed from the installed trees, and installed Doctor reported zero failures for both hosts. The independent read-only review is `installed-production-matrix-independent-review.json`, SHA-256 `543a22c7bfbc9faeb8093fe95c1d4db2b0bb4c1460461105593b09f9e7abae36`. This proves bounded installation and activation health only. It does not certify a real provider/LLM session, universal native-host behavior, deployment, publication or production readiness.

Current upstream language support is retained. Earlier three-question English wizard receipts remain historical evidence for the then-tested flow, not the current multilingual UI contract; this follow-up does not revise AEX-4.29 history.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [manifest-schema-validation, package-payload-audit, fresh-install-matrix, native-host-contract-tests, parity-validation, lint, typecheck, jest]

## Story

**As an** AEXOS installer or operator, **I want** each installed artifact to declare only licensed, packaged, supported, and activated capabilities with honest host evidence, **so that** local source presence, paid eligibility, static projection, and verified runtime behavior cannot be confused.

## Context and dependencies

Core Free, the local source catalog, and paid runtime have different boundaries. The audited build packaged Core Free with the security squad while the checkout contained a larger local catalog; source presence did not mean customer installation. Paid/provider activation and upstream private Pro were not certified. Static Claude/Codex/Gemini/Grok parity passed, while native host behavior was not assessed. Five upstream Grok hook behaviors—push authority, compaction digest/wrapper, and SYNAPSE engine/wrapper—lack established local runtime equivalence.

## Acceptance Criteria

- [x] AC1: Define a versioned installed capability manifest per artifact containing artifact/package identity and hash, capability ID/version, packaged paths, license/provenance record, support status, activation requirement, host availability, required dependencies/configuration, evidence level, and explicit exclusions. Invalid, duplicate, unowned, unlicensed, or payload-missing entries fail validation.
- [x] AC2: Generate or verify manifests from actual fresh package/install payloads for Core Free and other locally buildable authorized artifacts. Reconcile manifest entries to exact installed bytes and reject source-only capabilities, absent squads, undeclared payloads, stale hashes, or environment/global resolution. The local checkout catalog is reported separately from installed artifacts.
- [x] AC3: Represent paid/private capabilities as absent, eligible-but-not-installed, installed-unactivated, activated, unsupported, or unverified according to actual evidence. No manifest, license fixture, local `pro/` path, or mocked entitlement can claim customer activation, authenticated acquisition, provider execution, or release acceptance.
- [x] AC4: Define host evidence levels that distinguish generated/configured projection, static parity validation, installed host discovery, native hook/command execution, and end-to-end accepted behavior. CLI/Doctor/read-only reporting uses these exact levels and exposes missing/stale evidence rather than collapsing them into supported.
- [x] AC5: For Grok, test authority enforcement, compaction context/digest behavior, SYNAPSE context injection, and any other claimed managed hook behavior on the actual installed projection where the native client permits it. Each of the five audited upstream hook behaviors receives runtime evidence or explicit unsupported/not-assessed status; missing equivalence cannot be replaced by copied templates or static file comparison.
- [x] AC6: Apply the same honest evidence model to supported Claude, Codex, and Gemini projections using only permitted local fixtures/runtime metadata. A configured file is not a provider/session identity claim. Host-specific unsupported controls and unavailable runtime metadata remain explicit.
- [x] AC7: Fresh isolated install tests verify free defaults expose only manifest-declared packaged capabilities, unavailable/paid commands fail with actionable truthful status, and tampered/stale manifests or payloads fail closed. Negative tests cover license/provenance absence, payload mismatch, unauthorized paid activation, global-hoist leakage, unsupported host behavior, and malicious manifest fields.
- [x] AC8: Run package inventory, manifest, licensing boundary, selected-host install, native behavior where available, static parity, required repository gates, and independent `@qa` review on one exact candidate. Report configured, installed, runtime-verified, unavailable, and NOT_ASSESSED separately; do not claim five-repository parity, release readiness, or provider certification.

## Tasks / Subtasks

- [x] Define the installed capability/provenance/evidence manifest and strict validation (AC1).
- [x] Bind fresh package payloads and local catalog differences to exact manifests (AC2).
- [x] Encode paid/private lifecycle states without activation inflation (AC3): Core Free absent; other distributions unsupported without authenticated adapters.
- [x] Implement host evidence levels and truthful Doctor/CLI readout (AC4).
- [x] Verify or mark unsupported Grok, Claude, Codex, and Gemini behaviors (AC5–AC6).
- [x] Run fresh-install tamper/denial matrix, repository gates, and independent QA (AC7–AC8).
  - [x] Correct cached dependency disappearance during validation/read and independently review same-process, path-kind, read-disappearance and permission-error regressions (2026-10-13).
  - [x] Verify the correction on two fresh isolated consumers of exact archive `9e1fbee0…c9ad`: same-process disappearance reports unavailable; fresh-process outside-consumer resolution is denied without dependency execution. Independent outcome review accepted this bounded scope; the original 16,815-entry consumer is unchanged.

## Dev Notes

Implementation contract (2026-10-10): inspect actual bounded npm tarball bytes with the already-declared `tar` dependency without extracting or executing package code. Generate a detached manifest (stdout/API) to avoid embedding a circular archive hash. Bind every packaged file and capability path to its hash; trusted local catalog supplies ownership, license/provenance paths and support exclusions. Verify a separately selected isolated npm installation against exactly that archive inventory, including unexpected files and dependency resolution outside the consumer. Source checkout presence never proves installation or activation. Core Free is the only currently accepted distribution boundary; paid acquisition/activation and native host execution remain NOT_ASSESSED without actual receipts. Reuse the existing capabilities CLI and selected-host Doctor metadata, preserve user-managed host files, and add no downloader or provider. Correct install-manifest generator drift by reusing the installer's exported copy lists (schemas/presets/constitution are currently omitted by the duplicate list).

Inspect `.aexos-core/data/core-package-boundary.json`, `.aexos-core/install-manifest.yaml`, packaging/build validators, installer selected-host logic, IDE/skills sync, `grok-skills-sync/index.js`, `.grok/hooks/`, `.grok/config.toml`, Doctor host checks, paid licensing boundaries, and existing parity tests. Preserve user-managed host files and selected-host semantics.

Do not add browser controls, new marketplaces, external paid services, provider credentials, wholesale upstream hook imports, or release/publish work. Any native-host test must use installed clients and allowed local metadata; otherwise mark it unavailable/NOT_ASSESSED.

[AUTO-DECISION] Missing native host → record unsupported or NOT_ASSESSED rather than substituting static projection success.

## Testing

Build actual authorized package artifacts, install into fresh isolated consumers, hash payloads, and compare every declared capability. Tamper one manifest and one installed payload to prove fail-closed checks. Host tests must bind client/version/config/runtime evidence when exposed and preserve unavailable distinctions.

## CodeRabbit Integration

Packaging / Integration / Security, very high complexity. `@dev` implements; `@qa` independently gates; `@architect` reviews evidence semantics and `@devops` participates only if later packaging/PR authority is requested. Self-healing: dev light; QA full. Focus: package/source confusion, license omission, paid-state inflation, stale hashes, host false parity, user-file overwrite, and leaked credentials.

## References and provenance limits

- Audit `REPORT.md` sections **Host portability**, **Distribution/paid capabilities**, **E8–E9**, and **Wave 4**.
- [AEX-3.7 Core Free Package](STORY-AEX-3.7-CORE-FREE-PACKAGE.md), [AEX-3.8 Signed Paid Squad Artifacts](STORY-AEX-3.8-SIGNED-PAID-SQUAD-ARTIFACTS.md), [AEX-4.12 Grok Projection Parity](STORY-AEX-4.12-GROK-PROJECTION-PARITY-COMPLETION.md), [AEX-4.21](STORY-AEX-4.21-CRITICAL-SDLC-CONTRACTS-AND-INSTALLED-JOURNEYS.md), and [accumulated context](accumulated-context.md).

Static parity, local fixtures, source presence, and entitlement mocks are separate evidence layers. Inaccessible gitlinks and private provider systems remain unverified.

## Story Draft Checklist

READY, clarity 10/10. All categories PASS; manifest fields, installed/payload proof, paid states, host evidence levels, negative tests, provenance, and unsupported claims are explicit. Implementation and QA acceptance remain pending.

## PO Validation Notes

**Verdict:** GO (10/10 readiness; high confidence) for preparation only. Validated on 2026-10-10 against the PO story-validation task, accumulated context, Core Free and signed paid-artifact history, current package/installer/host projection seams, and the audit's distribution and host-portability findings.

- Actionability and negative paths: PASS. Manifest schema, payload/hash reconciliation, source-only rejection, paid/private lifecycle states, evidence levels, tamper/global-hoist tests, unsupported hosts, malicious fields, and fresh isolated consumers are measurable.
- Dependency hold: AEX-4.20 and AEX-4.21 require exact-candidate and independent acceptance before installed-capability or host-parity results can be accepted. `Ready` permits preparation only.
- Free/local/paid boundaries: PASS. Core Free payload, local checkout catalog, eligible but absent paid capability, installed-unactivated content, activated capability, and unsupported/unverified behavior remain distinct. Mocks, local `pro/`, entitlement fixtures, or source presence cannot certify acquisition or activation.
- Host evidence and CLI authority: PASS. Generated configuration, static parity, installed discovery, native execution, and end-to-end acceptance are separate levels. CLI/Doctor reporting is read-only; missing native clients or metadata produce unsupported/NOT_ASSESSED rather than substituted parity.
- Provenance and scope: PASS. Exact package bytes, licenses, dependencies, selected-host semantics, and user-managed files are protected. Wholesale hook imports, external paid services, credentials, release/publish work, and five-repository parity claims remain excluded.
- Quality boundary: Native behavior is verified only where permitted and observable; unavailable checks remain explicit and independent `@qa` acceptance is pending.

## File List

Production-integration follow-up files (2026-10-26):

- Package policy: `package.json`, `.aexos-core/data/core-package-boundary.json`, and `packages/installer/src/enterprise/enterprise-upgrade-manifest.yaml`.
- Required public helper wrappers: `.claude/commands/AEXOS/scripts/agent-config-loader.js`, `generate-greeting.js`, `greeting-builder.js`, and `session-context-loader.js`.
- Installed harness: `scripts/e2e/installed-skills-smoke.js`.
- Focused package/installer coverage: `tests/cli/core-package-boundary.test.js` and `packages/installer/tests/unit/enterprise/enterprise-upgrade-plan.test.js`.
- Independent installed evidence: existing production-preparation records `installed-candidate-r5-artifact.json`, `installed-skills-production-r5.{log,status.json}`, and `installed-production-matrix-independent-review.json`; none are package payload.

- External original-scope closure evidence: existing `ordinary-integration-20261012/current-parity-readiness/` records (`source-reuse-check-20261016.json`, `original-scope-gates-20261016.json`, `accepted-correlation-check-20261016.json`, `original-scope-independent-review.{md,json}`); backups under `before-original-scope-acceptance/`.

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.27-INSTALLED-CAPABILITY-MANIFEST-AND-HOST-PARITY.md`.
- Added `.aexos-core/core/execution/installed-capabilities.js`, `installed-capabilities-cli.js`, `.aexos-core/data/installed-capability-catalog.json`, `.aexos-core/schemas/installed-capabilities-v1.schema.json`, `tests/core/execution/installed-capabilities.test.js`, `docs/guides/installed-capability-evidence.md`, and this epic's `provenance/installed-capabilities-intake.json`.
- Updated `scripts/inspect-capabilities.js`, `scripts/generate-install-manifest.js`, `.aexos-core/core/doctor/checks/selected-hosts.js`, `tests/core/doctor/doctor-truthfulness.test.js`, and `tests/installer/generate-manifest.test.js`.
- Updated `package.json`, `.aexos-core/data/core-package-boundary.json` and the installed-capability tests to declare the existing translated README payloads that npm includes automatically; the narrow metadata correction received independent approval.
- Regenerated `.aexos-core/install-manifest.yaml` after source freeze; this content inventory is separate from the detached npm archive capability manifest.
- External qualification artifacts: `ordinary-integration-20261012/current-parity-validation/run-installed-capability-negatives.cjs`, `installed-capabilities-20261013/{receipt.json,fresh-child.json,fresh-control.json,manifest.json}`, `independent-review/{outcome-review.md,outcome-admission.json}`, and `environment-observation.json`. These are retained task evidence, not package payload.

## QA Results

Independent R2: **APPROVED within component scope**. Initial archive path-tree collisions and Doctor's directory-as-configuration PASS are closed by shared ordinary-file checks and a bounded complete archive entry tree. Three focused suites / 75 tests and 15 independent probes passed, including a valid implicit-to-explicit directory control and rejected hardlinked configuration. Exact hashes: external `aexos-implementation/evidence/installed-capabilities-4-27-review.md`. Actual npm installation, native host execution and combined candidate gates remain separate holds; copied npm-layout fixtures do not close AC7/AC8.

## Change Log

### 2026-10-13 installed CLI help observation

Actual Codex and Claude executable help commands exited0; complete outputs are retained and hash-bound. Codex advertises model, sandbox, strict-configuration and hook-trust controls; Claude advertises agent, effort, hook-event, settings and structured-output controls. These are installed CLI declarations, not evidence that AEXOS hooks ran, a requested model was available or a provider executed. No bypass flag, provider call or configuration mutation was used. Native hook/session-model acceptance remains NOT_ASSESSED. External File List additions: current-parity-validation/host-help-observation/{codex-help.txt,claude-help.txt,receipt.json,interpretation.json}.

### 2026-10-13 static integration check follow-up

All four current offline validation commands exited0: sync:ide:check, validate:parity, validate:codex-sync and validate:codex-integration. Checked source hashes matched before/after. The parity check generated and removed its own temporary Grok projection; no repository synchronization or provider invocation occurred. Evidence remains static projection/count/path verification, not native-hook/model execution.

The twelve reported Claude skill orphans are a demonstrated Windows comparison defect: expected nested names use forward slashes while the recursive walk returns backslashes. The target namespace is already correctly appended; it must not be flattened or renamed. Real skill loading or precedence conflict is NOT_ASSESSED. Preserve every managed/custom artifact and correct only the path comparison.

- [x] Normalize equivalent platform path separators in orphan membership checks without collapsing different directories or suppressing real orphaned files.
- [x] Add meaningful nested-skill positive and unrelated same-basename orphan negative regressions; rerun focused lint/tests and the four offline checks.
- [x] Independently review the correction and run required repository gates before final acceptance.

External File List additions: current-parity-validation/current-ide-static-checks/{receipt.json,report.md,*.stdout.txt,*.stderr.txt}. The linked-token native candidate9e1f remains immutable; any later source/package acceptance must retain its own identity.

The bounded correction is independently GO: platform-aware path.normalize is used only for orphan membership, preserving case and full hierarchy. Independent Windows controls retain true same-basename orphans, nested paths, missing and drift failures. Focused RED1fail23pass becomes GREEN24/24; current static sync reports109/109 missing0drift0orphan0, Codex12agents/12skills. Source admission328b97e50cbf336a7bfb2321c71e06526f79a0de967d51a5baafe3cc62a7e8a3. Required repository gates then pass:496suites11528tests,11suites147tests skipped, naturalJest exit0 with detectOpenHandles and noforceExit; lint0errors267warnings, typecheck/build/manifestgeneration/manifestvalidationpass. Summary SHA9d55f10231c2cbd544e426a1b1fa903491bf2ef9d317d4eb33f251bb7a963ee0. Manifest delta is only this validator entry plus generated_at, with beforebackup retained. This closes only the Windows false-orphan regression and its gates; wholehost/native/provider parity remains open.

File List additions: .aexos-core/infrastructure/scripts/ide-sync/validator.js; tests/ide-sync/validator.test.js; regenerated .aexos-core/install-manifest.yaml. External evidence: currentBase/current-parity-validation/ide-path-correction/ (retained literal directory), current-parity-validation/ide-path-independent-review/, repo-gates-after-ide-correction/.

### 2026-10-13 fresh installed correction acceptance

Two new isolated consumers were copied from the immutable installed linked-token candidate, bound to archive SHA-256 `9e1fbee0f348ba75a3471f996d13b3f05bb97381f22b7f65e77e23c597f3c9ad` and installed API SHA-256 `109fe1df1bf379b9f9e501713c64dd0cf13ac7d016269ae77443f82fb67db734`. The same process first discovered the dependency, then classified its task-owned removal as unavailable without cache clearing. A fresh child rejected a dependency resolved outside its consumer; its execution marker remained absent. The original consumer's 16,815-entry before/after digest matched. Three directory moves were confined to the new fixture; all artifacts are retained. Independent outcome admission SHA-256 `dab94aa560a9c469f06b0d9f1469ae871162f02113cc3ee2c5117d8e88508ffe` accepts these two classifications only, with receipt SHA-256 `4a32d551e382532190d296cee2fd055caa3565548d7e143fd3126ae966bb173b`. This closes the installed cached-missing regression hold; it does not certify the entire security matrix, native 1314 resolution, R6 activation, production, or full parity.

Read-only client discovery found Codex CLI `0.162.0-alpha.17.2` and Claude Code `2.1.289`. Gemini and Grok were not found on the current PATH; installation elsewhere is NOT_ASSESSED. These observations establish installed-host discovery only. Managed hook execution and session/model identity remain NOT_ASSESSED; no provider invocation, configuration change, or paid API occurred. The five upstream HEADs remain equal to the audited pins. R6 was subsequently confirmed manually executed and consumed before activation on unavailable command metadata; native acceptance requires correction and a fresh separately reviewed qualification, without replaying R6.

### 2026-10-13 cached dependency correction

An actual installed tamper matrix exposed a raw ENOENT after Node cached a successful dependency resolution and the task-owned copy was removed. The verifier now reports that missing dependency as unavailable across resolved-entry validation and reading, while rethrowing permission, path-kind and other security failures. Four regressions were added without clearing resolution caches or weakening existing assertions; 33/33 focused tests and forced scoped lint passed. Independent source review accepted the exact correction (source SHA-256 `109fe1df1bf379b9f9e501713c64dd0cf13ac7d016269ae77443f82fb67db734`) and the future installed harness, which separates the cached-missing control from fresh-process outside-consumer resolution. Evidence is external `ordinary-integration-20261012/capability-correction/` and `correction-independent-review/review.md` (SHA-256 `32dd2112c2cdc55c33aba277cac1a48b82ab55b24a5405ff7353369fad77b64c`). The old installed package remains immutable for native R2; fresh corrected-package validation and repository gates are pending separately.

### 2026-10-11 actual installation continuation

The initial isolated archive installed with scripts disabled and loaded the CLI, but was not capability-verified. Running the installed verifier exposed a real inventory defect: the internal package's installed dependencies were treated as extra payload. The correction recognizes only dependency directories owned by the two archive-bound runtime package manifests, verifies their bytes before trusting declarations, retains rejection of arbitrary nested locations, and reports consumer-confined discovery per package. Three focused suites / 82 tests and scoped lint pass. Exact source hashes, the retained failing installed receipt, RED/GREEN results and self-review are in external `continuation-20261011/evidence/capabilities-nested-correction.md`. Independent review, a fresh actual install of the corrected archive, final integrated gates and whole-story acceptance remain pending. The earlier source/component approvals do not approve this new correction.

Independent continuation review: **APPROVED for the bounded dependency-inventory correction**. The three source/test/guide hashes matched before and after; 29 tests, scoped lint and three independently authored scenarios passed (separate root/internal discovery, manifest-tamper denial and arbitrary nested-directory denial). Fresh package/install, functional matrix, global gates and whole-story acceptance remain separate. Exact review and evidence: external `evidence/installed-capabilities-4-27-review.md` and `continuation-20261011/evidence/capabilities-nested-independent/`.

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-10 | 0.1 | Draft installed capability and honest host-parity story. | Chronos / `@sm` |
| 2026-10-10 | 0.1.1 | Validated GO (10/10) for preparation — Status: Draft → Ready; AEX-4.20/AEX-4.21 acceptance remains gating. | @po |
| 2026-10-26 | 0.2 | Added the separate official-main production-integration and exact installed-TGZ evidence follow-up; historical Done acceptance remains unchanged and broader provider/native/production claims remain excluded. | Integration owner |

