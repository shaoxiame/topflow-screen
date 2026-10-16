$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$source=@'
#include <assert.h>
#include <stdio.h>
#include "display_policy.h"
int main(void){
 int enabled=-1;assert(tf_display_factory_pin_enabled(0,&enabled)&&enabled==1);assert(tf_display_factory_pin_enabled(1,&enabled)&&enabled==0);enabled=-1;assert(!tf_display_factory_pin_enabled(-1,&enabled)&&enabled==-1);assert(!tf_display_factory_pin_enabled(2,&enabled)&&enabled==-1);assert(!tf_display_factory_pin_enabled(0,NULL));
 int n;assert(tf_display_lux("3 lux\n",&n)&&n==3);assert(tf_display_lux("0\n",&n)&&n==0);assert(!tf_display_lux("3 noise",&n));assert(!tf_display_lux("-1 lux",&n));assert(!tf_display_lux("9999999999999999 lux",&n));
 assert(tf_display_curve(0)==10&&tf_display_curve(1)==10&&tf_display_curve(2)==10&&tf_display_curve(3)==13&&tf_display_curve(40)==135&&tf_display_curve(41)==135&&tf_display_curve(200)==255&&tf_display_curve(201)==255&&tf_display_curve(-1)==-1);
 tf_display_config c;tf_display_config_empty(&c);assert(tf_display_preflight_reason(&c));
 c=(tf_display_config){1,1,135,30,0,1,3,0,255};assert(tf_display_valid(&c));assert(!strcmp(tf_display_preflight_reason(&c),"FACTORY_PIN_PROTOCOL_UNVERIFIED"));tf_display_policy p;assert(!tf_display_init(&p,&c,0)&&p.locked);assert(tf_display_wake(&p,0)==TF_DISPLAY_INVALID);
 assert(tf_display_init_supported(&p,&c,0,1)&&p.locked);assert(tf_display_wake(&p,1)==TF_DISPLAY_LEVEL&&p.locked);assert(tf_display_sleep(&p)==TF_DISPLAY_SLEEP&&p.locked);
 c.pin_enabled=0;assert(!tf_display_preflight_reason(&c));assert(tf_display_init(&p,&c,0)&&!p.on&&!p.locked);assert(tf_display_tick(&p,1000,200,1,0)==TF_DISPLAY_NO_CHANGE&&p.brightness==0&&!p.locked);
 tf_display_config observed=c;observed.sensor_enabled=0;observed.sensor_lux=-1;assert(tf_display_policy_valid(&observed)&&tf_display_live_valid(&observed)&&tf_display_same_policy(&c,&observed));assert(!tf_display_valid(&observed)&&!tf_display_init(&p,&observed,0));observed.pin_enabled=1;assert(!tf_display_same_policy(&c,&observed));assert(tf_display_init(&p,&c,0));
 assert(tf_display_wake(&p,2000)==TF_DISPLAY_LEVEL&&p.brightness==13&&!p.locked);
 assert(tf_display_tick(&p,2999,200,1,0)==TF_DISPLAY_NO_CHANGE&&p.brightness==13);assert(tf_display_tick(&p,3000,200,1,0)==TF_DISPLAY_NO_CHANGE&&p.auto_target==13);assert(tf_display_tick(&p,4000,200,1,0)==TF_DISPLAY_NO_CHANGE&&p.auto_target>13);assert(tf_display_animate(&p,4000)==TF_DISPLAY_LEVEL&&p.brightness==16);assert(tf_display_tick(&p,5000,0,0,0)==TF_DISPLAY_NO_CHANGE&&p.auto_target==16);assert(tf_display_animate(&p,5100)==TF_DISPLAY_NO_CHANGE&&p.brightness==16);
 tf_display_activity(&p,30000);assert(tf_display_tick(&p,59999,0,1,0)==TF_DISPLAY_NO_CHANGE);assert(tf_display_tick(&p,60000,0,1,0)==TF_DISPLAY_SLEEP&&!p.on&&!p.locked);
 assert(tf_display_wake(&p,UINT32_MAX-1000)==TF_DISPLAY_LEVEL);tf_display_activity(&p,UINT32_MAX-1000);assert(tf_display_tick(&p,1000,3,1,0)!=TF_DISPLAY_SLEEP);assert(tf_display_tick(&p,29000,3,1,0)==TF_DISPLAY_SLEEP);
 c.automatic=0;c.timeout_seconds=-1;c.sensor_enabled=c.sensor_lux=-1;assert(tf_display_init(&p,&c,0));tf_display_wake(&p,0);assert(p.brightness==135);assert(tf_display_tick(&p,86400000,1,1,0)==TF_DISPLAY_NO_CHANGE);
 c.wakeup_periodic=1;assert(!strcmp(tf_display_preflight_reason(&c),"FACTORY_PERIODIC_WAKE_UNVERIFIED"));c.wakeup_periodic=0;c.pin_enabled=-1;assert(tf_display_preflight_reason(&c));c.pin_enabled=0;c.timeout_seconds=0;assert(tf_display_preflight_reason(&c));
 puts("PASS: B22 PIN enum 0=enabled/1=disabled; unknown enum rejected; no-PIN startup/sleep/wake stay unlocked; configured PIN stays locked; factory lux curve; 30s timeout; monotonic wrap; sensor failure holds last brightness; manual/never mode");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-display-policy.c",$source)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-display-policy.c" -o "$root/bin/test-display-policy.exe"
if($LASTEXITCODE -ne 0){throw 'Display policy test build failed'}
& "$root/bin/test-display-policy.exe"
if($LASTEXITCODE -ne 0){throw 'Display policy test failed'}
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
if($main.IndexOf('display_preflight_receipt(') -lt 0 -or $main.IndexOf('display_preflight_receipt(') -gt $main.IndexOf('drm_disp_t d;if(drm_disp_init')){throw 'Display preflight is missing or too late'}
$io=[IO.File]::ReadAllText("$root/display_native.h");$io=$io.Substring(0,$io.IndexOf('/* Exact SDK setters'))
if($io.Contains('Lock_Screen_PIN_Value') -or $io -match '"(set|commit|delete) '){throw 'Preflight must not read PIN or write configuration'}
Write-Output 'PASS: read-only display preflight precedes DRM and never reads PIN value'
