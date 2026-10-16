$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$source=[IO.File]::ReadAllText("$root/topflow_main.c")
$from=$source.IndexOf('static const char rate_chart[]')
$to=$source.IndexOf('static void token_raw(', $from)
if($from -lt 0 -or $to -lt $from){throw 'Chart source section absent'}
$functions=$source.Substring($from,$to-$from)
$test=@'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <assert.h>
#include "json.h"
#include "rate_history.h"
#include "lockscreen_chart.h"
#include "screen_geometry.h"
typedef struct{int width,height;}drm_disp_t;
static char page[32]="index.html";
static uint32_t now=1000;
static int have_rect=1,draws=0,restores=0,flushes=0,fail_flush=0,latest_n=0;
static double latest_rx[30],latest_tx[30];
static int clip_top=0;
static int html_view_pinned_height(void){return 67;}
static void html_view_set_clip_top(int y){clip_top=y;}
static uint32_t tick(void){return now;}
static int html_view_rect(const char*s,int*x,int*y,int*w,int*h){assert(!strcmp(s,"#rate-chart"));*x=26;*y=171;*w=268;*h=37;return have_rect;}
static int html_view_chart_save(int x,int y,int w,int h){assert(x==26&&y==171&&w==268&&h==37);return 1;}
static int html_view_chart_restore(void){assert(clip_top==67);restores++;return 1;}
static void html_view_rate_chart(int x,int y,int w,int h,const double*rx,const double*tx,int n){assert(clip_top==67);assert(x==26&&y==171&&w==268&&h==37&&n<=30);draws++;latest_n=n;memcpy(latest_rx,rx,(size_t)n*sizeof(double));memcpy(latest_tx,tx,(size_t)n*sizeof(double));}
static int drm_disp_dirty(drm_disp_t*d,int x0,int y0,int x1,int y1){(void)d;assert(x0==26&&y0==171&&x1==293&&y1==207);flushes++;return fail_flush?-1:0;}
FUNCTIONS
int main(void){
 update_chart("{\"ts\":1}",100,20,200,40);assert(chart_history[0].count==1&&strstr(rate_chart,"rate-chart"));
 update_chart("{\"ts\":1}",999,999,999,999);assert(chart_history[0].count==1&&chart_history[0].rx[0]==100);
 update_chart("{\"ts\":2}",0,0,-1,-1);assert(chart_history[0].count==2&&chart_history[0].rx[1]==0&&chart_history[1].rx[1]==-1);
 char raw[64];for(int i=3;i<=34;i++){snprintf(raw,sizeof raw,"{\"ts\":%d}",i);update_chart(raw,i*10,i,i*20,i*2);}assert(chart_history[0].count==30&&chart_history[0].next==4);double rx[30],tx[30];assert(tf_rate_order(&chart_history[0],rx,tx)==30&&rx[0]==50&&rx[29]==340);
 draw_rate_chart();assert(!chart_animation.active&&latest_n==30&&latest_rx[29]==340);
 update_chart("{\"ts\":35}",400,40,800,80);draw_rate_chart();assert(chart_animation.active&&latest_rx[29]==340&&clip_top==0);drm_disp_t d={320,480};assert(chart_animation_tick(&d,now+44)&&!flushes&&clip_top==0);assert(chart_animation_tick(&d,now+45)&&flushes==1&&latest_rx[29]==355&&clip_top==0);assert(chart_animation_tick(&d,now+180)&&flushes==2&&latest_rx[29]==400&&!chart_animation.active&&clip_top==0);assert(chart_animation_tick(&d,now+500)&&flushes==2&&clip_top==0);
 update_chart("{\"ts\":36}",NAN,INFINITY,-1,-1);now+=1000;draw_rate_chart();assert(latest_rx[29]==-1&&latest_tx[29]==-1);fail_flush=1;assert(!chart_animation_tick(&d,now+180));fail_flush=0;
 strcpy(page,"aggregate.html");draw_rate_chart();assert(!chart_animation.active&&latest_rx[28]==800);have_rect=0;draw_rate_chart();assert(!chart_animation.active&&!chart_animation.n);
 int before=chart_history[0].next;update_chart(NULL,0,0,0,0);assert(!chart_data_current&&chart_history[0].next==before);draw_rate_chart();
 have_rect=1;lock_chart_rendering=1;memset(&chart_animation,0,sizeof chart_animation);assert(tf_lock_chart_sample(&lock_chart,0,40,120,20));draw_rate_chart();assert(latest_n==1&&latest_rx[0]==120&&!chart_animation.active&&chart_animation.scope==2);
 assert(tf_lock_chart_sample(&lock_chart,0,41,200,40));now+=1000;draw_rate_chart();assert(chart_animation.active&&latest_n==2&&latest_rx[1]==120);assert(chart_animation_tick(&d,now+90)&&latest_rx[1]==160);assert(chart_animation_tick(&d,now+180)&&latest_rx[1]==200&&!chart_animation.active);
 /* Re-entry starts with exactly one current sample, even in the same mode. */
 lock_chart.current=0;lock_chart.mode=-1;memset(&chart_animation,0,sizeof chart_animation);assert(tf_lock_chart_sample(&lock_chart,0,99,800,80));draw_rate_chart();assert(latest_n==1&&latest_rx[0]==800&&!chart_animation.active);assert(tf_lock_chart_sample(&lock_chart,0,100,900,90));now+=1000;draw_rate_chart();assert(latest_n==2&&latest_rx[0]==800&&latest_rx[1]==800);assert(chart_animation_tick(&d,now+180)&&latest_rx[1]==900);
 assert(tf_lock_chart_sample(&lock_chart,1,101,1500,150));draw_rate_chart();assert(latest_n==1&&latest_rx[0]==1500&&chart_animation.scope==3&&!chart_animation.active);
 tf_lock_chart_sample(&lock_chart,-1,-1,-1,-1);draw_rate_chart();assert(!chart_animation.active&&!chart_animation.n&&!lock_chart.current);assert(tf_lock_chart_sample(&lock_chart,1,200,1700,170));draw_rate_chart();assert(latest_n==1&&latest_rx[0]==1700&&!chart_animation.active);
 assert(clip_top==0);puts("PASS: homepage and lock scopes, 30-sample ring, duplicate/zero/gap semantics, growing real history, session/mode/stale resets, finite four-frame 180ms transition, no idle redraw, upright dirty bounds, pinned header clipping reset and flush failure");return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-chart.c",$test.Replace('FUNCTIONS',$functions))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/build-preview/test-chart.c" "$root/upstream/src/json.c" -o "$root/bin/test-chart.exe"
if($LASTEXITCODE -ne 0){throw 'Chart test build failed'}
& "$root/bin/test-chart.exe"
if($LASTEXITCODE -ne 0){throw 'Chart tests failed'}
