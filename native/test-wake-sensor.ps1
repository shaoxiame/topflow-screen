$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$native=[IO.File]::ReadAllText("$root/display_native.h")
$prepare=$native.Substring($native.IndexOf('static int display_sensor_prepare('),$native.IndexOf('/* Exact SDK setters')-$native.IndexOf('static int display_sensor_prepare('))
$runtime=[IO.File]::ReadAllText("$root/display_runtime.h")
$start=$runtime.IndexOf('static int display_runtime_wake_sensor(void){')
$wake=$runtime.Substring($start,$runtime.IndexOf("/* Invoked only",$start)-$start)
$autoStart=$runtime.IndexOf("static int display_auto_sensor_guard_alive(void)")
$auto=$runtime.Substring($autoStart,$runtime.IndexOf("`n#endif",$autoStart)-$autoStart)
$source=@'
#include <assert.h>
#include <stdio.h>
#include "display_policy.h"
static tf_display_policy display_policy;
static int test_power_on=1;static int test_power_gate(void){return test_power_on;}static int(*display_power_on_hook)(void)=test_power_gate;
static tf_display_config display_config,observed;
static int frame_ready,guard,owner,tf_http_cancelled,enabled,enable_reads,lux_reads,sensor_writes,policy_reads;
static int read_fail,policy_fail,identity_fail,lux_fail,write_fail,expire_after_write;
static uint32_t now;
#define TF_FL_READY 2
static int display_runtime_ready,begin_calls,release_calls,begin_fail,release_fail,event_after_write,event_after_release,event_during_guard;
static struct {int phase,brightness;} factory_lifecycle;
static struct {int power_event,resync;} factory_bus;
static int display_runtime_begin_frame(void){begin_calls++;if(begin_fail)return 0;guard=1;return 1;}
static int display_runtime_request(int level){assert(level==factory_lifecycle.brightness);release_calls++;guard=0;if(event_after_release)factory_bus.power_event=1;return !release_fail;}

static const char*display_config_failure,*failure;
static uint32_t tick(void){return now;}
static int poll(void*p,int n,int ms){assert(!p&&!n&&ms==100);now+=(uint32_t)ms;return 0;}
static int display_sensor_guard_alive(void){if(event_during_guard)factory_bus.power_event=1;return guard&&!owner&&!tf_http_cancelled;}
static int display_read_policy_observed(tf_display_config*c){policy_reads++;*c=observed;c->sensor_enabled=c->sensor_lux=-1;return !policy_fail;}
static int display_sensor_identity(void){return !identity_fail;}
static int display_sensor_read_enable(int*out){enable_reads++;display_config_failure="ADOPT_SENSOR_READ";*out=enabled;return !read_fail;}
static int display_sensor_write_enabled(void){assert(frame_ready&&guard&&!owner&&enabled==0);sensor_writes++;if(write_fail)return 0;enabled=1;if(event_after_write)factory_bus.power_event=1;if(expire_after_write)guard=0;return 1;}
static int display_read_lux(int*out){lux_reads++;if(lux_fail)return 0;*out=41;return 1;}
static void native_failure_note(const char*code){failure=code;}
PRODUCTION_PREPARE
PRODUCTION_WAKE
PRODUCTION_AUTO
static void reset(void){test_power_on=1;observed=(tf_display_config){0,1,135,30,0,-1,-1,0,255};display_policy.config=display_config=observed;frame_ready=guard=1;owner=tf_http_cancelled=enabled=enable_reads=lux_reads=sensor_writes=policy_reads=read_fail=policy_fail=identity_fail=lux_fail=write_fail=expire_after_write=0;display_runtime_ready=1;factory_lifecycle.phase=TF_FL_READY;factory_lifecycle.brightness=135;factory_bus.power_event=factory_bus.resync=0;begin_calls=release_calls=begin_fail=release_fail=event_after_write=event_after_release=event_during_guard=0;now=100;failure=NULL;display_config_failure="none";}
int main(void){
 reset();test_power_on=0;assert(display_runtime_wake_sensor()==2&&!sensor_writes&&!policy_reads&&!failure);test_power_on=1;assert(display_runtime_wake_sensor()==1&&sensor_writes==1&&!failure);
 reset();assert(display_runtime_wake_sensor()&&sensor_writes==1&&enabled==1&&display_policy.config.sensor_enabled==1&&display_policy.config.sensor_lux==41&&display_config.sensor_lux==41);assert(display_runtime_wake_sensor()&&sensor_writes==1);
 reset();enabled=1;assert(display_runtime_wake_sensor()&&!sensor_writes&&lux_reads==1);
 reset();frame_ready=0;assert(!display_runtime_wake_sensor()&&!sensor_writes&&!policy_reads&&!strcmp(failure,"WAKE_SENSOR_GUARD"));
 reset();owner=1;assert(!display_runtime_wake_sensor()&&!sensor_writes&&!policy_reads);
 reset();guard=0;assert(!display_runtime_wake_sensor()&&!sensor_writes&&!policy_reads);
 reset();tf_http_cancelled=1;assert(!display_runtime_wake_sensor()&&!sensor_writes&&!policy_reads);
 reset();policy_fail=1;assert(!display_runtime_wake_sensor()&&!sensor_writes&&!strcmp(failure,"WAKE_POLICY_READ"));
 reset();observed.pin_enabled=1;assert(!display_runtime_wake_sensor()&&!sensor_writes&&!strcmp(failure,"WAKE_POLICY_CHANGED"));
 reset();observed.brightness=200;observed.timeout_seconds=120;assert(display_runtime_wake_sensor()&&sensor_writes==1&&display_policy.config.brightness==200&&display_policy.config.timeout_seconds==120&&!failure);
 reset();observed.wakeup_periodic=1;assert(!display_runtime_wake_sensor()&&!sensor_writes&&!strcmp(failure,"WAKE_POLICY_CHANGED"));
 reset();observed.automatic=0;observed.brightness=210;assert(display_runtime_wake_sensor()&&!sensor_writes&&!lux_reads&&!display_policy.config.automatic&&display_policy.config.brightness==210);
 reset();display_policy.config.automatic=0;display_policy.locked=1;display_policy.last_activity=42;assert(display_runtime_wake_sensor()&&sensor_writes==1&&display_policy.config.automatic&&display_policy.locked==1&&display_policy.last_activity==42);
 reset();read_fail=1;assert(!display_runtime_wake_sensor()&&!sensor_writes&&now<=2100&&!strcmp(failure,"WAKE_SENSOR_PREPARE"));
 reset();write_fail=1;assert(!display_runtime_wake_sensor()&&sensor_writes==1);
 reset();identity_fail=1;assert(!display_runtime_wake_sensor()&&!sensor_writes);
 reset();lux_fail=1;assert(!display_runtime_wake_sensor()&&sensor_writes==1&&now<=2100);
 reset();expire_after_write=1;assert(!display_runtime_wake_sensor()&&sensor_writes==1&&!display_sensor_guard_alive());
 reset();observed.automatic=display_policy.config.automatic=0;assert(display_runtime_wake_sensor()&&!sensor_writes&&!enable_reads&&!lux_reads&&display_policy.config.sensor_lux==-1);

 reset();observed.automatic=display_policy.config.automatic=0;guard=0;assert(display_runtime_prepare_auto_sensor()&&begin_calls==1&&release_calls==1&&!guard&&sensor_writes==1&&!observed.automatic&&!display_policy.config.automatic&&factory_lifecycle.brightness==135);
 reset();factory_bus.power_event=1;assert(!display_runtime_prepare_auto_sensor()&&!begin_calls&&!release_calls&&!sensor_writes);
 reset();factory_bus.resync=1;assert(!display_runtime_prepare_auto_sensor()&&!begin_calls&&!sensor_writes);
 reset();tf_http_cancelled=1;assert(!display_runtime_prepare_auto_sensor()&&!begin_calls&&!sensor_writes);
 reset();frame_ready=0;assert(!display_runtime_prepare_auto_sensor()&&!begin_calls&&!sensor_writes);
 reset();display_runtime_ready=0;assert(!display_runtime_prepare_auto_sensor()&&!begin_calls);
 reset();factory_lifecycle.phase=0;assert(!display_runtime_prepare_auto_sensor()&&!begin_calls);
 reset();factory_lifecycle.brightness=0;assert(!display_runtime_prepare_auto_sensor()&&!begin_calls);
 reset();owner=1;assert(!display_runtime_prepare_auto_sensor()&&begin_calls==1&&release_calls==1&&!guard&&!sensor_writes);
 reset();policy_fail=1;assert(!display_runtime_prepare_auto_sensor()&&release_calls==1&&!guard&&!sensor_writes);
 reset();observed.pin_enabled=1;assert(!display_runtime_prepare_auto_sensor()&&release_calls==1&&!guard&&!sensor_writes);
 reset();write_fail=1;assert(!display_runtime_prepare_auto_sensor()&&release_calls==1&&!guard&&sensor_writes==1);
 reset();lux_fail=1;assert(!display_runtime_prepare_auto_sensor()&&release_calls==1&&!guard&&now<=2100);
 reset();event_after_write=1;assert(!display_runtime_prepare_auto_sensor()&&release_calls==1&&!guard&&sensor_writes==1);
 reset();event_after_release=1;assert(!display_runtime_prepare_auto_sensor()&&release_calls==1&&!guard&&sensor_writes==1);
 reset();event_during_guard=1;assert(!display_runtime_prepare_auto_sensor()&&release_calls==1&&!guard&&!sensor_writes&&!policy_reads);
 reset();release_fail=1;assert(!display_runtime_prepare_auto_sensor()&&release_calls==1);
 reset();begin_fail=1;assert(!display_runtime_prepare_auto_sensor()&&!release_calls&&!sensor_writes);
 puts("PASS: actual wake sensor helper requires complete frame/owned guard/no factory renderer; fresh mutable policy synchronized, PIN/periodic policy changes rejected, disabled sensor enabled once, enabled sensor no write; bounded failure/cancel/PIN change protection and fixed-mode no sensor I/O");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-wake-sensor.c",$source.Replace('PRODUCTION_PREPARE',$prepare).Replace('PRODUCTION_WAKE',$wake).Replace('PRODUCTION_AUTO',$auto))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-wake-sensor.c" -o "$root/bin/test-wake-sensor.exe"
if($LASTEXITCODE -ne 0){throw 'Wake sensor test build failed'}
& "$root/bin/test-wake-sensor.exe"
if($LASTEXITCODE -ne 0){throw 'Wake sensor test failed'}
