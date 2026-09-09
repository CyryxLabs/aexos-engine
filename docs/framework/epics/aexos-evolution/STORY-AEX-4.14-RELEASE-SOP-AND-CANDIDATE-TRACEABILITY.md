# Story AEX-4.14: Release SOP and dependency-closed candidate traceability

| Field | Value |
| --- | --- |
| Story ID | AEX-4.14 |
| Epic | AEXOS Evolution |
| Status | Done — documentation and integration planning accepted; release remains held |
| Executor | `@devops` |
| Quality gate | Independent `@qa`, `@po` evidence coherence |
| Quality gate tools | Read-only GitHub rules/PR/npm queries; workflow-to-runbook mapping; candidate dependency/file inventory |
| Dependencies | Current release traceability audit; accepted story file lists for any reconstructed candidate |

## Story

As an AEXOS maintainer, I want a release procedure matching actual protection and publication mechanisms and a dependency-complete path from accepted local fixes to reviewable candidates, so that normal review, exact-source validation and registry evidence determine release status without bypassing approvals or mixing unrelated dirty work.

## Verified context

The current release audit (reference retained in the maintainer workspace; not included in this public candidate) reports actual ruleset `20352606`, required review/last-push approval and strict checks, while the legacy protection endpoint returns 404. `docs/guides/release-procedure.md` instead names ruleset `13330052`, two protection systems, mandatory CODEOWNERS and a recipe to disable review protections before admin merge. The SOP must not be used to execute that obsolete bypass.

The audit also distinguishes local HEAD `958a5ae...` from remote main `5342f5a...`: their trees match, while commit identity differs because of squash history. PR #4 already contains the narrow first-value correction at `d848c7f...`, with its clean worktree and exact prior verification body. Its normal required review is still external and pending. Public npm reports only 5.3.0; local dirty 6.0.0-alpha.1 is not a release. Accepted local runtime/installer/CI fixes are not integrated merely because their root tests passed.

Existing `npm-publish.yml` supports OIDC and token fallback, with tag/release/manual triggers. `release.yml` also reacts to tags; manual `semantic-release.yml` can create tags/releases and publish. The SOP's token-only description, assumed trusted-publisher identity and informal trigger ordering do not prove one controlled publication. Reverify current state before finalizing guidance; the audit records a point in time, not permanent repository settings.

[AUTO-DECISION] AEX-4.14 is available. This bounded story corrects release guidance and prepares exact candidate/dependency evidence. It does not approve a version/channel, merge a PR, change protections, publish, tag, dispatch a workflow or replace the pending independent GitHub review. Those are separately evidenced DevOps release transactions under existing user authorization and actual protections.

## Acceptance criteria

- [x] AC1: Rewrite the stale sections of `docs/guides/release-procedure.md` using fresh read-only evidence from the modern rules endpoint, actual required checks/reviews, canonical repository and current workflows. Remove protection-disable/admin-bypass instructions. Explain that legacy-protection 404 does not negate active rulesets, local QA does not supply a GitHub approving review, and missing required review remains blocking. Prefer discoverable current rules over unqualified permanent IDs; date any observed IDs/settings. Do not alter actual rules, reviews or permissions.
- [x] AC2: Describe the actual publication authentication and trigger paths without asserting unverified provider configuration or credential freshness. Check trusted-publisher repository/workflow/environment identity through available metadata without reading secret values. Map overlapping tag, release and manual paths and identify a single controlled release procedure with explicit duplicate-publication/idempotence prerequisites. If the current workflows cannot satisfy that procedure, record a concrete separate implementation blocker instead of declaring coordination fixed or changing workflows under this documentation scope. Do not invent token/2FA bypass guidance, a version/channel or stable availability.
- [x] AC3: Preserve PR #4 and its exact first-value scope/body/worktree; do not open a duplicate or transplant the whole alpha checkout into it. Record its current head/base, required check outcomes, review state and remaining normal review action. Distinguish skip, success and unavailable automated-review evidence. Treat equal Git trees with different squash/original commit IDs as equivalent content rather than a reason to force-push or rewrite history. External review/merge remains explicitly open until actual provider evidence changes it.
- [x] AC4: Produce a dependency-closed integration plan from accepted story file lists, current imports/config/package manifests and shared-file hunks. For each proposed PR slice record source identities, exact included files/hunks, dependency closure, base/stack relationship, exclusions and required checks. Preserve unrelated changes; exclude private `pro/`, secrets/provider material and raw workstation artifacts from public candidates. A guessed file subset or broad root test count cannot certify a reconstructed candidate. If a clean candidate is subsequently reconstructed under explicit ownership, bind its actual commit/package hash and rerun applicable gates before calling it accepted; document unconstructed slices as plans.
- [x] AC5: Define the release evidence chain explicitly: approved intended merge set and version/channel decision → clean exact commit → package/manifest inventory and hashes → required checks and independent review → controlled authorized publication → registry `gitHead`, version/dist-tag/integrity and GitHub tag/release correspondence → fresh registry-installed init/Doctor verification. Record which links exist and which remain absent. Existing npm 5.3.0 must not be overwritten or represented as containing local fixes. Local SOP/candidate preparation does not close paid provider, signed runtime, Office or native-host gates.
- [x] AC6: Validate all runbook commands/references structurally against the actual tools/workflows and execute only their authorized read-only inspection subset. Use existing documentation checks and independent review; record exact commands, timestamps and source references. Release-changing examples must be clearly gated future procedure, not actions claimed executed. No product/workflow edit, blanket staging, reset, protection mutation, review request message, merge, force-push, tag, publication or deployment occurs as part of this local documentation correction.

## Tasks and ownership

- [x] Read current release audit/SOP and actual publication trigger/authentication sources; verify available story ID and bounded authority.
- [x] Reverify read-only protection/PR/npm facts and correct misleading SOP sections (AC1-AC3).
- [x] Map actual workflow overlaps and authentication prerequisites, recording any separate workflow implementation blocker (AC2).
- [x] Inventory accepted slices and their actual shared-file/import/config/package dependencies; prepare reviewable candidate plan (AC4).
- [x] Define and reconcile the release evidence chain without inventing release identity or approval (AC5).
- [x] Validate documentation and obtain independent evidence-coherence review (AC6).

`@devops` owns `docs/guides/release-procedure.md`, a focused candidate/dependency plan under this epic and privacy-safe read-only evidence receipts. No product source, package version/lockfile, CI workflow, remote protection or prior story edits are included. Actual isolated candidate reconstruction and remote operations require explicit file/transaction ownership after the plan is concrete. `@po` owns this new story only; no source edits or commits.

## Guidance, risks and rollback

Use authenticated read-only GitHub CLI/API and public npm metadata where available; never infer unprotected main from the legacy API alone. Capture exact PR identity before comparing checks. Preserve the distinction between source tests, reconstructed-candidate tests, remote CI and registry-installed behavior. Audit counts are historical observations and must not be promoted to current test results.

The main risks are stale governance instructions, accidental approval bypass, incomplete candidate dependencies and double publication from overlapping triggers. Mitigate with dated provider evidence, normal review flow, explicit dependency closure and a separate unresolved trigger blocker when necessary. Rollback only the story-owned documentation edits. No shared checkout cleanup or historical rewrite is required.

References:

- Release traceability audit (reference retained in the maintainer workspace; not included in this public candidate): confirmed identities, pending PR review, actual protections and minimal candidate path.
- [Release SOP](../../../guides/release-procedure.md): document being corrected.
- [ADR-AEX-011](adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md): free Core/private paid distribution boundary.
- Accumulated context (reference retained in the maintainer workspace; not included in this public candidate): preserve concurrent work and evidence distinctions.

## Separate scoped correction — Brand command dependencies

AEX-4.13 (reference retained in the maintainer workspace; not included in this public candidate) is Done for its 19 policy-aware command definitions. That acceptance does not close the separately confirmed Sagi references to absent `squads/brand/tasks/logo-brief.md`, `squads/brand/tasks/logo-category-select.md` and `squads/brand/tasks/logo-simplicity-test.md`. AEX-4.15 (reference retained in the maintainer workspace; not included in this public candidate) is Ready for that bounded task-dependency correction. These known missing implementations are separate from the release-documentation inventory and remain unresolved here. No replacement task, removed command promise or Brand source change is part of AEX-4.14.

## CodeRabbit Integration

**Type:** Release documentation/integration planning. **Complexity:** Medium. **Risk:** High for approval/publication instructions. `@devops` prepares, independent `@qa` checks operational safety/evidence, `@po` checks content coherence. Pre-commit automated review when available or documented graceful degradation; pre-PR exact-scope review by DevOps if requested. Actual pre-release gate remains future and unpassed. Self-healing: dev support light (2 iterations/15 minutes, critical), QA full (3/30, critical/high), DevOps report-only. Focus: no bypass, current authority, dependency closure, exact identities and truthful open gates.

## Story validation and file list

Brownfield completeness/safety/information checks and applicable story-draft checklist categories pass. Current-state revalidation and dependency closure are concrete implementation tasks; missing external review is explicitly outside local completion. Bounded documentation work is implemented and independently accepted; this is not release approval.

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.14-RELEASE-SOP-AND-CANDIDATE-TRACEABILITY.md`.
- Modified: `docs/guides/release-procedure.md`.
- Added: `docs/framework/epics/aexos-evolution/RELEASE-CANDIDATE-SLICES-20260908.md`.
- Evidence only: `artifacts/commercial-readiness-20260908/aex-4.14/inspect-release.cjs`, `inspection.json`, `inventory-prerequisites.cjs`, `prerequisite-inventory.json`, `inventory-document-links.cjs`, `document-link-inventory.json`, `validate-docs.py`, `documentation-checks.json`, `documentation-identity.json`, `seal-documentation.cjs`, `documentation-identity-rework.json` and `verification.md`.
- Preserved reviewed evidence: `artifacts/commercial-readiness-20260908/aex-4.14/document-link-inventory-reviewed.json` and `documentation-identity-reviewed.json`; independent reviewers own `qa.md` and `po.md`.

## Dev Agent Record

Implemented the documentation-only correction using fresh provider metadata and byte-bound workflow/source inspection. Removed obsolete protection-disable/admin bypass instructions. The SOP now discovers modern rules, treats legacy 404 correctly, preserves external required review, maps actual OIDC/token paths and keeps npm trust identity explicitly unverified after read-only E401. It specifies one future manual sealed-candidate transaction, held on concrete cross-workflow identity/idempotence/channel/asset blockers. No workflow was changed.

Candidate plan preserves existing PR #4 and inventories 62 source files with literal import edges, package/shared-hunk ownership and dynamic filesystem/generated-command dependencies. SYNAPSE and installer slices have explicit baseline interface closure; CI is held on AEX-3.7/Security integration and Grok is held on managed projection/Office hook prerequisites. These are unconstructed plans, not new accepted commit/TGZ claims. ACL.11 remains in its separate server repository. Root's concurrent Brand implementation is excluded.

**AC4 rework after independent NEEDS_WORK:** retained the original receipt and added a 316-file prerequisite inventory, with current/base hashes, exact source/target paths, Security's 20 canonical files and 12 derived Claude surfaces, 24 Core Claude surfaces, 31 Office routes/30 resources, 78 managed Grok artifacts and eight workflow inputs. AST import inspection has no unresolved literal imports; required component, managed hash, served browser-reference, package allowlist and baseline interface checks pass. Exact mixed-file hunk dispositions, selected line/text hashes, package JSON-pointer deltas and future catalog/test adaptation are enumerated instead of deferred to candidate discovery. New host-selection helpers are correctly recorded absent from PR #4. Source remained unchanged. The Security minimum-version decision and future fixture/candidate execution are explicit outstanding transactions. AC4 was kept unchecked until independent re-review passed; no waiver or release acceptance is inferred.

Self-review additionally bound 176 immutable base-only catalog inputs (20 manifests and 156 agents), preserving main's existing squad source rather than deleting it or copying dirty counterparts. The plan distinguishes reconstructed source counts (21 registry squads/162 agents plus Core) from newly installed free-package counts (Security only plus Core). The Office fixture adaptation now names the correct source count replacements; package allowlisting and installed registry regeneration remain separate operations.

Final bounded review corrections add explicit include/exclude hunks for the three changed selected-host regression files (the unrelated CLI-only selector expectation remains excluded) and an exact documentation source/link/anchor inventory. Public reconstruction preserves baseline link targets and includes named new documentation dependencies; each excluded raw-evidence/context link receives a concrete truthful plain-text replacement. No fabricated review URL or raw private artifact is introduced to satisfy link closure.

Read-only evidence completed at 2026-09-08T17:48:56.089Z; inventory SHA256 `a0dcd2c00f27579563314dbe7f4d7825c6d1a1f64e24109602c240eff645a891`. Actual ruleset 20352606 and PR #4 head/base/checks/review state match the dated audit. Legacy protection query exit 1/404 and npm trust-list exit 1/E401 are recorded expected unavailable metadata, not suppressed or relabeled passes. All three publisher workflows match verified remote-main bytes.

Executed `python artifacts/commercial-readiness-20260908/aex-4.14/validate-docs.py`: PASS, 19 internal links, zero broken links/incorrect markings, balanced fences, no trailing whitespace, all future npm scripts exist, and no executable mutation/bypass examples in the SOP. Reused the repository's existing Markdown checker `scan_file`; no product test suite was repeated for this documentation-only change. Scoped `git diff --check`: exit 0. Independent QA and PO subsequently passed the corrected scope, as recorded below. CodeRabbit remains unavailable as previously recorded; no CodeRabbit PASS is claimed.

## QA Results

**APPROVED — documentation and dependency-closed planning only.** The original AC4 requirement remained binding. Initial NEEDS_WORK findings are preserved in `artifacts/commercial-readiness-20260908/aex-4.14/qa.md`; final corrections close the enumerated Security/Office/Grok prerequisites, exact mixed test hunks and public-document dependency dispositions.

Independent QA verified the final 316 source hashes, 121 hunk hashes across 17 files, 176 pinned baseline catalog inputs, 13 selected ranges, 31 static routes/30 resources and 78 managed Grok outputs. The final source inventory digest is `7209be5667cdb2c6e9c45c693855f63364ec59884a4617d194f87c8f71e15fe1`. Public documentation has 59 source records (58 files and one preserved-base directory), 162 edges and 28 exact truthful plain-text replacements. Final seal hashes match; the independently rerun documentation checker passes 23 links with zero errors, preserving the implementer's receipt.

The operational SOP retains actual protections and normal external review, reports npm trust E401 as unverified, identifies unresolved publisher coordination and forbids inferred release acceptance. Catalog counts distinguish source from fresh installation; fixture adaptation, regeneration and Security version compatibility remain future work. Candidate assembly/gates, required GitHub approval, publication, provider cycles, signed runtime and native/Office acceptance are not certified. QA changed no product/SOP files, lifecycle or AC checkboxes. Full checks, exact hashes and correction history are in the QA report.


## PO evidence-coherence acceptance

**PASS — original documentation/planning scope, 2026-09-08.** Themis / `@po` reviewed all six original AC and the corrected plan at SHA256 `63f9870e40857ae3b49b8039afee89639558b98694d0e2ee754355579ed01970`. The final AC4 prerequisite inventory binds 316 current inputs, 176 immutable baseline catalog inputs, 121 hunks and 13 exact selections. The documentation inventory adds 59 source/target records, 162 edges and 28 exact public-safe rewrites. Security/Grok/Office resources, test-hunk ownership and document-reference dispositions now replace the previously deferred enumeration. AC4 passes as a concrete integration plan; no criterion was waived.

Full review, historical findings and final identities: `artifacts/commercial-readiness-20260908/aex-4.14/po.md`. AC1/2/3/5 remain coherent; the AC6 PO review is complete. Final operational QA and lifecycle/checklist closure remain the responsible reviewers' decisions. Actual candidate construction, fixture/catalog changes and tests, Security minimum-version decision, external normal review, publisher verification and release remain open. Neither this acceptance nor the planned source/installed counts certify a new package, hosted paid execution, native hosts or Office completion.

## Change log

### Integration correction, 2026-09-09

The first remote integration run found two additional closure defects: the
Security manifest had not been normalized, and the brownfield smoke selected
only Claude while requiring Codex artifacts. This continuation owns
`squads/security/squad.yaml` (generated normalization only) and
`scripts/e2e/installed-skills-smoke.js` (explicit host selection and portable
installed-CLI invocation). The dependent generated
`.aexos-core/data/squad-registry.yaml` and `.aexos-core/install-manifest.yaml`
are included after the second remote run exposed stale routing keywords.
Office changes remain excluded.

- [x] Normalize the Security manifest using the existing generator.
- [x] Preserve the selected-host boundary and explicitly install Codex for its assertions.
- [x] Rerun brownfield smoke, manifest normalization/schema checks and all eleven local candidate gates: exit 0; 10,439 tests passed, zero failed, 168 skipped.
- [ ] Verify the corrected commit in remote CI and obtain required independent review.

The previous local gate receipt and `d2cad07` remain historical evidence; these
new bytes require fresh verification before acceptance.

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready release SOP correction and dependency-closed candidate traceability; separate Brand investigation recorded. | Themis / `@po` |
| 2026-09-08 | 1.1 | Original AC1-AC6 accepted after independent QA APPROVED and PO PASS; checklist closed for documentation/planning only. Candidate construction, fixture execution, Security version compatibility and publication remain future. | Polaris / `@devops` |
