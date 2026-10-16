$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$http=[IO.File]::ReadAllText("$root/local_http.h")
$decode=$http.Substring($http.IndexOf('static int tf_http_decode('),$http.IndexOf('static int tf_http_timeout(')-$http.IndexOf('static int tf_http_decode('))
$ay=[IO.File]::ReadAllText("$root/aoyou_native.h")
$defs=$ay.Substring($ay.IndexOf('#define AY_LIMIT'),$ay.IndexOf('static char*ay_read(')-$ay.IndexOf('#define AY_LIMIT'))
$parsers=$ay.Substring($ay.IndexOf('static int ay_parse_groups('),$ay.IndexOf('static int ay_refresh(')-$ay.IndexOf('static int ay_parse_groups('))
$source=@'
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <strings.h>
#include <assert.h>
#include <time.h>
static struct tm*localtime_r(const time_t*t,struct tm*out){struct tm*p=localtime(t);if(p)*out=*p;return p?out:NULL;}
#include "control_logic.h"
#include "modem_logic.h"
#include "sms_logic.h"
HTTP_DECODE
AY_DEFS
AY_PARSERS
#define MAX_HTML 262144
static char pending[4096],pending_label[1600],notice[256];
static char page[96]="index.html";
static int controls_enabled=0,advanced_page=0,scroll_y=0;
static int theme_dark=0;
static const char*lookup(const char*k){if(!strcmp(k,"TIME"))return "14:36";if(!strcmp(k,"DATASTATE"))return "本地演示";if(!strcmp(k,"BAT_CLASS"))return "unknown";if(!strcmp(k,"BAT_STATE"))return "充电状态未知";if(!strcmp(k,"BAT_FILL"))return "0";if(!strcmp(k,"BAT_MARK"))return "?";return "—";}
static uint32_t notice_until=0,clock_now=1000;
static const char*fixture=NULL;
static uint32_t tick(void){return clock_now;}
static const char*data_raw_json(void){return fixture;}
static uint32_t data_age=0;
static uint32_t data_snapshot_age_ms(void){return data_age;}
static void show_notice(const char*s){snprintf(notice,sizeof notice,"%s",s);notice_until=tick()+5000;}
static void heartbeat(void){}
static int tf_http_cancelled=0,sim_source_block_on_submit=0,guest_block_on_submit=0;
static void show_busy(const char*s){if(!strcmp(s,"正在更新访客设置")){if(guest_block_on_submit==1)tf_http_cancelled=1;else if(guest_block_on_submit==2)controls_enabled=0;}if(!strcmp(s,"正在切换 SIM 卡源")){if(sim_source_block_on_submit==1)tf_http_cancelled=1;else if(sim_source_block_on_submit==2)controls_enabled=0;}}
static void esc(char*out,size_t cap,const char*s){size_t n=0;for(;s&&*s&&n+7<cap;s++){const char*e=*s=='&'?"&amp;":*s=='<'?"&lt;":*s=='>'?"&gt;":*s=='\"'?"&quot;":*s=='\''?"&#39;":NULL;if(e){size_t l=strlen(e);memcpy(out+n,e,l);n+=l;}else out[n++]=*s;}out[n]=0;}
static int ay_refresh(void){return 1;}
static int ay_open_group(int i){ay_selected=i;ay_offset=0;return 1;}
static int ay_apply(const char*m,const char*g,const char*n){(void)m;(void)g;(void)n;assert(controls_enabled);return 1;}
static int wireless_fixture=0,wireless_writes=0,wireless_fixture_dual=0,wireless_fail_reply=0,wireless_deny_caps=0,wireless_stale=0;
static int sms_fixture=0,sms_writes=0,sms_status;static const char*sms_reply;static char sms_sent[4096];
static char wireless_sent[512];
static int cell_fixture=0,cell_reads=0,cell_writes=0,cell_caps=1,cell_ok=1;static char cell_sent[4096];
static int guest_mock=0,guest_reads=0,guest_writes=0,guest_cancel_read=0;static const char*guest_reply,*guest_reply_after;
static int tf_http_timeout(int p,const char*m,const char*path,const char*s,const char*b,char*out,size_t cap,int timeout){(void)s;(void)timeout;*out=0;if(guest_mock){assert(p==9460&&!strcmp(m,"POST")&&!strcmp(path,"/control")&&b);if(strstr(b,"wifi.guest.status")){guest_reads++;snprintf(out,cap,"{\"ok\":true,\"action\":\"wifi.guest.status\",\"result\":%s}",guest_reply);if(guest_cancel_read)tf_http_cancelled=1;return 200;}assert(strstr(b,"wifi.guest.set"));guest_writes++;guest_reply=guest_reply_after;snprintf(out,cap,"{\"ok\":true,\"action\":\"wifi.guest.set\",\"result\":{\"verified\":true}}");return 200;}if(cell_fixture){assert(p==9460&&!s);if(!strcmp(m,"GET")){assert(!strcmp(path,"/capabilities"));cell_reads++;snprintf(out,cap,"{\"controls\":[%s]}",cell_caps?"\"cell.lock_lte\",\"cell.lock_nr\"":"");return 200;}assert(!strcmp(m,"POST")&&!strcmp(path,"/control")&&b&&strstr(b,"cell.lock_"));cell_writes++;snprintf(cell_sent,sizeof cell_sent,"%s",b);snprintf(out,cap,"{\"ok\":true,\"action\":\"%s\"}",!cell_ok?"wrong":strstr(b,"cell.lock_nr")?"cell.lock_nr":"cell.lock_lte");return 200;}if(sms_fixture){assert(p==2333&&!s);if(!strcmp(m,"GET")){const char*reply=!strcmp(path,"/api/need_token")?"{\"need_token\":false}":!strcmp(path,"/api/session")?"{\"authenticated\":true}":strstr(path,"cmd=RD")?"{\"RD\":\"test-rd\"}":strstr(path,"cr_version")?"{\"cr_version\":\"test-version\",\"wa_inner_version\":\"test-inner\"}":NULL;assert(reply);snprintf(out,cap,"%s",reply);return 200;}assert(!strcmp(m,"POST")&&!strcmp(path,"/api/goform/goform_set_cmd_process")&&timeout==55000);assert(b&&strstr(b,"goformId=SEND_SMS&")&&strstr(b,"sms_sender=5G&")&&strstr(b,"&AD="));sms_writes++;snprintf(sms_sent,sizeof sms_sent,"%s",b);snprintf(out,cap,"%s",sms_reply);return sms_status;}if(!wireless_fixture)return -1;assert(p==9460);if(!strcmp(m,"GET")&&!strcmp(path,"/capabilities")){snprintf(out,cap,"{\"controls\":[%s]}",wireless_deny_caps?"":"\"wifi.set_dual_band\",\"network.set_mode\"");return 200;}assert(!strcmp(m,"POST")&&!strcmp(path,"/control")&&b);if(strstr(b,"wifi.dual_band_status")){snprintf(out,cap,"{\"ok\":true,\"action\":\"wifi.dual_band_status\",\"result\":{\"supported\":true,\"enabled\":%s}}",wireless_fixture_dual?"true":"false");return 200;}wireless_writes++;snprintf(wireless_sent,sizeof wireless_sent,"%s",b);if(strstr(b,"wifi.set_dual_band")){if(!wireless_stale)wireless_fixture_dual=strstr(b,"true")!=NULL;snprintf(out,cap,"{\"ok\":true,\"action\":\"%s\",\"result\":{\"verified\":true}}",wireless_fail_reply?"wrong":"wifi.set_dual_band");return 200;}if(strstr(b,"network.set_mode")){snprintf(out,cap,"{\"ok\":true,\"action\":\"%s\"}",wireless_fail_reply?"wrong":"network.set_mode");return 200;}assert(!"Unexpected mocked action");return -1;}
static int tf_http(int p,const char*m,const char*path,const char*s,const char*b,char*out,size_t cap){return tf_http_timeout(p,m,path,s,b,out,cap,2500);}
static int tf_http_headers_timeout(int p,const char*m,const char*path,const char*const h[4],const char*b,char*out,size_t cap,int timeout){(void)h;return tf_http_timeout(p,m,path,NULL,b,out,cap,timeout);}
static int sim_source_fixture=0,sim_source_slots[3]={0,0,0},sim_source_writes=0,sim_source_apply=1,sim_source_fail=0,sim_source_reads=0,vendor_enable_writes=0;static char sim_source_sent[160],sim_source_method[40];
static int vendor_exec(const char*path,char*const argv[],const char*input,char*out,size_t cap){
 *out=0;if(!sim_source_fixture)return -1;assert(!strcmp(path,"/bin/ubus")&&!strcmp(argv[4],"zwrt_zte_mdm.api")&&!input);
 if(!strcmp(argv[5],"get_sim_info")){sim_source_reads++;if(sim_source_slots[0]<0)snprintf(out,cap,"{\"st_slot\":\"\"}");else snprintf(out,cap,"{\"st_slot\":\"%d\"}",sim_source_slots[0]);return 0;}
 if(!strcmp(argv[5],"get_v3t_sim_info")){sim_source_reads++;char a[8]="",b[8]="";if(sim_source_slots[1]>=0)snprintf(a,sizeof a,"%d",sim_source_slots[1]);if(sim_source_slots[2]>=0)snprintf(b,sizeof b,"%d",sim_source_slots[2]);snprintf(out,cap,"{\"v3t_2_st_slot\":\"%s\",\"v3t_1_st_slot\":\"%s\"}",a,b);return 0;}
 int i=-1,n=-1;if(!strcmp(argv[5],"sim_switch_slot")){i=0;n=json_get_int(argv[6],"slot",-1);}else if(!strcmp(argv[5],"sub_modem_switch_slot")){int num=json_get_int(argv[6],"sub_modem_num",-1);assert(num==0||num==1);i=num==1?1:2;n=json_get_int(argv[6],"sub_modem_slot",-1);}assert(i>=0&&n>=0&&n<=1);sim_source_writes++;snprintf(sim_source_sent,sizeof sim_source_sent,"%s",argv[6]);snprintf(sim_source_method,sizeof sim_source_method,"%s",argv[5]);if(sim_source_apply)sim_source_slots[i]=n;return sim_source_fail?-1:0;
}
static int vendor_apn_read(int slot,const char*method,char*out,size_t cap){(void)slot;(void)method;(void)cap;*out=0;return 0;}
static void vendor_refresh(int force){(void)force;}
static int vendor_set_enabled(const char*id,int enabled){if(!sim_source_fixture)return 0;assert(!strcmp(id,"4G1")||!strcmp(id,"4G2"));assert(enabled==0||enabled==1);vendor_enable_writes++;tf_external_enabled[!strcmp(id,"4G1")?0:1]=enabled;return 1;}
#include "display_policy.h"
static tf_display_config display_config={1,1,135,30,0,1,3,13,255};
static const char*display_config_failure="ADOPT_POLICY_READ";
static int display_read_settings_config(tf_display_config*c){*c=display_config;return 1;}
static int display_write_setting(int kind,int value){(void)kind;(void)value;return 0;}
static int extra_calls=0;
static int extra_fixture(const char*in,char*out,size_t cap){extra_calls++;if(!strcmp(in,"SIM_READ\n")){snprintf(out,cap,"{\"ok\":true,\"sim_state\":\"sim ready\",\"modem_state\":\"modem_init_complete\",\"slot\":2,\"pin_remaining\":3,\"puk_remaining\":10}");return 1;}if(!strcmp(in,"WPS_READ\n")){snprintf(out,cap,"{\"ok\":true,\"bands\":[{\"section\":\"main_2g\",\"state\":\"idle\",\"remaining\":0},{\"section\":\"main_5g\",\"state\":\"idle\",\"remaining\":0}]}");return 1;}assert(!"Unexpected device write in integrated read-only fixture");return 0;}
#define TF_EXTRA_CALL extra_fixture
#include "advanced_controls.h"
static char*load(const char*path){FILE*f=fopen(path,"rb");assert(f);fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);char*s=calloc(1,(size_t)n+1);assert(s&&fread(s,1,(size_t)n,f)==(size_t)n);fclose(f);return s;}
static void output(const char*dir,const char*name){char path[4096];int old=theme_dark;uint32_t old_notice=notice_until;notice_until=0;for(int i=0;i<2;i++){theme_dark=i;snprintf(path,sizeof path,"%s/%s%s.html",dir,name,i?"-dark":"");char*h=advanced_render();assert(h);FILE*f=fopen(path,"wb");assert(f);fwrite(h,1,strlen(h),f);fclose(f);free(h);}theme_dark=old;notice_until=old_notice;}
int main(int argc,char**argv){
 assert(argc==5);char*real=load(argv[1]);char*logtail=strstr(real,"\nSTDERR:");if(logtail)*logtail=0;fixture=real;tf_json d;
 assert(tf_parse(&d,real));int net=tf_key(&d,0,"net");assert(net>0);
 unsigned char supported[TF_BANDS],selected[TF_BANDS];assert(tf_band_snapshot(&d,1,supported,selected)>0&&supported[78]&&selected[78]);char payload[4096];assert(tf_band_payload(payload,sizeof payload,1,supported,selected));assert(tf_verify_datad(payload,real));
 memset(selected,0,sizeof selected);assert(!tf_band_payload(payload,sizeof payload,1,supported,selected));selected[512]=1;assert(!tf_band_payload(payload,sizeof payload,1,supported,selected));selected[512]=0;selected[78]=1;assert(tf_band_payload(payload,sizeof payload,1,supported,selected));assert(!tf_verify_datad(payload,real));
 assert(tf_cell_payload(payload,sizeof payload,&d,1)&&strstr(payload,"627264")&&strstr(payload,"194"));assert(!tf_cell_payload(payload,sizeof payload,&d,0));tf_free(&d);
 const char*zero="{\"net\":{\"type\":\"NSA\",\"wan_status\":\"ipv4_connected\",\"nr_pci\":0,\"nr_channel\":627264,\"nr_band\":\"n78\",\"lte_pci\":0,\"lte_channel\":100,\"lock_nr_cell\":\"0,627264,78\",\"lock_lte_cell\":\"0,100\"}}";
 assert(tf_parse(&d,zero));assert(tf_cell_payload(payload,sizeof payload,&d,1)&&strstr(payload,"\"pci\":0"));assert(tf_verify_datad(payload,zero));assert(tf_cell_payload(payload,sizeof payload,&d,0)&&tf_verify_datad(payload,zero));tf_free(&d);
 assert(tf_verify_datad("{\"action\":\"cell.unlock_all\",\"params\":{}}",real));assert(!tf_verify_datad("{\"action\":\"cell.unlock_all\",\"params\":{}}",zero));
 assert(!tf_parse(&d,"{\"x\":true,}"));assert(!tf_parse(&d,"[1,]"));assert(!tf_parse(&d,"{\"x\":01}"));assert(!tf_parse(&d,"{\"x\":\"\\x\"}"));assert(!tf_parse(&d,"{} extra"));
 assert(tf_control_success("{\"ok\":true,\"action\":\"cell.unlock_all\"}","{\"action\":\"cell.unlock_all\"}"));assert(!tf_control_success("{\"ok\":1,\"action\":\"cell.unlock_all\"}","{\"action\":\"cell.unlock_all\"}"));assert(!tf_control_success("{\"ok\":true,\"ok\":false,\"action\":\"cell.unlock_all\"}","{\"action\":\"cell.unlock_all\"}"));assert(!tf_control_success("{\"ok\":true,\"action\":\"wrong\"}","{\"action\":\"cell.unlock_all\"}"));
 assert(tf_parse(&d,"{\"x\":\"\\uD83C\\uDDE8\\uD83C\\uDDF3\\/测试\",\"n\":0}"));char unicode[64];assert(tf_gets(&d,0,"x",unicode,sizeof unicode)&&strstr(unicode,"测试"));long long v;assert(tf_int(&d,tf_key(&d,0,"n"),&v)&&v==0);tf_free(&d);
 assert(tf_parse(&d,"{\"x\":\"a\\u0000b\"}"));assert(!tf_gets(&d,0,"x",unicode,sizeof unicode));tf_free(&d);
 char out[4096],raw1[]="HTTP/1.0 200 OK\r\nContent-Length: 2\r\n\r\n{}";assert(tf_http_decode(raw1,strlen(raw1),out,sizeof out)==200&&!strcmp(out,"{}"));char chunk[]="HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n";assert(tf_http_decode(chunk,strlen(chunk),out,sizeof out)==200&&!strcmp(out,"{}"));assert(tf_http_decode(raw1,strlen(raw1)-1,out,sizeof out)==-1);char invalid[]="HTTP/1.0 200 OK\r\nContent-Length: 0\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n";assert(tf_http_decode(invalid,strlen(invalid),out,sizeof out)==-1);
 assert(tf_quote(out,sizeof out,"节点\"\\测试")&&strstr(out,"\\\""));assert(tf_uri(out,sizeof out,"组/测试")&&strstr(out,"%2F"));assert(!tf_uri(out,sizeof out,".."));assert(!tf_quote(out,sizeof out,"bad\r\nheader"));
 assert(ay_config_path("/data/plugins/aoyou-world/generations/0123456789abcdef01234567/runtime.json"));assert(!ay_config_path("/data/plugins/aoyou-world/generations/../../runtime.json"));
 assert(ay_config_path("/data/plugins/aoyou-world/generations/0123456789abcdef01234567/runtime.self.json"));assert(!ay_config_path("/data/plugins/aoyou-world/generations/0123456789abcdef01234567/runtime.bad.json"));
 char*real_ay=load(argv[3]);assert(ay_parse_groups(real_ay)&&ay_count>0);int actual_groups=ay_count;free(real_ay);printf("Actual sanitized AoYou snapshot: %d groups parsed\n",actual_groups);
 const char*groups="{\"proxies\":{\"测试/策略\":{\"type\":\"Selector\",\"now\":\"节点 A\",\"all\":[\"节点 A\",\"节点 B\"]},\"自动\":{\"type\":\"URLTest\",\"now\":\"节点 A\",\"all\":[\"节点 A\"]}}}";
 assert(ay_parse_groups(groups)&&ay_count==2);ay_selected=0;const char*members="{\"type\":\"Selector\",\"now\":\"节点 A\",\"all\":[\"节点 A\",\"节点 B\"]}";assert(ay_parse_members(members,"节点 B",1)&&ay_member_count==2);assert(!ay_parse_members(members,"不存在",0));assert(!ay_parse_members("{\"type\":\"URLTest\",\"all\":[\"节点 B\"]}","节点 B",0));
 assert(!control_guard());assert(advanced_action("cell:1")&&!*pending);assert(advanced_action("controls")&&!*pending&&!controls_enabled);strcpy(pending,"@enable");assert(advanced_confirm()&&!controls_enabled&&!*pending);controls_enabled=1;assert(control_guard());
 assert(advanced_action("network")&&advanced_page==1);output(argv[2],"advanced-network");assert(advanced_action("cell:1")&&strstr(pending,"cell.lock_nr"));assert(!advanced_confirm());pending[0]=0;assert(advanced_action("cell:1"));fixture=zero;assert(advanced_confirm()&&!*pending);fixture=real;
 assert(advanced_action("bands:1")&&advanced_page==2);output(argv[2],"advanced-bands");assert(advanced_action("band-auto"));assert(advanced_action("band-apply")&&strstr(pending,"band.set_nr_sa"));assert(!advanced_confirm());pending[0]=0;
 assert(advanced_action("controls")&&controls_enabled&&!*pending);controls_enabled=0;assert(advanced_action("band-apply")&&!*pending);assert(advanced_action("advback")&&advanced_page==1);assert(advanced_action("advback")&&!advanced_page&&!strcmp(page,"network.html"));
 snprintf(ay_identity,sizeof ay_identity,"test-only");snprintf(ay_mode,sizeof ay_mode,"rule");snprintf(ay_message,sizeof ay_message,"本机解析测试 · 演示组名");advanced_page=3;ay_selected=-1;output(argv[2],"advanced-aoyou");ay_selected=0;output(argv[2],"advanced-nodes");assert(advanced_action("advback")&&advanced_page==3&&ay_selected==-1);assert(advanced_action("advback")&&!advanced_page&&!strcmp(page,"apps.html"));
 verify_begin("{\"action\":\"aggregation.set\",\"params\":{\"enabled\":true}}");clock_now+=16000;verify_update();assert(!*verifying&&strstr(verification_message,"未确认"));
 tf_modem m;assert(tf_parse(&d,real));assert(tf_modem_snapshot(&d,"5G",&m)&&m.connected==1&&m.presence==1&&m.rates_ok);assert(tf_modem_snapshot(&d,"4G1",&m)&&m.presence==-1&&m.availability==0&&m.slot==-1&&tf_modem_rate(&d,&m,"rx_speed")<0);tf_free(&d);
 const char*states[]={"sim undetected","modem_sim_undetected","wait pin","modem_waitpuk","sim lock","sim error","sim ready"};
 for(int i=0;i<7;i++){char snapshot[2048];snprintf(snapshot,sizeof snapshot,"{\"modems\":[{\"id\":\"5G\",\"sim\":{\"state\":\"%s\",\"slot\":1},\"wwan\":{\"status\":\"disconnected\"},\"traffic\":{\"rx_speed\":0,\"tx_speed\":0}}]}",states[i]);assert(tf_parse(&d,snapshot));assert(tf_modem_snapshot(&d,"5G",&m));if(i<2)assert(m.presence==0&&!strcmp(m.status,"未插卡"));if(i>=2&&i<=4)assert(m.presence==1&&m.locked);assert((tf_modem_rate(&d,&m,"rx_speed")>=0)==(i==6));tf_free(&d);}
 const char*conflict="{\"modems\":[{\"id\":\"5G\",\"sim\":{\"state\":\"sim undetected\"},\"wwan\":{\"status\":\"ipv4_connected\"},\"traffic\":{\"rx_speed\":1}}]}";assert(tf_parse(&d,conflict));assert(tf_modem_snapshot(&d,"5G",&m)&&m.conflict&&m.connected==-1&&!tf_modem_control(payload,sizeof payload,&d,"5G","disconnect"));tf_free(&d);
 assert(tf_word("ipv4_ipv6_connected","connected")&&!tf_word("disconnected","connected")&&!tf_word("unconnectedgarbage","connected"));
 assert(tf_verify_datad("{\"action\":\"cellular.connect\",\"params\":{}}",real));assert(!tf_verify_datad("{\"action\":\"cellular.disconnect\",\"params\":{}}",real));assert(tf_verify_datad("{\"action\":\"sim.set_slot\",\"params\":{\"slot\":2}}","{\"sim\":{\"current_slot\":2}}"));assert(tf_verify_datad("{\"action\":\"cellular.set\",\"params\":{\"roaming\":0}}","{\"interfaces\":{\"cellular\":{\"roam_enable\":0}}}"));
 fixture=real;assert(advanced_action("modem:5G")&&advanced_page==4);output(argv[2],"advanced-modem-main");assert(advanced_action("modem:4G1"));output(argv[2],"advanced-modem-external");assert(advanced_action("modem-op:connect")&&!*pending);assert(advanced_action("advback")&&!advanced_page);
 char edited[16]="中文A";tf_utf8_backspace(edited);assert(!strcmp(edited,"中文"));tf_utf8_backspace(edited);assert(!strcmp(edited,"中"));assert(tf_ascii_append(edited,sizeof edited,'X',8));assert(!tf_ascii_append(edited,sizeof edited,0,8));
 assert(tf_sms_payload(payload,sizeof payload,"+8612345","Test 123","26;10;16;12;30;00;+;0")&&strstr(payload,"0054006500730074"));assert(!tf_sms_payload(payload,sizeof payload,"12;3","Test","x"));assert(!tf_sms_payload(payload,sizeof payload,"12345","   ","x"));assert(!tf_sms_payload(payload,sizeof payload,"12345","\xed\xa0\x80","x"));assert(!tf_sms_payload(payload,sizeof payload,"12345","\xc0\xaf","x"));assert(tf_sms_payload(payload,sizeof payload,"12345","😀","26;10;16;12;30;00;+;0")&&strstr(payload,"D83DDE00"));
 assert(tf_wifi_payload(payload,sizeof payload,"2g","TopFlow","","sae-mixed","Old","sae-mixed")&&!strstr(payload,"\"key\"")&&!strstr(payload,"\"encryption\""));assert(!tf_wifi_payload(payload,sizeof payload,"2g","Old","","sae-mixed","Old","sae-mixed"));assert(!tf_wifi_payload(payload,sizeof payload,"2g","New","short","sae-mixed","Old","sae-mixed"));assert(!tf_wifi_payload(payload,sizeof payload,"2g","New","","sae-mixed","Old","none"));assert(tf_wifi_payload(payload,sizeof payload,"5g","New","12345678","sae-mixed","Old","none"));
 assert(tf_sms_payload(payload,sizeof payload,"10086","你好，屏幕测试","26;10;16;12;30;00;+;0")&&strstr(payload,"4F60597D"));
 assert(advanced_action("sms-compose")&&advanced_page==6);strcpy(form_values[0],"10086");strcpy(form_values[1],"你好，TopFlow 屏幕测试");output(argv[2],"form-sms");assert(advanced_action("edit:1")&&advanced_page==7&&keyboard_chinese);output(argv[2],"keyboard");assert(advanced_action("key:110")&&advanced_action("key:105"));assert(!strcmp(keyboard_pinyin.letters,"ni"));output(argv[2],"keyboard-pinyin");assert(advanced_action("py:0")&&!*keyboard_pinyin.letters&&strstr(form_values[1],"测试你"));assert(advanced_action("key-backspace")&&!strstr(form_values[1],"测试你"));assert(advanced_action("key-symbols"));output(argv[2],"keyboard-symbols");assert(advanced_action("edit-done")&&advanced_page==6);assert(advanced_action("form-apply")&&!*pending);controls_enabled=1;assert(advanced_action("form-apply")&&!strcmp(pending,"@form"));assert(advanced_confirm()&&!*pending&&strstr(notice,"拒绝授权"));assert(advanced_action("advback")&&!advanced_page);
 assert(advanced_action("wifi-edit:2g")&&advanced_page==6);strcpy(form_values[0],"TopFlow Preview");strcpy(form_original[0],"TopFlow");output(argv[2],"form-wifi");assert(advanced_action("form-apply")&&!strcmp(pending,"@form"));pending[0]=0;assert(advanced_action("advback")&&!advanced_page&&!*form_payload&&!*form_values[1]);
 const char*apn_fixture="{\"ok\":true,\"action\":\"apn.list\",\"result\":{\"mode\":{\"apn_mode\":1},\"automatic\":{\"apnListArray\":[]},\"manual\":{\"apnListArray\":[{\"profileId\":\"p1\",\"profilename\":\"TopFlow\",\"wanapn\":\"internet\",\"username\":\"\",\"password\":\"\",\"pppAuthMode\":0,\"pdpType\":3}]},\"enabled\":{\"profileId\":\"p1\"}}}";
 assert(apn_parse(apn_fixture)&&apn_count==1&&apn_valid);strcpy(modem_selected,"5G");advanced_page=5;output(argv[2],"apn");assert(apn_action("apn-edit:0")&&advanced_page==6&&form_kind==3);output(argv[2],"form-apn");assert(apn_payload(payload,sizeof payload)&&strstr(payload,"\"slot_id\":1")&&!strstr(payload,"\"password\""));assert(apn_verify_payload(payload));strcpy(modem_selected,"4G1");assert(apn_payload(payload,sizeof payload)&&strstr(payload,"\"slot_id\":201"));strcpy(modem_selected,"4G2");assert(apn_payload(payload,sizeof payload)&&strstr(payload,"\"slot_id\":101"));assert(apn_action("apn-clear-password")&&apn_payload(payload,sizeof payload)&&strstr(payload,"\"password\":\"\""));assert(advanced_action("advback")&&advanced_page==5);assert(advanced_action("advback")&&advanced_page==4);assert(!apn_parse("{\"ok\":true,\"action\":\"apn.list\",\"result\":{\"mode\":{\"apn_mode\":1}}}")&&!apn_valid);
 tf_external_enabled[0]=0;assert(tf_parse(&d,real));assert(tf_modem_snapshot(&d,"4G1",&m)&&m.enabled==0&&m.presence==-1&&m.slot==-1&&strstr(m.status,"未启用"));tf_free(&d);assert(advanced_action("modem:4G1"));output(argv[2],"advanced-modem-external-disabled");assert(advanced_action("modem-enable:1")&&!strcmp(pending,"@vendor")&&vendor_pending_enabled==1&&!strcmp(vendor_pending_id,"4G1"));pending[0]=0;tf_external_enabled[0]=-1;
 assert(tf_verify_datad("{\"action\":\"power.direct_supply.set\",\"params\":{\"enabled\":true}}","{\"power\":{\"direct_supply\":{\"supported\":true,\"enabled\":true}}}"));assert(!tf_verify_datad("{\"action\":\"power.direct_supply.set\",\"params\":{\"enabled\":false}}","{}"));assert(tf_verify_datad("{\"action\":\"sleep.set\",\"params\":{\"seconds\":\"0\"}}","{\"sleep\":{\"supported\":true,\"minutes\":-1}}"));
 advanced_page=8;strcpy(power_mode,"Nomal_mode");power_quick=0;output(argv[2],"power");assert(advanced_action("power-mode:5")&&!strcmp(pending,"@power"));pending[0]=0;assert(advanced_action("advback")&&!advanced_page&&!strcmp(page,"settings.html"));
 fixture="{\"ts\":1,\"clients\":{\"list\":[{\"mac\":\"02:00:00:00:00:01\",\"name\":\"Demo phone\",\"band\":\"2g\",\"ip\":\"192.168.0.20\"}],\"blocked\":[\"02:00:00:00:00:02\"],\"acl_mode\":\"deny\"},\"traffic\":{\"day_rx_bytes\":10485760,\"day_tx_bytes\":1048576,\"month_rx_bytes\":1073741824,\"month_tx_bytes\":1073741824,\"limit\":{\"enable\":1,\"type\":2,\"value\":10737418240,\"ratio\":80},\"clear_day\":{\"enable\":1,\"clearday\":1}}}";
 assert(service_action("clients")&&advanced_page==9);output(argv[2],"clients");assert(service_action("client-block:02:00:00:00:00:01")&&strstr(pending,"client.block"));assert(!tf_verify_datad(pending,fixture));pending[0]=0;assert(service_action("client-block:bad;command")&&!*pending);assert(service_action("client-unblock:02:00:00:00:00:02")&&strstr(pending,"client.unblock"));pending[0]=0;
 assert(traffic_action("traffic")&&advanced_page==10);output(argv[2],"traffic");assert(traffic_action("traffic-edit:1")&&advanced_page==10&&!*pending);assert(traffic_action("traffic-edit:0"));output(argv[2],"form-traffic");strcpy(form_values[0],"0");assert(traffic_action("form-apply")&&strstr(pending,"traffic.calibrate")&&!tf_verify_datad(pending,fixture));pending[0]=0;advanced_page=10;assert(traffic_action("traffic-edit:2")&&traffic_action("form-apply")&&tf_verify_datad(pending,fixture));pending[0]=0;
 strcpy(guest_json,"{\"guests\":[{\"section\":\"guest_2g\",\"band\":\"2g\",\"enabled\":true,\"supported\":true,\"ssid\":\"TopFlow Guest\",\"encryption\":\"sae-mixed\"},{\"section\":\"guest_5g\",\"band\":\"5g\",\"enabled\":false,\"supported\":true,\"ssid\":\"TopFlow Guest 5G\",\"encryption\":\"psk2+ccmp\"}],\"active_time_supported\":true,\"active_time_minutes\":120,\"management_access\":false}");guest_valid=1;advanced_page=11;output(argv[2],"guest");assert(service_action("guest-toggle:2g:0")&&strstr(pending,"wifi.guest.set")&&!strstr(pending,"wifi.radio.set")&&!guest_settings_verify(pending));pending[0]=0;assert(service_action("guest-time:1")&&guest_settings_verify(pending));pending[0]=0;assert(service_action("guest-edit:guest_2g")&&form_is_guest&&advanced_page==6);assert(tf_wifi_payload(payload,sizeof payload,form_section,"Guest New","","sae-mixed","TopFlow Guest","sae-mixed")&&strstr(payload,"\"section\":\"guest_2g\"")&&!strstr(payload,"main_"));output(argv[2],"form-guest");assert(advanced_action("advback")&&advanced_page==11&&!form_is_guest);assert(advanced_action("more")&&advanced_page==12);output(argv[2],"more");assert(advanced_action("clients")&&settings_child_parent==12);assert(advanced_action("advback")&&advanced_page==12);assert(advanced_action("advback")&&!advanced_page);fixture=real;
 char*cooling_file=load(argv[4]);char*cooling_tail=strstr(cooling_file,"\nSTDERR:");if(cooling_tail)*cooling_tail=0;char*cooling_root=malloc(strlen(cooling_file)+64);sprintf(cooling_root,"{\"ts\":2,\"cooling\":%s}",cooling_file);fixture=cooling_root;assert(tf_verify_datad("{\"action\":\"cooling.fan.set_enabled\",\"params\":{\"enabled\":false}}",fixture));assert(tf_verify_datad("{\"action\":\"cooling.liquid.set_enabled\",\"params\":{\"enabled\":false}}",fixture));assert(!tf_verify_datad("{\"action\":\"cooling.liquid.set_enabled\",\"params\":{\"enabled\":true}}",fixture));advanced_page=8;notice_until=0;strcpy(verification_message,"本机预览 · 常开开关读取只读设备样本");output(argv[2],"power-cooling");assert(power_action("cooling-liquid")&&strstr(pending,"cooling.liquid.set_enabled")&&strstr(pending,"true"));pending[0]=0;assert(power_action("cooling-fan")&&strstr(pending,"cooling.fan.set_enabled"));pending[0]=0;assert(!tf_verify_datad("{\"action\":\"cooling.fan.set_enabled\",\"params\":{\"enabled\":true}}","{\"cooling\":{\"fan\":{\"always_on\":true,\"mode\":\"always_on\",\"policy\":{\"applied\":false,\"error\":\"fixture failure\"}},\"vendor_sync_error\":null}}"));free(cooling_root);free(cooling_file);fixture=real;

 /* Actual form action/confirmation uses UFI's signed form/AD route.
  * Every branch terminates inside the in-process fixture: no sockets. */
 struct {int status;const char*body;int sent;const char*hint;}sms_cases[]={
 {200,"{\"result\":\"success\"}",1,"发送成功"},
 {409,"{\"result\":\"failed\",\"error\":\"device session expired\"}",0,"会话已过期"},
 {401,"{\"error\":\"unauthorized\"}",0,"拒绝授权"},
 {400,"{\"result\":\"failed\"}",0,"参数被接口拒绝"},
 {502,"{\"result\":\"failed\"}",0,"发送失败"},
 {-1,"",0,"未确认"},
 {200,"{\"result\":0}",0,"未确认"},
 {400,"{\"error_code\":\"sms_sender_unsupported\"}",0,"不支持"},
 {200,"{\"result\":\"success\",\"error\":\"PRIVATE_NUMBER_BODY\"}",0,"未确认"},
 {502,"{\"error\":\"PRIVATE_NUMBER_BODY\"}",0,"未确认"}
 };
 sms_fixture=1;controls_enabled=1;verifying[0]=0;
 for(unsigned k=0;k<sizeof sms_cases/sizeof sms_cases[0];k++){
  assert(advanced_action("sms-compose"));strcpy(form_values[0],"10086");strcpy(form_values[1],"你好😀");sms_status=sms_cases[k].status;sms_reply=sms_cases[k].body;sms_writes=0;
  assert(advanced_action("form-apply")&&!strcmp(pending,"@form")&&!sms_writes);
  assert(advanced_confirm()&&sms_writes==1&&!*pending&&!*form_payload&&strstr(notice,sms_cases[k].hint));
  assert(strstr(sms_sent,"4F60597DD83DDE00")&&!strstr(notice,"PRIVATE_NUMBER_BODY"));
  assert((!*form_values[1])==sms_cases[k].sent);advanced_confirm();assert(sms_writes==1);
 }
 assert(advanced_action("sms-compose"));strcpy(form_values[0],"10086");strcpy(form_values[1],"Test");assert(advanced_action("form-apply")&&!strcmp(pending,"@form"));controls_enabled=0;sms_writes=0;assert(advanced_confirm()&&!sms_writes&&!*pending);form_reset();sms_fixture=0;controls_enabled=1;advanced_page=0;
 assert(display_settings_action("display")&&advanced_page==16);output(argv[2],"display-settings");assert(display_settings_action("display-auto")&&strstr(pending,"@display:0:0"));pending[0]=0;assert(display_settings_action("display-level:999")&&!pending[0]);controls_enabled=0;assert(display_settings_action("display-time:30")&&!pending[0]);controls_enabled=1;
 strcpy(modem_selected,"5G");advanced_page=4;assert(advanced_action("sim-security")&&advanced_page==17&&extra_calls==1);output(argv[2],"factory-sim");assert(advanced_action("advback")&&advanced_page==4&&!fx.valid);advanced_page=12;assert(advanced_action("wps")&&advanced_page==17&&extra_calls==2);output(argv[2],"factory-wps-general");assert(advanced_action("advback")&&advanced_page==12&&!fx.valid);
 for(int t=-1;t<6;t++){assert(tf_sms_filter_match(0,t,0));assert(tf_sms_filter_match(1,t,0)==(t==0||t==1));assert(tf_sms_filter_match(2,t,0)==(t==2||t==3));assert(!tf_sms_filter_match(3,t,0)&&tf_sms_filter_match(3,t,1));}assert(!strcmp(tf_sms_status(3,0),"发送失败"));assert(!strcmp(tf_sms_status(-1,0),"方向未知"));
 wireless_fixture=1;controls_enabled=0;advanced_page=12;assert(advanced_action("wifi-dual")&&advanced_page==20&&!wireless_writes);output(argv[2],"wireless-dual");assert(advanced_action("wireless-dual-toggle")&&!*pending&&!wireless_writes);controls_enabled=1;assert(advanced_action("wireless-dual-toggle")&&!strcmp(pending,"@wireless-dual:1")&&!wireless_writes);pending[0]=0;assert(advanced_action("wireless-refresh")&&!wireless_writes);assert(advanced_action("wireless-dual-toggle")&&advanced_confirm()&&wireless_writes==1&&wireless_fixture_dual==1&&strstr(notice,"回读一致"));assert(advanced_action("wireless-dual-toggle"));wireless_deny_caps=1;assert(advanced_confirm()&&wireless_writes==1&&!*pending);wireless_deny_caps=0;assert(advanced_action("wireless-refresh")&&advanced_action("wireless-dual-toggle"));wireless_stale=1;assert(advanced_confirm()&&wireless_writes==2&&strstr(notice,"未确认"));wireless_stale=0;assert(advanced_action("wireless-dual-toggle"));wireless_fail_reply=1;assert(advanced_confirm()&&wireless_writes==3&&strstr(notice,"未确认"));wireless_fail_reply=0;assert(advanced_action("advback")&&advanced_page==12);
 fixture="{\"ts\":1,\"net\":{\"net_select\":\"4G_AND_5G\"}}";advanced_page=1;assert(advanced_action("network-mode")&&advanced_page==21);output(argv[2],"wireless-mode");char*mode_page=advanced_render();assert(strstr(mode_page,"4G_AND_5G"));free(mode_page);assert(advanced_action("wireless-mode:4")&&!strcmp(pending,"@wireless-mode:4")&&advanced_confirm()&&wireless_writes==4&&strstr(wireless_sent,"Only_LTE")&&!strstr(wireless_sent,"4G_AND_5G"));assert(!tf_verify_datad(wireless_sent,fixture));assert(tf_verify_datad(wireless_sent,"{\"net\":{\"net_select\":\"Only_LTE\"}}"));verifying[0]=0;pending[0]=0;assert(advanced_action("wireless-mode:9")&&!*pending&&wireless_writes==4);assert(advanced_action("advback")&&advanced_page==1);wireless_fixture=0;fixture=real;
 fixture=real;controls_enabled=0;advanced_page=0;assert(advanced_action("wifi")&&advanced_page==22);output(argv[2],"wifi-overview");assert(advanced_action("wifi-edit:2g")&&advanced_page==6&&form_return_page==22);assert(advanced_action("advback")&&advanced_page==22);assert(advanced_action("guest")&&advanced_page==11&&settings_child_parent==22);assert(advanced_action("advback")&&advanced_page==22);assert(advanced_action("wifi-dual")&&advanced_page==20&&wireless_parent==22);assert(advanced_action("advback")&&advanced_page==22);assert(advanced_action("advback")&&!advanced_page&&!strcmp(page,"apps.html"));

 /* Manual cell entry is a distinct confirmed path, never a current-cell lock. */
 fixture=real;cell_fixture=1;controls_enabled=1;verifying[0]=pending[0]=0;advanced_page=1;
 assert(advanced_action("cell-manual:1")&&advanced_page==6&&form_kind==5&&cell_form_nr&&form_return_page==1&&cell_reads==1&&!cell_writes);
 strcpy(form_values[0],"123");strcpy(form_values[1],"627265");strcpy(form_values[2],"78");output(argv[2],"form-cell-nr");assert(advanced_action("edit:2")&&advanced_page==7);output(argv[2],"keyboard-cell");char band_copy[32];strcpy(band_copy,form_values[2]);advanced_action("key:65");advanced_action("key:32");advanced_action("key-language");assert(!strcmp(band_copy,form_values[2])&&!keyboard_chinese);advanced_action("edit-done");
 assert(advanced_action("form-apply")&&!strcmp(pending,"@cell-manual")&&!cell_writes&&strstr(form_payload,"627265"));pending[0]=0;assert(!cell_form_confirm()&&!cell_writes);assert(advanced_action("form-apply")&&advanced_confirm()&&cell_writes==1&&!*pending&&!*form_payload&&strstr(verifying,"cell.lock_nr")&&strstr(cell_sent,"\"pci\":123")&&strstr(cell_sent,"627265"));assert(!tf_verify_datad(cell_sent,real));
 fixture="{\"ts\":987654321,\"net\":{\"lock_nr_cell\":\"123,627265,78\"}}";assert(tf_verify_datad(cell_sent,fixture));verify_update();assert(!verifying[0]);advanced_confirm();assert(cell_writes==1);fixture=real;advanced_page=6;
 assert(advanced_action("form-apply"));cell_caps=0;assert(advanced_confirm()&&cell_writes==1&&!*pending&&!*form_payload);cell_caps=1;
 assert(advanced_action("form-apply"));fixture="{\"net\":{\"nr_sa_supported_bands\":[1],\"nr_nsa_supported_bands\":[1]}}";assert(advanced_confirm()&&cell_writes==1&&!*pending);fixture=real;
 assert(advanced_action("form-apply"));strcpy(form_values[0],"124");assert(advanced_confirm()&&cell_writes==1&&!*pending);strcpy(form_values[0],"123");
 assert(advanced_action("form-apply"));controls_enabled=0;assert(advanced_confirm()&&cell_writes==1&&!*pending);controls_enabled=1;
 const char*bad_pci[]={"","1008","-1","1x","1;2"};for(int i=0;i<5;i++){strcpy(form_values[0],bad_pci[i]);assert(advanced_action("form-apply")&&!*pending&&!*form_payload);}strcpy(form_values[0],"123");strcpy(form_values[1],"0");assert(advanced_action("form-apply")&&!*pending);strcpy(form_values[1],"3279166");assert(advanced_action("form-apply")&&!*pending);strcpy(form_values[1],"627265");strcpy(form_values[2],"512");assert(advanced_action("form-apply")&&!*pending);strcpy(form_values[2],"78");data_age=5001;assert(advanced_action("form-apply")&&!*pending);data_age=0;
 assert(advanced_action("form-apply"));cell_ok=0;assert(advanced_confirm()&&cell_writes==2&&!*verifying&&strstr(notice,"未确认"));advanced_confirm();assert(cell_writes==2);cell_ok=1;
 assert(advanced_action("advback")&&advanced_page==1&&!form_values[0][0]&&!form_payload[0]);assert(advanced_action("cell-manual:0")&&advanced_page==6&&!cell_form_nr);strcpy(form_values[0],"0");strcpy(form_values[1],"262143");output(argv[2],"form-cell-lte");assert(advanced_action("edit:2")&&advanced_page==6);assert(advanced_action("form-apply")&&advanced_confirm()&&cell_writes==3&&strstr(cell_sent,"\"pci\":0")&&strstr(cell_sent,"\"earfcn\":262143")&&!strstr(cell_sent,"\"band\""));assert(tf_verify_datad(cell_sent,"{\"net\":{\"lock_lte_cell\":\"0,262143\"}}"));verifying[0]=0;strcpy(form_values[0],"504");assert(advanced_action("form-apply")&&!*pending);assert(advanced_action("advback")&&advanced_page==1);cell_caps=0;assert(advanced_action("cell-manual:0")&&advanced_page==1);cell_caps=1;cell_fixture=0;fixture=real;

 /* Physical source UI uses exact factory mappings; APN/provision ids never substitute. */
 fixture=real;sim_source_fixture=1;controls_enabled=1;advanced_page=0;verifying[0]=pending[0]=0;tf_external_enabled[0]=tf_external_enabled[1]=1;
 for(int i=0;i<3;i++){
  char open[32];snprintf(open,sizeof open,"modem:%s",tf_source_id(i));assert(advanced_action(open)&&advanced_page==4);assert(advanced_action("modem-source-refresh"));char*h=advanced_render();assert(strstr(h,"SIM 卡源")&&strstr(h,"当前：插拔卡")&&strstr(h,"act:modem-source:1")&&!strstr(h,"modem-op:slot"));free(h);output(argv[2],i==0?"modem-source-main":i==1?"modem-source-card2":"modem-source-card3");
  int writes=sim_source_writes;assert(advanced_action("modem-source:1")&&!strcmp(pending,"@simsource")&&strstr(pending_label,tf_source_id(i))&&strstr(pending_label,"短暂断网")&&sim_source_writes==writes);
  assert(advanced_confirm()&&sim_source_writes==writes+1&&!strcmp(verifying,"@simsource")&&!*pending);assert(!strcmp(sim_source_method,i==0?"sim_switch_slot":"sub_modem_switch_slot"));assert(strstr(sim_source_sent,i==0?"\"slot\":1":i==1?"\"sub_modem_num\":1":"\"sub_modem_num\":0"));advanced_confirm();assert(sim_source_writes==writes+1);
  clock_now+=2000;verify_update();assert(!*verifying&&strstr(verification_message,"已切换为内置卡"));
 }
 assert(advanced_action("modem:5G"));int source_writes_before=sim_source_writes;assert(advanced_action("modem-op:slot2")&&!pending[0]);
 assert(advanced_action("modem-source:0")&&!strcmp(pending,"@simsource"));sim_source_slots[0]=0;assert(advanced_confirm()&&sim_source_writes==source_writes_before&&!pending[0]); /* state changed during confirmation */
 sim_source_slots[0]=-1;assert(advanced_action("modem-source:1")&&!strcmp(pending,"@simsource")&&strstr(pending_label,"当前卡源尚未确认")&&sim_source_writes==source_writes_before);pending[0]=0;
 sim_source_slots[0]=0;controls_enabled=0;assert(advanced_action("modem-source:1")&&!pending[0]&&sim_source_writes==source_writes_before);controls_enabled=1;
 assert(advanced_action("modem-source:1"));controls_enabled=0;assert(advanced_confirm()&&!pending[0]&&sim_source_writes==source_writes_before);controls_enabled=1;
 assert(advanced_action("modem-source:1"));strcpy(modem_selected,"4G1");assert(advanced_confirm()&&!pending[0]&&sim_source_writes==source_writes_before);strcpy(modem_selected,"5G");
 for(int block=1;block<=2;block++){assert(advanced_action("modem-source:1")&&!strcmp(pending,"@simsource"));sim_source_block_on_submit=block;assert(advanced_confirm()&&!pending[0]&&!verifying[0]&&sim_source_writes==source_writes_before&&strstr(notice,"未提交"));sim_source_block_on_submit=0;tf_http_cancelled=0;controls_enabled=1;}
 sim_source_apply=0;assert(advanced_action("modem-source:1")&&advanced_confirm()&&sim_source_writes==source_writes_before+1);clock_now+=16001;verify_update();assert(!*verifying&&strstr(verification_message,"未确认"));advanced_confirm();assert(sim_source_writes==source_writes_before+1);
 sim_source_apply=1;sim_source_fail=1;assert(advanced_action("modem-source:1")&&advanced_confirm()&&strstr(notice,"提交结果未确认"));clock_now+=2000;verify_update();assert(!*verifying&&strstr(verification_message,"已切换为内置卡"));sim_source_fail=0;
 assert(advanced_action("modem:4G1"));tf_external_enabled[0]=0;assert(advanced_action("modem-source:0")&&!pending[0]);char*disabled_source=advanced_render();assert(strstr(disabled_source,"请先启用此卡模块")&&!strstr(disabled_source,"act:modem-source:0"));free(disabled_source);
 tf_external_enabled[0]=1;sim_source_slots[1]=-1;assert(advanced_action("modem-source-refresh"));char*unknown_source=advanced_render();assert(strstr(unknown_source,"当前：尚未确认")&&!strstr(unknown_source,"当前使用")&&strstr(unknown_source,"act:modem-source:0")&&strstr(unknown_source,"act:modem-source:1"));free(unknown_source);
 int final_source_writes=sim_source_writes;const char*invalid_source[]={"modem-source:2","modem-source:-1","modem-source:1;2","modem-source:"};for(int i=0;i<4;i++)assert(advanced_action(invalid_source[i])&&!pending[0]&&sim_source_writes==final_source_writes);

 /* Every modem can select either absolute source with a present, absent or
  * unknown SIM; empty source reads never become a fictitious current source. */
 const char*source_sim_states[]={"sim ready","sim undetected",""};char source_snapshot[1024];
 int enable_before=vendor_enable_writes;
 tf_external_enabled[0]=tf_external_enabled[1]=1;
 for(int i=0;i<3;i++)for(int presence=0;presence<3;presence++)for(int old=-1;old<2;old++)for(int wanted=0;wanted<2;wanted++){
  snprintf(source_snapshot,sizeof source_snapshot,"{\"modems\":[{\"id\":\"%s\",\"sim\":{\"state\":\"%s\"},\"wwan\":{\"status\":\"disconnected\"},\"qos\":{\"qci\":9,\"ambr_dl\":1234,\"ambr_ul\":4321}}]}",tf_source_id(i),source_sim_states[presence]);fixture=source_snapshot;
  sim_source_slots[i]=old;pending[0]=verifying[0]=0;notice_until=0;
  char open[32],choose[32];snprintf(open,sizeof open,"modem:%s",tf_source_id(i));snprintf(choose,sizeof choose,"modem-source:%d",wanted);
  assert(advanced_action(open)&&advanced_action("modem-source-refresh"));char*h=advanced_render();
  if(old<0)assert(strstr(h,"当前：尚未确认")&&!strstr(h,"当前使用")&&strstr(h,"act:modem-source:0")&&strstr(h,"act:modem-source:1"));
  else {char same[40];snprintf(same,sizeof same,"href='act:modem-source:%d'",old);assert(strstr(h,"当前使用")&&!strstr(h,same));}
  if(presence)assert(!strstr(h,"1234 Mbps")&&!strstr(h,"4321 Mbps")&&strstr(h,"未提供"));
  assert(strstr(h,"SIM 卡源")<strstr(h,"实时与签约速率"));free(h);
  if(i&&presence==1&&old<0&&wanted==1)output(argv[2],i==1?"modem-empty-card2-021":"modem-empty-card3-021");
  int writes=sim_source_writes,saved_slots[3]={sim_source_slots[0],sim_source_slots[1],sim_source_slots[2]};
  assert(advanced_action(choose)&&sim_source_writes==writes);
  if(old==wanted){assert(!pending[0]);continue;}
  assert(!strcmp(pending,"@simsource"));if(old<0)assert(strstr(pending_label,"当前卡源尚未确认")&&strstr(pending_label,"不推测原卡源"));
  assert(advanced_confirm()&&sim_source_writes==writes+1&&!pending[0]&&!strcmp(verifying,"@simsource"));
  assert(sim_source_slots[i]==wanted);for(int other=0;other<3;other++)if(other!=i)assert(sim_source_slots[other]==saved_slots[other]);
  advanced_confirm();assert(sim_source_writes==writes+1);clock_now+=2000;verify_update();assert(!verifying[0]&&source_current[i]==wanted&&strstr(verification_message,"已切换为"));
 }
 assert(vendor_enable_writes==enable_before); /* Source choice never powers a module. */

 /* Missing/stale datad modem entries cannot hide the independent factory controls. */
 fixture="{}";for(int i=1;i<3;i++){
  char open[32];snprintf(open,sizeof open,"modem:%s",tf_source_id(i));sim_source_slots[i]=-1;tf_external_enabled[i-1]=0;
  assert(advanced_action(open)&&advanced_action("modem-source-refresh"));char*h=advanced_render();assert(strstr(h,"SIM 卡源")&&strstr(h,"act:modem-enable:1")&&!strstr(h,"act:modem-source:1"));free(h);
  int reads=sim_source_reads,writes=sim_source_writes,enables=vendor_enable_writes;
  assert(advanced_action("modem-enable:1")&&!strcmp(pending,"@vendor")&&vendor_enable_writes==enables);
  assert(advanced_confirm()&&vendor_enable_writes==enables+1&&!pending[0]);clock_now+=2000;verify_update();
  assert(!verifying[0]&&sim_source_reads>reads&&sim_source_writes==writes&&source_current[i]==-1);
  h=advanced_render();assert(strstr(h,"当前：尚未确认")&&strstr(h,"act:modem-source:1"));free(h);
  data_age=6001;h=advanced_render();assert(strstr(h,"当前网络数据不可用")&&strstr(h,"act:modem-source:0")&&strstr(h,"act:modem-source:1"));free(h);data_age=0;
  /* Enabled state lost between selecting and confirming cancels the one write. */
  assert(advanced_action("modem-source:1")&&!strcmp(pending,"@simsource"));tf_external_enabled[i-1]=0;assert(advanced_confirm()&&!pending[0]&&sim_source_writes==writes);
  tf_external_enabled[i-1]=-1;h=advanced_render();assert(strstr(h,"原厂启用状态未知")&&!strstr(h,"act:modem-source:1")&&!strstr(h,"act:modem-enable:1"));free(h);
 }
 /* A successful transport with still-empty raw readback never claims success. */
 tf_external_enabled[0]=1;assert(advanced_action("modem:4G1"));sim_source_apply=0;sim_source_slots[1]=-1;
 int empty_writes=sim_source_writes;assert(advanced_action("modem-source:1")&&advanced_confirm()&&sim_source_writes==empty_writes+1);clock_now+=16001;verify_update();assert(!verifying[0]&&strstr(verification_message,"未确认")&&source_current[1]==-1);advanced_confirm();assert(sim_source_writes==empty_writes+1);sim_source_apply=1;
 fixture=real;
 sim_source_fixture=0;tf_external_enabled[0]=tf_external_enabled[1]=-1;source_current[0]=source_current[1]=source_current[2]=-1;verifying[0]=pending[0]=0;

 /* Every card opens its own QoS, in the requested live-up/live-down/QCI/AMBR-up/down order. */
 fixture="{\"modems\":[{\"id\":\"4G2\",\"sim\":{\"state\":\"sim ready\"},\"wwan\":{\"status\":\"ipv4_connected\"},\"traffic\":{\"rx_speed\":3000000,\"tx_speed\":4000000},\"qos\":{\"ambr_dl\":150.125,\"ambr_ul\":75,\"qci\":9}},{\"id\":\"5G\",\"sim\":{\"state\":\"sim ready\"},\"wwan\":{\"status\":\"ipv4_connected\"},\"traffic\":{\"rx_speed\":1000000,\"tx_speed\":2000000},\"qos\":{\"ambr_dl\":2000,\"ambr_ul\":200,\"qci\":6,\"sampled_at\":0}},{\"id\":\"4G1\",\"sim\":{\"state\":\"sim ready\"},\"wwan\":{\"status\":\"ipv4_connected\"},\"traffic\":{\"rx_speed\":5000000,\"tx_speed\":6000000},\"qos\":{\"ambr_dl\":100,\"ambr_ul\":50,\"qci\":8}}]}";
 tf_external_enabled[0]=tf_external_enabled[1]=1;data_age=0;verifying[0]=pending[0]=0;
 const char*ambr_dl[]={"2000 Mbps","100 Mbps","150.125 Mbps"},*ambr_ul[]={"200 Mbps","50 Mbps","75 Mbps"};
 for(int i=0;i<3;i++){
  char open[32];snprintf(open,sizeof open,"modem:%s",tf_source_id(i));assert(advanced_action(open));char*h=advanced_render();
  const char*up=strstr(h,"实时上行"),*down=strstr(h,"实时下行"),*qci_label=strstr(h,"QCI"),*ambrup=strstr(h,"签约上行"),*ambrdown=strstr(h,"签约下行"),*source=strstr(h,"SIM 卡源");
  assert(up&&down&&qci_label&&ambrup&&ambrdown&&source&&source<up&&up<down&&down<qci_label&&qci_label<ambrup&&ambrup<ambrdown);
  assert(!strstr(qci_label+3,"QCI")&&strstr(h,ambr_dl[i])&&strstr(h,ambr_ul[i]));if(i)assert(!strstr(h,"2000 Mbps"));free(h);
  output(argv[2],i==0?"modem-ambr-main-019":i==1?"modem-ambr-card2-019":"modem-ambr-card3-019");
 }
 tf_external_enabled[1]=0;char*disabled_qos=advanced_render();assert(!strstr(disabled_qos,"150.125 Mbps")&&!strstr(disabled_qos,"75 Mbps")&&strstr(disabled_qos,"未提供"));free(disabled_qos);output(argv[2],"modem-ambr-disabled-019");
 fixture="{\"modems\":[{\"id\":\"5G\",\"sim\":{\"state\":\"sim ready\"},\"qos\":{\"qci\":999,\"ambr_dl\":2000,\"ambr_ul\":200}}]}";assert(advanced_action("modem:5G"));char*invalid_qci=advanced_render();assert(!strstr(invalid_qci,">999<")&&strstr(invalid_qci,"2000 Mbps"));free(invalid_qci);
 data_age=6001;char*stale_qos=advanced_render();assert(strstr(stale_qos,"当前网络数据不可用")&&!strstr(stale_qos,"Mbps")&&strstr(stale_qos,"SIM 卡源"));free(stale_qos);data_age=0;

 /* Access restrictions never reinterpret an unknown or allow-list mode. */
 const char*acl_modes[]={"deny","disable","allow","","corrupt"};char acl[1024];
 for(int i=0;i<5;i++){
  snprintf(acl,sizeof acl,"{\"clients\":{\"acl_mode\":\"%s\",\"list\":[{\"mac\":\"02:00:00:00:00:01\",\"kind\":\"wifi\"},{\"mac\":\"02:00:00:00:00:03\",\"kind\":\"ethernet\"}],\"blocked\":[\"02:00:00:00:00:02\"]}}",acl_modes[i]);
  assert(tf_parse(&d,acl));assert(service_client_allowed(&d,"02:00:00:00:00:01",1)==(i<2));assert(service_client_allowed(&d,"02:00:00:00:00:02",0)==(i==0));assert(!service_client_allowed(&d,"02:00:00:00:00:01",0)&&!service_client_allowed(&d,"02:00:00:00:00:03",1));tf_free(&d);
  assert(tf_verify_datad("{\"action\":\"client.block\",\"params\":{\"mac\":\"02:00:00:00:00:02\"}}",acl)==(i==0));assert(tf_verify_datad("{\"action\":\"client.unblock\",\"params\":{\"mac\":\"02:00:00:00:00:01\"}}",acl)==(i==0));
 }
 const char*g_before="{\"guests\":[{\"section\":\"guest_2g\",\"enabled\":true,\"supported\":true,\"ssid\":\"Local guest\",\"encryption\":\"sae-mixed\",\"clients\":2,\"left_seconds\":65}],\"active_time_supported\":true,\"active_time_minutes\":120,\"management_access\":false}";
 const char*g_after="{\"guests\":[{\"section\":\"guest_2g\",\"enabled\":false,\"supported\":true}],\"active_time_supported\":true,\"active_time_minutes\":120,\"management_access\":false}";
 const char*g_unknown="{\"guests\":[{\"section\":\"guest_2g\",\"enabled\":true,\"supported\":null}]}";
 guest_mock=1;
 for(int scenario=0;scenario<6;scenario++){
  strcpy(guest_json,g_before);guest_valid=1;guest_reply=scenario==1?g_after:scenario==2?g_unknown:g_before;guest_reply_after=g_after;guest_reads=guest_writes=0;guest_cancel_read=scenario==3;guest_block_on_submit=scenario==4?1:scenario==5?2:0;tf_http_cancelled=0;controls_enabled=1;advanced_page=11;pending[0]=verifying[0]=0;
  if(!scenario){char*h=advanced_render();assert(strstr(h,"2 台")&&strstr(h,"1 分 5 秒"));free(h);output(argv[2],"guest-status-audit");}
  assert(service_action("guest-toggle:2g:0")&&strstr(pending,"wifi.guest.set"));assert(service_guest_confirm()&&!pending[0]);assert(guest_writes==(scenario==0));assert(!service_guest_confirm()&&guest_writes==(scenario==0));
 }
 guest_mock=guest_block_on_submit=guest_cancel_read=tf_http_cancelled=0;controls_enabled=1;
 tf_guest_selection capture;strcpy(guest_json,g_unknown);guest_valid=1;assert(!guest_settings_capture("{\"params\":{\"bands\":{\"2g\":false}}}",&capture));assert(!guest_settings_capture("{\"params\":{\"active_time\":120}}",&capture));strcpy(guest_json,g_before);assert(guest_settings_capture("{\"params\":{\"active_time\":120}}",&capture)&&capture.minutes==120);assert(!guest_settings_capture("{\"params\":{\"active_time\":121}}",&capture));

 /* Token memory scales down for small replies while the full bound is retained. */
 assert(tf_parse(&d,"{}")&&d.cap==32&&d.n==1);tf_free(&d);char*token_limit=malloc(65538);assert(token_limit);token_limit[0]='[';for(int i=0;i<32767;i++){token_limit[1+i*2]='0';token_limit[2+i*2]=',';}token_limit[65534]=']';token_limit[65535]=0;assert(tf_parse(&d,token_limit)&&d.n==32768&&d.cap==32768);tf_free(&d);token_limit[65534]=',';token_limit[65535]='0';token_limit[65536]=']';token_limit[65537]=0;assert(!tf_parse(&d,token_limit));free(token_limit);
 free(real);puts("PASS: native JSON, exact schemas/readback, bounds, unlock-authorized control guard, no legacy enable bypass, dynamic pages, official SMS one-submit/result/session/error contract and known-tag filters, dual-band and raw network mode with confirm/one write/capability loss/stale/error-action rejection");return 0;
}
'@
$source=$source.Replace('HTTP_DECODE',$decode).Replace('AY_DEFS',$defs).Replace('AY_PARSERS',$parsers)
[IO.File]::WriteAllText("$root/build-preview/test-controls.c",$source)
$aoyouLine=Get-Content "$root/../analysis/evidence/aoyou-snapshot-v2.txt" | Where-Object {$_ -match '^TOPFLOW_AOYOU_V1=' -and $_ -match '"operation":"get-proxies"'} | Select-Object -Last 1
$aoyouData=($aoyouLine.Substring('TOPFLOW_AOYOU_V1='.Length)|ConvertFrom-Json).data|ConvertTo-Json -Depth 100 -Compress
[IO.File]::WriteAllText("$root/build-preview/aoyou-proxies-fixture.json",$aoyouData)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/build-preview/test-controls.c" "$root/upstream/src/json.c" -o "$root/bin/test-controls.exe"
if($LASTEXITCODE -ne 0){throw 'Native controls test build failed'}
& "$root/bin/test-controls.exe" "$root/../analysis/evidence/datad-state.txt" "$root/preview" "$root/build-preview/aoyou-proxies-fixture.json" "$root/../analysis/evidence/cooling-existing-state.txt"
if($LASTEXITCODE -ne 0){throw 'Native controls tests failed'}
$mainSource=[IO.File]::ReadAllText("$root/topflow_main.c")
if($mainSource.Contains('"act:factory"') -or $mainSource.Contains('"@factory"') -or $mainSource.Contains('strcmp(a,"factory")')){throw 'Physical screen still contains a factory-switch route'}
Write-Output 'PASS: physical screen has no factory action or power-key restore route'
