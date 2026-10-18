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
$a=$runtime.IndexOf("static int display_runtime_interrupted(void){");$b=$runtime.IndexOf("static int display_runtime_unlock_policy(void){",$a);$interrupted=$runtime.Substring($a,$b-$a)
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
static struct{int power_event,resync,sleep_unavailable;uint32_t device_quicken_pending,device_poweroff_pending;}factory_bus;
static int display_runtime_ready=1,factory_guard;static struct{int phase,brightness;}factory_lifecycle;
#define TF_FL_READY 7
static int actual_light,light_reads,dark_frames,dark_resync,quicken_acks,normal_acks,lcd_lock;
static int tf_guard_observe(void*p,const char*name){assert(p==&factory_guard&&!strcmp(name,"zteSleepBacklight"));return lcd_lock;}
static int tf_fb_power_complete(void*p){assert(p==&factory_bus&&!actual_light&&!lcd_lock);if(factory_bus.device_quicken_pending){quicken_acks++;factory_bus.device_quicken_pending=0;}else{assert(factory_bus.device_poweroff_pending);normal_acks++;factory_bus.device_poweroff_pending=0;}return 1;}
static int display_read_number(const char*p,int low,int high,int*out){assert(!strcmp(p,"/sys/class/leds/led:lcd/brightness")&&low==0&&high==255);light_reads++;*out=actual_light;return 1;}
static int display_runtime_begin_frame(void){dark_frames++;return 1;}
static int display_runtime_resync(void){dark_resync++;actual_light=0;factory_lifecycle.phase=TF_FL_READY;factory_lifecycle.brightness=0;lcd_lock=0;return 1;}
ACTUAL_OFF
static int pin_fault,pin_gate=1,pin_cancel_during_read,pin_reads,pin_stores,pin_wipes;
static tf_factory_power_watch pin_watch;
static int test_pin_gate(void){tf_factory_power_observe(&pin_watch,pin_gate?TF_FACTORY_POWER_ON:TF_FACTORY_POWER_UNKNOWN,0);return tf_factory_power_can_use(&pin_watch);}static int(*pin_power_on_hook)(void)=test_pin_gate;
static uint64_t pin_now(void){return 1000;}static int pin_store(void){pin_stores++;return 1;}
static int mlock(const void*p,size_t n){(void)p;(void)n;return 0;}
static int munlock(const void*p,size_t n){const char*s=p;for(size_t i=0;i<n;i++)assert(!s[i]);pin_wipes++;return 0;}
static int vendor_exec(const char*path,char*const*args,const char*input,char*out,size_t cap){(void)path;(void)args;(void)input;pin_reads++;if(pin_cancel_during_read){pin_gate=0;assert(!test_pin_gate());pin_gate=1;return -1;}snprintf(out,cap,"1234");return 0;}
ACTUAL_PIN
static int running=1,tf_http_cancelled,factory_bus_active=1,frame_ready=1,theme_dark,busy_phase,display_runtime_fault;
static int active_display_storage,*active_display=&active_display_storage;
static uint32_t clock_ms=500,busy_last,busy_heartbeat;
static int gate_on=1,bus_ticks,bus_cut,paints,damages,heartbeats;
static uint32_t tick(void){return clock_ms;}
static int runtime_factory_power_read(int force){assert(!force);return gate_on;}
static int tf_fb_tick(void*p){assert(p==&factory_bus);bus_ticks++;if(bus_cut)gate_on=0;return 1;}
static int display_runtime_fail(void){running=0;return 0;}
static void html_view_fill_round_rect(int x,int y,int w,int h,int radius,int r,int g,int b,int a){(void)x;(void)y;(void)w;(void)h;(void)radius;(void)r;(void)g;(void)b;(void)a;paints++;}
static int logical_damage(void*d,int x,int y,int w,int h){(void)d;(void)x;(void)y;(void)w;(void)h;damages++;return 1;}
static void heartbeat(void){heartbeats++;}
ACTUAL_INTERRUPTED
ACTUAL_WAKE_SENSOR
ACTUAL_BUSY
static int parse(const char*s){return tf_factory_power_parse(s,strlen(s));}
int main(int argc,char**argv){assert(argc==2);
 assert(tf_factory_power_uci_value("mode_power_off_quickening\n")==TF_FACTORY_POWER_OFF);
 assert(tf_factory_power_uci_value("mode_power_on_charger\r\n")==TF_FACTORY_POWER_ON);
 assert(tf_factory_power_uci_value("mode_power_on\nnoise")==TF_FACTORY_POWER_UNKNOWN);
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
 tf_factory_power_watch e={0};tf_factory_power_observe(&e,TF_FACTORY_POWER_ON,10);
 tf_factory_power_event(&e,TF_FACTORY_POWER_OFF,1,1);assert(e.off_latched&&e.interrupted&&e.observed==TF_FACTORY_POWER_OFF);
 e.interrupted=0;tf_factory_power_observe(&e,TF_FACTORY_POWER_ON,1000);assert(e.observed==TF_FACTORY_POWER_OFF&&!tf_factory_power_can_use(&e));
 tf_factory_power_observe(&e,TF_FACTORY_POWER_UNKNOWN,2000);assert(e.observed==TF_FACTORY_POWER_OFF);
 tf_factory_power_event(&e,TF_FACTORY_POWER_ON,2,1);assert(e.observed==TF_FACTORY_POWER_ON&&e.off_latched&&e.event_wait_raw_on);
 e.off_latched=0;e.interrupted=0;tf_factory_power_observe(&e,TF_FACTORY_POWER_OFF,2500);assert(tf_factory_power_can_use(&e));
 tf_factory_power_observe(&e,TF_FACTORY_POWER_ON,3000);assert(!e.event_wait_raw_on&&tf_factory_power_can_use(&e));
 tf_factory_power_observe(&e,TF_FACTORY_POWER_OFF,4000);assert(e.off_latched&&!tf_factory_power_can_use(&e));
 tf_factory_power_event(&e,TF_FACTORY_POWER_ON,4,2);assert(e.off_latched&&e.interrupted&&e.observed==TF_FACTORY_POWER_ON); /* OFF/ON drained together */
 e.off_latched=0;e.interrupted=0;tf_factory_power_event(&e,TF_FACTORY_POWER_ON,4,2);assert(!e.interrupted&&!e.off_latched); /* duplicate delivery */
 tf_factory_power_event(&e,TF_FACTORY_POWER_OFF,5,3);e.interrupted=0;tf_factory_power_observe(&e,TF_FACTORY_POWER_ON,5000);assert(e.observed==TF_FACTORY_POWER_OFF&&e.off_latched);
 tf_display_config c={1,1,135,30,0,1,40,135,255};assert(tf_display_init_supported(&display_policy,&c,0,1));tf_pin_start(&pin_policy,1,0,0,0);pin_policy.locked=0;memcpy(pin_policy.input,"1234",5);pin_policy.input_len=4;
 tf_soft_lock_reset(&soft_lock,0);soft_lock.progress=700;controls_enabled=busy_visible=1;scroll_y=90;strcpy(pending,"old SMS");strcpy(pending_label,"confirm");strcpy(verifying,"old wifi");strcpy(notice,"stale");strcpy(pin_feedback,"digits");notice_until=4000;chart_animation.active=chart_animation.n=lock_motion.active=lock_motion.initialized=lock_chart.current=1;
 assert(runtime_factory_power_off()&&factory_power_quiet&&!display_policy.on&&!display_policy.brightness&&pin_policy.locked&&!pin_policy.input_len&&!pin_policy.input[0]);
 assert(!controls_enabled&&!busy_visible&&!pending[0]&&!pending_label[0]&&!verifying[0]&&!notice[0]&&!pin_feedback[0]&&!notice_until&&!scroll_y&&!chart_animation.n&&!lock_motion.active);
 assert(close_pages==1&&close_wifi==1&&close_data==1&&menus==1&&wallpapers==1&&motions==1&&forms==1&&sms==1&&extras==1&&logins==1&&!last_login&&requests==1&&!last_level);
 assert(runtime_factory_power_off()&&requests==1&&logins==1&&close_data==1);
 assert(runtime_factory_keep_dark(100)&&light_reads==1&&!dark_resync);actual_light=150;assert(runtime_factory_keep_dark(999)&&light_reads==1&&actual_light==150);assert(runtime_factory_keep_dark(1100)&&light_reads==2&&!actual_light&&dark_frames==1&&dark_resync==1);assert(runtime_factory_keep_dark(2100)&&light_reads==3&&dark_resync==1&&logins==1);
 factory_bus.device_quicken_pending=4;actual_light=80;factory_lifecycle.phase=TF_FL_READY;factory_lifecycle.brightness=0;assert(runtime_factory_keep_dark(2150)&&!actual_light&&quicken_acks==1&&!factory_bus.device_quicken_pending&&dark_resync==2);
 factory_bus.device_poweroff_pending=4;int observed_reads=light_reads;assert(runtime_factory_keep_dark(2150)&&normal_acks==1&&!factory_bus.device_poweroff_pending&&light_reads==observed_reads+2);
 factory_bus.device_quicken_pending=5;lcd_lock=1;assert(runtime_factory_keep_dark(2151)&&quicken_acks==1);lcd_lock=0;assert(runtime_factory_keep_dark(2152)&&quicken_acks==2);
 factory_bus.sleep_unavailable=1;factory_bus.device_poweroff_pending=6;observed_reads=light_reads;int observed_frames=dark_frames;assert(runtime_factory_keep_dark(4000)&&light_reads==observed_reads&&dark_frames==observed_frames&&normal_acks==1&&factory_bus.device_poweroff_pending==6);factory_bus.sleep_unavailable=0;assert(runtime_factory_keep_dark(4001)&&normal_acks==2&&!factory_bus.device_poweroff_pending);
 busy_visible=1;gate_on=0;busy_tick();assert(tf_http_cancelled&&running&&!bus_ticks&&!paints&&!damages);gate_on=1;tf_http_cancelled=0;busy_tick();assert(running&&!tf_http_cancelled&&bus_ticks==1&&paints==2&&damages==1);
 bus_cut=1;tf_http_cancelled=0;busy_tick();assert(tf_http_cancelled&&paints==2&&running);bus_cut=0;gate_on=1;
 factory_bus.power_event=2;busy_tick();assert(tf_http_cancelled&&paints==2&&running);
 tf_key_press_t key;tf_key_press_baseline(&key,0);tf_key_press_event(&key,1,116,1,100,1,1,100);tf_key_press_baseline(&key,key.pressed||key.ignore_until_release||key.sync_lost);assert(key.ignore_until_release);assert(tf_key_press_event(&key,1,116,0,200,1,1,200)==KEY_EV_NONE);tf_key_press_baseline(&key,key.pressed||key.ignore_until_release||key.sync_lost);assert(!key.ignore_until_release);tf_key_press_event(&key,1,116,1,300,1,1,300);assert(tf_key_press_event(&key,1,116,0,400,1,1,400)==KEY_EV_SHORT);
 pin_policy.failures=2;pin_policy.deadline=0;pin_policy.locked=1;memcpy(pin_policy.input,"1234",5);pin_policy.input_len=4;pin_cancel_during_read=1;assert(pin_native_attempt()==TF_PIN_WAIT&&pin_policy.locked&&pin_policy.failures==2&&!pin_policy.input_len&&!pin_fault&&!pin_stores&&pin_wipes==1&&pin_reads==1);
 memcpy(pin_policy.input,"1234",5);pin_policy.input_len=4;assert(pin_native_attempt()==TF_PIN_WAIT&&pin_reads==1&&!pin_fault&&!pin_policy.input_len);
 pin_gate=1;pin_watch.interrupted=0;pin_cancel_during_read=0;memcpy(pin_policy.input,"1234",5);pin_policy.input_len=4;assert(pin_native_attempt()==TF_PIN_OK&&!pin_policy.locked&&!pin_policy.failures&&pin_stores==1&&pin_wipes==2);
 tf_http_cancelled=0;factory_bus.power_event=0;display_config=c;startup_power=0;assert(display_runtime_after_drm(1)==2&&display_startup_dormant&&!startup_sensor_calls&&!startup_failures&&startup_frames==1);startup_power=1;assert(display_startup_dormant);startup_watch.interrupted=0;startup_sensor_cut=1;assert(display_runtime_after_drm(1)==2&&display_startup_dormant&&startup_sensor_calls==1&&!startup_failures&&startup_frames==2);startup_power=1;assert(display_startup_dormant);startup_watch.interrupted=0;startup_sensor_cut=0;startup_sensor_bad=1;assert(!display_runtime_after_drm(1)&&startup_failures==1);
 startup_failures=0;startup_power=1;startup_watch.interrupted=0;startup_sensor_bad=0;startup_sensor_cut=1;display_policy.config=display_config;int interrupted=display_runtime_wake_sensor();startup_power=1;assert(interrupted==2&&!startup_failures&&!startup_gate());startup_watch.interrupted=0;startup_sensor_cut=0;startup_read_cut=1;assert(display_runtime_wake_sensor()==2&&!startup_failures);startup_read_cut=0;startup_power=1;startup_watch.interrupted=0;startup_sensor_bad=1;assert(!display_runtime_wake_sensor()&&startup_failures==1);
 tf_display_config dormant=c;dormant.sensor_enabled=0;dormant.sensor_lux=-1;assert(!tf_display_init_supported(&display_policy,&dormant,0,1));assert(tf_display_init_dormant(&display_policy,&dormant,0)&&!display_policy.on&&!display_policy.brightness&&display_policy.config.sensor_enabled==0&&display_policy.config.sensor_lux==-1);
 assert(tf_display_init_supported(&display_policy,&c,0,1));assert(tf_display_tick(&display_policy,30000,-1,0,0)==TF_DISPLAY_SLEEP&&!display_policy.on);
 puts("PASS: OEM power parser/effective UCI, event OFF beats stale ON, batched OFF+ON cancels input, delayed raw OFF cannot undo ON event, LCD re-darkening, cleanup/busy guards");return 0;
}
'@
$source=$source.Replace('ACTUAL_OFF',$off).Replace('ACTUAL_BUSY',$busy).Replace('ACTUAL_PIN',$pin).Replace('ACTUAL_AFTER_DRM',$afterDrm).Replace('ACTUAL_WAKE_SENSOR',$wakeSensor).Replace('ACTUAL_INTERRUPTED',$interrupted)
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
if($main -notmatch 'preflight_only\)\{char receipt\[384\];if\(!runtime_factory_power_initial\(\)\)'){throw 'Preflight must reject non-ON before takeover'}
if($main -notmatch 'show_busy\(const char\*message\)\{if\(!runtime_factory_power_read\(0\)\)'){throw 'Busy entry must not paint while OEM power is off'}
Write-Output 'PASS: actual loop prioritizes OEM OFF, preserves heartbeat, skips background polling, clears input edges, and guards preflight/busy rendering'

# Exercise the actual runtime event/read fusion and its one-time libuci getter.
$power=Extract 'static int runtime_factory_power_read(int force){' 'static void esc('
$audit=@'
#include <assert.h>
#include <stdio.h>
#include <stdint.h>
#include "factory_power_state.h"
static tf_factory_power_watch factory_power;
static struct{int device_power_state,sleep_unavailable;uint32_t device_power_sequence,device_power_off_seen;}factory_bus;
static int factory_bus_active=1,raw_state=TF_FACTORY_POWER_ON,raw_reads,poll_failed,failures,uci_calls,uci_failure;
static const char*uci_value="mode_power_on\n";
static uint32_t now=100;
static uint32_t tick(void){return now;}
static int tf_fb_poll(void*p){assert(p==&factory_bus);return !poll_failed;}
static int display_runtime_fail(void){failures++;return 0;}
static int simulated_raw(const char*p){assert(!strcmp(p,"/etc/config/zwrt_zte_mc_tmp"));raw_reads++;return raw_state;}
static int vendor_exec(const char*p,char*const*a,const char*input,char*out,size_t cap){assert(!strcmp(p,"/sbin/uci")&&!strcmp(a[0],"uci")&&!strcmp(a[1],"-q")&&!strcmp(a[2],"get")&&!strcmp(a[3],"zwrt_zte_mc_tmp.mode.mode_main_state")&&!a[4]&&!input);uci_calls++;snprintf(out,cap,"%s",uci_value);return uci_failure;}
#define tf_factory_power_read_path simulated_raw
ACTUAL_POWER
int main(void){
 assert(runtime_factory_power_initial()&&uci_calls==1);
 factory_bus.device_power_state=TF_FACTORY_POWER_OFF;factory_bus.device_power_sequence=1;factory_bus.device_power_off_seen=1;
 assert(!runtime_factory_power_read(0)&&factory_power.observed==TF_FACTORY_POWER_OFF&&factory_power.off_latched);
 now=1200;assert(!runtime_factory_power_read(1)&&raw_reads==1&&raw_state==TF_FACTORY_POWER_ON&&uci_calls==1);
 factory_bus.device_power_state=TF_FACTORY_POWER_ON;factory_bus.device_power_sequence=2;
 assert(!runtime_factory_power_read(1)&&factory_power.observed==TF_FACTORY_POWER_ON);factory_power.off_latched=factory_power.interrupted=0;
 assert(runtime_factory_power_read(1));
 factory_bus.sleep_unavailable=1;assert(!runtime_factory_power_read(1)&&factory_power.observed==TF_FACTORY_POWER_ON);factory_bus.sleep_unavailable=0;assert(runtime_factory_power_read(1));
 factory_bus.device_power_sequence=4;factory_bus.device_power_off_seen=2;
 assert(!runtime_factory_power_read(1)&&factory_power.off_latched&&factory_power.interrupted&&factory_power.observed==TF_FACTORY_POWER_ON);
 memset(&factory_power,0,sizeof factory_power);factory_bus_active=0;uci_value="mode_power_off_quickening\n";
 assert(!runtime_factory_power_initial()&&factory_power.off_latched&&uci_calls==2);
 memset(&factory_power,0,sizeof factory_power);uci_value="mode_power_on\n";uci_failure=1;assert(!runtime_factory_power_initial()&&factory_power.observed==TF_FACTORY_POWER_UNKNOWN);
 factory_bus_active=1;poll_failed=1;assert(!runtime_factory_power_read(1)&&failures==1);
 puts("PASS: actual runtime consumes OFF before raw ON, explicit ON/batched cancellation, effective-UCI initial rejection, provider loss guard; zero polling subprocesses");
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-factory-power-integration.c",$audit.Replace('ACTUAL_POWER',$power))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -D_GNU_SOURCE "-I$root" "$root/build-preview/test-factory-power-integration.c" -o "$root/bin/test-factory-power-integration.exe"
if($LASTEXITCODE -ne 0){throw 'Factory power integration build failed'}
& "$root/bin/test-factory-power-integration.exe"
if($LASTEXITCODE -ne 0){throw 'Factory power integration failed'}

# Run the production main OFF branch itself, together with the real wake,
# discard/dark and event/read gates. Only external I/O and page cleanup are
# substituted; this is not a second implementation of the branch logic.
$wake=Extract 'static int runtime_wake(' 'static int runtime_sleep('
$lock=Extract 'static void screen_lock(void)' '/* A successful PIN entry'
$branchSource=@'
#include <assert.h>
#include <stdio.h>
#include <stdint.h>
#include "factory_power_state.h"
#include "pin_policy.h"
#include "soft_lock.h"
#include "display_policy.h"
#include "key_press.h"
typedef struct {int unused;}drm_disp_t;
static drm_disp_t d;
static tf_factory_power_watch factory_power;
static tf_pin_policy pin_policy;static tf_soft_lock soft_lock;static tf_display_policy display_policy;
static struct{int device_power_state,power_event,resync,sleep_unavailable;uint32_t device_power_sequence,device_power_off_seen,device_quicken_pending,device_poweroff_pending;}factory_bus;
static struct{int unused;}touch;
static struct{tf_key_press_t press;}key;
static int factory_bus_active=1,running=1,controls_enabled,factory_power_quiet,busy_visible,scroll_y,wifi_runtime;
static struct{int current,mode;}lock_chart;static struct{int initialized,active;}lock_motion;static struct{int n,active;}chart_animation;
static char pending[64],pending_label[64],verifying[64],notice[64],pin_feedback[64];static uint32_t notice_until;
static int factory_guard,display_runtime_ready=1,display_runtime_fault;static struct{int phase,brightness;}factory_lifecycle;
#define TF_FL_READY 7
static int actual_light,requests,positive_requests,frames,renders,sensors,policy_reads,raw_state=TF_FACTORY_POWER_ON,light_reads,resync_calls,heartbeats,touch_reads,tap_clears,key_polls,sleeps,data_starts,data_commits,ordinary_work,held_touch,held_key,complete_calls;
static int tf_http_cancelled,power_release_block,refresh_pending,last_dirty;
static uint32_t clock_ms,last,gesture_block_until;
static uint32_t tick(void){return clock_ms;}
static int display_runtime_fail(void){display_runtime_fault=1;running=0;tf_http_cancelled=1;return 0;}
static int tf_fb_poll(void*p){assert(p==&factory_bus);return 1;}
static int simulated_raw(const char*p){assert(!strcmp(p,"/etc/config/zwrt_zte_mc_tmp"));return raw_state;}
static int vendor_exec(const char*p,char*const*a,const char*i,char*out,size_t cap){(void)p;(void)a;(void)i;(void)out;(void)cap;assert(0);return -1;}
#define tf_factory_power_read_path simulated_raw
ACTUAL_POWER
static void tf_page_state_close(void){}static void tf_page_state_cancel(void){}static void tf_wifi_runtime_close(void*p){assert(p==&wifi_runtime);}static void data_backend_close(void){}
static void power_menu_reset(void){}static void lock_wallpaper_invalidate(void){}static void motion_cancel(void){}static void form_reset(void){}static void sms_forward_cleanup(void){}static void factory_extra_cleanup(void){}
static int display_runtime_login(int v){(void)v;assert(!factory_bus.sleep_unavailable);return 1;}
static int display_runtime_request(int level){assert(!factory_bus.sleep_unavailable);requests++;if(level>0)positive_requests++;actual_light=level;factory_lifecycle.brightness=level;return 1;}
static int display_runtime_begin_frame(void){assert(!factory_bus.sleep_unavailable);frames++;return 1;}
static int display_runtime_resync(void){assert(!factory_bus.sleep_unavailable);resync_calls++;factory_lifecycle.phase=TF_FL_READY;factory_lifecycle.brightness=actual_light;display_policy.on=actual_light>0;display_policy.brightness=actual_light;return 1;}
static int display_read_number(const char*p,int low,int high,int*out){assert(!factory_bus.sleep_unavailable&&!strcmp(p,"/sys/class/leds/led:lcd/brightness")&&low==0&&high==255);light_reads++;*out=actual_light;return 1;}
static int tf_guard_observe(void*p,const char*n){assert(p==&factory_guard&&!strcmp(n,"zteSleepBacklight"));return 0;}
static int tf_fb_power_complete(void*p){assert(p==&factory_bus&&!factory_bus.sleep_unavailable&&!actual_light&&factory_power_quiet);complete_calls++;factory_bus.device_quicken_pending=factory_bus.device_poweroff_pending=0;return 1;}
ACTUAL_OFF
static int display_runtime_unlock_policy(void){assert(!factory_bus.sleep_unavailable);policy_reads++;return 1;}
static int display_runtime_interrupted(void){return running&&!display_runtime_fault&&tf_http_cancelled&&(factory_bus.power_event||factory_bus.resync||!runtime_factory_power_read(1));}
ACTUAL_LOCK
static int render(drm_disp_t*p){assert(p==&d&&!factory_bus.sleep_unavailable);renders++;assert(pin_policy.locked);return 1;}
static int display_runtime_wake_sensor(void){assert(!factory_bus.sleep_unavailable);sensors++;return 1;}
ACTUAL_WAKE
static void data_backend_init(void){assert(!factory_bus.sleep_unavailable);data_starts++;}
static void data_backend_commit_latest(void){data_commits++;}
static void touch_input_read(void*p,int*x,int*y,int*pressed){assert(p==&touch);touch_reads++;*x=*y=10;*pressed=held_touch;}
static void touch_input_clear_taps(void*p){assert(p==&touch);tap_clears++;}
static int key_input_poll(void*p,uint32_t now){assert(p==&key&&now==clock_ms);key_polls++;key.press.pressed=held_key;return held_key?KEY_EV_LONG:KEY_EV_NONE;}
static void heartbeat(void){heartbeats++;}
static void usleep(unsigned n){assert(n==30000);sleeps++;}
static int main_off_step(void){int result=0;for(int step=0;step<1;step++){
 uint32_t now=tick();int dirty=0,x,y,pressed;
 /* These statements precede the extracted branch in main; event/read fusion
  * is the production function, not a fabricated ON transition. */
 factory_power.interrupted=0;runtime_factory_power_read(0);
ACTUAL_BRANCH
 last_dirty=dirty;ordinary_work++;
 }return result;}
static void event(int state,uint32_t sequence,uint32_t off_seen){factory_bus.device_power_state=state;factory_bus.device_power_sequence=sequence;factory_bus.device_power_off_seen=off_seen;}
int main(void){
 tf_display_config config={1,1,135,30,0,1,40,135,255};assert(tf_display_init_supported(&display_policy,&config,0,1));tf_pin_start(&pin_policy,1,0,0,0);pin_policy.locked=0;tf_soft_lock_reset(&soft_lock,1);factory_lifecycle.phase=TF_FL_READY;actual_light=135;
 event(TF_FACTORY_POWER_OFF,1,1);clock_ms=1000;assert(!main_off_step()&&factory_power_quiet&&factory_power.off_latched&&!display_policy.on&&!actual_light&&heartbeats==1&&sleeps==1&&!ordinary_work);
 int previous_requests=requests,previous_frames=frames,previous_light_reads=light_reads;factory_bus.sleep_unavailable=1;factory_bus.resync=1;factory_bus.power_event=2;held_touch=held_key=1;
 clock_ms=2000;assert(!main_off_step()&&factory_power_quiet&&!positive_requests&&requests==previous_requests&&frames==previous_frames&&light_reads==previous_light_reads&&heartbeats==2&&factory_bus.resync&&!factory_bus.power_event&&key.press.ignore_until_release);
 event(TF_FACTORY_POWER_ON,2,1);clock_ms=3000;assert(!main_off_step()&&factory_power.observed==TF_FACTORY_POWER_ON&&factory_power_quiet&&factory_power.off_latched&&!renders&&!sensors&&!policy_reads&&requests==previous_requests&&frames==previous_frames&&light_reads==previous_light_reads&&heartbeats==3&&tf_http_cancelled);
 clock_ms=4000;assert(!main_off_step()&&heartbeats==4&&touch_reads==4&&tap_clears==4&&key_polls==4&&sleeps==4&&!ordinary_work&&!positive_requests); /* no user key required */
 held_touch=held_key=0;factory_bus.sleep_unavailable=0;factory_bus.resync=1;clock_ms=4100;
 assert(!main_off_step()&&!factory_power_quiet&&!factory_power.off_latched&&display_policy.on&&actual_light==135&&positive_requests==1&&renders==1&&sensors==1&&policy_reads==1&&pin_policy.locked&&!controls_enabled&&data_starts==1&&data_commits==1&&ordinary_work==1&&power_release_block&&gesture_block_until==4400&&last_dirty&&refresh_pending&&!tf_http_cancelled&&resync_calls==1&&!factory_bus.resync);
 previous_requests=requests;previous_frames=frames;clock_ms=4200;assert(!main_off_step()&&ordinary_work==2&&positive_requests==1&&requests==previous_requests&&frames==previous_frames&&renders==1&&data_starts==1); /* repeated ready does not wake */
 event(TF_FACTORY_POWER_OFF,3,2);clock_ms=5000;assert(!main_off_step()&&factory_power_quiet&&factory_power.off_latched&&!display_policy.on&&!actual_light&&positive_requests==1&&ordinary_work==2&&heartbeats==5);
 factory_bus.sleep_unavailable=1;factory_bus.resync=1;event(TF_FACTORY_POWER_ON,4,2);clock_ms=6000;assert(!main_off_step()&&factory_power_quiet&&positive_requests==1&&heartbeats==6);event(TF_FACTORY_POWER_OFF,5,3);clock_ms=7000;assert(!main_off_step()&&factory_power_quiet&&!actual_light&&heartbeats==7);
 factory_bus.sleep_unavailable=0;clock_ms=8000;assert(!main_off_step()&&factory_power_quiet&&!actual_light&&!display_policy.on&&positive_requests==1&&renders==1&&heartbeats==8&&resync_calls==2&&!factory_bus.resync&&ordinary_work==2); /* latest OFF defeats pending ON */
 /* The first OFF can be in the same drained batch as provider removal,
  * before quiet has ever been established. A further ON in that batch may
  * not skip the pending safe dark transaction. No forced key is supplied. */
 for(int batched_on=0;batched_on<2;batched_on++){
  memset(&factory_power,0,sizeof factory_power);memset(&factory_bus,0,sizeof factory_bus);memset(&key,0,sizeof key);
  factory_power_quiet=0;assert(tf_display_init_supported(&display_policy,&config,clock_ms,1));pin_policy.locked=0;actual_light=0; /* OEM has already darkened its output */
  factory_bus.sleep_unavailable=factory_bus.resync=1;factory_bus.power_event=2;factory_bus.device_poweroff_pending=batched_on?0:1;
  event(batched_on?TF_FACTORY_POWER_ON:TF_FACTORY_POWER_OFF,batched_on?2:1,1);held_touch=held_key=1;
  int r=requests,f=frames,l=light_reads,p=positive_requests,calls=complete_calls,h=heartbeats,t=touch_reads,k=key_polls,work=ordinary_work,old_renders=renders;
  clock_ms+=1000;assert(!main_off_step()&&!factory_power_quiet&&factory_power.off_latched&&!display_policy.on&&!actual_light&&requests==r&&frames==f&&light_reads==l&&complete_calls==calls&&heartbeats==h+1&&touch_reads==t+1&&key_polls==k+1&&ordinary_work==work&&factory_bus.resync&&!factory_bus.power_event&&key.press.ignore_until_release);
  clock_ms+=1000;assert(!main_off_step()&&!factory_power_quiet&&factory_power.off_latched&&requests==r&&frames==f&&light_reads==l&&complete_calls==calls&&heartbeats==h+2&&ordinary_work==work&&tf_http_cancelled);
  held_touch=held_key=0;factory_bus.sleep_unavailable=0;clock_ms+=100;
  assert(!main_off_step()&&factory_power_quiet&&factory_power.off_latched&&!display_policy.on&&!actual_light&&requests==r+1&&positive_requests==p&&complete_calls==calls+(batched_on?0:1)&&!factory_bus.resync&&ordinary_work==work); /* confirm dark before wake */
  if(!batched_on)event(TF_FACTORY_POWER_ON,2,1);
  clock_ms++;assert(!main_off_step()&&!factory_power_quiet&&!factory_power.off_latched&&display_policy.on&&actual_light==135&&positive_requests==p+1&&renders==old_renders+1&&pin_policy.locked&&!controls_enabled&&ordinary_work==work+1);
 }
 assert(running);puts("PASS: actual main OFF branch defers ON/RESYNC and first-OFF batches while sleep provider is missing, keeps heartbeat/discards input, confirms dark after recovery then real runtime_wake lights PIN-protected frame without another key; repeated ready does not wake and a newer OFF stays dark");return 0;
}
'@
$branchSource=$branchSource.Replace('ACTUAL_POWER',$power).Replace('ACTUAL_OFF',$off).Replace('ACTUAL_LOCK',$lock).Replace('ACTUAL_WAKE',$wake).Replace('ACTUAL_BRANCH',$offBranch)
[IO.File]::WriteAllText("$root/build-preview/test-factory-power-main-branch.c",$branchSource)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -D_GNU_SOURCE "-I$root" "$root/build-preview/test-factory-power-main-branch.c" -o "$root/bin/test-factory-power-main-branch.exe"
if($LASTEXITCODE -ne 0){throw 'Factory power main branch build failed'}
& "$root/bin/test-factory-power-main-branch.exe"
if($LASTEXITCODE -ne 0){throw 'Factory power main branch failed'}
