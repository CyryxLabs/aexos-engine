'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  SOURCE,
  inspectNativeCandidateIdentity,
} = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/permissions/native-publication-support',
));

const windowsDescribe = process.platform === 'win32' ? describe : describe.skip;
const repositoryRoot = path.resolve(__dirname, '../../..');
const cleanEnvironment = Object.freeze({
  NODE_OPTIONS: '',
  NODE_PATH: '',
  DOTNET_STARTUP_HOOKS: '',
  COR_ENABLE_PROFILING: '',
  CORECLR_ENABLE_PROFILING: '',
});

const probe = String.raw`$ErrorActionPreference='Stop'
$Source=[Environment]::GetEnvironmentVariable('AEXOS_PUBLICATION_HELPER_SOURCE','Process')
if([string]::IsNullOrWhiteSpace($Source)){throw 'SOURCE_REQUIRED'}
$sourceBytes=[IO.File]::ReadAllBytes($Source)
Add-Type -TypeDefinition ([Text.UTF8Encoding]::new($false,$true).GetString($sourceBytes)) -Language CSharp
$flags=[Reflection.BindingFlags]'NonPublic,Public,Static,Instance'
$transactionType=[AexosPublication].GetNestedType('Transaction',$flags)
$effects=$transactionType.GetMethod('Effects',$flags)
$fields=@('Directory','Backup','Staging','Journal','Parked','Recovery','Published')
if($null-eq$effects-or$effects.GetParameters().Count-ne0){throw 'EFFECTS_BINDING'}
function Invoke-Effects([string]$Name,[string[]]$Enabled){
  $transaction=[Activator]::CreateInstance($transactionType,$true)
  foreach($field in $fields){$transactionType.GetField($field,$flags).SetValue($transaction,$Enabled.Contains($field))}
  [pscustomobject]@{name=$Name;effects=$effects.Invoke($transaction,[object[]]::new(0))}
}
$cases=@(
  Invoke-Effects 'all-false' @()
  Invoke-Effects 'directory' @('Directory')
  Invoke-Effects 'backup' @('Backup')
  Invoke-Effects 'staging' @('Staging')
  Invoke-Effects 'journal' @('Journal')
  Invoke-Effects 'parked' @('Parked')
  Invoke-Effects 'recovery' @('Recovery')
  Invoke-Effects 'parked-published' @('Parked','Published')
  Invoke-Effects 'recovery-published' @('Recovery','Published')
)
[pscustomobject]@{compileCount=1;nativeMethodInvocations=0;cases=$cases}|ConvertTo-Json -Depth 10 -Compress
`;

windowsDescribe('Windows publication effect reporting', () => {
  test('reports retained artifacts and original-name absence from every actual transaction state', () => {
    const result = spawnSync(inspectNativeCandidateIdentity().executable, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      probe,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, ...cleanEnvironment, AEXOS_PUBLICATION_HELPER_SOURCE: SOURCE },
      maxBuffer: 256 * 1024,
      timeout: 30_000,
      windowsHide: true,
    });

    expect(result.error).toBeUndefined();
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    const observed = JSON.parse(result.stdout.trim());
    expect(observed).toMatchObject({ compileCount: 1, nativeMethodInvocations: 0 });

    const cases = Object.fromEntries(observed.cases.map(entry => [entry.name, entry.effects]));
    const projection = Object.fromEntries(Object.entries(cases).map(([name, effects]) => [name, {
      retainedArtifactsMayExist: effects.retainedArtifactsMayExist,
      originalNameMayBeAbsent: effects.originalNameMayBeAbsent,
    }]));
    expect(projection).toEqual({
      'all-false': { retainedArtifactsMayExist: false, originalNameMayBeAbsent: false },
      directory: { retainedArtifactsMayExist: true, originalNameMayBeAbsent: false },
      backup: { retainedArtifactsMayExist: true, originalNameMayBeAbsent: false },
      staging: { retainedArtifactsMayExist: true, originalNameMayBeAbsent: false },
      journal: { retainedArtifactsMayExist: true, originalNameMayBeAbsent: false },
      parked: { retainedArtifactsMayExist: true, originalNameMayBeAbsent: true },
      recovery: { retainedArtifactsMayExist: true, originalNameMayBeAbsent: true },
      'parked-published': { retainedArtifactsMayExist: true, originalNameMayBeAbsent: false },
      'recovery-published': { retainedArtifactsMayExist: true, originalNameMayBeAbsent: false },
    });
  }, 35_000);
});
