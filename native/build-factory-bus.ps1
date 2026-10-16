param([string]$Python = $env:TF_PYTHON)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$zig=Join-Path $root 'toolchain/zig-x86_64-windows-0.14.1/zig.exe'
$headers=Join-Path $root 'vendor/openwrt'
$binary=Join-Path $root 'bin/topflow-factory-bus-aarch64'
$imports=Join-Path $root 'build-bus-import'
if (!$Python) { $Python = 'python' }
New-Item -ItemType Directory -Force (Join-Path $root 'bin') | Out-Null
& $Python (Join-Path (Split-Path $root -Parent) 'tools/make-ubus-import-stubs.py')
if($LASTEXITCODE -ne 0){throw 'Import metadata generation failed'}
foreach($name in @('libubus.so.20230605','libubox.so.20230523')){
 & $zig cc -target aarch64-linux-musl -shared -nostdlib (Join-Path $imports "$name.S") "-Wl,-soname,$name" -o (Join-Path $imports $name)
 if($LASTEXITCODE -ne 0){throw 'Import stub generation failed'}
}
& $zig cc -target aarch64-linux-musl -dynamic -Os -std=c11 -Wall -Wextra -Werror -Wno-unused-function "-I$headers" "-I$headers/ubus" (Join-Path $root 'factory_bus.c') (Join-Path $imports 'libubus.so.20230605') (Join-Path $imports 'libubox.so.20230523') '-Wl,--dynamic-linker=/lib/ld-musl-aarch64.so.1' '-Wl,--gc-sections' -s -o $binary
if($LASTEXITCODE -ne 0){throw 'Factory bus helper compilation failed'}
Get-FileHash $binary -Algorithm SHA256
