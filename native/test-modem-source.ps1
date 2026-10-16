$ErrorActionPreference='Stop'
$native=$PSScriptRoot
$zig=Join-Path $native 'toolchain/zig-x86_64-windows-0.14.1/zig.exe'
$out=Join-Path $native 'build-preview/test-modem-source.exe'
& $zig cc '-std=c11' '-Wall' '-Wextra' '-Wno-unused-function' '-Wno-misleading-indentation' '-I' $native '-I' (Join-Path $native 'upstream/include') (Join-Path $native 'test-modem-source.c') (Join-Path $native 'upstream/src/json.c') '-o' $out
if($LASTEXITCODE -ne 0){throw 'SIM source tests failed to compile'}
& $out (Join-Path $native '../tests/fixtures/sim-source-018/primary.json') (Join-Path $native '../tests/fixtures/sim-source-018/external.json')
if($LASTEXITCODE -ne 0){throw 'SIM source tests failed'}
