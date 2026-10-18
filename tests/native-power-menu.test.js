'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const native=path.resolve(__dirname,'../native');
const main=fs.readFileSync(path.join(native,'topflow_main.c'),'utf8');
function range(start,end){const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0&&b>a);return main.slice(a,b);}
test('physical power menu preserves locks, isolates pending actions and submits confirmed capabilities once',()=>{
const src=String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdarg.h>
#include "control_logic.h"
#include "soft_lock.h"
#include "upstream/include/key_input.h"
static tf_soft_lock soft_lock;
static struct{int locked;}pin_policy;
static struct{int phase;}factory_lifecycle;
#define TF_FL_READY 6
static int display_runtime_ready=1,authorized=1,running=1;
static int tf_fl_input_allowed(void*p,int unlocked){return display_runtime_ready&&authorized&&unlocked;}
static char pending[4096],pending_label[1600],notice[256],verification_message[192],verifying[4096],last_payload[128],advanced_html[32768];
static size_t advanced_n;
static int advanced_page=8,controls_enabled=1,scroll_y,settings_child_parent,theme_dark,writes,reads,capability=3,wrong_response,timeout_reply,guard_block;
static int tf_http_cancelled,busy_calls,cancel_busy_at,lock_busy_at,verify_busy_at,cancel_capability,lock_capability,verify_capability;
static const char*lookup(const char*k){return !strcmp(k,"TIME")?"14:36":!strcmp(k,"BAT")?"78":"—";}
static void ah(const char*fmt,...){va_list a;va_start(a,fmt);int n=vsnprintf(advanced_html+advanced_n,sizeof advanced_html-advanced_n,fmt,a);va_end(a);assert(n>=0&&(size_t)n<sizeof advanced_html-advanced_n);advanced_n+=(size_t)n;}
static void esc(char*out,size_t cap,const char*s){snprintf(out,cap,"%s",s);}
static void advanced_shell(const char*s){(void)s;}static void modem_row(const char*k,const char*v){(void)k;(void)v;}static int fresh_state(tf_json*d){(void)d;return 0;}
static void show_busy(const char*s){(void)s;busy_calls++;if(busy_calls==cancel_busy_at)tf_http_cancelled=1;if(busy_calls==lock_busy_at)controls_enabled=0;if(busy_calls==verify_busy_at)strcpy(verifying,"existing-operation");}static void show_notice(const char*s){snprintf(notice,sizeof notice,"%s",s);}static int control_guard(void){if(!controls_enabled||guard_block||verifying[0]){show_notice("等待上一操作回读");return 0;}return 1;}
static int vendor_exec(const char*p,char*const a[],const char*i,char*out,size_t cap){out[0]=0;return 1;}
static int tf_http_timeout(int port,const char*method,const char*endpoint,const char*auth,const char*body,char*out,size_t cap,int ms){assert(port==9460&&ms==5000&&!auth);if(!strcmp(method,"GET")){assert(!strcmp(endpoint,"/capabilities")&&!body);reads++;if(cancel_capability)tf_http_cancelled=1;if(lock_capability)controls_enabled=0;if(verify_capability)strcpy(verifying,"existing-operation");snprintf(out,cap,"{\"controls\":[%s%s%s]}",capability&1?"\"device.reboot\"":"",capability==3?",":"",capability&2?"\"device.poweroff\"":"");return 200;}assert(!strcmp(method,"POST")&&!strcmp(endpoint,"/control"));assert(!tf_http_cancelled&&controls_enabled&&!verifying[0]);writes++;snprintf(last_payload,sizeof last_payload,"%s",body);char action[64];assert(json_get(body,"action",action,sizeof action));snprintf(out,cap,"{\"ok\":true,\"action\":\"%s\"}",wrong_response?"wrong":action);return timeout_reply?-1:200;}
#include "power_pages.h"
#include "power_menu.h"
typedef struct{int unused;}drm_disp_t;
static int on=1,wakes,sleeps,motions,activities;static int display_policy;
static uint32_t tick(void){return 1000;}
static int backlight_is_on(void){return on;}
static void motion_cancel(void){motions++;}
static void tf_display_activity(void*p,uint32_t now){activities++;}
static int runtime_wake(drm_disp_t*d){wakes++;on=1;tf_soft_lock_reset(&soft_lock,pin_policy.locked);controls_enabled=0;return 1;}
static int runtime_sleep(void){sleeps++;on=0;power_menu_reset();return 1;}
KEY_HANDLER
static void reset(void){power_menu_reset();memset(&soft_lock,0,sizeof soft_lock);pin_policy.locked=0;on=running=display_runtime_ready=authorized=controls_enabled=1;factory_lifecycle.phase=TF_FL_READY;capability=3;wrong_response=timeout_reply=guard_block=reads=writes=wakes=sleeps=motions=activities=0;tf_http_cancelled=busy_calls=cancel_busy_at=lock_busy_at=verify_busy_at=cancel_capability=lock_capability=verify_capability=0;verifying[0]=0;scroll_y=173;strcpy(pending,"old SMS confirmation");strcpy(pending_label,"old label");notice[0]=0;}
static void release_touch(void){assert(power_menu_filter_touch(0)&&!power_menu.await_release);assert(!power_menu_filter_touch(0));}
static void output(const char*dir,const char*name){power_menu_render();char file[4096];snprintf(file,sizeof file,"%s/%s%s.html",dir,name,theme_dark?"-dark":"");FILE*f=fopen(file,"wb");assert(f);fwrite(advanced_html,1,strlen(advanced_html),f);fclose(f);}
int main(int argc,char**argv){assert(argc==2);drm_disp_t d={0};
 reset();assert(runtime_key_event(&d,KEY_EV_LONG)&&power_menu.active&&!wakes&&!sleeps&&controls_enabled&&!pin_policy.locked&&!soft_lock.locked);assert(reads==1&&!writes&&!pending[0]&&!pending_label[0]&&scroll_y==0);assert(power_menu_action("confirm")&&!writes);power_menu_action("power-menu-reboot");assert(!power_menu.choice);assert(power_menu_filter_touch(1));release_touch();assert(runtime_key_event(&d,KEY_EV_LONG)&&reads==1&&!writes);
 for(int t=0;t<2;t++){theme_dark=t;output(argv[1],"power-menu");assert(strstr(advanced_html,"电源菜单")&&strstr(advanced_html,"act:power-menu-off")&&strstr(advanced_html,"act:power-menu-reboot"));}
 assert(power_menu_action("power-menu-reboot")&&power_menu.choice==1&&!writes);for(int t=0;t<2;t++){theme_dark=t;output(argv[1],"power-confirm");}power_menu_action("power-menu-back");assert(!power_menu.choice&&!writes);power_menu_action("power-menu-off");assert(power_menu.choice==2&&!writes);power_menu_action("power-menu-confirm");assert(writes==1&&reads==2&&power_menu.submitted&&power_menu.result==1&&!strcmp(last_payload,"{\"action\":\"device.poweroff\",\"params\":{}}"));assert(strstr(power_menu.message,"无法在此确认完成"));power_menu_action("power-menu-confirm");power_menu_action("power-menu-reboot");assert(writes==1);power_menu_action("power-menu-close");assert(!power_menu.active&&scroll_y==173&&!pending[0]);assert(!power_menu_action("power-menu-confirm"));
 reset();power_menu_open();release_touch();power_menu_action("power-menu-reboot");power_menu_action("power-menu-confirm");assert(writes==1&&!strcmp(last_payload,"{\"action\":\"device.reboot\",\"params\":{}}"));
 reset();power_menu_open();release_touch();power_menu_action("power-menu-off");capability=0;power_menu_action("power-menu-confirm");assert(!writes&&power_menu.result==-1);power_menu_action("power-menu-confirm");assert(reads==2&&!writes);
 reset();power_menu_open();release_touch();power_menu_action("power-menu-reboot");wrong_response=1;power_menu_action("power-menu-confirm");assert(writes==1&&power_menu.result==0);power_menu_action("power-menu-confirm");assert(writes==1);
 reset();power_menu_open();release_touch();power_menu_action("power-menu-reboot");timeout_reply=1;power_menu_action("power-menu-confirm");assert(writes==1&&power_menu.result==0&&strstr(power_menu.message,"未自动重试"));
 for(int kind=0;kind<4;kind++){reset();if(kind==0)pin_policy.locked=1;if(kind==1)soft_lock.locked=1;if(kind==2)soft_lock.block_release=1;if(kind==3)authorized=0;power_menu_open();release_touch();power_menu_render();assert(!strstr(advanced_html,"href='act:power-menu-off'")&&!strstr(advanced_html,"href='act:power-menu-reboot'")&&strstr(advanced_html,"先返回解锁"));power_menu_action("power-menu-off");power_menu.choice=2;power_menu_action("power-menu-confirm");assert(!reads&&!writes);power_menu_action("power-menu-close");assert(scroll_y==173);}
 reset();power_menu_open();release_touch();power_menu_action("power-menu-reboot");guard_block=1;power_menu_action("power-menu-confirm");assert(!writes&&power_menu.result==-2);
 /* Revocation during a capability GET or either busy render must stop before
  * POST, even if the GET returns supported controls and HTTP success. Keep an
  * existing verification marker intact; a power action may not cancel it. */
 for(int stage=0;stage<3;stage++)for(int reason=0;reason<3;reason++){
  reset();power_menu_open();release_touch();power_menu_action("power-menu-reboot");
  if(stage==0){cancel_capability=reason==0;lock_capability=reason==1;verify_capability=reason==2;}
  else{int at=busy_calls+(stage==1?2:1);if(reason==0)cancel_busy_at=at;if(reason==1)lock_busy_at=at;if(reason==2)verify_busy_at=at;}
  power_menu_action("power-menu-confirm");assert(!writes&&power_menu.result==-2&&power_menu.submitted);
  assert(reads==(stage==2?1:2));
  if(reason==0)assert(tf_http_cancelled&&strstr(power_menu.message,"已取消")&&strstr(power_menu.message,"未提交"));
  if(reason==1)assert(!controls_enabled);
  if(reason==2)assert(!strcmp(verifying,"existing-operation"));
  int old_reads=reads;power_menu_action("power-menu-confirm");assert(!writes&&reads==old_reads);
 }
 reset();tf_http_cancelled=1;assert(power_device_submit(1)==-2&&!reads&&!writes);
 reset();strcpy(verifying,"previous-operation");power_menu_open();release_touch();power_menu_action("power-menu-off");power_menu_action("power-menu-confirm");assert(!writes&&reads==1&&!strcmp(verifying,"previous-operation")&&power_menu.result==-2);
 reset();power_menu_open();release_touch();power_menu_action("power-menu-off");pin_policy.locked=1;power_menu_action("power-menu-confirm");assert(!writes);power_menu_reset();assert(!power_menu.active&&!power_menu.choice&&!power_menu.submitted);
 reset();on=0;assert(runtime_key_event(&d,KEY_EV_LONG)&&wakes==1&&power_menu.active&&soft_lock.locked&&!controls_enabled&&!writes&&!reads);theme_dark=1;output(argv[1],"power-locked");release_touch();power_menu_action("power-menu-off");assert(!writes);assert(runtime_key_event(&d,KEY_EV_SHORT)&&sleeps==1&&!power_menu.active);assert(runtime_key_event(&d,KEY_EV_SHORT)&&wakes==2&&on&&!power_menu.active);assert(runtime_key_event(&d,KEY_EV_NONE)&&wakes==2);
 puts("power menu contracts passed: current API, explicit confirmation, no retry, locks preserved, no long-key relock");return 0;
}
`.replace('KEY_HANDLER',range('static int runtime_key_event(', 'int main('));
const dir=path.join(native,'build-preview');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.join(native,'preview'),{recursive:true});const file=path.join(dir,'test-power-menu.c'),exe=path.join(dir,'test-power-menu.exe');fs.writeFileSync(file,src);
const build=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-std=c11','-D_GNU_SOURCE','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),file,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);const run=cp.spawnSync(exe,[path.join(native,'preview')],{encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);
});
test('power overlay remains modal across the actual main-loop lock, animation and gesture routes',()=>{
// The lock now cancels read-only workers first; the overlay must still reset
// within this function before controls are revoked.
assert.match(main,/screen_lock\(void\)\{[^}]*?power_menu_reset\(\);[^}]*?controls_enabled=0/);
assert.match(main,/if\(power_menu_action\(a\)\)return;\s*if\(pin_policy.locked\)/);
assert.match(main,/render\(drm_disp_t\*d\)\{busy_visible=0;if\(power_menu.active\)/);
assert.match(main,/screen_soft_input[^]*?if\(power_menu.active\)\{if\(soft_lock.locked\)tf_soft_lock_cancel/);
assert.match(main,/if\(power_menu_filter_touch\(pressed\)\)\{touch_input_clear_taps/);
assert.match(main,/can_interact=backlight_is_on\(\)&&!power_menu.active/);
assert.match(main,/content&&!power_menu.active&&!pin_policy.locked&&page_h>480,pending\[0\]!=0\|\|power_menu.active/);
assert.doesNotMatch(fs.readFileSync(path.join(native,'power_menu.h'),'utf8'),/\b(?:system|execv|fopen|pthread_create)\s*\(/);
});
