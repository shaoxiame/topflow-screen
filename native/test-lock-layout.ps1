$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$font=$env:TF_FONT
if(!$font -or !(Test-Path -LiteralPath $font)){throw 'Set TF_FONT to a licensed CJK font file; the factory font is not distributed'}
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$from=$main.IndexOf('static const char rate_chart[]');$to=$main.IndexOf('static void token_raw(', $from)
if($from -lt 0 -or $to -lt $from){throw 'Chart source section absent'}
[IO.File]::WriteAllText("$root/build-preview/lock-chart-functions.inc",$main.Substring($from,$to-$from))
$from=$main.IndexOf('static int lock_rate_animation_tick(');$to=$main.IndexOf('static void screen_lock(', $from)
if($from -lt 0 -or $to -lt $from){throw 'Lock rate animation source absent'}
[IO.File]::WriteAllText("$root/build-preview/lock-rate-functions.inc",$main.Substring($from,$to-$from))
$status=[IO.File]::ReadAllText("$root/lockscreen_status.h")
$type=$status.Substring($status.IndexOf('typedef struct{int mode,online;'),$status.IndexOf('static const char*tf_lock_operator')-$status.IndexOf('typedef struct{int mode,online;'))
$from=$status.IndexOf('/* Rates are bytes/s.');$to=$status.LastIndexOf('#endif')
[IO.File]::WriteAllText("$root/build-preview/lock-motion-functions.inc",$type+$status.Substring($from,$to-$from))
$objects=@(Get-ChildItem "$root/build-preview" -Filter '*.o' -File|Where-Object {$_.Name -match '^(ft_|gumbo_|lh_)'}|ForEach-Object{$_.FullName})
$renderer="$root/build-preview/html_view_lock_layout_test.o"
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -Os -std=c++17 -I"$root/vendor/freetype/include" -I"$root/vendor/litehtml/include" -I"$root/vendor/litehtml/include/litehtml" -c "$root/upstream/src/html_view.cpp" -o $renderer
if($LASTEXITCODE -ne 0){throw 'Lock layout renderer build failed'}
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -Os -std=c++17 -I"$root" -I"$root/upstream/include" -I"$root/build-preview" "$root/test-lock-layout.cpp" $renderer @objects -o "$root/bin/test-lock-layout.exe"
if($LASTEXITCODE -ne 0){throw 'Lock layout test build failed'}
& "$root/bin/test-lock-layout.exe" $font "$root/ui" "$root/preview"
if($LASTEXITCODE -ne 0){throw 'Lock layout test failed'}
foreach($name in @('lock-entry','lock-handover','lock-cooldown','soft-lock','soft-lock-progress','lock-normal-021','lock-aggregate-021','lock-stale-021','lock-hold-021','lock-pin-status-021')){
 foreach($suffix in @('','-dark')){
  & node "$root/preview/convert-ppm.js" "$root/preview/$name$suffix.ppm"
  if($LASTEXITCODE -ne 0){throw "Lock PNG conversion failed: $name$suffix"}
 }
}
foreach($theme in @('','-dark')){foreach($frame in @(0,90,180,320)){& node "$root/preview/convert-ppm.js" "$root/preview/lock-motion-021$theme-$frame.ppm";if($LASTEXITCODE -ne 0){throw 'Lock animation PNG conversion failed'}}}
