# Dependency-closed candidate integration plan

Date: **2026-09-08**. Owner: `@devops`; [AEX-4.14](STORY-AEX-4.14-RELEASE-SOP-AND-CANDIDATE-TRACEABILITY.md).
**Planning only: no new candidate, commit, PR or release was constructed.**

Base is verified remote `main` **5342f5a7c1ab6212087da2011265c11f1002503f**.
Local original ACL.0 HEAD `958a5aeaba60a2cf4f370bed80f7e95280df6612` has the
same tree `397ae0ca602ca2e23f1f076bd36a3dbfbb3b4f5d`. Preserve that squash
history. Current dirty `6.0.0-alpha.1` content has no immutable release identity.

Inspection receipt (reference retained in the maintainer workspace; not included in this public candidate)
contains exact commands/timestamps, three unchanged publishing-workflow hashes,
and **62 source files**, grouped with SHA256, baseline presence and literal
CommonJS dependency edges. Inventory SHA256:
`a0dcd2c00f27579563314dbe7f4d7825c6d1a1f64e24109602c240eff645a891`.
The `groups` arrays are exact source-path enumerations; `sourceInventory` binds
each path to bytes. They are not an instruction to copy every dirty file in a
group. Dynamic/configuration/generated-command edges are closed explicitly below.

Every slice excludes private `pro/` implementation, credential/provider material,
raw `artifacts/` logs, other agents' work, unrelated Office/Brand/orchestration
changes, and incidental version changes. Evidence needed in public review must
be a reviewed privacy-safe summary or deliberately selected reproducible fixture.
Do not blanket-stage a directory or replace a shared file just because its path
appears below. Story status is local acceptance, not upstream integration.

## Slice 0 — preserve the existing first-value PR

[PR #4](https://github.com/CyryxLabs/aexos-engine/pull/4), head
**d848c7f58ad4a8da3afc93398ec608be4bf4d23a**, already has 23 files, the exact
baseline/candidate commands and prior package hash. Base: **5342f5a...**.
Clean worktree: `C:/AEXOS-LOCAL-TESTS/first-value-clean-install`.

Included scope is the provider's existing `files` list and two PR commits, not a
new inferred patch. It covers npm documentation/init path, truthful component
summary and selected-host Doctor behavior with its helper, config, manifests,
story and regressions. Keep its body and source intact. Its current 48 successful
and two skipped checks do not cover alpha changes; no review is present, and
normal required external review remains open. Do not duplicate this PR.

Required next action: the actual required GitHub approving review and resolution
of review threads on the exact head, followed by normal protected integration.
No mutation is performed by this plan.

## Slice 1 — SYNAPSE package portability

Source: accepted AEX-4.10 (reference retained in the maintainer workspace; not included in this public candidate).
Base: main above, independent of Slice 0's changed runtime files. Source identity
is the receipt's `synapse` group. Included files/hunks:

- `.aexos-core/core/synapse/runtime/hook-runtime.js`: the manifest comment and
  `resolveHookRuntime` distribution selection/ENOENT-only fallback; preserve all
  unrelated code. Its diff against main is the existing 20-line bounded change.
- `tests/synapse/hook-runtime.test.js`: matching project/package selection,
  partial/broken runtime, permission/error and mutation-order regressions.
- AEX-4.10 story and a public-safe verification summary.
- Candidate-generated installation-manifest/registry entries **only for these
  changed artifacts**, if the actual commit/package gates require regeneration;
  never copy the dirty root's complete registry/manifest.

Closure: baseline already provides `../domain/domain-loader`, `../utils/paths`,
`js-yaml`, `../engine.js` and `../session/session-manager.js`. The last two are
dynamic imports under one selected runtime base. Project `.synapse` manifest,
core config and session directory are fixture inputs, not repository-wide
configuration changes. No new package dependency is required.

Required candidate checks: focused SYNAPSE runtime/context regressions, lint,
typecheck, full tests, build, actual manifest validation and packed/installed
package-only SYNAPSE fixture. Record before/after source identity; tests may not
leave the candidate registry changed. Existing `db2e658f...` package acceptance
is prior combined-scope evidence, not this unconstructed slice's package hash.

## Slice 2 — onboarding and release documentation

Source: accepted [AEX-4.11](STORY-AEX-4.11-TRUTHFUL-NPM-ONBOARDING-AND-PT-ES-DOCS.md)
and current AEX-4.14. Stack on Slice 0 to resolve the shared README change
explicitly. Include `README.md`, `README.pt-BR.md`, `README.es.md` (receipt's
`onboardingDocs` identities), their story, this plan, the corrected
`docs/guides/release-procedure.md`, and AEX-4.14's story.

Hunks: replace stale first-value/commercial-transition/CLI invocation paragraphs
with the reviewed npm route, truthful published-vs-candidate distinction,
translations and later free-Core/private-paid decision. Do not replace unrelated
README content from another branch. The release SOP changes governance/auth,
trigger mapping and evidence requirements only.

Documentation closure includes each relative target linked by the reconstructed
documents. In particular `adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md`,
the referenced evolution/commercial stories and IDE guide must exist in the
stack, or be deliberately added as their reviewed documentation dependencies.
Do not create broken artifact links in a public PR by referring to excluded raw
evidence; supply a selected public-safe receipt or an immutable review link.
The documentation dependency inventory (reference retained in the maintainer workspace; not included in this public candidate)
now enumerates selected document sources and every discovered local/external
link, with source/target paths, base/current source identity, anchor verification
and exact disposition. Existing baseline targets retain base bytes; new public
documentation dependencies are explicitly included. Links to excluded local
artifacts/workstation context have exact planned Markdown-to-plain-text
replacements in the receipt; no raw evidence is copied and no public URL is
invented. Execute link checks on the reconstructed documents before acceptance;
this inventory is a concrete rewrite plan, not an already assembled checkout.

Required checks: existing Markdown link checker on the selected documents,
anchors, equivalent EN/PT/ES command blocks, published-version claims against
fresh npm metadata, source diff review and independent QA. A documentation-only
change does not warrant rerunning the unrelated full product suite.

## Slice 3 — public signed-artifact client and safe Pro installation

Source: accepted ACL.10/ACL.13 plus the public portion of AEX-3.8. Base/stack:
Slice 0, with the accepted free-Core distribution decision. The receipt's exact
`installer` group enumerates **16 files**. Include:

- `packages/installer/src/wizard/pro-setup.js`: source/version resolution,
  signed acquisition/verification/extraction path, Windows npm argv resolver,
  bounded redacted diagnostics and scoped native machine-probe handling.
- `packages/installer/src/wizard/pro-artifact-extractor.js` and
  `packages/installer/src/utils/pro-package-metadata.js` as complete new modules.
- `bin/utils/pro-detector.js`: shared metadata-predicate import/re-export only.
- `packages/installer/src/pro/pro-scaffolder.js`: accepted managed-file
  preservation and rollback behavior; preserve unrelated scaffolding changes.
- `packages/installer/src/licensing/paid-squad-artifact.js` and its
  `artifact-trust-store.json`, whose empty public keys remain fail-closed.
- The nine matching fixture/test files named by the receipt's `installer`
  array; include `tests/helpers/paid-squad-artifact-fixture.js`, not production
  keys or private service code.
- Root/installer package manifests: only exact production `tar: 7.5.22`, root
  `overrides.tar: "$tar"`, and their dependency-closed lockfile changes. Do not
  copy the alpha version bump, unrelated scripts/files allowlist or other locks.
- ACL.10, ACL.13 and the public-verifier AEX-3.8 story/architecture summaries.

Closure: resolver imports the installer-local metadata helper; signed acquisition
imports the public verifier and extractor. Extractor requires `tar` and `semver`.
Existing baseline `feedback`, `aexos-colors`, `package-paths`, `i18n`, `fs-extra`,
`chalk`, `inquirer`, `node-machine-id` and Node builtins satisfy the stable named
interfaces; do not transplant their newer UX implementations. Scaffolder imports
`file-hasher` and `ensureProjectNodeModulesLink`, already exported by baseline
`aexos-core-installer.js`. Verify those interface assumptions again in the actual
reconstructed candidate. User-selected target Pro package and optional license
cache are runtime inputs, never public source dependencies to copy.

Required checks: extractor adversarial archives, diagnostics, resolver/auth,
target install, signed acquisition, detector/scaffolder, standalone installer
module load and archive extraction without repository hoisting; lint/typecheck/
full tests/build; packed install and preservation/rollback. Pin resulting actual
Core and standalone TGZ hashes. Existing local `db2e658f...` and standalone
`08f40837...` receipts are prior evidence only. Paid delivery still requires
separate trust/provider acceptance.

## Slice 4 — public CI truth, after installer and package boundary

Source: accepted ACL.12. Stack on Slice 3 and the **actual integrated AEX-3.7
Core Free package boundary**, not directly on current main. Its exact `ci`
group enumerates the workflow/config/helper changes, mandatory regression
dependencies and package boundary inputs.

Included workflow hunks: `ci.yml` adds the unconditional reusable distribution
job, executable machine-binding matrix and exact-success aggregate dependencies;
preserve every other CI job. `pro-integration.yml` becomes credential-free
selected contracts. `sync-pro-submodule.yml` and `publish-pro.yml` become manual
nonzero retirement guards. Add `paid-provider-certification.yml` as an honest
nonzero missing-prerequisite gate, not a working provider certifier.

Include `scripts/ci/assert-contract-results.js`, its workflow tests,
`jest.private-artifact.config.js`, exact private-suite exclusions in
`jest.config.js`, and only `package.json.scripts.test:private-artifact-contracts`.
Retain both versioned private-service suites; the explicit private command must
fail if private source is absent. Do not copy `pro/artifact-service` into Core.

Mandatory seven-suite closure is exact: detector, updater, public paid-artifact
verifier, signed acquisition, target install, scaffolder and Core package boundary.
The receipt records all imports of these new fixture/verifier surfaces. The
boundary additionally requires `scripts/validate-core-package.js`,
`.aexos-core/data/core-package-boundary.json`, the matching **full reviewed
`package.files` allowlist**, and Security canonical/derived directories declared
in that manifest's `requiredPaths`. Accepted AEX-3.7 also owns the publish safety
hook, squad-scaffolder boundary, corresponding tests and real install smoke.
These are prerequisite integration content, not optional omitted files.

The exact Security, derived Claude and boundary prerequisites are now enumerated
in the AC4 inventory below. Integrate that predecessor before this slice; do not
weaken the seven suites or use the old broad allowlist. DevOps owns future
reconstruction under this plan; actual candidate validation and normal review
remain required. Enumeration is complete planning evidence, not a constructed
candidate or approval of a release version.

Required checks: all seven suites execute with zero skips and strict reporter;
actual package boundary; workflow negative cases (failure/skip/cancel/absent
private runtime), exact private command separately with authorized source when
available; lint/typecheck/full public tests/build and required remote CI.
Do not equate the protected provider guard or local private unit tests to hosted
payment/download/install certification.

## Slice 5 — Grok aggregate parity, after managed host integration

Source: accepted AEX-4.12. Base/stack: integrated AEX-4.8 managed Grok and its
Office hook transport prerequisites. Core AEX-4.12 files are the first **eight**
paths in receipt group `grok`: aggregate validator, relocated canonical Grok
validator, default contract, compatibility wrapper, IDE guide, two regressions
and bootstrap test restoration. The aggregate/default-contract hunks preserve
all other validators; do not copy unrelated generator/IDE changes incidentally.

The eight-file set is **not closed on current main**. Concrete verified edges:

- Canonical Grok validator → `grok-skills-sync/index.js` and
  `managed-projection.js`; the latter is absent from main.
- Generator → `core/virtual-office/host-hooks.js` → `event-normalizer.js` and
  `host-bridge.js`, all absent from main.
- Generated hook command invokes `core/virtual-office/cli.js`, a dynamic command
  dependency absent from main. Its literal closure includes `codex-observer`,
  `config-loader`, `server`, `registry-loader`, `state-projector` and the hook
  modules; these exact paths/hashes are in `sourceInventory`.
- Config loader also needs `virtual-office.config.yaml`; server uses `public/`
  assets; registry loader needs canonical agents and `data/squad-registry.yaml`.
  These filesystem edges cannot be inferred by counting literal imports.
- AEX-4.8 selected-host installation also owns `ide-configs.js`,
  `ide-config-generator.js`, selected-host wizard hunks and Doctor selection;
  include its generated `.grok/.aexos-managed.json` plus exactly the 78 artifacts
  defined by that manifest after reproducing generation from the candidate.

The AC4 inventory below enumerates the AEX-4.8/Office predecessor, including
runtime modules, config, every served resource and all 78 managed outputs.
DevOps reconstructs that predecessor before the eight parity files; no stub
hook or inferred static subset is permitted. The planned fixture adaptation
and regenerated catalogs must pass on that actual candidate before acceptance.
Projection comparison continues to make no native Grok execution claim.

Required checks after closure: 53 existing focused tests with no skips, all real
default parity checks including positive Grok count and NOT_ASSESSED native
runtime, installer/bootstrap/managed projection tests, source preservation,
lint/typecheck/full tests/build/package boundary, packed selected-Grok install,
repeat and read-only drift/preservation. Reconstructed commit/TGZ hashes are
**not yet available**; prior `c7b30c55...` package and `4ISL9f` test snapshot are
not substitute release identities.

## Separate repository — ACL.11

ACL.11 modifies **`C:/AEXOS-license-server/scripts/migrate.mjs`**, not Core source.
Its read-only status change needs a separately owned server checkout/PR with
that server's actual base, lockfile, `pg` dependency and status fixtures. Do not
place it or server credentials in a Core PR. No server commit/package/deployment
is constructed here; its existing native SQL/status evidence remains local.

## Shared-hunk and acceptance rules

### AC4 correction — exact prerequisite and hunk inventory

The expanded machine-readable inventory (reference retained in the maintainer workspace; not included in this public candidate)
supersedes the original receipt's **scope completeness**, while preserving that
receipt unchanged. Its 316 source/target entries bind current SHA256, byte count,
base presence/SHA256, ownership and disposition. The inventory hash is
`7209be5667cdb2c6e9c45c693855f63364ec59884a4617d194f87c8f71e15fe1`.
The inventory is an input catalog: `baseline-interface-only` entries and
`exclude-*` entries are expressly **not files to transplant**. All paths below
are expanded to individual files in that JSON; no directory wildcard is an
unresolved integration requirement.

**Security/boundary predecessor (before Slice 4).** `security-canonical` contains
exactly 20 files: three squad metadata/readme/changelog files, six agents, eight
tasks, one workflow, one checklist and one template. All 17 component references
resolve. Include the assessment implementation and Security CLI module, three
Security regression suites and only the Security `.gitignore`, `bin/aexos.js`
and `.aexos-core/cli/index.js` selections. Adjacent Workflow/Cerberus registration
lines are excluded. Generate the six Claude command files and six skill files
from those six agents using the bound `scripts/sync-squad-agents.js`, agent parser
and Claude transformer. The manifest-required Core surfaces enumerate twelve
canonical agents and their twelve Claude commands plus twelve skills; retain
base canonical definitions unless an independently owned predecessor changes
them, then regenerate these outputs. Current output hashes are observations,
not permission to copy unrelated changed agent definitions.

Boundary inputs include the validator/manifest/seven mandatory tests already
listed, `bin/utils/validate-publish.js`, the free-Core squad-scaffolder,
`tests/ids/squad-packaging.test.js` and `scripts/e2e/core-free-install-smoke.js`.
Both publish-validator hunks are owned: private runtime-file rejection and Core
boundary invocation. `packageFields` enumerates exact before/after JSON values
for `/files`, tar dependencies/override, the private test command, and the
`validate:core-package` and `validate:grok-projection` scripts. The complete
allowlist equals the boundary manifest byte-for-byte as JSON, with cache/log
exclusions last. Alpha version changes and all other package fields are excluded.
Regenerate the lock for only the selected tar dependency change; its captured
full diff is inspection evidence, not an applicable whole-file replacement.

Security's actual squad manifest declares `cyryx.minVersion: 6.0.0`. This plan
preserves that value and records it as a version/compatibility decision before
release. It does not invent a 5.x-compatible Security claim, a stable 6.0.0
release, or change the paid/free boundary to bypass that decision.

**Office/managed-host predecessor (before Slice 5).** Include the ten exact
Office runtime modules (`index`, `cli`, `codex-observer`, `config-loader`,
`event-normalizer`, `host-bridge`, `host-hooks`, `registry-loader`, `server`,
`state-projector`) and `virtual-office.config.yaml`. `routes` maps all **31
HTTP routes to 30 distinct files** with hash and MIME type: seven browser
HTML/CSS/JS files and 23 image assets. Every literal browser JS/CSS/image reference
is served. The dynamic renderer references `manifest.plate.src`, `atlas.src`,
`walkAtlas.src` and executive standing/workstation fields; their concrete image
paths are bound through `scene-manifest.js` and the route table. Preserve the
two asset provenance files; exclude the unreferenced reception-v2 image.
The YAML logo path resolves to the included logo asset.

`runtimeContracts` explicitly records the generated hook CLI invocation, default
config, host settings merges, canonical-agent directory, squad registry, local
queue/events/producer-token, and Codex session/checkpoint paths. Runtime tokens,
event logs, user settings and session content are not read, copied or packaged.
Codex observation remains opt-in; native processes and live connectivity are
external acceptance. No external observer input is disguised as missing source.

The Grok input set names the generator, managed-projection helper, host hooks,
agent parser, twelve canonical agent paths and eight development workflow skill
files. `projections` enumerates all **78** outputs and the separate manifest,
whole-file SHA256, managed-section SHA256, expected hash, match result and
unmanaged-section preservation rule. All 78 current managed hashes match.
Generate them in the reconstructed candidate using those selected inputs; the
current whole-file hash of `.grok/config.toml` is not its managed-section hash.
The canonical validator and aggregate can then consume that complete projection.

**Exact mixed-file handling.** `hunks` preserves each current diff against the
fixed main SHA, its hunk text/hash and include/exclude disposition; `selections`
binds exact line ranges/text/hash where adjacent unrelated changes share a hunk.
Apply the Grok `IDE_CONFIGS` entry and only the seven-line
`ide.managedProjection` branch in `generateIDEConfigs`. Preserve baseline ora,
prompt and feedback interfaces; exclude premium terminal/cancellation changes.
For the wizard, the exact selected-host sync region replaces unconditional
sync, and the selected-host Office hook region is inserted before validation.
Its one cancellation-specific line is explicitly removed in `adaptationPlan`
because that separate UX subsystem is not a dependency of this slice.
The base/PR #4 interfaces are byte-bound in `baselineContracts`, with every
required token found. Add the enumerated new Doctor `host-selection.js` and
`checks/selected-hosts.js`, plus only the registry's `selectedHosts` require and
array member: neither helper exists in PR #4, so they are not falsely attributed
to that predecessor. All other Doctor changes stay excluded.

For CI, include all recorded `ci.yml` hunks and its named ACL.12 workflow/helper
files. For Jest include the first, private-discovery/comment hunk; exclude the
second unrelated `moduleNameMapper` package-instance hunk. The default parity
contract and aggregate validator changes are whole owned hunks. All remaining
shared-file diff content is excluded unless separately assigned above. The
captured ranges are source selection contracts, not claimed cherry-pick patches
that have already applied to a clean branch.

The three changed selected-host regression files are explicitly hunk-scoped too:
include the Grok hunks in `tests/integration/wizard-ide-flow.test.js` and
`tests/unit/config/ide-configs.test.js`. In `tests/unit/wizard/ide-selector.test.js`
include only the second hunk (six to seven choices); exclude the first hunk's
CLI-only empty-selection behavior, because that UX implementation is outside
this slice and the preserved base selector still rejects an empty selection.

**Generated catalogs and fixture adaptation.** The exact registry generator and
discovery module plus Security squad/agent inputs are bound. Main already tracks
20 other squads: **176 additional base-only manifest/agent inputs** are enumerated
in `baseCatalogInputs`, each pinned to the main commit and its exact blob SHA256.
Preserve those baseline source directories and bytes, including baseline Brand;
do not copy their dirty counterparts or delete them to make a smaller catalog.
The reconstructed source catalog therefore has 21 squads/162 agents, plus twelve
Core agents. The Office config-registry test currently assumes the full
workstation catalog (23/180 including Core); `adaptationPlan` specifies its exact
five source-test expectation replacements (22/174 total, 21/162 registry, 12 Core).
The published payload allowlist includes only Security; a **separate fresh
installed-project** registry is regenerated from that installed squad and yields
2/18 total, 1/6 registry, 12 Core. Source and installed counts are not interchangeable.
Retain all negative registry tests. This adaptation has not
been implemented or tested: it is concrete future reconstruction work, not a
closed test result. Likewise generate installation/entity manifests from the
assembled candidate and execute the accepted bootstrap restoration test. Never
copy the root's 22-squad registry or whole generated manifests to obtain green.

The expanded inventory was produced by a read-only AST import/resource/manifest
scan: no unresolved literal imports, all component and managed-output checks
passed, and all 316 input hashes remained unchanged after the scan. This closes
enumeration for review, with the 176 immutable base-only catalog identities
recorded separately. Actual candidate reconstruction, fixture adaptation,
regeneration, tests and the 6.0.0 compatibility decision remain explicit future
transactions. No nonexistent provider or native-host implementation is called
dependency-closed or release-ready by this plan.

- `package.json`: keep version and unrelated scripts separate; Slice 3 owns tar,
  Slice 4 owns its exact private-test script, AEX-3.7 owns package allowlist.
- `package-lock.json`: regenerate only for the owned dependency delta in the
  reconstructed branch; no whole-file transplant from the alpha worktree.
- Wizard/IDE and `bin/aexos.js`: preserve Slice 0 corrections; later Office,
  premium UX, Brand and orchestration hunks require their own accepted ownership.
- Registry/install manifest: generate for the reconstructed content, inspect and
  seal. Never move a root-wide generated file solely to eliminate a gate failure.
- Public documentation links: select reviewed reference dependencies or stable
  review links; never expose private/internal files to close a link checker.

For every future slice, record actual base, source-hunk identities, final commit,
included files, dependency closure, TGZ/manifest hashes, exact gates/exits and
independent review. A plan with unresolved prerequisite integration remains a
plan. Frozen hashes here identify inputs; they are not approval of a clean
candidate that has not been assembled.

## Release chain: available versus missing

| Link | Evidence/status |
| --- | --- |
| Approved intended merge set + version/channel | Not finalized for a release; PR #4 still requires external review |
| Clean exact release commit | None; clean PR #4 worktree exists only for its narrower scope |
| Sealed combined package/manifest | Local scoped TGZ receipts exist; no approved combined release seal |
| Required checks + independent review | Existing PR checks and local story QA exist, each bound to its own source; no review for an unconstructed slice |
| Controlled authorized publication | Held on SOP's concrete authentication/trigger/idempotence blockers |
| Registry/GitHub identity correspondence | npm 5.3.0 exists at e8755df...; no GitHub tags/releases or publisher runs returned; no alpha registry artifact |
| Registry-installed corrected first value | Prior public 5.3.0 defects reproduced; corrected local package tests passed; corrected public release not yet available |

The [release SOP](../../../guides/release-procedure.md) defines the single future
transaction after these prerequisites close. Signed runtime, paid provider
cycles, broader Office and native-host acceptance remain separate.
