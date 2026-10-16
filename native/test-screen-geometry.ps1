$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$source=@'
#include <assert.h>
#include <limits.h>
#include <stdio.h>
#include "screen_geometry.h"
int main(void){int r[4];
 assert(DEVUI_ROTATE_180==0&&DEVUI_TOUCH_ROTATE_180==0);
 assert(DEVUI_TOUCH_SWAP_XY==0&&DEVUI_TOUCH_INVERT_X==0&&DEVUI_TOUCH_INVERT_Y==0);
 assert(tf_screen_damage(320,480,70,260,180,6,r));
 assert(r[0]==70&&r[1]==260&&r[2]==249&&r[3]==265);
 assert(tf_screen_damage(320,480,21,142,278,37,r));
 assert(r[0]==21&&r[1]==142&&r[2]==298&&r[3]==178);
 assert(tf_screen_damage(320,480,-5,-5,10,10,r)&&r[0]==0&&r[1]==0&&r[2]==4&&r[3]==4);
 assert(tf_screen_damage(320,480,319,479,INT_MAX,INT_MAX,r)&&r[2]==319&&r[3]==479);
 assert(!tf_screen_damage(320,480,0,0,0,1,r));
 assert(!tf_screen_damage(320,480,-5,-5,5,5,r));
 assert(!tf_screen_damage(320,480,320,0,1,1,r));
 assert(tf_screen_slide_direction(1)==1&&tf_screen_slide_direction(-1)==-1);
 puts("PASS: TopFlow upright render/touch profile, actual chart/loading damage rectangles, clipping, overflow and slide direction");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-screen-geometry.c",$source)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/build-preview/test-screen-geometry.c" -o "$root/bin/test-screen-geometry.exe"
if($LASTEXITCODE -ne 0){throw 'Screen geometry test build failed'}
& "$root/bin/test-screen-geometry.exe"
if($LASTEXITCODE -ne 0){throw 'Screen geometry test failed'}
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
if($main -notmatch 'html_view_init\(d.fb,d.width,d.height,d.pitch_px,DEVUI_ROTATE_180,font\)'){throw 'Main renderer must use the tested board orientation'}
if($main -notmatch 'logical_damage\(active_display,70,260,180,6\)' -or $main -notmatch 'logical_damage\(d,chart_animation.x,chart_animation.y,chart_animation.w,chart_animation.h\)'){throw 'Partial updates must use logical damage mapping'}
if($main -notmatch 'tf_screen_slide_direction\(swipe_direction\)'){throw 'Slide animation must follow board orientation'}
