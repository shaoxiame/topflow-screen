$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$native=[IO.File]::ReadAllText("$root/display_native.h")
$native=$native.Substring($native.IndexOf('static tf_display_policy'),$native.IndexOf('/* Exact SDK setters')-$native.IndexOf('static tf_display_policy'))
$runtime=[IO.File]::ReadAllText("$root/display_runtime.h")
$runtime=$runtime.Substring($runtime.IndexOf('static int display_factory_process('),$runtime.IndexOf('static int display_runtime_fail(')-$runtime.IndexOf('static int display_factory_process('))
$a=$runtime.IndexOf('static int display_factory_process(')
$b=$runtime.IndexOf('static int display_factory_provider(')
$runtime=$runtime.Substring(0,$a)+'static int display_factory_process(void){return factory_count;}'+$runtime.Substring($b)
$a=$runtime.IndexOf('static int display_sensor_write_attribute(')
$b=$runtime.IndexOf('static int display_prepare_adopt(')
$runtime=$runtime.Substring(0,$a)+'static int display_sensor_write_enabled(void){assert(factory_count==0&&own_guard&&pipe_ready&&sensor_enable==0);sensor_init_writes++;if(sensor_init_fail){display_config_failure="ADOPT_SENSOR_INIT";return 0;}sensor_writes++;if(sensor_write_fail)return 0;if(!sensor_write_noop)sensor_enable=1;return 1;}'+$runtime.Substring($b)
$prefix=@'
#include <assert.h>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include "display_policy.h"
#include "display_handover.h"
#include "factory_lifecycle.h"
#include "factory_guard.h"
#include "display_idle_guard.h"
/* Only I/O is substituted. These are non-secret read-only captured facts. */
static const char*config="zwrt_deviceui.Screen.Lock_Screen_PIN_Enable_State='1'\nzwrt_deviceui.Screen.auto_screen_brightness='1'\nzwrt_deviceui.Screen.brightness='135'\nzwrt_deviceui.Screen.screen_show_interval='30'\nzwrt_deviceui.Screen.screen_wakeup='0'\n";
static const char*kernel_locks="sysZteSleepLock zteSleepBacklight zte_topsw_devui_auto_sleep_lock\n";
static const char*map="zte_topsw_data 17634\nzte_topsw_mc 17739\nzte_topsw_wlan_access_num 19789\n";
static const char*missing=NULL;
static int factory_count=1,guard_valid=1,provider=1,sleep_provider=1,lcd_value=13,command_count=0;
static int own_guard,guard_writes,sensor_writes,sensor_enable=1,sensor_write_fail,sensor_write_noop,policy_read_fail,guard_write_fail,tf_http_cancelled,display_direct_wake,display_startup_guard_pending,expire_guard_on_poll,expire_guard_on_helper,display_frame_guard;
static int pipe_ready,sensor_reads,sensor_read_failures,sensor_polls,bad_helper,handover_started,sensor_init_writes,sensor_init_fail,sensor_read_delay,expire_guard_on_tick;
static uint32_t clock_ms;
static uint32_t tick(void){return clock_ms;}
static const char*sensor_name="lightsensor-level\n",*sensor_lux="3 lux",*failure_code;
static const char*next_lux;
static int map_stat_calls=0,map_race=0;static const char*next_map=NULL;
static tf_factory_guard factory_guard;
static tf_display_idle_guard display_idle_guard;
static tf_factory_lifecycle factory_lifecycle;
static void native_failure_note(const char*code){assert(code&&*code);failure_code=code;}
static struct{int unused;}factory_bus;static int factory_bus_active=0,helper_starts=0,helper_stops=0;
static int tf_fb_start(void*bus){assert(bus==&factory_bus);helper_starts++;if(expire_guard_on_helper)own_guard=0;return 1;}
static void tf_fb_stop(void*bus){assert(bus==&factory_bus);helper_stops++;}
static int tf_fb_tick(void*bus){assert(bus==&factory_bus);if(expire_guard_on_tick)own_guard=0;return !bad_helper;}
static int read_active(void*unused,char*out,size_t cap){(void)unused;return snprintf(out,cap,"%s%s",kernel_locks,own_guard?" topflow_screen_12345_98765":"");}
static int never_write(void*unused,enum tf_guard_resource resource,const char*in,size_t n){(void)unused;(void)n;assert(factory_count==0&&resource==TF_GUARD_ACQUIRE);assert(!strcmp(in,"topflow_screen_12345_98765 10000000000\n"));guard_writes++;if(guard_write_fail)return 0;own_guard=1;return 1;}
static int tf_guard_linux_current(tf_factory_guard*g){if(!guard_valid)return 0;tf_guard_io io={NULL,read_active,never_write};return tf_guard_init(g,12345,98765,io);}
static FILE*test_fopen(const char*path,const char*mode){
 assert(!strcmp(mode,"rb"));
 if(!strncmp(path,"/sys/class/input/input3/",sizeof("/sys/class/input/input3/")-1)){
  if(handover_started)assert(pipe_ready);sensor_reads++;
  if(!strcmp(path,"/sys/class/input/input3/driver/enable")){clock_ms+=(uint32_t)sensor_read_delay;if(sensor_read_failures>0){sensor_read_failures--;return NULL;}}
 }
 if(missing&&!strcmp(path,missing))return NULL;
 const char*value=NULL;char number[32];size_t n=0;
 if(!strcmp(path,"/sys/class/leds/led:lcd/brightness")){snprintf(number,sizeof number,"%d\n",lcd_value);value=number;}
 else if(!strcmp(path,"/sys/class/leds/led:lcd/max_brightness"))value="255\n";
 else if(!strcmp(path,"/sys/class/input/input3/name"))value=sensor_name;
 else if(!strcmp(path,"/sys/class/input/input3/driver/enable")){snprintf(number,sizeof number,"%d\n",sensor_enable);value=number;}
 else if(!strcmp(path,"/sys/class/input/input3/driver/lux"))value=sensor_lux;
 else if(!strcmp(path,"/tmp/wakelockMap.txt"))value=map;
 else assert(!"Unexpected path, including a PIN-value read");
 FILE*f=tmpfile();assert(f);if(!n)n=strlen(value);assert(fwrite(value,1,n,f)==n);rewind(f);return f;
}
static int test_fstat(int fd,struct stat*out){(void)fd;memset(out,0,sizeof *out);out->st_mode=S_IFREG;out->st_size=(long)strlen(map);out->st_ino=17;out->st_dev=1;out->st_mtime=1;out->st_ctime=1;if(map_race&&++map_stat_calls>1)out->st_mtime=2;return 0;}
static int test_stat(const char*path,struct stat*out){assert(!strcmp(path,"/tmp/wakelockMap.txt"));return test_fstat(0,out);}
static int poll(void*fd,int count,int ms){assert(!fd&&!count&&ms==100);clock_ms+=(uint32_t)ms;if(factory_count==0&&pipe_ready)sensor_polls++;if(next_map){map=next_map;next_map=NULL;}if(next_lux&&own_guard){sensor_lux=next_lux;next_lux=NULL;}if(expire_guard_on_poll&&own_guard)own_guard=0;return 0;}
static int vendor_exec(const char*path,char*const args[],const char*input,char*out,size_t cap){
 command_count++;
 if(!strcmp(path,"/sbin/uci")){assert(input&&!strncmp(input,"show ",5)&&!strstr(input,"set ")&&!strstr(input,"commit")&&!strstr(input,"Lock_Screen_PIN_Code"));if(policy_read_fail)return 1;snprintf(out,cap,"%s",config);return 0;}
 assert(!strcmp(path,"/bin/ubus"));assert(!strcmp(args[3],"-v")||!strcmp(args[3],"list"));assert(!input);
 if(!strcmp(args[3],"-v")){if(!provider)return 127;snprintf(out,cap,"'zwrt_deviceui' @ca783b59\n\t\"zwrt_deviceui_touch_status_get\":{}\n\t\"zwrt_deviceui_direct_power_mode_get\":{}\n\t\"zwrt_deviceui_direct_power_mode_set\":{}\n");}
 else{if(!sleep_provider)return 1;snprintf(out,cap,"zwrt_zte_sleep_faw.power_status\n");}return 0;
}
#define fopen test_fopen
#define fstat test_fstat
#define stat(path,out) test_stat(path,out)
'@
$suffix=@'
#undef fopen
#undef fstat
#undef stat
static void refused(const char*code){char receipt[384]="";assert(!display_preflight_receipt(receipt,sizeof receipt));assert(display_refusal&&!strcmp(display_refusal,code));assert(!*receipt);}
static void adopt_refused(const char*receipt,const char*code){int helpers=helper_starts;failure_code=NULL;assert(!display_prepare_adopt(receipt)&&helper_starts==helpers);assert(failure_code&&!strcmp(failure_code,code));}
static void sensor_refused(const char*code){failure_code=NULL;assert(!display_runtime_after_drm(pipe_ready));assert(failure_code&&!strcmp(failure_code,code));}
int main(void){char receipt[384];tf_display_receipt captured;
 /* Read-only direct preflight records active locks instead of claiming them
  * clear. Their owner/protocol barrier belongs to the supervisor. */
 assert(display_preflight_receipt(receipt,sizeof receipt)&&command_count==3);
 assert(tf_receipt_parse(receipt,&captured)&&captured.internal==0&&captured.auto_lock==1&&captured.direct==1&&captured.lux==3&&captured.pin==0);
 map="zte_topsw_data 17634\nzte_topsw_devui 18392\nzte_topsw_mc 17739\n";
 assert(display_preflight_receipt(receipt,sizeof receipt)&&tf_receipt_parse(receipt,&captured)&&captured.internal==1);
 const char*initial_config=config;char pin_config[1024];snprintf(pin_config,sizeof pin_config,"%s",config);char*pin_raw=strstr(pin_config,"State='1'");assert(pin_raw);pin_raw[7]='0';config=pin_config;assert(display_preflight_receipt(receipt,sizeof receipt)&&tf_receipt_parse(receipt,&captured)&&captured.pin==1);pin_raw[7]='2';refused("DISPLAY_STATE_UNKNOWN");config=initial_config;
 const char*original_config=config;char always_on[1024];snprintf(always_on,sizeof always_on,"%s",config);char*timeout=strstr(always_on,"'30'");assert(timeout);timeout[1]='-';timeout[2]='1';config=always_on;assert(display_preflight_receipt(receipt,sizeof receipt)&&tf_receipt_parse(receipt,&captured)&&captured.timeout==-1);config=original_config;
 map="zte_topsw_devui malformed\n";refused("FACTORY_INTERNAL_LOCK_UNKNOWN");
 map="";assert(display_preflight_receipt(receipt,sizeof receipt));
 next_map="zte_topsw_devui 18392\n";refused("FACTORY_INTERNAL_LOCK_UNSTABLE");
 map="zte_topsw_data 17634\n";next_map="";refused("FACTORY_INTERNAL_LOCK_UNSTABLE");
 map="zte_topsw_data 17634";refused("FACTORY_INTERNAL_LOCK_UNSTABLE");map="zte_topsw_data 17634\n";
 map_race=1;map_stat_calls=0;refused("FACTORY_INTERNAL_LOCK_UNSTABLE");map_race=0;
 missing="/tmp/wakelockMap.txt";refused("FACTORY_INTERNAL_LOCK_UNKNOWN");missing=NULL;
 provider=0;refused("FACTORY_PROVIDER_UNAVAILABLE");provider=1;
 sleep_provider=0;refused("SLEEP_PROVIDER_UNAVAILABLE");sleep_provider=1;
 factory_count=0;refused("FACTORY_PROCESS_UNAVAILABLE");factory_count=2;refused("FACTORY_PROCESS_UNAVAILABLE");factory_count=1;
 guard_valid=0;refused("DISPLAY_GUARD_UNAVAILABLE");guard_valid=1;
 kernel_locks="sysZteSleepLock\n";refused("DISPLAY_LOCK_STATE_MISMATCH");
 lcd_value=0;assert(display_preflight_receipt(receipt,sizeof receipt));
 missing="/sys/class/input/input3/driver/lux";assert(display_preflight_receipt(receipt,sizeof receipt)&&tf_receipt_parse(receipt,&captured)&&captured.lux==-1);{tf_display_config page;assert(display_read_settings_config(&page)&&page.automatic==1&&page.brightness==135&&page.sensor_lux==-1);assert(!display_read_config(&page));}missing=NULL;
 sensor_enable=0;assert(display_preflight_receipt(receipt,sizeof receipt)&&tf_receipt_parse(receipt,&captured)&&captured.sensor==0);{tf_display_config page;assert(display_read_settings_config(&page)&&page.sensor_enabled==0&&page.brightness==135);}sensor_enable=1;
 missing="/sys/class/leds/led:lcd/max_brightness";refused("DISPLAY_STATE_UNKNOWN");missing=NULL;
 assert(guard_writes==0&&sensor_writes==0&&helper_starts==0);
 assert(display_preflight_receipt(receipt,sizeof receipt));factory_count=0;handover_started=1;
 kernel_locks="sysZteSleepLock zte_topsw_devui_auto_sleep_lock\n";adopt_refused(receipt,"ADOPT_AUTOSLEEP_LOCK");
 kernel_locks="sysZteSleepLock\n";map="zte_topsw_devui 18392\n";adopt_refused(receipt,"ADOPT_INTERNAL_LOCK");
 map="";config=always_on;adopt_refused(receipt,"ADOPT_POLICY_CHANGED");config=original_config;
 char changed[1024];snprintf(changed,sizeof changed,"%s",config);char*change=strstr(changed,"Enable_State='1'");assert(change);change[strlen("Enable_State='")]='0';config=changed;adopt_refused(receipt,"ADOPT_PIN_POLICY");config=original_config;
 snprintf(changed,sizeof changed,"%s",config);change=strstr(changed,"auto_screen_brightness='1'");assert(change);change[strlen("auto_screen_brightness='")]='0';config=changed;adopt_refused(receipt,"ADOPT_POLICY_CHANGED");config=original_config;
 policy_read_fail=1;adopt_refused(receipt,"ADOPT_POLICY_READ");policy_read_fail=0;
 config="zwrt_deviceui.Screen.brightness='135'\n";adopt_refused(receipt,"ADOPT_POLICY_INVALID");config=original_config;
 assert(guard_writes==0&&sensor_writes==0);
 guard_write_fail=1;adopt_refused(receipt,"ADOPT_GUARD_ACTIVE");guard_write_fail=0;
 /* Reproduce the device power dependency: between factory exit and DRM pipe
  * enable every sensor access is invalid. Adoption must not perform one. */
 int reads=sensor_reads,writes=sensor_writes;missing="/sys/class/input/input3/driver/enable";
 assert(display_prepare_adopt(receipt)&&helper_starts==1&&factory_bus_active&&display_direct_wake==1&&display_startup_guard_pending);
 assert(sensor_reads==reads&&sensor_writes==writes&&!tf_display_valid(&display_config));
 sensor_refused("DRM_INIT");assert(sensor_reads==reads);missing=NULL;
 pipe_ready=1;display_frame_guard=1;
 char after_changed[1024];snprintf(after_changed,sizeof after_changed,"%s",config);change=strstr(after_changed,"Enable_State='1'");assert(change);change[strlen("Enable_State='")]='0';config=after_changed;sensor_refused("ADOPT_PIN_POLICY");config=original_config;
 config=changed;sensor_refused("ADOPT_POLICY_CHANGED");config=original_config;
 missing="/sys/class/leds/led:lcd/brightness";sensor_refused("ADOPT_BRIGHTNESS");missing=NULL;
 sensor_name="not-the-light-sensor\n";sensor_refused("ADOPT_SENSOR_ID");sensor_name="lightsensor-level\n";
 sensor_enable=2;sensor_refused("ADOPT_SENSOR_STATE");sensor_enable=0;
 int init_writes=sensor_init_writes;writes=sensor_writes;sensor_init_fail=1;sensor_refused("ADOPT_SENSOR_INIT");assert(sensor_init_writes==init_writes+1&&sensor_writes==writes);sensor_init_fail=0;
 sensor_write_fail=1;sensor_refused("ADOPT_SENSOR_ENABLE");sensor_write_fail=0;
 sensor_write_noop=1;sensor_polls=0;writes=sensor_writes;sensor_refused("ADOPT_SENSOR_ENABLE");assert(sensor_writes==writes+1&&sensor_polls==20);sensor_write_noop=0;
 sensor_lux="invalid";sensor_refused("ADOPT_SENSOR_LUX");sensor_lux="3 lux";
 missing="/sys/class/input/input3/driver/enable";sensor_polls=0;init_writes=sensor_init_writes;writes=sensor_writes;sensor_refused("ADOPT_SENSOR_READ");assert(sensor_polls==20&&sensor_init_writes==init_writes&&sensor_writes==writes);missing=NULL;
 sensor_read_delay=2100;sensor_polls=0;sensor_refused("ADOPT_SENSOR_READ");assert(sensor_polls==0&&sensor_init_writes==init_writes&&sensor_writes==writes);sensor_read_delay=0;
 sensor_lux="not-ready";next_lux="3 lux";expire_guard_on_poll=1;sensor_refused("ADOPT_GUARD_ACTIVE");expire_guard_on_poll=0;own_guard=1;
 tf_http_cancelled=1;int cancelled_writes=sensor_writes;sensor_refused("ADOPT_GUARD_ACTIVE");assert(sensor_writes==cancelled_writes);tf_http_cancelled=0;
 bad_helper=1;sensor_refused("ADOPT_GUARD_ACTIVE");bad_helper=0;
 expire_guard_on_tick=1;sensor_refused("ADOPT_GUARD_ACTIVE");expire_guard_on_tick=0;own_guard=1;
 /* After DRM is on, transient I/O settles; a disabled sensor is enabled
  * exactly once and actual enable/lux readback supplies the live policy. */
 sensor_enable=0;sensor_read_failures=2;sensor_polls=0;writes=sensor_writes;
 assert(display_runtime_after_drm(pipe_ready)&&sensor_read_failures==0&&sensor_polls==3);
 assert(sensor_writes==writes+1&&display_config.sensor_enabled==1&&display_config.sensor_lux==3&&tf_display_valid(&display_config));
 writes=sensor_writes;init_writes=sensor_init_writes;assert(display_runtime_after_drm(pipe_ready)&&sensor_writes==writes&&sensor_init_writes==init_writes);
 /* Manual brightness has no sensor prerequisite and never resets a driver. */
 display_config.automatic=0;config=changed;missing="/sys/class/input/input3/driver/enable";reads=sensor_reads;
 assert(display_runtime_after_drm(pipe_ready)&&sensor_reads==reads&&sensor_init_writes==init_writes&&sensor_writes==writes);missing=NULL;display_config.automatic=1;config=original_config;
 int previous_guards=guard_writes;own_guard=0;failure_code=NULL;
 assert(!display_runtime_startup_frame()&&guard_writes==previous_guards&&!strcmp(failure_code,"ADOPT_GUARD_ACTIVE"));own_guard=1;
 factory_bus_active=0;display_startup_guard_pending=0;expire_guard_on_helper=1;failure_code=NULL;pipe_ready=0;reads=sensor_reads;
 assert(!display_prepare_adopt(receipt)&&helper_starts==2&&helper_stops==1&&!factory_bus_active&&!display_startup_guard_pending);assert(failure_code&&!strcmp(failure_code,"ADOPT_GUARD_ACTIVE"));assert(sensor_reads==reads);
 puts("PASS: read-only preflight captures policy/locks; post-stop adoption never accesses unpowered sensor; DRM-ready gate precedes live sensor checks; bounded I/O retries and one enable require real lux, preserve guard/helper checks; persistent I/O, invalid value, missing identity, expired guard and stale lux fail closed; never writes UCI or vendor locks");return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-display-preflight.c",$prefix+"`n"+$native+"`n"+$runtime+"`n"+$suffix)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-display-preflight.c" -o "$root/bin/test-display-preflight.exe"
if($LASTEXITCODE -ne 0){throw 'Display preflight test build failed'}
& "$root/bin/test-display-preflight.exe"
if($LASTEXITCODE -ne 0){throw 'Display preflight test failed'}
$evidence=[IO.File]::ReadAllText("$root/../analysis/evidence/preflight-facts-readonly.txt")
if(!$evidence.Contains('ABSENT /sbin/ubus') -or !$evidence.Contains('/bin/ubus')){throw 'Missing actual executable-path evidence'}
foreach($file in Get-ChildItem -LiteralPath $root -File | Where-Object {$_.Extension -in '.c','.h'}){if([IO.File]::ReadAllText($file.FullName).Contains('/sbin/ubus')){throw "Incorrect target ubus path: $($file.Name)"}}
Write-Output 'PASS: every production C/header ubus path matches the captured device executable'
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$adopt=$main.IndexOf('if(!display_prepare_adopt(argv[2]))')
$frameGuard=$main.IndexOf('if(!display_runtime_begin_frame()){',$adopt)
$drm=$main.IndexOf('drm_disp_t d;if(drm_disp_init',$frameGuard)
$sensor=$main.IndexOf('if(!display_runtime_after_drm(d.fd>=0&&d.fb!=NULL))',$drm)
$policy=$main.IndexOf('if(!tf_display_init_supported(',$sensor)
$leaseCheck=$main.IndexOf('if(!display_runtime_startup_frame())',$policy)
$firstFrame=$main.IndexOf('if(!render(&d))',$leaseCheck)
$lcdOn=$main.IndexOf('if(!display_runtime_adopt())',$firstFrame)
$heartbeat=$main.IndexOf('heartbeat();',$lcdOn)
if($adopt -lt 0 -or $frameGuard -le $adopt -or $drm -le $frameGuard -or $sensor -le $drm -or $policy -le $sensor -or $leaseCheck -le $policy -or $firstFrame -le $leaseCheck -or $lcdOn -le $firstFrame -or $heartbeat -le $lcdOn){throw 'Startup must establish guard, power DRM, recover sensor, initialize policy, verify existing lease, render protected frame, confirm LCD ON, then heartbeat'}
Write-Output 'PASS: production main orders guard -> DRM black frame -> sensor -> policy -> verify existing lease -> protected UI frame -> LCD ON -> heartbeat'
