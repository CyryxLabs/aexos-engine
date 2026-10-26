$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
$invoked = $false
try {
    if ($PSVersionTable.PSVersion.ToString() -ne '7.6.5' -or
        [Environment]::OSVersion.Version.ToString() -ne '10.0.26300.0' -or
        [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString() -ne 'X64') {
        throw 'Unsupported tuple'
    }
    # Length-prefixed JSON avoids unbounded reads and slow per-character payload parsing.
    $reader = [Console]::In
    $header = [Text.StringBuilder]::new()
    while (($value = $reader.Read()) -ne -1 -and $value -ne 10) {
        if ($header.Length -ge 8 -or $value -lt 48 -or $value -gt 57) { throw 'Invalid frame length' }
        [void]$header.Append([char]$value)
    }
    $length = [int]::Parse($header.ToString())
    if ($length -le 0 -or $length -gt 6291456) { throw 'Request limit' }
    $buffer = New-Object char[] $length
    if ($reader.ReadBlock($buffer, 0, $length) -ne $length -or $reader.Read() -ne 10) { throw 'Incomplete frame' }
    $text = [string]::new($buffer)
    $request = $text | ConvertFrom-Json -AsHashtable
    $runtime = $request.runtimeIdentity
    $executableHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes([Environment]::ProcessPath))).ToLowerInvariant()
    if ($runtime.executableSha256 -ne $executableHash -or $runtime.platform -ne 'win32' -or
        $runtime.architecture -ne 'x64' -or $runtime.release -ne '10.0.26300' -or
        $runtime.filesystem -ne 'NTFS' -or $runtime.powershellVersion -ne '7.6.5') { throw 'Runtime identity mismatch' }
    $sourceStream = [IO.File]::Open((Join-Path $PSScriptRoot 'windows-publication-helper.cs'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    if ($sourceStream.Length -gt 262144) { throw 'Source limit' }
    $sourceBytes = New-Object byte[] $sourceStream.Length
    $sourceStream.ReadExactly($sourceBytes)
    $sourceHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($sourceBytes)).ToLowerInvariant()
    $launcherHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes($PSCommandPath))).ToLowerInvariant()
    if ($sourceHash -ne $request.helperSha256 -or $launcherHash -ne $request.launcherSha256) { throw 'Packaged source identity mismatch' }
    Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString($sourceBytes))
    $invoked = $true
    [Console]::Out.WriteLine([AexosPublication]::Run($text))
} catch {
    if ($invoked) {
        [Console]::Out.WriteLine('{"success":false,"phase":"RECOVERY_REQUIRED","code":"NATIVE_HELPER_FAILED","productionEnabled":false,"effects":{"transactionArtifactsMayExist":true,"originalNameMayBeAbsent":true,"destinationMayExist":true}}')
        exit 1
    }
    [Console]::Out.WriteLine('{"success":false,"phase":"UNSUPPORTED_BEFORE_MUTATION","code":"NATIVE_PREREQUISITE_UNAVAILABLE","productionEnabled":false,"effects":{"staging":false,"journal":false,"backup":false,"parked":false,"destination":false,"originalNameMayBeAbsent":false}}')
    exit 1
} finally {
    if ($sourceStream) { $sourceStream.Dispose() }
}
