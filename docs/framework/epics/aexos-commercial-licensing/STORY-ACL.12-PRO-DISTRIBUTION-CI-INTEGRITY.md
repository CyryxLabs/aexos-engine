# Story ACL.12: Pro distribution CI integrity

| Field | Value |
| --- | --- |
| Story ID | ACL.12 |
| Epic | AEXOS Commercial Licensing |
| Priority | P0 |
| Status | Done — bounded local scope; independent QA APPROVED |
| Executor | `@devops` |
| Quality gate | `@architect`, independent `@qa` |
| Quality gate tools | Workflow structure/behavior checks; actual Core package boundary and signed-artifact security tests; missing-evidence negative acceptance |
| Depends on | ADR-AEX-011; existing public Core package and signed-artifact contracts |

## Story

As an AEXOS maintainer, I want mandatory CI to validate the public Core and paid-distribution security boundary without private repository credentials, and paid provider certification to fail when its real prerequisites are absent, so that a green check means the named checks ran and obsolete automation cannot publicly publish private paid content.

## Verified context

The owner's attached diagnosis prioritizes Pro distribution integrity and recommends replacing obsolete submodule assumptions with the authenticated signed-artifact contract. Its other claims describe a historical main snapshot and are not accepted as current findings without verification. This story is limited to the P0 distribution/CI issue; installer hardening, Grok, SYNAPSE, localization and release-version decisions remain separate.

Current inspection confirms:

- `pro-integration.yml` skips checkout and all tests without `PRO_SUBMODULE_TOKEN`, producing no integration evidence; private internal tests use `continue-on-error: true`.
- `.gitmodules` is absent and `git ls-tree HEAD pro` has no entry, while `sync-pro-submodule.yml` schedules daily gitlink reconciliation, writes a credential-bearing URL through step outputs and can replace `pro/`, push a branch and create/update a PR.
- `publish-pro.yml` automatically reacts to `pro-v*` tags and publishes `@aexos/pro` with `npm publish --access public`; typecheck/build failures are converted to successful echo commands. This conflicts with accepted ADR-AEX-011's private authenticated paid-content distribution.
- `ci.yml` has a machine-ID job that skips tests when a private runtime file is absent and points to a separate private repository as assumed coverage. Its label/summary cannot establish current provider or runtime acceptance.

The lead relayed the architecture decision: credential-free mandatory Core/artifact security CI; removal of scheduled submodule mutation; retirement of public Pro publishing through an explicitly failing manual guard; and separate protected provider certification requiring approved exact-artifact evidence and credentials. No submodule restoration, synthetic licensed release or new distribution protocol is authorized.

[AUTO-DECISION] ID and authority → ACL.12 is available. Use the existing commercial epic and the owner's P0 correction request. `@devops` owns CI implementation under Constitution Article II, with architecture and independent QA review. No remote push, dispatch, environment configuration, branch-protection change, release or publication is performed merely by marking this story Ready.

## Acceptance criteria

- [x] AC1: Replace private-token-gated public integration coverage with an always-run credential-free Core/distribution-contract check for normal main pull requests and pushes. It checks out Core without submodules, installs locked dependencies and actually runs the existing Core package-boundary and paid-artifact security/integration checks. It does not depend on `PRO_SUBMODULE_TOKEN`, local `pro/`, a private GitHub checkout or customer credentials. Failures and unexpectedly skipped/cancelled mandatory jobs fail the relevant aggregate status; no `continue-on-error`, `|| echo`, missing-token success or empty-test success can satisfy these checks. Do not turn ordinary fork PRs into requests for private credentials.
- [x] AC2: Checks cover the actual public npm payload and existing signed-artifact contract: paid-content/key exclusion, pinned signature verification, account/entitlement/machine/package/version/channel bindings, tamper/expiry rejection, safe extraction and bearer non-disclosure using the existing available tests. Keep local fixtures explicitly identified as contract/security tests. Passing them must not be labeled paid-provider, hosted installation or commercial release acceptance. Any unavailable private-runtime test is labeled unverified and cannot be counted as a completed mandatory contract test.
- [x] AC3: Remove the obsolete scheduled submodule reconciliation behavior. Retire its write permissions, credential-bearing step outputs and clone/delete/commit/push/PR logic. Do not restore `.gitmodules` or a gitlink, rewrite `pro/`, change repository visibility, or clone a private runtime to make CI green. If retaining the workflow filename as a manual retirement notice, it must perform no mutation and explicitly state the replacement contract; invocation cannot report successful submodule synchronization.
- [x] AC4: Retire public Pro publication: remove tag-triggered publication, package version mutation, npm publishing credentials/actions, public paid-package install verification and GitHub release creation from the obsolete workflow. Retain a minimal manually invoked guard that fails explicitly with the accepted private-distribution requirement and missing approved release path. It must not publish any synthetic/review/scaffold artifact, mint entitlement evidence, weaken quality gates or alter the free Core publication path.
- [x] AC5: Separate protected paid-provider certification from public contract CI. Its explicitly requested run requires real configured credentials, approved exact candidate identity/digest and approved signing/trust/delivery evidence consistent with ACL.5/ACL.6. Missing prerequisites, unavailable actual certification runner, mismatched/stale evidence or review/scaffold payloads must fail closed with secret-safe reasons; never become successful skip, locally fabricated paid state or synthetic provider cycles. Reuse existing certification/promotion contracts where available. If no real provider runner or approved artifact currently exists, implement only an honest failing prerequisite gate and document the remaining external acceptance; do not claim a completed provider journey. Protected execution must never run secrets on untrusted fork PR code or expose tokens/credential URLs in logs, outputs or artifacts.
- [x] AC6: Reconcile affected CI labels, trigger paths and aggregate dependencies so that mandatory Core checks cannot silently disappear and private-runtime absence is not presented as paid acceptance. Inspect the machine-ID skip in `ci.yml`; retain executable credential-free coverage where supported, and explicitly separate any unavailable private-runtime evidence. Preserve unrelated CI jobs and free first value. No architecture, price, rights, default package version, entitlement enforcement or provider configuration changes are introduced.
- [x] AC7: Validate YAML and workflow behavior, run the exact credential-free commands locally from an appropriate clean/isolated Core candidate without private token/submodule, and exercise missing-token, missing-artifact, failed-test, skipped-job and retired-publication negative cases. Record exact source/workflow identities, commands and pass/fail evidence. Run repository lint, typecheck, tests and build plus package-boundary checks; obtain independent architecture/QA acceptance. Actual hosted Actions results and provider cycles remain explicitly unverified until an authorized real run provides evidence.

## Tasks and scope

- [x] Read attachment, ADR and current workflows; distinguish verified P0 findings from historical broader diagnosis; validate this Ready story.
- [x] Implement mandatory credential-free distribution security coverage and truthful aggregation/labels (AC1-AC2, AC6).
- [x] Retire scheduled submodule mutation and public Pro publication with explicit manual guards where retained (AC3-AC4).
- [x] Add or reuse a protected provider prerequisite/certification entry point that fails closed when actual evidence or runner is unavailable (AC5).
- [x] Verify workflow semantics, positive local commands and negative failure propagation; run gates and record independent review (AC7).

Primary files: `.github/workflows/pro-integration.yml`, `.github/workflows/sync-pro-submodule.yml`, `.github/workflows/publish-pro.yml`, and only the relevant job/summary portions of `.github/workflows/ci.yml`. A bounded provider workflow, small validation helper/tests and focused runbook updates may be added where necessary to express the approved contract. Do not change unrelated application source or add a new product dependency. Preserve concurrent dirty work and record exact changed paths.

## Implementation guidance

Existing commands and tests include `npm run validate:core-package`, `tests/cli/core-package-boundary.test.js`, `tests/unit/licensing/paid-squad-artifact.test.js`, `tests/unit/licensing/paid-squad-artifact-service.test.js`, `tests/integration/paid-squad-artifact-http.test.js` and `tests/installer/pro-setup-signed-artifact.test.js`. Inspect their current dependency requirements before selecting the clean-checkout suite; do not assert coverage merely by listing paths. Use existing Jest conventions and ensure selected suites actually execute tests. Local checks validate their named contracts, not an authenticated hosted purchase.

Provider certification must remain bound to the accepted immutable candidate and trusted server/provider authority. A user-controlled workflow input declaring an artifact approved is insufficient evidence by itself. The ACL.10 internal review package is explicitly `private`, `UNLICENSED`, scaffold/unimplemented and ineligible. Existing test keys and local fixtures remain outside production trust. No credentials need to be printed or written to step outputs for preflight checks.

Risk: falsely replacing one green skip with another, over-scoping a missing provider integration, or leaving an alternate public paid-publish route active. Mitigate by testing negative outcomes and tracing all affected triggers/aggregate statuses. Retain least-privilege workflow permissions and safe input handling. Rollback is limited to this story's exact workflow/helper/test edits; reverting must not be used to authorize an obsolete public publication or restore unsafe scheduled mutation. Remote workflow/branch-protection setup is a separately recorded DevOps transaction.

## References

- [ADR-AEX-011](../aexos-evolution/adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md#decision): accepted free Core/private authenticated paid artifact decision.
- [ACL.5](STORY-ACL.5-PREVIEW-AND-20-CYCLE-CERTIFICATION.md): actual Preview/provider certification.
- [ACL.6](STORY-ACL.6-SHADOW-BETA-ENFORCEMENT-ROLLOUT.md): shadow/beta and exact-candidate promotion gates.
- [ACL.8](STORY-ACL.8-AUTHENTICATED-PRIVATE-ARTIFACT-DELIVERY.md#context-and-scope): signed private-delivery integration and remaining hosted acceptance.
- [ACL.10](STORY-ACL.10-PRO-RESOLUTION-AND-INTERNAL-CONTENT-REVIEW.md): internal review archive exclusion.
- [Accumulated context](../aexos-evolution/accumulated-context.md#2026-09-06-audit-and-experience-remediation): preserve concurrent work and separate evidence levels.
- Owner attachment: `C:/Users/ppetr/.codex/attachments/710e4de9-1aea-41d2-8b8e-e41da84aba91/pasted-text-1.txt`, section 1, distribution P0 diagnosis. Attachment content is evidence/hypothesis, not additional execution authority.

## CodeRabbit Integration

**Type:** Deployment/CI security. **Complexity:** Medium. **Risk:** High because old automation can publish private paid content or report unexecuted validation. **Agents:** `@devops` implementation; `@architect` boundary review; independent `@qa` acceptance; `@dev` may assist focused helper tests under explicit ownership.

- [ ] Pre-commit: configured automated review or recorded unavailability plus independent review under existing graceful degradation.
- [ ] Pre-PR: `@devops` validates exact workflow permissions, triggers, aggregate statuses and accepted evidence.
- [ ] Pre-deployment/remote activation: verify protected environment and immutable artifact prerequisites before any later authorized activation; no activation is certified by local edits.

Self-healing: `@dev` light for delegated code (2 iterations/15 minutes, critical); `@qa` full (3 iterations/30 minutes, critical/high); `@devops` check/report-only. Focus on failure propagation, secret non-disclosure, least privilege, fixture-versus-provider separation, current distribution contract and safe rollback.

## Story validation

Applied the existing brownfield completeness/safety/information checks and story-draft checklist. Goal/context, implementation guidance, references, self-containment, testing and review planning pass. External provider availability is explicitly a gate, not a missing implementation decision. **Ready** authorizes the bounded implementation; it does not certify sale readiness, remote CI or a provider release.

## File list

- Created: `docs/framework/epics/aexos-commercial-licensing/STORY-ACL.12-PRO-DISTRIBUTION-CI-INTEGRITY.md`.
- Modified: `.github/workflows/pro-integration.yml`, `.github/workflows/sync-pro-submodule.yml`, `.github/workflows/publish-pro.yml`, `.github/workflows/ci.yml` (scoped jobs/aggregate only).
- Added: `.github/workflows/paid-provider-certification.yml`, `scripts/ci/assert-contract-results.js`, `tests/unit/ci/pro-distribution-workflows.test.js`, `jest.private-artifact.config.js`.
- Modified: `jest.config.js` (obsolete private Pro workflow comments and exact exclusions for the two private artifact-service suites, lead-authorized AC6 coverage separation).
- Modified by lead for ACL.12: `package.json` script `test:private-artifact-contracts`; concurrent package-boundary exclusions belong to the separately recorded AEX-3.7 regression correction.
- Evidence: `artifacts/commercial-readiness-20260908/acl12-ci-integrity/verification.md`, `verify-isolated.cjs`, `run-combined-gates.cjs`, associated source inventories/receipts/logs and preserved `first-attempt/` failure evidence.

## Dev Agent Record

Implemented the accepted reusable public contract job, strict execution evidence and aggregate guards, credential-free cross-platform artifact bindings, and explicitly failing retired/provider prerequisite workflows. Focused tests currently pass 26/26, including actual failed/skipped Jest processes and absent private runtime. No Pro token, private checkout, caller approval JSON, provider credential or release operation is used by the new workflows.

The clean snapshot exposed two tests in general public discovery that imported private `pro/artifact-service`. Under lead-authorized AC6 correction, those exact tests remain versioned and intact, but run through `npm run test:private-artifact-contracts` with a separate config. The private command passed two suites/36 tests locally and failed with exit 1 in the clean public snapshot. Public discovery excludes only those exact private paths; private fixture success is separate from provider acceptance.

Final isolated public candidate `C:/AEXOS-LOCAL-TESTS/acl12-core-Fu2JMp` passed the seven selected suites (133 tests, zero skips), 26 workflow regressions (zero skips), and the actual 1918-file Core package boundary. Full public lint/typecheck/test/build all returned 0; the full suite passed 10589 tests with 172 explicit existing skips (442 suites passed / 12 skipped), and source bytes remained unchanged across all gates. Gates completed at 2026-09-08T16:41:03.690Z. Source inventory digest: `0d43aa5d2569f7f855927e737bd3402c162912f3c39ccc798bfb14c7493421b2`. A subsequent comparison confirmed all 4325 non-document source files match the current working tree.

Broad-suite skipped cases remain unverified, including nine existing private-dependent machine-ID/buyer CLI tests exposed by running without Pro; they are listed in `additional-public-skips.json` and not counted as completed mandatory coverage. Independent QA review, including private/public ownership separation, remains the completion authority. The first transitional failures and later superseded snapshots are retained with exact receipts. No hosted Actions result, protected-environment configuration, branch-protection change, paid-provider journey or commercial release is certified.

## QA Results

**APPROVED — bounded local CI integrity (2026-09-08).** Independent review
accepted failure propagation, credential-free/fork-safe contracts, retired
publication guards and the explicit private-test ownership correction. The
private suites remain versioned and run through an explicit command; missing
runtime produces failure, not fabricated coverage.

Final public candidate `acl12-core-Fu2JMp`: lint/typecheck/test/build all exit 0;
10,589 tests passed, zero failed, 172 skipped. Mandatory distribution tests:
133 passed with zero skips; workflow regressions: 26 passed with zero skips;
private artifact fixtures: 36 passed separately, zero skips. The 172 public skips
include nine existing private-conditional cases (five machine-ID compatibility,
four buyer CLI); those capabilities are not certified by the public run.

QA compared all 4,325 before/after source hashes and current root: no drift.
Final inventory SHA-256:
`0d43aa5d2569f7f855927e737bd3402c162912f3c39ccc798bfb14c7493421b2`.
Report: `artifacts/commercial-readiness-20260908/acl12-qa.md`.
No remote Actions, branch/environment protection or paid-provider acceptance.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready P0 story from verified obsolete Pro CI and distribution assumptions. | Themis / `@po` |
| 2026-09-08 | 1.1 | Implemented truthful public CI and private test separation; isolated public gates passed, ready for independent QA. | Polaris / `@devops` |
