$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/test-network-runtime.c" "$root/upstream/src/json.c" -o "$root/bin/test-network-runtime.exe"
if($LASTEXITCODE -ne 0){throw 'Network runtime test build failed'}
Push-Location "$root/.."
try { & "$root/bin/test-network-runtime.exe"; if($LASTEXITCODE -ne 0){throw 'Network runtime test failed'} }
finally { Pop-Location }
