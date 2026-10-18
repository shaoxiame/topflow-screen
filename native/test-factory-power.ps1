$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin" | Out-Null
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
function Extract([string]$start,[string]$end){$a=$main.IndexOf($start);$b=$main.IndexOf($end,$a);if($a -lt 0 -or $b -le $a){throw "Missing boundary: $start"};return $main.Substring($a,$b-$a)}
$off=Extract 'static void runtime_factory_discard(void)' 'int main('
$busy=Extract 'static void busy_tick(void)' 'static void show_busy('
$pin=[IO.File]::ReadAllText("$root/pin_native.h");$pin=$pin.Substring($pin.IndexOf('static int pin_native_attempt(void)'));$pin=$pin.Substring(0,$pin.IndexOf('#endif'))
$runtime=[IO.File]::ReadAllText("$root/display_runtime.h");$a=$runtime.IndexOf("static int display_runtime_after_drm(");$b=$runtime.IndexOf("static int display_runtime_fail(",$a);$afterDrm=$runtime.Substring($a,$b-$a)
$a=$runtime.IndexOf("static int display_runtime_wake_sensor(void){");$b=$runtime.IndexOf("/* Invoked only",$a);$wakeSensor=$runtime.Substring($a,$b-$a)
$source=@'
#include <assert.h>
#include <stdio.h>
#include <stdint.h>
#include <signal.h>
#include "factory_power_state.h"
#include "pin_policy.h"
#include "soft_lock.h"
#include "display_policy.h"
#include "key_press.h"
static tf_pin_policy pin_policy;static tf_soft_lock soft_lock;static tf_display_policy display_policy;
static tf_display_config display_config;static int display_startup_dormant;
static int startup_power=1,startup_read_cut,startup_sensor_calls,startup_sensor_cut,startup_sensor_bad,startup_failures,startup_frames;
static const char*display_config_failure="SENSOR_TEST";
static tf_factory_power_watch startup_watch;
static int startup_gate(void){tf_factory_power_observe(&startup_watch,startup_power?TF_FACTORY_POWER_ON:TF_FACTORY_POWER_UNKNOWN,0);return tf_factory_power_can_use(&startup_watch);}static int(*display_power_on_hook)(void)=startup_gate;
static int display_sensor_guard_alive(void){return 1;}static int display_read_policy_observed(tf_display_config*c){if(startup_read_cut){startup_power=0;return 0;}*c=display_config;return 1;}static int display_read_output(tf_display_config*c){(void)c;return 1;}
static int display_sensor_write_enabled(void){return 1;}static void native_failure_note(const char*c){(void)c;startup_failures++;}
static int display_sensor_prepare(tf_display_config*c,int(*enable)(void),int(*alive)(void)){(void)c;(void)enable;(void)alive;startup_sensor_calls++;if(startup_sensor_cut){startup_power=0;assert(!startup_gate());startup_power=1;return 0;}return !startup_sensor_bad;}
static int display_runtime_startup_frame(void){startup_frames++;return 1;}
ACTUAL_AFTER_DRM
static int factory_power_quiet,controls_enabled,busy_visible,scroll_y,wifi_runtime;
static struct{int current,mode;}lock_chart;static struct{int initialized,active;}lock_motion;
static struct{int n,active;}chart_animation;
static char pending[64],pending_label[64],verifying[64],notice[64],pin_feedback[64];static uint32_t notice_until;
static int close_pages,close_wifi,close_data,menus,wallpapers,motions,forms,sms,extras,logins,requests,last_level,last_login,fail_request;
static void tf_page_state_close(void){close_pages++;}static void tf_wifi_runtime_close(void*p){assert(p==&wifi_runtime);close_wifi++;}static void data_backend_close(void){close_data++;}
static void power_menu_reset(void){menus++;}static void lock_wallpaper_invalidate(void){wallpapers++;}static void motion_cancel(void){motions++;}
static void form_reset(void){forms++;}static void sms_forward_cleanup(void){sms++;}static void factory_extra_cleanup(void){extras++;}
static int display_runtime_login(int value){logins++;last_login=value;return 1;}
static int display_runtime_request(int value){requests++;last_level=value;return !fail_request;}
ACTUAL_OFF
static int pin_fault,pin_gate=1,pin_cancel_during_read,pin_reads,pin_stores,pin_wipes;
static tf_factory_power_watch pin_watch;
static int test_pin_gate(void){tf_factory_power_observe(&pin_watch,pin_gate?TF_FACTORY_POWER_ON:TF_FACTORY_POWER_UNKNOWN,0);return tf_factory_power_can_use(&pin_watch);}static int(*pin_power_on_hook)(void)=test_pin_gate;
static uint64_t pin_now(void){return 1000;}static int pin_store(void){pin_stores++;return 1;}
static int mlock(const void*p,size_t n){(void)p;(void)n;return 0;}
static int munlock(const void*p,size_t n){const char*s=p;for(size_t i=0;i<n;i++)assert(!s[i]);pin_wipes++;return 0;}
static int vendor_exec(const char*path,char*const*args,const char*input,char*out,size_t cap){(void)path;(void)args;(void)input;pin_reads++;if(pin_cancel_during_read){pin_gate=0;assert(!test_pin_gate());pin_gate=1;return -1;}snprintf(out,cap,"1234");return 0;}
ACTUAL_PIN
static int running=1,tf_http_cancelled,factory_bus_active=1,frame_ready=1,theme_dark,busy_phase;
static int active_display_storage,*active_display=&active_display_storage;
static struct{int power_event,resync;}factory_bus;
static uint32_t clock_ms=500,busy_last,busy_heartbeat;
static int gate_on=1,bus_ticks,paints,damages,heartbeats;
static uint32_t tick(void){return clock_ms;}
static int runtime_factory_power_read(int force){assert(!force);return gate_on;}
static int tf_fb_tick(void*p){assert(p==&factory_bus);bus_ticks++;return 1;}
static int display_runtime_fail(void){running=0;return 0;}
static void html_view_fill_round_rect(int x,int y,int w,int h,int radius,int r,int g,int b,int a){(void)x;(void)y;(void)w;(void)h;(void)radius;(void)r;(void)g;(void)b;(void)a;paints++;}
static int logical_damage(void*d,int x,int y,int w,int h){(void)d;(void)x;(void)y;(void)w;(void)h;damages++;return 1;}
static void heartbeat(void){heartbeats++;}
ACTUAL_WAKE_SENSOR
ACTUAL_BUSY
static int parse(const char*s){return tf_factory_power_parse(s,strlen(s));}
int main(int argc,char**argv){assert(argc==2);
 const char*on="config zudata_mode_fun 'mode'\n option mode_main_state 'mode_power_on'\n option quicken_power_on '1'\n";
 assert(parse(on)==TF_FACTORY_POWER_ON);
 const char*states[]={"mode_power_off","mode_power_off_quicken","mode_power_off_charger_quicken","mode_power_off_quickening","mode_power_off_unreal"};
 char raw[1024];for(unsigned i=0;i<sizeof states/sizeof states[0];i++){snprintf(raw,sizeof raw,"config zudata_mode_fun 'mode'\n option mode_main_state '%s'\n",states[i]);assert(parse(raw)==TF_FACTORY_POWER_OFF);}
 assert(parse("config future_type \"mode\"\n\toption mode_main_state \"mode_power_on_charger\" # observation\n")==TF_FACTORY_POWER_ON);
 assert(parse("config test 'other'\n option mode_main_state 'mode_power_on'\n")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("config test 'mode'\n option quicken_power_on '1'\n")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("config test 'mode'\n option mode_main_state 'mode_power_on_quicken'\n")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("config test 'mode'\n option mode_main_state 'mode_power_office'\n")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("config test 'mode'\n option mode_main_state 'mode_power_on'\n option mode_main_state 'mode_power_off'\n")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("config test 'mode'\n option mode_main_state 'mode_power_on'\nconfig test 'mode'\n")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("config test 'mode'\n option mode_main_state 'mode_power_on' garbage\n")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("config test 'mode'\n option mode_main_state 'mode_power_on")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("config test 'mode'\n option mode_main_state 'mode_power_on\n")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("# option mode_main_state 'mode_power_on'\n")==TF_FACTORY_POWER_UNKNOWN);
 assert(parse("config test 'mode'\n option empty ''\n option mode_main_state 'mode_power_on'\n")==TF_FACTORY_POWER_ON);
 FILE*f=fopen(argv[1],"wb");assert(f);fwrite(on,1,strlen(on),f);fclose(f);assert(tf_factory_power_read_path(argv[1])==TF_FACTORY_POWER_ON);
 f=fopen(argv[1],"wb");assert(f);fwrite(on,1,strlen(on)-1,f);fclose(f);assert(tf_factory_power_read_path(argv[1])==TF_FACTORY_POWER_UNKNOWN);
 f=fopen(argv[1],"wb");assert(f);fclose(f);assert(tf_factory_power_read_path(argv[1])==TF_FACTORY_POWER_UNKNOWN);
 f=fopen(argv[1],"wb");assert(f);fwrite(on,1,strlen(on),f);fputc(0,f);fputc('\n',f);fclose(f);assert(tf_factory_power_read_path(argv[1])==TF_FACTORY_POWER_UNKNOWN);assert(!remove(argv[1]));
 tf_factory_power_watch w={0};assert(tf_factory_power_due(&w,0)&&!tf_factory_power_can_use(&w));tf_factory_power_observe(&w,TF_FACTORY_POWER_ON,10);assert(tf_factory_power_can_use(&w)&&!tf_factory_power_due(&w,259)&&tf_factory_power_due(&w,260));
 tf_factory_power_observe(&w,TF_FACTORY_POWER_OFF,260);assert(w.off_latched&&!tf_factory_power_can_use(&w)&&!tf_factory_power_due(&w,1259)&&tf_factory_power_due(&w,1260));
 tf_factory_power_observe(&w,TF_FACTORY_POWER_UNKNOWN,1260);assert(w.off_latched&&!tf_factory_power_can_use(&w));tf_factory_power_observe(&w,TF_FACTORY_POWER_ON,2260);assert(w.off_latched&&!tf_factory_power_can_use(&w));w.off_latched=0;assert(!tf_factory_power_can_use(&w));w.interrupted=0;assert(tf_factory_power_can_use(&w));
 tf_factory_power_observe(&w,TF_FACTORY_POWER_UNKNOWN,UINT32_MAX-100);assert(!tf_factory_power_can_use(&w)&&tf_factory_power_due(&w,150));
 tf_display_config c={1,1,135,30,0,1,40,135,255};assert(tf_display_init_supported(&display_policy,&c,0,1));tf_pin_start(&pin_policy,1,0,0,0);pin_policy.locked=0;memcpy(pin_policy.input,"1234",5);pin_policy.input_len=4;
 tf_soft_lock_reset(&soft_lock,0);soft_lock.progress=700;controls_enabled=busy_visible=1;scroll_y=90;strcpy(pending,"old SMS");strcpy(pending_label,"confirm");strcpy(verifying,"old wifi");strcpy(notice,"stale");strcpy(pin_feedback,"digits");notice_until=4000;chart_animation.active=chart_animation.n=lock_motion.active=lock_motion.initialized=lock_chart.current=1;
 assert(runtime_factory_power_off()&&factory_power_quiet&&!display_policy.on&&!display_policy.brightness&&pin_policy.locked&&!pin_policy.input_len&&!pin_policy.input[0]);
 assert(!controls_enabled&&!busy_visible&&!pending[0]&&!pending_label[0]&&!verifying[0]&&!notice[0]&&!pin_feedback[0]&&!notice_until&&!scroll_y&&!chart_animation.n&&!lock_motion.active);
 assert(close_pages==1&&close_wifi==1&&close_data==1&&menus==1&&wallpapers==1&&motions==1&&forms==1&&sms==1&&extras==1&&logins==1&&!last_login&&requests==1&&!last_level);
 assert(runtime_factory_power_off()&&requests==1&&logins==1&&close_data==1);
 busy_visible=1;gate_on=0;busy_tick();assert(tf_http_cancelled&&running&&!bus_ticks&&!paints&&!damages);gate_on=1;tf_http_cancelled=0;busy_tick();assert(running&&!tf_http_cancelled&&bus_ticks==1&&paints==2&&damages==1);
 factory_bus.power_event=2;busy_tick();assert(tf_http_cancelled&&paints==2&&running);
 tf_key_press_t key;tf_key_press_baseline(&key,0);tf_key_press_event(&key,1,116,1,100,1,1,100);tf_key_press_baseline(&key,key.pressed||key.ignore_until_release||key.sync_lost);assert(key.ignore_until_release);assert(tf_key_press_event(&key,1,116,0,200,1,1,200)==KEY_EV_NONE);tf_key_press_baseline(&key,key.pressed||key.ignore_until_release||key.sync_lost);assert(!key.ignore_until_release);tf_key_press_event(&key,1,116,1,300,1,1,300);assert(tf_key_press_event(&key,1,116,0,400,1,1,400)==KEY_EV_SHORT);
 pin_policy.failures=2;pin_policy.deadline=0;pin_policy.locked=1;memcpy(pin_policy.input,"1234",5);pin_policy.input_len=4;pin_cancel_during_read=1;assert(pin_native_attempt()==TF_PIN_WAIT&&pin_policy.locked&&pin_policy.failures==2&&!pin_policy.input_len&&!pin_fault&&!pin_stores&&pin_wipes==1&&pin_reads==1);
 memcpy(pin_policy.input,"1234",5);pin_policy.input_len=4;assert(pin_native_attempt()==TF_PIN_WAIT&&pin_reads==1&&!pin_fault&&!pin_policy.input_len);
 pin_gate=1;pin_watch.interrupted=0;pin_cancel_during_read=0;memcpy(pin_policy.input,"1234",5);pin_policy.input_len=4;assert(pin_native_attempt()==TF_PIN_OK&&!pin_policy.locked&&!pin_policy.failures&&pin_stores==1&&pin_wipes==2);
 display_config=c;startup_power=0;assert(display_runtime_after_drm(1)==2&&display_startup_dormant&&!startup_sensor_calls&&!startup_failures&&startup_frames==1);startup_power=1;assert(display_startup_dormant);startup_watch.interrupted=0;startup_sensor_cut=1;assert(display_runtime_after_drm(1)==2&&display_startup_dormant&&startup_sensor_calls==1&&!startup_failures&&startup_frames==2);startup_power=1;assert(display_startup_dormant);startup_watch.interrupted=0;startup_sensor_cut=0;startup_sensor_bad=1;assert(!display_runtime_after_drm(1)&&startup_failures==1);
 startup_failures=0;startup_power=1;startup_watch.interrupted=0;startup_sensor_bad=0;startup_sensor_cut=1;display_policy.config=display_config;int interrupted=display_runtime_wake_sensor();startup_power=1;assert(interrupted==2&&!startup_failures&&!startup_gate());startup_watch.interrupted=0;startup_sensor_cut=0;startup_read_cut=1;assert(display_runtime_wake_sensor()==2&&!startup_failures);startup_read_cut=0;startup_power=1;startup_watch.interrupted=0;startup_sensor_bad=1;assert(!display_runtime_wake_sensor()&&startup_failures==1);
 tf_display_config dormant=c;dormant.sensor_enabled=0;dormant.sensor_lux=-1;assert(!tf_display_init_supported(&display_policy,&dormant,0,1));assert(tf_display_init_dormant(&display_policy,&dormant,0)&&!display_policy.on&&!display_policy.brightness&&display_policy.config.sensor_enabled==0&&display_policy.config.sensor_lux==-1);
 assert(tf_display_init_supported(&display_policy,&c,0,1));assert(tf_display_tick(&display_policy,30000,-1,0,0)==TF_DISPLAY_SLEEP&&!display_policy.on);
 puts("PASS: OEM power parser, bounded file snapshots, quick-boot distinction, OFF latch/unknown/ON, wrap-safe sampling, actual OFF cleanup and busy cancellation without restart or paint");return 0;
}
'@
$source=$source.Replace('ACTUAL_OFF',$off).Replace('ACTUAL_BUSY',$busy).Replace('ACTUAL_PIN',$pin).Replace('ACTUAL_AFTER_DRM',$afterDrm).Replace('ACTUAL_WAKE_SENSOR',$wakeSensor)
[IO.File]::WriteAllText("$root/build-preview/test-factory-power.c",$source)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -D_GNU_SOURCE "-I$root" "$root/build-preview/test-factory-power.c" -o "$root/bin/test-factory-power.exe"
if($LASTEXITCODE -ne 0){throw 'Factory power test build failed'}
Push-Location "$root/build-preview"
try { & "$root/bin/test-factory-power.exe" 'factory-power-fixture.uci' } finally { Pop-Location }
if($LASTEXITCODE -ne 0){throw 'Factory power test failed'}
$loop=$main.Substring($main.IndexOf('while(running){uint32_t now=tick();'))
if($loop.IndexOf('factory_power.off_latched||factory_power_quiet') -gt $loop.IndexOf('if(factory_bus.power_event)')){throw 'OFF gate must precede ordinary power events'}
$offBranch=$loop.Substring($loop.IndexOf('if(factory_power.off_latched||factory_power_quiet)'),$loop.IndexOf('if(!tf_factory_power_can_use')-$loop.IndexOf('if(factory_power.off_latched||factory_power_quiet)'))
if($offBranch -notmatch 'heartbeat\(\)' -or $offBranch -notmatch 'continue;' -or $offBranch -match 'data_backend_poll\('){throw 'OFF must keep heartbeat while skipping normal data work'}
if($loop -notmatch 'if\(power_release_block\)' -or $loop -notmatch 'tf_key_press_baseline\(&key.press,key.press.pressed\|\|key.press.ignore_until_release\|\|key.press.sync_lost\)'){throw 'Old touch/key release must be discarded'}
if($main -notmatch 'preflight_only\)\{char receipt\[384\];if\(!runtime_factory_power_read\(1\)\)'){throw 'Preflight must reject non-ON before takeover'}
if($main -notmatch 'show_busy\(const char\*message\)\{if\(!runtime_factory_power_read\(0\)\)'){throw 'Busy entry must not paint while OEM power is off'}
Write-Output 'PASS: actual loop prioritizes OEM OFF, preserves heartbeat, skips background polling, clears input edges, and guards preflight/busy rendering'
