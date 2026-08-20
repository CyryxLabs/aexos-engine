'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA_VERSION = 'aexos.os-rooted-launcher-build-input-closure/v2';
const MODE = 'HOST_INPUT_CLOSURE';
const NODE_ARCHIVE_SHA256 =
  '16fe258006a6e86844fbe05b3b5e1e5623ca8d3da54e32d98d9e83234bf25b01';
const LAUNCHER_RECEIPT_POLICY = Object.freeze({
  schemaVersion: 'aexos.os-rooted-launcher-host-receipt/v1',
  negativeCellSetSha256: 'b055ce60d9aab131c096f6c26388f85847e8c756987615983eb460238d748326',
  cellDenominator: 53,
  lifecycleDenominator: 3,
  lifecycleOrder: Object.freeze(['fresh-install', 'upgrade', 'rollback']),
  lifecycleKeys: Object.freeze([
    'scenario',
    'selectorActivationCount',
    'activationLockAcquireCount',
    'rootProofCount',
    'nodeStartCount',
    'rootAdmissionCreateCount',
    'rootAdmissionClaimCount',
    'rootAdmissionCloseCount',
    'activationLockReleaseCount',
  ]),
  noEgressKeys: Object.freeze([
    'networkCount',
    'socketCount',
    'shellCount',
    'subprocessCount',
    'downloadCount',
    'compilerCount',
    'registryReadCount',
    'projectContentReadCount',
    'arbitraryEnvironmentReadCount',
  ]),
});

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  return JSON.stringify(value);
}

const POLICY_ROWS = Object.freeze([
  Object.freeze({
    name: 'lane',
    text: 'aexos.b0p-lane/v1|win=win22/20260818.277@20260818.277.1|linux=ubuntu24/20260816.277@20260816.277.1|darwin=macos-15-arm64/20260727.0256@20260727.0256.1|network=acquire-only|build=offline|certify=elevated-installer-to-restricted-child',
    bytes: 232,
    sha256: '756afdbfee26dbd7cb8ec39d2289eeb5b19b5f245bf4411255a058ac6aa549fd',
  }),
  Object.freeze({
    name: 'layout',
    text: 'aexos.layout/v1|win32=FOLDERID_ProgramFiles::AEXOS\\\\NativeCapability|linux=/opt/aexos/native-capability|darwin=/Library/Application Support/AEXOS/NativeCapability|version=5.3.0|tuple=<platform>-<arch>-<libc>-node-v24.19.0|leaf=bin/aexos_native_trust_root[.exe],package',
    bytes: 268,
    sha256: '611467fe4edd8b5f9c830d717796755b2ded157e5d2c174aa117fe8d4bd4f4b2',
  }),
  Object.freeze({
    name: 'selector',
    text: 'aexos.selector/v1|path=active/aexos_native_trust_root[.exe]|kind=sole-same-volume-hardlink|target=versions/5.3.0/<tuple>/bin/aexos_native_trust_root[.exe]|switch=atomic-replace|identity=running==selector==canonical|flush=required|rollback=previous-verified-identity',
    bytes: 265,
    sha256: '6b6a618dc64800cf4a4801723c2e4c1bd94e0d76b4ef05ea0ff0c58e886d1b5d',
  }),
  Object.freeze({
    name: 'activationLock',
    text: 'aexos.activation-lock/v1|path=locks/activation.lock|bytes=00|range=[0,1)|runtime=shared-nonblocking-before-selector-through-root-close|installer=exclusive-nonblocking-through-verify-switch-flush-cleanup|identity=retained',
    bytes: 220,
    sha256: 'd0fd3507e1de57b44d0371fd50fd9ffaf01f2bda6bd86e84ee480bb55137b26f',
  }),
  Object.freeze({
    name: 'installerPrincipal',
    text: 'aexos.installer-principal/v1|win32-owner=S-1-5-32-544|linux-owner-uid=0|darwin-owner-uid=0|controller=elevated|runtime-owner-different=true',
    bytes: 139,
    sha256: '82e1b42af04cda7d0d55139edb045bd4328654ba03313dfcd8cba8febc50fcb8',
  }),
  Object.freeze({
    name: 'runtimePrincipal',
    text: 'aexos.runtime-principal/v1|win32=restricted-token,medium-integrity,administrators-deny-only,forbidden-privileges-disabled|linux=setgroups-setresgid-setresuid,uid-not-0,no-capabilities|darwin=setgroups-setgid-setuid,uid-not-0|root-write=false',
    bytes: 241,
    sha256: '9d6cde9cf73a12797228befdef1c2eb0c66f004a36bba6b147a7911bb9c0f0be',
  }),
  Object.freeze({
    name: 'recipe',
    text: 'aexos.embedder-recipe/v1|encoding=utf-8-lf|format=canonical-json|argv=ordered-expanded-arrays|environment=empty-allowlist|response-files=forbidden|network=forbidden-after-acquisition|node-source=unmodified-v24.19.0@cdc1b38d40cb567b7ad0b39c86addf830a0af0ae|output=single-static-launcher',
    bytes: 285,
    sha256: '2aa76bf4b6a1553de8ba9d782a2463e6b100272323e75fb48046f22bd280e525',
  }),
]);

const EMBEDDED_NODE = Object.freeze({
  version: '24.19.0',
  annotatedTagObject: '1dbab0e88e7ccc6b44c801418911767447796ed0',
  sourceCommit: 'cdc1b38d40cb567b7ad0b39c86addf830a0af0ae',
  archiveName: 'node-v24.19.0.tar.gz',
  archiveBytes: 112888473,
  archiveSha256: NODE_ARCHIVE_SHA256,
  embedderAbi:
    'node-cxx-embedder/v24.19.0@cdc1b38d40cb567b7ad0b39c86addf830a0af0ae;NODE_MODULE_VERSION=137',
});

const RELEASE_LANES = Object.freeze([
  Object.freeze({
    launcherTupleId: 'win32-x64-none-node-v24.19.0',
    lane: Object.freeze({
      release: 'win22/20260818.277',
      runnerImageVersion: '20260818.277.1',
      os: 'Windows Server 10.0.20348.5499',
    }),
    toolchain: Object.freeze({
      visualStudioVersion: '17.14.39',
      visualStudioBuild: '17.14.37614.0',
      bootstrapUrl:
        'https://download.visualstudio.microsoft.com/download/pr/fa619120-9c0e-47e6-bfe0-3ee96fb671b2/236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29/vs_BuildTools.exe',
      bootstrapBytes: 4473936,
      bootstrapSha256:
        '236367b68ba9a51708263ab10a1c85546cc4a8eca78b365168811d19c4fb2f29',
      components: Object.freeze([
        'Microsoft.VisualStudio.Workload.NativeDesktop',
        'Microsoft.VisualStudio.Component.VC.Llvm.Clang',
        'Microsoft.VisualStudio.Component.VC.Llvm.ClangToolset',
        'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      ]),
      compiler: 'LLVM/ClangCL 20.1.8',
      sdk: 'Windows SDK 10.0.26100.0',
    }),
  }),
  Object.freeze({
    launcherTupleId: 'linux-x64-glibc-node-v24.19.0',
    lane: Object.freeze({
      release: 'ubuntu24/20260816.277',
      runnerImageVersion: '20260816.277.1',
      os: 'Ubuntu 24.04.4 LTS',
      kernel: '6.17.0-1022-azure',
    }),
    toolchain: Object.freeze({
      gcc: '13.3.0',
      gxx: '13.3.0',
      binutils: '2.42-4ubuntu2.10',
      make: '4.3-4.1build2',
      python: '3.12.3',
      glibc: '2.39',
    }),
  }),
  Object.freeze({
    launcherTupleId: 'darwin-arm64-none-node-v24.19.0',
    lane: Object.freeze({
      release: 'macos-15-arm64/20260727.0256',
      runnerImageVersion: '20260727.0256.1',
      os: 'macOS 15.7.7 (24G720)',
      kernel: 'Darwin 24.6.0',
    }),
    toolchain: Object.freeze({
      xcode: '16.4 (16F6)',
      xcodePath: '/Applications/Xcode_16.4.app',
      compiler: 'Apple LLVM 17.0.0',
      sdk: 'macosx15.5',
      deploymentTarget: '13.5',
    }),
  }),
]);

function validateApprovedPolicies() {
  for (const policy of POLICY_ROWS) {
    const bytes = Buffer.from(policy.text, 'utf8');
    if (bytes.length !== policy.bytes || sha256(bytes) !== policy.sha256) {
      throw new Error(`Normative ${policy.name} policy bytes/hash drift`);
    }
  }
  return true;
}

function validateLauncherReceiptPolicy() {
  if (
    LAUNCHER_RECEIPT_POLICY.schemaVersion !==
      'aexos.os-rooted-launcher-host-receipt/v1' ||
    !/^[a-f0-9]{64}$/.test(LAUNCHER_RECEIPT_POLICY.negativeCellSetSha256) ||
    LAUNCHER_RECEIPT_POLICY.cellDenominator !== 53 ||
    LAUNCHER_RECEIPT_POLICY.lifecycleDenominator !== 3 ||
    canonicalJson(LAUNCHER_RECEIPT_POLICY.lifecycleOrder) !==
      canonicalJson(['fresh-install', 'upgrade', 'rollback']) ||
    LAUNCHER_RECEIPT_POLICY.noEgressKeys.length !== 9
  ) {
    throw new Error('Launcher receipt readiness policy drift');
  }
  return true;
}

function observedHost() {
  let osIdentity = {};
  if (process.platform === 'win32') {
    const registryPath = 'C:\\Windows\\System32\\reg.exe';
    const registryKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';
    const query = (valueName) => childProcess.execFileSync(
      registryPath,
      ['query', registryKey, '/v', valueName],
      { encoding: 'utf8', windowsHide: true },
    ).trim().split(/\s{2,}/).at(-1);
    try {
      osIdentity = {
        windowsProductName: query('ProductName'),
        windowsBuild: `10.0.${query('CurrentBuildNumber')}.${Number(query('UBR'))}`,
      };
    } catch (_error) {
      osIdentity = { windowsProductName: '', windowsBuild: '' };
    }
  } else if (process.platform === 'linux') {
    try {
      const release = fs.readFileSync('/etc/os-release', 'utf8');
      const pretty = release.match(/^PRETTY_NAME="?([^"\n]+)"?$/m);
      osIdentity = { linuxPrettyName: pretty ? pretty[1] : '' };
    } catch (_error) {
      osIdentity = { linuxPrettyName: '' };
    }
  } else if (process.platform === 'darwin') {
    const swVers = (argument) => childProcess.execFileSync(
      '/usr/bin/sw_vers',
      [argument],
      { encoding: 'utf8' },
    ).trim();
    try {
      osIdentity = {
        macosProductVersion: swVers('-productVersion'),
        macosBuildVersion: swVers('-buildVersion'),
      };
    } catch (_error) {
      osIdentity = { macosProductVersion: '', macosBuildVersion: '' };
    }
  }
  return Object.freeze({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    osRelease: os.release(),
    osVersion: os.version(),
    runnerOs: process.env.RUNNER_OS || '',
    runnerArch: process.env.RUNNER_ARCH || '',
    imageOs: process.env.ImageOS || '',
    imageVersion: process.env.ImageVersion || '',
    ...osIdentity,
  });
}

function matchingLane(host) {
  if (host.nodeVersion !== '24.19.0') return null;
  if (
    host.platform === 'win32' &&
    host.arch === 'x64' &&
    host.imageOs === 'win22' &&
    host.imageVersion === '20260818.277.1' &&
    host.windowsBuild === '10.0.20348.5499'
  ) {
    return RELEASE_LANES[0];
  }
  if (
    host.platform === 'linux' &&
    host.arch === 'x64' &&
    host.imageOs === 'ubuntu24' &&
    host.imageVersion === '20260816.277.1' &&
    host.osRelease === '6.17.0-1022-azure' &&
    host.linuxPrettyName === 'Ubuntu 24.04.4 LTS'
  ) {
    return RELEASE_LANES[1];
  }
  if (
    host.platform === 'darwin' &&
    host.arch === 'arm64' &&
    host.imageOs === 'macos-15-arm64' &&
    host.imageVersion === '20260727.0256.1' &&
    host.osRelease === '24.6.0' &&
    host.macosProductVersion === '15.7.7' &&
    host.macosBuildVersion === '24G720'
  ) {
    return RELEASE_LANES[2];
  }
  return null;
}

function repositoryRoot() {
  return path.resolve(__dirname, '..', '..');
}

function writeBlockerEvidence(root, host) {
  const evidence = {
    schemaVersion: 'aexos.os-rooted-launcher-build-input-preflight/v1',
    sourceRevision: 'codex/cerberus-knowledge-plane',
    packageVersion: '5.3.0',
    requiredSchemaVersion: SCHEMA_VERSION,
    requiredMode: MODE,
    observedHost: host,
    requiredLauncherTupleIds: RELEASE_LANES.map((row) => row.launcherTupleId),
    availableExactLauncherTupleIds: [],
    missingExactLauncherTupleIds: RELEASE_LANES.map((row) => row.launcherTupleId),
    blockers: [
      'CURRENT_HOST_DOES_NOT_MATCH_ANY_EXACT_RELEASE_LANE',
      'NO_EXACT_LINUX_X64_GLIBC_LANE_CONFIGURED',
      'NO_EXACT_DARWIN_ARM64_LANE_CONFIGURED',
      'NO_GOVERNED_ELEVATED_CONTROLLER_TO_RESTRICTED_CHILD_PROOF',
      'NO_TWO_INDEPENDENT_OFFLINE_BUILDS_PER_RELEASE_TUPLE',
    ],
    generatedOutputsMaterialized: false,
    closurePassEmitted: false,
    launcherPassEmitted: false,
    result: 'BLOCKED',
  };
  const evidencePath = path.join(
    root,
    'artifacts',
    'b2p-launcher-inputs-host-local',
    'blockers',
    'b0p-lane-readiness-blocker.json',
  );
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  const evidenceBytes = Buffer.from(canonicalJson(evidence));
  const sidecarBytes = Buffer.from(`${sha256(evidenceBytes)}\n`);
  fs.writeFileSync(evidencePath, evidenceBytes, { flag: 'w', mode: 0o600 });
  fs.writeFileSync(`${evidencePath}.sha256`, sidecarBytes, { flag: 'w', mode: 0o600 });
  const reopened = fs.readFileSync(evidencePath);
  const reopenedSidecar = fs.readFileSync(`${evidencePath}.sha256`);
  if (!reopened.equals(evidenceBytes) || !reopenedSidecar.equals(sidecarBytes)) {
    throw new Error('B0P blocker evidence reopen verification failed');
  }
  return evidencePath;
}

function provisionHost() {
  if (process.argv.length !== 2) throw new Error('Arguments are not accepted');
  validateApprovedPolicies();
  validateLauncherReceiptPolicy();
  const host = observedHost();
  const lane = matchingLane(host);
  if (!lane) {
    const evidencePath = writeBlockerEvidence(repositoryRoot(), host);
    throw new Error(`B0P exact RELEASE lanes unavailable; evidence: ${evidencePath}`);
  }
  throw new Error(
    `B0P lane ${lane.launcherTupleId} alone is insufficient; all three exact lanes and two offline builds are required`,
  );
}

if (require.main === module) {
  try {
    provisionHost();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  EMBEDDED_NODE,
  LAUNCHER_RECEIPT_POLICY,
  MODE,
  POLICY_ROWS,
  RELEASE_LANES,
  SCHEMA_VERSION,
  canonicalJson,
  matchingLane,
  observedHost,
  provisionHost,
  repositoryRoot,
  sha256,
  validateApprovedPolicies,
  validateLauncherReceiptPolicy,
  writeBlockerEvidence,
});
