/* The same bounded SMS route/AD flow as the installed UFI panel. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Existing local session only: no LOGIN, cookie export, fallback send or retry. */
#ifndef TF_SMS_UFI_H
#define TF_SMS_UFI_H
#include "ufi_auth.h"
#include "sms_submit.h"
static int tf_sms_ufi_no_errors(const tf_json*d){int seen=0;if(d->t[0].type!='{')return 0;for(int i=1;i<d->t[0].next;i=d->t[i+1].next){char key[32];if(!tf_string(d,i,key,sizeof key))continue;int bit=!strcmp(key,"error")?1:!strcmp(key,"error_code")?2:0;if(bit){if((seen&bit)||!tf_no_error(d,i+1))return 0;seen|=bit;}}return 1;}
static enum tf_sms_result tf_sms_ufi_response(int status,const char*body){
 if(status==401||status==403)return TF_SMS_AUTH;
 tf_json d;if(!body||!tf_parse(&d,body))return TF_SMS_UNCONFIRMED;
 char result[32]="",error[128]="",code[80]="";tf_gets(&d,0,"result",result,sizeof result);tf_gets(&d,0,"error",error,sizeof error);tf_gets(&d,0,"error_code",code,sizeof code);
 enum tf_sms_result answer=TF_SMS_UNCONFIRMED;
 if(status==200&&!strcmp(result,"success")&&tf_sms_ufi_no_errors(&d))answer=TF_SMS_SENT;
 else if(!strcmp(error,"device session expired")||!strcmp(code,"device_session_expired"))answer=TF_SMS_SESSION_EXPIRED;
 else if(!strcmp(code,"sms_sender_unsupported")||!strcmp(code,"sms_current_sim_only"))answer=TF_SMS_UNSUPPORTED;
 else if(status==400)answer=TF_SMS_INVALID;
 else if(status==429||!strcmp(code,"operation_busy"))answer=TF_SMS_BUSY;
 else if(!strcmp(result,"failed"))answer=TF_SMS_DEVICE_FAILED;
 tf_free(&d);return answer;
}
static void tf_sms_sha_upper(const void*data,size_t length,char out[65]){unsigned char digest[32];tf_digest(data,length,digest,0);tf_hex(digest,32,out);for(int i=0;i<64;i++)out[i]=(char)toupper((unsigned char)out[i]);tf_ufi_wipe(digest,sizeof digest);}
/* Parse only the internally generated, host-only draft. Encoding of '+' is
 * essential: application/x-www-form-urlencoded otherwise changes it to space. */
static int tf_sms_ufi_body(const char*payload,const char*ad,char*out,size_t cap){
 tf_json d;if(!tf_ufi_hex64(ad)||!tf_parse(&d,payload))return 0;
 char action[64],sender[16],number[34],message[2050];int p=tf_key(&d,0,"params");
 int okay=tf_gets(&d,0,"action",action,sizeof action)&&!strcmp(action,"sms.send_raw")&&tf_gets(&d,p,"sender",sender,sizeof sender)&&!strcmp(sender,"host")&&tf_gets(&d,p,"number",number,sizeof number)&&tf_gets(&d,p,"message_hex",message,sizeof message);
 tf_free(&d);size_t n=okay?strlen(number):0,m=okay?strlen(message):0;okay=okay&&n>=3&&n<=32&&m>0&&m<=2048&&m%4==0;
 for(size_t i=0;okay&&i<n;i++)if(!(i==0&&number[i]=='+')&&!isdigit((unsigned char)number[i]))okay=0;
 for(size_t i=0;okay&&i<m;i++)if(!isxdigit((unsigned char)message[i]))okay=0;
 if(okay){int written=snprintf(out,cap,"goformId=SEND_SMS&isTest=false&sms_sender=5G&Number=%s%s&MessageBody=%s&AD=%s",number[0]=='+'?"%2B":"",number+(number[0]=='+'),message,ad);okay=written>0&&(size_t)written<cap;}
 tf_ufi_wipe(number,sizeof number);tf_ufi_wipe(message,sizeof message);if(!okay&&cap)out[0]=0;return okay;
}
static enum tf_sms_result tf_sms_ufi_submit(const char*payload,int confirmed){
 if(!confirmed)return TF_SMS_AUTH;
 char raw[8192]={0},version[257]={0},inner[257]={0},rd[257]={0},joined[577]={0},first[65]={0},ad[65]={0},body[2304]={0};
 enum tf_sms_result result=TF_SMS_PREPARE_FAILED;tf_json d;int code;
 /* Validate the draft before opening a session or reading a challenge. */
 memset(ad,'0',64);if(!tf_sms_ufi_body(payload,ad,body,sizeof body)){result=TF_SMS_INVALID;goto done;}
 if(!tf_ufi_live()&&!tf_ufi_authorize_existing()){result=TF_SMS_AUTH;goto done;}
 code=tf_ufi_send("GET","/api/session",NULL,raw,sizeof raw,5000);int authenticated=0;
 if(code==200&&tf_parse(&d,raw)){authenticated=tf_bool(&d,tf_key(&d,0,"authenticated"))==1;tf_free(&d);}
 if(!authenticated){tf_ufi_revoke();result=TF_SMS_AUTH;goto done;}
 code=tf_ufi_send("GET","/api/goform/goform_get_cmd_process?isTest=false&cmd=Language,cr_version,wa_inner_version",NULL,raw,sizeof raw,5000);
 if(code==401||code==403){result=TF_SMS_AUTH;goto done;}
 if(code!=200||!tf_parse(&d,raw))goto done;
 int valid=tf_gets(&d,0,"cr_version",version,sizeof version)&&*version&&tf_gets(&d,0,"wa_inner_version",inner,sizeof inner)&&*inner;tf_free(&d);if(!valid)goto done;
 int length=snprintf(joined,sizeof joined,"%s%s",inner,version);if(length<1||(size_t)length>=sizeof joined)goto done;tf_sms_sha_upper(joined,(size_t)length,first);
 code=tf_ufi_send("GET","/api/goform/goform_get_cmd_process?isTest=false&cmd=RD",NULL,raw,sizeof raw,5000);
 if(code==401||code==403){result=TF_SMS_AUTH;goto done;}if(code!=200||!tf_parse(&d,raw))goto done;valid=tf_gets(&d,0,"RD",rd,sizeof rd)&&*rd;tf_free(&d);if(!valid)goto done;
 length=snprintf(joined,sizeof joined,"%s%s",first,rd);if(length<1||(size_t)length>=sizeof joined)goto done;tf_sms_sha_upper(joined,(size_t)length,ad);
 if(!tf_sms_ufi_body(payload,ad,body,sizeof body)){result=TF_SMS_INVALID;goto done;}
 if(!tf_ufi_live()){result=TF_SMS_AUTH;goto done;}
 /* Exactly one business POST. Never replay via datad after any outcome. */
 code=tf_ufi_send("POST","/api/goform/goform_set_cmd_process",body,raw,sizeof raw,55000);result=tf_sms_ufi_response(code,raw);
 done:tf_ufi_wipe(raw,sizeof raw);tf_ufi_wipe(version,sizeof version);tf_ufi_wipe(inner,sizeof inner);tf_ufi_wipe(rd,sizeof rd);tf_ufi_wipe(joined,sizeof joined);tf_ufi_wipe(first,sizeof first);tf_ufi_wipe(ad,sizeof ad);tf_ufi_wipe(body,sizeof body);return result;
}
#endif
