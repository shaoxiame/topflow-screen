/* Existing UFI tag vocabulary; missing tags are never guessed. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_SMS_LOGIC_H
#define TF_SMS_LOGIC_H
static int tf_sms_direction(int tag){return tag==0||tag==1?1:tag==2||tag==3?2:0;}
static int tf_sms_filter_match(int filter,int tag,int unread){return filter==0||(filter==1&&tf_sms_direction(tag)==1)||(filter==2&&tf_sms_direction(tag)==2)||(filter==3&&unread==1);}
static const char*tf_sms_status(int tag,int unread){return tag==3?"发送失败":tag==2?"已发送":tag==1?"收到 · 未读":tag==0?"收到 · 已读":unread==1?"未读 · 方向未知":"方向未知";}
#endif
