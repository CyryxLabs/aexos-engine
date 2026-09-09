# Story ACL.12: Pro distribution CI integrity

| Field | Value |
| --- | --- |
| Story ID | ACL.12 |
| Epic | AEXOS Commercial Licensing |
| Status | Ready for Review — local implementation accepted; Git/PR delivery separately recorded |
| Executor | `@devops` |
| Quality gates | Architecture, independent QA, PO coherence |

## Story

As an AEXOS maintainer, I want mandatory CI to validate the public Core and paid
distribution security boundary without private credentials, and paid-provider
certification to fail when real prerequisites are absent, so a green check means
the named checks ran and obsolete automation cannot publicly publish private
paid content.

## Exact integration scope

Architecture approves a twelve-path candidate based on PR #9's exact local head
`ece92e5d9a0f2ffe3b42ceabfa673b5b4f1390fe`, tree
`6c02375bfb3e4d6367e21693a400bfb72137eeb9`. Preserve its Core boundary, Security,
signed installer, dependency corrections and prior PR lineage. The
[accepted distribution ADR](../aexos-evolution/adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md#decision)
already exists in that base; no broad release-plan or private-document transplant
is required. This is the existing ACL.12 scope, not a new story or product.

The earlier combined/public snapshot was locally accepted on 2026-09-08 with
133 mandatory tests, 26 workflow regressions and 10,589 full tests / 172 skips.
Those identities/counts are historical, not evidence for this new integration.
Current isolated implementation and local gates are accepted below; final Git/PR
identity remains a separate delivery record.
Core still has version 5.3.0 below Security's preserved 6.0.0 minimum; this CI
change cannot close the non-publishable version/compatibility hold.

## Acceptance criteria

- [x] AC1: Replace private-token-gated public integration coverage with an always-run credential-free Core/distribution-contract check for normal main pull requests and pushes. It checks out Core without submodules, installs locked dependencies and actually runs the existing Core package-boundary and paid-artifact security/integration checks. It does not depend on `PRO_SUBMODULE_TOKEN`, local `pro/`, a private GitHub checkout or customer credentials. Failures and unexpectedly skipped/cancelled mandatory jobs fail the relevant aggregate status; no `continue-on-error`, `|| echo`, missing-token success or empty-test success can satisfy these checks. Do not turn ordinary fork PRs into requests for private credentials.
- [x] AC2: Checks cover the actual public npm payload and existing signed-artifact contract: paid-content/key exclusion, pinned signature verification, account/entitlement/machine/package/version/channel bindings, tamper/expiry rejection, safe extraction and bearer non-disclosure using the existing available tests. Keep local fixtures explicitly identified as contract/security tests. Passing them must not be labeled paid-provider, hosted installation or commercial release acceptance. Any unavailable private-runtime test is labeled unverified and cannot be counted as a completed mandatory contract test.
- [x] AC3: Remove the obsolete scheduled submodule reconciliation behavior. Retire its write permissions, credential-bearing step outputs and clone/delete/commit/push/PR logic. Do not restore `.gitmodules` or a gitlink, rewrite `pro/`, change repository visibility, or clone a private runtime to make CI green. If retaining the workflow filename as a manual retirement notice, it must perform no mutation and explicitly state the replacement contract; invocation cannot report successful submodule synchronization.
- [x] AC4: Retire public Pro publication: remove tag-triggered publication, package version mutation, npm publishing credentials/actions, public paid-package install verification and GitHub release creation from the obsolete workflow. Retain a minimal manually invoked guard that fails explicitly with the accepted private-distribution requirement and missing approved release path. It must not publish any synthetic/review/scaffold artifact, mint entitlement evidence, weaken quality gates or alter the free Core publication path.
- [x] AC5: Separate protected paid-provider certification from public contract CI. Its explicitly requested run requires real configured credentials, approved exact candidate identity/digest and approved signing/trust/delivery evidence consistent with ACL.5/ACL.6. Missing prerequisites, unavailable actual certification runner, mismatched/stale evidence or review/scaffold payloads must fail closed with secret-safe reasons; never become successful skip, locally fabricated paid state or synthetic provider cycles. Reuse existing certification/promotion contracts where available. If no real provider runner or approved artifact currently exists, implement only an honest failing prerequisite gate and document the remaining external acceptance; do not claim a completed provider journey. Protected execution must never run secrets on untrusted fork PR code or expose tokens/credential URLs in logs, outputs or artifacts.
- [x] AC6: Reconcile affected CI labels, trigger paths and aggregate dependencies so that mandatory Core checks cannot silently disappear and private-runtime absence is not presented as paid acceptance. Inspect the machine-ID skip in `ci.yml`; retain executable credential-free coverage where supported, and explicitly separate any unavailable private-runtime evidence. Preserve unrelated CI jobs and free first value. No architecture, price, rights, default package version, entitlement enforcement or provider configuration changes are introduced.
- [x] AC7: Validate YAML and workflow behavior, run the exact credential-free commands locally from an appropriate clean/isolated Core candidate without private token/submodule, and exercise missing-token, missing-artifact, failed-test, skipped-job and retired-publication negative cases. Record exact source/workflow identities, commands and pass/fail evidence. Run repository lint, typecheck, tests and build plus package-boundary checks; obtain independent architecture/QA acceptance. Actual hosted Actions results and provider cycles remain explicitly unverified until an authorized real run provides evidence.


## Exact source/hunk ownership

- `.github/workflows/ci.yml`.
- `.github/workflows/pro-integration.yml`.
- `.github/workflows/sync-pro-submodule.yml`.
- `.github/workflows/publish-pro.yml`.
- `.github/workflows/paid-provider-certification.yml`.
- `scripts/ci/assert-contract-results.js`.
- `tests/unit/ci/pro-distribution-workflows.test.js`.
- `jest.private-artifact.config.js`.
- `tests/unit/licensing/paid-squad-artifact-service.test.js`.
- `tests/integration/paid-squad-artifact-http.test.js`.
- `jest.config.js`.
- `package.json`.

In `ci.yml`, select only the mandatory-job comment, unconditional reusable public
contract job, credential-free three-OS verifier replacement for the old private
machine-ID skip, the two aggregate dependencies and strict success requirements,
and related change-filter diagnostic wording. Preserve all other jobs/triggers
and free publisher workflows. In `jest.config.js`, add only ownership comments
and two anchored private-suite exclusions; omit the unrelated moduleNameMapper
hunk. In `package.json`, add only `test:private-artifact-contracts`; preserve
version, files, all dependencies/overrides and every unrelated script/lock byte.

The seven mandatory suites already exist on PR #9 and retain that base's versions.
Do not overwrite detector, target-install or scaffolder tests from the older
combined root: doing so would drop accepted metadata/transaction/cache coverage.
No mandatory suite may require private `pro/artifact-service`. Two retained
private test suites intentionally import that absent implementation and belong
only to the explicit private command, not public discovery or claimed coverage.

Additional public files are this existing story and
`docs/framework/epics/aexos-commercial-licensing/PRO-CI-INTEGRATION-VERIFICATION-20260909.md`.
The final actual Git diff must reconcile all twelve owned paths and both docs.
No candidate/source writes are authorized for PO; DevOps owns implementation/Git,
QA independently verifies and existing checkouts/PRs remain preserved.

## Tasks and acceptance evidence

- [x] Bind architecture to exact PR #9 base and twelve-path scope.
- [x] Assemble only selected hunks and preserve current seven-suite dependencies.
- [x] Execute exact seven-suite and one-suite commands plus strict result validators.
- [x] Prove failed/skipped/cancelled/empty/todo/missing results cannot pass.
- [x] Execute private command and retain expected missing-private-runtime failure.
- [x] Verify retired and protected-provider guards fail without mutation or secrets.
- [x] Run actual public gates and obtain independent QA/PO local acceptance.
- [ ] Record final Git/PR delivery and exact remote readback in the separate delivery receipt.

[Verification contract](PRO-CI-INTEGRATION-VERIFICATION-20260909.md) defines the
executed commands, actual counts and honest outcomes. Local source acceptance
does not certify hosted Actions or provider acceptance. A configured
protected-environment name is not proof of actual environment protection.
Retired/provider refusals are expected failures, not successful synchronization,
publication or certification. No user-controlled approval input or synthetic
artifact can bypass real trusted provider evidence.

## QA and release boundary

Current independent integration review is APPROVED for the exact local source.
The original Done status remains historical, not inherited approval. Hosted Actions,
branch/environment protection, paid lifecycle cycles, signing trust, compatible
release version, publication and company/Office orchestration remain separate.
The user's normal PR request permits DevOps delivery; it does not authorize
workflow dispatch, provider configuration, private checkout or release bypass.

## Executed isolated acceptance — 2026-09-09

The exact twelve-path implementation passed fresh locked installation and all
nine source gates: lint, typecheck, full tests, build, install manifest, actual
Core package boundary, package completeness, port denylist and registry
determinism. Full Jest execution reports **10,156 PASS / 0 FAIL / 168 SKIP**,
with 409 passing and 12 skipped suites. Independent QA compared all 168 skipped
assertion names with the accepted base and found no additional hidden tests.

The seven mandatory suites executed **134 passing tests, zero skips**; the
one-suite machine-binding run executed **50 passing tests, zero skips**. Both
strict result validators exited 0. The **26 workflow negative regressions**
passed with actual shell/Jest child processes, supplemented by independent
reporter refusal probes. These subsets overlap the full suite and are not added
to its total. The separate private command exited 1 because private runtime is
absent; this is expected refusal, not passing private coverage or certification.

All **4,319 source file hashes** remained unchanged. Independent QA verified
the source inventory, nine source-gate log hashes/exits and eight initial
command log hashes. The source inventory is
`7b5b346846850ca957e10aa77537be4592f718268ac0812bafb9e606165cbca5`;
the final source-gate receipt is
`fa15dcf7275116125be3e2586e4f3a1a4be1135096edd63503f7672650870e3e`.
Architecture and independent QA approved the bounded local implementation;
PO verified evidence coherence before this public documentation freeze.

The final Git commit, public documentation binding, push and PR readback are
recorded separately by delivery evidence. Their identity is not manufactured
inside its own packaged documentation. Prerequisite PR #9's observed hosted
checks were label/welcome only; no technical hosted CI acceptance is inferred.
This stage closes only the approved integration subset. It adds no new slice,
provider journey, version approval, publication or Office acceptance.
