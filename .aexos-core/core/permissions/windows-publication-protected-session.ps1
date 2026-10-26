$ErrorActionPreference='Stop'
if([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ORDINARY_ONLY'}
$bindings=@{'windows-publication-protected-transport.cs'='ACD325B0E771E5B4F530E0D7A17A1FC6757B155C01F29D6D9A41CAA65181F1CE';'windows-publication-protected-relay-base.cs'='52CA13E6031910A8C0F89892612395885DEFA6FCAA6FCBA8E0EC74516BC9BFC6';'windows-publication-protected-native.cs'='BFAD190E4D452FDCA34338D97DF5A6C2DB8EDB7AFA8C00A50848DE1FAF6E0CBB';'windows-publication-protected-relay.cs'='151633D1689CAD6454D308F2C0FB149D0F870CA4A945546EFE9511E69AF40D97'}
$held=[Collections.Generic.List[IO.FileStream]]::new()
try {
 $sources=@()
 foreach($name in @('windows-publication-protected-transport.cs','windows-publication-protected-relay-base.cs','windows-publication-protected-native.cs','windows-publication-protected-relay.cs')) {
  $file=Join-Path $PSScriptRoot $name
  $s=[IO.File]::Open($file,'Open','Read','Read');$held.Add($s)
  if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($s))-cne$bindings[$name]){throw 'SOURCE_HASH'}
  $sources+=$file
 }
 Add-Type -Path $sources
 [ProtectedRelay]::ClientV2([Console]::OpenStandardInput(),[Console]::OpenStandardOutput())
}finally{foreach($s in $held){$s.Dispose()}}
