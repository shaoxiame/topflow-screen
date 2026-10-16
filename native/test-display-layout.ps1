$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$font=$env:TF_FONT
if(!$font -or !(Test-Path -LiteralPath $font)){throw 'Set TF_FONT to a licensed CJK font file; the factory font is not distributed'}
$objects=@(Get-ChildItem "$root/build-preview" -Filter '*.o' -File|Where-Object {$_.Name -match '^(ft_|gumbo_|lh_)'}|ForEach-Object{$_.FullName})
$renderer="$root/build-preview/html_view_display_layout_test.o"
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -Os -std=c++17 -I"$root/vendor/freetype/include" -I"$root/vendor/litehtml/include" -I"$root/vendor/litehtml/include/litehtml" -c "$root/upstream/src/html_view.cpp" -o $renderer
if($LASTEXITCODE -ne 0){throw 'Display layout renderer build failed'}
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" c++ -target x86_64-windows-gnu -std=c++17 "$root/test-display-layout.cpp" $renderer @objects -o "$root/bin/test-display-layout.exe"
if($LASTEXITCODE -ne 0){throw 'Display layout test build failed'}
$raw=& "$root/bin/test-display-layout.exe" $font "$root/ui" "$root/preview"
if($LASTEXITCODE -ne 0){throw 'Display layout test failed'}
$report=$raw|ConvertFrom-Json
$hashes=[ordered]@{}
foreach($path in @('native/upstream/src/html_view.cpp','native/ui/style.css','native/display_pages.h','native/advanced_controls.h','native/test-display-layout.cpp','native/test-display-layout.ps1')){$hashes[$path]=(Get-FileHash "$root/../$path" -Algorithm SHA256).Hash.ToLower()}
$report|Add-Member -NotePropertyName sourceSha256 -NotePropertyValue $hashes
$fixtures=[ordered]@{}
foreach($item in $report.results){$fixtures[$item.page]=(Get-FileHash "$root/preview/$($item.page).html" -Algorithm SHA256).Hash.ToLower()}
$report|Add-Member -NotePropertyName fixtureSha256 -NotePropertyValue $fixtures
$report|Add-Member -NotePropertyName version -NotePropertyValue '0.1.7'
$report|Add-Member -NotePropertyName validationLimits -NotePropertyValue 'Local 320x480 RGB565 rendering, layout, and hit tests only. Device touch latency, brightness hardware response, and modem writes are not exercised.'
$report|ConvertTo-Json -Depth 10|Set-Content "$root/../analysis/display-settings-layout-017.json" -Encoding utf8
foreach($name in @('display-fixed','display-adaptive','form-cell-nr','form-cell-lte','keyboard-cell')){
 foreach($suffix in @('','-dark')){
  & node "$root/preview/convert-ppm.js" "$root/preview/$name$suffix.ppm"
  if($LASTEXITCODE -ne 0){throw "Display PNG conversion failed: $name$suffix"}
  if($name -like 'display-*'){
   & node "$root/preview/convert-ppm.js" "$root/preview/$name$suffix-bottom.ppm"
   if($LASTEXITCODE -ne 0){throw "Display bottom PNG conversion failed: $name$suffix"}
  }
  if($name -eq 'display-fixed'){
   & node "$root/preview/convert-ppm.js" "$root/preview/$name$suffix-apply.ppm"
   if($LASTEXITCODE -ne 0){throw "Display apply PNG conversion failed: $name$suffix"}
  }
 }
}
Write-Output "PASS: $($report.results.Count) actual display/cell-lock renders, $($report.totalHitChecks) hit checks; header pixels unchanged at every target scroll."
