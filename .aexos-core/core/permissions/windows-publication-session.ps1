$ErrorActionPreference='Stop'
if([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ORDINARY_ONLY'}
$bindings=@{'windows-publication-finite-transport.cs'='F60059495F1BC3C463FF47162D2815AB22C23DF47FE9A90AF8E2A4D77CAD0369';'windows-publication-finite-relay.cs'='54B2A545B540B6B933C3B7525916B827EF21A98E73915A542D15792157BA4937'}
$held=[Collections.Generic.List[IO.FileStream]]::new()
try {
 foreach($name in @('windows-publication-finite-transport.cs','windows-publication-finite-relay.cs')){$s=[IO.File]::Open((Join-Path $PSScriptRoot $name),'Open','Read','Read');$held.Add($s);if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($s))-cne$bindings[$name]){throw 'SOURCE_HASH'}}
 Add-Type -Path @((Join-Path $PSScriptRoot 'windows-publication-finite-transport.cs'),(Join-Path $PSScriptRoot 'windows-publication-finite-relay.cs'))
 [FiniteRelay]::Client([Console]::OpenStandardInput(),[Console]::OpenStandardOutput())
}finally{foreach($s in $held){$s.Dispose()}}



