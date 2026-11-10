<#
Installs the qualified ordinary runtime alongside other PowerShell installations.
Explicit invocation only; no PATH, registry, privilege, or Codex-cache changes.
The protected publication route retains its separate runtime/ACL inventory checks.
#>
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$ArchivePath)

$ErrorActionPreference = 'Stop'
$expectedHash = '32EB8F6CDCE08F86E987D625A2733E54AC3E289AE7E1621B14C0B5BCEC2434EA'
$releaseUrl = 'https://github.com/PowerShell/PowerShell/releases/tag/v7.6.5'
$archive = Get-Item -LiteralPath $ArchivePath
if ($archive.PSIsContainer -or ($archive.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'RUNTIME_ARCHIVE_INVALID'
}
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
    [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString() -cne 'X64') {
    throw 'WINDOWS_X64_REQUIRED'
}

function Assert-OrdinaryDirectory([string]$Directory) {
    $at = [IO.Path]::GetFullPath($Directory)
    while ($at) {
        if (Test-Path -LiteralPath $at) {
            $item = Get-Item -LiteralPath $at -Force
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw 'RUNTIME_DIRECTORY_ALIAS'
            }
        }
        $parent = [IO.Directory]::GetParent($at)
        if ($null -eq $parent) { break }
        $at = $parent.FullName
    }
}

$archiveStream = $null
$zip = $null
try {
$archiveStream = [IO.File]::Open($archive.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
$hasher = [Security.Cryptography.SHA256]::Create()
try {
    $actualHash = ([BitConverter]::ToString($hasher.ComputeHash($archiveStream))).Replace('-', '')
} finally { $hasher.Dispose() }
if ($actualHash -cne $expectedHash) { throw 'RUNTIME_ARCHIVE_HASH_MISMATCH' }
$archiveStream.Position = 0

$profileRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
if (-not $profileRoot -or -not [IO.Path]::IsPathRooted($profileRoot)) { throw 'USER_PROFILE_REQUIRED' }
$versionRoot = Join-Path $profileRoot '.aexos\runtimes\powershell\7.6.5'
$destination = Join-Path $versionRoot 'win-x64'
Assert-OrdinaryDirectory $versionRoot
if (Test-Path -LiteralPath $destination) { throw 'RUNTIME_DESTINATION_ALREADY_EXISTS' }

# A verified release archive is extracted into a new sibling before publication.
New-Item -ItemType Directory -Path $versionRoot -Force | Out-Null
Assert-OrdinaryDirectory $versionRoot
$staging = Join-Path $versionRoot ('.install-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$zip = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Read, $true)
[IO.Compression.ZipFileExtensions]::ExtractToDirectory($zip, $staging)
Assert-OrdinaryDirectory $staging
$executable = Join-Path $staging 'pwsh.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'RUNTIME_EXECUTABLE_MISSING' }
$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = $executable
$start.Arguments = '-NoLogo -NoProfile -NonInteractive -Command "$PSVersionTable.PSVersion.ToString()"'
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$process = $null
try {
    $process = [Diagnostics.Process]::Start($start)
    if (-not $process.WaitForExit(15000)) {
        $process.Kill()
        $process.WaitForExit()
        throw 'RUNTIME_VERSION_PROBE_TIMEOUT'
    }
    $observedVersion = $process.StandardOutput.ReadToEnd().Trim()
    $probeError = $process.StandardError.ReadToEnd()
    if ($process.ExitCode -ne 0 -or $observedVersion -cne '7.6.5' -or $probeError) {
        throw 'RUNTIME_VERSION_PROBE_FAILED'
    }
} finally {
    if ($null -ne $process) { $process.Dispose() }
}

Assert-OrdinaryDirectory $versionRoot
if (Test-Path -LiteralPath $destination) { throw 'RUNTIME_DESTINATION_ALREADY_EXISTS' }
[IO.Directory]::Move($staging, $destination)
[ordered]@{
    code = 'AEXOS_ORDINARY_RUNTIME_INSTALLED'
    version = $observedVersion
    destination = $destination
    release = $releaseUrl
    archiveSha256 = $expectedHash.ToLowerInvariant()
    executableSha256 = (Get-FileHash -LiteralPath (Join-Path $destination 'pwsh.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
    productionEnabled = $false
} | ConvertTo-Json -Compress
} finally {
    if ($null -ne $zip) { $zip.Dispose() }
    if ($null -ne $archiveStream) { $archiveStream.Dispose() }
}
