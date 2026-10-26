# Story AEX-4.18: Isolated transitive audit remediation

| Field | Value |
| --- | --- |
| Story ID | AEX-4.18 |
| Epic | AEXOS Evolution |
| Status | Done — bounded correction and requested draft PR delivered; normal CI/review remain open |
| Executor | Root `@dev` isolated lockfile repair; `@devops` candidate/PR ownership |
| Quality gate | Independent `@qa`; `@po` evidence coherence |
| Scope | Two inherited vulnerable dependency resolutions and their necessary transitive closure |

## Story

As an AEXOS maintainer, I want the already available dependency fixes isolated into a reviewable candidate, so that inherited npm audit findings can be corrected without importing unrelated changes or modifying the frozen SYNAPSE candidate.

## Verified context

The actual AEX-4.17 pre-PR audit reports **two affected packages**, one high and one moderate: `fast-uri@3.1.5` has four high advisories whose affected ranges end before 3.1.6; `@humanfs/node@0.16.7` has the moderate recursive-copy symlink advisory affecting versions below 0.16.8. These resolutions are inherited from main, not introduced by SYNAPSE. Audit source: `artifacts/commercial-readiness-20260908/aex-4.17/pre-pr-npm-audit.json`.

Read-only inspection confirms the shared checkout already resolves `fast-uri@3.1.7` and `@humanfs/node@0.16.8`. Its humanfs entry additionally requires `@humanfs/core ^0.19.2` and `@humanfs/types ^0.15.0`; necessary transitive entries must be resolved and verified, not omitted to force a two-entry diff. The existing `fast-uri ^3.1.5` override permits 3.1.7. No new direct dependency or override is required merely to select these existing fixes.

[AUTO-DECISION] AEX-4.18 is available. The user authorized continued remediation and a reviewable PR. Root `@dev` owns the separate candidate's lockfile only; the shared root lockfile and frozen AEX-4.17 candidate remain untouched. DevOps owns local Git/PR operations under existing authorization. No new product surface, broad dependency refresh, `npm audit fix --force`, version bump or publication is needed.

## Acceptance criteria

- [x] AC1: Create an independent isolated candidate from the exact verified upstream base, recording its branch/commit and lockfile identity. Reproduce actual baseline installed dependency versions and npm audit JSON with timestamps, command/exit, Node/npm versions and advisory IDs. Attribute inherited findings correctly. Do not mutate AEX-4.17, PR #4, the shared root lockfile or unrelated checkouts. The reported pre-PR audit is historical evidence until this fresh baseline reproduction confirms current registry observations.
- [x] AC2: Change only candidate `package-lock.json` to resolve `fast-uri` to the already used 3.1.7 and `@humanfs/node` to 0.16.8, including only required transitive dependency/metadata/integrity changes. Obtain actual registry resolution and integrity rather than inventing or blindly copying fields. Verify all affected dependency edges satisfy unchanged manifest/override ranges. Record every changed lockfile node and why it belongs to this closure. Preserve root/workspace manifests, direct dependency ranges, package versions, scripts, application source and unrelated lockfile entries. If current resolution proves a different required change, record the concrete dependency conflict before expanding scope; do not run a general upgrade.
- [x] AC3: Perform fresh locked `npm ci` with a separate cache/user configuration and verify installed versions, lockfile stability and the real dependency tree. Run actual baseline/candidate `npm audit --json` and a production-only audit; the five reported advisory IDs must no longer affect candidate resolutions. Record any additional current findings honestly and separately, including severity and whether baseline or introduced. Registry/network/auth failure is not a zero-vulnerability result. Require the applicable audit policy to pass; an unresolved required audit gate prevents candidate acceptance.
- [x] AC4: Run candidate lint, typecheck, full tests, build and existing applicable package/manifest validation, plus meaningful affected runtime checks using the actually installed dependency and a freshly packed Core consumer. Verify public CLI export/help and existing manifest/config processing through their real dependency path; retain installed engine/Node requirements. Use available baseline tooling rather than importing unrelated alpha scripts or writing tests that merely mirror version strings. Capture exact exits and skipped counts. Any existing test-generated registry/manifest mutation is captured and confined to a disposable candidate test workspace, then restored to its recorded original bytes; it is not a new source change or an undisclosed clean-tree claim. Final candidate runtime/source and manifests remain unchanged apart from the owned lockfile.
- [x] AC5: Obtain independent QA for dependency closure, fresh locked install, actual audits and affected behavior; PO verifies evidence/scope coherence. DevOps seals the exact local candidate commit/file list and opens the requested focused PR through normal protected review, with baseline/candidate audit results and exact verification commands. No bypass, merge, package publication, tag, provider credential change or final release approval is implied. If a remote PR operation is blocked, preserve the complete reviewable candidate and body, record the concrete blocker and leave that operation uncompleted. Existing AEX-4.17 and first-value PR scopes stay separate.

## Tasks and ownership

- [x] Verify the two reported installed resolutions, existing fixed versions and available ID.
- [x] Root reproduces baseline audit and records a separate candidate identity (AC1).
- [x] Root resolves the minimal lockfile/transitive closure and verifies exact changed nodes (AC2).
- [x] Execute fresh locked install, audits and appropriate full/runtime/package gates (AC3-AC4).
- [x] Independent QA and PO review; DevOps owns exact candidate commit and normal PR handoff (AC5).

Only `package-lock.json` is implementation scope. Supporting story and public-safe verification/PR text may be added as documentation; no shared root lockfile or AEX-4.17 packaged document is edited. Use an isolated directory under `C:/AEXOS-LOCAL-TESTS/` and record the actual chosen path. No exact new branch name is presumed by this story. The existing fixed shared-root entries are evidence of intended versions, not authority to copy the full dirty lockfile.

## Validation and risks

Highest risk is unnoticed unrelated lockfile churn or missing humanfs transitive entries. Review a structured before/after node inventory, perform real locked installation and show installed dependency paths. A clean audit alone does not verify runtime compatibility; lint/build/full tests and actual packed consumer checks remain required. Conversely existing baseline findings or unavailable audit transport must not be suppressed to claim a clean candidate.

Rollback restores only the owned isolated lockfile candidate; preserve raw before/after audits and all other work. Remote history and published versions are never rollback mechanisms. Advisory observations can change; bind claims to their timestamp and exact dependency graph rather than claiming AEXOS has no possible vulnerabilities.

## CodeRabbit Integration

**Type:** Dependency/security integration. **Complexity:** Low-to-medium; **risk:** Medium. Root `@dev` implements; independent `@qa` checks the graph and behavior; `@devops` owns Git/PR. Use the existing dependency architecture; request architect input only for an actual unexpected contract change.

- [x] Pre-commit: automated review if available, otherwise record unavailability and independent review.
- [x] Pre-PR: DevOps verifies minimal diff, exact audit/gate evidence and normal approval rules.
- Pre-release: outside scope.

Self-healing: dev light (two iterations/15 minutes, critical); QA full (three/30, critical/high); DevOps report-only. No new approval checkpoint is added to the user's existing remediation/PR authorization.

## References and story validation

- [AEX-4.17](STORY-AEX-4.17-SYNAPSE-ISOLATED-CANDIDATE-INTEGRATION.md): preserve its frozen runtime candidate and separate inherited audit findings.
- [Accumulated context](accumulated-context.md): preserve concurrent work and separate source/provider acceptance.
- Actual bounded audit: `artifacts/commercial-readiness-20260908/aex-4.17/pre-pr-npm-audit.json`; IDs `GHSA-p498-v437-472g`, `GHSA-5jgf-p345-68v8`, `GHSA-f65p-4m7j-42xc`, `GHSA-fph4-wmhf-6fwf`, `GHSA-jqff-g426-hqxp`.

Brownfield completeness/safety/information and story-draft categories 1–6 PASS: exact symptoms, intended existing fixed versions, necessary transitive closure, source ownership, rollback and measurable verification are specified. Ready for the authorized isolated correction; no audit or implementation PASS is inferred from authoring.

## File list

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.18-ISOLATED-TRANSITIVE-AUDIT-REMEDIATION.md`.
- Changed isolated implementation: `package-lock.json` only; four npm-resolved nodes, 30-line diff.
- Public-safe story copied after source gates: same story path in the candidate; frozen SHA256 `506467d40051e0cd8c4e794db56215d09cf8a75948a5c1e61740149d740b0fef`. Root draft retained at `artifacts/commercial-readiness-20260908/aex-4.18/public-story-draft.md`.
- Candidate public verification: `docs/framework/epics/aexos-evolution/DEPENDENCY-AUDIT-VERIFICATION-20260908.md`. Together with the lock and public story, exactly three candidate files are changed.
- External final evidence: `artifacts/commercial-readiness-20260908/aex-4.18/final-candidate.json`; final PO and remote delivery are recorded separately.

## Dev Agent Record

Candidate `C:/AEXOS-LOCAL-TESTS/dependency-audit-remediation`, branch
`codex/dependency-audit-remediation`, is isolated from exact main
`5342f5a7c1ab6212087da2011265c11f1002503f`. Final local commit is
`2489935baddfef5d89ef657e78491bacd8caff63`, tree
`af8a09c40051389d9faeadc5d020e5f153877b2c`; its three-file scope is clean.
Fresh baseline reproduction ran 2026-09-08 21:46:28–21:46:58 UTC with
Node v24.15.0 and npm 11.12.1. Locked install and installed-tree checks exit zero;
full audit exits 1 with two affected packages (high 1, moderate 1), production
audit exits 1 with one high finding. Baseline lock remains unchanged at SHA256
`00cbc73c79bfa6d3b348c34453e42c9572e49dbd6905d3866713f172165ac09a`.

The targeted real npm update resolves exactly four lockfile nodes: fast-uri
3.1.5 to 3.1.7; @humanfs/node 0.16.7 to 0.16.8; required @humanfs/core 0.19.1 to
0.19.2; and new required @humanfs/types 0.15.0. No unrelated node refresh remains.
The final file uses exact npm-emitted ordering and bytes, SHA256
`edff087d502bb0e7296570252e30e3a5e4e64a0670863302956bc3dd4aef5b8a`;
it supersedes intermediate reordered bytes recorded by targeted-update-receipt.
Manifest/override ranges and package version are unchanged.

Fresh final locked installation used a separate cache and empty user/global npm
configuration, from 21:51:13–21:51:27 UTC. `npm ci --ignore-scripts --no-audit
--no-fund`, installed-tree inspection, full audit and production-only audit all
exit zero. Both final audit JSON results report zero vulnerabilities. The lock
remains unchanged. `npm ls` verifies actual AJV -> fast-uri and ESLint -> humanfs
paths with the four expected versions. Repository audits apply to this locked
graph; consumers independently resolve dependencies under unchanged ranges.

Raw evidence is under `artifacts/commercial-readiness-20260908/aex-4.18/`:
`baseline-receipt.json`, `targeted-update-receipt.json`, `final-lock-order.json`,
`candidate-final-receipt.json`, and associated installed-tree/audit logs.
All eight source gates completed at 21:56:54 UTC with exit zero: lint, typecheck,
full tests, build, manifest, package completeness, port denylist and registry
determinism. Full tests: 9,867 passed, zero failed, 172 existing skipped tests;
394 passed/12 skipped suites, 406 total. The 4,245-file gate inventory was
unchanged at `e1db556c737927b92cbf76eff828630efe679ee174e96e2806d2b18bc46b4383`.
No registry mutation or restoration occurred. Ten independent real affected-library
checks passed against installed fast-uri/humanfs, including actual symlink
copy behavior and AJV references; these are meaningful behavior checks.

The final source inventory adds only the two reviewed documents: 4,247 files,
`b67ef982e5f1d65ec48379fb99235001e4bd61a26b8bbddcf102389e72068953`.
Final TGZ SHA256 is
`57d8cafb112b7b9478cbccaec40590fd9814b9d169c98282214dd1f89bfacdd3`;
all 3,454 archive payloads match the committed/source bytes and fresh consumer.
Its lock binds the exact archive. The actual packed-runtime receipt passes six
checks: public resilience export, installed CLI help, real manifest/schema
validation, valid/invalid config profiles, actual AJV/URI identity and consumer
module confinement. Payload and consumer lock remain unchanged. This consumer
resolves AJV 8.20.0 and fast-uri 3.1.7, distinct from repository AJV 8.18.0.
No repository-lock inheritance by npm consumers is claimed.

Final receipt SHA256:
`7d970e64ac0e6025191cba5ea5f5c80948ba4f141174e89c62cd93e4ca83a301`.
All eleven linked evidence hashes match PO read-back. Whole-candidate final QA
and PO accept the local candidate. Actual draft PR delivery is now confirmed
separately below, completing original AC5 without changing its requirement.

## QA Results

Independent `artifacts/commercial-readiness-20260908/aex-4.18/qa-final.md`
APPROVES the exact local candidate, all 3,454 archive/source/installed payloads,
4,247 source identities, eleven linked evidence hashes and six pack/install/help
logs. AC1–4 and the QA portion of AC5 are accepted. PO coherence is PASS in
`artifacts/commercial-readiness-20260908/aex-4.18/po-final.md`; local pre-PR
acceptance is complete. CodeRabbit was unavailable; the checked pre-commit
alternative is explicit unavailability plus independent review.

DevOps delivered draft [PR #6](https://github.com/CyryxLabs/aexos-engine/pull/6)
and read it back at 2026-09-08T22:17:46.965Z: exact accepted head
`2489935baddfef5d89ef657e78491bacd8caff63`, base
`5342f5a7c1ab6212087da2011265c11f1002503f`, three changed files, matching body.
Normal push exits zero with hooks enabled; candidate remains clean and PR #4/#5
head/base/body identities remain preserved. `pr-delivery.json` SHA256:
`ca6c02f063d7a16ee2f34cac076cddc93a99ffdc0100fbee322e82862d57a060`.

PO delivery acceptance is recorded separately in
`artifacts/commercial-readiness-20260908/aex-4.18/po-delivery-addendum.md`.
The four local evidence hashes referenced by delivery match; sealed `po-final.md`
remains byte-for-byte unchanged. Original AC5 is complete, all five criteria and
five tasks are checked, and the bounded correction/PR story is Done.

At read-back, review was required and merge blocked; one remote check succeeded
and six were in progress. This dated snapshot does not certify external CI or
review. The frozen public story reflects its documentation-freeze state; this
external acceptance does not alter accepted candidate bytes. Release,
publication, merge, provider and broader system acceptance remain separate.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready separate minimal lockfile remediation for inherited fast-uri/humanfs findings using existing fixed versions. | Themis / `@po` |
| 2026-09-08 | 1.1 | Record fresh baseline, four-node npm lock correction and zero final full/production audits; full/package/QA/PR acceptance stays pending. | Themis / `@po` |
| 2026-09-08 | 1.2 | Final local source/package QA and PO accepted; actual PR operation retained under original AC5. | Themis / `@po` |
| 2026-09-08 | 1.3 | Actual draft PR #6 read back against accepted three-file head; original AC5 complete, normal external CI/review remain open. | Themis / `@po` |
