$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin" | Out-Null
$runtime=[IO.File]::ReadAllText("$root/display_runtime.h")
$start=$runtime.IndexOf('static int display_runtime_accept_observed(')
$end=$runtime.IndexOf('/* A factory sleep may disable', $start)
if($start -lt 0 -or $end -le $start){throw 'External display sync implementation missing'}
$accept=$runtime.Substring($start,$end-$start)
$source=@'
#include <assert.h>
#include <stdio.h>
#include "display_policy.h"
#define TF_FL_READY 2
static tf_display_policy display_policy;
static tf_display_config display_config;
static struct {int phase;} factory_lifecycle;
static struct {int power_event,resync;} factory_bus;
static int display_runtime_ready,tf_http_cancelled,running,failed,requests,request_fail,request_level;
static uint32_t now;
static const char*failure;
static uint32_t tick(void){return now;}
static void native_failure_note(const char*s){failure=s;}
static int display_runtime_fail(void){failed=1;running=0;tf_http_cancelled=1;return 0;}
static int display_runtime_request(int level){requests++;request_level=level;if(request_fail)return display_runtime_fail();return 1;}
ACTUAL_ACCEPT
static void reset(int pin,int automatic,int live){
 display_config=(tf_display_config){pin,automatic,100,30,0,1,40,live,255};
 assert(tf_display_init_supported(&display_policy,&display_config,100,1));
 factory_lifecycle.phase=TF_FL_READY;factory_bus.power_event=factory_bus.resync=0;
 display_runtime_ready=running=1;tf_http_cancelled=failed=requests=request_fail=request_level=0;now=10000;failure=NULL;
}
int main(void){
 /* A new fixed preference applies once through the existing lifecycle. No
  * helper command, timer reset, on-state change or PIN bypass is possible. */
 reset(1,0,100);tf_display_config c=display_config;c.brightness=200;c.timeout_seconds=15;
 assert(display_runtime_accept_observed(&c)==1&&requests==1&&request_level==200&&running&&!failed);
 assert(display_policy.brightness==200&&display_policy.config.brightness==200&&display_config.brightness==200);
 assert(display_policy.locked&&display_policy.on&&display_policy.last_activity==100);
 assert(display_runtime_accept_observed(&c)==0&&requests==1&&display_policy.last_activity==100);
 now=15100;assert(tf_display_tick(&display_policy,now,40,1,0)==TF_DISPLAY_SLEEP&&display_policy.locked&&!display_policy.on);
 /* A sleeping snapshot updates policy without waking or starting a ramp. */
 reset(1,0,0);c=display_config;c.brightness=180;c.timeout_seconds=120;
 assert(display_runtime_accept_observed(&c)==1&&!requests&&!display_policy.on&&display_policy.brightness==0&&display_policy.locked);
 assert(tf_display_wake(&display_policy,now)==TF_DISPLAY_LEVEL&&display_policy.brightness==180&&display_policy.locked);
 /* An existing no-PIN soft lock is not cleared by a settings observation. */
 reset(0,0,100);display_policy.locked=1;c=display_config;c.timeout_seconds=-1;
 assert(display_runtime_accept_observed(&c)==1&&display_policy.locked&&!requests&&display_policy.last_activity==100);
 /* An external auto toggle preserves output and uses the same bounded ramp. */
 reset(0,0,100);c=display_config;c.automatic=1;c.sensor_lux=200;
 assert(display_runtime_accept_observed(&c)==1&&!requests&&display_policy.brightness==100);
 assert(tf_display_tick(&display_policy,now+1000,200,1,0)==TF_DISPLAY_NO_CHANGE);
 assert(tf_display_animate(&display_policy,now+1000)==TF_DISPLAY_LEVEL&&display_policy.brightness<=103);
 /* A disabled/unavailable sensor cannot turn stale lux into brightness writes. */
 reset(0,0,100);c=display_config;c.automatic=1;c.sensor_enabled=0;c.sensor_lux=200;
 assert(display_runtime_accept_observed(&c)==1&&!requests&&!display_policy.sensor_valid);
 for(int i=1;i<=10;i++){assert(tf_display_tick(&display_policy,now+(uint32_t)i*1000,200,1,0)==TF_DISPLAY_NO_CHANGE);assert(tf_display_animate(&display_policy,now+(uint32_t)i*1000)==TF_DISPLAY_NO_CHANGE);}
 assert(display_policy.brightness==100&&!requests);c.sensor_enabled=1;
 assert(display_runtime_accept_observed(&c)==1&&!requests);
 assert(tf_display_tick(&display_policy,now+11000,200,1,0)==TF_DISPLAY_NO_CHANGE);
 assert(tf_display_tick(&display_policy,now+12000,200,1,0)==TF_DISPLAY_NO_CHANGE);
 assert(tf_display_animate(&display_policy,now+12000)==TF_DISPLAY_LEVEL);
 /* Auto -> fixed restores the external saved level without touching idle. */
 reset(1,1,135);c=display_config;c.automatic=0;c.brightness=80;c.sensor_enabled=c.sensor_lux=-1;
 assert(display_runtime_accept_observed(&c)==1&&requests==1&&request_level==80&&display_policy.locked&&display_policy.last_activity==100);
 /* Authentication and unsupported periodic wake remain fail-closed. */
 for(int pin=0;pin<=1;pin++){reset(pin,0,100);c=display_config;c.pin_enabled=!pin;assert(display_runtime_accept_observed(&c)==-1&&failed&&!running&&!requests&&display_policy.config.pin_enabled==pin&&!strcmp(failure,"DISPLAY_SECURITY_POLICY_CHANGED"));}
 reset(0,0,100);c=display_config;c.wakeup_periodic=1;assert(display_runtime_accept_observed(&c)==-1&&failed&&!requests&&!display_policy.config.wakeup_periodic);
 /* Missing/malformed observations never become an invented setting. */
 reset(0,0,100);c=display_config;c.brightness=0;assert(display_runtime_accept_observed(&c)==0&&!requests&&running&&display_policy.config.brightness==100);
 c=display_config;c.timeout_seconds=0;assert(display_runtime_accept_observed(&c)==0&&!requests&&running);
 assert(display_runtime_accept_observed(NULL)==0&&running);
 /* Race boundaries defer snapshots rather than consume a power transition. */
 for(int i=0;i<6;i++){reset(0,0,100);c=display_config;c.brightness=180;if(i==0)display_runtime_ready=0;if(i==1)tf_http_cancelled=1;if(i==2)factory_bus.power_event=1;if(i==3)factory_bus.resync=1;if(i==4)factory_lifecycle.phase=0;if(i==5)display_policy.initialized=0;assert(display_runtime_accept_observed(&c)==2&&!requests&&display_policy.config.brightness==100);}
 reset(0,0,100);c=display_config;c.brightness=190;request_fail=1;assert(display_runtime_accept_observed(&c)==-1&&failed&&!running&&requests==1);
 puts("PASS: external display settings sync applies fixed brightness through existing lifecycle; preserves PIN, lock, sleep and activity; auto sensor failures freeze output; power races defer and protected policy changes fail closed");return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-display-external-sync.c",$source.Replace('ACTUAL_ACCEPT',$accept))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-display-external-sync.c" -o "$root/bin/test-display-external-sync.exe"
if($LASTEXITCODE -ne 0){throw 'External display sync test build failed'}
& "$root/bin/test-display-external-sync.exe"
if($LASTEXITCODE -ne 0){throw 'External display sync test failed'}
