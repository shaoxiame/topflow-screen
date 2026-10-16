#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include "lockscreen_status.h"
#include "lockscreen_chart.h"
#include "pin_policy.h"
#include "display_policy.h"
static tf_lock_dashboard dashboard;
static char rx[48],tx[48];
#define TF_LOCK_CHART_HINT (dashboard.mode<0?"实时曲线暂不可用":"")
#define TF_LOCK_MODE dashboard.mode
#define TF_LOCK_OPERATOR dashboard.operator_name
#define TF_LOCK_RADIO dashboard.radio
#define TF_LOCK_DETAIL dashboard.detail
#define TF_LOCK_RX rx
#define TF_LOCK_TX tx
#define TF_LOCK_CARD0 dashboard.cards[0]
#define TF_LOCK_CARD1 dashboard.cards[1]
#define TF_LOCK_CARD2 dashboard.cards[2]
#define TF_PIN_BAT_PERCENT 79
#define TF_PIN_BAT_STATUS 1
#define TF_PIN_BAT_CONNECTION 1
static tf_pin_policy pin_policy;static tf_display_policy display_policy;
static int wallpaper;
#define TF_LOCK_WALLPAPER wallpaper
static int theme_dark,pin_fault;static char pin_feedback[128];
static uint64_t pin_now(void){return 1000;}
static uint32_t tick(void){return 1000;}
static int pin_native_poll(void){return 1;}
static int pin_native_attempt(void){return TF_PIN_INVALID;}
static struct tm*localtime_r(const time_t*t,struct tm*out){struct tm*p=localtime(t);if(p)*out=*p;return p?out:NULL;}
static void esc(char*out,size_t cap,const char*s){size_t n=0;for(;s&&*s&&n+7<cap;s++){const char*e=*s=='&'?"&amp;":*s=='<'?"&lt;":*s=='>'?"&gt;":*s=='\"'?"&quot;":NULL;if(e){size_t l=strlen(e);memcpy(out+n,e,l);n+=l;}else out[n++]=*s;}out[n]=0;}
#include "pin_view.h"
static void emit(const char*dir,const char*name,int pin,int progress){tf_lock_rate_text(dashboard.rx,rx,sizeof rx);tf_lock_rate_text(dashboard.tx,tx,sizeof tx);for(theme_dark=0;theme_dark<2;theme_dark++){char file[4096];snprintf(file,sizeof file,"%s/%s%s.html",dir,name,theme_dark?"-dark":"");FILE*f=fopen(file,"wb");assert(f);const char*h=pin?pin_screen_html():soft_screen_html(progress);assert(h&&strlen(h)<8192&&strstr(h,rx)&&strstr(h,tx));assert(!strstr(h,"href='act:modem")&&!strstr(h,"href='act:theme"));fwrite(h,1,strlen(h),f);fclose(f);}}
int main(int argc,char**argv){assert(argc==2);char raw[4096];
 const char*normal="{\"aggregation\":{\"enabled\":false},\"modems\":[{\"id\":\"5G\",\"sim\":{\"state\":\"sim ready\"},\"wwan\":{\"status\":\"ipv4_connected\"},\"net\":{\"operator\":\"China Unicom\",\"type\":\"NSA\"},\"traffic\":{\"rx_speed\":41075000,\"tx_speed\":5785000}}]}";
 tf_lock_status(normal,&dashboard);assert(dashboard.mode==0&&dashboard.rx==41075000&&dashboard.tx==5785000&&dashboard.online==1&&!strcmp(dashboard.operator_name,"中国联通")&&!strcmp(dashboard.radio,"5G NSA"));emit(argv[1],"lock-normal-021",0,0);emit(argv[1],"lock-hold-021",0,650);wallpaper=1;emit(argv[1],"lock-wallpaper-024",0,0);emit(argv[1],"lock-wallpaper-hold-024",0,650);wallpaper=0;
 tf_pin_start(&pin_policy,1,1000,0,0);pin_policy.deadline=0;pin_policy.handover_wait=0;emit(argv[1],"lock-pin-status-021",1,0);wallpaper=1;emit(argv[1],"lock-wallpaper-pin-024",1,0);wallpaper=0;
 for(int i=0;i<3;i++){const char*type=i==0?"LTE":i==1?"5G-A":"SA";snprintf(raw,sizeof raw,"{\"aggregation\":{\"enabled\":false},\"modems\":[{\"id\":\"5G\",\"sim\":{\"state\":\"sim ready\"},\"wwan\":{\"status\":\"ipv4_connected\"},\"net\":{\"operator\":\"China Mobile\",\"type\":\"%s\"},\"traffic\":{\"rx_speed\":1250000,\"tx_speed\":125000}}]}",type);tf_lock_status(raw,&dashboard);assert(!strcmp(dashboard.radio,i==0?"4G":i==1?"5G-A":"5G SA"));}
 emit(argv[1],"lock-sa-021",0,0);
 const char*aggregate="{\"aggregation\":{\"enabled\":true,\"online\":true},\"net\":{\"nrca\":\"1,2,3\"},\"modems\":[{\"id\":\"5G\",\"sim\":{\"state\":\"sim ready\"},\"wwan\":{\"status\":\"ipv4_connected\"},\"net\":{\"operator\":\"China Unicom\",\"type\":\"NSA\"},\"traffic\":{\"rx_speed\":41075000,\"tx_speed\":5785000}},{\"id\":\"4G1\",\"sim\":{\"state\":\"sim ready\"},\"wwan\":{\"status\":\"ipv4_connected\"},\"net\":{\"operator\":\"China Mobile\",\"type\":\"LTE\"},\"traffic\":{\"rx_speed\":10000000,\"tx_speed\":2000000}},{\"id\":\"4G2\",\"sim\":{\"state\":\"sim undetected\"},\"wwan\":{\"status\":\"disconnected\"},\"net\":{\"operator\":\"China Telecom\",\"type\":\"5G-A\"},\"traffic\":{\"rx_speed\":999999999,\"tx_speed\":999999999}}]}";
 tf_external_enabled[0]=tf_external_enabled[1]=1;tf_lock_status(aggregate,&dashboard);assert(dashboard.mode==1&&dashboard.rx==51075000&&dashboard.tx==7785000&&dashboard.online==2);assert(strstr(dashboard.cards[0],"中国联通")&&strstr(dashboard.cards[1],"中国移动")&&strstr(dashboard.cards[2],"未插卡")&&!strstr(dashboard.radio,"5G-A")&&!strstr(dashboard.cards[2],"5G-A"));emit(argv[1],"lock-aggregate-021",0,0);wallpaper=1;emit(argv[1],"lock-wallpaper-aggregate-024",0,0);wallpaper=0;
 tf_external_enabled[0]=-1;tf_lock_status(aggregate,&dashboard);assert(!strstr(dashboard.radio,"4G")&&dashboard.online==1&&dashboard.rx<0&&dashboard.tx<0);tf_external_enabled[0]=1;
 tf_lock_status(NULL,&dashboard);assert(dashboard.mode==-1&&dashboard.rx<0&&dashboard.tx<0&&dashboard.online==0&&!strcmp(dashboard.radio,"—"));emit(argv[1],"lock-stale-021",0,0);
 tf_lock_motion motion={0};dashboard.mode=0;dashboard.rx=100;dashboard.tx=20;tf_lock_motion_sample(&motion,&dashboard,100);assert(!motion.active&&tf_lock_motion_value(&motion,0,100)==100);dashboard.rx=300;dashboard.tx=60;tf_lock_motion_sample(&motion,&dashboard,200);assert(motion.active&&!tf_lock_motion_frame(&motion,239)&&tf_lock_motion_frame(&motion,240));assert(tf_lock_motion_value(&motion,0,360)==250);assert(tf_lock_motion_frame(&motion,520)&&!motion.active&&tf_lock_motion_value(&motion,0,520)==300);dashboard.rx=-1;tf_lock_motion_sample(&motion,&dashboard,530);assert(tf_lock_motion_value(&motion,0,530)==-1);dashboard.mode=1;dashboard.rx=900;tf_lock_motion_sample(&motion,&dashboard,540);assert(!motion.active&&tf_lock_motion_value(&motion,0,540)==900);
 tf_lock_rate_text(125000000,rx,sizeof rx);assert(!strcmp(rx,"1000"));tf_lock_rate_text(-1,rx,sizeof rx);assert(!strcmp(rx,"—"));tf_lock_rate_text(INFINITY,rx,sizeof rx);assert(!strcmp(rx,"—"));
 tf_lock_chart chart={0};assert(tf_lock_chart_sample(&chart,0,1,10,2)&&chart.scope[0].count==1);assert(!tf_lock_chart_sample(&chart,0,1,20,3)&&chart.scope[0].count==1&&chart.scope[0].rx[0]==10);assert(tf_lock_chart_sample(&chart,0,2,30,5)&&chart.scope[0].count==2);assert(tf_lock_chart_sample(&chart,1,3,100,20)&&chart.scope[1].count==1&&chart.scope[0].count==2);assert(tf_lock_chart_sample(&chart,0,4,40,8)&&chart.scope[0].count==1);assert(!tf_lock_chart_sample(&chart,-1,-1,-1,-1)&&!chart.current);assert(tf_lock_chart_sample(&chart,0,5,50,10)&&chart.scope[0].count==1);
 puts("PASS: lock telemetry uses fresh caller-provided snapshot, physical-mode bit, primary vs cellular sum, per-card operator/radio, absent/disabled/unknown guards; no CA-derived 5G-A; bounded 320ms sample animation and immediate stale gaps; PIN/hold previews generated");return 0;
}
