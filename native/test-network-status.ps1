$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/test-network-status.c" "$root/upstream/src/json.c" -o "$root/bin/test-network-status.exe"
if($LASTEXITCODE -ne 0){throw 'Network status test build failed'}
& "$root/bin/test-network-status.exe" "$root/../tests/fixtures/network-018/observed-state.json"
if($LASTEXITCODE -ne 0){throw 'Network status test failed'}
