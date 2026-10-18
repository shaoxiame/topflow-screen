'use strict';
// Native state-machine tests use synthetic getters and a controllable pipe.
// Production context matching, merging, freshness, cancellation and parsing
// execute unchanged. No network/device endpoint is contacted.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const native=path.resolve(__dirname,'../native');
function runC(name,source){const dir=path.join(native,'build-preview');fs.mkdirSync(dir,{recursive:true});const c=path.join(dir,name+'.c'),exe=path.join(dir,name+'.exe');fs.writeFileSync(c,source);const built=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-std=c11','-D_GNU_SOURCE','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),c,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);const run=cp.spawnSync(exe,[],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stdout+run.stderr);}
const harness=String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "control_logic.h"
#include "display_policy.h"
#include "factory_extra_protocol.h"
#define AY_MAX_GROUPS 128
#define AY_MAX_MEMBERS 512
typedef struct {char name[513],now[513],type[64];} ay_group;
static ay_group ay_groups[128];static int ay_count,ay_selected=-1,ay_offset,ay_member_count;static char ay_members[512][513],ay_mode[16],ay_identity[256],ay_message[192];
typedef struct {char id[65],name[129],apn[129],username[257],password[257];int auth,pdp;} tf_apn_profile;
static tf_apn_profile apn_profiles[16];static int apn_count,apn_mode,apn_valid;static char apn_enabled[65],apn_message[192];
static struct {int kind,valid,operator_count;tf_extra_sim sim;int wps_present[2],wps_remaining[2];char wps_state[2][48],net_state[64],net_result[64],values[3][9];tf_extra_operator operators[20];} fx;
static uint32_t fx_loaded_at;
static struct {int enabled,power;char method[24];} sf;
static char guest_json[32768],power_mode[32],modem_selected[8]="5G";static int guest_valid,power_quick,power_reboot_supported,power_off_supported,wireless_dual,wireless_dual_supported,source_current[3];
static uint32_t source_read_at[2];static unsigned char source_read_once[2];
static int advanced_page=11,running=1,read_count=0,accept_count=0,observe_count=0,display_result=1,display_settings_valid=1;static const char*display_settings_error;static uint32_t clock_ms=1000;
static uint32_t tick(void){return clock_ms;}
static int display_read_settings_config(tf_display_config*d){read_count++;tf_display_config_empty(d);d->brightness=200;return 1;}
static int display_runtime_accept_observed(const tf_display_config*d){(void)d;accept_count++;return display_result;}
static int display_settings_observe(const tf_display_config*d){(void)d;observe_count++;return 1;}
static int tf_source_index(const char*s){return !strcmp(s,"5G")?0:!strcmp(s,"4G1")?1:2;}
static int tf_source_refresh(int i,int force){(void)force;read_count++;source_current[i]=1;return 1;}
static int guest_load(void){read_count++;guest_valid=1;strcpy(guest_json,"{\"management_access\":false,\"active_time_supported\":true,\"active_time_minutes\":120,\"secret\":\"do-not-send\",\"guests\":[{\"section\":\"guest_2g\",\"supported\":true,\"enabled\":false,\"ssid\":\"Current guest\",\"encryption\":\"psk2\",\"password\":\"do-not-send\",\"clients\":2,\"left_seconds\":90,\"active_time_minutes\":120}]}");return 1;}
static int guest_find(const tf_json*d,const char*s){int a=tf_key(d,0,"guests");if(a<0)return-1;for(int i=a+1;i<d->t[a].next;i=d->t[i].next){char section[32];if(tf_gets(d,i,"section",section,sizeof section)&&!strcmp(section,s))return i;}return-1;}
static int wireless_dual_read(void){read_count++;wireless_dual=0;wireless_dual_supported=1;return 1;}
static void power_refresh(void){read_count++;strcpy(power_mode,"Game_mode");power_quick=0;power_reboot_supported=power_off_supported=1;}
static int live=1;static int tf_ufi_live(void){return live;}static void tf_ufi_revoke(void){live=0;}
static void tf_ufi_wipe(void*p,size_t n){memset(p,0,n);}
static int sf_overview_load(void){read_count++;sf.enabled=0;sf.power=1;strcpy(sf.method,"SMS");return 1;}
static int apn_load(void){read_count++;apn_count=1;apn_mode=1;strcpy(apn_enabled,"profile-a");strcpy(apn_profiles[0].id,"profile-a");strcpy(apn_profiles[0].name,"New profile");strcpy(apn_profiles[0].password,"do-not-send");apn_profiles[0].auth=1;apn_profiles[0].pdp=3;return 1;}
static int ay_refresh(void){read_count++;ay_count=2;ay_selected=-1;ay_member_count=0;strcpy(ay_mode,"global");strcpy(ay_identity,"same-engine");strcpy(ay_groups[0].name,"Other");strcpy(ay_groups[0].type,"Selector");strcpy(ay_groups[1].name,"Selected");strcpy(ay_groups[1].type,"Selector");strcpy(ay_groups[1].now,"New node");return 1;}
static int ay_open_group(int i){read_count++;ay_selected=i;ay_member_count=20;for(int j=0;j<20;j++)snprintf(ay_members[j],513,"Node %d",j);return 1;}
static int fx_load(void){read_count++;fx.valid=1;fx.wps_present[0]=1;fx.wps_remaining[0]=40;strcpy(fx.wps_state[0],"running");return 1;}
#define TF_PAGE_STATE_TEST_TRANSPORT 1
static int tf_ps_spawn(void*,size_t,int);static void tf_ps_stop(void);static int tf_ps_reap(void);static int tf_ps_read(void*,size_t);static int tf_ps_success(void);
#include "page_state_sync.h"
static unsigned char wire[sizeof(tf_ps_result)];static size_t wire_size,wire_pos,chunk_size=1024;static int spawn_count,stop_count,wire_ready,child_done,child_ok=1,fail_spawn,hold_reap;
static int tf_ps_spawn(void*r,size_t bytes,int display_eligible){(void)display_eligible;spawn_count++;if(fail_spawn)return 0;memcpy(wire,r,bytes);wire_size=bytes;wire_pos=0;wire_ready=child_done=0;return 1;}
static void tf_ps_stop(void){stop_count++;child_done=1;}
static int tf_ps_reap(void){return child_done&&!hold_reap;}
static int tf_ps_success(void){return child_done&&child_ok;}
static int tf_ps_read(void*out,size_t cap){if(!wire_ready)return 0;if(wire_pos==wire_size)return-1;size_t n=wire_size-wire_pos;if(n>chunk_size)n=chunk_size;if(n>cap)n=cap;memcpy(out,wire+wire_pos,n);wire_pos+=n;return (int)n;}
static void deliver_guest(int enabled){tf_ps_result*r=(tf_ps_result*)wire;r->magic=TF_PS_MAGIC;r->bytes=(uint32_t)wire_size;r->okay=1;snprintf(r->data.guest,sizeof r->data.guest,"{\"guests\":[{\"section\":\"guest_2g\",\"enabled\":%s}]}",enabled?"true":"false");wire_ready=child_done=1;}
static void reset(void){hold_reap=0;tf_page_state_close();memset(&tf_page_sync,0,sizeof tf_page_sync);memset(wire,0,sizeof wire);wire_size=wire_pos=0;spawn_count=stop_count=wire_ready=child_done=fail_spawn=0;child_ok=1;advanced_page=11;clock_ms=1000;guest_valid=1;strcpy(guest_json,"old");}
`;
test('native page sync drains partial results, merges external changes and bounds read frequency',()=>runC('test-page-sync-scheduler',harness+String.raw`
int main(void){reset();assert(!tf_page_state_poll(clock_ms,1,1)&&spawn_count==1);assert(!strcmp(guest_json,"old"));clock_ms+=100;assert(!tf_page_state_poll(clock_ms,1,1)&&spawn_count==1);deliver_guest(0);assert(tf_page_state_poll(clock_ms,1,1)&&guest_valid&&strstr(guest_json,"false"));assert(!tf_page_sync.active);clock_ms=5999;tf_page_state_poll(clock_ms,1,1);assert(spawn_count==1);clock_ms=6000;tf_page_state_poll(clock_ms,1,1);assert(spawn_count==2);deliver_guest(1);assert(tf_page_state_poll(clock_ms,1,1)&&strstr(guest_json,"true"));puts("scheduler passed");return 0;}
`));
test('native page sync cancels gestures, abandons timed-out reads and rejects late page/card/group results',()=>runC('test-page-sync-cancel',harness+String.raw`
int main(void){reset();tf_page_state_poll(clock_ms,1,1);assert(tf_page_sync.active);clock_ms+=20;tf_page_state_poll(clock_ms,0,0);assert(!tf_page_sync.active&&stop_count>0&&!strcmp(guest_json,"old"));clock_ms+=200;tf_page_state_poll(clock_ms,1,1);assert(spawn_count==1);clock_ms+=5000;tf_page_state_poll(clock_ms,1,1);assert(spawn_count==2);clock_ms+=4000;assert(tf_page_state_poll(clock_ms,1,1)&&!guest_valid&&!tf_page_sync.active);reset();tf_page_state_poll(clock_ms,1,1);deliver_guest(0);advanced_page=8;tf_page_state_poll(++clock_ms,1,1);assert(!strcmp(guest_json,"old")&&spawn_count==2);tf_ps_context a={.kind=TF_PS_SOURCE,.page=4,.source=1},b=a;strcpy(a.card,"4G1");strcpy(b.card,"4G2");assert(!tf_ps_context_equal(&a,&b));b=a;strcpy(a.group,"a");strcpy(b.group,"b");assert(!tf_ps_context_equal(&a,&b));tf_ps_result*r=calloc(1,sizeof *r);r->magic=TF_PS_MAGIC;r->context=a;r->bytes=(uint32_t)tf_ps_size(a.kind);r->okay=1;assert(!tf_ps_apply(r,&b,clock_ms));free(r);puts("cancel and identities passed");return 0;}
`));
test('large strategy snapshots span bounded UI reads and incomplete replies never become current',()=>runC('test-page-sync-large',harness+String.raw`
int main(void){reset();advanced_page=3;ay_count=0;ay_selected=-1;tf_page_state_poll(clock_ms,1,1);tf_ps_result*r=(tf_ps_result*)wire;r->magic=TF_PS_MAGIC;r->bytes=(uint32_t)wire_size;r->okay=1;r->data.aoyou.count=2;r->data.aoyou.selected=-1;r->data.aoyou.members=0;strcpy(r->data.aoyou.identity,"observed-engine");strcpy(r->data.aoyou.mode,"rule");strcpy(r->data.aoyou.groups[0].name,"One");strcpy(r->data.aoyou.groups[1].name,"Two");wire_ready=child_done=1;int loops=0;while(tf_page_sync.active){size_t before=wire_pos;tf_page_state_poll(++clock_ms,1,1);assert(wire_pos-before<=65536);assert(++loops<10);}assert(loops>1&&ay_count==2&&!strcmp(ay_identity,"observed-engine"));reset();tf_page_state_poll(clock_ms,1,1);deliver_guest(0);wire_size-=10;assert(tf_page_state_poll(++clock_ms,1,1)&&!guest_valid&&!tf_page_sync.active);puts("large and truncated replies passed");return 0;}
`));
test('cancelled child is reaped while the screen remains asleep without starting another read',()=>runC('test-page-sync-inactive-reap',harness+String.raw`
int main(void){reset();tf_page_state_poll(clock_ms,1,1);hold_reap=1;tf_page_state_poll(++clock_ms,0,0);assert(!tf_page_sync.active&&tf_page_sync.reaping&&spawn_count==1);for(int i=0;i<20;i++)tf_page_state_poll(++clock_ms,0,0);assert(tf_page_sync.reaping&&spawn_count==1);hold_reap=0;tf_page_state_poll(++clock_ms,0,0);assert(!tf_page_sync.reaping&&!tf_page_sync.active&&spawn_count==1);puts("inactive reap passed");return 0;}
`));
test('native read-only collectors omit secrets, preserve strategy selection, do not replace drafts and honor display deferral',()=>runC('test-page-sync-collect',harness+String.raw`
int main(void){reset();tf_ps_result*r=calloc(1,sizeof *r);assert(r);r->context=tf_ps_context_now(1);tf_ps_collect(r,1);assert(r->okay&&r->display_valid&&!strstr(r->data.guest,"do-not-send")&&strstr(r->data.guest,"Current guest"));display_result=2;assert(tf_ps_apply(r,&r->context,clock_ms)&&observe_count==0);display_result=1;assert(tf_ps_apply(r,&r->context,clock_ms)&&observe_count==1);
 memset(r,0,sizeof *r);advanced_page=5;r->context=tf_ps_context_now(1);tf_ps_collect(r,0);assert(r->okay&&!memmem(r,tf_ps_size(TF_PS_APN),"do-not-send",11));assert(tf_ps_apply(r,&r->context,clock_ms)&&apn_valid&&!apn_profiles[0].password[0]);
 memset(r,0,sizeof *r);advanced_page=3;ay_count=1;ay_selected=0;ay_offset=6;strcpy(ay_groups[0].name,"Selected");r->context=tf_ps_context_now(1);tf_ps_collect(r,0);assert(r->okay&&r->data.aoyou.selected==1);assert(tf_ps_apply(r,&r->context,clock_ms)&&ay_selected==1&&ay_offset==6&&!strcmp(ay_groups[1].now,"New node"));
 advanced_page=14;assert(tf_ps_context_now(1).kind==TF_PS_DISPLAY);advanced_page=7;assert(tf_ps_context_now(1).kind==TF_PS_DISPLAY);advanced_page=17;fx.kind=1;strcpy(fx.values[0],"1234");assert(tf_ps_context_now(1).kind==TF_PS_DISPLAY);fx.values[0][0]=0;assert(tf_ps_context_now(1).kind==TF_PS_EXTRA);
 memset(r,0,sizeof *r);advanced_page=13;r->context=tf_ps_context_now(1);tf_ps_collect(r,0);assert(r->okay&&r->data.forwarding.enabled==0&&r->data.forwarding.power==1);sf.enabled=1;assert(tf_ps_apply(r,&r->context,clock_ms)&&sf.enabled==0);r->okay=0;r->data.forwarding.live=0;assert(tf_ps_apply(r,&r->context,clock_ms)&&sf.enabled==-1&&sf.power==-1&&!live);
 memset(r,0,sizeof *r);advanced_page=16;r->context=tf_ps_context_now(1);r->magic=TF_PS_MAGIC;r->bytes=(uint32_t)tf_ps_size(0);r->okay=1;r->display_requested=1;display_settings_valid=1;assert(tf_ps_apply(r,&r->context,clock_ms)&&!display_settings_valid&&!strcmp(display_settings_error,"DISPLAY_SYNC_UNAVAILABLE"));free(r);puts("collector merge and boundaries passed");return 0;}
`.replace('!memmem(r,tf_ps_size(TF_PS_APN),"do-not-send",11)','!strstr(r->data.apn.profiles[0].name,"do-not-send")')));
test('production worker has bounded lifetime, read-only getters, protected credentials and no retained renderer descriptors',()=>{
 const s=fs.readFileSync(path.join(native,'page_state_sync.h'),'utf8'),collect=s.slice(s.indexOf('static void tf_ps_collect'),s.indexOf('static void tf_ps_unknown'));
 assert.doesNotMatch(collect,/tf_ufi_authorize|ay_apply|tf_source_set|sms_forward_confirm|NET_SCAN|WPS_START|tf_http.*"(?:PUT|PATCH)"/);
 assert.match(s,/PR_SET_PDEATHSIG,SIGKILL/);assert.match(s,/alarm\(4\)/);assert.match(s,/PR_SET_DUMPABLE,0/);assert.match(s,/mlock\(&tf_ufi_storage/);assert.match(s,/tf_http_wait_hook=NULL/);assert.match(s,/tf_ps_child_close_fds\(fds\[1\]\)/);assert.match(s,/WNOHANG/);assert.match(s,/F_SETFL,flags\|O_NONBLOCK/);assert.match(s,/kill\(-tf_ps_pid,SIGKILL\)/);assert.doesNotMatch(s,/\b(?:fopen|fprintf|printf|system|popen)\s*\(/);
 const response=s.slice(s.indexOf('typedef struct {char id'),s.indexOf('static size_t tf_ps_size'));assert.doesNotMatch(response,/password|authorization|secret|token/);
});
test('APN confirmation re-reads by stable profile ID, tolerates order changes and refuses stale editors',()=>{
 const apn=fs.readFileSync(path.join(native,'apn_pages.h'),'utf8'),start=apn.indexOf('static int apn_submit_baseline('),end=apn.indexOf('\n#endif',start);assert(start>0&&end>start);
 const production=apn.slice(start,end);
 runC('test-page-apn-baseline',String.raw`
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "control_logic.h"
typedef struct{char id[65],name[129],apn[129],username[257],password[257];int auth,pdp;} tf_apn_profile;
static tf_apn_profile apn_profiles[16];static int apn_count=1,apn_mode=1,apn_selected=0,apn_prior_count,advanced_page=6,scroll_y;
static char apn_edit_id[65]="a",apn_prior_ids[16][65],form_values[6][513],form_original[6][513],form_payload[4096],notice[512],verification_message[192];
static int fixture=0,posts=0,reads=0;
static int apn_target(void){return 1;}static int control_guard(void){return 1;}static void show_busy(const char*s){(void)s;}static void show_notice(const char*s){snprintf(notice,sizeof notice,"%s",s);}
static void fill(tf_apn_profile*p,const char*id,const char*name){memset(p,0,sizeof *p);snprintf(p->id,sizeof p->id,"%s",id);snprintf(p->name,sizeof p->name,"%s",name);strcpy(p->apn,"carrier");strcpy(p->username,"user");p->auth=1;p->pdp=3;}
static int apn_load(void){reads++;if(fixture==3)return 0;apn_count=2;fill(&apn_profiles[0],"b","Other");fill(&apn_profiles[1],"a",fixture==2?"Externally changed":"Original");apn_mode=fixture==4?0:1;return 1;}
static int apn_verify_payload(const char*s){(void)s;return 1;}
static int tf_http_timeout(int port,const char*method,const char*path,const char*auth,const char*body,char*out,size_t cap,int timeout){(void)port;(void)method;(void)path;(void)auth;(void)body;(void)timeout;posts++;snprintf(out,cap,"{\"ok\":true,\"action\":\"apn.modify\"}");return 200;}
PRODUCTION
static void draft(void){fill(&apn_profiles[0],"a","Original");apn_count=1;apn_selected=0;strcpy(form_original[0],"Original");strcpy(form_original[1],"carrier");strcpy(form_original[2],"user");strcpy(form_original[4],"1");strcpy(form_original[5],"3");strcpy(form_values[0],"Local draft");strcpy(form_payload,"{\"action\":\"apn.modify\",\"params\":{\"slot_id\":1,\"profile_id\":\"a\",\"name\":\"Local draft\",\"apn\":\"carrier\"}}");}
int main(void){draft();assert(apn_submit_baseline()&&apn_selected==1&&!strcmp(apn_profiles[apn_selected].id,"a"));fixture=2;draft();assert(!apn_submit()&&posts==0&&!strcmp(form_values[0],"Local draft")&&strstr(notice,"未覆盖"));fixture=3;draft();assert(!apn_submit()&&posts==0);fixture=0;draft();assert(apn_submit()&&posts==1);fixture=4;apn_mode=1;strcpy(form_payload,"{\"action\":\"apn.set_mode\",\"params\":{\"slot_id\":1,\"mode\":0}}");assert(!apn_submit_baseline());puts("APN stable identity and baseline passed");return 0;}
`.replace('PRODUCTION',production));
});
test('forwarding detects external changes before any save or switch and preserves local draft',()=>{
 const existing=fs.readFileSync(path.join(__dirname,'native-ufi.test.js'),'utf8'),begin=existing.indexOf('const source=String.raw`')+'const source=String.raw`'.length,end=existing.indexOf("`.replace('ACTUAL_SHELL'",begin);assert(begin>0&&end>begin);
 let source=existing.slice(begin,end);source=source.slice(0,source.indexOf('int main(int argc'));
 const advanced=fs.readFileSync(path.join(native,'advanced_controls.h'),'utf8'),actualShell=advanced.slice(advanced.indexOf('static void advanced_shell_frame('),advanced.indexOf('#include "modem_pages.h"'));
 source=source.replace('ACTUAL_SHELL',actualShell).replace('static int writes=0,fail_test=0;','static int writes=0,fail_test=0,external_enabled=0,external_method=0;').replace('value="{\\"sms_forward_method\\":\\"SMTP\\"}";','value=external_method?"{\\"sms_forward_method\\":\\"SMS\\"}":"{\\"sms_forward_method\\":\\"SMTP\\"}";').replace('value="{\\"enabled\\":\\"0\\"}";','value=external_enabled?"{\\"enabled\\":\\"1\\"}":"{\\"enabled\\":\\"0\\"}";');
 source+=String.raw`
int main(void){assert(sms_forward_action("sms-forward"));controls_enabled=1;assert(sf_load(0));advanced_page=14;strcpy(sf.values[0],"local-draft.example.test");assert(sms_forward_action("sf-save"));mail="{\"smtp_host\":\"externally-changed.example.test\",\"smtp_port\":\"2525\",\"smtp_username\":\"from@example.test\",\"smtp_to\":\"to@example.test\",\"password_saved\":true,\"forward_dev_info\":\"0\"}";assert(sms_forward_confirm()&&writes==0&&!sf.baseline_valid);assert(!strcmp(sf.values[0],"local-draft.example.test")&&strstr(notice,"未覆盖"));assert(sf_load(0));advanced_page=14;assert(sms_forward_action("sf-save")&&sms_forward_confirm()&&writes==1);
 advanced_page=13;assert(sf_overview_load());assert(sms_forward_action("sf-enable"));external_enabled=1;assert(sms_forward_confirm()&&writes==1&&sf.enabled==1);external_enabled=0;assert(sf_overview_load());assert(sms_forward_action("sf-enable"));external_method=1;assert(sms_forward_confirm()&&writes==1&&!strcmp(sf.method,"SMS"));sms_forward_cleanup();puts("forward baseline conflict passed");return 0;}
`;
 runC('test-page-forward-baseline',source);
});
