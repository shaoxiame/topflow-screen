$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$font=$env:TF_FONT
if(!$font -or !(Test-Path -LiteralPath $font)){throw 'Set TF_FONT to a licensed CJK font file; the factory font is not distributed'}
$objects=@(Get-ChildItem "$root/build-preview" -Filter '*.o' -File|Where-Object {$_.Name -match '^(ft_|gumbo_|lh_)'}|ForEach-Object{$_.FullName})
$renderer="$root/build-preview/html_view_style_test.o"
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -Os -std=c++17 -I"$root/vendor/freetype/include" -I"$root/vendor/litehtml/include" -I"$root/vendor/litehtml/include/litehtml" -c "$root/upstream/src/html_view.cpp" -o $renderer
if($LASTEXITCODE -ne 0){throw 'Render style renderer build failed'}
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -Os -std=c++17 "$root/test-render-style.cpp" $renderer @objects -o "$root/bin/test-render-style.exe"
if($LASTEXITCODE -ne 0){throw 'Render style test build failed'}
& "$root/bin/test-render-style.exe" $font
if($LASTEXITCODE -ne 0){throw 'Render style test failed'}
