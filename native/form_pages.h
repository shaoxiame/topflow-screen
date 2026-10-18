/* Native form pages with ASCII / offline Pinyin. No browser dependency. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_FORM_PAGES_H
#define TF_FORM_PAGES_H
#include "form_logic.h"
#include "sms_ufi.h"
#include "pinyin_logic.h"
static int form_is_guest=0,form_return_page=0;static char form_section[16]="2g";
static int traffic_op=0;
static int form_kind=0,form_field=0,keyboard_case=0,keyboard_symbols=0;
static int keyboard_chinese=0;static tf_pinyin keyboard_pinyin;
static char form_values[6][513],form_original[6][513],form_band[4]="2g",form_payload[4096];
static char form_parent[96]="settings.html";
static int form_wifi_external=0;
static uint32_t form_wifi_sync_after=0;
static int cell_form_nr;
static const char*form_label(int i){if(form_kind==5)return i==0?"PCI":i==1?(cell_form_nr?"ARFCN":"EARFCN"):"NR 频段（n）";if(form_kind==4)return traffic_op==2?"每月日期":i?"提醒比例（%）":"容量（字节）";return form_kind==1?(i?"短信内容":"收件号码"):form_kind==2?(i?"新 Wi-Fi 密码":"Wi-Fi 名称"):(i==0?"配置名称":i==1?"APN":i==2?"用户名":"新密码（留空保留）");}
static size_t form_limit(int i){if(form_kind==5)return i==1?7:i==0?4:3;if(form_kind==4)return 15;return form_kind==1?(i?512:32):form_kind==2?(i?63:32):(i==0?64:i==1?128:256);}
static int form_secret(int i){return (form_kind==2&&i==1)||(form_kind==3&&i==3);}
static void sms_session_cleanup(void);
static void form_reset(void){sms_session_cleanup();form_is_guest=form_return_page=form_wifi_external=0;form_wifi_sync_after=0;memset(form_values,0,sizeof form_values);memset(form_original,0,sizeof form_original);memset(form_payload,0,sizeof form_payload);form_field=0;keyboard_case=keyboard_symbols=keyboard_chinese=0;tf_pinyin_clear(&keyboard_pinyin);}
#include "sms_session_pages.h"
#include "apn_pages.h"
static int form_load_wifi(const char*band){tf_json d;if(!fresh_state(&d))return 0;int array=tf_key(&d,tf_key(&d,0,"wlan"),"bands"),ok=0;if(array>=0&&d.t[array].type=='[')for(int i=array+1;i<d.t[array].next;i=d.t[i].next){char b[16];if(tf_gets(&d,i,"band",b,sizeof b)&&!strcmp(b,band)){char ssid[128],enc[64];if(tf_gets(&d,i,"ssid",ssid,sizeof ssid)&&*ssid&&strlen(ssid)<=32&&tf_gets(&d,i,"enc",enc,sizeof enc)&&tf_wifi_enc_index(enc)>=0){form_reset();form_kind=2;snprintf(form_band,sizeof form_band,"%s",band);snprintf(form_section,sizeof form_section,"%s",band);snprintf(form_values[0],sizeof form_values[0],"%s",ssid);snprintf(form_values[2],sizeof form_values[2],"%s",enc);memcpy(form_original,form_values,sizeof form_values);ok=1;}break;}}tf_free(&d);return ok;}
#include "cell_form.h"
/* Refresh untouched fields from live state. Never replace text being edited. */
static void form_wifi_observe(void){
 if(form_kind!=2||form_is_guest||advanced_page!=6||pending[0]||verifying[0]||(form_wifi_sync_after&&(int32_t)(tick()-form_wifi_sync_after)<0))return;
 tf_json d;if(!fresh_state(&d))return;int a=tf_key(&d,tf_key(&d,0,"wlan"),"bands");
 if(a>=0&&d.t[a].type=='[')for(int i=a+1;i<d.t[a].next;i=d.t[i].next){char band[16],ssid[128],enc[64];
  if(!tf_gets(&d,i,"band",band,sizeof band)||strcmp(band,form_band))continue;
  if(!tf_gets(&d,i,"ssid",ssid,sizeof ssid)||!*ssid||strlen(ssid)>32||!tf_gets(&d,i,"enc",enc,sizeof enc)||tf_wifi_enc_index(enc)<0)break;
  int changed=strcmp(ssid,form_original[0])||strcmp(enc,form_original[2]);int dirty=strcmp(form_values[0],form_original[0])||strcmp(form_values[2],form_original[2])||*form_values[1];
  if(changed&&dirty)form_wifi_external=1;
  else if(!dirty){snprintf(form_values[0],513,"%s",ssid);snprintf(form_values[2],513,"%s",enc);memcpy(form_original,form_values,sizeof form_values);form_wifi_external=0;}
  break;
 }tf_free(&d);
}
/* Explicit apply rechecks the authoritative config without retaining its key. */
static int form_wifi_recheck(void){
 if(form_is_guest){
  char section[64],ssid[128],enc[160],baseline[512];int okay=(!strcmp(form_section,"guest_2g")||!strcmp(form_section,"guest_5g"))&&*form_original[0]&&strlen(form_original[0])<=32&&tf_wifi_enc_index(form_original[2])>=0&&tf_quote(section,sizeof section,form_section)&&tf_quote(ssid,sizeof ssid,form_original[0])&&tf_quote(enc,sizeof enc,form_original[2]);
  if(okay){int n=snprintf(baseline,sizeof baseline,"{\"action\":\"wifi.configure\",\"params\":{\"section\":%s,\"ssid\":%s,\"encryption\":%s}}",section,ssid,enc);okay=n>0&&(size_t)n<sizeof baseline&&guest_form_verify(baseline);}
  if(!okay)form_wifi_external=1;return okay;
 }
 char*body=malloc(32768);if(!body)return 0;const char*request="{\"action\":\"wifi.status\",\"params\":{}}";
 int okay=tf_http_timeout(9460,"POST","/control",NULL,request,body,32768,2500)==200&&tf_control_success(body,request);tf_json d;
 if(okay){okay=tf_parse(&d,body);if(okay){char section[24],ssid[128],enc[64];snprintf(section,sizeof section,"main_%s",form_band);int item=tf_key(&d,tf_key(&d,0,"result"),section);okay=tf_gets(&d,item,"ssid",ssid,sizeof ssid)&&tf_gets(&d,item,"encryption",enc,sizeof enc)&&!strcmp(ssid,form_original[0])&&!strcmp(enc,form_original[2]);tf_free(&d);}}
 volatile unsigned char*w=(volatile unsigned char*)body;for(int i=0;i<32768;i++)w[i]=0;free(body);if(!okay)form_wifi_external=1;return okay;
}
static void form_render(void){
 if(sms_session_ui.stage){sms_session_render();return;}
 form_wifi_observe();
 if(advanced_page==7){
  advanced_n=0;char value[4096];const char*raw=form_values[form_field];
  if(form_secret(form_field)){char mask[128];size_t n=strlen(raw);if(n>63)n=63;memset(mask,'*',n);mask[n]=0;esc(value,sizeof value,mask);}
  else{size_t length=strlen(raw);const char*tail=raw;if(length>90){tail=raw+length-90;while(((unsigned char)*tail&0xc0)==0x80)tail++;}esc(value,sizeof value,tail);}
  int chinese=keyboard_chinese&&!keyboard_symbols&&!form_secret(form_field);
  if(form_kind==5){advanced_shell_frame(form_label(form_field),"act:edit-done",0);ah("<div class='card tf-input-preview'>%s<span style='color:#4987ff'>|</span></div><p class='note'>仅输入数字 · 完成后检查参数</p><table style='width:100%%;border-spacing:5px;table-layout:fixed'>",value);const char*keys[]={"1","2","3","4","5","6","7","8","9","退格","0","完成"};for(int i=0;i<12;i++){if(!(i%3))ah("<tr>");char action[32];if(i==9)snprintf(action,sizeof action,"key-backspace");else if(i==11)snprintf(action,sizeof action,"edit-done");else snprintf(action,sizeof action,"key:%d",keys[i][0]);ah("<td style='width:33.33%%'><a class='button secondary' href='act:%s' style='height:48px;line-height:48px;font-size:%dpx'>%s</a></td>",action,i==9||i==11?14:24,keys[i]);if(i%3==2)ah("</tr>");}ah("</table></div></body></html>");return;}
  advanced_shell_frame(form_label(form_field),"act:edit-done",0);ah("<div class='card tf-input-preview'>%s<span style='color:#4987ff'>|</span></div><p class='note' style='margin:4px 0'>%zu / %zu 字节 · %s</p>",value,strlen(raw),form_limit(form_field),chinese?"逐字拼音 · v 代表 ü":"英文、数字与符号");
  if(chinese){
   unsigned count=tf_pinyin_count(&keyboard_pinyin),begin=keyboard_pinyin.page*6;
   if(begin>=count){keyboard_pinyin.page=0;begin=0;}
   ah("<div style='height:24px;font-size:16px;color:#4987ff'>%s</div><table style='width:100%%;border-spacing:2px;table-layout:fixed'><tr>",*keyboard_pinyin.letters?keyboard_pinyin.letters:"输入拼音，点击候选字");
   for(unsigned j=0;j<6;j++){char c[4];if(tf_pinyin_candidate(&keyboard_pinyin,begin+j,c))ah("<td style='width:14%%'><a class='button secondary' href='act:py:%u' style='padding:0;min-height:34px;height:34px;line-height:34px;font-size:19px'>%s</a></td>",begin+j,c);else ah("<td style='width:14%%'></td>");}
   ah("<td style='width:16%%'><a class='button secondary' href='act:py-next' style='padding:0;min-height:34px;height:34px;line-height:34px'>›</a></td></tr></table>");
  }else ah("<div class='note' style='height:56px;padding-top:12px'>%s</div>",form_secret(form_field)?"密码仅留在本次内存草稿":"点击「中 / 英」可输入中文");
  const char*letters="qwertyuiopasdfghjklzxcvbnm",*symbols="1234567890!@#$%%^&*()_-+=.,:;?/@[]{}\\|<>~`'\"";
  const char*chars=keyboard_symbols?(symbols+(keyboard_symbols==2?30:0)):letters;int length=(int)strlen(chars);if(length>30)length=30;
  ah("<table style='width:100%%;border-spacing:2px;table-layout:fixed'>");
  for(int i=0;i<length;i++){if(i%10==0)ah("<tr>");unsigned c=(unsigned char)chars[i];if(!keyboard_symbols&&keyboard_case&&!chinese)c=(unsigned)toupper((int)c);char letter[2]={(char)c,0},safe[16];esc(safe,sizeof safe,letter);ah("<td style='width:10%%'><a class='button secondary' href='act:key:%u' style='padding:0;height:31px;min-height:31px;line-height:31px;font-size:14px'>%s</a></td>",c,safe);if(i%10==9)ah("</tr>");}if(length%10)ah("</tr>");
  ah("</table><table style='width:100%%;border-spacing:3px;margin-top:3px'><tr><td style='width:20%%'><a class='button secondary' href='act:key-language' style='padding:0;font-size:12px'>中 / 英</a></td><td style='width:20%%'><a class='button secondary' href='act:key-case' style='padding:0;font-size:12px'>大写</a></td><td style='width:20%%'><a class='button secondary' href='act:key-symbols' style='padding:0;font-size:12px'>%s</a></td><td style='width:20%%'><a class='button secondary' href='act:key:32' style='padding:0;font-size:12px'>空格</a></td><td style='width:20%%'><a class='button secondary' href='act:key-backspace' style='padding:0;font-size:12px'>退格</a></td></tr></table><a class='button' href='act:edit-done' style='margin-top:5px'>完成输入</a><p class='note' style='margin:3px 0 0'>离线输入 · 不记录键入内容</p></div></body></html>",keyboard_symbols==2?"字母":keyboard_symbols==1?"更多":"123");return;
 }
 if(form_kind==4){traffic_form_render();return;}
 if(form_kind==5){cell_form_render();return;}
 advanced_shell(form_kind==1?"发送短信 · 主卡":form_kind==2?"Wi-Fi 配置":"编辑当前卡 APN");
 if(form_kind==2&&!form_is_guest){
  const tf_wifi_state*ws=wifi_observed();int configured=tf_wifi_configured(ws,form_band,tick());const char*label=tf_wifi_status_label(tf_wifi_status(ws,form_band,tick()));
  if(configured>=0&&ws->busy==0&&ws->module_user_enabled!=0)ah("<a class='button secondary' href='act:%s' style='margin-bottom:8px'>%s · %s · 点击%s</a>",!strcmp(form_band,"2g")?"wifi24":"wifi5",!strcmp(form_band,"2g")?"2.4 GHz":"5 GHz",label,configured?"关闭":"开启");
  else ah("<div class='hint'>%s · %s%s</div>",!strcmp(form_band,"2g")?"2.4 GHz":"5 GHz",label,ws->module_user_enabled==0?" · UFI 总开关关闭":"");
  if(form_wifi_external)ah("<div class='hint'>UFI 配置已变化，已保留本地输入。请先读取当前配置，再确认修改。</div><a class='button secondary' href='act:wifi-reload' style='margin-bottom:8px'>读取 UFI 当前配置</a>");
 }
 for(int i=0;i<(form_kind==3?4:2);i++){char value[4096];if(form_secret(i))snprintf(value,sizeof value,"%s",*form_values[i]?"已输入新密码":"留空保留原密码");else esc(value,sizeof value,*form_values[i]?form_values[i]:"点击输入");ah("<a class='tf-field' href='act:edit:%d'><span class='tf-field-label'>%s</span><span class='tf-field-value'>%s</span></a>",i,form_label(i),value);}
 if(form_kind==1)ah("<p class='note'>通过 UFI 面板的现有短信接口，由 5G 主卡发送。正文支持中文拼音、英文、数字与符号，最大 512 字节。确认后仅发送一次。</p>");
 else if(form_kind==2){ah("<div class='card'><b>加密方式</b>");const char*labels[]={"开放网络","WPA2","WPA2 / WPA3","WPA3","WPA / WPA2","WPA2 兼容","WPA 混合"};ah("<table style='width:100%%;table-layout:fixed;border-spacing:5px;margin-top:6px'>");for(int i=0;i<7;i++){if(i%2==0)ah("<tr>");ah("<td style='width:50%%'><a class='button %s' href='act:wifi-enc:%d' style='font-size:11px'>%s</a></td>",!strcmp(form_values[2],tf_wifi_enc[i])?"":"secondary",i,labels[i]);if(i%2==1)ah("</tr>");}ah("<td></td></tr></table>");ah("</div><p class='note'>仅提交变化项。SSID 最多 32 字节，密码 8–63 字节；空密码保留原值。修改会使当前 Wi-Fi 客户端断线。</p>");}
 if(form_kind==3){const char*auth[]={"无认证","PAP","CHAP","PAP + CHAP"},*pdp[]={"IPv4","IPv6","IPv4 / IPv6"};ah("<div class='card'><b>认证方式</b>");ah("<table style='width:100%%;table-layout:fixed;border-spacing:5px;margin-top:6px'>");for(int i=0;i<4;i++){if(i%2==0)ah("<tr>");ah("<td style='width:50%%'><a class='button %s' href='act:apn-auth:%d'>%s</a></td>",atoi(form_values[4])==i?"":"secondary",i,auth[i]);if(i%2==1)ah("</tr>");}ah("</table>");ah("<h3 style='margin-top:12px'>地址类型</h3>");ah("<table style='width:100%%;table-layout:fixed;border-spacing:5px;margin-top:6px'><tr>");for(int i=1;i<=3;i++)ah("<td style='width:33.33%%'><a class='button %s' href='act:apn-pdp:%d' style='font-size:10px'>%s</a></td>",atoi(form_values[5])==i?"":"secondary",i,i==3?"双栈":pdp[i-1]);ah("</tr></table>");ah("</div><a class='button secondary' href='act:apn-clear-password' style='margin-top:7px'>%s原 APN 密码</a><p class='note'>空密码保留原值；如需清除必须明确选择。配置只保存在本次内存草稿。</p>",apn_clear_password?"已选清除 · 点击保留":"点击明确清除");}
 ah("<a class='button' href='act:form-apply' style='margin-top:10px'>检查并确认%s</a>",form_kind==1?"发送":"修改");if(form_kind==1)sms_session_entry();ah("</div></body></html>");
}
static int form_action(const char*a){
 if(sms_session_action(a))return 1;
 if(!strncmp(a,"cell-manual:",12)){if(strlen(a+12)==1&&(a[12]=='0'||a[12]=='1'))return cell_form_open(a[12]-'0');return 1;}
 if(apn_action(a))return 1;
 if(!strcmp(a,"sms-compose")){form_reset();form_kind=1;snprintf(form_parent,sizeof form_parent,"subpages/sms.html");advanced_page=6;scroll_y=0;return 1;}
 if(!strncmp(a,"wifi-edit:",10)){if(strcmp(a+10,"2g")&&strcmp(a+10,"5g"))return 1;int parent=advanced_page==22?22:0;if(!form_load_wifi(a+10)){show_notice("Wi-Fi 配置未知或不受支持，未打开编辑");return 1;}snprintf(form_parent,sizeof form_parent,"settings.html");form_return_page=parent;advanced_page=6;scroll_y=0;return 1;}
 if(!strcmp(a,"wifi-reload")){if(advanced_page==6&&form_kind==2&&!form_is_guest){char band[4];strcpy(band,form_band);int parent=form_return_page;if(form_load_wifi(band)){form_return_page=parent;show_notice("已读取当前配置，本地草稿已清除");}else show_notice("当前配置未读到，保留本地草稿");}return 1;}
 if(!strcmp(a,"edit-done")){if(advanced_page==7){tf_pinyin_clear(&keyboard_pinyin);advanced_page=6;scroll_y=0;}return 1;}
 if(!strncmp(a,"edit:",5)){if(advanced_page==6&&strlen(a+5)==1&&a[5]>='0'&&a[5]<(form_kind==3?'4':form_kind==5&&cell_form_nr?'3':'2')){form_field=a[5]-'0';tf_pinyin_clear(&keyboard_pinyin);keyboard_chinese=!form_secret(form_field)&&((form_kind==1&&form_field==1)||(form_kind==2&&form_field==0));keyboard_symbols=keyboard_case=0;advanced_page=7;scroll_y=0;}return 1;}
 if(!strncmp(a,"py:",3)){if(advanced_page==7&&keyboard_chinese&&!keyboard_symbols){char*end;unsigned long index=strtoul(a+3,&end,10);if(!*end&&index<=10000&&!tf_pinyin_commit(&keyboard_pinyin,(unsigned)index,form_values[form_field],sizeof form_values[0],form_limit(form_field)))show_notice("候选字不可用或输入已达长度上限");}return 1;}
 if(!strcmp(a,"py-next")){if(advanced_page==7&&keyboard_chinese){unsigned count=tf_pinyin_count(&keyboard_pinyin);keyboard_pinyin.page=count?(keyboard_pinyin.page+1)%((count+5)/6):0;}return 1;}
 if(!strcmp(a,"key-language")){if(advanced_page==7&&form_kind!=5&&!form_secret(form_field)){keyboard_chinese=!keyboard_chinese;keyboard_symbols=keyboard_case=0;tf_pinyin_clear(&keyboard_pinyin);}return 1;}
 if(!strncmp(a,"key:",4)){char*end;long c=strtol(a+4,&end,10);if(advanced_page==7&&!*end){if(form_kind==5&&(c<'0'||c>'9'))return 1;if(keyboard_chinese&&!keyboard_symbols&&!form_secret(form_field)&&c>='a'&&c<='z'){if(!tf_pinyin_push(&keyboard_pinyin,(unsigned)c))show_notice("请逐字输入拼音，先选择当前候选字");}else if(keyboard_chinese&&*keyboard_pinyin.letters&&c==32){if(!tf_pinyin_commit(&keyboard_pinyin,keyboard_pinyin.page*6,form_values[form_field],sizeof form_values[0],form_limit(form_field)))show_notice("请补全拼音或点击候选字");}else if(!tf_ascii_append(form_values[form_field],sizeof form_values[0],(unsigned)c,form_limit(form_field)))show_notice("输入已达长度上限");}return 1;}
 if(!strcmp(a,"key-case")){if(advanced_page==7){keyboard_case=!keyboard_case;keyboard_chinese=0;tf_pinyin_clear(&keyboard_pinyin);}return 1;}
 if(!strcmp(a,"key-symbols")){if(advanced_page==7){keyboard_symbols=(keyboard_symbols+1)%3;tf_pinyin_clear(&keyboard_pinyin);}return 1;}
 if(!strcmp(a,"key-backspace")){if(advanced_page==7){if(*keyboard_pinyin.letters)tf_pinyin_backspace(&keyboard_pinyin);else tf_utf8_backspace(form_values[form_field]);}return 1;}
 if(!strncmp(a,"wifi-enc:",9)){if(advanced_page==6&&form_kind==2&&strlen(a+9)==1&&a[9]>='0'&&a[9]<='6')snprintf(form_values[2],sizeof form_values[2],"%s",tf_wifi_enc[a[9]-'0']);return 1;}
 if(!strcmp(a,"form-apply")){if(advanced_page!=6||!control_guard())return 1;if(form_kind==5)return cell_form_prepare();int ok=0;if(form_kind==1){time_t now=time(NULL);struct tm tm;localtime_r(&now,&tm);char stamp[64];strftime(stamp,sizeof stamp,"%y;%m;%d;%H;%M;00;+;0",&tm);ok=tf_sms_payload(form_payload,sizeof form_payload,form_values[0],form_values[1],stamp);if(ok)snprintf(pending_label,sizeof pending_label,"通过 5G 主卡向 %s 发送以下短信：\n%s\n发送可能产生运营商费用。仅提交一次，结果未确认时请检查记录，不要立即重发。",form_values[0],form_values[1]);}
  else if(form_kind==2){ok=tf_wifi_payload(form_payload,sizeof form_payload,form_section,form_values[0],form_values[1],form_values[2],form_original[0],form_original[2]);if(ok)snprintf(pending_label,sizeof pending_label,"修改 %s Wi-Fi：名称 %s；加密 %s；%s。Wi-Fi 可能断开，密码不会显示在确认页面。",form_band,form_values[0],form_values[2],*form_values[1]?"更新密码":"保留原密码");}
  else if(form_kind==3){ok=apn_payload(form_payload,sizeof form_payload);if(ok)snprintf(pending_label,sizeof pending_label,"修改当前卡 APN %s：%s。%s密码。可能重新拨号；提交后回读状态。",form_values[0],form_values[1],apn_clear_password?"清除":*form_values[3]?"更新":"保留");}
  if(!ok){show_notice("输入无效或没有变化，请检查字段要求");memset(form_payload,0,sizeof form_payload);return 1;}strcpy(pending,"@form");scroll_y=0;return 1;}return 0;
}
static int form_confirm(void){
 if(sms_session_confirm())return 1;
 if(cell_form_confirm())return 1;int apn=!strcmp(pending,"@apn");if(!apn&&strcmp(pending,"@form"))return 0;pending[0]=0;
 if(!control_guard()){memset(form_payload,0,sizeof form_payload);return 1;}
 if(apn||form_kind==3){apn_submit();return 1;}
 if(form_kind!=1){
  show_busy("正在核对当前 Wi-Fi 配置");
  if(!form_wifi_recheck()||tf_http_cancelled||!control_guard()||(!form_is_guest&&(!wifi_status_read_now()||wifi_observed()->busy!=0))){memset(form_payload,0,sizeof form_payload);show_notice("Wi-Fi 配置已变化、正在应用或读取失败；本地输入已保留，未提交");return 1;}
 }
 show_busy(form_kind==1?"正在发送短信，请勿重复提交":"正在更新 Wi-Fi 配置");
 if(tf_http_cancelled||!control_guard()){memset(form_payload,0,sizeof form_payload);return 1;}
 char response[16384];int accepted=0;
 if(form_kind==1){
  enum tf_sms_result sent=tf_sms_ufi_submit(form_payload,1);accepted=sent==TF_SMS_SENT;sms_session_observe(sent);show_notice(tf_sms_result_message(sent));if(accepted)memset(form_values[1],0,sizeof form_values[1]);
 }else{
  accepted=tf_http_timeout(9460,"POST","/control",NULL,form_payload,response,sizeof response,10000)==200&&tf_control_success(response,form_payload);
  tf_json d;int verified=0;if(accepted&&tf_parse(&d,response)){verified=tf_bool(&d,tf_key(&d,tf_key(&d,0,"result"),"verified"))==1;tf_free(&d);}
  if(verified){
   int same=!form_is_guest||guest_form_verify(form_payload);
   show_notice(same?(form_is_guest?"访客 Wi-Fi 配置已回读确认":"Wi-Fi 配置已保存并回读确认；广播状态见当前页面"):"访客 Wi-Fi 回读未确认；未自动重试");
   if(same){memset(form_values[1],0,sizeof form_values[1]);memcpy(form_original,form_values,sizeof form_values);form_wifi_external=0;form_wifi_sync_after=tick()+5000;}
  }else show_notice("Wi-Fi 修改未确认，请检查当前状态；未自动重试");
  wifi_status_invalidate();
 }
 snprintf(verification_message,sizeof verification_message,"%s",notice);memset(response,0,sizeof response);memset(form_payload,0,sizeof form_payload);scroll_y=0;return 1;
}
#endif
