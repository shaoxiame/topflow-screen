$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$font=$env:TF_FONT
if(!$font -or !(Test-Path -LiteralPath $font)){throw 'Set TF_FONT to a licensed CJK font file; the factory font is not distributed'}
$objects=@(Get-ChildItem "$root/build-preview" -Filter '*.o' -File|Where-Object {$_.Name -match '^(ft_|gumbo_|lh_)'}|ForEach-Object{$_.FullName})
$renderer="$root/build-preview/html_view_dashboard_layout_test.o"
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -Os -std=c++17 -I"$root/vendor/freetype/include" -I"$root/vendor/litehtml/include" -I"$root/vendor/litehtml/include/litehtml" -c "$root/upstream/src/html_view.cpp" -o $renderer
if($LASTEXITCODE -ne 0){throw 'Dashboard renderer build failed'}
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -std=c++17 "$root/test-dashboard-layout.cpp" $renderer @objects -o "$root/bin/test-dashboard-layout.exe"
if($LASTEXITCODE -ne 0){throw 'Dashboard layout test build failed'}
$raw=& "$root/bin/test-dashboard-layout.exe" $font "$root/ui" "$root/preview"
if($LASTEXITCODE -ne 0){throw 'Dashboard layout test failed'}
$raw|Set-Content "$root/../analysis/dashboard-layout-018.json" -Encoding utf8
Write-Output $raw
