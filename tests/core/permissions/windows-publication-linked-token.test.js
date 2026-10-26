'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const nativeDescribe = process.platform === 'win32' && os.release() === '10.0.26300' ? describe : describe.skip;
const repoRoot = path.resolve(__dirname, '../../..');
const sourceRoot = path.join(repoRoot, '.aexos-core/core/permissions');
const pwsh = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe');

nativeDescribe('protected relay linked-token admission', () => {
  test('real C# integration observes the ordinary token and rejects malformed controller or split-token facts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-linked-token-'));
    const script = path.join(directory, 'linked-token-policy.ps1');
    const sources = [
      'windows-publication-protected-transport.cs',
      'windows-publication-protected-relay-base.cs',
      'windows-publication-protected-native.cs',
      'windows-publication-protected-relay.cs',
    ].map((name) => path.join(sourceRoot, name).replaceAll("'", "''"));
    fs.writeFileSync(script, String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -Path @(${sources.map((source) => `'${source}'`).join(',')})
function Facts($token,$auth,$sid,$session,$elevation,$type,$linkedToken,$linkedAuth,$linkedSid,$linkedSession,$linkedElevation,$linkedType) {
  [LinkedPrimaryTokenFacts]::new($token,$auth,$sid,[uint32]$session,$elevation,$type,$linkedToken,$linkedAuth,$linkedSid,[uint32]$linkedSession,$linkedElevation,$linkedType)
}
$sid = 'S-1-5-21-1-2-3-1001'
$full = Facts 'F' '1048765' $sid 1 2 1 'FL' '1048929' $sid 1 3 2
$limited = Facts 'L' '1048929' $sid 1 3 1 'LL' '1048765' $sid 1 2 2
[ProtectedNative]::ValidateControllerFacts(41,41,$sid,$sid,'1048929','1048929',1,1,1)
[ProtectedNative]::ValidateLinkedPrimaryPair($full,$limited)
$rejected = [ordered]@{}
function Reject($name,$expected,[scriptblock]$case) {
  try { & $case; throw "ACCEPTED_$name" }
  catch {
    $message = $_.Exception.GetBaseException().Message
    if ($message -eq "ACCEPTED_$name") { throw $message }
    if (-not $message.Contains($expected)) { throw "WRONG_REJECTION_$($name):$message" }
    $script:rejected[$name] = $message
  }
}
Reject 'wrongParent' 'CONTROLLER_PARENT_OR_LOGON' { [ProtectedNative]::ValidateControllerFacts(40,41,$sid,$sid,'1048929','1048929',1,1,1) }
Reject 'wrongControllerSid' 'CONTROLLER_PARENT_OR_LOGON' { [ProtectedNative]::ValidateControllerFacts(41,41,$sid,'S-1-5-21-9', '1048929','1048929',1,1,1) }
Reject 'wrongShimAuthentication' 'CONTROLLER_PARENT_OR_LOGON' { [ProtectedNative]::ValidateControllerFacts(41,41,$sid,$sid,'7','1048929',1,1,1) }
Reject 'wrongShimSession' 'CONTROLLER_PARENT_OR_LOGON' { [ProtectedNative]::ValidateControllerFacts(41,41,$sid,$sid,'1048929','1048929',2,1,1) }
Reject 'wrongCoordinatorSession' 'CONTROLLER_PARENT_OR_LOGON' { [ProtectedNative]::ValidateControllerFacts(41,41,$sid,$sid,'1048929','1048929',1,1,2) }
Reject 'missingFullLink' 'LINKED_TOKEN_TYPE' { [ProtectedNative]::ValidateLinkedPrimaryPair($null,$limited) }
Reject 'wrongDirectSid' 'LINKED_TOKEN_IDENTITY' { [ProtectedNative]::ValidateLinkedPrimaryPair((Facts 'F' '1048765' 'S-1-5-21-9' 1 2 1 'FL' '1048929' $sid 1 3 2),$limited) }
Reject 'wrongLinkedSid' 'LINKED_TOKEN_IDENTITY' { [ProtectedNative]::ValidateLinkedPrimaryPair((Facts 'F' '1048765' $sid 1 2 1 'FL' '1048929' 'S-1-5-21-9' 1 3 2),$limited) }
Reject 'wrongLinkedSession' 'LINKED_TOKEN_IDENTITY' { [ProtectedNative]::ValidateLinkedPrimaryPair((Facts 'F' '1048765' $sid 1 2 1 'FL' '1048929' $sid 2 3 2),$limited) }
Reject 'wrongDirectElevationType' 'LINKED_TOKEN_TYPE' { [ProtectedNative]::ValidateLinkedPrimaryPair((Facts 'F' '1048765' $sid 1 3 1 'FL' '1048929' $sid 1 3 2),$limited) }
Reject 'wrongLinkedElevationType' 'LINKED_TOKEN_TYPE' { [ProtectedNative]::ValidateLinkedPrimaryPair((Facts 'F' '1048765' $sid 1 2 1 'FL' '1048929' $sid 1 2 2),$limited) }
Reject 'nonPrimaryDirectToken' 'LINKED_TOKEN_TYPE' { [ProtectedNative]::ValidateLinkedPrimaryPair((Facts 'F' '1048765' $sid 1 2 2 'FL' '1048929' $sid 1 3 2),$limited) }
Reject 'wrongLinkedHandleType' 'LINKED_TOKEN_TYPE' { [ProtectedNative]::ValidateLinkedPrimaryPair((Facts 'F' '1048765' $sid 1 2 1 'FL' '1048929' $sid 1 3 1),$limited) }
Reject 'sameDirectTokenId' 'LINKED_TOKEN_RECIPROCAL' { [ProtectedNative]::ValidateLinkedPrimaryPair($full,(Facts 'F' '1048929' $sid 1 3 1 'LL' '1048765' $sid 1 2 2)) }
Reject 'wrongForwardAuthenticationLink' 'LINKED_TOKEN_RECIPROCAL' { [ProtectedNative]::ValidateLinkedPrimaryPair((Facts 'F' '1048765' $sid 1 2 1 'FL' '7' $sid 1 3 2),$limited) }
Reject 'wrongReciprocalAuthenticationLink' 'LINKED_TOKEN_RECIPROCAL' { [ProtectedNative]::ValidateLinkedPrimaryPair($full,(Facts 'L' '1048929' $sid 1 3 1 'LL' '7' $sid 1 2 2)) }
Reject 'sameAuthenticationBypass' 'LINKED_TOKEN_RECIPROCAL' { [ProtectedNative]::ValidateLinkedPrimaryPair((Facts 'F' '9' $sid 1 2 1 'FL' '9' $sid 1 3 2),(Facts 'L' '9' $sid 1 3 1 'LL' '9' $sid 1 2 2)) }
$process = [Aexos.FiniteTransport.ProcessPin]::new([uint32]$PID)
try { $actual = [ProtectedNative]::ObserveLinkedPrimary($process) } finally { $process.Dispose() }
if ([string]::IsNullOrEmpty($actual.AuthenticationId) -or [string]::IsNullOrEmpty($actual.LinkedAuthenticationId) -or
    $actual.AuthenticationId -eq $actual.LinkedAuthenticationId -or
    [string]::IsNullOrEmpty($actual.TokenId) -or [string]::IsNullOrEmpty($actual.LinkedTokenId) -or
    $actual.TokenId -eq $actual.LinkedTokenId -or $actual.ElevationType -ne 3 -or $actual.LinkedElevationType -ne 2 -or
    $actual.TokenType -ne 1 -or $actual.LinkedTokenType -ne 2 -or
    $actual.Sid -ne $actual.LinkedSid -or $actual.SessionId -ne $actual.LinkedSessionId) { throw 'ACTUAL_LINKED_TOKEN_MISMATCH' }
[ordered]@{ compiled=$true; rejected=$rejected; actual=$actual; privilegesChanged=$false } | ConvertTo-Json -Compress -Depth 5
`, 'utf8');
    try {
      const raw = execFileSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], {
        encoding: 'utf8', timeout: 30_000, windowsHide: true,
      }).trim();
      const result = JSON.parse(raw);
      expect(result.compiled).toBe(true);
      expect(Object.keys(result.rejected)).toHaveLength(17);
      expect(result.actual).toMatchObject({
        ElevationType: 3, LinkedElevationType: 2, TokenType: 1, LinkedTokenType: 2,
      });
      expect(result.actual.AuthenticationId).toEqual(expect.any(String));
      expect(result.actual.LinkedAuthenticationId).toEqual(expect.any(String));
      expect(result.actual.AuthenticationId).not.toBe(result.actual.LinkedAuthenticationId);
      expect(result.actual.TokenId).not.toBe(result.actual.LinkedTokenId);
      expect(result.actual.Sid).toBe(result.actual.LinkedSid);
      expect(result.actual.SessionId).toBe(result.actual.LinkedSessionId);
      expect(result.privilegesChanged).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 45_000);
});
