$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$bytes=[IO.File]::ReadAllBytes("$root/bin/topflow-screen-aarch64")
if($bytes[0] -ne 127 -or $bytes[1] -ne 69 -or $bytes[2] -ne 76 -or $bytes[3] -ne 70){throw 'Not ELF'}
if($bytes[4] -ne 2 -or $bytes[5] -ne 1){throw 'Requires ELF64 little endian'}
if([BitConverter]::ToUInt16($bytes,18) -ne 183){throw 'Requires AArch64 machine'}
$phoff=[BitConverter]::ToUInt64($bytes,32)
$phentsize=[BitConverter]::ToUInt16($bytes,54)
$phnum=[BitConverter]::ToUInt16($bytes,56)
for($i=0;$i -lt $phnum;$i++){
 $type=[BitConverter]::ToUInt32($bytes,[int]($phoff+$i*$phentsize))
 if($type -eq 2 -or $type -eq 3){throw 'Unexpected dynamic dependency or interpreter'}
}
$git=(Get-Command git).Source
$bash=[IO.Path]::GetFullPath((Join-Path (Split-Path $git) '../usr/bin/dash.exe'))
if(Test-Path $bash){
 foreach($script in @('screenctl.sh','supervisor.sh')){
  & $bash -n "$root/$script"
  if($LASTEXITCODE -ne 0){throw "Shell syntax failed: $script"}
 }
 Write-Output 'PASS: POSIX shell syntax for controller and supervisor'
}
Write-Output 'PASS: static ELF64 AArch64; no PT_INTERP or PT_DYNAMIC'
Write-Output "PASS: native ELF size $($bytes.Length) bytes; final TXT import size is checked separately by the plugin builder"
Get-FileHash "$root/bin/topflow-screen-aarch64" -Algorithm SHA256
