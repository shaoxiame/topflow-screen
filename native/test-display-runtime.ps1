$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$runtime=[IO.File]::ReadAllText("$root/display_runtime.h")
$start=$runtime.IndexOf('static int display_runtime_fail(')
$end=$runtime.IndexOf('static void display_runtime_cleanup(')
if($start -lt 0 -or $end -le $start){throw 'Runtime source boundaries missing'}
$implementation=$runtime.Substring($start,$end-$start)
$prefix=@'
#include <assert.h>
#include <stdio.h>
#include <stdint.h>
#include "factory_lifecycle.h"
#include "display_handover.h"
#include "display_policy.h"
#include "factory_bus_protocol.h"
#include "display_idle_guard.h"
static tf_factory_lifecycle factory_lifecycle;
static struct{int ready,failed,resync;}factory_bus;
static tf_factory_guard factory_guard;
static tf_display_idle_guard display_idle_guard;
static tf_display_policy display_policy;
static int display_direct_wake,display_startup_guard_pending,display_startup_dormant;
static int test_oem_on;static int test_oem_gate(void){return test_oem_on;}static int(*display_power_on_hook)(void)=test_oem_gate;
static const char*failure_code;
static int helper_stops;
static int reported_pin,login_value,login_count;
static int vendor_exec(const char*path,char*const args[],const char*input,char*out,size_t cap){(void)path;(void)args;(void)input;snprintf(out,cap,"%d",reported_pin);return 0;}
static int running,tf_http_cancelled,display_runtime_ready,display_runtime_fault,factory_bus_active,frame_ready,display_frame_guard;
static int live,own,lcd,write_count,event_count,guard_count,release_count,touch_count,bad_touch;
static int bad_guard,bad_level,bad_event,bad_observe,bad_bus,bad_release,expire_on_login,expire_on_tick;
static uint32_t clock_ms;
static int idle_held,idle_writes,idle_releases,idle_fail_read,idle_fail_write;
static uint32_t idle_expires;
static int idle_read(void*ctx,char*out,size_t cap){(void)ctx;if(idle_fail_read)return -1;if(idle_held&&clock_ms>=idle_expires)idle_held=0;return snprintf(out,cap,"sysZteSleepLock zte_topsw_devui_auto_sleep_lock%s\n",idle_held?" topflow_screen_123_456_idle":"");}
static int idle_write(void*ctx,enum tf_guard_resource resource,const char*text,size_t n){(void)ctx;(void)n;if(idle_fail_write)return 0;if(resource==TF_GUARD_ACQUIRE){assert(!strcmp(text,"topflow_screen_123_456_idle 180000000000\n"));assert(live>0||lcd==1);idle_writes++;idle_held=1;idle_expires=clock_ms+180000;}else{assert(resource==TF_GUARD_RELEASE);assert(!strcmp(text,"topflow_screen_123_456_idle\n"));assert(live>0&&lcd==1);idle_releases++;idle_held=0;}return 1;}
static uint32_t tick(void){return clock_ms;}
static int poll(void*x,int n,int wait){(void)x;(void)n;clock_ms+=(uint32_t)wait;return 0;}
static int tf_fb_tick(void*x){(void)x;if(expire_on_tick)own=0;return !bad_bus;}
static void tf_fb_stop(void*x){assert(x==&factory_bus);helper_stops++;}
static int test_guard_acquire(void*x){(void)x;guard_count++;if(bad_guard)return 0;own=1;return 1;}
static int test_guard_release(void*x){(void)x;if(!own)return 1;release_count++;if(bad_release)return 0;own=0;return 1;}
static int test_guard_observe(void*x,const char*name){(void)x;return !strcmp(name,"zteSleepBacklight")?lcd:own;}
static void backlight_set(int value){write_count++;live=bad_level?value+1:value;}
static int display_read_number(const char*p,int lo,int hi,int*out){(void)p;(void)lo;(void)hi;*out=live;return 1;}
static void native_failure_note(const char*code){assert(code&&*code);if(!failure_code)failure_code=code;}
static int display_factory_process(void){return 0;}
static int wake_sensor_calls,wake_sensor_failed,power_cut_sensor,power_cancel_sensor;
static int display_runtime_wake_sensor(void){assert(frame_ready&&display_frame_guard&&own&&!factory_bus.resync);wake_sensor_calls++;if(power_cut_sensor){test_oem_on=0;return 0;}return power_cancel_sensor?2:!wake_sensor_failed;}
static int tf_fb_command(void*x,int type,uint32_t value,int timeout){(void)x;assert(timeout==2500);if(type==TF_BUS_TOUCH){assert(value==1);touch_count++;return !bad_touch;}if(type==TF_BUS_LOGIN){login_value=(int)value;login_count++;if(expire_on_login)own=0;}if(type==TF_BUS_LCD){event_count++;if(bad_event)return 0;if(!bad_observe)lcd=(int)value;}return 1;}
static void backlight_init(void){}
#define tf_guard_acquire test_guard_acquire
#define tf_guard_release test_guard_release
#define tf_guard_observe test_guard_observe
'@
$suffix=@'
static void reset(void){
 test_oem_on=1;power_cut_sensor=power_cancel_sensor=0;display_startup_dormant=0;
 memset(&factory_bus,0,sizeof factory_bus);factory_bus.ready=1;factory_bus_active=1;
 tf_guard_io io={NULL,idle_read,idle_write};assert(tf_guard_init(&factory_guard,123,456,io));assert(tf_idle_init(&display_idle_guard,&factory_guard));
 idle_held=idle_writes=idle_releases=idle_fail_read=idle_fail_write=0;idle_expires=0;
 running=1;tf_http_cancelled=0;display_runtime_ready=0;display_runtime_fault=0;display_frame_guard=0;frame_ready=1;live=0;lcd=0;own=1;reported_pin=1;login_value=-1;login_count=0;display_direct_wake=0;display_startup_guard_pending=1;helper_stops=0;failure_code=NULL;
 tf_display_config config={0,1,135,30,0,1,3,0,255};assert(tf_display_init_supported(&display_policy,&config,100,1));
 write_count=event_count=guard_count=release_count=touch_count=bad_touch=wake_sensor_calls=wake_sensor_failed=0;bad_guard=bad_level=bad_event=bad_observe=bad_bus=bad_release=expire_on_login=expire_on_tick=0;clock_ms=100;display_runtime_touch(0,clock_ms);
 tf_fl_snapshot s={1,1,1,1,1,1,0,0,0};tf_fl_init(&factory_lifecycle);assert(tf_fl_prepare(&factory_lifecycle,TF_FL_REQUIRED,&s));
}
static int start_adopt(void){return display_runtime_begin_frame()&&display_runtime_adopt();}
static int start_resync(void){return display_runtime_begin_frame()&&display_runtime_resync();}
int main(void){
 tf_display_receipt r={1,0,0,1,135,30,0,1,3,0,0,1},parsed;char text[384];assert(tf_receipt_format(text,sizeof text,&r)&&tf_receipt_parse(text,&parsed)&&parsed.pin==1&&parsed.automatic==1&&parsed.level==135&&parsed.timeout==30&&parsed.direct==1);
 r.sensor=0;r.lux=-1;r.internal=r.auto_lock=1;assert(tf_receipt_format(text,sizeof text,&r)&&tf_receipt_parse(text,&parsed)&&parsed.sensor==0&&parsed.lux==-1&&parsed.internal==1&&parsed.auto_lock==1);
 r.direct=0;assert(!tf_receipt_format(text,sizeof text,&r));r.direct=1;r.lux=-2;assert(!tf_receipt_format(text,sizeof text,&r));r.lux=10000001;assert(!tf_receipt_format(text,sizeof text,&r));r.lux=0;r.timeout=0;assert(!tf_receipt_format(text,sizeof text,&r));r.timeout=30;
 assert(!tf_receipt_parse("DISPLAY_PREFLIGHT_OK PIN_GUARD=none BRIGHTNESS=01 LCDLOCK=1",&parsed));
 assert(!tf_receipt_parse("DISPLAY_PREFLIGHT_OK PIN_GUARD=none BRIGHTNESS=1 SUSPENDED=1 LCDLOCK=1",&parsed));
 assert(!tf_receipt_parse("DISPLAY_PREFLIGHT_OK PIN_GUARD=initial-300s-v1",&parsed));
 assert(!tf_receipt_parse("DISPLAY_PREFLIGHT_OK PIN_GUARD=none BRIGHTNESS=0 LCDLOCK=0\n",&parsed));
 assert(tf_vendor_internal_lock("")==0&&tf_vendor_internal_lock("zte_topsw_data 17634\nzte_sleep 18210\n")==0);
 assert(tf_vendor_internal_lock("zte_topsw_devui 18392\n")==1&&tf_vendor_internal_lock("zte_topsw_devui_other 18392\n")==0);
 assert(tf_vendor_internal_lock("zte_topsw_devui unknown\n")==-1&&tf_vendor_internal_lock("bad name 1\n")==-1);
 reset();own=0;assert(!display_runtime_begin_frame()&&!running&&tf_http_cancelled&&helper_stops==1&&!factory_bus_active&&!display_startup_guard_pending&&guard_count==0&&write_count==0&&event_count==0);assert(failure_code&&!strcmp(failure_code,"ADOPT_GUARD_ACTIVE"));
 reset();expire_on_tick=1;assert(!display_runtime_begin_frame()&&!running&&helper_stops==1&&!factory_bus_active&&guard_count==0);assert(failure_code&&!strcmp(failure_code,"ADOPT_GUARD_ACTIVE"));
 reset();display_startup_guard_pending=0;expire_on_tick=1;assert(display_runtime_begin_frame()&&running&&own&&guard_count==1&&helper_stops==0);
 reset();display_direct_wake=1;assert(start_adopt()&&display_runtime_ready&&live==13&&lcd==1&&display_policy.on&&!display_policy.locked&&login_value==1&&display_policy.last_activity==100&&idle_writes==0&&write_count==1&&event_count==1&&guard_count==2&&release_count==1&&!own);
 reset();display_direct_wake=1;live=135;lcd=1;assert(start_adopt()&&live==13&&lcd==1&&!display_policy.locked&&login_value==1&&idle_writes==0&&event_count==1);
 reset();display_policy.config.pin_enabled=1;display_policy.locked=1;display_direct_wake=1;assert(start_adopt()&&display_policy.locked&&login_value==0&&login_count==1);
 reset();display_direct_wake=1;bad_level=1;assert(!start_adopt()&&!running&&!display_runtime_ready&&live!=13);
 reset();display_direct_wake=1;frame_ready=0;assert(!start_adopt()&&!running&&write_count==0);
 reset();display_direct_wake=1;expire_on_login=1;assert(!start_adopt()&&!running&&write_count==0&&event_count==0&&guard_count==1);
 reset();assert(start_adopt()&&display_runtime_ready&&!own&&event_count==1&&guard_count==2&&release_count==1);assert(write_count==0);
 assert(display_runtime_request(13)&&live==13&&lcd==1&&!own);assert(write_count==1&&event_count==2);
 assert(display_runtime_request(135)&&live==135&&event_count==2);assert(display_runtime_request(0)&&lcd==0&&!own&&event_count==3);assert(idle_writes==1&&idle_held&&idle_expires==180100);assert(display_runtime_request(0)&&idle_writes==1);assert(display_runtime_request(13)&&idle_releases==1&&!idle_held);assert(display_runtime_request(0)&&idle_writes==2);
 reset();assert(start_adopt()&&idle_writes==0);assert(display_runtime_request(0)&&idle_writes==0);assert(display_runtime_request(13));assert(display_runtime_request(0)&&idle_writes==1);clock_ms=200000;assert(display_runtime_request(0)&&idle_writes==1);assert(display_runtime_request(13)&&idle_releases==0&&!idle_held);assert(display_runtime_request(0)&&idle_writes==2);
 reset();assert(start_adopt());assert(display_runtime_request(13));idle_fail_write=1;int before=write_count;assert(!display_runtime_request(0)&&!running&&write_count==before&&live>0);
 reset();assert(start_adopt());assert(display_runtime_request(13));idle_fail_read=1;before=write_count;assert(!display_runtime_request(0)&&!running&&write_count==before&&idle_held&&idle_expires==180100);
 reset();assert(start_adopt());assert(display_runtime_request(13));assert(display_runtime_request(0));idle_fail_write=1;assert(!display_runtime_request(13)&&!running&&lcd==1&&idle_held&&idle_expires==180100);
 reset();assert(start_adopt());assert(display_runtime_request(13));bad_level=1;assert(!display_runtime_request(0)&&!running&&idle_held&&idle_expires==180100);
 reset();bad_guard=1;assert(!start_adopt()&&!running&&tf_http_cancelled&&event_count==0&&write_count==0);
 reset();assert(start_adopt());bad_level=1;assert(!display_runtime_request(13)&&!running&&own&&event_count==1);
 reset();bad_event=1;assert(!start_adopt()&&!running&&own);
 reset();assert(start_adopt());bad_observe=1;assert(!display_runtime_request(13)&&!running&&own&&clock_ms>=3100);
 reset();bad_bus=1;assert(!start_adopt()&&!running&&event_count==0);
 reset();bad_release=1;assert(!start_adopt()&&!running&&own);
 reset();assert(start_adopt());live=77;lcd=0;factory_bus.resync=1;assert(start_resync()&&display_policy.brightness==77&&lcd==1&&write_count==0&&!factory_bus.resync&&wake_sensor_calls==1);
 reset();assert(start_adopt());live=77;lcd=0;factory_bus.resync=1;wake_sensor_failed=1;assert(!start_resync()&&!running&&wake_sensor_calls==1);
 reset();assert(start_adopt());assert(display_runtime_request(13));live=0;assert(start_resync()&&idle_writes==1&&lcd==0);assert(start_resync()&&idle_writes==1&&!wake_sensor_calls);
 reset();assert(start_adopt());frame_ready=0;assert(!display_runtime_request(13)&&!running&&write_count==0);
 reset();assert(display_runtime_unlock_policy());reported_pin=0;assert(!display_runtime_unlock_policy()&&!running);
 reset();assert(start_adopt());assert(display_runtime_touch(1,100)&&touch_count==0);assert(display_runtime_request(13));display_policy.initialized=1;display_policy.on=1;display_policy.locked=1;assert(display_runtime_touch(1,200)&&touch_count==1&&display_policy.locked);assert(display_runtime_touch(1,449)&&touch_count==1&&display_policy.last_activity==449);assert(display_runtime_touch(1,450)&&touch_count==2);assert(display_runtime_touch(0,451)&&touch_count==2);assert(display_runtime_touch(1,452)&&touch_count==3);assert(display_runtime_request(0));assert(display_runtime_touch(1,800)&&touch_count==3);assert(display_runtime_request(13));bad_touch=1;assert(!display_runtime_touch(1,900)&&!running&&display_runtime_fault&&tf_http_cancelled);
 reset();assert(!display_runtime_adopt()&&!running);reset();assert(display_runtime_begin_frame());own=0;assert(!display_runtime_adopt()&&!running);reset();assert(start_adopt());assert(display_runtime_request(13));assert(display_runtime_begin_frame());int releases=release_count;assert(display_runtime_request(13)&&!own&&release_count==releases+1);
 reset();display_startup_dormant=1;display_direct_wake=1;assert(test_oem_on&&start_adopt()&&running&&!live&&!lcd&&!display_policy.on&&!write_count);
 reset();test_oem_on=0;display_direct_wake=1;assert(start_adopt()&&running&&!live&&!lcd&&!display_policy.on&&!write_count&&!idle_writes);assert(display_runtime_request(135)&&!live&&!write_count);assert(display_runtime_touch(1,400)&&!touch_count);
 reset();display_direct_wake=1;live=135;lcd=1;test_oem_on=0;assert(start_adopt()&&running&&!live&&!lcd&&!display_policy.on&&write_count==1&&idle_writes==1);assert(display_runtime_request(100)&&idle_writes==1&&!live);
 reset();assert(start_adopt());assert(display_runtime_request(135));test_oem_on=0;int old_touch=touch_count;assert(display_runtime_touch(1,500)&&touch_count==old_touch);assert(display_runtime_request(150)&&!live&&idle_writes==1);live=50;lcd=1;factory_bus.resync=1;assert(start_resync()&&!live&&!lcd&&!display_policy.on&&!wake_sensor_calls&&idle_writes==1&&running);test_oem_on=1;assert(display_runtime_request(90)&&live==90&&lcd==1);
 reset();assert(start_adopt());live=77;lcd=0;factory_bus.resync=1;power_cut_sensor=1;assert(start_resync()&&running&&!live&&!lcd&&!display_policy.on&&wake_sensor_calls==1);
 reset();assert(start_adopt());live=77;lcd=0;factory_bus.resync=1;power_cancel_sensor=1;assert(test_oem_on&&start_resync()&&running&&!live&&!lcd&&!display_policy.on&&!failure_code&&wake_sensor_calls==1);
 puts("PASS: actual display runtime receipt/map, guarded adopt and errors; OEM OFF blocks direct adoption, brightness, touch and resync wakes, normal ON restores control; finite idle lease is never renewed during repeated OFF; original locks remain untouched");return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-display-runtime.c",$prefix+"`n"+$implementation+"`n"+$suffix)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-display-runtime.c" -o "$root/bin/test-display-runtime.exe"
if($LASTEXITCODE -ne 0){throw 'Display runtime test build failed'}
& "$root/bin/test-display-runtime.exe"
if($LASTEXITCODE -ne 0){throw 'Display runtime test failed'}
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
if($main -match 'backlight_(on|off|set)\('){throw 'Main bypasses lifecycle brightness transport'}
if($main.IndexOf('display_prepare_adopt(argv[2])') -gt $main.IndexOf('drm_disp_init(&d)')){throw 'Provider ownership must precede DRM'}
if($main.IndexOf('if(!render(&d))') -gt $main.IndexOf('if(!display_runtime_adopt())')){throw 'Safe first frame must precede LCD adoption'}
if($main -notmatch 'factory_bus.power_event\|\|factory_bus.resync'){throw 'Blocking work must yield for sleep protocol'}
if($runtime.Substring($end) -match 'tf_guard_release\('){throw 'Cleanup releases a sleep lease before the supervisor recovery barrier'}
Write-Output 'PASS: main ownership/frame order, no brightness bypass, IPC hook cancellation'
