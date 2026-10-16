$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$native=[IO.File]::ReadAllText("$root/display_native.h")
$setter=@($native -split '\r?\n' | Where-Object {$_.StartsWith('static int display_write_setting(')})
if($setter.Count -ne 1){throw 'Missing production brightness setter'}
$source=@'
#include <assert.h>
#include <stdio.h>
#include "display_policy.h"
static tf_display_policy p;
static uint32_t now,last_write;
static int writes;
static tf_display_policy display_policy;
static tf_display_config display_config,read_config;
static int output_writes,commits,next_kind,next_value,commit_fail,tf_http_cancelled,prepare_mode,prepare_calls;
static uint32_t tick(void){return now;}
static int backlight_is_on(void){return display_policy.on;}
static int level_hook(int level){assert(level>=10&&level<=255);output_writes++;return 1;}
static int(*display_level_hook)(int)=level_hook;
static int(*display_auto_sensor_hook)(void)=NULL;static const char*display_config_failure;
static int display_read_settings_config(tf_display_config*c){*c=read_config;return tf_display_policy_valid(c);}
static int vendor_exec(const char*path,char*const args[],const char*input,char*out,size_t cap){assert(!strcmp(path,"/sbin/uci")&&!strcmp(args[2],"batch"));assert(strstr(input,"commit zwrt_deviceui\n"));commits++;if(commit_fail)return 1;if(next_kind==0)read_config.automatic=next_value;else if(next_kind==1)read_config.brightness=next_value;else read_config.timeout_seconds=next_value;if(cap)*out=0;return 0;}
static int prepare_auto(void){prepare_calls++;if(prepare_mode==1)return 0;read_config.sensor_enabled=1;read_config.sensor_lux=40;if(prepare_mode==2)read_config.pin_enabled=1;if(prepare_mode==3)tf_http_cancelled=1;return 1;}
PRODUCTION_SETTER
static void start(int lux,int level,uint32_t time){tf_display_config c={0,1,135,-1,0,1,lux,level,255};assert(tf_display_init(&p,&c,time));now=time;last_write=time;writes=0;}
static void step(int lux,int valid,int direction){int before=p.brightness;now+=100;assert(tf_display_tick(&p,now,lux,valid,0)==TF_DISPLAY_NO_CHANGE);int r=tf_display_animate(&p,now);assert(r==TF_DISPLAY_NO_CHANGE||r==TF_DISPLAY_LEVEL);if(r==TF_DISPLAY_LEVEL){assert(now-last_write>=100);assert(abs(p.brightness-before)<=3);assert(p.brightness>=10&&p.brightness<=255);if(direction)assert((p.brightness-before)*direction>0);last_write=now;writes++;}}
static void seconds(int count,int lux,int valid,int direction){for(int i=0;i<count*10;i++)step(lux,valid,direction);}
int main(void){
 /* Jitter around the steep low-light portion must settle rather than flash. */
 start(5,tf_display_curve(5),0);for(int i=0;i<120;i++)seconds(1,i%2?4:6,1,0);assert(writes==0);
 /* Single second covering/uncovering the sensor never moves the backlight. */
 start(40,135,0);seconds(1,0,1,0);seconds(5,40,1,0);seconds(1,10000,1,0);seconds(5,40,1,0);assert(writes==0&&p.brightness==135);
 /* Sustained changes converge monotonically, with bounded steps and rate. */
 start(3,13,0);seconds(1,200,1,1);assert(writes==0);seconds(29,200,1,1);assert(p.brightness>=247&&p.brightness<=255);int stable=p.brightness;writes=0;seconds(10,200,1,1);assert(p.brightness==stable&&writes==0);
 seconds(30,0,1,-1);assert(p.brightness>=10&&p.brightness<=18);stable=p.brightness;writes=0;seconds(10,0,1,-1);assert(p.brightness==stable&&writes==0);
 /* A stalled loop never jumps to catch up; stale or failed samples freeze. */
 start(3,13,0);seconds(3,200,1,1);assert(p.auto_target>p.brightness);stable=p.brightness;seconds(1,-1,0,0);stable=p.brightness;seconds(3,-1,0,0);assert(p.brightness==stable);
 start(3,13,0);seconds(3,200,1,1);stable=p.brightness;now+=4000;assert(tf_display_animate(&p,now)==TF_DISPLAY_NO_CHANGE&&p.brightness==stable);assert(tf_display_tick(&p,now,200,1,0)==TF_DISPLAY_NO_CHANGE);assert(tf_display_animate(&p,now)==TF_DISPLAY_LEVEL&&p.brightness-stable<=3);
 /* Sleep cancels queued ramps; wake seeds fresh history, no off/on loop. */
 assert(tf_display_sleep(&p)==TF_DISPLAY_SLEEP&&p.auto_target==0);now+=100;assert(tf_display_animate(&p,now)==TF_DISPLAY_NO_CHANGE&&p.brightness==0);assert(tf_display_wake(&p,now)==TF_DISPLAY_LEVEL&&p.auto_target==p.brightness);assert(tf_display_animate(&p,now+100)==TF_DISPLAY_NO_CHANGE);
 /* Invalid out-of-range values cannot enter the curve or change the output. */
 stable=p.brightness;seconds(2,10000001,1,0);assert(!p.sensor_valid&&p.brightness==stable);
 /* uint32 clock wrap, manual mode, and actual idle timeout remain valid. */
 start(3,13,UINT32_MAX-1500);seconds(20,200,1,1);assert(p.brightness>230);p.config.automatic=0;stable=p.brightness;seconds(20,0,1,0);assert(p.brightness==stable);p.config.automatic=1;p.config.timeout_seconds=1;p.last_activity=now;now+=1000;assert(tf_display_tick(&p,now,200,1,0)==TF_DISPLAY_SLEEP);assert(tf_display_animate(&p,now)==TF_DISPLAY_NO_CHANGE);
 /* Actual settings handler: enabling auto never jumps, changing timeout never
  * changes brightness, disabling auto restores the user's exact manual level. */
 read_config=(tf_display_config){0,0,100,30,0,1,200,100,255};assert(tf_display_init(&display_policy,&read_config,now));next_kind=0;next_value=1;assert(display_write_setting(0,1)&&commits==1&&output_writes==0&&display_policy.brightness==100);now+=1000;assert(tf_display_tick(&display_policy,now,200,1,0)==TF_DISPLAY_NO_CHANGE);assert(tf_display_animate(&display_policy,now)==TF_DISPLAY_LEVEL&&display_policy.brightness<=103);
 next_kind=1;next_value=200;assert(!display_write_setting(1,200)&&commits==1&&output_writes==0);
 next_kind=2;next_value=60;stable=display_policy.brightness;assert(display_write_setting(2,60)&&commits==2&&output_writes==0&&display_policy.brightness==stable);
 next_kind=0;next_value=0;assert(display_write_setting(0,0)&&commits==3&&output_writes==1&&display_policy.brightness==100);now+=1000;assert(tf_display_animate(&display_policy,now)==TF_DISPLAY_NO_CHANGE);next_kind=1;next_value=180;assert(display_write_setting(1,180)&&commits==4&&output_writes==2&&display_policy.brightness==180);assert(!display_write_setting(1,999)&&commits==4);
 /* Missing transient sensor data must not block manual brightness/timeout;
  * enabling adaptive mode still requires a real ready sensor sample. */
 read_config.sensor_enabled=read_config.sensor_lux=-1;next_kind=1;next_value=120;assert(display_write_setting(1,120)&&commits==5&&output_writes==3);next_kind=2;next_value=120;assert(display_write_setting(2,120)&&commits==6&&output_writes==3);assert(!display_write_setting(0,1)&&commits==6);

 /* Sensor preparation is confirmed-only; failure and cancellation never
  * commit, and a failed commit preserves the previous fixed preference. */
 display_auto_sensor_hook=prepare_auto;prepare_mode=1;int count=commits;assert(!display_write_setting(0,1)&&prepare_calls==1&&commits==count&&!read_config.automatic&&!display_policy.config.automatic);
 prepare_mode=2;assert(!display_write_setting(0,1)&&prepare_calls==2&&commits==count&&!display_policy.config.automatic);read_config.pin_enabled=0;read_config.sensor_enabled=0;read_config.sensor_lux=-1;
 prepare_mode=3;assert(!display_write_setting(0,1)&&prepare_calls==3&&commits==count&&!read_config.automatic&&!strcmp(display_config_failure,"DISPLAY_SETTING_CANCELLED"));tf_http_cancelled=0;read_config.sensor_enabled=0;read_config.sensor_lux=-1;
 prepare_mode=0;commit_fail=1;next_kind=0;next_value=1;stable=display_policy.brightness;assert(!display_write_setting(0,1)&&prepare_calls==4&&commits==count+1&&!read_config.automatic&&!display_policy.config.automatic&&display_policy.brightness==stable&&output_writes==3);
 commit_fail=0;assert(display_write_setting(0,1)&&commits==count+2&&read_config.automatic&&display_policy.config.automatic&&display_policy.brightness==stable&&output_writes==3);
 puts("PASS: auto brightness rejects low-light jitter and isolated spikes; sustained changes ramp monotonically <=3 levels/100ms; steady-state zero writes; invalid/stale readings freeze; sleep/wake/manual/clock wrap preserved; unavailable sensor does not disable fixed brightness or timeout");return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-auto-brightness.c",$source.Replace('PRODUCTION_SETTER',$setter[0]))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-auto-brightness.c" -o "$root/bin/test-auto-brightness.exe"
if($LASTEXITCODE -ne 0){throw 'Auto brightness test build failed'}
& "$root/bin/test-auto-brightness.exe"
if($LASTEXITCODE -ne 0){throw 'Auto brightness test failed'}
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
if($main -notmatch '!interacting&&!busy_visible&&tf_display_animate' -or $main -match 'backlight_set\('){throw 'Smooth brightness must use existing lifecycle outside gestures'}
if($main -notmatch 'tf_display_tick\(&display_policy,tick\(\),lux' -or $main -notmatch 'tf_display_animate\(&display_policy,tick\(\)\)'){throw 'Display timers must be sampled after potentially blocking actions to prevent stale-clock underflow'}
Write-Output 'PASS: production ramp is deferred during swipe and uses the existing lifecycle'
