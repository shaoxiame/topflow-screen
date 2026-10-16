$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$paint=$main.Substring($main.IndexOf('static int paint_frame(drm_disp_t*d'),$main.IndexOf('static int render(')-$main.IndexOf('static int paint_frame(drm_disp_t*d'))
$beat=$main.Substring($main.IndexOf('static void heartbeat('),$main.IndexOf('static uint32_t tick(')-$main.IndexOf('static void heartbeat('))
$beat=$beat.Replace('fopen(','test_fopen(').Replace('fprintf(','test_fprintf(').Replace('fclose(','test_fclose(').Replace('time(NULL)','1')
$source=@'
#include <stdio.h>
#include <assert.h>
typedef struct {int width,height;} drm_disp_t;
static int frame_ready=0,page_h=0,stub_height=480,flushes=0,beats=0,flush_error=0,deferred_present=0;
static long long mono_now=5000,last_heartbeat=-1;
static long long monotonic_seconds(void){return mono_now;}
static int html_view_render_html(const char*s){(void)s;return stub_height;}
static void draw_rate_chart(void){}
static int drm_disp_dirty(drm_disp_t*d,int a,int b,int c,int e){(void)d;(void)a;(void)b;(void)c;(void)e;flushes++;return flush_error;}
static FILE*test_fopen(const char*p,const char*m){(void)p;(void)m;beats++;return(FILE*)1;}
static int test_fprintf(FILE*f,const char*fmt,long long value){(void)f;(void)fmt;last_heartbeat=value;return 1;}
static int test_fclose(FILE*f){(void)f;return 0;}
PAINT
BEAT
int main(void){drm_disp_t d={320,480};heartbeat();assert(!beats);
 deferred_present=1;assert(paint_frame(&d,"<html></html>")&&!frame_ready&&!flushes);heartbeat();assert(!beats);deferred_present=0;
 stub_height=-1;assert(!paint_frame(&d,"<html></html>"));heartbeat();assert(!beats&&!flushes&&!frame_ready);
 stub_height=0;assert(!paint_frame(&d,"<html></html>"));heartbeat();assert(!beats&&!flushes&&!frame_ready);
 stub_height=480;assert(paint_frame(&d,"<html></html>"));heartbeat();assert(beats==1&&flushes==1&&frame_ready&&page_h==480);
 /* A normal screen-off tick is alive after a previously successful frame. */
 heartbeat();assert(beats==2&&last_heartbeat==5000); /* Wall time/NTP is not used. */
 stub_height=-1;assert(!paint_frame(&d,"<html></html>"));heartbeat();assert(beats==2&&flushes==1&&!frame_ready);
 assert(!paint_frame(&d,NULL));heartbeat();assert(beats==2);
 stub_height=480;flush_error=-5;assert(!paint_frame(&d,"<html></html>"));heartbeat();assert(beats==2&&!frame_ready);
 flush_error=0;assert(paint_frame(&d,"<html></html>"));mono_now=5002;heartbeat();assert(last_heartbeat==5002);int before=beats;mono_now=-1;heartbeat();assert(beats==before);
 puts("PASS: no readiness before first frame; first/subsequent render failure cannot heartbeat; successful frame and normal standby remain live");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-render-health.c",$source.Replace('PAINT',$paint).Replace('BEAT',$beat))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "$root/build-preview/test-render-health.c" -o "$root/bin/test-render-health.exe"
if($LASTEXITCODE -ne 0){throw 'Frame health test build failed'}
& "$root/bin/test-render-health.exe"
if($LASTEXITCODE -ne 0){throw 'Frame health test failed'}
[IO.File]::WriteAllText("$root/build-preview/invalid-font.txt",'not a font')
$failure=& "$root/bin/render-preview.exe" "$root/preview/index-filled.html" "$root/ui" "$root/build-preview/invalid-font.txt" "$root/build-preview/invalid-font.ppm" 2>&1
if($LASTEXITCODE -ne 5){throw "Invalid font must fail initialization: $failure"}
Write-Output 'PASS: same-engine FreeType invalid font fails initialization with exit 5'
$global:LASTEXITCODE=0 # The nonzero child status above is the expected test result.
