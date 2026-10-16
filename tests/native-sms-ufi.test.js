'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),native=path.join(root,'native');
test('native SMS uses authenticated UFI form and exact panel AD, at most one send with no login/fallback',()=>{
 const sha=s=>crypto.createHash('sha256').update(s).digest('hex').toUpperCase();
 const expectedAD=sha(sha('synthetic-inner'+'synthetic-version')+'synthetic-rd');
 const expectedSign=(()=>{const mac=crypto.createHmac('md5','minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd').update('minikanoPOST/api/goform/goform_set_cmd_process1780000000123').digest(),h=b=>crypto.createHash('sha256').update(b).digest();return h(Buffer.concat([h(mac.subarray(0,8)),h(mac.subarray(8))])).toString('hex')})();
 const code=String.raw`
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "form_logic.h"
static long long clock_ms=1000;static int calls,posts,mode;static char submitted[4096];
static long long clock_read(void){return clock_ms;}static long long wall(void){return 1780000000123LL;}
static int local_load(char out[65]){memset(out,'b',64);out[64]=0;return 1;}
static int fixture(int port,const char*method,const char*url,const char*const h[4],const char*body,char*out,size_t cap,int timeout){
 assert(port==2333&&timeout<=55000&&!strstr(url,"LOGIN")&&!strstr(url,"/control"));calls++;
 const char*reply=NULL;if(!strcmp(url,"/api/need_token")){assert(!h&&!strcmp(method,"GET"));reply="{\"need_token\":true,\"device_token\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}";}
 else{assert(h&&strlen(h[0])==13&&strlen(h[1])==64&&strlen(h[2])==64&&strlen(h[3])==64);assert(!strcmp(h[3],"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
 if(!strcmp(url,"/api/session")){assert(!strcmp(method,"GET"));reply=mode==1?"{\"authenticated\":false}":"{\"authenticated\":true}";}
 else if(strstr(url,"cmd=Language,cr_version,wa_inner_version")){assert(!strcmp(method,"GET"));reply=mode==2?"{\"cr_version\":\"synthetic-version\"}":"{\"cr_version\":\"synthetic-version\",\"wa_inner_version\":\"synthetic-inner\"}";}
 else if(strstr(url,"cmd=RD")){assert(!strcmp(method,"GET"));reply=mode==3?"{}":"{\"RD\":\"synthetic-rd\"}";if(mode==4)clock_ms+=600001;}
 else{assert(!strcmp(url,"/api/goform/goform_set_cmd_process")&&!strcmp(method,"POST")&&timeout==55000&&body);assert(!strcmp(h[1],"EXPECTED_SIGN"));posts++;strcpy(submitted,body);if(mode==5){*out=0;return -1;}reply=mode==6?"{\"result\":\"failed\",\"error\":\"device session expired\"}":"{\"result\":\"success\"}";}}
 assert(reply);snprintf(out,cap,"%s",reply);return 200;
}
#define TF_UFI_NOW clock_read
#define TF_UFI_WALL wall
#define TF_UFI_HTTP fixture
#define TF_UFI_LOCAL_LOAD local_load
#include "sms_ufi.h"
static void reset(int selected){tf_ufi_revoke();clock_ms+=60001;mode=selected;calls=posts=0;submitted[0]=0;}
int main(void){char payload[4096];assert(tf_sms_payload(payload,sizeof payload,"+8612345678901","你好😀","26;10;16;12;30;00;+;0"));
 assert(tf_sms_ufi_submit(payload,0)==TF_SMS_AUTH&&!calls&&!posts);
 assert(tf_sms_ufi_submit("{\"action\":\"sms.send_raw\",\"params\":{\"sender\":\"4G1\",\"number\":\"10086\",\"message_hex\":\"0041\"}}",1)==TF_SMS_INVALID&&!calls);
 assert(tf_sms_ufi_submit(payload,1)==TF_SMS_SENT&&posts==1);
 assert(!strcmp(submitted,"goformId=SEND_SMS&isTest=false&sms_sender=5G&Number=%2B8612345678901&MessageBody=4F60597DD83DDE00&AD=EXPECTED_AD"));
 for(int selected=1;selected<=6;selected++){reset(selected);enum tf_sms_result r=tf_sms_ufi_submit(payload,1);assert(r==(selected==1||selected==4?TF_SMS_AUTH:selected==5?TF_SMS_UNCONFIRMED:selected==6?TF_SMS_SESSION_EXPIRED:TF_SMS_PREPARE_FAILED));assert(posts==(selected>=5));}
 assert(tf_sms_ufi_response(200,"{\"result\":0}")==TF_SMS_UNCONFIRMED);
 assert(tf_sms_ufi_response(200,"{\"result\":\"success\",\"error\":\"private value\"}")==TF_SMS_UNCONFIRMED);
 assert(tf_sms_ufi_response(200,"{\"result\":\"success\",\"error\":{\"code\":\"bad\"}}")==TF_SMS_UNCONFIRMED);
 assert(tf_sms_ufi_response(200,"{\"result\":\"success\",\"error\":null,\"error\":\"\"}")==TF_SMS_UNCONFIRMED);
 assert(tf_sms_ufi_response(200,"{\"result\":\"success\",\"error\":null,\"error_code\":\"\"}")==TF_SMS_SENT);
 char max_number[33],max_message[513],bounded[2304],ad[65];memset(max_number,'1',32);max_number[32]=0;memset(max_message,'A',512);max_message[512]=0;memset(ad,'A',64);ad[64]=0;
 assert(tf_sms_payload(payload,sizeof payload,max_number,max_message,"26;10;16;12;30;00;+;0")&&tf_sms_ufi_body(payload,ad,bounded,sizeof bounded));
 assert(tf_sms_ufi_response(400,"{\"error_code\":\"sms_sender_unsupported\"}")==TF_SMS_UNSUPPORTED);
 assert(tf_sms_ufi_response(401,"{}")==TF_SMS_AUTH);
 assert(tf_sms_ufi_response(502,"{\"result\":\"failed\"}")==TF_SMS_DEVICE_FAILED);
 assert(tf_sms_ufi_response(429,"{}")==TF_SMS_BUSY);
 assert(!strstr(tf_sms_result_message(TF_SMS_UNCONFIRMED),"private value"));tf_ufi_revoke();puts("PASS: UFI SMS panel AD/signature/form encoding and bounded single-send results; no login/retry/device I/O");return 0;}
`.replace('EXPECTED_SIGN',expectedSign).replace('EXPECTED_AD',expectedAD);
 const dir=path.join(native,'build-preview'),c=path.join(dir,'test-sms-ufi.c'),exe=path.join(dir,'test-sms-ufi.exe');fs.writeFileSync(c,code);
 const build=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),c,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const run=cp.spawnSync(exe,[],{encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);
 const http=fs.readFileSync(path.join(native,'local_http.h'),'utf8');assert.match(http,/port==2333.*goform_set_cmd_process.*application\/x-www-form-urlencoded/);
 const route=fs.readFileSync(path.join(native,'sms_ufi.h'),'utf8');assert.equal((route.match(/tf_ufi_send\("POST"/g)||[]).length,1);assert.doesNotMatch(route,/tf_http_timeout\(9460|goformId=LOGIN|Cookie:|execv\(/);
});

test('actual HTTP poll loop pumps the UI on continuously ready fragmented responses and honours cancellation',()=>{
 const http=fs.readFileSync(path.join(native,'local_http.h'),'utf8');
 const production=http.split(/\r?\n/).find(line=>line.startsWith('static int tf_poll_fd('));assert.ok(production);
 const code=String.raw`
#include <assert.h>
#include <errno.h>
#include <stdio.h>
struct pollfd{int fd;short events,revents;};
#define POLLIN 1
#define POLLHUP 16
static long long clock_ms,tf_http_hook_at,last_hook,max_gap;
static int tf_http_cancelled,polls,hooks,cancel_on_hook,expire_on_hook,timeout_mode;
static long long tf_monotonic_ms(void){return clock_ms;}
static void hook(void){hooks++;long long gap=clock_ms-last_hook;if(gap>max_gap)max_gap=gap;last_hook=clock_ms;if(cancel_on_hook)tf_http_cancelled=1;if(expire_on_hook)clock_ms+=10000;}
static void(*tf_http_wait_hook)(void)=hook;
static int poll(struct pollfd*p,int count,int ms){assert(count==1&&ms>0);polls++;clock_ms+=timeout_mode?ms:60;p->revents=p->events;return timeout_mode?0:1;}
PRODUCTION_POLL
int main(void){
 for(int i=0;i<30;i++)assert(tf_poll_fd(4,POLLIN,10000));
 assert(polls==30&&hooks>=9&&max_gap<=180);
 clock_ms+=200;cancel_on_hook=1;int count=polls;assert(!tf_poll_fd(4,POLLIN,10000)&&polls==count&&tf_http_cancelled);
 tf_http_cancelled=cancel_on_hook=0;clock_ms+=200;expire_on_hook=1;assert(!tf_poll_fd(4,POLLIN,clock_ms+1000)&&polls==count);
 expire_on_hook=0;timeout_mode=1;tf_http_hook_at=clock_ms;assert(!tf_poll_fd(4,POLLIN,clock_ms+600)&&polls>count);
 tf_http_wait_hook=NULL;timeout_mode=0;assert(tf_poll_fd(4,POLLIN,clock_ms+500));
 puts("PASS: busy UI heartbeat and power-event cancellation run despite continuous readiness; deadlines still bound response waits");return 0;}
`.replace('PRODUCTION_POLL',production);
 const c=path.join(native,'build-preview/test-http-hook.c'),exe=path.join(native,'build-preview/test-http-hook.exe');fs.writeFileSync(c,code);
 const build=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-O2','-UNDEBUG',c,'-o',exe],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const run=cp.spawnSync(exe,[],{encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);
});
