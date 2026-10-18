'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const native=path.resolve(__dirname,'../native');
const read=name=>fs.readFileSync(path.join(native,name),'utf8');
test('in-screen session recovery masks and wipes credentials, preserves the draft and requires a new SMS confirmation',()=>{
 const ui=read('sms_session_pages.h').replace('#include "sms_session_restore.h"','');
 const forms=read('form_pages.h'),advanced=read('advanced_controls.h');
 const reset=forms.match(/^static void form_reset\(void\)\{[^\n]+/m)[0];
 const confirm=forms.slice(forms.indexOf('static int form_confirm(void){'),forms.lastIndexOf('#endif'));
 const shell=advanced.slice(advanced.indexOf('static void advanced_shell_frame('),advanced.indexOf('static void advanced_shell(const'));
 const code=String.raw`
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdarg.h>
#include "form_logic.h"
#include "pinyin_logic.h"
static int controls_enabled=1,advanced_page=6,scroll_y,tf_http_cancelled,theme_dark;
static char pending[4096],pending_label[4096],notice[1024],verification_message[192],verifying[4096],advanced_html[131072];
static unsigned notice_until;static size_t advanced_n;
static int form_kind=1,form_field,form_is_guest,form_return_page,form_wifi_external,keyboard_case,keyboard_symbols,keyboard_chinese;
static uint32_t form_wifi_sync_after;static tf_pinyin keyboard_pinyin;
static char form_values[6][513],form_original[6][513],form_payload[4096];
static void tf_ufi_wipe(void*p,size_t n){volatile unsigned char*q=p;while(n--)*q++=0;}
static unsigned tick(void){return 1;}
static void ah(const char*fmt,...){va_list args;va_start(args,fmt);int n=vsnprintf(advanced_html+advanced_n,sizeof advanced_html-advanced_n,fmt,args);va_end(args);assert(n>=0&&(size_t)n<sizeof advanced_html-advanced_n);advanced_n+=(size_t)n;}
static const char*lookup(const char*k){return !strcmp(k,"TIME")?"08:30":!strcmp(k,"BAT")?"81":"";}
static void esc(char*out,size_t cap,const char*s){size_t n=0;for(;*s;s++){const char*v=*s=='<'?"&lt;":*s=='>'?"&gt;":*s=='&'?"&amp;":NULL;if(v){size_t len=strlen(v);assert(n+len<cap);memcpy(out+n,v,len);n+=len;}else{assert(n+1<cap);out[n++]=*s;}}out[n]=0;}
static void show_notice(const char*s){snprintf(notice,sizeof notice,"%s",s);notice_until=1000;}
static int control_guard(void){return controls_enabled&&!verifying[0];}
static int busy_cancel,busy_close,restore_cancel,restores,sms_posts,restore_failure;
static void sms_session_cleanup(void);
static void show_busy(const char*s){assert(!strstr(s,"PRIVATE"));if(busy_cancel)tf_http_cancelled=1;if(busy_close)sms_session_cleanup();}
enum tf_sms_session_result {TF_SMS_SESSION_RESTORED,TF_SMS_SESSION_FAILED};
static enum tf_sms_session_result tf_sms_session_restore(const char*password,int confirmed){assert(confirmed==1&&!strcmp(password,"PRIVATE-Secret_42"));restores++;if(restore_cancel){sms_session_cleanup();tf_http_cancelled=1;return TF_SMS_SESSION_FAILED;}return restore_failure?TF_SMS_SESSION_FAILED:TF_SMS_SESSION_RESTORED;}
static const char*tf_sms_session_result_text(enum tf_sms_session_result result){return result==TF_SMS_SESSION_RESTORED?"设备登录已恢复，请重新确认发送":"登录未确认，请重新输入后确认；未自动重试";}
UI_IMPLEMENTATION
ACTUAL_RESET
static int cell_form_confirm(void){return 0;}static void apn_submit(void){assert(!"Unexpected APN");}
static int form_wifi_recheck(void){assert(!"Unexpected Wi-Fi");return 0;}
static int wifi_status_read_now(void){return 0;}static struct {int busy;}wifi_state;
static void*unused_wifi(void){return &wifi_state;}
#define wifi_observed() (&wifi_state)
static int tf_http_timeout(int port,const char*m,const char*u,const char*a,const char*b,char*out,size_t cap,int timeout){assert(!"Unexpected HTTP");return -1;}
static int guest_form_verify(const char*p){return 0;}static void wifi_status_invalidate(void){}
static enum tf_sms_result tf_sms_ufi_submit(const char*payload,int confirmed){assert(confirmed==1&&strstr(payload,"sms.send_raw"));sms_posts++;return TF_SMS_SENT;}
ACTUAL_CONFIRM
static void cleared(void){for(size_t i=0;i<sizeof sms_session_storage;i++)assert(((unsigned char*)&sms_session_storage)[i]==0);assert(!sms_session_memory_ready);}
static void type_password(void){assert(sms_session_action("sms-session-open")&&sms_session_ui.stage==1);assert(sms_session_action("sms-session-edit")&&sms_session_ui.stage==2);for(const char*p="PRIVATE-Secret_42";*p;p++){char action[40];snprintf(action,sizeof action,"sms-session-key:%u",(unsigned char)*p);assert(sms_session_action(action));}}
static void prepare(void){assert(sms_session_action("sms-session-done")&&sms_session_ui.stage==1);assert(sms_session_action("sms-session-prepare")&&!strcmp(pending,"@sms-session"));assert(!strstr(pending_label,"PRIVATE")&&!form_payload[0]);}
static void output(const char*dir,const char*name){char path[4096];snprintf(path,sizeof path,"%s/%s-%s.html",dir,name,theme_dark?"dark":"light");FILE*f=fopen(path,"wb");assert(f);fwrite(advanced_html,1,strlen(advanced_html),f);fclose(f);}
int main(int argc,char**argv){assert(argc==2);strcpy(form_values[0],"10086");strcpy(form_values[1],"草稿保留");
 controls_enabled=0;assert(sms_session_action("sms-session-open")&&!sms_session_ui.stage&&!restores);controls_enabled=1;
 strcpy(pending,"@form");strcpy(pending_label,"existing SMS confirmation");strcpy(form_payload,"existing SMS payload");assert(sms_session_action("sms-session-open")&&!sms_session_ui.stage&&!strcmp(pending,"@form")&&!strcmp(form_payload,"existing SMS payload")&&!strcmp(pending_label,"existing SMS confirmation"));pending[0]=pending_label[0]=form_payload[0]=0;
 strcpy(verifying,"existing verification");assert(sms_session_action("sms-session-open")&&!sms_session_ui.stage&&!strcmp(verifying,"existing verification"));verifying[0]=0;
 type_password();assert(sms_session_action("sms-session-open")&&sms_session_ui.stage==2&&!strcmp(sms_session_ui.password,"PRIVATE-Secret_42"));for(theme_dark=0;theme_dark<2;theme_dark++){sms_session_render();assert(!strstr(advanced_html,"PRIVATE-Secret_42")&&strstr(advanced_html,"● ● ●"));output(argv[1],"sms-session-keyboard");}
 assert(sms_session_action("form-apply")&&!pending[0]&&!sms_posts);sms_session_action("sms-session-delete");assert(!strcmp(sms_session_ui.password,"PRIVATE-Secret_4"));for(size_t i=strlen(sms_session_ui.password);i<sizeof sms_session_ui.password;i++)assert(!sms_session_ui.password[i]);sms_session_action("sms-session-key:50");
 sms_session_action("sms-session-done");for(theme_dark=0;theme_dark<2;theme_dark++){sms_session_render();assert(!strstr(advanced_html,"PRIVATE-Secret_42"));output(argv[1],"sms-session");}
 prepare();assert(form_confirm()&&restores==1&&!sms_posts&&!pending[0]&&!form_payload[0]);cleared();assert(!strcmp(form_values[1],"草稿保留")&&strstr(notice,"重新确认发送"));assert(!form_confirm()&&!sms_posts);
 /* A separate user confirmation is the only path back to a business POST. */
 assert(tf_sms_payload(form_payload,sizeof form_payload,form_values[0],form_values[1],"local"));strcpy(pending,"@form");assert(form_confirm()&&sms_posts==1&&!form_values[1][0]);
 strcpy(form_values[1],"草稿保留");type_password();prepare();assert(sms_session_action("cancel")&&!pending[0]);cleared();assert(restores==1&&sms_posts==1&&!strcmp(form_values[1],"草稿保留"));
 type_password();sms_session_action("sms-session-back");cleared();type_password();sms_session_action("advback");cleared();
 type_password();sms_session_action("sms-session-clear");assert(!sms_session_ui.password[0]);sms_session_action("sms-session-done");sms_session_action("sms-session-prepare");assert(!pending[0]&&restores==1);sms_session_cleanup();
 type_password();prepare();restore_failure=1;assert(form_confirm()&&restores==2&&!strcmp(form_values[1],"草稿保留"));cleared();restore_failure=0;
 for(int scenario=0;scenario<3;scenario++){type_password();prepare();busy_cancel=scenario==0;busy_close=scenario==1;if(scenario==2)controls_enabled=0;assert(form_confirm()&&restores==2&&!pending[0]);cleared();busy_cancel=busy_close=tf_http_cancelled=0;controls_enabled=1;}
 type_password();prepare();restore_cancel=1;assert(form_confirm()&&restores==3&&!pending[0]&&!form_payload[0]);cleared();restore_cancel=tf_http_cancelled=0;
 /* The real form reset is shared by page exit, lock, power discard and exit. */
 type_password();prepare();form_reset();cleared();assert(!pending[0]&&!form_payload[0]&&!form_values[1][0]);
 sms_session_observe(TF_SMS_SESSION_EXPIRED);assert(sms_session_needed);sms_session_observe(TF_SMS_SENT);assert(!sms_session_needed);assert(sms_posts==1);
 puts("PASS: real SMS session UI/confirmation, masked private input, erase on cancel/reset/interruption, draft preserved, separate SMS confirmation only");return 0;
}
`.replace('UI_IMPLEMENTATION',shell+'\n'+ui).replace('ACTUAL_RESET',reset).replace('ACTUAL_CONFIRM',confirm);
 const dir=path.join(native,'build-preview'),preview=path.join(native,'preview');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(preview,{recursive:true});const c=path.join(dir,'test-sms-session-ui.c'),exe=path.join(dir,'test-sms-session-ui.exe');fs.writeFileSync(c,code);
 const build=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-std=c11','-D_GNU_SOURCE','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),c,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const result=cp.spawnSync(exe,[preview],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
});
test('session UI is wired into all exits and never persists or renders its password',()=>{
 const ui=read('sms_session_pages.h'),main=read('topflow_main.c'),form=read('form_pages.h');
 assert.match(form,/static void form_reset\(void\)\{sms_session_cleanup\(\);/);
 assert.match(form,/static void form_render\(void\)\{\s*if\(sms_session_ui.stage\)/);
 assert.match(form,/static int form_confirm\(void\)\{\s*if\(sms_session_confirm\(\)\)/);
 assert.match(main,/screen_lock\(void\)\{form_reset\(\);/);
 assert.match(main,/"page:",5\)\)\{form_reset\(\);/);assert.match(main,/"sub:",4\)\)\{form_reset\(\);/);
 assert.match(main,/runtime_factory_discard\(void\)\{[\s\S]*?form_reset\(\);/);assert.match(main,/cleanup:form_reset\(\);/);
 assert.match(main,/sms_session_cleanup\(\);tf_ufi_wipe\(form_payload,sizeof form_payload\);motion_cancel\(\);tf_display_activity\(&display_policy,tick\(\)\);power_menu_open/);
 assert.match(main,/"cancel"\)\)\{if\(sms_session_action\(a\)\)return;/);
 assert.match(ui,/mlock\(&sms_session_storage/);assert.match(ui,/PR_SET_DUMPABLE/);assert.match(ui,/tf_ufi_wipe\(&sms_session_storage/);
 assert.doesNotMatch(ui,/\b(?:fopen|open|write|system|popen|execv|fprintf|printf)\s*\(/);
 assert.doesNotMatch(ui,/tf_sms_ufi_submit|form-apply|(?:esc|ah)\([^;]*,sms_session_ui\.password\)/);
});
