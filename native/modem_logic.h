/* Per-modem interpretation: absent, unavailable and disabled are distinct. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_MODEM_LOGIC_H
#define TF_MODEM_LOGIC_H
#include "control_logic.h"
#include <math.h>
static int tf_external_enabled[2]={-1,-1};
typedef struct {int object,sim,net,traffic,qos,presence,connected,availability,slot,reported_slot,roaming,dual,locked,conflict,rates_ok,enabled;char state[96],modem_state[96],status[96];} tf_modem;
static int tf_modem_index(const tf_json*d,const char*id){int a=tf_key(d,0,"modems");if(a<0||d->t[a].type!='[')return-1;for(int i=a+1;i<d->t[a].next;i=d->t[i].next){char value[16];if(tf_gets(d,i,"id",value,sizeof value)&&!strcmp(value,id))return i;}return-1;}
static int tf_word(const char*s,const char*word){size_t n=strlen(word);for(const char*p=s;(p=strstr(p,word));p++)if((p==s||p[-1]=='_')&&(!p[n]||p[n]=='_'))return 1;return 0;}
static void tf_lower_trim(char*s){size_t n=strlen(s);while(n&&isspace((unsigned char)s[n-1]))s[--n]=0;size_t a=0;while(s[a]&&isspace((unsigned char)s[a]))a++;if(a)memmove(s,s+a,strlen(s+a)+1);for(char*p=s;*p;p++)*p=(char)tolower((unsigned char)*p);}
static int tf_mstate(const tf_modem*m,const char*a,const char*b){return !strcmp(m->state,a)||!strcmp(m->modem_state,a)||(b&&(!strcmp(m->state,b)||!strcmp(m->modem_state,b)));}
static int tf_modem_snapshot(const tf_json*d,const char*id,tf_modem*m){
 memset(m,0,sizeof *m);m->object=tf_modem_index(d,id);m->presence=m->connected=m->availability=m->slot=m->reported_slot=m->roaming=m->dual=-1;m->enabled=!strcmp(id,"4G1")?tf_external_enabled[0]:!strcmp(id,"4G2")?tf_external_enabled[1]:-1;snprintf(m->status,sizeof m->status,"数据不可用");if(m->object<0)return 0;
 m->sim=tf_key(d,m->object,"sim");m->net=tf_key(d,m->object,"net");m->traffic=tf_key(d,m->object,"traffic");m->qos=tf_key(d,m->object,"qos");int primary=!strcmp(id,"5G"),root_sim=tf_key(d,0,"sim");
 tf_gets(d,m->sim,"state",m->state,sizeof m->state);tf_gets(d,m->sim,"modem_state",m->modem_state,sizeof m->modem_state);
 if(primary){if(!*m->state&&!tf_gets(d,root_sim,"state",m->state,sizeof m->state))tf_gets(d,0,"sim_states",m->state,sizeof m->state);if(!*m->modem_state&&!tf_gets(d,root_sim,"modem_state",m->modem_state,sizeof m->modem_state))tf_gets(d,0,"modem_main_state",m->modem_state,sizeof m->modem_state);}
 tf_lower_trim(m->state);tf_lower_trim(m->modem_state);char connection[96]="";tf_gets(d,tf_key(d,m->object,"wwan"),"status",connection,sizeof connection);tf_lower_trim(connection);
 if(tf_word(connection,"disconnected"))m->connected=0;else if(tf_word(connection,"connected"))m->connected=1;
 int absent=tf_mstate(m,"sim undetected","modem_sim_undetected"),error=tf_mstate(m,"sim destroy","modem_sim_destroy")||tf_mstate(m,"sim error",NULL),ready=tf_mstate(m,"sim ready","modem_init_complete");
 m->locked=tf_mstate(m,"wait puk","modem_waitpuk")?2:tf_mstate(m,"wait pin","modem_waitpin")?1:tf_mstate(m,"sim lock","modem_imsi_waitnck")?3:0;
 m->presence=absent?0:ready||m->locked||m->connected==1?1:-1;m->conflict=m->connected==1&&(absent||error||m->locked||m->enabled==0);if(m->conflict)m->connected=-1;
 int usb=tf_bool(d,tf_key(d,tf_key(d,m->object,"usb"),"present"));m->availability=m->connected==1||usb==1?1:usb==0?0:-1;
 const char*status=m->conflict?"状态冲突":m->enabled==0?(m->presence<0?"未启用 · SIM待检测":"未启用"):absent?"未插卡":m->locked==1?"待输入 PIN":m->locked==2?"待输入 PUK":m->locked==3?"SIM 卡已锁":error?"SIM 异常":m->connected==1?"已联网":tf_word(connection,"connecting")?"连接中":m->availability==0?"模块不可用":m->connected==0?"未联网":"状态未知";snprintf(m->status,sizeof m->status,"%s",status);
 long long slot;if(tf_int(d,tf_key(d,m->sim,"slot"),&slot)&&slot>=(primary?1:0)&&slot<=(primary?2:1))m->reported_slot=(int)slot;else if(primary&&tf_int(d,tf_key(d,root_sim,"current_slot"),&slot)&&slot>=1&&slot<=2)m->reported_slot=(int)slot;if(m->presence==1&&!m->conflict)m->slot=m->reported_slot;
 if(primary){m->dual=tf_bool(d,tf_key(d,root_sim,"dual_sim"));if(m->dual<0)m->dual=tf_bool(d,tf_key(d,0,"dual_sim"));m->roaming=tf_bool(d,tf_key(d,m->net,"roaming_allowed"));if(m->roaming<0)m->roaming=tf_bool(d,tf_key(d,tf_key(d,0,"net"),"roaming_allowed"));if(m->roaming<0)m->roaming=tf_bool(d,tf_key(d,tf_key(d,tf_key(d,0,"interfaces"),"cellular"),"roam_enable"));}
 m->rates_ok=!m->conflict&&!absent&&!error&&!m->locked&&m->availability!=0&&m->presence==1&&m->enabled!=0;
 return 1;
}
static double tf_modem_rate(const tf_json*d,const tf_modem*m,const char*key){if(!m->rates_ok)return-1;int i=tf_key(d,m->traffic,key);char value[64],*end;if(i<0)return-1;if(d->t[i].type=='"'){if(!tf_string(d,i,value,sizeof value))return-1;}else if(d->t[i].type=='n'){int n=d->t[i].end-d->t[i].start;if(n<1||n>60)return-1;memcpy(value,d->s+d->t[i].start,(size_t)n);value[n]=0;}else return-1;double n=strtod(value,&end);return end!=value&&!*end&&isfinite(n)&&n>=0?n:-1;}
/* AMBR is already Mbps and may remain cached while a ready SIM is disconnected.
 * Its validity is independent of live traffic/USB availability and sampled_at=0. */
static int tf_modem_qos_ready(const tf_json*d,const tf_modem*m){
 if(m->presence!=1||m->conflict||m->locked||m->enabled==0||tf_mstate(m,"sim error",NULL)||tf_mstate(m,"sim destroy","modem_sim_destroy"))return 0;
 char id[16];if(!tf_gets(d,m->object,"id",id,sizeof id))return 0;
 return !strcmp(id,"5G")||((!strcmp(id,"4G1")||!strcmp(id,"4G2"))&&m->enabled==1);
}
static double tf_modem_ambr(const tf_json*d,const tf_modem*m,const char*key){
 if((strcmp(key,"ambr_dl")&&strcmp(key,"ambr_ul"))||!tf_modem_qos_ready(d,m))return-1;
 int i=tf_key(d,m->qos,key);char value[64],*end;if(i<0)return-1;
 if(d->t[i].type=='"'){if(!tf_string(d,i,value,sizeof value))return-1;}else if(d->t[i].type=='n'){int n=d->t[i].end-d->t[i].start;if(n<1||n>60)return-1;memcpy(value,d->s+d->t[i].start,(size_t)n);value[n]=0;}else return-1;
 /* Reject non-decimal strings accepted by strtod (hex, whitespace, inf/NaN). */
 if(!isdigit((unsigned char)value[0]))return-1;for(const char*p=value;*p;p++)if(!isdigit((unsigned char)*p)&&*p!='.'&&*p!='e'&&*p!='E'&&*p!='+'&&*p!='-')return-1;
 double n=strtod(value,&end);return end!=value&&!*end&&isfinite(n)&&n>0?n:-1;
}
static void tf_modem_ambr_text(char*out,size_t cap,double rate){
 if(!isfinite(rate)||rate<=0){snprintf(out,cap,"— · 未提供");return;}
 char value[96];if(rate>=1e6||rate<0.001)snprintf(value,sizeof value,"%.6g",rate);else{snprintf(value,sizeof value,"%.3f",rate);char*dot=strchr(value,'.');if(dot){char*end=value+strlen(value)-1;while(end>dot&&*end=='0')*end--=0;if(end==dot)*end=0;}}snprintf(out,cap,"%s Mbps",value);
}
static int tf_modem_signal(const tf_json*d,const tf_modem*m,int metric,char*out,size_t cap){const char*fields[]={"rsrp","rsrq","snr","rssi","pci","channel","cell_id","tac"};const double lo[]={-160,-50,-30,-150,0,1,0,0},nrhi[]={-20,0,60,0,1007,3279165,68719476734.0,16777215},ltehi[]={-20,0,60,0,503,262143,268435455,65535};if(metric<0||metric>=8||m->connected!=1||m->conflict||m->enabled==0)return 0;char type[32]="",key[48],value[80],*end;tf_gets(d,m->net,"type",type,sizeof type);int nr=strstr(type,"SA")||strstr(type,"5G")||strstr(type,"NR");snprintf(key,sizeof key,"%s_%s",nr?"nr":"lte",fields[metric]);int i=tf_key(d,m->net,key);if(i<0&&!nr&&(metric==5||metric==6))i=tf_key(d,m->net,fields[metric]);if(i<0)return 0;if(d->t[i].type=='"'){if(!tf_string(d,i,value,sizeof value))return 0;}else if(d->t[i].type=='n'){int n=d->t[i].end-d->t[i].start;if(n<1||n>70)return 0;memcpy(value,d->s+d->t[i].start,(size_t)n);value[n]=0;}else return 0;double n=strtod(value,&end);if(end==value||*end||!isfinite(n)||n<lo[metric]||n>(nr?nrhi[metric]:ltehi[metric])||(metric==6&&n==4294967295.0))return 0;snprintf(out,cap,"%s",value);return 1;}
static int tf_modem_control(char*out,size_t cap,const tf_json*d,const char*id,const char*op){
 tf_modem m;if(strcmp(id,"5G")||!tf_modem_snapshot(d,id,&m)||m.conflict)return 0;
 if(!strcmp(op,"connect")){if(m.presence!=1||m.locked||m.availability==0||m.connected!=0)return 0;snprintf(out,cap,"{\"action\":\"cellular.connect\",\"params\":{}}");}
 else if(!strcmp(op,"disconnect")){if(m.connected!=1)return 0;snprintf(out,cap,"{\"action\":\"cellular.disconnect\",\"params\":{}}");}
 else if(!strcmp(op,"roam0")||!strcmp(op,"roam1")){if(m.roaming<0)return 0;snprintf(out,cap,"{\"action\":\"cellular.set\",\"params\":{\"roaming\":%d}}",op[4]=='1');}
 /* Physical source selection uses sim_source_logic.h and raw factory st_slot. */
 else return 0;return 1;
}
#endif
