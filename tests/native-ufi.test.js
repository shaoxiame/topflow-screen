'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),native=path.join(root,'native');
const sha=b=>crypto.createHash('sha256').update(b).digest();
const vectors=['/api/session','/api/sms_forward_enabled?enable=1','/api/sms_forward_mail'].map((p,i)=>{const method=i?'POST':'GET',t='1780000000123',m=crypto.createHmac('md5','minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd').update('minikano'+method+p.split('?')[0]+t).digest();return {p,method,t,sign:sha(Buffer.concat([sha(m.subarray(0,8)),sha(m.subarray(8))])).toString('hex')};});
test('native UFI signing matches independent Node crypto and temporary authorization stays memory-only/read-gated',()=>{
 const source=`
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "control_logic.h"
static long long clock_ms=1000;
static long long local_clock(void){return clock_ms;}
static int calls=0,mode=0,posts=0,local_reads=0,local_mode=0;
static int local_load(char out[65]){local_reads++;if(local_mode==1){out[0]=0;return 0;}memset(out,local_mode==2?'!':'b',64);out[local_mode==3?32:64]=0;return 1;}
static int fixture_http(int port,const char*method,const char*path,const char*const headers[4],const char*body,char*out,size_t cap,int timeout){
 assert(port==2333);assert(timeout<=55000);calls++;if(!strcmp(method,"POST"))posts++;
 if(!strcmp(path,"/api/need_token")){assert(!headers);snprintf(out,cap,"%s",mode==2?"{\\"need_token\\":" :mode==3?"{\\"need_token\\":true}":mode==4?"{\\"need_token\\":false}":"{\\"need_token\\":true,\\"device_token\\":\\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\"}");return 200;}
 if(mode==4)assert(!headers);else assert(headers&&strlen(headers[0])&&strlen(headers[1])==64&&strlen(headers[2])==64&&strlen(headers[3])==64);
 if(mode==1){strcpy(out,"{}");return 401;}snprintf(out,cap,"%s",!strcmp(path,"/api/session")?"{\\"authenticated\\":true}":"{\\"result\\":\\"success\\"}");return 200;
}
#define TF_UFI_NOW local_clock
#define TF_UFI_WALL local_clock
#define TF_UFI_HTTP fixture_http
#define TF_UFI_LOCAL_LOAD local_load
#include "ufi_auth.h"
int main(void){char hex[65],out[4096];unsigned char digest[32];
 tf_digest("",0,digest,0);tf_hex(digest,32,hex);assert(!strcmp(hex,"${sha('').toString('hex')}"));
 tf_digest("abc",3,digest,0);tf_hex(digest,32,hex);assert(!strcmp(hex,"${sha('abc').toString('hex')}"));
 char long_input[1024];memset(long_input,'x',sizeof long_input);tf_digest(long_input,sizeof long_input,digest,0);tf_hex(digest,32,hex);assert(!strcmp(hex,"${sha('x'.repeat(1024)).toString('hex')}"));
 ${vectors.map(v=>`assert(tf_ufi_sign("${v.method}","${v.p}","${v.t}",hex));assert(!strcmp(hex,"${v.sign}"));`).join('\n')}
 assert(!tf_ufi_live());assert(tf_ufi_request("POST","/api/sms_forward_sms","{}",out,sizeof out,1000,1)==-1&&calls==0);
 assert(tf_ufi_authorize("local-test-only"));assert(calls==2&&posts==0&&tf_ufi_live());assert(!strcmp(tf_ufi_auth.authorization,"${sha('local-test-only').toString('hex')}"));
 assert(tf_ufi_request("POST","/api/sms_forward_sms","{}",out,sizeof out,1000,0)==-1&&calls==2);
 assert(tf_ufi_request("POST","/api/run_shell","{}",out,sizeof out,1000,1)==-1&&calls==2);
 assert(tf_ufi_request("POST","/api/sms_forward_enabled?enable=1&extra=bad","{}",out,sizeof out,1000,1)==-1);
 assert(tf_ufi_request("POST","/api/sms_forward_sms","{}",out,sizeof out,1000,1)==200&&posts==1);
 clock_ms+=600000;assert(!tf_ufi_live());for(size_t i=0;i<sizeof tf_ufi_auth;i++)assert(((unsigned char*)&tf_ufi_auth)[i]==0);
 assert(tf_ufi_authorize("local-test-only"));mode=1;assert(tf_ufi_request("GET","/api/sms_forward_method",NULL,out,sizeof out,1000,0)==401);assert(!tf_ufi_live()&&!tf_ufi_auth.authorization[0]);
 int before=calls;assert(!tf_ufi_authorize("bad\\ninput")&&calls==before);tf_ufi_revoke();
 clock_ms+=60000;mode=0;assert(tf_ufi_authorize_existing()&&local_reads==1);tf_ufi_revoke();
 for(int bad=1;bad<=3;bad++){clock_ms+=60000;mode=bad;assert(!tf_ufi_authorize_existing());assert(!tf_ufi_auth.authorization[0]&&!tf_ufi_auth.device[0]);}
 for(int bad=1;bad<=3;bad++){clock_ms+=60000;mode=0;local_mode=bad;assert(!tf_ufi_authorize_existing());assert(!tf_ufi_auth.authorization[0]);}
 clock_ms+=60000;mode=4;before=local_reads;assert(tf_ufi_authorize_existing()&&local_reads==before);tf_ufi_revoke();
 puts("native UFI auth vectors and lifecycle passed");return 0;}
`;
 const dir=path.join(native,'build-preview');fs.mkdirSync(dir,{recursive:true});const c=path.join(dir,'test-ufi-auth.c'),exe=path.join(dir,'test-ufi-auth.exe');fs.writeFileSync(c,source);
 const compiled=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-std=c11','-D_GNU_SOURCE','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),c,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});
 assert.equal(compiled.status,0,compiled.stderr);const result=cp.spawnSync(exe,[],{encoding:'utf8'});assert.equal(result.status,0,result.stderr+result.stdout);
 const header=fs.readFileSync(path.join(native,'ufi_auth.h'),'utf8');assert.doesNotMatch(header,/\b(?:fopen|open|system|popen|fork|execv|fprintf|printf)\s*\(/);assert.match(header,/PR_SET_DUMPABLE/);assert.match(header,/600000/);
 const loader=fs.readFileSync(path.join(native,'ufi_local_credential.h'),'utf8');assert.match(loader,/"-noinit"/);assert.match(loader,/"-readonly"/);assert.match(loader,/mode=ro&immutable=1/);assert.match(loader,/SELECT json_extract\(value,'\$\.login_token_sha256'\) FROM config WHERE key='app_config' LIMIT 2;/);assert.doesNotMatch(loader,/\b(?:system|popen|fprintf|printf)\s*\(/);assert.match(loader,/O_RDONLY\|O_NOFOLLOW/);assert.match(loader,/before\.st_mtim\.tv_nsec!=after\.st_mtim\.tv_nsec/);assert.match(loader,/PR_SET_PDEATHSIG,SIGKILL/);assert.match(loader,/getppid\(\)!=owner/);assert.match(loader,/if\(fcntl\(3,F_SETFD,0\)<0\)_exit/);
});

test('native forwarding UI uses existing channels, masks secrets and never retries saved test failures',()=>{
 const advanced=fs.readFileSync(path.join(native,'advanced_controls.h'),'utf8');
 const actualShell=advanced.slice(advanced.indexOf('static void advanced_shell_frame('),advanced.indexOf('#include "modem_pages.h"'));
 const source=String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include "form_logic.h"
static long long clock_ms=1000;static long long local_clock(void){return clock_ms;}
static int writes=0,fail_test=0;static char last_path[128],last_body[32768];
static const char*mail="{\"smtp_host\":\"smtp.example.test\",\"smtp_port\":\"2525\",\"smtp_username\":\"from@example.test\",\"smtp_to\":\"to@example.test\",\"password_saved\":true,\"forward_dev_info\":\"0\"}";
static int local_load(char out[65]){memset(out,'b',64);out[64]=0;return 1;}
static int fixture_http(int port,const char*method,const char*path,const char*const headers[4],const char*body,char*out,size_t cap,int timeout){(void)port;(void)headers;(void)timeout;
 if(!strcmp(method,"POST")){writes++;snprintf(last_path,sizeof last_path,"%s",path);snprintf(last_body,sizeof last_body,"%s",body);snprintf(out,cap,"%s",fail_test?"{\"result\":\"failed\",\"saved\":true,\"error_code\":\"sms_forward_test_failed\"}":"{\"result\":\"success\"}");return fail_test?500:200;}
 const char*value="{}";if(!strcmp(path,"/api/need_token"))value="{\"need_token\":true,\"device_token\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}";
 else if(!strcmp(path,"/api/session"))value="{\"authenticated\":true}";else if(!strcmp(path,"/api/sms_forward_method"))value="{\"sms_forward_method\":\"SMTP\"}";
 else if(strstr(path,"enabled"))value="{\"enabled\":\"0\"}";else if(!strcmp(path,"/api/sms_forward_mail"))value=mail;
 else if(!strcmp(path,"/api/sms_forward_curl"))value="{\"curl_text\":\"curl https://example.test -d '{{sms-body}}'\"}";
 else if(!strcmp(path,"/api/sms_forward_dingtalk"))value="{\"webhook_url\":\"https://oapi.dingtalk.com/robot/send?access_token=synthetic-secret\",\"secret\":\"synthetic-key\",\"forward_dev_info\":\"0\"}";
 else if(!strcmp(path,"/api/sms_forward_sms"))value="{\"sms_to_phone\":\"10086\",\"forward_dev_info\":\"0\"}";
 else if(!strcmp(path,"/api/sms_forward_blacklist"))value="{\"phone\":\"10010\",\"keywords\":\"blocked\"}";
 snprintf(out,cap,"%s",value);return 200;}
#define TF_UFI_NOW local_clock
#define TF_UFI_WALL local_clock
#define TF_UFI_HTTP fixture_http
#define TF_UFI_LOCAL_LOAD local_load
static char pending[4096],pending_label[1600],notice[2048],page[96]="apps.html",advanced_html[262144];static size_t advanced_n=0;
static int advanced_page=0,scroll_y=0,controls_enabled=0,theme_dark=0;
/* Synthetic read-only header values; authentication, forwarding and confirmation use production code. */
static const char*lookup(const char*k){if(!strcmp(k,"TIME"))return "14:36";if(!strcmp(k,"BAT_CLASS"))return "discharging";if(!strcmp(k,"BAT_STATE"))return "电池供电";if(!strcmp(k,"BAT_MARK"))return "";if(!strcmp(k,"BAT"))return "78";if(!strcmp(k,"BAT_FILL"))return "8";return "—";}
static char verifying[4096],verification_message[192];static uint32_t notice_until=0;static uint32_t tick(void){return (uint32_t)clock_ms;}
static void ah(const char*fmt,...){va_list a;va_start(a,fmt);advanced_n+=(size_t)vsnprintf(advanced_html+advanced_n,sizeof advanced_html-advanced_n,fmt,a);va_end(a);}
static void esc(char*out,size_t cap,const char*s){size_t n=0;for(;*s&&n+7<cap;s++){const char*r=*s=='<'?"&lt;":*s=='>'?"&gt;":*s=='&'?"&amp;":*s=='\"'?"&quot;":NULL;if(r){strcpy(out+n,r);n+=strlen(r);}else out[n++]=*s;}out[n]=0;}
static void show_notice(const char*s){snprintf(notice,sizeof notice,"%s",s);}static void show_busy(const char*s){(void)s;}
static int control_guard(void){return controls_enabled;}
ACTUAL_SHELL
#include "sms_forward_pages.h"
static void output(const char*dir,const char*name){sms_forward_render();char file[1024];snprintf(file,sizeof file,"%s/%s%s.html",dir,name,theme_dark?"-dark":"");FILE*f=fopen(file,"wb");assert(f);fwrite(advanced_html,1,strlen(advanced_html),f);fclose(f);}
int main(int argc,char**argv){assert(argc==2);assert(writes==0);assert(sms_forward_action("sms-forward")&&advanced_page==13&&tf_ufi_live());
 for(int theme=0;theme<2;theme++){theme_dark=theme;advanced_page=13;output(argv[1],"forward-overview");for(int kind=0;kind<5;kind++){assert(sf_load(kind));advanced_page=14;char name[64];snprintf(name,sizeof name,"forward-channel-%d",kind);output(argv[1],name);if(kind==2){assert(!strstr(advanced_html,"synthetic-secret")&&!strstr(advanced_html,"synthetic-key"));}}}
 assert(writes==0);assert(sf_load(0));advanced_page=14;assert(sms_forward_action("sf-save")&&!*pending&&writes==0);controls_enabled=1;assert(sms_forward_action("sf-save")&&!strcmp(pending,"@sf-save")&&writes==0);pending[0]=0;assert(writes==0);
 assert(sf_build_payload());assert(strstr(sf.payload,"\"smtp_port\":\"2525\"")&&strstr(sf.payload,"\"smtp_password\":\"\""));sf.password_saved=0;assert(!sf_build_payload());sf.password_saved=1;
 assert(sf_load(3));strcpy(sf.values[0],"+8612345678901\n10086");assert(sf_build_payload());tf_json d;assert(tf_parse(&d,sf.payload));char value[256];assert(tf_gets(&d,0,"sms_to_phone",value,sizeof value)&&strchr(value,'\n'));tf_free(&d);
 assert(sf_load(1));strcpy(sf.values[0],"curl https://example.test -d 'no placeholder'");assert(!sf_build_payload());
 assert(sf_load(2));strcpy(sf.values[1],"");assert(sf_build_payload()&&strstr(sf.payload,"\"secret\":\"\""));advanced_page=15;sf.field=0;output(argv[1],"forward-keyboard");assert(!strstr(advanced_html,"synthetic-secret"));
 assert(sf_load(0));advanced_page=14;fail_test=1;assert(sms_forward_action("sf-save"));assert(sms_forward_confirm());assert(writes==1&&!strcmp(last_path,"/api/sms_forward_mail")&&strstr(notice,"配置已保存"));assert(!sf.payload[0]&&!sf.values[3][0]);
 fail_test=0;for(int kind=0;kind<5;kind++){assert(sf_load(kind));advanced_page=14;int before=writes;assert(sms_forward_action("sf-save")&&writes==before);assert(sms_forward_confirm()&&writes==before+1&&!strcmp(last_path,sf_paths[kind]));}
 advanced_page=13;sf.enabled=0;int before=writes;assert(sms_forward_action("sf-enable")&&writes==before);assert(sms_forward_confirm()&&writes==before+1&&!strcmp(last_path,"/api/sms_forward_enabled?enable=1"));
 sf.power=0;before=writes;assert(sms_forward_action("sf-power")&&writes==before);assert(sms_forward_confirm()&&writes==before+1&&!strcmp(last_path,"/api/power_status_forward_enabled?enable=1"));
 assert(sf_load(0));advanced_page=14;assert(sms_forward_action("sf-save"));controls_enabled=0;before=writes;assert(sms_forward_confirm()&&writes==before);controls_enabled=1;
 assert(sf_load(2));advanced_page=14;clock_ms+=600000;sms_forward_render();assert(advanced_page==13&&!tf_ufi_live()&&!sf.values[0][0]);assert(!strstr(advanced_html,"输入 UFI 口令"));
 strcpy(page,"subpages/sms.html");assert(sms_forward_action("sms-forward")&&tf_ufi_live());assert(sms_forward_action("advback")&&!strcmp(page,"subpages/sms.html")&&!tf_ufi_live());
 sms_forward_cleanup();for(size_t i=0;i<sizeof sf;i++)assert(((unsigned char*)&sf)[i]==0);puts("native forwarding contracts passed");return 0;}
`.replace('ACTUAL_SHELL',actualShell);
 const dir=path.join(native,'build-preview');fs.mkdirSync(dir,{recursive:true});const c=path.join(dir,'test-ufi-pages.c'),exe=path.join(dir,'test-ufi-pages.exe');fs.writeFileSync(c,source);
 const compiled=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-std=c11','-D_GNU_SOURCE','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),c,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
 const run=cp.spawnSync(exe,[path.join(native,'preview')],{encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);
});
