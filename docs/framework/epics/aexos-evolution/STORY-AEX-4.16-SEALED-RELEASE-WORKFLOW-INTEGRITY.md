# Story AEX-4.16: Sealed release workflow integrity

| Field | Value |
| --- | --- |
| Story ID | AEX-4.16 |
| Epic | AEXOS Evolution |
| Status | Done — corrected local implementation accepted; hosted release and provider gates remain open |
| Executor | `@devops`, with bounded `@dev` helper/test support |
| Quality gate | `@architect` design approval; independent `@qa`; `@po` evidence coherence |
| Dependencies | Accepted AEX-4.14 release SOP and concrete blocker inventory; ADR-AEX-011 public/private boundary |
| Quality gate tools | Workflow parsing/contract checks, fixture-backed transaction tests, sealed-TGZ checks, existing lint/typecheck/tests/build and publish-boundary validation |

## Story

As an AEXOS maintainer, I want every supported release entry point to use one coordinated transaction for an approved source commit and sealed package set, so that retries, conflicting triggers and registry failures cannot publish different bytes or falsely report a completed release to a new npm user.

## Verified context and decisions

AEX-4.14 corrected release guidance and passed independent documentation review. It deliberately left implementation blockers: three independently coordinated workflows; moving-main dispatch and time-window run matching; automatic `latest` selection; registry errors treated as absence; unverified existing-version skips; mutable rebuilds/assets; and summaries that do not prove exact publication. Current `.releaserc.json` also enables an independent npm/GitHub publisher and version-preparation plugin, so YAML changes alone cannot close the competing write path.

[AUTO-DECISION] AEX-4.16 is free after AEX-4.15. The user's continued release/first-value remediation authorizes this bounded correction. Ready means sufficient requirements to begin the architect contract; no source implementation precedes that reviewed contract. No package version, channel, provider configuration or publication is approved by story creation. Existing semantic version preview capability may remain read-only; its output is a proposal, never approval or an alternate publisher.

Primary npm onboarding remains `npx @aexos/core`. Core is free and public; paid squad payloads stay private. Preserve the existing first-value PR and dirty checkout. Candidate reconstruction from AEX-4.14 is separately owned and must not be folded into these workflow edits.

## Acceptance criteria

- [x] AC1: Before implementation, `@architect` records an explicit contract covering the immutable candidate manifest, source/artifact/run identity, allowed entry points, serialization/collision key, per-package state transitions, retry reconciliation, authentication boundaries and exact file ownership. Review all three publishing workflows, `.releaserc.json`, release npm scripts and local runner/plugin paths. Use the existing workflow/tooling architecture; no new public product command, service or paid gate. `@qa` validates the negative-case design, and `@devops` owns workflow/provider-facing implementation.
- [x] AC2: All tag, published-release, manual and semantic-release routes either converge on one validated publication transaction or explicitly refuse as retired/read-only entry points. No independent npm/GitHub publisher remains through a plugin, local release runner or fallback workflow. Bind the intended full commit SHA and exact sealed candidate to every checkout, artifact lookup and child operation; reject missing/mismatched/tag-retargeted identity. Remove moving-main dispatch and time-window run inference. Competing runs for overlapping package/version writes cannot bypass serialization by using different workflow names, refs or package selections. Preserve normal branch/review rules and do not create baseline tags merely to enable a run.
- [x] AC3: Validate a strict internal candidate manifest before any external write. It identifies the approved source commit, explicit selected package names/versions, permitted channel, actual npm TGZ paths and digests/inventories, required verification and immutable build/run origin. Validate archive metadata against its entry, allowlisted package ownership and companion dependency/version compatibility. Reject missing/extra/wrong-version artifacts, mutable/expired/unavailable artifact references, path escapes and changed bytes. Publish those sealed npm TGZ bytes, not fresh directory rebuilds or broad repository tarballs. Preparation/lifecycle/version synchronization cannot mutate accepted bytes after sealing; existing publish safety and public/private boundary checks still run at the appropriate pre-seal stage.
- [x] AC4: Channel/version/package selection is explicit and validated for every route. Prerelease versions cannot implicitly target `latest`; missing or inconsistent tag/version/channel/package information fails before writes. Preserve supported Core, installer and compatibility-package behavior only when each is explicitly included and validated, including the legacy wrapper's Core dependency. Excluded packages do not appear published. This change neither chooses a next release version/channel nor edits production version fields, dist-tags, product rights or public availability claims.
- [x] AC5: Registry inspection distinguishes authoritative package/version absence from authentication/authorization failure, timeout, rate limit, server error, malformed metadata and unknown outcomes. Only proven absence permits a new publish. A pre-existing version is accepted only after verifying package/version, sealed tarball integrity/content, source identity and intended channel correspondence; mismatch is a conflict, not a skip. After an uncertain publish response or authentication-path failure, re-read and reconcile provider state before retry/fallback. Matching completed entries may resume without republishing; conflicting or unresolved entries fail nonzero. Retain least-privilege supported authentication without inventing trusted-publisher registration, weakening protections or exposing credentials.
- [x] AC6: Git tags, release assets and package results are tied to the same transaction. Never swallow archive/release errors or replace conflicting assets with `--clobber`. Verify existing matching tags/assets on retries; preserve partial publication evidence without deleting/unpublishing/retagging to simulate rollback. Final success requires every selected package and its required verification; skipped/failed/cancelled/missing checks and a successful child dispatch are not publication acceptance. Report prepared, published-but-unverified, verified, conflict and blocked outcomes truthfully with exact operation/run/artifact identities. Required export and fresh installed init/Doctor checks remain gating for the selected Core transaction. Generated notes use actual candidate/package metadata and the primary npm onboarding route without stale static capability claims.
- [x] AC7: Add meaningful tests of the actual helper/adapter/state code and workflow wiring, using injected fake provider responses and real locally packed fixture TGZs without real npm/GitHub writes. Cover competing tag/release/manual events, overlapping package selections, duplicate/restarted/partial transactions, source/tag/artifact drift, stable/prerelease mismatch, extra/missing package, authoritative absence versus 401/403/404/429/5xx/timeout/malformed responses, matching/conflicting existing integrity and asset, uncertain-write reconciliation before authentication fallback, failed/cancelled/skipped required checks and no-release semantic preview. Invalid or unknown pre-write cases cause zero publish/asset-write calls; an uncertain prior write causes zero additional write calls until reconciled; matching completed retry causes zero duplicate writes. Exercise the actual package verification and local install/exports/init/Doctor path with fixtures; fixture success is not provider acceptance.
- [x] AC8: Run targeted regressions and workflow syntax/contracts plus repository lint, typecheck, tests and build; retain existing package/publish safety checks and record exact exits/executed/skipped counts. Obtain architect review of implemented contract, independent QA and PO evidence review. Update the accepted SOP only to describe the resulting verified implementation and remaining provider gates. Preserve a reviewed source/file list and exact local identity; no actual push, PR mutation/review request, tag, release, publication, credential/trust/ruleset change or deployment is needed to complete local implementation acceptance. Hosted workflow execution and a real sealed release remain separate evidence until explicitly performed by DevOps against approved inputs and normal protections.

## Tasks and ownership

2026-09-10 remote follow-up: CodeQL identified implicit setup-node package-manager
caching across caller-selected payloads and ambiguous single-star replacement.
This continuation disables automatic dependency caching in the two release
workflows and constructs export specifiers from their validated single-star
segments. The macOS installer fixture canonicalizes its temporary parent to
avoid testing a system symlink in a success-path test; product link rejection
is unchanged. Owned additional test: `tests/installer/pro-setup-target-install.test.js`.

- [ ] Verify these corrections locally and on remote CodeQL/installer matrix.

CodeQL retained the three payload-execution findings after automatic caching
was disabled. Hosted prepare/proposal now additionally require protected-main
dispatch and exact equality between the declared source SHA and `github.sha`;
payload checkout uses the immutable event SHA. Tests cover the guard and its
position before checkout. The release SOP records this narrowed hosted contract.

- [x] Inspect actual competing write paths, identify next ID and record bounded source evidence (AC1).
- [x] Architect specifies the contract and exact owned file list; QA reviews failure/retry coverage before code (AC1).
- [x] DevOps unifies or retires competing workflow/plugin entry points and binds exact source/artifact identity (AC2).
- [x] Implement candidate, package/channel and archive verification, preserving existing safety boundaries (AC3-AC4).
- [x] Implement provider absence/error classification, reconciled retries and truthful complete/partial outcomes (AC5-AC6).
- [x] Execute adversarial fixture-backed transaction and workflow tests; preserve first-value/package regressions (AC7).
- [x] Complete required gates and independent reviews; update SOP, evidence and file list (AC8).

Primary source ownership is `.github/workflows/npm-publish.yml`, `.github/workflows/release.yml`, `.github/workflows/semantic-release.yml`, their narrow `.releaserc.json` publication/prepare settings and `scripts/run-semantic-release.js` entry behavior. Reuse existing helpers; any small new internal helper belongs under `scripts/` and matching regression files under `tests/unit/ci/` or `tests/cli/`, with exact paths assigned by the architect before edits. `package.json` changes, if necessary, are restricted to the owned release-script wiring. `scripts/sync-version-lockstep.js` and `bin/utils/validate-publish.js` are integration dependencies; modify only proven contract gaps under explicit architect ownership. Do not copy unrelated dirty hunks, change package versions/dependencies for convenience, alter paid-provider certification, reconstruct the catalog candidate or rewrite installer/Office/Brand code.

PO owns this story and the bounded discovery artifact only. DevOps remains the exclusive owner of GitHub/release operations under the Constitution; QA review never substitutes for normal external PR approval.

## Technical guidance and validation

Treat a sealed candidate as an immutable manifest plus exact npm archives, distinct from source zip/tar assets. Existing workflow YAML and `tests/unit/ci/pro-distribution-workflows.test.js` provide local wiring-test patterns; `bin/utils/validate-publish.js` and `scripts/validate-core-package.js` provide existing public distribution boundaries. Reuse Node/CommonJS, existing YAML/test tooling and dependencies where feasible. A shared concurrency label alone is insufficient unless every effective writer and overlapping package selection participates. Unknown remote state must remain unresolved until verified; success must represent verified effect, not merely an exited subprocess.

The architect decides the minimal adapter/serialization design and how unsupported legacy write entry points refuse. The implementation may fail closed while real approved artifacts/trust are unavailable; it must still provide substantive locally exercised transaction logic, not only disabled workflows or mock-only placeholders. No test needs secrets, a real public version, new infrastructure or paid-service credentials.

Run focused actual regression commands defined by that implementation, then `npm run lint`, `npm run typecheck`, `npm test -- --runInBand` and `npm run build`, plus applicable manifest/public-package gates. Capture fixture TGZ hashes, tool/runtime versions, failure cases and actual commands. Do not reuse combined dirty-root counts as acceptance for a later reconstructed commit. Existing AEX-4.14 provider facts are dated observations; reverify read-only identity when conducting actual provider acceptance.

## Risks and rollback

Highest risk is duplicate or wrong-byte publication through an overlooked writer, followed by false success after a partial write. Contract-level tests cover every current entry and publication plugin, and preserve explicit partial states. Required-check failure cannot be disguised as a post-release warning. Local rollback restores only story-owned source hunks; never reset the shared checkout. Once any external write has occurred, recovery first inspects immutable provider state and preserves evidence: unpublish, asset replacement and tag retargeting are not automatic rollback. Removing an old path must not silently leave a second usable writer or break read-only version analysis.

## CodeRabbit Integration

**Type:** Deployment, security and integration. **Complexity/risk:** High. **Primary agents:** `@devops` and bounded `@dev`; supporting `@architect`, independent `@qa`, `@po`.

- [x] Pre-commit: focused automated review if available, otherwise record actual unavailability and perform independent review; no invented PASS.
- [ ] Pre-PR: DevOps reviews exact source/manifest/workflow closure and required checks, preserving external review rules.
- [ ] Pre-release: future exact-candidate/provider acceptance remains unpassed until real evidence; this local story does not execute it.

Self-healing: dev light (two iterations/15 minutes, critical), QA full (three/30, critical/high), DevOps check/report-only. Focus: exact identity, competing writers, provider ambiguity, secret-safe diagnostics, first-value regressions, public/private boundary and recovery without destructive replacement.

## References

- [Accepted AEX-4.14](STORY-AEX-4.14-RELEASE-SOP-AND-CANDIDATE-TRACEABILITY.md): documentation-only acceptance and remaining implementation blockers.
- [Release SOP](../../../guides/release-procedure.md#existing-trigger-map-and-implementation-blockers): five concrete transaction defects and future controlled release chain.
- [Candidate integration plan](RELEASE-CANDIDATE-SLICES-20260908.md#release-chain-available-versus-missing): separately owned reconstruction and absent release evidence.
- [ADR-AEX-011](adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md): unchanged public Core/private paid distribution.
- Bounded discovery (reference retained in the maintainer workspace; not included in this public candidate): current workflow/config hashes and source locations.
- Accumulated context (reference retained in the maintainer workspace; not included in this public candidate): preserve concurrent ownership and distinguish local/source/provider acceptance.

## Story validation and file list

Brownfield completeness, safety and information checks passed before implementation; applicable story-draft categories 1-6 PASS. Final architect, independent QA and PO acceptance now close the original local AC1–AC8 at the frozen identity below. No unavailable provider setting, approved release version or publication is inferred.

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.16-SEALED-RELEASE-WORKFLOW-INTEGRITY.md`.
- Created evidence only: `artifacts/commercial-readiness-20260908/aex-4.16-discovery.md`.
- Product/workflow edits: none during story creation; final implementation owns the following 18 source/test/documentation paths:
  - `scripts/ci/sealed-release.js`
  - `tests/unit/ci/sealed-release.test.js`
  - `tests/unit/ci/sealed-release-installed.test.js`
  - `.github/workflows/npm-publish.yml`
  - `.github/workflows/release.yml`
  - `.github/workflows/semantic-release.yml`
  - `.releaserc.json`
  - `packages/aexos-install/.releaserc.json`
  - `package.json` — only the `release:test` script hunk; unrelated dirty fields remain outside ownership.
  - `packages/aexos-install/package.json` — only architecture-owned release scripts and removal of the remote postversion hook.
  - `scripts/run-semantic-release.js`
  - `scripts/ci/release-providers.js`
  - `scripts/ci/extract-release-artifact.py`
  - `scripts/run-sealed-release.js`
  - `tests/unit/ci/release-providers.test.js`
  - `tests/unit/ci/sealed-release-workflows.test.js`
  - `tests/cli/validate-publish.test.js`
  - `docs/guides/release-procedure.md`
- Evidence/review records under `artifacts/commercial-readiness-20260908/aex-4.16/`: architecture/design/seams, initial findings and corrections, source bindings, current verification, frozen gates, final architecture/QA/PO reports and fixture runners. These are local evidence, not a public release payload.

## Dev Agent Record

Architecture and independent QA design approved before source edits. Contract:
`artifacts/commercial-readiness-20260908/aex-4.16/architecture.md`; approved design
SHA256 `1ddc70047ef3983c74b0bc06385d4354dd6680bd55140a7b1abfc2fb833e4d5b`.
QA negative-case design: `qa-design.md` in that directory. Canonical repository
and ID were verified; the concrete whole-plan durable-intent protocol requires an
exhaustive sealed terminal ledger and prohibits effects after sealing.

Implementation split: root dev owns `scripts/ci/sealed-release.js`,
`tests/unit/ci/sealed-release.test.js` and the planned installed-package suite.
DevOps owns workflow/config/release-script wiring, `scripts/ci/release-providers.js`,
`scripts/ci/extract-release-artifact.py`, `scripts/run-sealed-release.js` and the
provider/workflow suites. Exact agreed seams: `module-interface.md`; additional
nested installer release configuration is explicitly included by architecture.
No package versions/dependencies or provider objects are changed.

Corrected implementation includes strict manifest/archive validation, one manual
writer, guarded read-only semantic proposals, immutable source/artifact identity,
durable intent, exhaustive terminal effect evidence, bounded read reconciliation,
pre-seal preparation and actual installed verification. Initial archive/PAX,
historical writer/intent, external public export, lifecycle-order and malformed
Doctor-status findings were reproduced and corrected; original rejection evidence
remains preserved.

Final focused execution: **200 passed, zero failed/skipped** across five suites:
71 engine + 11 installed/preparation + 71 provider + 27 workflow + 20 retained
publish-boundary tests. The 118 DevOps/boundary tests are distinct from the 82
engine/installed tests. Earlier component counts are historical, not final gates.

Accepted local snapshot: `C:/AEXOS-LOCAL-TESTS/aex416-core-J0VWwi`; inventory digest
`e0a7fd7779bb0026d9951b8e93ee3240d130599a59fe96ecdab0bb4f333b71c8`;
corrected engine `afb5c7f3a777d57a4750a05a79ec7475d1adffac4047a94e795485715dc1f406`.
`gates-recheck/receipt.json`, completed 2026-09-08T20:54:41.691Z, records
`allPassed:true`: npm ci, focused execution/assertion, parity, lint, typecheck,
full tests, build and Core package boundary all exit 0. Full tests: **10,881 passed,
zero failed, 172 existing skipped tests; 448 passed and 12 skipped suites**.
Skipped tests provide no acceptance coverage. Default parity passes 12 checks;
Grok's 78 projections remain native `NOT_ASSESSED`.

The harness compared 4,342 non-documentation source files without changes. Final
QA and architecture independently rehashed all 4,655 inventory entries in both
roots with zero differences; QA also matched all 1,934 TGZ payload files to the
snapshot. The earlier `gates/` run remains unaccepted because source changed after
capture; it was not relabelled as corrected evidence. Later story/review edits
are documentation metadata and do not redefine this historical source seal.

Actual Core TGZ SHA256:
`7be5e04c69b2adffd5e4dac48aaff49c93dc049298d3297c202a71b66407d954`.
Receipt: `C:/AEXOS-LOCAL-TESTS/aex416-installed-3NMqfv/receipt.json`, reproduced with
the evidence-only `verify-installed-fixture.cjs --core --source` runner. Actual
pinned Node 20.20.2/22.23.2/24.15.0 verified declared exports and the fixed public
Core CLI export. CLI help, default init and installed Doctor ran on Node 24 and
exited 0: **8 PASS / 2 WARN / 0 FAIL**. This is not a warning-free, registry-published
or three-runtime init/Doctor claim. Unit fixture major-version probes remain
explicitly separate from these real runtime executions.

Actionlint passed all three workflow files; actual isolated semantic fixtures
passed no-release/proposal and rejected analyzer failure without changing their
remote refs. CodeRabbit CLI is unavailable, not cleared; independent final
architecture, QA and PO review provide the documented alternative.

Exact commands and source/file bindings: `verification.md`,
`gates-recheck/receipt.json`, `devops-source-review.json`, `architecture-final.md`,
`qa-final.md` and `po-final.md` in the evidence directory. No actual provider
release, production version change, publication or new approved release commit
occurred. Normal external PR review, candidate/version/channel approval, actual
publisher trust, historical write reconciliation and hosted release acceptance
remain open; paid, signed runtime, Office and orchestration acceptance are separate.

## QA Results

**APPROVED — corrected local implementation.** Independent QA's final report is
`artifacts/commercial-readiness-20260908/aex-4.16/qa-final.md`; independent
architecture is **PASS** in `architecture-final.md`. Both accept the exact
corrected inventory and current packed evidence above, with no material local
implementation finding remaining. PO's `po-final.md` confirms original AC1–AC8
coherence and closes this local story. All prior findings/rejections remain in
the historical reports. Source/workflow acceptance is separate from actual
provider/release acceptance; pre-PR and pre-release operations remain unperformed.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready bounded workflow transaction correction from accepted AEX-4.14 defects; architect contract required before implementation. | Themis / `@po` |
| 2026-09-08 | 1.1 | Done for corrected frozen local implementation after independent final QA, architecture and PO review; preserved external release gates. | Themis / `@po` |
