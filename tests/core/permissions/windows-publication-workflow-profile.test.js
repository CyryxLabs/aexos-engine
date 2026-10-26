'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const nativeDescribe = process.platform === 'win32' && os.release() === '10.0.26300' ? describe : describe.skip;
const sourceRoot = path.resolve(__dirname, '../../../.aexos-core/core/permissions');
const pwsh = 'C:\\Users\\ppetr\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe';
const HEX = 'a'.repeat(64);

function clone(value) { return structuredClone(value); }
function mutate(value, change) { const copy = clone(value); change(copy); return copy; }

function slot(directory, id) {
  return {
    id,
    endpoint: `aexos-finite-${String(id).repeat(32)}`,
    enrollmentFile: path.join(directory, `enrollment-${id}.json`),
    root: path.join(directory, `project-${id}`),
    rootIdentity: `7:0:${id}`,
    target: 'app.cjs',
    operation: 'guarded-recoverable-replace',
    expectedBefore: { identity: `8:0:${id}`, sha256: String(id + 2).repeat(64) },
    contentBase64: Buffer.from(`case-${id}`).toString('base64'),
    authority: { agentId: 'dev', task: 'dev-develop-story', story: 'FIXTURE-1' },
    budgetCeilingUsd: 1,
    budgetScopeHash: String(id + 4).repeat(64),
    controlRoot: path.join(directory, `control-${id}`),
    controlIdentity: `9:0:${id}`,
  };
}

function workflowManifest(directory) {
  const packageRoot = path.join(directory, 'package');
  const runtimeRoot = path.join(directory, 'runtime');
  const verifierPath = path.join(packageRoot, 'catalog-verifier.exe');
  const runtimePath = path.join(runtimeRoot, 'pwsh.exe');
  const launcherPath = path.join(packageRoot, 'windows-publication-launcher.ps1');
  const wrapperPath = path.join(packageRoot, 'operation-runner.ps1');
  const helperPath = path.join(packageRoot, 'windows-publication-helper.cs');
  return {
    version: 3,
    mode: 'protected-workflow-qualification',
    activationId: 'f'.repeat(32),
    expiryUnixMs: Date.now() + 300_000,
    packageRoot,
    runtimeRoot,
    sink: path.join(packageRoot, 'sink'),
    activationFile: path.join(packageRoot, 'activation.json'),
    operatorSid: 'S-1-5-21-1-2-3-1001',
    runtimePath,
    runtimeSha256: HEX,
    ordinaryRuntimeSha256: 'b'.repeat(64),
    nodeSha256: 'c'.repeat(64),
    launcherPath,
    launcherSha256: 'd'.repeat(64),
    helperSha256: 'e'.repeat(64),
    wrapperPath,
    wrapperSha256: 'f'.repeat(64),
    consoleRole: {
      path: 'C:\\Windows\\System32\\conhost.exe', identity: '1:2:3', sha256: '1'.repeat(64),
      signerThumbprint: '2'.repeat(40), verifierPath, verifierSha256: '3'.repeat(64),
    },
    files: [
      { path: runtimePath, sha256: HEX, length: 1 },
      { path: launcherPath, sha256: 'd'.repeat(64), length: 1 },
      { path: wrapperPath, sha256: 'f'.repeat(64), length: 1 },
      { path: helperPath, sha256: 'e'.repeat(64), length: 1 },
      { path: verifierPath, sha256: '3'.repeat(64), length: 1 },
    ],
    slots: [slot(directory, 1), slot(directory, 2)],
  };
}

function legacyManifest(base) {
  const manifest = clone(base);
  manifest.version = 2;
  manifest.mode = 'protected-qualification';
  for (const item of manifest.slots) item.target = 'target.bin';
  const recovery = clone(manifest.slots[1]);
  recovery.id = 3;
  recovery.endpoint = `aexos-finite-${'3'.repeat(32)}`;
  recovery.enrollmentFile = path.join(path.dirname(recovery.enrollmentFile), 'enrollment-3.json');
  recovery.operation = 'guarded-recover';
  recovery.expectedBefore = null;
  recovery.contentBase64 = null;
  manifest.slots.push(recovery);
  return manifest;
}

function requestFor(manifest, slotIndex = 0) {
  const selected = manifest.slots[slotIndex];
  return {
    protocol: 'aexos-guarded-publication-v1', root: selected.root, operation: selected.operation,
    target: selected.target, contentBase64: selected.contentBase64, expectedBefore: selected.expectedBefore,
    isolatedWorkspace: true, allowAbsentName: true,
    authority: {
      ...selected.authority, leaseId: 'lease-1', intentHash: '6'.repeat(64),
      budgetCeilingUsd: selected.budgetCeilingUsd, budgetScopeHash: selected.budgetScopeHash,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    helperSha256: manifest.helperSha256, launcherSha256: manifest.launcherSha256,
    runtimeIdentity: {
      executableSha256: manifest.runtimeSha256, platform: 'win32', architecture: 'x64',
      release: '10.0.26300', filesystem: 'NTFS', powershellVersion: '7.6.5',
    },
  };
}

nativeDescribe('protected workflow manifest, request and state policy', () => {
  test('actual C# validators and state machine preserve V2 while admitting only bounded V3', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-workflow-profile-'));
    const packageRoot = path.join(directory, 'package');
    const runtimeRoot = path.join(directory, 'runtime');
    fs.mkdirSync(packageRoot);
    fs.mkdirSync(runtimeRoot);
    const base = workflowManifest(directory);
    const legacy = legacyManifest(base);
    const outside = path.join(directory, 'outside');
    const manifestCases = [
      ['validV3', base, null],
      ['oneSlot', mutate(base, (m) => { m.slots = m.slots.slice(0, 1); }), 'TWO_WORKFLOW_SLOTS'],
      ['threeSlots', mutate(base, (m) => { m.slots.push(clone(m.slots[1])); }), 'TWO_WORKFLOW_SLOTS'],
      ['duplicateId', mutate(base, (m) => { m.slots[1].id = 1; }), 'SLOT_ID'],
      ['duplicateRoot', mutate(base, (m) => { m.slots[1].root = m.slots[0].root; }), 'WORKFLOW_SLOT_DISTINCT'],
      ['duplicateRootIdentity', mutate(base, (m) => { m.slots[1].rootIdentity = m.slots[0].rootIdentity; }), 'WORKFLOW_SLOT_DISTINCT'],
      ['duplicateControl', mutate(base, (m) => { m.slots[1].controlRoot = m.slots[0].controlRoot; }), 'WORKFLOW_SLOT_DISTINCT'],
      ['duplicateControlIdentity', mutate(base, (m) => { m.slots[1].controlIdentity = m.slots[0].controlIdentity; }), 'WORKFLOW_SLOT_DISTINCT'],
      ['duplicateBeforeIdentity', mutate(base, (m) => { m.slots[1].expectedBefore.identity = m.slots[0].expectedBefore.identity; }), 'WORKFLOW_SLOT_DISTINCT'],
      ['duplicateEndpoint', mutate(base, (m) => { m.slots[1].endpoint = m.slots[0].endpoint; }), 'ENDPOINT'],
      ['duplicateEnrollment', mutate(base, (m) => { m.slots[1].enrollmentFile = m.slots[0].enrollmentFile; }), 'ENROLLMENT_SCOPE'],
      ['duplicateScope', mutate(base, (m) => { m.slots[1].budgetScopeHash = m.slots[0].budgetScopeHash; }), 'WORKFLOW_SLOT_DISTINCT'],
      ['wrongTarget', mutate(base, (m) => { m.slots[0].target = 'target.bin'; }), 'WORKFLOW_TARGET'],
      ['wrongOperation', mutate(base, (m) => { m.slots[0].operation = 'guarded-recover'; }), 'WORKFLOW_OPERATION'],
      ['wrongAuthority', mutate(base, (m) => { m.slots[0].authority.task = 'finite'; }), 'WORKFLOW_AUTHORITY'],
      ['wrongBudget', mutate(base, (m) => { m.slots[0].budgetCeilingUsd = -1; }), 'BUDGET'],
      ['wrongContent', mutate(base, (m) => { m.slots[0].contentBase64 = 'A'.repeat(8196); }), 'PAYLOAD'],
      ['outsideProtectedMembership', mutate(base, (m) => { m.sink = outside; }), 'PROTECTED_PATH_SCOPE'],
      ['expired', mutate(base, (m) => { m.expiryUnixMs = Date.now() - 1; }), 'ACTIVATION_EXPIRED'],
      ['v3OldMode', mutate(base, (m) => { m.mode = 'protected-qualification'; }), 'PROTECTED_VERSION'],
      ['v2WorkflowMode', mutate(base, (m) => { m.version = 2; }), 'PROTECTED_VERSION'],
      ['validV2', legacy, null],
      ['v2StillThreeSlots', mutate(legacy, (m) => { m.slots.pop(); }), 'THREE_SLOTS'],
      ['v2StillTargetBin', mutate(legacy, (m) => { m.slots[0].target = 'app.cjs'; }), 'BOUNDED_TARGET'],
    ].map(([name, manifest, expected]) => ({ name, manifest, expected }));
    const validRequest = requestFor(base);
    const requestCases = [
      ['validRequest', validRequest, null],
      ['wrongRequestAuthority', mutate(validRequest, (q) => { q.authority.task = 'finite'; }), 'ORIGINAL_AUTHORITY'],
      ['wrongRequestBudget', mutate(validRequest, (q) => { q.authority.budgetCeilingUsd = 2; }), 'BUDGET_BOUND'],
      ['wrongRequestScope', mutate(validRequest, (q) => { q.authority.budgetScopeHash = '9'.repeat(64); }), 'BUDGET_SCOPE_BOUND'],
      ['wrongRequestTarget', mutate(validRequest, (q) => { q.target = 'target.bin'; }), 'REQUEST_SLOT'],
    ].map(([name, request, expected]) => ({ name, manifest: base, slotId: 1, request, expected }));
    fs.writeFileSync(path.join(directory, 'manifest-cases.json'), JSON.stringify(manifestCases));
    fs.writeFileSync(path.join(directory, 'request-cases.json'), JSON.stringify(requestCases));
    const script = path.join(directory, 'validate.ps1');
    const sources = ['windows-publication-protected-transport.cs', 'windows-publication-protected-relay-base.cs',
      'windows-publication-protected-native.cs', 'windows-publication-protected-relay.cs']
      .map((name) => path.join(sourceRoot, name).replaceAll("'", "''"));
    fs.writeFileSync(script, String.raw`
$ErrorActionPreference = 'Stop'
if ([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ORDINARY_ONLY' }
Add-Type -Path @(${sources.map((source) => `'${source}'`).join(',')})
$out = [ordered]@{ accepted=@(); rejected=[ordered]@{}; states=[ordered]@{}; controller=[ordered]@{}; privilegesChanged=$false }
$before = [Aexos.FiniteTransport.ProcessPin]::new([uint32]$PID)
try { $beforeFacts = [ordered]@{ Sid=$before.Sid; TokenId=$before.TokenId; Elevated=$before.Elevated; Privilege=$before.SeSecurityPrivilege } }
finally { $before.Dispose() }
function Reject([string]$name,[string]$expected,[scriptblock]$action) {
  try { & $action; throw "ACCEPTED_$name" }
  catch {
    $message = $_.Exception.GetBaseException().Message
    if ($message -eq "ACCEPTED_$name" -or -not $message.Contains($expected)) { throw "WRONG_REJECTION_$($name):$message" }
    $script:out.rejected[$name] = $message
  }
}
$manifestCases = Get-Content -Raw -LiteralPath '${path.join(directory, 'manifest-cases.json').replaceAll("'", "''")}' | ConvertFrom-Json
foreach ($case in $manifestCases) {
  $raw = $case.manifest | ConvertTo-Json -Compress -Depth 20
  if ($null -eq $case.expected) { [ProtectedRelay]::ValidateManifest($raw); $out.accepted += $case.name }
  else { Reject $case.name $case.expected { [ProtectedRelay]::ValidateManifest($raw) } }
}
$method = [ProtectedRelay].GetMethod('ValidateRequest',[Reflection.BindingFlags]'NonPublic,Static')
$requestCases = Get-Content -Raw -LiteralPath '${path.join(directory, 'request-cases.json').replaceAll("'", "''")}' | ConvertFrom-Json
foreach ($case in $requestCases) {
  $manifestRaw = $case.manifest | ConvertTo-Json -Compress -Depth 20
  [string]$requestRaw = $case.request | ConvertTo-Json -Compress -Depth 20
  $document = [Text.Json.JsonDocument]::Parse($manifestRaw)
  try {
    [Text.Json.JsonElement]$root = $document.RootElement.Clone()
    [Text.Json.JsonElement]$slot = $root.GetProperty('slots')[$case.slotId - 1].Clone()
    $arguments = [object[]]::new(4); $arguments[0] = $requestRaw; $arguments[1] = $root; $arguments[2] = $slot; $arguments[3] = $null
    $action = { $method.Invoke($null,$arguments) | Out-Null }
    if ($null -eq $case.expected) { & $action; $out.accepted += $case.name }
    else { Reject $case.name $case.expected $action }
  } finally { $document.Dispose() }
}
$v3 = [TwoPositiveActivationState]::new(); $v3.Reserve(1); $v3.Finish(1,$true,$false); $v3.Reserve(2); $v3.Finish(2,$true,$false)
$out.states.v3Complete = $v3.Complete
$v3Kill = [TwoPositiveActivationState]::new(); $v3Kill.Reserve(1); $v3Kill.Finish(1,$true,$false); $v3Kill.Reserve(2); $v3Kill.Finish(2,$false,$true)
$out.states.v3KillStopped = $v3Kill.Stopped -and -not $v3Kill.Complete
$firstFailure = [TwoPositiveActivationState]::new(); $firstFailure.Reserve(1); $firstFailure.Finish(1,$false,$false)
$out.states.firstFailureStops = $firstFailure.Stopped -and -not $firstFailure.Complete
$secondFailure = [TwoPositiveActivationState]::new(); $secondFailure.Reserve(1); $secondFailure.Finish(1,$true,$false); $secondFailure.Reserve(2); $secondFailure.Finish(2,$false,$false)
$out.states.secondFailureStops = $secondFailure.Stopped -and -not $secondFailure.Complete
Reject 'slotOrder' 'SLOT_REPLAY_OR_ORDER' { ([TwoPositiveActivationState]::new()).Reserve(2) }
$replay = [TwoPositiveActivationState]::new(); $replay.Reserve(1)
Reject 'slotReplay' 'SLOT_REPLAY_OR_ORDER' { $replay.Reserve(1) }
$legacyGood = [ActivationState]::new(); $legacyGood.Reserve(1); $legacyGood.Finish(1,$true,$false); $legacyGood.Reserve(2); $legacyGood.Finish(2,$false,$true); $legacyGood.Reserve(3); $legacyGood.Finish(3,$true,$false)
$out.states.v2KillRecoveryComplete = $legacyGood.Complete
$legacyNoKill = [ActivationState]::new(); $legacyNoKill.Reserve(1); $legacyNoKill.Finish(1,$true,$false); $legacyNoKill.Reserve(2); $legacyNoKill.Finish(2,$true,$false)
$out.states.v2Slot2KillRequired = $legacyNoKill.Stopped -and -not $legacyNoKill.Complete
$out.states.normalCompletion = [ProtectedCompletion]::Eligible($true,0,2,$true,$true,$true,$true)
function PreventsClosed([bool]$good) { $state = [TwoPositiveActivationState]::new(); $state.Reserve(1); $state.Finish(1,$true,$false); $state.Reserve(2); $state.Finish(2,$good,$false); return $state.Stopped -and -not $state.Complete }
$out.states.falseTerminalPreventsClosed = PreventsClosed ([ProtectedCompletion]::Eligible($false,0,2,$true,$true,$true,$true))
$out.states.activeProcessesPreventClosed = PreventsClosed ([ProtectedCompletion]::Eligible($true,1,2,$true,$true,$true,$true))
$out.states.unknownIoPreventsClosed = PreventsClosed ([ProtectedCompletion]::Eligible($true,0,2,$false,$false,$true,$true))
$ledgerPath = '${path.join(directory, 'ledger').replaceAll("'", "''")}'; [IO.Directory]::CreateDirectory($ledgerPath) | Out-Null
$ledger = [ProtectedLedger]::new($ledgerPath,$true)
try { $ledger.Reserve(1,'one'); $ledger.Finish(1,$true,$false,'one'); $ledger.Reserve(2,'two'); $ledger.Finish(2,$true,$false,'two'); $out.states.ledgerV3Complete = $ledger.State.Complete }
finally { $ledger.Dispose() }
$me = [Aexos.FiniteTransport.ProcessPin]::new([uint32]$PID)
$same = [WorkflowControllerPin]::new()
try { $same.Admit(1,$me); $same.Admit(2,$me); $out.controller.sameA = $true } finally { $same.Dispose() }
$childProcess = Start-Process -FilePath '${pwsh.replaceAll("'", "''")}' -ArgumentList '-NoLogo','-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 20' -PassThru -WindowStyle Hidden
$child = $null
try {
  $child = [Aexos.FiniteTransport.ProcessPin]::new([uint32]$childProcess.Id)
  $wrong = [WorkflowControllerPin]::new()
  try { $wrong.Admit(1,$me); Reject 'replacedController' 'PEER_PIN_MISMATCH' { $wrong.Admit(2,$child) } } finally { $wrong.Dispose() }
  $dead = [WorkflowControllerPin]::new()
  try { $dead.Admit(1,$child); Stop-Process -Id $childProcess.Id -Force; $childProcess.WaitForExit(); Reject 'controllerDeath' 'WORKFLOW_CONTROLLER_A_EXITED' { $dead.Admit(2,$child) } } finally { $dead.Dispose() }
} finally {
  if (-not $childProcess.HasExited) { Stop-Process -Id $childProcess.Id -Force; $childProcess.WaitForExit() }
  if ($null -ne $child) { $child.Dispose() }
  $me.Dispose()
}
$out.controller.replacedRejected = $out.rejected.Contains('replacedController')
$out.controller.deathRejected = $out.rejected.Contains('controllerDeath')
$after = [Aexos.FiniteTransport.ProcessPin]::new([uint32]$PID)
try { $out.privilegesChanged = $after.Sid -ne $beforeFacts.Sid -or $after.TokenId -ne $beforeFacts.TokenId -or $after.Elevated -ne $beforeFacts.Elevated -or $after.SeSecurityPrivilege -ne $beforeFacts.Privilege }
finally { $after.Dispose() }
$out | ConvertTo-Json -Compress -Depth 8
`, 'utf8');
    try {
      const raw = execFileSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], {
        encoding: 'utf8', timeout: 45_000, windowsHide: true,
      }).trim();
      const result = JSON.parse(raw);
      expect(result.accepted).toEqual(expect.arrayContaining(['validV3', 'validV2', 'validRequest']));
      expect(Object.keys(result.rejected)).toHaveLength(manifestCases.filter((item) => item.expected).length
        + requestCases.filter((item) => item.expected).length + 4);
      expect(result.states).toEqual({
        v3Complete: true, v3KillStopped: true, firstFailureStops: true, secondFailureStops: true,
        v2KillRecoveryComplete: true, v2Slot2KillRequired: true, normalCompletion: true,
        falseTerminalPreventsClosed: true, activeProcessesPreventClosed: true,
        unknownIoPreventsClosed: true, ledgerV3Complete: true,
      });
      expect(result.controller).toEqual({ sameA: true, replacedRejected: true, deathRejected: true });
      expect(result.privilegesChanged).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
