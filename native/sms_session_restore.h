/* Explicit device-login recovery using the installed UFI panel's default
 * LD -> SHA256(SHA256(password) + LD) -> LOGIN flow. It never sends an SMS,
 * stores a password, changes it, or tries another login route.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_SMS_SESSION_RESTORE_H
#define TF_SMS_SESSION_RESTORE_H
#include "sms_ufi.h"
enum tf_sms_session_result {
 TF_SMS_SESSION_UNCONFIRMED,TF_SMS_SESSION_RESTORED,TF_SMS_SESSION_CANCELLED,
 TF_SMS_SESSION_INVALID,TF_SMS_SESSION_RATE_LIMITED,TF_SMS_SESSION_AUTH,
 TF_SMS_SESSION_REFUSED,TF_SMS_SESSION_UNAVAILABLE,TF_SMS_SESSION_PREPARE_FAILED
};
static long long tf_sms_session_attempt_window;
static int tf_sms_session_attempts;
static enum tf_sms_session_result tf_sms_session_response(int status,const char*body){
 if(status==401||status==403)return TF_SMS_SESSION_AUTH;
 if(status==429)return TF_SMS_SESSION_RATE_LIMITED;
 tf_json d;if(!body||!tf_parse(&d,body))return TF_SMS_SESSION_UNCONFIRMED;
 enum tf_sms_session_result result=TF_SMS_SESSION_UNCONFIRMED;int value=tf_key(&d,0,"result"),n=-1;char text[8];
 if(value>=0){if(d.t[value].type=='n'&&d.t[value].end-d.t[value].start==1)n=d.s[d.t[value].start]-'0';else if(tf_string(&d,value,text,sizeof text)&&strlen(text)==1)n=text[0]-'0';}
 /* Numeric/string 0 only, with no duplicate or contradictory error fields. */
 if(status==200&&tf_sms_ufi_no_errors(&d)){
  if(n==0)result=TF_SMS_SESSION_RESTORED;
  else if(n==1||n==3)result=TF_SMS_SESSION_REFUSED;
 }
 tf_free(&d);return result;
}
/* The caller owns the protected password input and must wipe it on every
 * return/cancel path. This function creates no plaintext password copy. */
static enum tf_sms_session_result tf_sms_session_restore(const char*password,int confirmed){
 if(!confirmed)return TF_SMS_SESSION_CANCELLED;
 if(!password)return TF_SMS_SESSION_INVALID;
 size_t length=0;while(length<=1024&&password[length])length++;
 if(!length||length>1024||strchr(password,'\r')||strchr(password,'\n'))return TF_SMS_SESSION_INVALID;
 long long now=TF_UFI_NOW();
 if(now<tf_sms_session_attempt_window||now-tf_sms_session_attempt_window>=60000){tf_sms_session_attempt_window=now;tf_sms_session_attempts=0;}
 if(tf_sms_session_attempts>=3)return TF_SMS_SESSION_RATE_LIMITED;
 char raw[4096]={0},ld[258]={0},first[65]={0},joined[323]={0},challenge[65]={0},body[256]={0};
 enum tf_sms_session_result result=TF_SMS_SESSION_PREPARE_FAILED;tf_json d;int code,valid;
 /* Hash before network waits; the form contains only the fresh challenge. */
 tf_sms_sha_upper(password,length,first);
 if(!tf_ufi_live()&&!tf_ufi_authorize_existing()){result=TF_SMS_SESSION_AUTH;goto done;}
 /* These are the same lockout fields checked by the panel. Unknown fields
  * are not interpreted as an unlocked device; vendor LOGIN remains final. */
 code=tf_ufi_send("GET","/api/goform/goform_get_cmd_process?isTest=false&cmd=psw_fail_num_str,login_lock_time",NULL,raw,sizeof raw,5000);
 if(code==401||code==403){result=TF_SMS_SESSION_AUTH;goto done;}
 if(code!=200||!tf_parse(&d,raw))goto done;
 long long remaining,locked;int lockout=tf_int(&d,tf_key(&d,0,"psw_fail_num_str"),&remaining)&&tf_int(&d,tf_key(&d,0,"login_lock_time"),&locked)&&remaining==0&&locked>0;
 valid=tf_sms_ufi_no_errors(&d);tf_free(&d);if(!valid)goto done;
 if(lockout){result=TF_SMS_SESSION_RATE_LIMITED;goto done;}
 code=tf_ufi_send("GET","/api/goform/goform_get_cmd_process?isTest=false&cmd=LD",NULL,raw,sizeof raw,5000);
 if(code==401||code==403){result=TF_SMS_SESSION_AUTH;goto done;}
 if(code!=200||!tf_parse(&d,raw))goto done;
 valid=tf_sms_ufi_no_errors(&d)&&tf_gets(&d,0,"LD",ld,sizeof ld)&&*ld&&strlen(ld)<=256;tf_free(&d);if(!valid)goto done;
 int n=snprintf(joined,sizeof joined,"%s%s",first,ld);if(n<1||(size_t)n>=sizeof joined)goto done;
 tf_sms_sha_upper(joined,(size_t)n,challenge);
 n=snprintf(body,sizeof body,"goformId=LOGIN&isTest=false&password=%s&user=admin&remember=0",challenge);if(n<1||(size_t)n>=sizeof body)goto done;
 if(!tf_ufi_live()){result=TF_SMS_SESSION_AUTH;goto done;}
 tf_sms_session_attempts++;
 /* One explicit LOGIN only. Never POST SEND_SMS, LOGOUT, update_admin_pwd,
  * LOGIN_MULTI_USER, or a datad fallback after any outcome. */
 code=tf_ufi_send("POST","/api/goform/goform_set_cmd_process",body,raw,sizeof raw,10000);
 result=tf_sms_session_response(code,raw);
 done:tf_ufi_wipe(raw,sizeof raw);tf_ufi_wipe(ld,sizeof ld);tf_ufi_wipe(first,sizeof first);tf_ufi_wipe(joined,sizeof joined);tf_ufi_wipe(challenge,sizeof challenge);tf_ufi_wipe(body,sizeof body);return result;
}
static const char*tf_sms_session_result_text(enum tf_sms_session_result result){
 switch(result){
 case TF_SMS_SESSION_RESTORED:return "设备登录已恢复，请重新确认发送";
 case TF_SMS_SESSION_CANCELLED:return "已取消恢复登录，短信未发送";
 case TF_SMS_SESSION_INVALID:return "请输入有效的原厂设备密码，短信未发送";
 case TF_SMS_SESSION_RATE_LIMITED:return "设备登录暂时受限，请稍后再试；未自动重试";
 case TF_SMS_SESSION_AUTH:return "UFI 授权未确认，设备登录未提交或被拒绝；未自动重试";
 case TF_SMS_SESSION_REFUSED:return "原厂设备密码未通过验证，请检查后重新输入";
 case TF_SMS_SESSION_PREPARE_FAILED:return "设备登录校验数据未读齐，登录尚未提交";
 case TF_SMS_SESSION_UNAVAILABLE:return "设备登录接口暂不可用，短信未发送";
 default:return "设备登录结果未确认，短信未发送；未自动重试";
 }
}
#endif
