# Story AEX-4.19: Signed installer isolated integration

| Field | Value |
| --- | --- |
| Story ID | AEX-4.19 |
| Epic | AEXOS Evolution |
| Priority | P0 |
| Status | Ready for Review — implementation, source gates and portable installed proof accepted; final identity and PR recorded externally |
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
- [ ] AC6: Build and freshly install actual Core and standalone installer TGZs in separate npm-only consumers/caches without repository hoisting, source junctions or global substitutions. Bind exact commit/tree, both versions, TGZ hashes, complete payload inventories and consumer lock integrity; load installer/verifier/extractor through each actual installed package. Exercise extraction, safe target installation, source selection and scaffolding/preservation/rollback with inert synthetic review fixtures, including Windows spaces/metacharacters. Standalone extraction must resolve its declared tar locally. Verify free default init/Doctor on the selected first-value base before and after permitted mechanical content checks; no paid gate for free first-value. Distinguish real Windows probes from simulation, helper mechanics from licensed acquisition, and repository audits from consumer resolution. Fail-closed empty production trust remains observable. Reject any newly introduced private Pro/service content, production secrets or unrelated payload; inventory inherited packaging separately, without claiming the complete future free-Core boundary is certified.
- [ ] AC7: Supply a dependency-closed public story/verification summary explaining the preserved ACL.10/ACL.13/public AEX-3.8 contracts, exact reproducible commands, base/stack and exclusions. Resolve every selected relative link or replace absent/private context with truthful self-contained prose; do not ship raw workstation artifacts, private service code or keys. Architect and independent QA accept the exact reconstructed implementation/packages; PO verifies original scope/evidence. DevOps seals only reviewed owned files, reruns affected checks after changes and opens the requested focused normal-review PR with actual read-back and disclosed stack/lock overlap. Leave actual remote operation unchecked if blocked. No review bypass, version approval, tag, merge, npm publish, production trust/catalog/provider acceptance or broader AEXOS completion is implied.

## Tasks and ownership

- [x] Inspect accepted Slice 3 contracts/inventory and verify available story ID.
- [x] Architect/DevOps record actual base/stack and complete selected dependency/hunk closure before source edits (AC1).
- [x] Root transplants accepted installer, public verifier/schema and meaningful regressions, preserving authority and rollback (AC2–AC4).
- [x] Root applies minimal tar manifests/lock plus reviewed audit prerequisite and verifies gates/adversarial behavior (AC5).
- [ ] DevOps packages Core and standalone installer; root/QA exercise actual installed mechanics and preservation (AC6).
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

## Public verification and lifecycle

See [signed installer verification](SIGNED-INSTALLER-VERIFICATION-20260908.md)
for actual commands, current results and package/provider boundaries. This story
contains the complete behavior/ownership contract; previous private or combined
checkout receipts are not public dependencies. Exact final commit/archive and
independent verdicts belong in external review evidence, not their own payload.

Implementation and source/package QA are accepted. The second full run passes
all eight gates (10,065 passed, zero failed, 168 existing skipped tests). The
public portable fixture independently reproduces all seven installed checks
with fresh consumers at 2026-09-09 00:28:51 UTC. Exact final commit/archive seal
and final candidate-wide acceptance are recorded externally.
AC6 and AC7 remain open. Public source/test inventory includes the reviewed
transaction helper/test and narrow existing wizard fixture correction above.
Versions remain Core 5.3.0 and installer 3.3.9; no version/release approval exists.

## File list

Selected implementation/test/schema/manifests are enumerated above. Public docs:
`docs/framework/epics/aexos-evolution/STORY-AEX-4.19-SIGNED-INSTALLER-ISOLATED-INTEGRATION.md`
and `docs/framework/epics/aexos-evolution/SIGNED-INSTALLER-VERIFICATION-20260908.md`.
Any final generated metadata entries must be individually recorded before seal.

## QA Results

Scoped independent implementation reviews and seven actual installed matrix
checks pass. Second corrective full suite passes: 10,065 tests, zero failures, 168 existing
skips; all eight gates pass and source is unchanged. The public portable fixture also passes all seven actual installed checks.
Final candidate-wide QA/PO, exact commit/archive seal and normal PR delivery
are recorded separately; this document does not anticipate their outcome.
No hosted paid/provider, 6.x boundary, publication or Office acceptance is claimed.

Public verification freeze: the separately authored portable script received
independent lead implementation review PASS, with its executed seven-case receipt,
3,544 installed payloads, command logs and consumer locks independently rehashed.
Final committed identity and repacked consumer acceptance remain external
follow-up requirements; this freeze does not claim them completed.
