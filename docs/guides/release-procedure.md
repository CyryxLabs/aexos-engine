# Release procedure — @aexos/core

Owner: `@devops`, under [the Constitution](../../.aexos-core/constitution.md).
Updated **2026-09-08**, [Story AEX-4.16](../framework/epics/aexos-evolution/STORY-AEX-4.16-SEALED-RELEASE-WORKFLOW-INTEGRITY.md), following the accepted AEX-4.14 documentation baseline.

This procedure preserves normal review and binds a release to its source and registry artifact. AEX-4.16's sealed transaction implementation has passed local architecture, independent QA and PO acceptance at its recorded frozen source identity. Hosted history reconciliation, publisher trust, normal PR review and an approved release candidate remain open prerequisites. No hosted release is certified by this document. Do not tag or dispatch a publisher as a diagnostic.

## Inspect actual state first

Run these read-only commands from the intended checkout. Save timestamped results with the candidate record; refresh them before a later transaction.

```powershell
git status --short
git remote -v
git rev-parse HEAD
gh api repos/CyryxLabs/aexos-engine/branches/main
gh api repos/CyryxLabs/aexos-engine/rules/branches/main
gh api repos/CyryxLabs/aexos-engine/branches/main/protection
gh api repos/CyryxLabs/aexos-engine/actions/workflows
gh api repos/CyryxLabs/aexos-engine/environments
gh pr view 4 --repo CyryxLabs/aexos-engine --json headRefOid,baseRefOid,reviewDecision,latestReviews,mergeStateStatus,statusCheckRollup
npm view @aexos/core versions dist-tags gitHead dist.integrity repository --json
npm trust list @aexos/core --json
```

`npm trust list` is inspection only; check `npm trust --help` for support in the installed CLI. An authorization error means publisher configuration is **unverified**, not missing or valid. Do not print credential files, secret environment values, tokens or private keys. Credential presence/freshness does not prove permission or successful publication.

The canonical repository currently resolves to **CyryxLabs/aexos-engine**; the old `CyryxLabs/AEXOS` URL redirects. Discover current rules rather than sending changes to a remembered ruleset ID. On 2026-09-08 modern ruleset `20352606` required one approving review, approval of the latest push, stale-review dismissal, resolved review threads, linear history, and these strict checks:

- `Validation Summary`
- `Analyze (javascript-typescript)`
- `Analyze (actions)`

Deletion and non-fast-forward updates were protected. The legacy protection endpoint returned 404 while modern rules remained active. That 404 does not mean main is unprotected. Local independent QA is separate from a GitHub approving review; missing required review blocks merging. Use normal protected PR review and merge. This procedure never disables protections, manufactures approval, or uses administrative merge to avoid required review.

## Preserve the existing first-value PR

[PR #4](https://github.com/CyryxLabs/aexos-engine/pull/4) already contains the narrow npm init/Doctor correction and exact verification commands/results. Observed head: `d848c7f58ad4a8da3afc93398ec608be4bf4d23a`; base: `5342f5a7c1ab6212087da2011265c11f1002503f`. Its existing clean worktree is `C:/AEXOS-LOCAL-TESTS/first-value-clean-install`. It reports 48 successful checks, two skipped checks, no approving reviews, and `REVIEW_REQUIRED` / `BLOCKED`. Do not duplicate it or copy unrelated alpha work into it. Complete normal review against its exact head; this document does not perform that action.

Local HEAD `958a5ae...` and remote main `5342f5a...` have different commit IDs but identical tree `397ae0ca602ca2e23f1f076bd36a3dbfbb3b4f5d`, due to squash history. Equal content is not a reason to rewrite history. Additional work follows the [candidate slice plan](../framework/epics/aexos-evolution/RELEASE-CANDIDATE-SLICES-20260908.md) in a separately owned checkout. Preserve the shared dirty tree.

## Authentication: inspect identity, do not infer trust

The [npm publisher](../../.github/workflows/npm-publish.yml) has one serialized publish job with `contents: write`, `actions: read` and `id-token: write`. Preparation uses read permissions and receives no npm credentials. Select one provisioned authentication strategy: OIDC, or the existing `NPM_TOKEN_AEXOS` token. There is no automatic token fallback, token guessing or 2FA change. The runner invokes the pinned npm CLI against an isolated user configuration and the exact sealed TGZ with `--ignore-scripts`; it never publishes a package directory. Node 24.15.0 is the controller runtime. The presence of an OIDC permission is not evidence that npm registered its publisher.

For every approved package, compare npm's registered owner, repository, workflow filename and optional environment with the exact GitHub run identity. On 2026-09-08 the publishing jobs declared no environment and GitHub's environment inventory was empty. `npm trust list @aexos/core --json` returned E401, so npm-side publisher identity remains unverified. Public 5.3.0 metadata exposed a registry signature; no provenance attestation was returned. Registry signatures do not establish publisher configuration.

Current inspection guidance: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [npm trust list](https://docs.npmjs.com/cli/v11/commands/npm-trust/). Resolve missing identity through an authorized metadata view. Do not create trust, refresh credentials, weaken account protection or attempt publication as part of inspection. No token fallback success or credential age is assumed.

## Existing trigger map and implementation blockers

| Workflow | Supported entry points/effects | Identity and coordination |
| --- | --- | --- |
| [npm-publish.yml](../../.github/workflows/npm-publish.yml) | Manual `prepare` (safe default) or explicit `publish`; tag/release events refuse before checkout | Literal repository-wide `aexos-public-release` lock, no cancellation or publishing matrix; exact producer run/attempt/artifact locator |
| [release.yml](../../.github/workflows/release.yml) | Old manual/tag route refuses nonzero with instructions | Permissionless; no tag, release, upload or downstream dispatch |
| [semantic-release.yml](../../.github/workflows/semantic-release.yml) | Read-only version/notes proposal at explicit source SHA | Exact controller and payload checkouts; forced dry-run, only analyzer/notes plugins, no writer credentials or dispatch |

Root and `packages/aexos-install` local release scripts use the same guarded read-only semantic runner. Unsupported arguments, competing configurations and plugin overrides refuse before tool execution; a genuine no-release analysis is success, while analysis failures remain nonzero. Installer `postversion` no longer pushes tags. The already retired private `publish-pro.yml` remains retired.

The five AEX-4.14 implementation defects are addressed by this bounded implementation's explicit identity, shared writer, channel policy, typed registry reads and sealed-byte publication. Their local verification and independent review are recorded in AEX-4.16; do not substitute these source changes for an actual hosted run. Historical workflow revisions and separately held owner credentials are not revoked by changing source. Retire/reconcile historical writers operationally before provider acceptance.

**Hold a real release** until the intended source/controller commits, normal required review, explicit package/version/channel choice and actual publisher trust are accepted. Do not route around missing evidence through a retired entry point or an older workflow revision.

## One controlled future transaction

Hosted preparation and semantic proposals run only from `refs/heads/main`.
Their explicit `source_sha` must equal the immutable dispatch `github.sha`;
payload checkout uses that event SHA, not caller-selected code. Prepare an
older source only after a separately reviewed workflow change, never by
loosening this guard. This keeps unreviewed payloads out of main-scoped runners.

The hosted procedure is **one authorized manual publisher transaction for one sealed candidate**, with coordinated release/tag bookkeeping. Local implementation tests exercise injected provider responses and actual fixture archives; the hosted steps below remain future work. No publication was executed by this correction.

1. Record the approved intended merge set and version/channel decision. Use normal required review/checks; record the actual merged SHA. Preserve PR #4's scope. This SOP invents no new version.
2. Prepare an isolated clean candidate at that commit. Review version alignment in `package.json`, `.aexos-core/package.json`, `compat/aexos-core/package.json` and its Core dependency, applicable companion manifests, and `package-lock.json`. Record the changelog/package set. If hooks regenerate registry/manifests, review/include those results before sealing; changed bytes invalidate prior hash-bound acceptance.
3. Seal the actual npm TGZ, included-file inventory, installation manifest and SHA256/SRI digests. Exclude private Pro, credentials, logs and workstation artifacts. A workflow's distribution tar is not automatically the npm TGZ. Validate the public boundary and packaged fix.
4. Run the exact candidate's lint, typecheck, full tests, installer regressions, build and applicable package/manifest/parity checks. Capture exits and executed/skipped counts. Obtain required remote checks and independent review for that exact head; broad prior root tests do not qualify reconstructed PR slices.
5. Resolve authentication and the remaining approval/provider prerequisites. Only then may DevOps start the single approved transaction with immutable source/artifact, package set and channel bindings. Record exact producer and publication run/attempt IDs. Stop promotion on mismatch or unresolved write outcome; inspect actual provider state before retry.
6. Verify npm version/dist-tag, `gitHead`, tarball integrity and contents against the seal; verify GitHub tag commit/release assets against the same candidate. A GitHub tag/release alone is not npm publication evidence.
7. Install the exact registry version in a fresh project/cache through npm, then verify init, component counts, selected-host configuration and Doctor. Capture installed identity and command exits. Keep warnings explicit; file installation does not verify native-host execution.

Candidate qualification commands below are **future local checks**, not performed by this documentation correction. Run them only in the owned candidate checkout with applicable scripts confirmed:

```powershell
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
npm run validate:manifest
npm run validate:registry-determinism
npm run validate:core-package
npm run validate:parity
```

Use the actual archive name/digests returned by packing. Registry verification substitutes the approved version, never a guessed number. These templates become actionable only after the transaction above is authorized and completed:

```powershell
npm view "@aexos/core@<approved-version>" version gitHead dist --json
npm view @aexos/core dist-tags --json
npx --yes "@aexos/core@<approved-version>" init <new-project-path>
```

Run `npx --yes "@aexos/core@<approved-version>" doctor --json` inside that new project. Replace placeholders before execution; record expanded commands, host/npm versions and actual counts.

## Sealed workflow inputs and recovery

Use the manual workflow at the approved **controller SHA**. For `prepare`, provide a full payload `source_sha` and `candidate_spec` JSON with exactly `packageKeys`, `channel`, `release` and `dependencies`. `release` contains the explicitly approved tag, title, notes and prerelease boolean. Package keys are `core`, `aexos-core`, `aexos-install`, `aexos-pro-cli` and `installer`; there is no `all` or implicit selection. Stable packages use `latest`, beta prereleases use `beta`, and other prereleases use `preview`. Each selected package must satisfy the same explicit channel. A stable companion is not silently sent to preview alongside alpha Core.

Preparation runs actual fixed checks, packs the selected existing versions, validates their inventories and tests fresh installed bytes under Node 20/22/24. Core additionally runs fresh default init and installed Doctor; report warnings honestly while requiring exit 0 and no FAIL. It uploads only `candidate.json` plus the declared TGZs as `aexos-release-candidate-<runId>-<runAttempt>`. Review the completed successful prepare run and these bytes. Its summary provides the exact locator fields: `sourceSha`, `producerRunId`, `producerRunAttempt`, `artifactId`, `artifactDigest` and `manifestSha256`. The manifest cannot contain its own outer artifact digest.

For `publish`, supply that reviewed locator JSON and one provisioned authentication strategy. The runner validates GitHub origin, actual ZIP bytes, safe extraction, manifest and every archive. Its internal preflight performs installed checks and provider/history reads, then writes `intent.json`. An immutable `aexos-release-intent-<runId>-<runAttempt>` upload must succeed before any release effect. The writer revalidates the persisted intent and sensitive observations, publishes exact TGZs once, verifies registry bytes/channel and fresh installed checks, then ensures matching tags and draft-release assets. It finalizes the release only after all required effects match. Existing conflicting assets are never replaced.

Unselected Core/installer companion dependencies require exact version/integrity and a prior verified outcome reference `gha:<artifactId>:<artifact-sha256-hex>:<receipt-sha256-hex>`. The adapter verifies that outcome, its persisted intent, producer candidate and actual registry bytes; mere version existence is insufficient. Selected companions bind their included exact archives using `selected:core` or `selected:installer`.

Every completed attempt seals a terminal `receipt.json`, uploaded as `aexos-release-outcome-<runId>-<runAttempt>` even when the transaction fails. Its per-effect states retain published-but-unverified and unknown outcomes. No effect may execute after terminal sealing. A failed/uncertain npm or GitHub response triggers reads, never an automatic second write. Restart discovery paginates historical runs and validates actual prior intent/candidate/outcome evidence, including other transactions with overlapping effects. A proven skipped executor in the exact current workflow revision can establish that preflight failed before any write. Legacy, missing, expired, malformed or incomplete evidence cannot prove absence of a write. Actions artifact retention is finite; unresolved effects require reconciliation before evidence expires.

The sole success result is a verified transaction with every selected package and required check accepted. A successful upload, skipped check, still-draft release or green subprocess alone is insufficient. Evidence-upload failure also keeps the hosted job unsuccessful. Never delete versions, retarget tags or replace assets to simulate rollback.

## Evidence chain and current status

Approved merge set/version/channel → clean exact commit → sealed package/manifest/inventory → required checks and independent review → controlled authorized publication → matching npm/GitHub identities → fresh registry-installed init/Doctor acceptance.

As of 2026-09-08 npm has only **5.3.0**, `gitHead e8755df...`; the root's dirty **6.0.0-alpha.1** is unpublished. PR #4 exists with prior exact evidence and pending external review. Recent stories have bounded local acceptance, but no combined immutable release commit or completed chain exists. No GitHub tags/releases or available npm/release/semantic workflow runs were returned. Do not overwrite 5.3.0 or represent it as containing unpublished fixes.

For failed publication, first inspect registry/tag/run state and preserve the seal. Do not blindly retry, replace assets, unpublish or retarget tags. Any recovery, deprecation or channel change is a separately authorized, recorded transaction with registry verification.

This chain does not close paid provider cycles, signed runtime, Office acceptance or native hosts. See the [candidate plan](../framework/epics/aexos-evolution/RELEASE-CANDIDATE-SLICES-20260908.md) and dated audit (reference retained in the maintainer workspace; not included in this public candidate).
