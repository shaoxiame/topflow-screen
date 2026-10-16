/* Fixed diagnostics for the existing datad SMS contract. No retries or I/O.
 * Reference: zwrt-datad 0.10.79 control.rs / sms.rs / server.rs. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_SMS_SUBMIT_H
#define TF_SMS_SUBMIT_H
#include "control_logic.h"
enum tf_sms_result {TF_SMS_UNCONFIRMED,TF_SMS_SENT,TF_SMS_AUTH,TF_SMS_SESSION_EXPIRED,TF_SMS_INVALID,TF_SMS_UNSUPPORTED,TF_SMS_DEVICE_FAILED,TF_SMS_BUSY,TF_SMS_PREPARE_FAILED};
static enum tf_sms_result tf_sms_response(int status,const char*body){
 if(status==401||status==403)return TF_SMS_AUTH;
 tf_json d;if(!body||!tf_parse(&d,body))return TF_SMS_UNCONFIRMED;
 enum tf_sms_result result=TF_SMS_UNCONFIRMED;char action[96],sender[32],code[80],message[128];long long command;
 if(!tf_gets(&d,0,"action",action,sizeof action)||strcmp(action,"sms.send_raw"))goto done;
 if(status==200){int r=tf_key(&d,0,"result");
  if(tf_control_success(body,"{\"action\":\"sms.send_raw\"}")&&tf_gets(&d,r,"sender",sender,sizeof sender)&&!strcmp(sender,"host")&&tf_int(&d,tf_key(&d,r,"status"),&command)&&command==3)result=TF_SMS_SENT;
  goto done;
 }
 int error=tf_key(&d,0,"error");if(!tf_gets(&d,error,"code",code,sizeof code))goto done;
 if(status==409&&!strcmp(code,"device_session_expired"))result=TF_SMS_SESSION_EXPIRED;
 else if(status==400&&!strcmp(code,"invalid_parameter"))result=TF_SMS_INVALID;
 else if(status==404&&!strcmp(code,"unknown_action"))result=TF_SMS_UNSUPPORTED;
 else if(status==409&&!strcmp(code,"operation_busy"))result=TF_SMS_BUSY;
 else if(status==502&&!strcmp(code,"device_call_failed")&&tf_gets(&d,error,"message",message,sizeof message)&&!strcmp(message,"zwrt_wms SMS command failed"))result=TF_SMS_DEVICE_FAILED;
 done:tf_free(&d);return result;
}
static const char*tf_sms_result_message(enum tf_sms_result result){
 switch(result){
 case TF_SMS_SENT:return "UFI 已确认短信发送成功";
 case TF_SMS_AUTH:return "短信接口拒绝授权，请在 UFI 恢复登录；未自动重试";
 case TF_SMS_SESSION_EXPIRED:return "原厂设备会话已过期，请在 UFI 恢复设备登录后重新确认发送";
 case TF_SMS_INVALID:return "短信参数被接口拒绝，请检查号码和内容；未自动重试";
 case TF_SMS_UNSUPPORTED:return "当前设备服务不支持此短信接口，请在 UFI 检查版本";
 case TF_SMS_DEVICE_FAILED:return "主基带报告短信发送失败，请检查 SIM 状态及发件记录；未自动重试";
 case TF_SMS_BUSY:return "设备正在处理上一操作，请稍后检查状态再确认发送";
 case TF_SMS_PREPARE_FAILED:return "UFI 发送校验数据未读齐，短信尚未提交；请检查面板连接";
 default:return "短信发送未确认，请检查发件记录；未自动重发";
 }
}
#endif
