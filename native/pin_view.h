/* Read-only lock-screen telemetry; credentials and navigation remain hidden. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_PIN_VIEW_H
#define TF_PIN_VIEW_H
#include "battery_state.h"
#ifndef TF_PIN_TITLE
#define TF_PIN_TITLE "TOPFLOW"
#endif
#ifndef TF_PIN_BAT_PERCENT
#define TF_PIN_BAT_PERCENT (-1)
#define TF_PIN_BAT_STATUS (-1)
#define TF_PIN_BAT_CONNECTION (-1)
#endif
#ifndef TF_LOCK_MODE
#define TF_LOCK_MODE (-1)
#define TF_LOCK_OPERATOR "网络状态待更新"
#define TF_LOCK_RADIO "—"
#define TF_LOCK_DETAIL "等待设备实时数据"
#define TF_LOCK_RX "—"
#define TF_LOCK_TX "—"
#define TF_LOCK_CARD0 "卡 1  数据不可用"
#define TF_LOCK_CARD1 "卡 2  数据不可用"
#define TF_LOCK_CARD2 "卡 3  数据不可用"
#endif
#ifndef TF_LOCK_CHART_HINT
#define TF_LOCK_CHART_HINT "等待实时采样"
#endif
static const char*lock_status_html(int compact){
 static char html[4096];char name[768],radio[384],detail[960],safe_rx[128],safe_tx[128];esc(name,sizeof name,TF_LOCK_OPERATOR);esc(radio,sizeof radio,TF_LOCK_RADIO);esc(detail,sizeof detail,TF_LOCK_DETAIL);esc(safe_rx,sizeof safe_rx,TF_LOCK_RX);esc(safe_tx,sizeof safe_tx,TF_LOCK_TX);
 const char*mode=TF_LOCK_MODE==1?"聚合模式":TF_LOCK_MODE==0?"普通模式":"模式待确认";
 if(compact){snprintf(html,sizeof html,"<div class='pin-telemetry'><div>%s · %s</div><div class='pin-operator'>%s</div><div>↓ %s　↑ %s <small>Mbps</small></div></div>",mode,radio,name,safe_rx,safe_tx);return html;}
 size_t n=(size_t)snprintf(html,sizeof html,"<div class='lock-network'><div class='lock-mode'><span>%s</span><b>%s</b></div>",mode,TF_LOCK_MODE==1?"多卡协同":radio);
 if(TF_LOCK_MODE==1){const char*cards[]={TF_LOCK_CARD0,TF_LOCK_CARD1,TF_LOCK_CARD2};for(int i=0;i<3;i++){char safe[864];esc(safe,sizeof safe,cards[i]);n+=(size_t)snprintf(html+n,sizeof html-n,"<div class='lock-cardline'>%s</div>",safe);}}
 else n+=(size_t)snprintf(html+n,sizeof html-n,"<div class='lock-operator'>%s</div><div class='lock-connection'>%s</div>",name,detail);
 snprintf(html+n,sizeof html-n,"</div><div class='lock-rates'><div class='lock-rate down'><span>↓ 实时下行</span><b id='lock-rx' style='font-size:%dpx'>%s</b><small>Mbps</small></div><div class='lock-rate up'><span>↑ 实时上行</span><b id='lock-tx' style='font-size:%dpx'>%s</b><small>Mbps</small></div><div id='rate-chart' class='lock-chart'>%s</div></div>",strlen(safe_rx)>7?21:strlen(safe_rx)>6?25:30,safe_rx,strlen(safe_tx)>7?21:strlen(safe_tx)>6?25:30,safe_tx,TF_LOCK_CHART_HINT);return html;
}
static const char*pin_screen_html(void){
 if(!pin_policy.enabled)return NULL;
 static char html[8192];unsigned left=tf_pin_seconds(&pin_policy,pin_now());char timebuf[16],message[512],safe[768],battery[16];
 time_t clock=time(NULL);struct tm tm;localtime_r(&clock,&tm);strftime(timebuf,sizeof timebuf,"%H:%M",&tm);
 int percent=TF_PIN_BAT_PERCENT,status=TF_PIN_BAT_STATUS,connected=TF_PIN_BAT_CONNECTION;
 if(percent>=0&&percent<=100)snprintf(battery,sizeof battery,"%d%%",percent);else snprintf(battery,sizeof battery,"—");
 if(left)snprintf(message,sizeof message,pin_policy.handover_wait?"首次接管保护等待 · 剩余 %u 秒":"已连续输错 5 次 · 剩余 %u 秒",left);else if(*pin_feedback)snprintf(message,sizeof message,"%s",pin_feedback);else snprintf(message,sizeof message,"%s","请输入原厂四位锁屏码");esc(safe,sizeof safe,message);
 size_t n=(size_t)snprintf(html,sizeof html,"<html><head><link rel='stylesheet' href='style.css'></head><body class='%s tf-pin'><div class='pin-screen pin-auth'><div class='pin-top'><span class='pin-brand'>" TF_PIN_TITLE "</span><span class='top-power %s' title='%s'><span class='charge-bolt'><i class='a'></i><i class='b'></i><i class='c'></i><i class='d'></i><i class='e'></i></span><span class='charge-mark'>%s</span>%s <span class='top-battery'><i style='width:%dpx'></i><b></b></span></span></div><div class='pin-clock'>%s</div>%s<h2 class='pin-title'>屏幕已锁定</h2><p class='pin-status'>%s</p><div class='pin-dots'>",theme_dark?"dark":"light",tf_battery_class(status,connected),tf_battery_label(status,connected),tf_battery_mark(status,connected),battery,tf_battery_fill(percent),timebuf,lock_status_html(1),safe);
 for(unsigned i=0;i<4;i++)n+=(size_t)snprintf(html+n,sizeof html-n,"<span class='pin-dot%s'></span>",i<pin_policy.input_len?" filled":"");
 n+=(size_t)snprintf(html+n,sizeof html-n,"</div><table class='pin-keypad'>");
 const char*keys[]={"1","2","3","4","5","6","7","8","9","清空","0","确认"};
 for(int i=0;i<12;i++){
  if(!(i%3))n+=(size_t)snprintf(html+n,sizeof html-n,"<tr>");
  const char*action=i==9?"clear":i==11?"submit":keys[i];const char*extra=i==9?" pin-word":i==11?" pin-word pin-submit":"";
  if(left)n+=(size_t)snprintf(html+n,sizeof html-n,"<td><div class='pin-key disabled%s'>%s</div></td>",extra,keys[i]);else n+=(size_t)snprintf(html+n,sizeof html-n,"<td><a class='pin-key%s' href='act:pin:%s'>%s</a></td>",extra,action,keys[i]);
  if(i%3==2)n+=(size_t)snprintf(html+n,sizeof html-n,"</tr>");
 }
 snprintf(html+n,sizeof html-n,"</table><p class='pin-note'>%s</p></div></body></html>",left&&pin_policy.handover_wait?"原厂锁屏保护 · 并非密码错误":"使用设备原厂锁屏码解锁");return html;
}
static const char*soft_screen_html(int progress){
 static char html[8192];char timebuf[16],datebuf[64],battery[16],hold[96];time_t clock=time(NULL);struct tm tm;localtime_r(&clock,&tm);strftime(timebuf,sizeof timebuf,"%H:%M",&tm);const char*week[]={"星期日","星期一","星期二","星期三","星期四","星期五","星期六"};snprintf(datebuf,sizeof datebuf,"%d 月 %d 日 · %s",tm.tm_mon+1,tm.tm_mday,week[tm.tm_wday]);
 int percent=TF_PIN_BAT_PERCENT,status=TF_PIN_BAT_STATUS,connected=TF_PIN_BAT_CONNECTION;if(percent>=0&&percent<=100)snprintf(battery,sizeof battery,"%d%%",percent);else snprintf(battery,sizeof battery,"—");if(progress<0)progress=0;if(progress>1000)progress=1000;
 strcpy(hold,"长按解锁");
 snprintf(html,sizeof html,"<html><head><link rel='stylesheet' href='style.css'></head><body class='%s tf-pin'><div class='pin-screen soft-lock'><div class='pin-top'><span class='pin-brand'>" TF_PIN_TITLE " <small>CONNECT</small></span><span class='top-power %s' title='%s'><span class='charge-bolt'><i class='a'></i><i class='b'></i><i class='c'></i><i class='d'></i><i class='e'></i></span><span class='charge-mark'>%s</span>%s <span class='top-battery'><i style='width:%dpx'></i><b></b></span></span></div><div class='pin-clock'>%s</div><div class='lock-date'>%s</div>%s<div class='soft-unlock'><i style='width:%dpx'></i><span>%s</span></div><div class='soft-progress'><i style='width:%dpx'></i></div><p class='pin-note'>屏幕已锁定 · 松手或移出即可取消<br>%s</p></div></body></html>",theme_dark?"dark":"light",tf_battery_class(status,connected),tf_battery_label(status,connected),tf_battery_mark(status,connected),battery,tf_battery_fill(percent),timebuf,datebuf,lock_status_html(0),progress*240/1000,hold,progress*208/1000,TF_LOCK_MODE==1?"速率为三卡蜂窝合计":"速率随设备实时更新");return html;
}
static void pin_action(const char*a){if(!pin_policy.locked||!pin_policy.enabled||strncmp(a,"pin:",4))return;a+=4;pin_native_poll();if(pin_fault||tf_pin_seconds(&pin_policy,pin_now()))return;if(!strcmp(a,"clear")){tf_pin_clear(&pin_policy);pin_feedback[0]=0;return;}if(strlen(a)==1&&*a>='0'&&*a<='9'){tf_pin_digit(&pin_policy,*a-'0',pin_now());pin_feedback[0]=0;return;}if(!strcmp(a,"submit")){if(pin_policy.input_len!=4){snprintf(pin_feedback,sizeof pin_feedback,"请输入完整四位锁屏码");return;}int r=pin_native_attempt();if(r==TF_PIN_OK){display_policy.locked=0;tf_display_activity(&display_policy,tick());pin_feedback[0]=0;}else if(r==TF_PIN_WRONG)snprintf(pin_feedback,sizeof pin_feedback,"锁屏码错误 · 剩余 %d 次",5-pin_policy.failures);else if(r==TF_PIN_INVALID)snprintf(pin_feedback,sizeof pin_feedback,"锁屏验证暂不可用，正在恢复原厂");}}
#endif
