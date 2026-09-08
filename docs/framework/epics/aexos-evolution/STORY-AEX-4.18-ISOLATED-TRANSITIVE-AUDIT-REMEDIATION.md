# Story AEX-4.18: Isolated transitive audit remediation

| Field | Value |
| --- | --- |
| Story ID | AEX-4.18 |
| Epic | AEXOS Evolution |
| Status | In Progress — source gates and affected-library checks passed; final packed candidate and review recorded separately |
| Executor | Root `@dev` isolated lockfile repair; `@devops` candidate/PR ownership |
| Quality gate | Independent `@qa`; `@po` evidence coherence |
| Scope | Two inherited vulnerable dependency resolutions and their necessary transitive closure |

## Story

As an AEXOS maintainer, I want the already available dependency fixes isolated into a reviewable candidate, so that inherited npm audit findings can be corrected without importing unrelated changes or modifying the frozen SYNAPSE candidate.

## Verified context

A fresh installed baseline at commit
`5342f5a7c1ab6212087da2011265c11f1002503f` reproduces two affected packages:
`fast-uri@3.1.5` (four high advisories) and `@humanfs/node@0.16.7` (one moderate
recursive-copy symlink advisory). Full audit reports two affected packages;
production-only audit reports one. These are inherited baseline resolutions.

The bounded correction resolves `fast-uri@3.1.7` and `@humanfs/node@0.16.8`.
Humanfs requires `@humanfs/core@0.19.2` and `@humanfs/types@0.15.0`, giving exactly
four changed lockfile nodes. Existing manifest and override ranges allow them.
No direct dependency, package version, script or application source changes.

Independent work on installation and SYNAPSE remains separate. The authorized
scope is this dependency correction, its verification and a focused PR under
normal review; no publication or approval bypass is included.

## Acceptance criteria

- [x] AC1: Create an independent isolated candidate from the exact verified upstream base, recording its branch/commit and lockfile identity. Reproduce actual baseline installed dependency versions and npm audit JSON with timestamps, command/exit, Node/npm versions and advisory IDs. Attribute inherited findings correctly. Do not mutate AEX-4.17, PR #4, the shared root lockfile or unrelated checkouts. The reported pre-PR audit is historical evidence until this fresh baseline reproduction confirms current registry observations.
- [x] AC2: Change only candidate `package-lock.json` to resolve `fast-uri` to the already used 3.1.7 and `@humanfs/node` to 0.16.8, including only required transitive dependency/metadata/integrity changes. Obtain actual registry resolution and integrity rather than inventing or blindly copying fields. Verify all affected dependency edges satisfy unchanged manifest/override ranges. Record every changed lockfile node and why it belongs to this closure. Preserve root/workspace manifests, direct dependency ranges, package versions, scripts, application source and unrelated lockfile entries. If current resolution proves a different required change, record the concrete dependency conflict before expanding scope; do not run a general upgrade.
- [x] AC3: Perform fresh locked `npm ci` with a separate cache/user configuration and verify installed versions, lockfile stability and the real dependency tree. Run actual baseline/candidate `npm audit --json` and a production-only audit; the five reported advisory IDs must no longer affect candidate resolutions. Record any additional current findings honestly and separately, including severity and whether baseline or introduced. Registry/network/auth failure is not a zero-vulnerability result. Require the applicable audit policy to pass; an unresolved required audit gate prevents candidate acceptance.
- [ ] AC4: Run candidate lint, typecheck, full tests, build and existing applicable package/manifest validation, plus meaningful affected runtime checks using the actually installed dependency and a freshly packed Core consumer. Verify public CLI export/help and existing manifest/config processing through their real dependency path; retain installed engine/Node requirements. Use available baseline tooling rather than importing unrelated alpha scripts or writing tests that merely mirror version strings. Capture exact exits and skipped counts. Any existing test-generated registry/manifest mutation is captured and confined to a disposable candidate test workspace, then restored to its recorded original bytes; it is not a new source change or an undisclosed clean-tree claim. Final candidate runtime/source and manifests remain unchanged apart from the owned lockfile.
- [ ] AC5: Obtain independent QA for dependency closure, fresh locked install, actual audits and affected behavior; PO verifies evidence/scope coherence. DevOps seals the exact local candidate commit/file list and opens the requested focused PR through normal protected review, with baseline/candidate audit results and exact verification commands. No bypass, merge, package publication, tag, provider credential change or final release approval is implied. If a remote PR operation is blocked, preserve the complete reviewable candidate and body, record the concrete blocker and leave that operation uncompleted. Existing AEX-4.17 and first-value PR scopes stay separate.

## Tasks and ownership

- [x] Verify the two reported installed resolutions, existing fixed versions and available ID.
- [x] Root reproduces baseline audit and records a separate candidate identity (AC1).
- [x] Root resolves the minimal lockfile/transitive closure and verifies exact changed nodes (AC2).
- [ ] Execute fresh locked install, audits and appropriate full/runtime/package gates (AC3-AC4).
- [ ] Independent QA and PO review; DevOps owns exact candidate commit and normal PR handoff (AC5).

Only `package-lock.json` is implementation scope. Supporting story and public-safe verification/PR text may be added as documentation; no shared root lockfile or AEX-4.17 packaged document is edited. Use a separate isolated checkout and record its base and candidate identities in verification. The branch is `codex/dependency-audit-remediation`. The existing fixed shared-root entries are evidence of intended versions, not authority to copy the full dirty lockfile.

## Validation and risks

Highest risk is unnoticed unrelated lockfile churn or missing humanfs transitive entries. Review a structured before/after node inventory, perform real locked installation and show installed dependency paths. A clean audit alone does not verify runtime compatibility; lint/build/full tests and actual packed consumer checks remain required. Conversely existing baseline findings or unavailable audit transport must not be suppressed to claim a clean candidate.

Rollback restores only the owned isolated lockfile candidate; preserve raw before/after audits and all other work. Remote history and published versions are never rollback mechanisms. Advisory observations can change; bind claims to their timestamp and exact dependency graph rather than claiming AEXOS has no possible vulnerabilities.

## CodeRabbit Integration

**Type:** Dependency/security integration. **Complexity:** Low-to-medium; **risk:** Medium. Root `@dev` implements; independent `@qa` checks the graph and behavior; `@devops` owns Git/PR. Use the existing dependency architecture; request architect input only for an actual unexpected contract change.

- [ ] Pre-commit: automated review if available, otherwise record unavailability and independent review.
- [ ] Pre-PR: DevOps verifies minimal diff, exact audit/gate evidence and normal approval rules.
- Pre-release: outside scope.

Self-healing: dev light (two iterations/15 minutes, critical); QA full (three/30, critical/high); DevOps report-only. No new approval checkpoint is added to the user's existing remediation/PR authorization.

## Advisory scope and file list

Original advisory IDs: `GHSA-p498-v437-472g`, `GHSA-5jgf-p345-68v8`,
`GHSA-f65p-4m7j-42xc`, `GHSA-fph4-wmhf-6fwf`, `GHSA-jqff-g426-hqxp`.
These are timestamped registry observations, not a claim of permanent freedom
from vulnerabilities.

- Implementation: `package-lock.json` only, four changed npm-resolved nodes.
- Documentation: `docs/framework/epics/aexos-evolution/STORY-AEX-4.18-ISOLATED-TRANSITIVE-AUDIT-REMEDIATION.md`.
- Documentation: `docs/framework/epics/aexos-evolution/DEPENDENCY-AUDIT-VERIFICATION-20260908.md`.

These are the complete three candidate paths. See the
[verification summary](DEPENDENCY-AUDIT-VERIFICATION-20260908.md) for exact
commands, observed results and final acceptance boundaries.

## Dev Agent Record

Candidate branch: `codex/dependency-audit-remediation`; exact baseline:
`5342f5a7c1ab6212087da2011265c11f1002503f`. Node v24.15.0, npm 11.12.1.
Fresh baseline checks ran on 2026-09-08 at 21:46 UTC: install/tree exit zero,
full audit exit 1 (high 1, moderate 1), production audit exit 1 (high 1).

Final candidate lock SHA256:
`edff087d502bb0e7296570252e30e3a5e4e64a0670863302956bc3dd4aef5b8a`.
It preserves the exact npm output, including registry resolution/integrity and
unrelated entry order. Fresh locked install/tree/full audit/production audit
checks at 21:51 UTC all exit zero; both audits report zero vulnerabilities and
the lock remains unchanged. Installation uses isolated caches and empty npm
user/global configuration. Actual tree resolves AJV -> fast-uri 3.1.7 and
ESLint -> humanfs/node 0.16.8 -> core 0.19.2/types 0.15.0.

Commands used for this evidence, from the isolated candidate:

```sh
npm --version
npm ci --ignore-scripts --no-audit --no-fund
npm ls fast-uri @humanfs/node @humanfs/core @humanfs/types --all --json
npm audit --json
npm audit --omit=dev --json
```

All eight candidate gates completed on 2026-09-08 at 21:56 UTC with exit zero:
lint, typecheck, full tests, build, manifest, package completeness, port denylist
and registry determinism. Full suite: 9,867 passed, zero failed, 172 existing
skipped tests, 406 total suites. Source inventory before and after is unchanged:
`e1db556c737927b92cbf76eff828630efe679ee174e96e2806d2b18bc46b4383`.
The registry did not mutate during these gates; no restoration was necessary.
These source gates precede the two documentation additions and do not represent
acceptance of a final archive or external PR.

Independent affected-library verification passed ten actual runtime checks at
21:56 UTC. AJV uses the supplied installed fast-uri for relative cross-schema
references and invalid-data rejection. Checks cover IDN authorities, malformed
IPv6, percent encoding, malformed schemes and valid relative references. Real
Windows symlink tests reproduce baseline humanfs copy behavior and verify that
the corrected copy/copyAll preserve links and original fixture inputs. This is
library behavior evidence, not a general filesystem sandbox or packed-consumer
acceptance. The lock remained unchanged throughout those checks.

At this documentation freeze, the final freshly packed Core consumer, exact
sealed commit/archive identity, independent whole-candidate QA/PO verdict and
focused PR delivery are separately recorded follow-up requirements. AC4 retains
its packed-consumer requirement and AC5 retains final review/PR requirements.
Their outcomes belong in external verification or PR evidence; this archive
must not contain its own digest or anticipate a future approval.

## QA Results

Independent initial runtime checks pass as recorded above. Whole-candidate
QA/PO and normal PR checks remain separate. AC4 and AC5 remain open at this
freeze. CodeRabbit is unavailable locally; no automated clearance is claimed.
No final release, merge, publication, paid-provider or broader system acceptance
is included.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Bounded four-node lock correction; fresh audits, eight source gates and ten affected-library checks passed; final packed candidate and review recorded externally. | Themis / `@po` |
