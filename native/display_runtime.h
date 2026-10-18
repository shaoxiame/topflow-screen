/* Actual fixed-path display/sleep transport; no closed SDK initialization. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_DISPLAY_RUNTIME_H
#define TF_DISPLAY_RUNTIME_H
#include <dirent.h>
#include "factory_bus_client.h"
#include "factory_guard.h"
#include "display_idle_guard.h"
#include "factory_lifecycle.h"
#include "display_handover.h"
static tf_factory_bus factory_bus;
static tf_factory_guard factory_guard;
static tf_display_idle_guard display_idle_guard;
static tf_factory_lifecycle factory_lifecycle;
static int factory_bus_active=0,display_runtime_ready=0,display_runtime_fault=0,display_frame_guard=0;
static int display_direct_wake=0,display_startup_guard_pending=0;
static int display_runtime_wake_sensor(void);
/* The vendor debugfs sleep indicator is a read-to-clear history event, not a
 * live panel state. Never consume it in either preflight or our runtime. */
static int display_factory_process(void){
 DIR*d=opendir("/proc");if(!d)return -1;struct dirent*entry;int found=0;
 while((entry=readdir(d))){const char*p=entry->d_name;if(!*p)continue;while(*p>='0'&&*p<='9')p++;if(*p)continue;
  char path[128],exe[256];int z=snprintf(path,sizeof path,"/proc/%s/exe",entry->d_name);if(z<0||(size_t)z>=sizeof path)continue;
  ssize_t n=readlink(path,exe,sizeof exe-1);if(n>0&&(size_t)n<sizeof exe-1){exe[n]=0;if(!strcmp(exe,"/usr/bin/zte_topsw_devui"))found++;}
 }closedir(d);return found;
}
static int display_factory_provider(void){
 char response[8192];char*const argv[]={"ubus","-t","1","-v","list","zwrt_deviceui",NULL};
 if(vendor_exec("/bin/ubus",argv,NULL,response,sizeof response))return 0;
 return strstr(response,"'zwrt_deviceui'")&&strstr(response,"\"zwrt_deviceui_touch_status_get\"")&&strstr(response,"\"zwrt_deviceui_direct_power_mode_get\"")&&strstr(response,"\"zwrt_deviceui_direct_power_mode_set\"");
}
static int display_sleep_provider(void){
 char response[1024];char*const argv[]={"ubus","-t","1","list","zwrt_zte_sleep_faw.power_status",NULL};
 if(vendor_exec("/bin/ubus",argv,NULL,response,sizeof response))return 0;
 size_t n=strlen(response);while(n&&isspace((unsigned char)response[n-1]))response[--n]=0;return !strcmp(response,"zwrt_zte_sleep_faw.power_status");
}
static int display_map_same(const struct stat*a,const struct stat*b){
 if(a->st_dev!=b->st_dev||a->st_ino!=b->st_ino||a->st_size!=b->st_size||a->st_mtime!=b->st_mtime||a->st_ctime!=b->st_ctime)return 0;
#ifdef __linux__
 if(a->st_mtim.tv_nsec!=b->st_mtim.tv_nsec||a->st_ctim.tv_nsec!=b->st_ctim.tv_nsec)return 0;
#endif
 return 1;
}
/* The factory writer truncates then rewrites the whole map on add/delete.
 * Empty is legitimate only when both complete snapshots are stable and equal;
 * a single empty read, unfinished line or changing inode proves nothing. */
static int display_map_read(char*out,size_t cap,struct stat*observed){
 const char*path="/tmp/wakelockMap.txt";struct stat before,after,current;
 FILE*f=fopen(path,"rb");if(!f)return -1;
 if(fstat(fileno(f),&before)||!S_ISREG(before.st_mode)){fclose(f);return -1;}
 if(before.st_size<0||(uint64_t)before.st_size>=cap){fclose(f);return -2;}
 size_t n=fread(out,1,cap-1,f);int ok=!ferror(f)&&feof(f)&&fstat(fileno(f),&after)==0;fclose(f);
 if(!ok)return -1;
 if(!display_map_same(&before,&after)||n!=(size_t)before.st_size||(n&&out[n-1]!='\n')||memchr(out,0,n))return -2;
 if(stat(path,&current))return -1;if(!display_map_same(&after,&current))return -2;
 out[n]=0;*observed=after;return 1;
}
static int display_internal_lock(void){
 char first[8192],second[8192];struct stat a,b;int read=display_map_read(first,sizeof first,&a);if(read!=1)return read;
 int locked=tf_vendor_internal_lock(first);if(locked<0)return -1;
 poll(NULL,0,100);
 read=display_map_read(second,sizeof second,&b);if(read!=1)return read;
 if(!display_map_same(&a,&b)||strcmp(first,second))return -2;
 return locked;
}
static int display_preflight_receipt(char*out,size_t cap){
 if(!display_preflight())return 0;
 if(!tf_guard_linux_current(&factory_guard)){display_refusal="DISPLAY_GUARD_UNAVAILABLE";return 0;}
 tf_fl_snapshot s={0};s.original_present=display_factory_process()==1;
 if(!s.original_present){display_refusal="FACTORY_PROCESS_UNAVAILABLE";return 0;}
 s.original_provider_present=display_factory_provider();
 if(!s.original_provider_present){display_refusal="FACTORY_PROVIDER_UNAVAILABLE";return 0;}
 s.sleep_provider_present=display_sleep_provider();
 if(!s.sleep_provider_present){display_refusal="SLEEP_PROVIDER_UNAVAILABLE";return 0;}
 s.config_known=1;s.authentication_ready=1;s.periodic_wake_ready=display_config.wakeup_periodic==0;
 if(!display_read_number("/sys/class/leds/led:lcd/brightness",0,255,&s.brightness)){display_refusal="DISPLAY_BRIGHTNESS_UNAVAILABLE";return 0;}
 s.lcd_lock_present=tf_guard_observe(&factory_guard,"zteSleepBacklight");
 if(s.lcd_lock_present<0){display_refusal="DISPLAY_LCD_LOCK_UNAVAILABLE";return 0;}
 s.original_internal_lock_present=display_internal_lock();
 if(s.original_internal_lock_present==-2){display_refusal="FACTORY_INTERNAL_LOCK_UNSTABLE";return 0;}
 if(s.original_internal_lock_present<0){display_refusal="FACTORY_INTERNAL_LOCK_UNKNOWN";return 0;}
 /* Record active factory locks honestly. The explicit direct-handover
  * supervisor owns their protocol/identity barrier; this path never writes a
  * lock or tells the lifecycle coordinator that an active lock is absent. */
 int auto_sleep_lock=tf_guard_observe(&factory_guard,"zte_topsw_devui_auto_sleep_lock");
 if(auto_sleep_lock<0){display_refusal="FACTORY_AUTOSLEEP_LOCK_UNKNOWN";return 0;}
 if((s.brightness>0)!=s.lcd_lock_present){display_refusal="DISPLAY_LOCK_STATE_MISMATCH";return 0;}
 tf_display_receipt receipt={display_config.pin_enabled,s.brightness,s.lcd_lock_present,display_config.automatic,display_config.brightness,display_config.timeout_seconds,display_config.wakeup_periodic,display_config.sensor_enabled,display_config.sensor_lux,s.original_internal_lock_present,auto_sleep_lock,1};
 if(!tf_receipt_format(out,cap,&receipt)){display_refusal="DISPLAY_RECEIPT_FAILED";return 0;}return 1;
}
/* Factory UI @0x452e80 reads sensor state, and only when automatic mode wants
 * ON but observes OFF calls ZTD_ResetLightSensorState then SetLightSensorState.
 * These SDK wrappers write the two fixed attributes below; no SDK-wide init,
 * shell, driver reload or persistent configuration is involved. */
static int display_sensor_write_attribute(const char*path){
#ifdef __linux__
 int fd=tf_guard_open_sysfs(path,O_WRONLY);if(fd<0)return 0;
 ssize_t n;do{n=write(fd,"1\n",2);}while(n<0&&errno==EINTR);int closed=close(fd);return n==2&&closed==0;
#else
 (void)path;return 0;
#endif
}
static int display_sensor_write_enabled(void){
#ifdef __linux__
 if(tf_http_cancelled||display_factory_process()!=0||tf_guard_observe(&factory_guard,factory_guard.name)!=1){display_config_failure="ADOPT_GUARD_ACTIVE";return 0;}
 int enabled;if(!display_sensor_identity()){display_config_failure="ADOPT_SENSOR_ID";return 0;}
 if(!display_sensor_read_enable(&enabled))return 0;
 if(enabled==1)return 1;
 if(tf_http_cancelled||display_factory_process()!=0||tf_guard_observe(&factory_guard,factory_guard.name)!=1){display_config_failure="ADOPT_GUARD_ACTIVE";return 0;}
 if(!display_sensor_write_attribute("/sys/class/input/input3/driver/init")){display_config_failure="ADOPT_SENSOR_INIT";return 0;}
 if(tf_http_cancelled||display_factory_process()!=0||tf_guard_observe(&factory_guard,factory_guard.name)!=1){display_config_failure="ADOPT_GUARD_ACTIVE";return 0;}
 if(!display_sensor_write_attribute("/sys/class/input/input3/driver/enable")){display_config_failure="ADOPT_SENSOR_ENABLE";return 0;}return 1;
#else
 return 0;
#endif
}
static int display_prepare_adopt(const char*receipt_text){
 tf_display_receipt r;
 if(!tf_receipt_parse(receipt_text,&r)){native_failure_note("ADOPT_RECEIPT");return 0;}
 if(display_factory_process()!=0){native_failure_note("ADOPT_FACTORY_PRESENT");return 0;}
 /* Captured kernel events show sensor I/O unavailable after original QPIC
  * pipe disable. Read persistent policy here, but do not touch the sensor
  * driver until our DRM pipe has submitted its first black buffer. */
 if(!display_read_policy_observed(&display_config)){native_failure_note(display_config_failure);return 0;}
 if(r.pin!=display_config.pin_enabled){native_failure_note("ADOPT_PIN_POLICY");return 0;}
 tf_display_config captured=tf_receipt_config(&r);
 if(!tf_display_same_policy(&captured,&display_config)){native_failure_note("ADOPT_POLICY_CHANGED");return 0;}
 if(display_internal_lock()!=0){native_failure_note("ADOPT_INTERNAL_LOCK");return 0;}
 if(!tf_guard_linux_current(&factory_guard)){native_failure_note("ADOPT_GUARD_IDENTITY");return 0;}
 if(tf_guard_observe(&factory_guard,"zte_topsw_devui_auto_sleep_lock")!=0){native_failure_note("ADOPT_AUTOSLEEP_LOCK");return 0;}
 /* The original-online facts are the strict receipt produced by this binary
  * while the supervisor still owned a live original PID. Fresh facts below
  * are independently rechecked after that PID has gone. */
 tf_fl_snapshot s={1,1,1,1,1,1,r.brightness,r.lcd_lock,0};
 tf_fl_init(&factory_lifecycle);if(!tf_fl_prepare(&factory_lifecycle,TF_FL_REQUIRED,&s)){native_failure_note("ADOPT_LIFECYCLE");return 0;}
 if(!display_sleep_provider()){native_failure_note("ADOPT_SLEEP_PROVIDER");return 0;}
 if(!tf_idle_init(&display_idle_guard,&factory_guard)){native_failure_note("ADOPT_IDLE_GUARD");return 0;}
 if(!tf_guard_acquire(&factory_guard)||tf_guard_observe(&factory_guard,factory_guard.name)!=1){native_failure_note("ADOPT_GUARD_ACTIVE");return 0;}
 display_direct_wake=r.direct;
 if(!tf_fb_start(&factory_bus))return 0;
 /* Helper startup is bounded, but must not silently outlive the existing
  * lease. A later refresh cannot repair a gap in startup protection. */
 if(tf_guard_observe(&factory_guard,factory_guard.name)!=1){native_failure_note("ADOPT_GUARD_ACTIVE");tf_fb_stop(&factory_bus);factory_bus_active=0;return 0;}
 factory_bus_active=1;display_startup_guard_pending=1;return 1;
}
static int display_sensor_guard_alive(void){
 return !tf_http_cancelled&&factory_bus_active&&display_frame_guard&&display_factory_process()==0&&tf_guard_observe(&factory_guard,factory_guard.name)==1&&tf_fb_tick(&factory_bus)&&!tf_http_cancelled&&display_factory_process()==0&&tf_guard_observe(&factory_guard,factory_guard.name)==1;
}
static int display_runtime_startup_frame(void){
 /* Never replace an expired startup lease with a new one and call that a
  * continuous handover. Check existing ownership before any renewal. */
 if(!display_sensor_guard_alive()||!tf_guard_acquire(&factory_guard)||tf_guard_observe(&factory_guard,factory_guard.name)!=1){native_failure_note("ADOPT_GUARD_ACTIVE");return 0;}return 1;
}
static int display_runtime_after_drm(int pipe_ready){
 if(!pipe_ready){native_failure_note("DRM_INIT");return 0;}
 if(!display_sensor_guard_alive()){native_failure_note("ADOPT_GUARD_ACTIVE");return 0;}
 tf_display_config observed;
 if(!display_read_policy_observed(&observed)){native_failure_note(display_config_failure);return 0;}
 if(observed.pin_enabled!=display_config.pin_enabled){native_failure_note("ADOPT_PIN_POLICY");return 0;}
 if(!tf_display_same_policy(&display_config,&observed)){native_failure_note("ADOPT_POLICY_CHANGED");return 0;}
 display_config=observed;
 if(!display_read_output(&display_config)||!display_sensor_prepare(&display_config,display_sensor_write_enabled,display_sensor_guard_alive)){native_failure_note(display_config_failure);return 0;}
 if(!tf_display_valid(&display_config)){native_failure_note("ADOPT_CONFIG");return 0;}
 /* Preserve continuous protection across the bounded sensor check, then
  * renew only an observed live lease before font/PIN/first-frame work. */
 return display_runtime_startup_frame();
}
static int display_runtime_fail(void){display_runtime_fault=1;display_runtime_ready=0;running=0;tf_http_cancelled=1;return 0;}
/* Protect a complete frame transaction with our finite lease. This proves an
 * owned active transition, not a guessed physical panel/suspend boolean. */
static int display_runtime_begin_frame(void){
 /* PIN storage/font initialization may block before the first frame. Verify
  * its original lease before renewal. Normal later wakes start a new lease. */
 if(display_startup_guard_pending&&tf_guard_observe(&factory_guard,factory_guard.name)!=1){native_failure_note("ADOPT_GUARD_ACTIVE");if(factory_bus_active)tf_fb_stop(&factory_bus);factory_bus_active=0;display_startup_guard_pending=0;return display_runtime_fail();}
 if(!factory_bus_active||!tf_fb_tick(&factory_bus)){native_failure_note("DISPLAY_RUNTIME");return display_runtime_fail();}
 if(display_startup_guard_pending&&tf_guard_observe(&factory_guard,factory_guard.name)!=1){native_failure_note("ADOPT_GUARD_ACTIVE");tf_fb_stop(&factory_bus);factory_bus_active=0;display_startup_guard_pending=0;return display_runtime_fail();}
 if(!tf_guard_acquire(&factory_guard)||tf_guard_observe(&factory_guard,factory_guard.name)!=1){native_failure_note("DISPLAY_RUNTIME");return display_runtime_fail();}display_startup_guard_pending=0;display_frame_guard=1;return 1;
}
static int display_runtime_drive(void){
 while(running){
  if(!tf_fb_tick(&factory_bus)){tf_fl_recover(&factory_lifecycle,TF_FL_PROVIDER_LOST);return display_runtime_fail();}
  tf_fl_tick(&factory_lifecycle,tick(),1);tf_fl_command c=tf_fl_next(&factory_lifecycle);int ok=0,observed=-1;
  if(factory_lifecycle.phase==TF_FL_READY){
   if(factory_lifecycle.brightness>0&&!tf_idle_confirm_on(&display_idle_guard,factory_lifecycle.brightness,tf_guard_observe(&factory_guard,"zteSleepBacklight")))return display_runtime_fail();
   if(display_frame_guard){if(tf_guard_observe(&factory_guard,"zteSleepBacklight")!=(factory_lifecycle.brightness>0)||!tf_guard_release(&factory_guard))return display_runtime_fail();display_frame_guard=0;}
   display_runtime_ready=1;return 1;
  }
  switch(c.action){
   case TF_FL_ACQUIRE_OWN_GUARD:ok=tf_guard_acquire(&factory_guard);observed=tf_guard_observe(&factory_guard,factory_guard.name);break;
   case TF_FL_SET_BRIGHTNESS:backlight_set(c.value);ok=display_read_number("/sys/class/leds/led:lcd/brightness",0,255,&observed);break;
   case TF_FL_EMIT_LCD:ok=tf_fb_command(&factory_bus,TF_BUS_LCD,(uint32_t)c.value,2500);observed=ok;break;
   case TF_FL_VERIFY_LCD_LOCK:observed=tf_guard_observe(&factory_guard,"zteSleepBacklight");ok=observed>=0;break;
   case TF_FL_RELEASE_OWN_GUARD:ok=tf_guard_release(&factory_guard);observed=tf_guard_observe(&factory_guard,factory_guard.name);break;
   default:return display_runtime_fail();
  }
  int progress=tf_fl_ack(&factory_lifecycle,c,ok,observed,tick());if(progress<0)return display_runtime_fail();if(!progress)poll(NULL,0,20);
 }return display_runtime_fail();
}
static int display_runtime_adopt(void){
 if(!display_frame_guard||tf_guard_observe(&factory_guard,factory_guard.name)!=1)return display_runtime_fail();
 int live;if(!display_read_number("/sys/class/leds/led:lcd/brightness",0,255,&live)||!tf_fb_command(&factory_bus,TF_BUS_LOGIN,(uint32_t)!display_policy.locked,2500)||tf_guard_observe(&factory_guard,factory_guard.name)!=1||!tf_fl_adopt(&factory_lifecycle,display_factory_process()==0,factory_bus.ready&&!factory_bus.failed,live,frame_ready,tick()))return display_runtime_fail();
 display_policy.on=live>0;display_policy.brightness=live;tf_display_smoothing_reset(&display_policy,tick());backlight_init();
 /* The user requested a new visible screen. Keep the rendered home or configured PIN frame,
  * start a new awake period, and confirm brightness + the original LCD lock
  * before the caller publishes its first heartbeat. This is not a claim to
  * reproduce the old UI's unknown remaining idle timer. */
 if(display_direct_wake){
  display_direct_wake=0;
  if(tf_display_wake(&display_policy,tick())!=TF_DISPLAY_LEVEL)return display_runtime_fail();
  /* Preserve the observed live level while selecting the newly requested
   * target. One guarded transaction emits ON once; never release our guard
   * in an intermediate dark-ready state. */
  tf_fl_start_transition(&factory_lifecycle,display_policy.brightness,tick(),1);
 }
 return display_runtime_drive();
}
static int display_runtime_request(int level){
 int previous=factory_lifecycle.brightness;
 if(display_frame_guard&&tf_guard_observe(&factory_guard,factory_guard.name)!=1)return display_runtime_fail();
 if(!display_runtime_ready||!tf_fl_request(&factory_lifecycle,level,frame_ready,tick())||!tf_idle_before_off(&display_idle_guard,previous,level))return display_runtime_fail();return display_runtime_drive();
}
static int display_runtime_resync(void){
 int previous=factory_lifecycle.brightness,live;
 if(!display_frame_guard||tf_guard_observe(&factory_guard,factory_guard.name)!=1)return display_runtime_fail();
 if(!display_read_number("/sys/class/leds/led:lcd/brightness",0,255,&live)||!tf_fl_resync(&factory_lifecycle,1,live,frame_ready,tick())||!tf_idle_before_off(&display_idle_guard,previous,live))return display_runtime_fail();
 factory_bus.resync=0;if(live>0&&!display_runtime_wake_sensor())return display_runtime_fail();display_policy.on=live>0;display_policy.brightness=live;tf_display_smoothing_reset(&display_policy,tick());backlight_init();return display_runtime_drive();
}
static int display_runtime_login(int unlocked){return factory_bus_active&&tf_fb_command(&factory_bus,TF_BUS_LOGIN,(uint32_t)(unlocked!=0),2500)?1:display_runtime_fail();}
static int display_runtime_touch(int pressed,uint32_t now){
 static int held=0;static uint32_t sent=0;
 if(!pressed||!display_runtime_ready||factory_lifecycle.phase!=TF_FL_READY||factory_lifecycle.brightness<=0){held=0;return 1;}
 /* Original touch activity is independent of authentication and LCD state.
  * Never synthesize release=0 or wake=2; held fingers refresh the idle timer. */
 tf_display_activity(&display_policy,now);
 if(held&&(uint32_t)(now-sent)<250)return 1;
 if(!factory_bus_active||!tf_fb_command(&factory_bus,TF_BUS_TOUCH,1,2500))return display_runtime_fail();
 held=1;sent=now;return 1;
}
static int display_runtime_unlock_policy(void){
 char response[32];char*const args[]={"uci","-q","get","zwrt_deviceui.Screen.Lock_Screen_PIN_Enable_State",NULL};int raw_pin,enabled;
 if(vendor_exec("/sbin/uci",args,NULL,response,sizeof response)||!tf_display_integer(response,0,1,&raw_pin)||!tf_display_factory_pin_enabled(raw_pin,&enabled)||enabled!=display_policy.config.pin_enabled)return display_runtime_fail();return 1;
}
static void display_runtime_cleanup(void){
 display_runtime_ready=0;display_startup_guard_pending=0;if(factory_bus_active){tf_fb_stop(&factory_bus);factory_bus_active=0;}
 /* Recovery owns the transition now. Never release vendor locks or force the
  * panel on during exit. Our separate ten-second transition and 180-second
  * idle leases expire if killed. Stable-factory recovery clears exact own names. */
}
/* Main-thread commit of the bounded read-only worker snapshot. The caller
 * defers this during touch, transitions and confirmations. No UCI read/write,
 * sensor preparation, login event, or activity timer reset is performed here.
 * Return -1 for a failed security/lifecycle guard, 2 for a deferred
 * observation, 0 if unchanged, and 1 when settings/sensor status changed. */
static int display_runtime_accept_observed(const tf_display_config*observed){
 if(!observed||!tf_display_policy_valid(observed))return 0;
 if(!display_policy.initialized||!display_runtime_ready||tf_http_cancelled||factory_bus.power_event||factory_bus.resync||factory_lifecycle.phase!=TF_FL_READY)return 2;
 if(!tf_display_external_policy_compatible(&display_policy.config,observed)){native_failure_note("DISPLAY_SECURITY_POLICY_CHANGED");display_runtime_fail();return -1;}
 int changed=!tf_display_same_policy(&display_policy.config,observed)||display_policy.config.sensor_enabled!=observed->sensor_enabled||display_policy.config.sensor_lux!=observed->sensor_lux;
 int result=tf_display_accept_external(&display_policy,observed,tick());
 if(result==TF_DISPLAY_INVALID){native_failure_note("DISPLAY_EXTERNAL_POLICY_INVALID");display_runtime_fail();return -1;}
 display_config=*observed;
 if(result==TF_DISPLAY_LEVEL&&!display_runtime_request(display_policy.brightness))return -1;
 return changed?1:0;
}
/* A factory sleep may disable the light sensor. Startup preparation alone is
 * insufficient: wake must restore the same observed sensor under our owned
 * frame guard, after a complete DRM frame and before choosing wake brightness.
 * This does not reinitialize DRM, change UCI, or start the factory renderer. */
static int display_runtime_wake_sensor(void){
 if(!frame_ready||!display_sensor_guard_alive()){native_failure_note("WAKE_SENSOR_GUARD");return 0;}
 tf_display_config observed;if(!display_read_policy_observed(&observed)){native_failure_note("WAKE_POLICY_READ");return 0;}
 if(!tf_display_external_policy_compatible(&display_policy.config,&observed)){native_failure_note("WAKE_POLICY_CHANGED");return 0;}
 if(!display_sensor_prepare(&observed,display_sensor_write_enabled,display_sensor_guard_alive)){native_failure_note("WAKE_SENSOR_PREPARE");return 0;}
 if(!display_sensor_guard_alive()){native_failure_note("WAKE_SENSOR_GUARD");return 0;}
 /* Wake already owns the complete-frame guard. Adopt fresh mutable policy
  * only after sensor readiness and a final guard check; do not alter PIN,
  * activity, locked state, or wake/sleep ownership here. */
 observed.live_brightness=display_policy.config.live_brightness;
 observed.max_brightness=display_policy.config.max_brightness;
 if(!observed.automatic)observed.sensor_enabled=observed.sensor_lux=-1;
 display_config=display_policy.config=observed;
 return 1;
}
/* Invoked only by the confirmed auto-brightness setter. This prepares a live
 * sample without changing the fixed-mode preference or brightness. The caller
 * rereads policy before its single UCI commit. */
static int display_auto_sensor_guard_alive(void){return display_sensor_guard_alive()&&!factory_bus.power_event&&!factory_bus.resync;}
static int display_runtime_prepare_auto_sensor(void){
 if(tf_http_cancelled||factory_bus.power_event||factory_bus.resync||!display_runtime_ready||!frame_ready||factory_lifecycle.phase!=TF_FL_READY||factory_lifecycle.brightness<=0){display_config_failure="DISPLAY_AUTO_NOT_READY";return 0;}
 int level=factory_lifecycle.brightness;if(!display_runtime_begin_frame())return 0;
 tf_display_config observed;int okay=display_auto_sensor_guard_alive()&&display_read_policy_observed(&observed)&&tf_display_same_policy(&display_policy.config,&observed);
 if(okay){observed.automatic=1;okay=display_sensor_prepare(&observed,display_sensor_write_enabled,display_auto_sensor_guard_alive);}
 /* Same-level request releases only this frame guard; it does not emit LCD
  * off/on or replace the original sleep provider. */
 int released=display_runtime_request(level);okay=okay&&!tf_http_cancelled&&!factory_bus.power_event&&!factory_bus.resync;if(!okay)display_config_failure="DISPLAY_AUTO_SENSOR_PREPARE";return okay&&released;
}
#endif
