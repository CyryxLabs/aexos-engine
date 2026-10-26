# Story AEX-4.19: Signed installer isolated integration

| Field | Value |
| --- | --- |
| Story ID | AEX-4.19 |
| Epic | AEXOS Evolution |
| Priority | P0 |
| Status | Ready for Review — exact local implementation/packages QA and PO accepted; actual PR delivery pending |
| Executor | Root `@dev` installer/test/dependency transplant; `@devops` isolated candidate/Git/package/PR |
| Quality gates | `@architect` base/dependency/security contract; independent `@qa`; `@po` evidence coherence |
| Scope | Actual integration of accepted Slice 3 public signed client and safe Pro installation |

## Story

As an AEXOS installer user, I want the accepted signed-artifact client and safe
Pro installation fixes delivered as an independently verified candidate, so that
real npm installations retain their authority, filesystem safety and useful
Windows diagnostics without depending on the combined development checkout.

## Context and base decision

Accepted Slice 3 specifies ACL.10 source/version selection, ACL.13 safe
extraction/diagnostics and the public portion of AEX-3.8 signed verification.
Prior combined Core/standalone receipts demonstrate earlier local work, not this
new isolated candidate. The current user authorizes continued remediation and a
focused reviewable PR; no new product or production signing service is requested.

Architect and DevOps approve actual first-value PR #4 head
`d848c7f58ad4a8da3afc93398ec608be4bf4d23a` on
`codex/fix-first-value-path` as the stacked base. Main was last verified as
`5342f5a7c1ab6212087da2011265c11f1002503f`. Preserve PR #4 source/body and
normal review. Reconstruct only accepted PR #6's four-node lock correction from
`2489935baddfef5d89ef657e78491bacd8caff63` before adding tar; exclude its two
documents. Disclose that lock overlap until normal integration. The exact preflight receipt must be retained before source transplant; neither
PR is presumed merged. The candidate branch is `codex/pro-installer-hardening`.
This is a public-client backport on historical 5.x distribution. Its broad
squads allowlist is an inherited limitation, not 6.x Core Free certification.
Actual AEX-3.7 package-boundary integration remains a mandatory predecessor for
Slice 4 CI/new 6.x paid distribution, outside this installer correction.

[AUTO-DECISION] ID AEX-4.19 is available. Ready authorizes the bounded prerequisite
review and implementation below under existing user authorization. Root owns
installer code/tests and minimal manifest/lock changes; DevOps owns isolated
candidate assembly and all remote actions. No generic user approval checkpoint
is introduced. Preserve all concurrent/shared/frozen candidates.

## Acceptance criteria

- [x] AC1: Architect and DevOps record and independently review the actual branch/base/head/tree, prerequisite lock overlap and exact source/hunk/dependency inventory before transplant. Verify the proposed PR #4 stack or document an evidence-based alternative without assuming any protected PR merged. Include only the accepted installer group, necessary public verifier test/schema, narrow tar manifests/lock, and public-safe docs below. Recheck baseline helper interfaces and all module/schema/test dependencies. Preserve existing first-value/SYNAPSE/dependency PRs and the shared dirty checkout. No unrelated UX, Office, alpha version, private service or automatic broader package-boundary transplant.
- [x] AC2: Preserve complete source/version and signed-authority behavior. Usable target package precedes implemented bundled package, with Git bootstrap last; require readable compatible metadata, squads directory and pro-config file, reject scaffold/unimplemented or malformed packages while retaining legacy metadata compatibility and explicit version override precedence/default value. Verify descriptor schema, pinned Ed25519 signature, key validity and request bindings (product/account/entitlement/machine/squad/package/version/platform/channel/issuance/expiry/freshness), then actual bytes/size/SHA-256 before extraction. Unknown keys/fields/algorithms, tampering, expiry or wrong binding fail closed. Production trust remains empty; tokens go only to the License Authority, never artifact origins or redirects. Tests use ephemeral fixture authority, never production keys or fabricated licensed-runtime claims.
- [x] AC3: Preserve confined in-process extraction of the same verified bytes, without npm/shell/scripts/network. Enforce npm package layout, exact expected package/version metadata and the accepted compressed/expanded/entry/count/metadata limits. Reject truncated archives, unsafe raw/effective PAX paths, absolute/drive/UNC/traversal, links/special entries, Windows unsafe segments, Unicode/case collisions, duplicate/type/parent collisions and expansion exhaustion. Validly signed malicious archives still fail safely. Remove only owned temporary output; test outside sentinels and user files remain unchanged. Preserve the accepted maintained tar design instead of weakening checks to library defaults.
- [x] AC4: Preserve Windows Node/npm-cli discovery and literal argv without npm.cmd/cmd.exe/shell:true fallback, including npx siblings, missing environment, Node layouts, invalid paths, spaces/metacharacters and actionable missing-entry failures. Genuine target dependency installation retains explicit target/workspace isolation, ignore-scripts/no-save/no-lock and verified-source fallback semantics. Errors retain useful bounded reasons while redacting all configured secrets, bearer/URL credentials/query values and unsafe terminal controls. Native identity-probe stderr handling is narrowly scoped and restored on exceptions; identity algorithm and fallback are unchanged. Scaffolding preserves managed/user-modified files, rolls back failed updates and never overwrites arbitrary target manifests or ancestor projects.
- [x] AC5: Reconstruct meaningful public regression coverage for resolver/auth/target install, signed verification and acquisition, malicious archives, diagnostics/native-probe handling, detector and scaffolder preservation/rollback; include the verifier schema dependency. Reproduce relevant pre-fix failures or explicitly match earlier negative controls on the actual chosen base. Run applicable candidate lint, typecheck, full tests, build, manifest/package checks and actual dependency audits, recording commands, exits and existing skips. Only exact tar 7.5.22 production dependencies in root/installer, root overrides.tar="$tar", their necessary lock closure and the separately reviewed four-node audit prerequisite are allowed. The fresh candidate audit additionally confirmed HIGH GHSA-2883-xcg3-v3hh: architecture approves only existing lock nodes node_modules/js-yaml 4.3.1 to 4.3.2 and node_modules/@istanbuljs/load-nyc-config/node_modules/js-yaml 3.15.1 to 3.15.2, with authentic registry resolution/integrity, no manifest/range change and preservation of unrelated nodes. Record exact before/after node delta, fresh locked install/installed versions and full/production audits; rerun relevant YAML/config/installer and full gates against the corrected installed graph. Fresh package consumers must report their own actual resolution/audits. Prior zero-audit receipts remain dated history, not proof against this newly observed advisory. Verify engines, installed dependency identity and unchanged ranges/versions outside that scope. Inherited failures must be reproduced/disclosed; skipped required cases or registry errors cannot count as PASS.
- [x] AC6: Build and freshly install actual Core and standalone installer TGZs in separate npm-only consumers/caches without repository hoisting, source junctions or global substitutions. Bind exact commit/tree, both versions, TGZ hashes, complete payload inventories and consumer lock integrity; load installer/verifier/extractor through each actual installed package. Exercise extraction, safe target installation, source selection and scaffolding/preservation/rollback with inert synthetic review fixtures, including Windows spaces/metacharacters. Standalone extraction must resolve its declared tar locally. Verify free default init/Doctor on the selected first-value base before and after permitted mechanical content checks; no paid gate for free first-value. Distinguish real Windows probes from simulation, helper mechanics from licensed acquisition, and repository audits from consumer resolution. Fail-closed empty production trust remains observable. Reject any newly introduced private Pro/service content, production secrets or unrelated payload; inventory inherited packaging separately, without claiming the complete future free-Core boundary is certified.
- [ ] AC7: Supply a dependency-closed public story/verification summary explaining the preserved ACL.10/ACL.13/public AEX-3.8 contracts, exact reproducible commands, base/stack and exclusions. Resolve every selected relative link or replace absent/private context with truthful self-contained prose; do not ship raw workstation artifacts, private service code or keys. Architect and independent QA accept the exact reconstructed implementation/packages; PO verifies original scope/evidence. DevOps seals only reviewed owned files, reruns affected checks after changes and opens the requested focused normal-review PR with actual read-back and disclosed stack/lock overlap. Leave actual remote operation unchecked if blocked. No review bypass, version approval, tag, merge, npm publish, production trust/catalog/provider acceptance or broader AEXOS completion is implied.

## Tasks and ownership

- [x] Inspect accepted Slice 3 contracts/inventory and verify available story ID.
- [x] Architect/DevOps record actual base/stack and complete selected dependency/hunk closure before source edits (AC1).
- [x] Root transplants accepted installer, public verifier/schema and meaningful regressions, preserving authority and rollback (AC2–AC4).
- [x] Root applies minimal tar manifests/lock plus reviewed audit prerequisite and verifies gates/adversarial behavior (AC5).
- [x] DevOps packages Core and standalone installer; root/QA exercise actual installed mechanics and preservation (AC6).
- [ ] Freeze public documentation, obtain architecture/QA/PO acceptance and deliver the focused PR through DevOps (AC7).

### Exact source and test ownership

Root `@dev` owns selected accepted behavior in these implementation files:

- `bin/utils/pro-detector.js`: metadata-predicate import/re-export only.
- `packages/installer/src/wizard/pro-setup.js`.
- `packages/installer/src/wizard/pro-artifact-extractor.js`.
- `packages/installer/src/utils/pro-package-metadata.js`.
- `packages/installer/src/utils/pro-install-transaction.js`: approved refresh rollback closure using Node builtins.
- `packages/installer/src/pro/pro-scaffolder.js`.
- `packages/installer/src/licensing/paid-squad-artifact.js`.
- `packages/installer/src/licensing/artifact-trust-store.json`: empty production keys.

Matching accepted test/fixture ownership:

- `tests/installer/pro-source-resolution.test.js`.
- `tests/installer/pro-install-transaction.test.js`: dependency/cache ownership, rollback and real scaffold coordination.
- `tests/pro-wizard.test.js`: existing acquisition fixture now implements the supported cache-path contract and asserts actual fixture cache persistence.
- `tests/installer/pro-setup-auth.test.js`.
- `tests/installer/pro-scaffolder.test.js`.
- `tests/installer/pro-artifact-extractor.test.js`.
- `tests/installer/pro-installer-diagnostics.test.js`.
- `tests/installer/pro-setup-target-install.test.js`.
- `tests/installer/pro-setup-signed-artifact.test.js`.
- `tests/pro/pro-detector.test.js`.
- `tests/helpers/paid-squad-artifact-fixture.js`.
- `tests/unit/licensing/paid-squad-artifact.test.js` and its required
  `.aexos-core/schemas/paid-squad-artifact-v1.schema.json`.

The last two paths are necessary public-verifier closure beyond the accepted
16-path installer group; the verifier test is absent from main. Do not import
private-service tests or code to make that public test run. Root additionally
owns only the specified `package.json`, `packages/installer/package.json` and
root `package-lock.json` hunks, including the two architect-approved js-yaml
patch resolutions under unchanged ranges. The transaction helper and its test
were explicitly approved after QA reproduced destructive refresh cleanup;
no additional product surface is introduced. Standalone installer has no existing lock;
do not invent one or change its version. Any actually required generated
manifest entry must be inventoried and approved within owned-file scope before
regeneration; no global metadata refresh or unrelated test fixture transplant.

DevOps owns isolated checkout, exact Git operations, package receipts and public
verification document. PO owns this root story and its public-safe draft only.
All contributors are working concurrently; preserve others' edits.


### Public installed verification fixture

Architecture additionally approved `scripts/e2e/pro-installed-package-smoke.js`
as the portable public reproduction of the actual seven-case installed matrix.
It accepts two supplied TGZs, creates fresh consumers/caches under a new output
directory, invokes real signed local HTTP/target npm and preserves package bytes.
No raw workstation receipt or private source is a runtime dependency. This
verification-only file received its own actual run; it does not change production
runtime or retroactively modify the earlier full-suite receipt.

### Reviewed correction closure

Architecture additionally approves `packages/installer/src/utils/pro-install-transaction.js`
and `tests/installer/pro-install-transaction.test.js` for AC4: target lock,
complete dependency snapshot, narrow manifest/cache ownership and idempotent
commit/rollback, using Node builtins only. The existing scaffolder journal stays
active through the awaited cache callback; unsafe cache paths are refused before
writes. This is an internal safety helper, not a new command or paid feature.

`tests/pro-wizard.test.js` additionally receives only the accepted fixture fix:
provide actual `getCachePath(baseDir)`, write an inert cache there and assert
bytes. The old stub caused a real full-suite failure; production checks remain
strict. These three paths join the selected 18-path source/test/schema closure
and three manifest/lock files. Any final generated metadata/doc delta must be
listed separately; do not present the earlier 18-path inventory as final scope.

## Guidance and risks

Baseline interfaces to recheck: feedback, colors, package paths, i18n, fs-extra,
chalk, inquirer, node-machine-id, Node builtins and semver; scaffolder file-hasher
and ensureProjectNodeModulesLink. Reuse these interfaces without transplanting
newer unrelated UX. A missing actual dependency is a specific closure finding,
not authority to copy the combined installer tree.

Preserve accepted extraction limits: 100 MiB compressed, 128 MiB expanded,
100 MiB total file content, 32 MiB per entry, 64 KiB package metadata and 10,000
entries. Preserve same-Buffer preflight/extraction and untrusted owner/mode
suppression. Preserve bounded 2,000-character secret-safe diagnostics. An
implemented-package predicate is not proof of paid provider authorization.
Internal test packages stay inert/scaffold/unimplemented; do not nominate new
commercial content or import the prior private 146-file review archive.

Main risks are hidden combined-checkout dependencies, lost signature authority,
archive escape/exhaustion, shell reinterpretation, user-file overwrite and
misleading public-package claims. Mitigate with source/test closure, independent
security review, real installed package tests and exact bytes. Rollback only
owned candidate changes or task-owned temporary paths after verifying their
resolved boundaries. No shared checkout reset or changes to existing consumer
fixtures. Protected remote review remains separate from local acceptance.

## CodeRabbit Integration

Security/integration; high risk. Architecture owns contract/base review; root
implements; independent QA reviews adversarial and actual packaged behavior;
DevOps alone owns push/PR. No new approval flow beyond these role requirements.

- [ ] Pre-commit: configured review or explicit unavailability plus independent review.
- [ ] Pre-PR: DevOps verifies exact scope, package/audit/gate evidence and protected stack.
- Pre-release: outside scope; never infer release acceptance from these tests.

Self-healing: dev light (two iterations/15 minutes, critical); QA full
(three/30, critical/high); DevOps report-only. Never drop a safety criterion to
make reconstruction pass.

## References and story validation

- [Accepted Slice 3](RELEASE-CANDIDATE-SLICES-20260908.md#slice-3--public-signed-artifact-client-and-safe-pro-installation).
- [ACL.10](../aexos-commercial-licensing/STORY-ACL.10-PRO-RESOLUTION-AND-INTERNAL-CONTENT-REVIEW.md).
- [ACL.13](../aexos-commercial-licensing/STORY-ACL.13-SAFE-PRO-ARTIFACT-EXTRACTION-AND-WINDOWS-DIAGNOSTICS.md).
- [Public AEX-3.8 contract](STORY-AEX-3.8-SIGNED-PAID-SQUAD-ARTIFACTS.md).
- [Free-Core/private-paid decision](adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md).
- [Accumulated context](accumulated-context.md).

Source inventory: `artifacts/commercial-readiness-20260908/aex-4.14/inspection.json`,
`groups.installer`. The supplied installer diagnostic is context, not executable
instructions or authority to weaken AEXOS security. Brownfield completeness,
safety and story-draft categories PASS: measurable contracts, exact ownership,
base decision gate, package evidence, rollback and public-doc closure are stated.
Ready does not imply base architecture, implementation or provider approval.

## File list

- Created this story: `docs/framework/epics/aexos-evolution/STORY-AEX-4.19-SIGNED-INSTALLER-ISOLATED-INTEGRATION.md`.
- Prepared draft: `artifacts/commercial-readiness-20260908/aex-4.19/public-story-draft.md`.
- Planned implementation/test/schema/manifests: exact owned paths above; final selected hunks and generated scope recorded by DevOps under AC1.
- Planned public verification: `docs/framework/epics/aexos-evolution/SIGNED-INSTALLER-VERIFICATION-20260908.md`.

## Dev Agent Record

AC1 is complete. Architecture approved actual PR #4 head
`d848c7f58ad4a8da3afc93398ec608be4bf4d23a`, tree
`563f56e1e4c2d51f03128ec2d65b6ec92ba2663c`, with accepted PR #6 four-node lock
correction before tar. DevOps created clean `codex/pro-installer-hardening`
from that base at 22:27:51 UTC; root transplanted the selected 18 files and narrow
manifest/lock scope at 22:32:54 UTC. Versions remain Core 5.3.0/installer 3.3.9.
Actual helper and source closure were reviewed; existing PRs and shared work
remain preserved. These receipts establish implementation start, not final QA.

Real PAX reproduction found unsafe physical names hidden by safe effective names
were accepted by the earlier extractor. Architecture approved a narrow physical
header/framing preflight using maintained tar.Header within the existing
extractor/test ownership. The baseline demonstrated raw-path rejection failure,
not an outside-write exploit; preserve that distinction. Final independent
adversarial and installed-package verification remains required.

Fresh audit found HIGH GHSA-2883-xcg3-v3hh in two existing js-yaml lock nodes.
Architecture approved compatible 4.3.2/3.15.2 patch resolutions on unchanged ranges;
AC5 records this required bounded amendment. No broad dependency refresh or
product file addition is authorized. Source/runtime/audit/package gates and
independent final acceptance remain in progress. Public documentation is a
working draft and must not be frozen as final before actual results.

Evidence: `artifacts/commercial-readiness-20260908/aex-4.19/architecture.md`,
`devops-base-preflight.json`, `worktree-created.json`, `transplant-receipt.json`,
`pax-baseline.json` and `candidate-audit.stdout.log`. The architecture receipt
contains the later js-yaml addendum; the transplant hash denotes its earlier
pre-transplant state and is not retroactively rewritten.

## QA Results

Historical initial independent review was **NEEDS_WORK**. Six additional archive probes
passed, but QA reproduced malformed package selection and deletion of an existing
Pro runtime after a failed refresh. The strict metadata correction now passes
62 targeted tests and independent real-filesystem re-review (helper SHA-256
`11b069e042cc2d9a004b5082d973aadc701e8215bb7bf56d3c8c880118b11046`).
Valid legacy metadata remains supported. Refresh rollback now has an initial
implementation: complete dependency backup, narrow manifest/cache snapshots,
explicit ownership, and scaffold rollback retained through the cache callback.
Initial tests passed (74 public cases plus one private comparison skip; a
separate 27-case run includes actual target npm and real scaffold coordination).
Independent refresh review and final package acceptance remain pending;
AC2/AC4 remain unchecked.

All eight earlier candidate gates passed with source unchanged, but precede
the metadata correction and do not certify the final candidate. Repeat final
gates after the remaining correction, then complete the actual package matrix.
Evidence: `aex-4.19/qa-initial.md`, `qa-metadata-probes-before.json`,
`qa-metadata-probes.json`, `metadata-final-tests.json`,
`qa-refresh-preservation.json` and `candidate-gates.json`, under
`artifacts/commercial-readiness-20260908/`.

### Current implementation and package evidence — 2026-09-09 UTC

Independent scoped review accepts strict metadata, transaction mechanics and
corrected returned/thrown failure redaction. Architecture accepts the exact
transaction/helper coordination. Original negative receipts are preserved.
These mechanism reviews do not complete the final actual paired-package matrix.

Corrected Core 5.3.0 archive SHA256
`558ee247fe94be54e4b9b708c341c641a50436edd2177863ed70b75f8a83b283`
has 3,460 payload files; standalone installer 3.3.9 archive SHA256
`6827e9d766595e411373b95fa02e0cdc508cf07a4f08b658102ac40f8c64e51e`
has 84. Both freshly install, match source/installed payloads and exact consumer
lock integrity; their actual audits exit zero. These are corrected uncommitted
runtime packages, not the final documentation/commit seal.

Free Core `init <empty-project> --ci` and `doctor --json` both exit zero.
Doctor reports 13 PASS, 2 WARN, 0 FAIL, 3 INFO; missing Git hooks and the existing
Windows npx advisory remain honest warnings. All 3,460 installed files remain
unchanged. Receipt: `corrected-first-value.json`.

First corrective full run: seven gates pass, full tests fail with 10,064 pass,
168 skipped and one failing old cache-path fixture. It is not final PASS.
The narrow `tests/pro-wizard.test.js` correction passes 39 tests. A second full
run is in progress against corrected test bytes; packaged production bytes did
not change. Actual standalone/paired signed HTTP/npm/preservation matrix is
also in progress. AC5–AC7 and final candidate acceptance remain open. Public
drafts may record these observations but are not frozen before terminal results.
Evidence: `corrected-packages/packages.json`, `corrective-gates-1/`,
`corrective-gates-2/`, `wizard-cache-fixture-tests.json`, `qa-initial.md` and
`architecture.md` under the existing AEX-4.19 evidence directory.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready actual isolated Slice 3 integration, complete authority/safety/package contracts and explicit base review. | Themis / `@po` |
| 2026-09-08 | 1.1 | AC1 closed by actual architecture/worktree/transplant evidence; bounded raw-header correction and two js-yaml patch nodes retained in full acceptance. | Themis / `@po` |
| 2026-09-09 | 1.2 | Record reviewed transaction/helper and wizard fixture closure, corrected packages/free Doctor; retain failed full run and pending final matrix. | Themis / `@po` |

Installed matrix update: `qa-installed-matrix-final/receipt.json` reports terminal
PASS at 2026-09-09T00:12:43.858Z, seven actual standalone/paired signed HTTP/npm
checks covering valid/hostile extraction, empty trust before download, initial
install, requested refresh, cache-failure rollback and token/manifest/payload
preservation. Final full gates and candidate-wide QA/PO/PR remain open.

Final source-gate update: `corrective-gates-2/candidate-gates.json` completed
2026-09-09T00:15:55.846Z with eight zero exits and unchanged inventory
`3550e82d6d87f04b48107ca4c73b0355dbe8e914949e625e6dfe9e2d90ec1bbc`.
Tests: 10,065 passed, zero failed, 168 existing skipped; 403 passed/12 skipped
suites, 415 total. Receipt SHA256
`6d303eb5faa7c94b008d7386f8e8821a5e875a751d8d80adc2834eb7acf87ac8`.
This supersedes the pending second-run observation, preserves first-run failure
history and does not yet complete final candidate QA/commit/package/PR.

Public fixture update: `scripts/e2e/pro-installed-package-smoke.js` now reproduces
all seven installed cases in fresh consumers, terminal PASS at
2026-09-09T00:28:51.369Z (`portable-smoke-final/receipt.json`). Source/package
QA is APPROVED in `qa-source-package-final.md`; AC2–AC5 are complete. AC6/AC7
retain final identity and delivery conditions; no final commit/PR is claimed.

## Final local PO acceptance — 2026-09-09

Exact head `628ee1cd980a39a27bacf00ecbc6da7ad668b258` / tree
`863f60f4bb553953cbdc6b0d753ed3a041f098b2` has independent final QA APPROVED
and PO pre-PR PASS. AC1–6 are complete; AC7 local documentation/review portion
is accepted while actual PR/read-back remains open. Final Core archive
`3150a59808ea0fea73a5c68afb87cdb0491da41e8eeafcbd7f9801e494dce49a` has
3,463 files; standalone archive `6827e9d766595e411373b95fa02e0cdc508cf07a4f08b658102ac40f8c64e51e`
has 84. Seven actual final installed checks pass and free init/Doctor exit 0
with 13 PASS / 2 WARN / 0 FAIL / 3 INFO. Source gates retain 10,065 pass /
zero fail / 168 existing skips. Final 27-file scope, fixture-only late correction,
package/source/installed identities and open external gates are bound in
`artifacts/commercial-readiness-20260908/aex-4.19/po-final.md`.
Frozen candidate documents remain unchanged; delivery is recorded separately.
