$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$runtime=[IO.File]::ReadAllText("$root/display_runtime.h")
function Extract-FunctionRange([string]$text,[string]$start,[string]$end){
  $a=$text.IndexOf($start);$b=$text.IndexOf($end,$a)
  if($a -lt 0 -or $b -lt 0){throw "Missing function boundary: $start"}
  return $text.Substring($a,$b-$a)
}
$lock=Extract-FunctionRange $main 'static void screen_lock(void)' '/* Local no-PIN hold'
$wake=Extract-FunctionRange $main 'static int runtime_wake(' '/* A held power key'
$read=Extract-FunctionRange $runtime 'static int display_runtime_unlock_policy(void)' 'static void display_runtime_cleanup('
$source=@'
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "pin_policy.h"
#include "soft_lock.h"
static tf_soft_lock soft_lock;
static struct{int current,mode;}lock_chart;
static struct{int initialized,active;}lock_motion;
static struct{int n,active,scope;}chart_animation;
#include "display_policy.h"
typedef struct {int unused;} drm_disp_t;
static tf_pin_policy pin_policy;
static tf_display_policy display_policy;
static int running,factory_bus_active,controls_enabled,scroll_y,read_failure,raw_pin;
static int reads,login_calls,login_value,login_failure,form_calls,sms_calls,extra_calls,begin_calls,render_calls,render_failure,render_locked,request_calls,request_level;
static int advanced_page,sms_id;
static char pending[32],pin_feedback[32],page[96];
static int display_runtime_fail(void){running=0;return 0;}
static int vendor_exec(const char*path,char*const*args,const char*input,char*out,size_t cap){assert(!strcmp(path,"/sbin/uci")&&!strcmp(args[0],"uci")&&!strcmp(args[1],"-q")&&!strcmp(args[2],"get")&&!strcmp(args[3],"zwrt_deviceui.Screen.Lock_Screen_PIN_Enable_State")&&!args[4]&&!input);reads++;snprintf(out,cap,"%d\n",raw_pin);return read_failure;}
READ_FUNCTION
static void motion_cancel(void){}
static void power_menu_reset(void){}
static void lock_wallpaper_invalidate(void){}
static void form_reset(void){form_calls++;}
static void sms_forward_cleanup(void){sms_calls++;}
static void factory_extra_cleanup(void){extra_calls++;}
static int display_runtime_login(int value){login_calls++;login_value=value;return login_failure?display_runtime_fail():1;}
static int display_runtime_begin_frame(void){assert(running);begin_calls++;return 1;}
static int render(drm_disp_t*d){assert(d&&running);render_calls++;render_locked=pin_policy.locked;return !render_failure;}
static int wake_sensor_calls,wake_sensor_failure;
static int display_runtime_wake_sensor(void){assert(begin_calls&&render_calls&&!render_failure);wake_sensor_calls++;display_policy.config.sensor_lux=40;return !wake_sensor_failure;}
static int display_read_lux(int*lux){*lux=40;return 1;}
static uint32_t tick(void){return 1000;}
static int display_runtime_request(int level){assert(running);request_calls++;request_level=level;return 1;}
LOCK_FUNCTION
WAKE_FUNCTIONS
static void reset(int enabled){tf_display_config c={enabled,1,135,30,0,1,3,135,255};assert(tf_display_init_supported(&display_policy,&c,0,1));tf_pin_start(&pin_policy,enabled,0,0,0);tf_soft_lock_reset(&soft_lock,enabled);soft_lock.locked=0;running=factory_bus_active=controls_enabled=1;scroll_y=200;read_failure=login_failure=render_failure=wake_sensor_calls=wake_sensor_failure=0;raw_pin=enabled?0:1;reads=login_calls=form_calls=sms_calls=extra_calls=begin_calls=render_calls=request_calls=0;login_value=render_locked=request_level=-1;strcpy(pending,"pending action");strcpy(pin_feedback,"old");strcpy(page,"index.html");advanced_page=0;sms_id=-1;}
int main(void){drm_disp_t d={0};
 reset(0);lock_chart.current=lock_motion.initialized=lock_motion.active=chart_animation.active=1;lock_chart.mode=0;chart_animation.n=17;screen_lock();assert(!lock_chart.current&&lock_chart.mode==-1&&!lock_motion.initialized&&!lock_motion.active&&!chart_animation.n&&!chart_animation.active);
 reset(0);assert(!pin_policy.locked&&!display_policy.locked);assert(runtime_sleep()&&!display_policy.on&&!pin_policy.locked&&!display_policy.locked&&request_calls==1&&request_level==0&&login_calls==1&&login_value==1&&reads==1);assert(!controls_enabled&&!pending[0]&&!pin_feedback[0]&&!scroll_y&&form_calls==1&&sms_calls==1&&extra_calls==1);assert(runtime_wake(&d)&&display_policy.on&&!pin_policy.locked&&!display_policy.locked&&reads==2&&render_calls==1&&render_locked==0&&request_level==135&&login_value==1&&!controls_enabled&&soft_lock.locked);
 reset(1);pin_policy.locked=display_policy.locked=0;uint64_t deadline=pin_policy.deadline;assert(runtime_sleep()&&pin_policy.locked&&display_policy.locked&&login_value==0&&request_level==0&&pin_policy.deadline==deadline);assert(runtime_wake(&d)&&render_locked==1&&pin_policy.locked&&display_policy.locked&&login_value==0&&pin_policy.deadline==deadline&&!controls_enabled);
 reset(0);raw_pin=0;assert(!runtime_wake(&d)&&!running&&reads==1&&!login_calls&&!begin_calls&&!render_calls&&!request_calls);
 reset(1);raw_pin=1;assert(!runtime_sleep()&&!running&&!login_calls&&!request_calls);
 reset(0);raw_pin=2;assert(!runtime_wake(&d)&&!running&&!login_calls&&!render_calls&&!request_calls);
 reset(0);read_failure=1;assert(!runtime_sleep()&&!running&&!login_calls&&!request_calls);
 reset(0);login_failure=1;assert(!runtime_wake(&d)&&!running&&login_calls==1&&!begin_calls&&!render_calls&&!request_calls);
 reset(1);render_failure=1;assert(!runtime_wake(&d)&&!running&&render_calls==1&&render_locked==1&&!request_calls);
 reset(0);wake_sensor_failure=1;assert(!runtime_wake(&d)&&!running&&wake_sensor_calls==1&&render_calls==1&&!request_calls&&!controls_enabled);
 reset(0);assert(runtime_wake(&d)&&wake_sensor_calls==1&&request_calls==1&&request_level==135);
 reset(1);controls_enabled=0;assert(!screen_unlock_complete()&&!controls_enabled&&!reads&&!login_calls);
 reset(1);pin_policy.locked=0;controls_enabled=0;assert(screen_unlock_complete()&&controls_enabled&&reads==1&&login_calls==1&&login_value==1);
 reset(1);pin_policy.locked=0;raw_pin=1;assert(!screen_unlock_complete()&&!controls_enabled&&!running&&!login_calls);
 reset(1);pin_policy.locked=0;login_failure=1;assert(!screen_unlock_complete()&&!controls_enabled&&!running&&login_calls==1);

 reset(0);assert(runtime_power_event(&d,1)&&!display_policy.on&&request_level==0);assert(runtime_power_event(&d,2)&&display_policy.on&&wake_sensor_calls==1&&soft_lock.locked&&request_calls==2&&render_calls==1);int power_reads=reads,power_forms=form_calls,power_requests=request_calls;assert(runtime_power_event(&d,2)&&reads==power_reads&&form_calls==power_forms&&request_calls==power_requests&&wake_sensor_calls==1);assert(!runtime_power_event(&d,0)&&!runtime_power_event(&d,9)&&reads==power_reads&&request_calls==power_requests);
 reset(1);pin_policy.locked=display_policy.locked=0;assert(runtime_power_event(&d,1)&&pin_policy.locked&&!display_policy.on);assert(runtime_power_event(&d,2)&&pin_policy.locked&&display_policy.on&&wake_sensor_calls==1&&render_locked==1);
 puts("PASS: actual main sleep/wake rechecks normalized original PIN policy; no-PIN factory authentication remains unlocked while local hold gates access; configured PIN relocks before rendering; sleep clears authorization/pending input, no-PIN wake keeps local hold lock until explicit completion; enabled PIN requires correct unlock plus policy/login; changed/invalid/unreadable policy and failed login/render prevent display request");return 0;}
'@
$source=$source.Replace('READ_FUNCTION',$read).Replace('LOCK_FUNCTION',$lock).Replace('WAKE_FUNCTIONS',$wake)
[IO.File]::WriteAllText("$root/build-preview/test-main-lock.c",$source)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-main-lock.c" -o "$root/bin/test-main-lock.exe"
if($LASTEXITCODE -ne 0){throw 'Main lock integration test build failed'}
& "$root/bin/test-main-lock.exe"
if($LASTEXITCODE -ne 0){throw 'Main lock integration test failed'}
if($main.Contains('tf_display_hold') -or $main.Contains('hold_start')){throw 'Unexpected no-PIN hold gesture remains'}
$pages=[IO.File]::ReadAllText("$root/display_pages.h")
if(!$pages.Contains('长按解锁进入')){throw 'Missing requested local no-PIN hold instructions'}
