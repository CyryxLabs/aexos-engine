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
Add-Type -TypeDefinition ([Text.UTF8Encoding]::new($false,$true).GetString([IO.File]::ReadAllBytes($Source))) -Language CSharp
$flags=[Reflection.BindingFlags]'NonPublic,Static'
$method=[AexosPublication].GetMethod('KnownProtectedDaclCreationLoss',$flags)
if($null-eq$method-or$method.ReturnType-ne[bool]-or$method.GetParameters().Count-ne2){throw 'METHOD_BINDING'}
function Copy-Bytes([byte[]]$Bytes){$copy=[byte[]]::new($Bytes.Length);[Array]::Copy($Bytes,$copy,$Bytes.Length);return ,$copy}
function Invoke-Guard([byte[]]$Expected,[byte[]]$Created){$arguments=[object[]]::new(2);$arguments[0]=$Expected;$arguments[1]=$Created;[bool]$method.Invoke($null,$arguments)}
$descriptor=[Security.AccessControl.RawSecurityDescriptor]::new('O:SYG:SYD:P(A;;FA;;;SY)')
$created=[byte[]]::new($descriptor.BinaryLength);$descriptor.GetBinaryForm($created,0)
$source=Copy-Bytes $created;$source[3]=0x94
$known=Copy-Bytes $created
$wrongControl=Copy-Bytes $known;$wrongControl[3]=0x91
$otherByte=Copy-Bytes $known;$otherByte[24]=$otherByte[24]-bxor1
$nullDaclExpected=Copy-Bytes $source;[BitConverter]::GetBytes([uint32]0).CopyTo($nullDaclExpected,16)
$nullDaclCreated=Copy-Bytes $nullDaclExpected;$nullDaclCreated[3]=0x90
$outsideDaclExpected=Copy-Bytes $source;[BitConverter]::GetBytes([uint32]$source.Length).CopyTo($outsideDaclExpected,16)
$outsideDaclCreated=Copy-Bytes $outsideDaclExpected;$outsideDaclCreated[3]=0x90
$headerDaclExpected=Copy-Bytes $source;[BitConverter]::GetBytes([uint32]19).CopyTo($headerDaclExpected,16)
$headerDaclCreated=Copy-Bytes $headerDaclExpected;$headerDaclCreated[3]=0x90
$shorter=[byte[]]::new($known.Length-1);[Array]::Copy($known,$shorter,$shorter.Length)
[pscustomobject]@{
  compileCount=1
  nativeMethodInvocations=0
  cases=[ordered]@{
    knownLoss=Invoke-Guard $source $known
    exact=Invoke-Guard $source $source
    wrongControl=Invoke-Guard $source $wrongControl
    lengthDelta=Invoke-Guard $source $shorter
    otherByteDelta=Invoke-Guard $source $otherByte
    nullDacl=Invoke-Guard $nullDaclExpected $nullDaclCreated
    outsideDacl=Invoke-Guard $outsideDaclExpected $outsideDaclCreated
    headerDacl=Invoke-Guard $headerDaclExpected $headerDaclCreated
  }
}|ConvertTo-Json -Depth 10 -Compress
`;

windowsDescribe('Windows publication security fidelity guard', () => {
  test('accepts only the proved protected-DACL auto-inheritance creation loss', () => {
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
    expect(JSON.parse(result.stdout.trim())).toEqual({
      compileCount: 1,
      nativeMethodInvocations: 0,
      cases: {
        knownLoss: true,
        exact: false,
        wrongControl: false,
        lengthDelta: false,
        otherByteDelta: false,
        nullDacl: false,
        outsideDacl: false,
        headerDacl: false,
      },
    });
  }, 35_000);
});
