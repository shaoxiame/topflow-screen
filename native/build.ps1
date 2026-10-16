param([switch]$Clean, [switch]$LibrariesOnly, [switch]$Preview)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$zig = Join-Path $root 'toolchain/zig-x86_64-windows-0.14.1/zig.exe'
$ft = Join-Path $root 'vendor/freetype'
$lh = Join-Path $root 'vendor/litehtml'
$up = Join-Path $root 'upstream'
$out = Join-Path $root $(if ($Preview) {'build-preview'} else {'build'})
New-Item -ItemType Directory -Force $out,(Join-Path $root 'bin') | Out-Null
$module = @'
FT_USE_MODULE( FT_Module_Class, autofit_module_class )
FT_USE_MODULE( FT_Driver_ClassRec, tt_driver_class )
FT_USE_MODULE( FT_Driver_ClassRec, cff_driver_class )
FT_USE_MODULE( FT_Module_Class, psaux_module_class )
FT_USE_MODULE( FT_Module_Class, psnames_module_class )
FT_USE_MODULE( FT_Module_Class, pshinter_module_class )
FT_USE_MODULE( FT_Module_Class, sfnt_module_class )
FT_USE_MODULE( FT_Renderer_Class, ft_smooth_renderer_class )
'@
[IO.File]::WriteAllText((Join-Path $out 'ftmodule_min.h'), $module)
$target = if ($Preview) {'x86_64-windows-gnu'} else {'aarch64-linux-musl'}
$common = @('-target',$target,'-Os','-fdata-sections','-ffunction-sections','-D_GNU_SOURCE','-w')
$jobs = [System.Collections.Generic.List[object]]::new()
foreach ($unit in ('base/ftbase base/ftsystem base/ftinit base/ftdebug base/ftbbox base/ftbitmap base/ftglyph base/ftmm cache/ftcache autofit/autofit truetype/truetype cff/cff psaux/psaux psnames/psnames pshinter/pshinter sfnt/sfnt smooth/smooth gzip/ftgzip').Split(' ')) {
 $jobs.Add(@{source="$ft/src/$unit.c"; obj="$out/ft_$($unit.Replace('/','_')).o"; compiler='cc'; extra=@('-DFT2_BUILD_LIBRARY',"-I$ft/include","-I$out",'-DFT_CONFIG_MODULES_H="ftmodule_min.h"')})
}
foreach ($file in (Get-ChildItem "$lh/src/gumbo" -Filter '*.c')) {
 $jobs.Add(@{source=$file.FullName;obj="$out/gumbo_$($file.BaseName).o";compiler='cc';extra=@("-I$lh/src/gumbo/include","-I$lh/src/gumbo/include/gumbo")})
}
foreach ($file in (Get-ChildItem "$lh/src" -Filter '*.cpp')) {
 $jobs.Add(@{source=$file.FullName;obj="$out/lh_$($file.BaseName).o";compiler='c++';extra=@('-std=c++17',"-I$lh/include","-I$lh/include/litehtml","-I$lh/src/gumbo/include","-I$lh/src/gumbo/include/gumbo")})
}
foreach ($unit in $(if ($Preview) {@()} else {@('drm_disp','touch_input','key_input','backlight','json','data')})) {
 $jobs.Add(@{source="$up/src/$unit.c";obj="$out/$unit.o";compiler='cc';extra=@('-std=c11',"-I$up/include");depends=@(Get-ChildItem -LiteralPath "$up/include" -Filter "*.h" -File | ForEach-Object {$_.FullName})})
}
$jobs.Add(@{source="$up/src/html_view.cpp";obj="$out/html_view.o";compiler='c++';extra=@('-std=c++17',"-I$up/include","-I$ft/include","-I$lh/include","-I$lh/include/litehtml","-I$up/third_party/stb")})
if (!$LibrariesOnly) {
 if ($Preview) { $jobs.Add(@{source="$root/render_preview.cpp";obj="$out/render_preview.o";compiler='c++';extra=@('-std=c++17')}) }
 else { $jobs.Add(@{source="$root/topflow_main.c";obj="$out/topflow_main.o";compiler='cc';extra=@('-std=c11',"-I$up/include");depends=@("$root/control_logic.h","$root/modem_logic.h","$root/modem_pages.h","$root/form_logic.h","$root/pinyin_logic.h","$root/pinyin_data.h","$root/form_pages.h","$root/apn_pages.h","$root/power_pages.h","$root/service_pages.h","$root/traffic_pages.h","$root/vendor_modem.h","$root/local_http.h","$root/aoyou_native.h","$root/advanced_controls.h","$root/gesture.h","$root/transition.h","$root/display_policy.h","$root/display_native.h","$root/display_pages.h","$root/factory_extra_pages.h","$root/factory_extra_protocol.h","$root/pin_policy.h","$root/pin_native.h","$root/pin_view.h","$root/display_handover.h","$root/display_runtime.h","$root/factory_bus_client.h","$root/factory_bus_protocol.h","$root/factory_guard.h","$root/factory_lifecycle.h","$root/ufi_auth.h","$root/ufi_local_credential.h","$root/sms_forward_pages.h","$up/include/drm_disp.h","$up/include/data.h")}) }
}
foreach($job in $jobs){$job.depends=@($job.depends | Where-Object {$_})+@("$up/include/devui_config.h","$up/include/touch_input.h");if($job.source -eq "$root/topflow_main.c"){$job.depends=@($job.depends | Where-Object {$_})+@(Get-ChildItem -LiteralPath $root -Filter '*.h' -File | ForEach-Object {$_.FullName})};if($job.source -eq "$up/src/key_input.c"){$job.depends+=@("$root/key_press.h")}}
$jobs | ForEach-Object -Parallel {
 $j = $_
 if (!(Test-Path $j.source)) { throw "Missing source: $($j.source)" }
 $headersChanged=$false
 if(Test-Path $j.obj){foreach($header in $j.depends){if((Get-Item $header).LastWriteTimeUtc -gt (Get-Item $j.obj).LastWriteTimeUtc){$headersChanged=$true}}}
 if (!(Test-Path $j.obj) -or ((Get-Item $j.source).LastWriteTimeUtc -gt (Get-Item $j.obj).LastWriteTimeUtc) -or $headersChanged -or $using:Clean) {
  $argv = @($j.compiler) + $using:common + $j.extra + @('-c',$j.source,'-o',$j.obj)
  $result = & $using:zig @argv 2>&1
  if ($LASTEXITCODE -ne 0) { throw "$($j.source): $result" }
  Write-Output "Compiled $([IO.Path]::GetFileName($j.source))"
 }
} -ThrottleLimit 6
$objects = @($jobs | ForEach-Object { $_.obj })
foreach ($obj in $objects) { if (!(Test-Path $obj)) { throw "Compilation incomplete: $obj" } }
if ($LibrariesOnly) { return }
$binary = if ($Preview) {"$root/bin/render-preview.exe"} else {"$root/bin/topflow-screen-aarch64"}
& $zig 'c++' '-target' $target '-static' '-Wl,--gc-sections' '-pthread' '-lm' '-s' @objects '-o' $binary
if ($LASTEXITCODE -ne 0) { throw 'Link failed' }
Get-FileHash $binary -Algorithm SHA256
