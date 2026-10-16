/* Lock-screen telemetry from the already sampled state only. No I/O. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_LOCKSCREEN_STATUS_H
#define TF_LOCKSCREEN_STATUS_H
#include <stdint.h>
#include "modem_logic.h"
#include "network_status.h"
#include "radio_status.h"
typedef struct{int mode,online;double rx,tx;char operator_name[128],radio[64],detail[160],cards[3][144];}tf_lock_dashboard;
static const char*tf_lock_operator(const char*s){return !strcmp(s,"China Unicom")?"中国联通":!strcmp(s,"China Mobile")?"中国移动":!strcmp(s,"China Telecom")?"中国电信":s;}
static void tf_lock_status(const char*raw,tf_lock_dashboard*out){
 memset(out,0,sizeof *out);out->mode=-1;out->rx=out->tx=-1;strcpy(out->operator_name,"网络状态待更新");strcpy(out->radio,"—");strcpy(out->detail,"等待设备实时数据");
 tf_json d;if(!raw||!tf_parse(&d,raw))return;tf_network_status network;memset(&network,0,sizeof network);tf_network_aggregation(&d,&network);out->mode=network.enabled;
 char operators[3][96]={{0}},radios[3][32]={{0}};int names=0,types=0,sum_ok=1;double sum_rx=0,sum_tx=0;
 for(int i=0;i<3;i++){
  tf_modem m;const char*id=i==0?"5G":i==1?"4G1":"4G2";int valid=tf_modem_snapshot(&d,id,&m),rate_valid=valid&&(!i||m.enabled==1);double rx=rate_valid?tf_modem_rate(&d,&m,"rx_speed"):-1,tx=rate_valid?tf_modem_rate(&d,&m,"tx_speed"):-1;
  if(!i&&out->mode==0){out->rx=rx;out->tx=tx;snprintf(out->detail,sizeof out->detail,"%s",valid?m.status:"主卡状态暂不可用");}
  if(out->mode!=1&&i)continue;
  if(valid&&tf_modem_radio_current(&d,&m)){
   if(m.connected==1)out->online++;char name[96]="",type[32]="";tf_gets(&d,m.net,"operator",name,sizeof name);tf_gets(&d,m.net,"type",type,sizeof type);const char*label=tf_radio_label(type),*operator_name=tf_lock_operator(name);
   int duplicate=0;for(int n=0;n<names;n++)if(!strcmp(operators[n],operator_name))duplicate=1;if(*operator_name&&!duplicate&&names<3)snprintf(operators[names++],sizeof operators[0],"%s",operator_name);
   duplicate=0;for(int n=0;n<types;n++)if(!strcmp(radios[n],label))duplicate=1;if(strcmp(label,"—")&&!duplicate&&types<3)snprintf(radios[types++],sizeof radios[0],"%s",label);
   snprintf(out->cards[i],sizeof out->cards[i],"卡 %d  %s · %s%s",i+1,*operator_name?operator_name:"运营商未知",label,m.connected==1?"":" · 未联网");
  }
  else snprintf(out->cards[i],sizeof out->cards[i],"卡 %d  %s",i+1,valid?m.status:"数据不可用");
  if(rx<0||tx<0){if(!(valid&&!m.conflict&&(m.enabled==0||m.presence==0)))sum_ok=0;}else{sum_rx+=rx;sum_tx+=tx;}
 }
 if(out->mode==1){out->rx=sum_ok?sum_rx:-1;out->tx=sum_ok?sum_tx:-1;snprintf(out->detail,sizeof out->detail,"%d 路蜂窝在线 · %s",out->online,network.aggregation_label);}
 if(out->mode>=0){if(names){out->operator_name[0]=0;for(int n=0;n<names;n++){size_t len=strlen(out->operator_name);snprintf(out->operator_name+len,sizeof out->operator_name-len,"%s%s",n?" · ":"",operators[n]);}}else snprintf(out->operator_name,sizeof out->operator_name,"%s",out->mode==1?"暂无在线蜂窝网络":"主卡尚未联网");
  if(types){out->radio[0]=0;for(int n=0;n<types;n++){size_t len=strlen(out->radio);snprintf(out->radio+len,sizeof out->radio-len,"%s%s",n?" / ":"",radios[n]);}}
 }
 if(!isfinite(out->rx))out->rx=-1;if(!isfinite(out->tx))out->tx=-1;
 tf_free(&d);
}
/* Rates are bytes/s. Unknown values replace a previous sample immediately;
 * transitions between actual samples settle in 320 ms with no overshoot. */
typedef struct{double from[2],to[2];uint32_t started,last_frame;int mode,initialized,active;}tf_lock_motion;
static double tf_lock_motion_value(const tf_lock_motion*m,int channel,uint32_t now){if(!m->initialized)return-1;double from=m->from[channel],to=m->to[channel];if(from<0||to<0)return to;double t=(double)(uint32_t)(now-m->started)/320.0;if(t>=1)return to;double ease=t*(2-t);return from+(to-from)*ease;}
static void tf_lock_motion_sample(tf_lock_motion*m,const tf_lock_dashboard*s,uint32_t now){double values[2]={s->rx,s->tx};if(m->initialized&&m->mode==s->mode&&m->to[0]==values[0]&&m->to[1]==values[1])return;for(int i=0;i<2;i++){double prior=tf_lock_motion_value(m,i,now);m->from[i]=m->initialized&&m->mode==s->mode&&prior>=0&&values[i]>=0?prior:values[i];m->to[i]=values[i];}m->mode=s->mode;m->initialized=1;m->started=m->last_frame=now;m->active=m->from[0]!=m->to[0]||m->from[1]!=m->to[1];}
static int tf_lock_motion_frame(tf_lock_motion*m,uint32_t now){if(!m->active||(uint32_t)(now-m->last_frame)<40)return 0;m->last_frame=now;if((uint32_t)(now-m->started)>=320)m->active=0;return 1;}
static void tf_lock_rate_text(double rate,char*out,size_t cap){if(rate<0||!isfinite(rate)){snprintf(out,cap,"—");return;}double mbps=rate/1e6*8;snprintf(out,cap,mbps>=1e6?"%.3g":mbps>=1000?"%.0f":mbps>=100?"%.1f":"%.2f",mbps);}
#endif
