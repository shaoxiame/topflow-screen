param([switch]$Baseline)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$font=$env:TF_FONT
if(!$font -or !(Test-Path -LiteralPath $font)){throw 'Set TF_FONT to a licensed CJK font file; the factory font is not distributed'}
$objects=@(Get-ChildItem "$root/build-preview" -Filter '*.o' -File | Where-Object {$_.Name -match '^(ft_|gumbo_|lh_)'} | ForEach-Object {$_.FullName})
$extra=@()
$renderer="$root/build-preview/html_view.o"
if($Baseline){
 $extra=@('-DTF_RENDER_BASELINE');$mode='record';$name='baseline';$renderer="$root/build-preview/html_view_015_baseline.o"
 & "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -Os -std=c++17 -I"$root/vendor/freetype/include" -I"$root/vendor/litehtml/include" -I"$root/vendor/litehtml/include/litehtml" -c "$root/../analysis/html-view-015-baseline.cpp" -o $renderer
 if($LASTEXITCODE -ne 0){throw 'Baseline renderer compile failed'}
}else{
 $mode='verify';$name='optimized';$renderer="$root/build-preview/html_view_perf_test.o"
 & "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -Os -std=c++17 -DTF_RENDER_TEST -I"$root/vendor/freetype/include" -I"$root/vendor/litehtml/include" -I"$root/vendor/litehtml/include/litehtml" -c "$root/upstream/src/html_view.cpp" -o $renderer
 if($LASTEXITCODE -ne 0){throw 'Optimized renderer compile failed'}
}
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -Os -std=c++17 @extra "$root/test-render-perf.cpp" $renderer @objects -o "$root/bin/test-render-perf-$name.exe"
if($LASTEXITCODE -ne 0){throw 'Render performance test build failed'}
& "$root/bin/test-render-perf-$name.exe" $font "$root/ui" "$root/preview/index-filled.html" "$root/preview/index-dark-filled.html" "$root/preview/advanced-network.html" "$root/preview/advanced-network-dark.html" "$root/build-preview/render-perf-baseline.bin" $mode
if($LASTEXITCODE -ne 0){throw 'Render performance / equivalence test failed'}
