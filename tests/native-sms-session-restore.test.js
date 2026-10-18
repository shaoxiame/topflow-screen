'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),native=path.join(root,'native');

test('explicit SMS session restoration follows UFI LD/LOGIN once, without sending or persisting credentials',()=>{
 const password='synthetic &"\\ pass',sha=s=>crypto.createHash('sha256').update(s).digest('hex').toUpperCase();
 const expected=sha(sha(password)+'fixture-LD');
 const code=String.raw`
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "control_logic.h"
static long long clock_ms=100000;static int calls,posts,mode;static char submitted[512];
static long long clock_read(void){return clock_ms;}
static long long wall(void){return 1780000000123LL;}
static int local_load(char out[65]){memset(out,'b',64);out[64]=0;return 1;}
static int fixture(int port,const char*method,const char*url,const char*const h[4],const char*body,char*out,size_t cap,int timeout){
 assert(port==2333&&timeout<=10000);calls++;const char*reply=NULL;int status=200;
 if(!strcmp(url,"/api/need_token")){assert(!h&&!strcmp(method,"GET"));reply="{\"need_token\":true,\"device_token\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}";}
 else{
  assert(h&&strlen(h[0])==13&&strlen(h[1])==64&&strlen(h[2])==64&&strlen(h[3])==64);
  assert(!strcmp(h[3],"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
  if(!strcmp(url,"/api/session")){assert(!strcmp(method,"GET"));reply=mode==1?"{\"authenticated\":false}":"{\"authenticated\":true}";}
  else if(!strcmp(url,"/api/goform/goform_get_cmd_process?isTest=false&cmd=psw_fail_num_str,login_lock_time")){
   assert(!strcmp(method,"GET")&&timeout==5000);reply=mode==2?"{\"psw_fail_num_str\":\"0\",\"login_lock_time\":\"90\"}":mode==3?"not-json":mode==14?"{}":"{\"psw_fail_num_str\":\"5\",\"login_lock_time\":\"0\"}";
  }else if(!strcmp(url,"/api/goform/goform_get_cmd_process?isTest=false&cmd=LD")){
   assert(!strcmp(method,"GET")&&timeout==5000);reply=mode==4?"{}":mode==13?"{\"LD\":\"a\",\"LD\":\"b\"}":"{\"LD\":\"fixture-LD\"}";
   if(mode==5)status=403;if(mode==6)clock_ms+=600001;
  }else{
   assert(!strcmp(url,"/api/goform/goform_set_cmd_process")&&!strcmp(method,"POST")&&timeout==10000&&body);
   assert(!strstr(body,"synthetic")&&!strstr(body,"SEND_SMS")&&!strstr(body,"MULTI")&&!strstr(body,"remember=1"));
   posts++;snprintf(submitted,sizeof submitted,"%s",body);
   reply=mode==7?"{\"result\":\"1\"}":mode==8?"{\"result\":3}":mode==9?"{\"result\":0,\"error\":\"private-secret\"}":"{\"result\":\"0\"}";
   if(mode==10){*out=0;return -1;}if(mode==11)status=401;if(mode==12)status=429;
  }
 }
 assert(reply);snprintf(out,cap,"%s",reply);return status;
}
#define TF_UFI_NOW clock_read
#define TF_UFI_WALL wall
#define TF_UFI_HTTP fixture
#define TF_UFI_LOCAL_LOAD local_load
#include "sms_session_restore.h"
static const char password[]="synthetic &\"\\ pass";
static void reset(int selected){tf_ufi_revoke();clock_ms+=60001;mode=selected;calls=posts=0;submitted[0]=0;tf_sms_session_attempts=0;tf_sms_session_attempt_window=clock_ms;}
int main(void){
 reset(0);assert(tf_sms_session_restore(password,0)==TF_SMS_SESSION_CANCELLED&&!calls&&!posts);
 const char*invalid[]={NULL,"","line\nbreak","line\rbreak"};for(int i=0;i<4;i++)assert(tf_sms_session_restore(invalid[i],1)==TF_SMS_SESSION_INVALID&&!calls&&!posts);
 char excessive[1026];memset(excessive,'x',1025);excessive[1025]=0;assert(tf_sms_session_restore(excessive,1)==TF_SMS_SESSION_INVALID&&!calls);
 assert(tf_sms_session_restore(password,1)==TF_SMS_SESSION_RESTORED&&posts==1&&calls==5&&tf_ufi_live());
 assert(!strcmp(submitted,"goformId=LOGIN&isTest=false&password=EXPECTED_CHALLENGE&user=admin&remember=0"));
 assert(strstr(tf_sms_session_result_text(TF_SMS_SESSION_RESTORED),"重新确认发送"));
 const enum tf_sms_session_result outcomes[]={TF_SMS_SESSION_AUTH,TF_SMS_SESSION_RATE_LIMITED,TF_SMS_SESSION_PREPARE_FAILED,TF_SMS_SESSION_PREPARE_FAILED,TF_SMS_SESSION_AUTH,TF_SMS_SESSION_AUTH,TF_SMS_SESSION_REFUSED,TF_SMS_SESSION_REFUSED,TF_SMS_SESSION_UNCONFIRMED,TF_SMS_SESSION_UNCONFIRMED,TF_SMS_SESSION_AUTH,TF_SMS_SESSION_RATE_LIMITED,TF_SMS_SESSION_PREPARE_FAILED,TF_SMS_SESSION_RESTORED};
 for(int m=1;m<=14;m++){reset(m);assert(tf_sms_session_restore(password,1)==outcomes[m-1]);assert(posts==((m>=7&&m<=12)||m==14));}
 reset(7);for(int i=0;i<3;i++)assert(tf_sms_session_restore(password,1)==TF_SMS_SESSION_REFUSED);
 int seen=calls;assert(posts==3&&tf_sms_session_restore(password,1)==TF_SMS_SESSION_RATE_LIMITED&&posts==3&&calls==seen);
 clock_ms+=60000;assert(tf_sms_session_restore(password,1)==TF_SMS_SESSION_REFUSED&&posts==4);
 assert(tf_sms_session_response(200,"{\"result\":0}")==TF_SMS_SESSION_RESTORED);
 assert(tf_sms_session_response(200,"{\"result\":\"0\",\"error\":null,\"error_code\":\"\"}")==TF_SMS_SESSION_RESTORED);
 const char*ambiguous[]={"{\"result\":true}","{\"result\":\"00\"}","{\"result\":-0}","{\"result\":0.0}","{\"result\":0,\"result\":0}","{\"result\":0,\"error\":null,\"error\":null}","{\"result\":0,\"error_code\":\"bad\"}","{\"result\":\"success\"}","[]","bad-json"};
 for(unsigned i=0;i<sizeof ambiguous/sizeof ambiguous[0];i++)assert(tf_sms_session_response(200,ambiguous[i])==TF_SMS_SESSION_UNCONFIRMED);
 assert(tf_sms_session_response(500,"{\"result\":0}")==TF_SMS_SESSION_UNCONFIRMED);
 for(int i=TF_SMS_SESSION_UNCONFIRMED;i<=TF_SMS_SESSION_PREPARE_FAILED;i++)assert(!strstr(tf_sms_session_result_text(i),"private-secret"));
 tf_ufi_revoke();puts("PASS: explicit UFI LD/LOGIN, exact uppercase challenge, lockout/rate cap and strict receipts; no SMS, fallback, cookie/password persistence or device I/O");return 0;
}
`.replace('EXPECTED_CHALLENGE',expected);
 const dir=path.join(native,'build-preview');fs.mkdirSync(dir,{recursive:true});const c=path.join(dir,'test-sms-session-restore.c'),exe=path.join(dir,'test-sms-session-restore.exe');fs.writeFileSync(c,code);
 const build=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),c,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const run=cp.spawnSync(exe,[],{encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);
 const source=fs.readFileSync(path.join(native,'sms_session_restore.h'),'utf8');
 assert.equal((source.match(/tf_ufi_send\("POST"/g)||[]).length,1);
 assert.doesNotMatch(source,/tf_http_timeout\(9460|goformId=LOGIN_MULTI_USER|goformId=SEND_SMS|tf_sms_ufi_submit\(|tf_ufi_send\("POST","\/api\/update_admin_pwd/);
 for(const name of ['raw','ld','first','joined','challenge','body'])assert.ok(source.includes(`tf_ufi_wipe(${name},sizeof ${name})`),`${name} erased on return`);
 assert.match(source,/remember=0/);
});
