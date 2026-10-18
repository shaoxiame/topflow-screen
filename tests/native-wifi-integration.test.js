'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const native=path.resolve(__dirname,'../native');
function source(name){return fs.readFileSync(path.join(native,name),'utf8');}
// Compile actual production function bodies with only transport/display stubs.
function fn(text,name){
  const call=text.indexOf(name+'(');assert.ok(call>=0,name+' exists');
  const start=text.lastIndexOf('\n',call)+1,open=text.indexOf('{',call);
  assert.ok(open>=0&&open<text.indexOf(';',call),name+' has a body');
  let depth=0,quote='',line=false,block=false;
  for(let i=open;i<text.length;i++){
    const c=text[i],next=text[i+1];
    if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&next==='/'){block=false;i++;}continue;}
    if(quote){if(c==='\\')i++;else if(c===quote)quote='';continue;}
    if(c==='/'&&next==='/'){line=true;i++;continue;}if(c==='/'&&next==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&!--depth)return text.slice(start,i+1);
  }throw Error('Unclosed '+name);
}
function run(sourceText){const dir=path.join(native,'build-preview');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'test-wifi-integration.c'),exe=path.join(dir,'test-wifi-integration.exe');fs.writeFileSync(file,sourceText);const build=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-std=c11','-D_GNU_SOURCE','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),file,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});assert.equal(build.status,0,build.stdout+build.stderr);const result=cp.spawnSync(exe,[],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);}
test('native Wi-Fi UI, one-submit confirmation and editable config synchronize against external UFI changes',()=>{
  const advanced=source('advanced_controls.h'),form=source('form_pages.h'),main=source('topflow_main.c'),extra=source('factory_extra_pages.h'),service=source('service_pages.h');
  const begin=main.indexOf(' if(!strcmp(a,"wifi24")||!strcmp(a,"wifi5")){');
  const end=main.indexOf('\n show_notice("请在 UFI 配置此功能");',begin);assert.ok(begin>=0&&end>begin);
  const confirm=fn(advanced,'advanced_confirm');const next=confirm.indexOf(' if(modem_source_confirm())');assert.ok(next>0);
  const generated=String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdarg.h>
#include "wifi_state.h"
#include "factory_extra_protocol.h"
static uint32_t now=1000;static uint32_t tick(void){return now;}
static tf_wifi_state observed;
static const tf_wifi_state*wifi_observed(void){return &observed;}
static int reads,writes,invalidates,read_fail,cancel_on_read,deny_on_read,busy_on_submit,controls_enabled=1,tf_http_cancelled=0;
static char actual_ssid[128]="Old WiFi",actual_enc[64]="sae-mixed";
static int actual_radio=1,actual_module=1,actual_busy=0,response_verified=1,wps_writes,wps_after_load,wps_after_busy;
static char pending[4096],pending_label[1600],verifying[4096],notice[1024],verification_message[192],last_payload[4096];
static int advanced_page=6,scroll_y,form_kind=2,form_is_guest,form_return_page,form_wifi_external;
static uint32_t form_wifi_sync_after;static char form_band[4]="2g",form_section[24]="2g",form_values[6][513],form_original[6][513],form_payload[4096];
static char snapshot[1024],html[20000];static size_t html_n;static unsigned long long seq;
static int snapshot_valid=1;
static const char*tf_wifi_enc[]={"none","psk2+ccmp","sae-mixed","sae","psk-mixed+tkip+ccmp","psk2","psk-mixed"};
static int tf_wifi_enc_index(const char*s){for(int i=0;i<7;i++)if(!strcmp(s,tf_wifi_enc[i]))return i;return-1;}
static void set_snapshot(const char*ssid,const char*enc){snprintf(snapshot,sizeof snapshot,"{\"wlan\":{\"bands\":[{\"band\":\"2g\",\"enabled\":1,\"ssid\":\"%s\",\"enc\":\"%s\"}]}}",ssid,enc);}
static int fresh_state(tf_json*d){return snapshot_valid&&tf_parse(d,snapshot);}
static void sample(void){char raw[2048];snprintf(raw,sizeof raw,"{\"ok\":true,\"action\":\"wifi.state\",\"result\":{\"busy\":%s,\"module\":{\"enabled\":%s,\"user_enabled\":%s},\"radios\":[{\"band\":\"2g\",\"enabled\":%s,\"radio_enabled\":%s}],\"aps\":[{\"section\":\"main_2g\",\"band\":\"2g\",\"enabled\":true,\"active\":%s,\"state\":\"%s\"}]}}",actual_busy?"true":"false",actual_module?"true":"false",actual_module?"true":"false",actual_radio?"true":"false",actual_radio?"true":"false",actual_radio&&actual_module&&!actual_busy?"true":"false",actual_radio&&actual_module&&!actual_busy?"up":"absent");assert(tf_wifi_state_parse(raw,now,++seq,&observed));}
static int wifi_status_read_now(void){reads++;if(cancel_on_read)tf_http_cancelled=1;if(deny_on_read)controls_enabled=0;if(read_fail)return 0;sample();return 1;}
static void wifi_status_invalidate(void){invalidates++;tf_wifi_state_reset(&observed);}
static void show_notice(const char*s){snprintf(notice,sizeof notice,"%s",s);}
static void show_busy(const char*s){if(busy_on_submit&&!strcmp(s,"正在更新 Wi-Fi 配置"))tf_http_cancelled=1;if(!strcmp(s,"正在请求原厂 WPS 配对")){if(wps_after_busy==1)tf_http_cancelled=1;if(wps_after_busy==2)controls_enabled=0;}}
static int control_guard(void){return controls_enabled&&!verifying[0];}
static void verify_begin(const char*p){snprintf(verifying,sizeof verifying,"%s",p);wifi_status_invalidate();}
static void ah(const char*fmt,...){va_list a;va_start(a,fmt);int n=vsnprintf(html+html_n,sizeof html-html_n,fmt,a);va_end(a);assert(n>=0&&(size_t)n<sizeof html-html_n);html_n+=(size_t)n;}
static void advanced_shell(const char*s){(void)s;html_n=0;html[0]=0;}
static void esc(char*out,size_t n,const char*s){snprintf(out,n,"%s",s);}
static int tf_http_timeout(int port,const char*method,const char*path,const char*secret,const char*body,char*out,size_t cap,int timeout){assert(port==9460&&!strcmp(method,"POST")&&!strcmp(path,"/control")&&!secret&&timeout<=10000);char a[64];assert(json_get(body,"action",a,sizeof a));if(!strcmp(a,"wifi.status")){reads++;if(read_fail)return-1;snprintf(out,cap,"{\"ok\":true,\"action\":\"wifi.status\",\"result\":{\"main_2g\":{\"ssid\":\"%s\",\"encryption\":\"%s\"}}}",actual_ssid,actual_enc);return 200;}assert(!strcmp(a,"wifi.radio.set")||!strcmp(a,"wifi.configure"));writes++;snprintf(last_payload,sizeof last_payload,"%s",body);snprintf(out,cap,"{\"ok\":true,\"action\":\"%s\",\"result\":{\"verified\":%s}}",a,response_verified?"true":"false");return 200;}
static int cell_form_confirm(void){return 0;}static void apn_submit(void){assert(!"Unexpected APN write");}
enum tf_sms_result{TF_SMS_SENT};static enum tf_sms_result tf_sms_ufi_submit(const char*a,int b){(void)a;(void)b;assert(!"Unexpected SMS write");return TF_SMS_SENT;}static const char*tf_sms_result_message(enum tf_sms_result r){(void)r;return "unused";}
/* Wi-Fi confirmations must pass through the unrelated SMS-session gate,
 * which cannot consume the action or receive a send result in these cases. */
static int sms_session_confirm(void){assert(form_kind==2&&strcmp(pending,"@sms-session"));return 0;}
static void sms_session_observe(enum tf_sms_result result){(void)result;assert(!"Unexpected SMS session result on Wi-Fi path");}
static char guest_json[2048];static int guest_reads;
static int guest_load(void){guest_reads++;if(read_fail)return 0;snprintf(guest_json,sizeof guest_json,"{\"guests\":[{\"section\":\"guest_2g\",\"ssid\":\"%s\",\"encryption\":\"%s\"}]}",actual_ssid,actual_enc);return 1;}
`+fn(service,'guest_find')+'\n'+fn(service,'guest_form_verify')+'\n'+extra.slice(extra.indexOf('typedef struct {int kind,parent'),extra.indexOf('static int fx_locked;'))+'\n'+fn(extra,'fx_clear_codes')+'\n'+fn(extra,'fx_wps_parse')+'\n'+fn(extra,'fx_sim_parse')+String.raw`
static int fx_current_main(int locked){(void)locked;assert(!"Unexpected SIM preflight");return 0;}
static int fx_net_slot(void){assert(!"Unexpected operator preflight");return 0;}
static int fx_load(void){assert(fx.kind==2);fx.valid=1;fx.wps_present[0]=fx.wps_present[1]=1;strcpy(fx.wps_state[0],"idle");strcpy(fx.wps_state[1],"idle");fx.wps_remaining[0]=fx.wps_remaining[1]=0;if(wps_after_load==1)tf_http_cancelled=1;if(wps_after_load==2)controls_enabled=0;return 1;}
static int extra_call(const char*request,char*out,size_t cap){assert(!strcmp(request,"WPS_START\nmain_2g\n")||!strcmp(request,"WPS_CANCEL\n"));wps_writes++;snprintf(out,cap,"{\"ok\":true,\"submitted\":true,\"accepted\":true,\"bands\":[{\"section\":\"main_2g\",\"state\":\"running\",\"remaining\":60}]}");return 1;}
#define TF_EXTRA_CALL extra_call
`+fn(advanced,'wifi_overview_render')+'\n'+fn(extra,'fx_wifi_enabled')+'\n'+fn(extra,'factory_extra_confirm')+'\n'+fn(form,'form_wifi_observe')+'\n'+fn(form,'form_wifi_recheck')+'\n'+fn(form,'form_confirm')+'\n'+confirm.slice(0,next)+' return 0;\n}\nstatic void wifi_action(const char*a){\n'+main.slice(begin,end)+'\n}\n'+String.raw`
static void reset_form(void){memset(form_values,0,sizeof form_values);memset(form_original,0,sizeof form_original);strcpy(form_values[0],"Old WiFi");strcpy(form_values[2],"sae-mixed");memcpy(form_original,form_values,sizeof form_values);strcpy(actual_ssid,"Old WiFi");strcpy(actual_enc,"sae-mixed");set_snapshot("Old WiFi","sae-mixed");form_kind=2;form_is_guest=form_wifi_external=0;form_wifi_sync_after=0;advanced_page=6;pending[0]=verifying[0]=0;actual_radio=actual_module=controls_enabled=1;actual_busy=read_fail=cancel_on_read=deny_on_read=busy_on_submit=tf_http_cancelled=0;response_verified=1;sample();}
static void propose_config(void){strcpy(pending,"@form");strcpy(form_payload,"{\"action\":\"wifi.configure\",\"params\":{\"section\":\"main_2g\",\"ssid\":\"Local draft\"}}");strcpy(form_values[0],"Local draft");}
int main(void){reset_form();wifi_overview_render();assert(strstr(html,"已开启"));assert(fx_wifi_enabled(0));
 actual_radio=0;sample();wifi_overview_render();assert(strstr(html,"已关闭")&&!strstr(html,"已开启"));assert(!fx_wifi_enabled(0));
 wifi_action("wifi24");assert(strstr(pending,"\"enabled\":true"));int before=writes;assert(advanced_confirm()&&writes==before+1&&!pending[0]&&strstr(last_payload,"wifi.radio.set"));assert(!advanced_confirm()&&writes==before+1);
 reset_form();wifi_action("wifi24");assert(strstr(pending,"\"enabled\":false"));actual_radio=0;before=writes;assert(advanced_confirm()&&writes==before&&!pending[0]);
 reset_form();wifi_action("wifi24");actual_busy=1;before=writes;assert(advanced_confirm()&&writes==before);sample();assert(!fx_wifi_enabled(0));
 reset_form();wifi_action("wifi24");actual_module=0;before=writes;assert(advanced_confirm()&&writes==before);sample();assert(!fx_wifi_enabled(0));
 for(int scenario=0;scenario<3;scenario++){reset_form();wifi_action("wifi24");read_fail=scenario==0;cancel_on_read=scenario==1;deny_on_read=scenario==2;before=writes;assert(advanced_confirm()&&writes==before&&!pending[0]);}
 reset_form();now+=6001;wifi_action("wifi24");assert(!pending[0]&&!fx_wifi_enabled(0));
 reset_form();set_snapshot("External WiFi","psk2");form_wifi_observe();assert(!strcmp(form_values[0],"External WiFi")&&!strcmp(form_original[2],"psk2")&&!form_wifi_external);
 reset_form();strcpy(form_values[0],"Local draft");set_snapshot("External WiFi","psk2");form_wifi_observe();assert(!strcmp(form_values[0],"Local draft")&&!strcmp(form_original[0],"Old WiFi")&&form_wifi_external);
 reset_form();advanced_page=7;set_snapshot("External WiFi","psk2");form_wifi_observe();assert(!strcmp(form_values[0],"Old WiFi"));
 reset_form();form_wifi_sync_after=now+5000;set_snapshot("Previous WiFi","psk2");form_wifi_observe();assert(!strcmp(form_values[0],"Old WiFi"));
 reset_form();propose_config();strcpy(actual_ssid,"UFI changed");before=writes;assert(form_confirm()&&writes==before&&!form_payload[0]&&!strcmp(form_values[0],"Local draft")&&form_wifi_external);
 reset_form();propose_config();read_fail=1;before=writes;assert(form_confirm()&&writes==before&&!strcmp(form_values[0],"Local draft"));
 reset_form();propose_config();actual_busy=1;before=writes;assert(form_confirm()&&writes==before);
 for(int scenario=0;scenario<2;scenario++){reset_form();propose_config();cancel_on_read=scenario==0;deny_on_read=scenario==1;before=writes;assert(form_confirm()&&writes==before&&!pending[0]);}
 reset_form();propose_config();busy_on_submit=1;before=writes;assert(form_confirm()&&writes==before);
 reset_form();propose_config();before=writes;assert(form_confirm()&&writes==before+1&&!pending[0]&&!form_payload[0]&&!verifying[0]&&strstr(notice,"配置已保存")&&!strcmp(form_original[0],"Local draft"));assert(!form_confirm()&&writes==before+1);
 reset_form();propose_config();response_verified=0;before=writes;assert(form_confirm()&&writes==before+1&&strstr(notice,"未确认")&&!strcmp(form_original[0],"Old WiFi"));
 reset_form();form_is_guest=1;strcpy(form_section,"guest_2g");strcpy(form_values[0],"Local guest draft");before=guest_reads;assert(form_wifi_recheck()&&guest_reads==before+1);strcpy(actual_ssid,"External guest");assert(!form_wifi_recheck()&&form_wifi_external&&!strcmp(form_values[0],"Local guest draft"));
 reset_form();form_is_guest=1;strcpy(form_section,"guest_2g");propose_config();strcpy(actual_enc,"psk2");before=writes;assert(form_confirm()&&writes==before&&!pending[0]&&!strcmp(form_values[0],"Local draft"));
 reset_form();form_is_guest=1;strcpy(form_section,"guest_2g");read_fail=1;assert(!form_wifi_recheck());strcpy(form_section,"main_2g");before=guest_reads;assert(!form_wifi_recheck()&&guest_reads==before);
 for(int scenario=0;scenario<8;scenario++){
  reset_form();fx.kind=2;fx.valid=1;wps_after_load=wps_after_busy=0;strcpy(pending,"@fx-wps:0");
  if(scenario==0)actual_radio=0;else if(scenario==1)cancel_on_read=1;else if(scenario==2)deny_on_read=1;
  else if(scenario==3)wps_after_load=1;else if(scenario==4)wps_after_load=2;
  else if(scenario==5)wps_after_busy=1;else if(scenario==6)wps_after_busy=2;else read_fail=1;
  before=wps_writes;assert(factory_extra_confirm()&&wps_writes==before&&!pending[0]);assert(!factory_extra_confirm()&&wps_writes==before);
 }
 reset_form();wps_after_load=wps_after_busy=0;fx.kind=2;strcpy(pending,"@fx-wps:0");before=wps_writes;assert(factory_extra_confirm()&&wps_writes==before+1);assert(!factory_extra_confirm()&&wps_writes==before+1);
 reset_form();actual_radio=0;sample();fx.kind=2;strcpy(pending,"@fx-wps-cancel");before=wps_writes;assert(factory_extra_confirm()&&wps_writes==before+1);
 puts("production WiFi integration regressions passed");return 0;}
`;
  run(generated);
});
