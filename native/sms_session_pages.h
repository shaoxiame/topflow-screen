/* In-screen vendor session recovery. Password is private RAM only; recovery
 * never sends/replays an SMS. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_SMS_SESSION_PAGES_H
#define TF_SMS_SESSION_PAGES_H
#include "sms_session_restore.h"
typedef struct {char password[1025];int stage,uppercase,symbols;} tf_sms_session_draft;
_Static_assert(sizeof(tf_sms_session_draft)<=4096,"session draft fits one private page");
_Alignas(4096) static union {tf_sms_session_draft value;unsigned char pages[4096];} sms_session_storage;
#define sms_session_ui (sms_session_storage.value)
static int sms_session_memory_ready,sms_session_needed;
static void sms_session_cleanup(void){
 tf_ufi_wipe(&sms_session_storage,sizeof sms_session_storage);
#if defined(__linux__)
 if(sms_session_memory_ready)munlock(&sms_session_storage,sizeof sms_session_storage);
#endif
 sms_session_memory_ready=0;
 if(!strcmp(pending,"@sms-session")){tf_ufi_wipe(pending,sizeof pending);tf_ufi_wipe(pending_label,sizeof pending_label);}
}
static int sms_session_protect(void){
 if(sms_session_memory_ready)return 1;
#if defined(__linux__)
 struct rlimit core={0,0};if(setrlimit(RLIMIT_CORE,&core)||prctl(PR_SET_DUMPABLE,0)||mlock(&sms_session_storage,sizeof sms_session_storage))return 0;
#endif
 sms_session_memory_ready=1;return 1;
}
static void sms_session_close(void){sms_session_cleanup();tf_ufi_wipe(form_payload,sizeof form_payload);scroll_y=0;}
static void sms_session_observe(enum tf_sms_result result){sms_session_needed=result==TF_SMS_SESSION_EXPIRED;}
static void sms_session_entry(void){
 if(sms_session_needed)ah("<div class='hint'>设备会话已过期。可在此恢复登录，短信草稿已保留。</div>");
 ah("<a class='button secondary' href='act:sms-session-open' style='margin-top:8px'>恢复设备登录</a><p class='note'>已有 UFI 权限自动复用；仅原厂会话失效时需要恢复。</p>");
}
static void sms_session_render(void){
 if(sms_session_ui.stage==2){
  advanced_shell_frame("输入原厂管理密码","act:sms-session-back",0);
  size_t count=strlen(sms_session_ui.password),visible=count>12?12:count;
  ah("<div class='card tf-input-preview'>");
  if(!count)ah("尚未输入");
  else{if(count>visible)ah("… ");for(size_t i=0;i<visible;i++)ah("%s●",i?" ":"");}
  ah("</div><p class='note' style='margin:4px 0'>%zu / 1024 字符 · 密码不显示原文</p>",count);
  const char*letters="qwertyuiopasdfghjklzxcvbnm",*symbols="1234567890!@#$%^&*()_-+=.,:;?/@[]{}\\|<>~`'\"";
  const char*chars=sms_session_ui.symbols?symbols+(sms_session_ui.symbols==2?30:0):letters;int length=(int)strlen(chars);if(length>30)length=30;
  ah("<table style='width:100%%;border-spacing:2px;table-layout:fixed'>");
  for(int i=0;i<length;i++){if(i%10==0)ah("<tr>");unsigned c=(unsigned char)chars[i];if(!sms_session_ui.symbols&&sms_session_ui.uppercase)c=(unsigned)toupper((int)c);char one[2]={(char)c,0},safe[16];esc(safe,sizeof safe,one);ah("<td style='width:10%%'><a class='button secondary' href='act:sms-session-key:%u' style='padding:0;height:32px;min-height:32px;line-height:32px;font-size:14px'>%s</a></td>",c,safe);if(i%10==9)ah("</tr>");}if(length%10)ah("</tr>");
  ah("</table><table style='width:100%%;border-spacing:3px'><tr><td><a class='button secondary' href='act:sms-session-case'>大小写</a></td><td><a class='button secondary' href='act:sms-session-symbols'>符号</a></td><td><a class='button secondary' href='act:sms-session-key:32'>空格</a></td></tr><tr><td><a class='button secondary' href='act:sms-session-delete'>退格</a></td><td><a class='button secondary' href='act:sms-session-clear'>清空</a></td><td><a class='button' href='act:sms-session-done'>完成</a></td></tr></table><p class='note'>仅本次内存使用。离开或锁屏即清除，不保存密码。</p></div></body></html>");return;
 }
 advanced_shell_frame("恢复设备登录","act:sms-session-back",1);
 ah("<div class='card'><h3>在屏幕内恢复登录</h3><p class='note'>使用原厂管理密码，恢复原厂会话。不是 UFI 面板口令或锁屏 PIN；不会修改密码或登录保护。</p></div><a class='tf-field' href='act:sms-session-edit'><span class='tf-field-label'>原厂管理密码</span><span class='tf-field-value'>%s</span></a><a class='button' href='act:sms-session-prepare' style='margin-top:10px'>检查并确认恢复</a><a class='button secondary' href='act:sms-session-back' style='margin-top:8px'>返回短信草稿</a><p class='note'>本次操作只恢复登录，不发送短信。恢复成功后，请重新检查号码和内容并确认发送。</p></div></body></html>",*sms_session_ui.password?"已输入（不显示原文）":"点击输入");
}
static int sms_session_action(const char*a){
 if(!strcmp(a,"sms-session-open")){
  if(sms_session_ui.stage||advanced_page!=6||form_kind!=1||pending[0]||verifying[0]||!control_guard()||tf_http_cancelled)return 1;
  sms_session_close();if(!sms_session_protect()){show_notice("无法保护密码内存，未打开登录输入");return 1;}
  sms_session_ui.stage=1;return 1;
 }
 int own=!strncmp(a,"sms-session-",12);if(!sms_session_ui.stage)return own;
 if(!control_guard()||tf_http_cancelled){sms_session_close();return 1;}
 if(!strcmp(a,"sms-session-back")||!strcmp(a,"advback")||!strcmp(a,"cancel")){sms_session_close();return 1;}
 if(!strcmp(a,"sms-session-edit")){sms_session_ui.stage=2;scroll_y=0;return 1;}
 if(!strcmp(a,"sms-session-done")){if(sms_session_ui.stage==2)sms_session_ui.stage=1;scroll_y=0;return 1;}
 if(!strcmp(a,"sms-session-prepare")){
  if(sms_session_ui.stage!=1)return 1;if(!*sms_session_ui.password){show_notice("请先输入原厂管理密码");return 1;}
  tf_ufi_wipe(form_payload,sizeof form_payload);snprintf(pending,sizeof pending,"@sms-session");snprintf(pending_label,sizeof pending_label,"确认恢复原厂设备会话。密码仅用于本次登录，不会保存。恢复会话可能使其他原厂管理页重新登录。本次不会发送短信；恢复后仍需重新确认发送。");sms_session_ui.stage=3;scroll_y=0;return 1;
 }
 if(sms_session_ui.stage==2){
  if(!strncmp(a,"sms-session-key:",16)){char*end;long c=strtol(a+16,&end,10);if(!*end&&(c<32||c>126||!tf_ascii_append(sms_session_ui.password,sizeof sms_session_ui.password,(unsigned)c,1024)))show_notice("输入无效或已达长度上限");return 1;}
  if(!strcmp(a,"sms-session-case")){sms_session_ui.uppercase=!sms_session_ui.uppercase;return 1;}
  if(!strcmp(a,"sms-session-symbols")){sms_session_ui.symbols=(sms_session_ui.symbols+1)%3;return 1;}
  if(!strcmp(a,"sms-session-delete")){size_t n=strlen(sms_session_ui.password);if(n)tf_ufi_wipe(sms_session_ui.password+n-1,sizeof sms_session_ui.password-n+1);return 1;}
  if(!strcmp(a,"sms-session-clear")){tf_ufi_wipe(sms_session_ui.password,sizeof sms_session_ui.password);return 1;}
 }
 return 1; /* An old form/keyboard action cannot operate behind the login page. */
}
static int sms_session_confirm(void){
 if(strcmp(pending,"@sms-session"))return 0;
 tf_ufi_wipe(pending,sizeof pending);tf_ufi_wipe(pending_label,sizeof pending_label);tf_ufi_wipe(form_payload,sizeof form_payload);
 if(sms_session_ui.stage!=3||!*sms_session_ui.password||!control_guard()||tf_http_cancelled){sms_session_close();return 1;}
 show_busy("正在恢复设备登录，不会发送短信");
 if(sms_session_ui.stage!=3||!*sms_session_ui.password||!control_guard()||tf_http_cancelled){sms_session_close();return 1;}
 enum tf_sms_session_result result=tf_sms_session_restore(sms_session_ui.password,1);
 sms_session_close();if(result==TF_SMS_SESSION_RESTORED)sms_session_needed=0;
 show_notice(tf_sms_session_result_text(result));snprintf(verification_message,sizeof verification_message,"%s",notice);return 1;
}
#endif
