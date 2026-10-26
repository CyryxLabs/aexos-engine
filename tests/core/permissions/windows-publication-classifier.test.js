'use strict';

const fs = require('node:fs');
const os = require('node:os');
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

windowsDescribe('Windows publication prerequisite classifier', () => {
  test('classifies only exact pristine original-acquisition privilege failures', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-classifier-'));
    const script = path.join(directory, 'classify.ps1');
    const source = String.raw`
param([string]$Source)
$sourceBytes = [IO.File]::ReadAllBytes($Source)
Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString($sourceBytes))
$outer = [AexosPublication]
$flags = [Reflection.BindingFlags]'NonPublic,Public,Static,Instance'
$transactionType = $outer.GetNestedType('Transaction', $flags)
$failureType = $outer.GetNestedType('NativeFailure', $flags)
$method = $outer.GetMethod('ClassifyFreshOriginalAcquisitionFailure', $flags)

function Invoke-Classifier([string]$Code, [string]$Effect, [string]$Phase) {
    $transaction = [Activator]::CreateInstance($transactionType, $true)
    if ($Effect) { $transactionType.GetField($Effect, $flags).SetValue($transaction, $true) }
    if ($Phase) { $transactionType.GetField('Phase', $flags).SetValue($transaction, $Phase) }
    $failure = [Activator]::CreateInstance($failureType, [object[]]@($Code))
    [void]$method.Invoke($null, [object[]]@($transaction, $failure))
    [pscustomobject]@{
        code = $Code
        effect = $Effect
        inputPhase = $Phase
        phase = $transactionType.GetField('Phase', $flags).GetValue($transaction)
    }
}

$cases = @(
    Invoke-Classifier 'FULL_SECURITY_OPEN_NATIVE_1314' '' ''
    Invoke-Classifier 'FULL_SECURITY_OPEN_NATIVE_5' '' ''
    Invoke-Classifier 'FULL_SECURITY_OPEN_NATIVE_32' '' ''
    Invoke-Classifier 'NATIVE_1314' '' ''
)
foreach ($effect in @('Directory', 'Staging', 'Backup', 'Journal', 'Parked', 'Published', 'Recovery')) {
    $cases += Invoke-Classifier 'FULL_SECURITY_OPEN_NATIVE_1314' $effect ''
}
$cases += Invoke-Classifier 'FULL_SECURITY_OPEN_NATIVE_1314' '' 'RECOVERY_CONFLICT'
$cases | ConvertTo-Json -Compress
`;

    try {
      fs.writeFileSync(script, source);
      const executable = inspectNativeCandidateIdentity().executable;
      const result = spawnSync(executable, [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        script,
        SOURCE,
      ], { encoding: 'utf8', windowsHide: true });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      const cases = JSON.parse(result.stdout.trim());
      expect(cases[0]).toMatchObject({
        code: 'FULL_SECURITY_OPEN_NATIVE_1314',
        phase: 'UNSUPPORTED_BEFORE_MUTATION',
      });
      expect(cases.slice(1, 4).map(({ phase }) => phase)).toEqual(
        Array(3).fill('REJECTED_BEFORE_MUTATION'),
      );
      expect(cases.slice(4, 11).map(({ phase }) => phase)).toEqual(
        Array(7).fill('REJECTED_BEFORE_MUTATION'),
      );
      expect(cases[11]).toMatchObject({
        inputPhase: 'RECOVERY_CONFLICT',
        phase: 'RECOVERY_CONFLICT',
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
