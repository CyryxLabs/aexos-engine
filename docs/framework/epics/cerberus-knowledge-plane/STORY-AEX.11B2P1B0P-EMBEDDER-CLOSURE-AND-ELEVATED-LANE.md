# STORY-AEX.11B2P1B0P — Embedder Closure and Governed Elevated Lane

**Epic:** [Cerberus Knowledge Plane](EPIC-CERBERUS-KNOWLEDGE-PLANE.md)  
**Split from:** [AEX.11B2P1B0](STORY-AEX.11B2P1B0-OS-ROOTED-PRE-JS-LAUNCHER.md)  
**Normative Specification:** [AEX.11B2P Native Capability Spec v3.1.0](AEX.11B2P-NATIVE-CAPABILITY-SPEC.md)  
**Decision:** [ADR-AEX-012](adr/ADR-AEX-012-ATOMIC-NO-REPLACE-PROMOTION.md)  
**Depends on:** [AEX.11B2P1](STORY-AEX.11B2P1-NATIVE-NO-REPLACE-HOST-CAPABILITY.md) (`Done`, Architecture/QA `PASS`)  
**Unblocks:** [AEX.11B2P1B0](STORY-AEX.11B2P1B0-OS-ROOTED-PRE-JS-LAUNCHER.md) only  
**Status:** InProgress — execution started; fail-closed lane preflight confirms the exact immutable Windows/Linux/macOS build and elevation lanes are not available from this worktree/host, so no closure `PASS` or downstream credit exists  
**Owner / Primary Executor:** `@devops`  
**Quality Gates:** `@architect`, `@po`, `@qa`  
**Architecture Gate:** `@architect`  
**Product Gate:** `@po`  
**Quality Gate:** `@qa`  
**Quality Gate Tools:** canonical closure verifier, native controller/token oracle, static archive/object/symbol/import inventories, layout/selector/lock policy hashes, package/no-egress inspection and CodeRabbit

> `[AUTO-DECISION] Should B2P1B0 or downstream B2P2 invent the Node embedder,
> toolchain or elevated-lane inputs? → No. Spec v3.1 fixes the approved inputs
> and assigns their source-bound closure and host-lane readiness to this
> independent DevOps story; generated observations remain implementation
> outputs and cannot be prefilled or inherited from B2P2.`

## Story

**As an** AEXOS Release Engineer,  
**I want** one canonical static Node embedder build-input closure and a governed elevated-controller/restricted-child lane for each exact launcher tuple,  
**so that** B2P1B0 can build and prove the first-byte launcher without invented toolchains, an addon import library, a privileged runtime or a circular downstream dependency.

## Exact Boundary and Constants

```text
CAPABILITY_VERSION = "aexos.atomic-no-replace/v1"
ROOT_ADMISSION_ABI_VERSION = "aexos.os-rooted-package-admission/v2"
BOOTSTRAP_ABI_VERSION = "aexos.atomic-no-replace-admission-authority/v3"
PAIR_MANIFEST_SCHEMA = "aexos.atomic-no-replace-pair-manifest/v4"
TRUST_ROOT_POLICY = "aexos.os-rooted-package-admission/v2"
BUILD_INPUT_CLOSURE_SCHEMA = "aexos.os-rooted-launcher-build-input-closure/v2"
HOST_CLOSURE_MODE = "HOST_INPUT_CLOSURE"
REPRODUCED_CLOSURE_MODE = "REPRODUCED_INPUT_CLOSURE"  // B2P2 only
```

B2P1B0P owns build-input closure and governed-lane readiness only. It does not
create launcher source, execute candidate JavaScript, publish a production
manifest, certify a release tuple, change a package allowlist or emit a passing
launcher receipt. B2P2 must independently reconstruct the same closure; it is
never an upstream source of B0P inputs.

## Exact Approved Inputs

| Evidence | Tuple | Embedded Node | Authority |
|---|---|---:|---|
| `HOST_TEST` | `win32-x64-none-node-v24.15.0` | `24.15.0` | Existing B2P1 compatibility evidence only; never a release closure/input |
| `RELEASE` | `win32-x64-none-node-v24.19.0` | `24.19.0` | B0P materializes; B2P2 independently reproduces/certifies |
| `RELEASE` | `linux-x64-glibc-node-v24.19.0` | `24.19.0` | B0P materializes; B2P2 independently reproduces/certifies |
| `RELEASE` | `darwin-arm64-none-node-v24.19.0` | `24.19.0` | B0P materializes; B2P2 independently reproduces/certifies |

Every RELEASE tuple binds annotated tag object
`1dbab0e88e7ccc6b44c801418911767447796ed0`, dereferenced commit
`cdc1b38d40cb567b7ad0b39c86addf830a0af0ae`, official archive
`node-v24.19.0.tar.gz`, `112888473` bytes, SHA-256
`16fe258006a6e86844fbe05b3b5e1e5623ca8d3da54e32d98d9e83234bf25b01`
and embedder ABI
`node-cxx-embedder/v24.19.0@cdc1b38d40cb567b7ad0b39c86addf830a0af0ae;NODE_MODULE_VERSION=137`.

| Platform | Approved immutable lane/toolchain semantic pins |
|---|---|
| Windows | runner `win22/20260818.277`, image `20260818.277.1`, Windows Server `10.0.20348.5499`; VS Build Tools `17.14.39` build `17.14.37614.0`, bootstrap `https://download.visualstudio.microsoft.com/download/pr/fa619120-9c0e-47e6-bfe0-3ee96fb671b2/236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29/vs_BuildTools.exe`, `4473936` bytes/SHA-256 `236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29`; components `Microsoft.VisualStudio.Workload.NativeDesktop`, `Microsoft.VisualStudio.Component.VC.Llvm.Clang`, `Microsoft.VisualStudio.Component.VC.Llvm.ClangToolset`, `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`; LLVM/ClangCL `20.1.8`; Windows SDK `10.0.26100.0` |
| Linux | runner `ubuntu24/20260816.277`, image `20260816.277.1`, Ubuntu `24.04.4 LTS`, kernel `6.17.0-1022-azure`; GCC/G++ `13.3.0`, binutils `2.42-4ubuntu2.10`, Make `4.3-4.1build2`, Python `3.12.3`, glibc `2.39`; exact `.deb` closure is observed output |
| macOS | runner `macos-15-arm64/20260727.0256`, image `20260727.0256.1`, macOS `15.7.7 (24G720)`, Darwin `24.6.0`; Xcode `16.4 (16F6)` at `/Applications/Xcode_16.4.app`, Apple LLVM `17.0.0`, SDK `macosx15.5`, deployment target `13.5`; authenticated Xcode archive identity is observed output |

The seven canonical one-line UTF-8/no-BOM/no-terminator policies are fixed:

| Policy | Bytes | SHA-256 |
|---|---:|---|
| lane | 232 | `756afdbfee26dbd7cb8ec39d2289eeb5b19b5f245bf4411255a058ac6aa549fd` |
| layout | 268 | `611467fe4edd8b5f9c830d717796755b2ded157e5d2c174aa117fe8d4bd4f4b2` |
| selector | 265 | `6b6a618dc64800cf4a4801723c2e4c1bd94e0d76b4ef05ea0ff0c58e886d1b5d` |
| activation lock | 220 | `d0fd3507e1de57b44d0371fd50fd9ffaf01f2bda6bd86e84ee480bb55137b26f` |
| installer principal | 139 | `82e1b42af04cda7d0d55139edb045bd4328654ba03313dfcd8cba8febc50fcb8` |
| runtime principal | 241 | `9d6cde9cf73a12797228befdef1c2eb0c66f004a36bba6b147a7911bb9c0f0be` |
| recipe policy | 285 | `2aa76bf4b6a1553de8ba9d782a2463e6b100272323e75fb48046f22bd280e525` |

Their exact canonical bytes are:

```text
aexos.b0p-lane/v1|win=win22/20260818.277@20260818.277.1|linux=ubuntu24/20260816.277@20260816.277.1|darwin=macos-15-arm64/20260727.0256@20260727.0256.1|network=acquire-only|build=offline|certify=elevated-installer-to-restricted-child
aexos.layout/v1|win32=FOLDERID_ProgramFiles::AEXOS\\NativeCapability|linux=/opt/aexos/native-capability|darwin=/Library/Application Support/AEXOS/NativeCapability|version=5.3.0|tuple=<platform>-<arch>-<libc>-node-v24.19.0|leaf=bin/aexos_native_trust_root[.exe],package
aexos.selector/v1|path=active/aexos_native_trust_root[.exe]|kind=sole-same-volume-hardlink|target=versions/5.3.0/<tuple>/bin/aexos_native_trust_root[.exe]|switch=atomic-replace|identity=running==selector==canonical|flush=required|rollback=previous-verified-identity
aexos.activation-lock/v1|path=locks/activation.lock|bytes=00|range=[0,1)|runtime=shared-nonblocking-before-selector-through-root-close|installer=exclusive-nonblocking-through-verify-switch-flush-cleanup|identity=retained
aexos.installer-principal/v1|win32-owner=S-1-5-32-544|linux-owner-uid=0|darwin-owner-uid=0|controller=elevated|runtime-owner-different=true
aexos.runtime-principal/v1|win32=restricted-token,medium-integrity,administrators-deny-only,forbidden-privileges-disabled|linux=setgroups-setresgid-setresuid,uid-not-0,no-capabilities|darwin=setgroups-setgid-setuid,uid-not-0|root-write=false
aexos.embedder-recipe/v1|encoding=utf-8-lf|format=canonical-json|argv=ordered-expanded-arrays|environment=empty-allowlist|response-files=forbidden|network=forbidden-after-acquisition|node-source=unmodified-v24.19.0@cdc1b38d40cb567b7ad0b39c86addf830a0af0ae|output=single-static-launcher
```

## Acceptance Criteria

### AC1 — Dependency, ownership and no-credit boundary are exact

1. B2P1 remains independently `Done` with persisted Architecture/QA `PASS`; B0P does not edit, reopen, re-credit or promote its source, receipts or gates.
2. `@devops` owns only exact launcher build inputs, policy hashes and disposable governed lane readiness. AEXOS remains the sole control plane.
3. No B0P closure or controller evidence is launcher PASS, runtime authority, package/release allowlist authority or B2 activation authority.
4. B0P can unblock only B2P1B0 after fresh independent Architecture, PO and QA acceptance.

### AC2 — One strict canonical closure exists per exact launcher tuple

1. Each RELEASE closure uses `aexos.os-rooted-launcher-build-input-closure/v2` with exact ordered top-level keys `schemaVersion,mode,sourceRevision,packageVersion,launcherTupleId,approvedInputs,generatedOutputs,closureSha256,result`.
2. B0P mode is exactly `HOST_INPUT_CLOSURE`; B2P2 alone emits a separate `REPRODUCED_INPUT_CLOSURE`. B0P produces closures only for the three Node 24.19.0 RELEASE tuples. The win32 Node 24.15.0 HOST_TEST row remains existing B2P1 evidence and is never a release closure/input.
3. `approvedInputs` has exact ordered keys `embeddedNode,lane,toolchain,policies`; `generatedOutputs` has exact ordered keys `buildRecipe,toolchainFiles,expandedFlags,archives,objects,runtimeImports,systemLibraries,elevatedLane`.
4. `closureSha256` is lowercase SHA-256 over canonical UTF-8 bytes from `schemaVersion` through `generatedOutputs`; `result: "PASS"` requires exact approved-pin equality, all generated outputs, byte-identical offline double builds and successful elevated-to-restricted preflight. Missing, failed, partial or stale closures block B0.

### AC3 — Static Node embedder closure is complete and self-contained

1. Approved `embeddedNode` binds Node 24.19.0, exact annotated tag object, dereferenced commit, archive name/bytes/SHA and NMV 137 embedder ABI listed above. Any other patch/commit is a distinct, unapproved tuple.
2. Approved lane/toolchain records bind the exact immutable release/image/OS and compiler/linker/SDK/runtime semantic IDs above, plus the vendor URL/hash where published. Moving labels, PATH discovery, environment values, `Release/node.lib` or downstream P2 output are not inputs.
3. Approved `policies` binds all seven exact byte-count/SHA pairs. No generated tool path/hash, archive/object/import/library or concrete lane identity may be invented as an approved prerequisite.
4. Two independent builds run offline after acquisition in the same exact pinned lane and approved inputs; their complete observed closure and output hashes must match. The launcher closure is self-contained; addon `node.lib`, shipped `node.dll`/`libnode`, Node child process, dynamic resolver or second AEXOS runtime binary is fatal.

### AC4 — Generated observed outputs are complete, exact and fail closed

1. `buildRecipe` has exact `path,bytes,sha256`; path-ordered `toolchainFiles` records exact `role,path,bytes,sha256,versionOutput` for compiler/linker/librarian, SDK headers/libraries, C/C++ runtimes and every acquired archive/package.
2. `expandedFlags` binds exact ordered compile/link/define argv arrays and hashes; response files, ambient flags, PATH-selected tools and undeclared libraries deny. Every command is recorded as an ordered argv array after egress is disabled.
3. Ordered `archives`/`objects` bind positive sizes, bytes/hashes and complete member/symbol inventories. `runtimeImports` binds inventory/allowlist hashes with `forbiddenCount=0`; `systemLibraries` observes exact normalized names, identities, versions, bytes/hashes and allows only selected-OS-image libraries.
4. `elevatedLane` observes exact lane/image/controller/principal/oracle identities and readiness. Missing, empty, duplicate, unmeasured, changed or double-build-divergent output is FAIL. Accepted observed values become immutable B0 inputs; B2P2 later independently reproduces/certifies them. Provenance remains 4 JS + 3 binaries + manifest v4 + 4 receipts.

### AC5 — Layout, selector and activation-lock policies are exact

1. Approved policy bytes/hashes exactly equal the seven-row table above. Layout policy binds `<install-root>/active/aexos_native_trust_root[.exe]`, `locks/activation.lock`, and `versions/5.3.0/<launcherTupleId>/{bin/aexos_native_trust_root[.exe],package/<exact AEXOS package root>}`.
2. Windows install root uses the `FOLDERID_ProgramFiles` known-folder object plus `AEXOS\NativeCapability`; Linux and macOS use the exact spec roots. No environment, registry, caller string or manifest selects the root/version/tuple.
3. Selector policy requires the sole permitted duplicate identity: a hardlink from `active` to exact canonical launcher, switched through the platform-specific temporary-hardlink/atomic-rename/flush transaction for fresh install, upgrade and rollback; no delete-first, copy, symlink, in-place repair or cross-volume ambiguity.
4. `activation.lock` is installer-created, regular/non-link, exact one byte `0x00`; runtime shared and installer exclusive nonblocking lock flags/range/identity and post-root-close release order are bound exactly per OS.
5. The selector transaction uses exactly one same-directory temporary hardlink
   `.aexos_native_trust_root.next.<32-lowercase-hex-nonce>` and one platform
   switch: Windows `CreateHardLinkW` then handle-relative
   `SetFileInformationByHandle(FileRenameInfoEx)` with
   `FILE_RENAME_FLAG_REPLACE_IF_EXISTS | FILE_RENAME_FLAG_POSIX_SEMANTICS`,
   plus successful `FlushFileBuffers` before linking and after reopening the
   selected image; Linux descriptor-relative `linkat(...,0)` then raw
   `renameat2(...,0)`, followed by `fsync` of reopened selector and `active`
   directory; macOS descriptor-relative `linkat(...,0)` then `renameat(...,0)`,
   followed by `fsync` plus `fcntl(F_FULLFSYNC)` on the reopened selector and
   `fsync` of `active`. Rollback repeats this exact transaction to a previously
   verified immutable version.
6. Windows runtime lock is exactly `GENERIC_READ | FILE_READ_ATTRIBUTES |
   SYNCHRONIZE`, `FILE_SHARE_READ`, `OPEN_EXISTING`,
   `FILE_FLAG_OPEN_REPARSE_POINT` plus `LockFileEx` over `[0,1)` with
   `LOCKFILE_FAIL_IMMEDIATELY`; installer adds exclusive lock and no sharing.
   Linux/macOS runtime uses `O_RDONLY | O_NOFOLLOW | O_CLOEXEC` with
   `flock(LOCK_SH | LOCK_NB)` and installer uses `O_RDWR | O_NOFOLLOW |
   O_CLOEXEC` with `flock(LOCK_EX | LOCK_NB)`.

### AC6 — Elevated controller creates only a restricted child lane

1. Generated `elevatedLane` has exact ordered keys `laneId,runnerImageVersion,controllerSourceSha256,controllerBinarySha256,installerPrincipalId,runtimePrincipalId,installerPrincipalPolicySha256,runtimeTokenPolicySha256,provisioningOracleSha256,ready`; concrete runtime SID or UID/GID is observed, differs from fixed owner and has no mutation/bypass authority. Controller is test-only and never packed/runtime TCB.
2. Windows controller uses the exact installer principal, native token/process APIs, protected root/DACL, `CreateRestrictedToken(DISABLE_MAX_PRIVILEGE | LUA_TOKEN)`, admin SIDs deny-only, Medium integrity and `CreateProcessAsUserW`.
3. Linux uses `setgroups` → `setresgid` → `setresuid`; macOS uses `setgroups(0,NULL)` → `setgid` → `setuid`. Restricted child verifies real/effective/saved IDs and absence of filesystem-bypass capabilities.
4. The child differs from installer ownership and has zero root write/delete/ACL/owner rights or forbidden privileges. Controller supplies no candidate JS, authority callback, environment value, IPC token or receipt.

### AC7 — Canonical B0 receipt policy and denominators are readiness inputs only

1. B0P pins/verifies the downstream launcher receipt policy `aexos.os-rooted-launcher-host-receipt/v1`, exact ordered fields and source-bound evidence-ID preimage from spec §10.4; B0P emits no such PASS receipt.
2. The negative cell-set SHA-256 is exactly `b055ce60d9aab131c096f6c26388f85847e8c756987615983eb460238d748326`; policy requires `cellDenominator=53`, `cellPassCount=53`, `cellFailCount=0`, `cellSkipCount=0`.
3. Policy requires `lifecycleDenominator=3`, exact order `fresh-install,upgrade,rollback`, exact scenario key order and every selector/lock/root/Node/root-admission create/claim/close/release count equal `1`.
4. No-egress policy has the exact nine ordered counters and all are `0`; unknown fields, skipped/duplicate scenarios or denominator drift cannot become launcher PASS. B0 alone executes and owns that host receipt.
5. Receipt top-level order is exactly
   `schemaVersion,mode,launcherHostEvidenceId,sourceRevision,packageVersion,capabilityVersion,rootAdmissionAbiVersion,launcherTupleId,embeddedNodeVersion,embeddedNodeSourceCommit,embeddedNodeSourceSha256,launcherBuildInputClosureSha256,launcherBuildRecipeSha256,launcherStaticArchiveSetSha256,launcherObjectSetSha256,launcherSourceSha256,launcherBinarySha256,launcherBytes,launcherRuntimeImportInventorySha256,launcherToolchainId,layoutPolicySha256,selectorPolicySha256,activationLockPolicySha256,host,installRootIdentitySha256,selectorIdentitySha256,activationLockIdentitySha256,pairManifestSha256,jsTcbSetSha256,bootstrapSha256,targetSha256,elevatedControllerSha256,securityOracleSha256,cellSetSha256,cellDenominator,cellPassCount,cellFailCount,cellSkipCount,lifecycleDenominator,positiveLifecycle,noEgress,result`.
6. Each lifecycle object has exact order
   `scenario,selectorActivationCount,activationLockAcquireCount,rootProofCount,nodeStartCount,rootAdmissionCreateCount,rootAdmissionClaimCount,rootAdmissionCloseCount,activationLockReleaseCount`;
   `noEgress` has exact order
   `networkCount,socketCount,shellCount,subprocessCount,downloadCount,compilerCount,registryReadCount,projectContentReadCount,arbitraryEnvironmentReadCount`.
7. `launcherHostEvidenceId` preimage order is exactly
   `schemaVersion,sourceRevision,packageVersion,capabilityVersion,rootAdmissionAbiVersion,launcherTupleId,embeddedNodeVersion,embeddedNodeSourceCommit,embeddedNodeSourceSha256,launcherBuildInputClosureSha256,launcherBuildRecipeSha256,launcherStaticArchiveSetSha256,launcherObjectSetSha256,launcherSourceSha256,launcherBinarySha256,launcherRuntimeImportInventorySha256,launcherToolchainId,layoutPolicySha256,selectorPolicySha256,activationLockPolicySha256,host,securityOracleSha256,cellSetSha256`;
   paths, runtime object identities, counters, timestamps and `result` are
   excluded.

### AC8 — Independent gates hand off only complete readiness to B0

1. `@architect` accepts the self-contained static Node design, exact v4/trust-root policy, layout/selector/lock transactions and absence of dynamic/fallback authority.
2. `@po` accepts dependency/ownership, exact immutable tuple inputs, no-invention boundary and no launcher/release/B2 authority.
3. `@qa` accepts closure verification, elevated/restricted lane preflight, receipt-policy/53+3 readiness, package/no-egress boundary and unchanged AEXOS behavior.
4. B0P becomes `Done` only when every named host-tuple closure and governed lane preflight passes; the only handoff is an accepted closure to B0. B1/P2/B2 remain blocked.

## Tasks / Subtasks

- [ ] **T1 — Validate approved immutable inputs (`@devops`, `@architect`, `@po`)** (AC1–AC3)
  - [ ] Verify the exact Node 24.19.0 tag/commit/archive/NMV, three RELEASE lanes/toolchain semantics and seven policy byte/hash pairs; keep Node 24.15.0 HOST_TEST non-release.
- [ ] **T2 — Implement canonical closure provisioning (`@devops`)** (AC2, AC3)
  - [ ] Emit strict v2 `approvedInputs`/`generatedOutputs` closure and sidecar for each RELEASE tuple; reject every legacy schema and every missing/stale/partial input.
- [ ] **T3 — Observe two independent offline static builds (`@devops`)** (AC3, AC4)
  - [ ] Acquire only in the pinned lane, disable egress, execute two independent builds and bind exact recipe/tool files/argv/archives/objects/symbols/imports/system libraries/lane identities; reject divergence, addon import libraries and dynamic runtime discovery.
- [ ] **T4 — Pin layout/selector/activation-lock policies (`@devops`, `@architect`)** (AC5)
  - [ ] Hash exact platform layouts, atomic selector transactions, flushes, rollback and shared/exclusive lock contracts.
- [ ] **T5 — Provision governed elevated-controller/restricted-child lane (`@devops`)** (AC6)
  - [ ] Build the native test-only controller, observe exact runner/controller/principal/oracle identities, create the protected root and prove the restricted runtime token/UID/GID/capability boundary.
- [ ] **T6 — Validate launcher receipt policy readiness (`@devops`, `@qa`)** (AC7)
  - [ ] Fix schema/preimage, cell-set hash, exact 53+3 denominators/counters and zero-egress policy without emitting launcher PASS.
- [ ] **T7 — Run independent Architecture, Product and QA gates (`@architect`, `@po`, `@qa`)** (AC1–AC8)
  - [ ] Record that only B0 is unblocked and no host/release/B2 credit follows.
- [ ] **T8 — Run CodeRabbit before review (`@devops`)** (AC1–AC8)
  - [ ] Run configured uncommitted review, resolve CRITICAL/HIGH or record truthful degradation without claiming automated PASS.

## Planned Source Tree

```text
scripts/native/
  provision-trust-root-launcher-inputs-host.js
  verify-trust-root-launcher-inputs-host.js

tests/fixtures/knowledge/atomic-no-replace/
  trust-root-lane-controller/                      # native test-only source

tests/core/knowledge/atomic-no-replace/
  launcher-build-input-closure.test.js
  launcher-static-embedder-closure.test.js
  launcher-layout-selector-lock-policy.test.js
  launcher-elevated-lane.test.js
  launcher-receipt-policy-readiness.test.js
  launcher-inputs-no-egress-package.test.js

artifacts/b2p-launcher-inputs-host-local/<closureSha256>/
  launcher-build-input-closure.json
  launcher-build-input-closure.json.sha256
  controller/                                      # fixture/oracle; never packed
```

## Testing Commands and Evidence

```powershell
npm ci --ignore-scripts
node scripts/native/provision-trust-root-launcher-inputs-host.js
node scripts/native/verify-trust-root-launcher-inputs-host.js
npx --no-install jest tests/core/knowledge/atomic-no-replace --runInBand
npm run lint
npm run typecheck
npm test
npm run sync:ide:check
npm run validate:parity
npm run validate:codex-sync
npm run validate:codex-integration
npm pack --dry-run --json --ignore-scripts
```

Evidence binds exact approvedInputs and generatedOutputs: Node source/archive/
ABI, lane/toolchain semantic pins, seven policy bytes/hashes, observed recipe,
toolchain files/version output, expanded argv, archive/object/member/symbol/
import/system-library inventories, controller/principal/oracle identities,
offline double-build equality and lane readiness. Missing/skipped/ambiguous or
divergent output and insufficient elevation fail; they never become a launcher
receipt.

## Dev Notes

- B0P resolves the preserved B0 0.1.2 blockers without moving launcher source,
  host proof or release authority into DevOps.
- Spec v3.1 fixes approved immutable inputs; recipe/tool-file/flag/archive/
  object/import/library/lane identities remain generated observations and must
  not be invented before execution.
- `accumulated-context.md` is absent; coherence comes from Epic, spec v3.1,
  ADR, Architecture, QA Plan, Threat Model and predecessor stories.

## Negative Scope

- No B2P1 source/test/receipt/gate/status edit or inherited PASS.
- No launcher/bootstrap/target source or build; no candidate JavaScript/addon execution.
- No Node 24.15.0 release input/closure and no Node patch/commit other than the approved 24.19.0 RELEASE identity.
- No launcher PASS receipt, host cell execution, release manifest, allowlist, signing, packaging, publishing or deployment.
- No Node addon `node.lib`, dynamic loader/resolver, shipped Node runtime, child Node process or environment/runtime discovery.
- No approximate/floating toolchain, source archive, flags, archive/object/symbol/import inventory or system library.
- No public installer or production activation; elevated controller is disposable test-only and excluded from runtime/package.
- No privileged runtime child, authority-bearing callback/env/IPC/receipt or reduced 53+3 denominator.
- No B1/P2/B2 implementation/state change, commit, push, PR, registry/package or Git mutation.

## Normative References

- [Native Capability Spec v3.1 §§1, 7.P, 7.1, 10.3–10.4, 11–12](AEX.11B2P-NATIVE-CAPABILITY-SPEC.md)
- [QA Plan G7.1.1](QA-RELEASE-PLAN.md)
- [ADR-AEX-012](adr/ADR-AEX-012-ATOMIC-NO-REPLACE-PROMOTION.md)
- [Architecture](ARCHITECTURE.md)
- [Threat Model](THREAT-MODEL.md)
- [B2P1 target story](STORY-AEX.11B2P1-NATIVE-NO-REPLACE-HOST-CAPABILITY.md)
- [B2P1B0 launcher story](STORY-AEX.11B2P1B0-OS-ROOTED-PRE-JS-LAUNCHER.md)

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type:** DevOps / supply-chain security  
**Secondary Types:** Native build closure, OS privilege boundary, release readiness  
**Complexity:** Critical — tuple-exact embedder provenance and elevated-to-restricted lane.

### Specialized Agent Assignment

**Primary:** `@devops`  
**Mandatory Pre-Commit Reviewer:** `@dev` — review only, with no executor,
elevation or protected-root mutation authority  
**Independent Gates:** `@architect`, `@po`, `@qa`  
**Implementation support:** none outside returned, owner-approved defects

### Quality Gate Tasks

- [ ] Pre-Commit (`@dev` review of `@devops`-owned changes): closure/controller tests, CodeRabbit, lint/typecheck/full tests and pack inspection.
- [ ] Pre-PR: only after Architecture/PO/QA acceptance and separate authorization.
- [ ] Pre-Deployment: not applicable; B0P cannot deploy or certify a launcher.

### Self-Healing Configuration

`@devops` runs check/report-only for privileged or protected work; no automatic
mutation may change tuple pins, policy hashes, identities, denominators or
authority. CRITICAL/HIGH findings block handoff.

### CodeRabbit Focus Areas

- Canonical closure v2 approved/generated boundary and complete static Node/V8/archive/object/symbol closure from two offline builds.
- Rejection of addon import library, dynamic resolution and implicit inputs.
- Exact layout/selector/activation-lock policies and policy hashes.
- Native elevated-controller to restricted-child token/UID/GID boundary.
- Receipt-policy readiness with exact 53+3, zero egress and no launcher PASS.

## Story Draft Checklist

| Category | Status | Issues |
|---|---|---|
| Goal & Context | PASS | Build-input/lane readiness and no-launcher-PASS boundary are explicit. |
| Technical Guidance | PASS | Closure v2 approved/generated boundary, embedder pins, observed outputs, policies and restricted lane are exact. |
| References | PASS | Spec v3.1, QA, ADR, Architecture and Threat Model are linked. |
| Testing | PASS | Closure, controller, policy, 53+3, package and no-egress checks are measurable. |
| CodeRabbit | PASS | DevOps ownership, independent gates and protected-work limits are complete. |
| Dependency & Provenance | PASS | P1 Done/PASS is preserved; B0 alone is unblocked; 4+3+1+4 remains unchanged. |
| Template Completeness | PASS | Eight ACs/tasks, source tree, commands, notes, negative scope and records exist. |
| Readiness | PASS | Approved inputs are fixed without invention; generated observations, double-build equality and fresh independent gates are measurable implementation work. |

**Validation result:** GO (9.8/10). Ready for `@devops` implementation. Spec
v3.1 resolves the historical approved-input NO-GO by fixing exact tuples, Node
source/embedder identity, official lanes/toolchain semantics and seven policy
byte/hash pairs. Generated outputs must still be observed through two
independent offline builds and cannot be invented or pre-credited. No launcher
PASS, downstream or release credit is granted.

## Change Log

| Date | Version | Description | Author |
|---|---:|---|---|
| 2026-08-20 | 0.1.0 | Created from breaking spec v3.0 as the DevOps-owned static embedder build-input closure and governed elevated-lane readiness gate. Status Draft; no launcher PASS, release or B2 authority. | @sm (Chronos) |
| 2026-08-20 | 0.1.1 | Independent Product Owner validation NO-GO (6.4/10): preserved Draft because exact tuple/source/embedder/recipe/toolchain/flags/archive/object/import/system-library/principal/policy pins remain absent and cannot be selected by the executor without invention. Mechanically completed exact selector/flush/lock and launcher-receipt order/counter wording plus mandatory `@dev` Pre-Commit review. B0/B1/P2/B2 remain blocked and no launcher/release credit is granted. | @po (Themis) |
| 2026-08-20 | 0.2.0 | Synchronized Draft to spec v3.1: closure v2 separates fixed `approvedInputs` from measured `generatedOutputs`; pins Node 24.19.0 RELEASE identity, three immutable lanes/toolchain semantics and seven policy byte/hash pairs; preserves Node 24.15.0 as HOST_TEST-only; requires two independent offline builds and fresh gates. Historical NO-GO preserved; no launcher PASS or release credit. | @sm (Chronos) |
| 2026-08-20 | 0.2.1 | Independent Product Owner validation GO (9.8/10) — Status: Draft → Ready. Exact approved inputs are self-contained; generated outputs remain measured double-build evidence; only B2P1B0 may follow after fresh gates, with no launcher PASS, release or downstream credit. | @po (Themis) |
| 2026-08-20 | 0.3.0 | DevOps execution started (Ready → InProgress). Local/read-only lane discovery found no exact pinned Windows, Linux or macOS execution lane and no self-hosted runner; provisioning therefore fails closed before acquisition/build/elevation. B2P1 remains untouched and Done; no closure PASS, gate credit or B0 unblock is claimed. | @devops (Polaris) |

## Dev Agent Record

### Agent Model Used

Codex GPT-5 (Polaris / `@devops`).

### Debug Log References

- `artifacts/b2p-launcher-inputs-host-local/blockers/b0p-lane-readiness-blocker.json`
- `artifacts/b2p-launcher-inputs-host-local/blockers/b0p-lane-readiness-blocker.json.sha256`
- `artifacts/b2p-launcher-inputs-host-local/blockers/b0p-remote-lane-probe.json`
- `artifacts/b2p-launcher-inputs-host-local/blockers/b0p-remote-lane-probe.json.sha256`

### Completion Notes List

- Implemented a deterministic, fail-closed B0P lane preflight and strict closure verifier without producing a partial or synthetic closure.
- Verified the seven policy byte/hash pairs and exact three RELEASE tuples from spec v3.1; Node 24.15.0 remains HOST_TEST-only.
- Current host is Windows `10.0.26200`, Node `24.15.0`, medium integrity; Docker exposes only a non-pinned Linux/WSL kernel, no Darwin arm64 lane exists, and the repository has no self-hosted runner.
- The configured GitHub-hosted labels cannot select the historical asserted image snapshots, and no B0P workflow exists on the remote default branch. Remote workflow mutation, push and invented elevation were prohibited.
- T2–T8 remain incomplete. No generatedOutputs, offline double-build equality, elevated-controller/restricted-child positive proof, closure PASS or independent gate credit exists.
- CodeRabbit degraded truthfully: configured WSL command returned `WSL_E_DISTRO_NOT_FOUND` because the required Ubuntu distribution is absent; no automated-review PASS is claimed and T8 remains unchecked.
- Authorized remote preflight workflow run `32371422672` proved the exact macOS arm64 lane and, from attempt 2, the exact Ubuntu 24 lane. Three independent Windows allocations remained on image `20260802.262.1` / build `5386`, not the required `20260818.277.1` / build `5499`; the provider rollout is therefore still fail-closed. The organization exposes no self-hosted runner or custom hosted-runner API and no configured Azure/AWS/GCP provisioning credential is available.

### File List

- `scripts/native/provision-trust-root-launcher-inputs-host.js`
- `scripts/native/verify-trust-root-launcher-inputs-host.js`
- `tests/core/knowledge/atomic-no-replace/launcher-build-input-closure.test.js`
- `tests/core/knowledge/atomic-no-replace/launcher-static-embedder-closure.test.js`
- `tests/core/knowledge/atomic-no-replace/launcher-layout-selector-lock-policy.test.js`
- `tests/core/knowledge/atomic-no-replace/launcher-elevated-lane.test.js`
- `tests/core/knowledge/atomic-no-replace/launcher-receipt-policy-readiness.test.js`
- `tests/core/knowledge/atomic-no-replace/launcher-inputs-no-egress-package.test.js`
- `artifacts/b2p-launcher-inputs-host-local/blockers/b0p-lane-readiness-blocker.json`
- `artifacts/b2p-launcher-inputs-host-local/blockers/b0p-lane-readiness-blocker.json.sha256`
- `artifacts/b2p-launcher-inputs-host-local/blockers/b0p-remote-lane-probe.json`
- `artifacts/b2p-launcher-inputs-host-local/blockers/b0p-remote-lane-probe.json.sha256`
- `.github/workflows/b0p-exact-lane-probe.yml`

## QA Results

_No launcher PASS or inherited gate credit. To be completed independently by `@qa` after Architecture and Product acceptance._
