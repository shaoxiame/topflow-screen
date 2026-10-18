/* TopFlow screen runtime. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Independent main loop around 33333s/u60pro-devui's DRM, evdev, litehtml
 * and FreeType backends. No upstream startup script or upstream htmlmain.
 * Network reads use the already running datad service. Writes are restricted
 * to explicit, confirmed UI actions. Installation is a separate step.
 */
#include "drm_disp.h"
#include "touch_input.h"
#include "key_input.h"
#include "backlight.h"
#include "data.h"
#include "json.h"
#include "gesture.h"
#include "transition.h"
#include "screen_geometry.h"
#include "interaction.h"
#include "sms_logic.h"
#include "rate_history.h"
#include "lockscreen_chart.h"
#include "battery_state.h"
#include "home_mode.h"
#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <math.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>
#include "control_logic.h"
#include "modem_logic.h"
#include "radio_status.h"
#include "local_http.h"
#include "wifi_state_runtime.h"
#include "aoyou_native.h"
#include "network_status.h"
#include "network_runtime.h"
#include "lockscreen_status.h"

#define ROOT "/data/plugins/topflow-screen"
#define UI ROOT "/ui"
#define MAX_HTML 262144
extern void html_view_init(uint16_t *,int,int,int,int,const char *);
extern int html_view_ready(void);
extern void html_view_set_lock_wallpaper(const uint16_t*);
extern int html_view_repaint(void);
extern int html_view_pinned_height(void);
extern void html_view_set_clip_top(int);
extern int html_view_rect(const char*,int*,int*,int*,int*);
extern void html_view_rate_chart(int,int,int,int,const double*,const double*,int);
extern int html_view_chart_save(int,int,int,int);
extern int html_view_chart_restore(void);
extern void html_view_set_uidir(const char *);
extern int html_view_render_html(const char *);
extern const char *html_view_click(float,float);
extern void html_view_set_scroll(int);
extern void html_view_fill_round_rect(int,int,int,int,int,int,int,int,int);
extern void html_view_draw_text_px(int,int,const char*,int,int,int,int,int,int);
extern int html_view_text_width_px(const char*,int);
extern void html_view_target_native_begin(uint16_t*,int);
extern void html_view_target_end(void);
extern const char *data_raw_json(void);
extern uint32_t data_snapshot_age_ms(void);
static volatile sig_atomic_t running=1;
static char page[96]="index.html", previous[96]="index.html", notice[256]="";
static char pending[4096]="", pending_label[1600]="";
static int controls_enabled=0,advanced_page=0;
static int theme_dark=0,busy_visible=0,busy_phase=0;
static drm_disp_t *active_display=NULL;
static uint32_t busy_last=0,busy_heartbeat=0;
static int paint_frame(drm_disp_t*,const char*);
static void motion_discard(void);
static void motion_cancel(void);
static int deferred_present=0;
static tf_drag drag;static tf_settle settle;
static uint16_t *swipe_old=NULL,*swipe_next=NULL;
static int swipe_direction=0,swipe_top=0,swipe_scroll=0;
static char swipe_page[96],swipe_previous[96];
static uint32_t motion_last_frame=0;
static long sms_id=-1;
static int sms_filter=0;
static int scroll_y=0, page_h=480,frame_ready=0;
static uint32_t notice_until;
static devui_data_t state;
static int aggregate_home=0;
static tf_network_runtime network_runtime;
static tf_wifi_runtime wifi_runtime;
static const tf_wifi_state *wifi_observed(void){return &wifi_runtime.state;}
static void wifi_status_invalidate(void){tf_wifi_runtime_invalidate(&wifi_runtime);}
static int wifi_status_read_now(void);
static void stop_signal(int sig){(void)sig;running=0;tf_http_cancelled=1;}
static long long monotonic_seconds(void){struct timespec value;if(clock_gettime(CLOCK_MONOTONIC,&value))return -1;return (long long)value.tv_sec;}
static void heartbeat(void){if(!frame_ready)return;long long now=monotonic_seconds();if(now<0)return;FILE*f=fopen("/tmp/topflow-screen/heartbeat","w");if(f){fprintf(f,"%lld\n",now);fclose(f);}}
static uint32_t tick(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return(uint32_t)(t.tv_sec*1000+t.tv_nsec/1000000);}
/* Only called for an explicit confirmation. Routine refresh stays asynchronous. */
static int wifi_status_read_now(void){
 wifi_status_invalidate();char*body=malloc(TF_WIFI_RESPONSE_LIMIT+1);if(!body)return 0;
 const char*request="{\"action\":\"wifi.state\",\"params\":{}}";
 int okay=tf_http_timeout(9460,"POST","/control",NULL,request,body,TF_WIFI_RESPONSE_LIMIT+1,2500)==200&&tf_wifi_state_parse(body,tick(),wifi_runtime.sequence+1,&wifi_runtime.state);
 free(body);if(okay){wifi_runtime.sequence++;wifi_runtime.scheduled=1;wifi_runtime.next_at=tick()+3000;}return okay;
}
#include "vendor_modem.h"
#include "native_failure.h"
#include "display_native.h"
#include "pin_native.h"
#include "soft_lock.h"
#include "lock_wallpaper.h"
static tf_soft_lock soft_lock;
#include "display_runtime.h"

static void esc(char *dst,size_t cap,const char *src){size_t n=0;for(;src&&*src&&n+7<cap;src++){const char *e=NULL;switch(*src){case '&':e="&amp;";break;case '<':e="&lt;";break;case '>':e="&gt;";break;case '\"':e="&quot;";break;case '\'':e="&#39;";break;}if(e){size_t l=strlen(e);memcpy(dst+n,e,l);n+=l;}else dst[n++]=*src;}dst[n]=0;}
static const char *field(const char *j,const char *key,char *out,size_t cap){out[0]=0;if(!j||!json_get(j,key,out,cap)||!out[0]||!strcmp(out,"null"))snprintf(out,cap,"未知");return out;}
static void rate(char *out,size_t cap,const char *json,const char *key){char x[64],*end;double v; if(!json_get(json,key,x,sizeof x)||(v=strtod(x,&end))<0||!isfinite(v)||end==x||*end){snprintf(out,cap,"—");return;}snprintf(out,cap,"%.2f Mbps",v*8.0/1000000.0);}
static int next_obj(const char **p,char *dst,size_t cap){const char *s=strchr(*p,'{'),*q;int depth=0,quote=0;if(!s)return 0;for(q=s;*q;q++){if(quote){if(*q=='\\'&&q[1]){q++;continue;}if(*q=='\"')quote=0;}else if(*q=='\"')quote=1;else if(*q=='{')depth++;else if(*q=='}'&&!--depth){size_t n=q-s+1;*p=q+1;if(n>=cap)return 0;memcpy(dst,s,n);dst[n]=0;return 1;}}return 0;}

struct token{char k[40];char v[1024];};
static struct token tokens[192];static int nt;
static char ca_detail_html[8192];
static const char rate_chart[]="<div id='rate-chart' style='height:37px;width:100%'></div>";
static tf_rate_history chart_history[2];
static tf_lock_chart lock_chart;
static int lock_chart_rendering=0;
static int chart_initialized=0,chart_data_current=0;
static void update_chart(const char*raw,double rx,double tx,double total_rx,double total_tx){
 if(!chart_initialized){tf_rate_init(&chart_history[0]);tf_rate_init(&chart_history[1]);chart_initialized=1;}
 chart_data_current=raw!=NULL;long stamp=raw?json_get_int(raw,"ts",-1):-1;
 tf_rate_push(&chart_history[0],stamp,rx,tx);tf_rate_push(&chart_history[1],stamp,total_rx,total_tx);
}
static struct{double from[2][30],to[2][30];int n,scope,x,y,w,h,active,frame;long stamp;uint32_t started;}chart_animation;
static void chart_animation_draw(int frame){double rx[30],tx[30];for(int i=0;i<chart_animation.n;i++){double*output[2]={rx,tx};for(int k=0;k<2;k++){double a=chart_animation.from[k][i],b=chart_animation.to[k][i];output[k][i]=a>=0&&b>=0?a+(b-a)*frame/4.0:b;}}html_view_rate_chart(chart_animation.x,chart_animation.y,chart_animation.w,chart_animation.h,rx,tx,chart_animation.n);}
static void draw_rate_chart_content(void){
 int x,y,w,h,current=lock_chart_rendering?lock_chart.current:chart_data_current;if(!current||!html_view_rect("#rate-chart",&x,&y,&w,&h)){chart_animation.active=0;chart_animation.n=0;return;}
 int scope=lock_chart_rendering?lock_chart.mode+2:!strcmp(page,"aggregate.html");tf_rate_history*history=lock_chart_rendering?&lock_chart.scope[lock_chart.mode]:&chart_history[scope];double rx[30],tx[30];int n=tf_rate_order(history,rx,tx);
 int growing=lock_chart_rendering&&n==chart_animation.n+1&&chart_animation.n>0;
 int animate=n>=2&&(n==chart_animation.n||growing)&&scope==chart_animation.scope&&history->stamp!=chart_animation.stamp&&html_view_chart_save(x,y,w,h);
 memcpy(chart_animation.from,chart_animation.to,sizeof chart_animation.from);if(growing)for(int k=0;k<2;k++)chart_animation.from[k][n-1]=chart_animation.to[k][n-2];memcpy(chart_animation.to[0],rx,(size_t)n*sizeof(double));memcpy(chart_animation.to[1],tx,(size_t)n*sizeof(double));
 chart_animation.n=n;chart_animation.scope=scope;chart_animation.stamp=history->stamp;chart_animation.x=x;chart_animation.y=y;chart_animation.w=w;chart_animation.h=h;chart_animation.active=animate;chart_animation.frame=0;chart_animation.started=tick();
 if(animate)chart_animation_draw(0);else html_view_rate_chart(x,y,w,h,rx,tx,n);
}
static void draw_rate_chart(void){html_view_set_clip_top(html_view_pinned_height());draw_rate_chart_content();html_view_set_clip_top(0);}
static int logical_damage(drm_disp_t*d,int x,int y,int w,int h){int r[4];return !tf_screen_damage(d->width,d->height,x,y,w,h,r)||drm_disp_dirty(d,r[0],r[1],r[2],r[3])>=0;}
static int chart_animation_tick_content(drm_disp_t*d,uint32_t now){if(!chart_animation.active)return 1;int frame=(int)((uint32_t)(now-chart_animation.started)/45);if(frame>4)frame=4;if(frame<=chart_animation.frame)return 1;chart_animation.frame=frame;if(!html_view_chart_restore())return 0;chart_animation_draw(frame);if(frame==4)chart_animation.active=0;return logical_damage(d,chart_animation.x,chart_animation.y,chart_animation.w,chart_animation.h);}
static int chart_animation_tick(drm_disp_t*d,uint32_t now){html_view_set_clip_top(html_view_pinned_height());int ok=chart_animation_tick_content(d,now);html_view_set_clip_top(0);return ok;}
static void token_raw(const char*k,const char*v){if(nt>=192)return;snprintf(tokens[nt].k,sizeof tokens[nt].k,"%s",k);snprintf(tokens[nt].v,sizeof tokens[nt].v,"%s",v?v:"");nt++;}
static void token(const char*k,const char*v){char x[1024];esc(x,sizeof x,v);token_raw(k,x);}
static void number(const char*k,long n){char x[32];if(n<0)snprintf(x,sizeof x,"—");else snprintf(x,sizeof x,"%ld",n);token(k,x);}
static void rate_parts(const char*prefix,double bytes){char key[64],val[64];int font=29;snprintf(key,sizeof key,"%s_VALUE",prefix);if(bytes<0||!isfinite(bytes)){token(key,"—");}else{double mbps=bytes*8.0/1e6;snprintf(val,sizeof val,mbps>=100?"%.1f":"%.2f",mbps);token(key,val);font=strlen(val)<=5?29:strlen(val)==6?24:20;}snprintf(key,sizeof key,"%s_UNIT",prefix);token(key,bytes<0||!isfinite(bytes)?"":"Mbps");snprintf(key,sizeof key,"%s_FONT",prefix);number(key,font);}
static void percentage(const char*key,double value){char text[32];if(!isfinite(value)||value<0)value=0;if(value>100)value=100;snprintf(text,sizeof text,"%.1f",value);token(key,text);}
static void signal_tokens(const char *raw){
 tf_json d;tf_modem m;int parsed=raw&&tf_parse(&d,raw),valid=parsed&&tf_modem_snapshot(&d,"5G",&m);
 const char*labels[]={"RSRP","RSRQ","SINR","RSSI","PCI","ARFCN","CELLID","TAC"};
 for(int i=0;i<8;i++){char value[96];int ok=valid&&tf_modem_signal(&d,&m,i,value,sizeof value);token(labels[i],ok?value:"—");if(i==0)percentage("RSRP_PCT",ok?(strtod(value,NULL)+120)/.45:0);if(i==2)percentage("SINR_PCT",ok?(strtod(value,NULL)+5)/.35:0);}
 if(parsed)tf_free(&d);
}
static void refresh_tokens(void){
 lock_chart_rendering=0;
 const char *raw=data_raw_json();char x[8192],net[4096],arr[65536],obj[16384],val[256],prefix[20],name[40];nt=0;
 memset(&state,0,sizeof state);state.cpu_usage=-1;data_refresh(&state);if(data_snapshot_age_ms()>5000){raw=NULL;memset(&state,0,sizeof state);state.cpu_usage=-1;}token("DATASTATE",raw?"实时":"数据不可用");
 time_t now=time(NULL);struct tm tm;localtime_r(&now,&tm);strftime(val,sizeof val,"%H:%M",&tm);token("TIME",val);
 number("BAT",state.valid?state.bat_percent:-1);{int cs=state.valid?state.charging:-1,cc=state.valid?state.charger_connect:-1;token("BAT_CLASS",tf_battery_class(cs,cc));token("BAT_MARK",tf_battery_mark(cs,cc));token("BAT_STATE",tf_battery_label(cs,cc));number("BAT_FILL",tf_battery_fill(state.valid?state.bat_percent:-1));}number("CPUTEMP",state.valid?state.cpu_temp:-1);number("BATTEMP",state.valid?state.bat_temp:-1);number("CPUUSAGE",state.valid?state.cpu_usage:-1);number("MEM",state.valid?state.mem_used_pct:-1);number("QCI",state.qci>0?state.qci:-1);number("CLIENTS",state.valid?state.clients_total:-1);
 percentage("CPU_PCT",state.valid?state.cpu_usage:0);percentage("MEM_PCT",state.valid?state.mem_used_pct:0);number("WIFI_CLIENTS",state.valid?state.clients_wifi:-1);
 token("THEME",theme_dark?"dark":"light");token("THEMELABEL",theme_dark?"深色":"浅色");token("OPER",state.operator_name[0]?state.operator_name:"未知");token("NETTYPE",tf_radio_label(state.net_type));token("BAND",state.band[0]?state.band:"—");token("SSID",state.wifi_ssid[0]?state.wifi_ssid:"未知");token("KEY","请在 UFI 中查看");token("ENC",state.wifi_enc);token("MODEL","TOPFLOW / MU5252");token("FW",state.fw);signal_tokens(raw);
 if(raw&&json_get(raw,"traffic",x,sizeof x)){rate(val,sizeof val,x,"rx_speed");token("RXSPEED",val);rate(val,sizeof val,x,"tx_speed");token("TXSPEED",val);}else{token("RXSPEED","—");token("TXSPEED","—");}
 double sum_rx=0,sum_tx=0,primary_rx=-1,primary_tx=-1;int sum_ok=1,online_count=0;tf_json modems;int has_modems=raw&&tf_parse(&modems,raw);for(int m=0;m<3;m++){
  const char *id=m==0?"5G":m==1?"4G1":"4G2";snprintf(prefix,sizeof prefix,"M%s",id);obj[0]=0;
  if(raw&&json_get(raw,"modems",arr,sizeof arr)){const char *p=arr;while(next_obj(&p,obj,sizeof obj)){field(obj,"id",val,sizeof val);if(!strcmp(id,val))break;obj[0]=0;}}
  char st[96]="数据不可用";net[0]=0;tf_modem parsed;int valid=has_modems&&tf_modem_snapshot(&modems,id,&parsed);double rx=valid?tf_modem_rate(&modems,&parsed,"rx_speed"):-1,tx=valid?tf_modem_rate(&modems,&parsed,"tx_speed"):-1;
  if(m>0&&valid&&parsed.enabled!=1)rx=tx=-1;
  if(m==0){primary_rx=rx;primary_tx=tx;}if(valid&&parsed.connected==1)online_count++;if(obj[0])json_get(obj,"net",net,sizeof net);if(valid)snprintf(st,sizeof st,"%s",parsed.status);
  snprintf(name,sizeof name,"%s_STATE",prefix);token(name,st);
  int radio_current=valid&&tf_modem_radio_current(&modems,&parsed);
  const char *fields[]={"operator","type","band"},*labels[]={"OPER","TYPE","BAND"};
  for(int k=0;k<3;k++){snprintf(name,sizeof name,"%s_%s",prefix,labels[k]);field(net,fields[k],val,sizeof val);if(k==0){if(!strcmp(val,"China Unicom"))strcpy(val,"中国联通");else if(!strcmp(val,"China Mobile"))strcpy(val,"中国移动");else if(!strcmp(val,"China Telecom"))strcpy(val,"中国电信");char title_key[40];snprintf(title_key,sizeof title_key,"%s_TITLE",prefix);token(title_key,valid&&parsed.connected==1?val:m==0?"主卡":m==1?"扩展卡 1":"扩展卡 2");}if(k==1)snprintf(val,sizeof val,"%s",radio_current?tf_radio_label(val):"—");if(k==2&&(!radio_current||!strcmp(val,"未知")))*val=0;token(name,val);}
  snprintf(name,sizeof name,"%s_CLASS",prefix);token(name,valid&&parsed.connected==1?"":"off");
  long long card_qci=-1;if(valid&&tf_modem_qos_ready(&modems,&parsed))tf_int(&modems,tf_key(&modems,parsed.qos,"qci"),&card_qci);if(card_qci<1||card_qci>255)card_qci=-1;
  snprintf(name,sizeof name,"%s_QCI",prefix);number(name,card_qci>0?card_qci:-1);
  const char*compact=valid&&parsed.enabled==0&&!parsed.conflict?"未启用":st;
  snprintf(val,sizeof val,"%s",compact);if(card_qci>0)snprintf(val,sizeof val,"%s · QCI %lld",compact,card_qci);snprintf(name,sizeof name,"%s_STATUSLINE",prefix);token(name,val);
  snprintf(name,sizeof name,"%s_RX",prefix);rate_parts(name,rx);snprintf(name,sizeof name,"%s_TX",prefix);rate_parts(name,tx);
  if(rx<0||tx<0){if(!(valid&&!parsed.conflict&&(parsed.enabled==0||parsed.presence==0)))sum_ok=0;}else{sum_rx+=rx;sum_tx+=tx;}
  snprintf(name,sizeof name,"%s_RX",prefix);if(rx<0)strcpy(val,"—");else snprintf(val,sizeof val,"%.2f Mbps",rx*8/1e6);token(name,val);snprintf(name,sizeof name,"%s_TX",prefix);if(tx<0)strcpy(val,"—");else snprintf(val,sizeof val,"%.2f Mbps",tx*8/1e6);token(name,val);
 }
 if(has_modems)tf_free(&modems);update_chart(raw,primary_rx,primary_tx,sum_ok?sum_rx:-1,sum_ok?sum_tx:-1);number("ONLINE_COUNT",raw?online_count:-1);
 if(sum_ok){snprintf(val,sizeof val,"%.2f Mbps",sum_rx*8.0/1e6);token("SUM_RX",val);snprintf(val,sizeof val,"%.2f Mbps",sum_tx*8.0/1e6);token("SUM_TX",val);}else{token("SUM_RX","—");token("SUM_TX","—");}
 tf_network_status network;uint32_t network_now=tick();int network_current=network_runtime.sampled&&(uint32_t)(network_now-network_runtime.sampled_at)<=6000;
 tf_network_status_parse(raw,network_current?network_runtime.carrier:-1,&network);tf_network_runtime_apply(&network,&network_runtime,network_now);
 aggregate_home=network.enabled==1;
 token("AGG_STATE",network.enabled==1?"已开启":network.enabled==0?"未开启":"未知");token("AGG_CLASS",aggregate_home?"on":"");token("AGG_LIVE",network.aggregation_label);token("AGG_DETAIL",network.aggregation_detail);token("AGG_MODE",network.mode[0]?network.mode:"未知");
 token("AGG_REMAIN",network.remaining);token("AGG_TODAY",network.today);token("ETH_STATE",network.ethernet_label);token("CA_SUMMARY",network.ca_summary);
 if(!tf_network_ca_html(&network,ca_detail_html,sizeof ca_detail_html))snprintf(ca_detail_html,sizeof ca_detail_html,"<p class='note'>载波明细暂不可用</p>");
 if(network.eth_rx<0)strcpy(val,"—");else snprintf(val,sizeof val,"%.2f Mbps",network.eth_rx*8.0/1e6);token("ETH_RX",val);
 if(network.eth_tx<0)strcpy(val,"—");else snprintf(val,sizeof val,"%.2f Mbps",network.eth_tx*8.0/1e6);token("ETH_TX",val);
 if(network_current&&network_runtime.carrier==1&&network_runtime.speed_mbps>0)snprintf(val,sizeof val,"%d Mbps",network_runtime.speed_mbps);else strcpy(val,"—");token("ETH_SPEED",val);
 for(int k=0;k<2;k++){const char*band=k?"5g":"2g",*suffix=k?"5":"24";enum tf_wifi_display_status ws=tf_wifi_status(wifi_observed(),band,tick());snprintf(name,sizeof name,"WIFI%sSTATE",suffix);token(name,tf_wifi_status_label(ws));snprintf(name,sizeof name,"WIFI%sCLASS",suffix);token(name,ws==TF_WIFI_ON?"on":"off");}
 if(raw&&json_get(raw,"wlan",x,sizeof x)&&json_get(x,"bands",arr,sizeof arr)){const char*p=arr;while(next_obj(&p,obj,sizeof obj)){field(obj,"band",val,sizeof val);const char *suffix=!strcmp(val,"2g")?"24":!strcmp(val,"5g")?"5":NULL;if(!suffix)continue;snprintf(name,sizeof name,"SSID%s",suffix);field(obj,"ssid",val,sizeof val);token(name,val);}}
 token("HOME_MODE",aggregate_home?"聚合模式":"普通模式");token("CONTROLSTATE",controls_enabled?"可操作":"已锁定");
 rate_parts("SUM_RX",sum_ok?sum_rx:-1);rate_parts("SUM_TX",sum_ok?sum_tx:-1);
 token("TOAST",notice_until>tick()?notice:"");
}
static char smslist[131072];
static void build_sms(void){size_t n=(size_t)snprintf(smslist,sizeof smslist,"<table style='width:100%%;border-spacing:4px;table-layout:fixed'><tr>");const char*labels[]={"全部","收件","发件","未读"};for(int i=0;i<4;i++)n+=(size_t)snprintf(smslist+n,sizeof smslist-n,"<td style='width:25%%'><a class='button %s' href='act:smsfilter:%d' style='font-size:12px'>%s</a></td>",sms_filter==i?"":"secondary",i,labels[i]);n+=(size_t)snprintf(smslist+n,sizeof smslist-n,"</tr></table>");int found=0;for(int i=0;i<state.sms_n;i++){if(!tf_sms_filter_match(sms_filter,state.sms[i].tag,state.sms[i].unread))continue;char num[256],body[512],date[128];esc(num,sizeof num,state.sms[i].num);esc(body,sizeof body,state.sms[i].text);esc(date,sizeof date,state.sms[i].date);int r=snprintf(smslist+n,sizeof smslist-n,"<a class='sms' href='act:sms:%ld'><div class='smsh'>%s · %s</div><p class='note'>%s</p><div class='smsp'>%s</div></a>",state.sms[i].id,num,date,tf_sms_status(state.sms[i].tag,state.sms[i].unread),body);if(r<0||(size_t)r>=sizeof smslist-n)break;n+=r;found++;}if(!found)n+=(size_t)snprintf(smslist+n,sizeof smslist-n,"<div class='card'>当前快照中暂无此类短信</div>");snprintf(smslist+n,sizeof smslist-n,"<p class='note'>现有服务快照 · 最多显示 %d 条 · 查看不会修改已读状态</p>",DEVUI_SMS_MAX);}
static const char *lookup(const char*k){if(!strcmp(k,"CA_DETAIL_HTML"))return ca_detail_html;if(!strcmp(k,"SMSLIST"))return smslist;if(!strcmp(k,"RATE_CHART")){tf_rate_history*h=&chart_history[!strcmp(page,"aggregate.html")];int values=0;for(int i=0;i<h->count;i++)if(h->rx[i]>=0||h->tx[i]>=0)values++;if(!chart_data_current)return "<div id='rate-chart' style='height:37px;font-size:11px;color:#d8e5ff'>数据不可用</div>";if(h->count<2||!values)return "<div id='rate-chart' style='height:37px;font-size:11px;color:#d8e5ff'>等待更多实时采样</div>";return rate_chart;}for(int i=0;i<nt;i++)if(!strcmp(k,tokens[i].k))return tokens[i].v;return "—";}
static char *fill(const char *in){char*out=calloc(1,MAX_HTML);if(!out)return NULL;size_t n=0;while(*in&&n+1<MAX_HTML){if(in[0]=='{'&&in[1]=='{'){const char*e=strstr(in+2,"}}");if(e&&e-in<64){char key[64];memcpy(key,in+2,e-in-2);key[e-in-2]=0;const char*v=lookup(key);size_t l=strlen(v);if(n+l>=MAX_HTML)break;memcpy(out+n,v,l);n+=l;in=e+2;continue;}}out[n++]=*in++;}out[n]=0;return out;}
static char *readfile(const char *path){FILE*f=fopen(path,"rb");if(!f)return NULL;char*s=malloc(MAX_HTML);if(!s){fclose(f);return NULL;}size_t n=fread(s,1,MAX_HTML-1,f);s[n]=0;fclose(f);return s;}
static int valid_page(const char*p){size_t n=strlen(p);if(n<6||n>80||strstr(p,"..")||strcmp(p+n-5,".html"))return 0;for(;*p;p++)if(!isalnum((unsigned char)*p)&&*p!='-'&&*p!='_'&&*p!='.')return 0;return 1;}
static void change_page(const char*p,int sub){if(!valid_page(p))return;if(!sub)p=tf_resolve_home_page(p,aggregate_home);char path[256];snprintf(path,sizeof path,"%s/%s%s",UI,sub?"subpages/":"",p);if(access(path,R_OK))return;snprintf(previous,sizeof previous,"%s",page);snprintf(page,sizeof page,"%s%s",sub?"subpages/":"",p);scroll_y=0;sms_id=-1;pending[0]=0;}
static void sync_home_page(void){if(advanced_page||pending[0]||sms_id>=0)return;const char*target=tf_resolve_home_page(page,aggregate_home);if(strcmp(page,target)){snprintf(page,sizeof page,"%s",target);scroll_y=0;}}
static void show_notice(const char*s){snprintf(notice,sizeof notice,"%s",s);notice_until=tick()+5000;}
static void busy_tick(void){if(factory_bus_active){if(!tf_fb_tick(&factory_bus)){display_runtime_fail();return;}if(factory_bus.power_event||factory_bus.resync){tf_http_cancelled=1;return;}}if(!busy_visible||!active_display||!frame_ready||tick()-busy_last<120)return;busy_last=tick();int r=theme_dark?39:222,g=theme_dark?55:233,b=theme_dark?78:252;html_view_fill_round_rect(70,260,180,6,3,r,g,b,255);int step=busy_phase++%22;if(step>11)step=22-step;html_view_fill_round_rect(70+step*14,260,26,6,3,83,137,255,255);if(!logical_damage(active_display,70,260,180,6)){frame_ready=0;running=0;tf_http_cancelled=1;}else if(tick()-busy_heartbeat>=1000){busy_heartbeat=tick();heartbeat();}}
static void show_busy(const char*message){if(!active_display)return;char label[1024],html[4096];esc(label,sizeof label,message);snprintf(html,sizeof html,"<html><head><link rel='stylesheet' href='style.css'></head><body class='%s'><div style='padding:140px 20px 0;min-height:480px'><div class='card' style='height:160px;padding:25px 18px;text-align:center'><h3 style='font-size:17px'>%s</h3><p class='note' style='margin-top:14px'>正在等待现有接口响应</p></div></div></body></html>",theme_dark?"dark":"light",label);html_view_set_scroll(0);if(!paint_frame(active_display,html)){running=0;tf_http_cancelled=1;return;}busy_visible=1;busy_phase=0;busy_last=0;busy_tick();}
static int control(const char*payload){char body[8192];if(tf_http(9460,"POST","/control",NULL,payload,body,sizeof body)!=200)return-1;return tf_control_success(body,payload)?0:-1;}
#include "advanced_controls.h"
#include "page_state_sync.h"
#include "power_menu.h"
#define TF_PIN_BAT_PERCENT (state.valid?state.bat_percent:-1)
#define TF_PIN_BAT_STATUS (state.valid?state.charging:-1)
#define TF_PIN_BAT_CONNECTION (state.valid?state.charger_connect:-1)
static tf_lock_dashboard lock_dashboard;
static tf_lock_motion lock_motion;
static char lock_rx_text[48]="—",lock_tx_text[48]="—";
static void lock_dashboard_prepare(void){lock_wallpaper_prepare();html_view_set_lock_wallpaper(lock_wallpaper.current?lock_wallpaper.pixels:NULL);uint32_t now=tick();const char*raw=data_snapshot_age_ms()<=5000?data_raw_json():NULL;tf_lock_status(raw,&lock_dashboard);lock_chart_rendering=!pin_policy.locked;tf_lock_chart_sample(&lock_chart,lock_dashboard.mode,raw?json_get_int(raw,"ts",-1):-1,lock_dashboard.rx,lock_dashboard.tx);tf_lock_motion_sample(&lock_motion,&lock_dashboard,now);tf_lock_rate_text(pin_policy.locked?lock_dashboard.rx:tf_lock_motion_value(&lock_motion,0,now),lock_rx_text,sizeof lock_rx_text);tf_lock_rate_text(pin_policy.locked?lock_dashboard.tx:tf_lock_motion_value(&lock_motion,1,now),lock_tx_text,sizeof lock_tx_text);}
static const char*lock_chart_hint(void){return !lock_chart.current?"实时曲线暂不可用":lock_chart.scope[lock_chart.mode].count<2?"等待实时采样":"";}
#define TF_LOCK_MODE lock_dashboard.mode
#define TF_LOCK_OPERATOR lock_dashboard.operator_name
#define TF_LOCK_RADIO lock_dashboard.radio
#define TF_LOCK_DETAIL lock_dashboard.detail
#define TF_LOCK_RX lock_rx_text
#define TF_LOCK_TX lock_tx_text
#define TF_LOCK_CARD0 lock_dashboard.cards[0]
#define TF_LOCK_CARD1 lock_dashboard.cards[1]
#define TF_LOCK_CARD2 lock_dashboard.cards[2]
#define TF_LOCK_CHART_HINT lock_chart_hint()
#define TF_LOCK_WALLPAPER lock_wallpaper.current
#include "pin_view.h"
/* Only the two rate rectangles animate between actual already-sampled values.
 * The 320 ms transition stops while touching or sleeping; no extra reads. */
static int lock_rate_animation_tick(drm_disp_t*d,uint32_t now){
 if(!chart_animation_tick(d,now))return 0;if(!tf_lock_motion_frame(&lock_motion,now))return 1;
 for(int i=0;i<2;i++){char value[48];tf_lock_rate_text(tf_lock_motion_value(&lock_motion,i,now),value,sizeof value);int x=i?168:36,size=strlen(value)>7?21:strlen(value)>6?25:30;
  int dark=theme_dark||lock_wallpaper.current;html_view_fill_round_rect(x,260,116,36,0,dark?21:229,dark?43:238,dark?67:251,255);
  html_view_draw_text_px(x,260,value,size,0,i?(dark?115:20):(dark?244:33),i?(dark?217:121):(dark?248:70),i?(dark?195:108):(dark?255:111),255);
 }
 return logical_damage(d,36,260,248,36);
}
static void screen_lock(void){tf_page_state_cancel();tf_wifi_runtime_close(&wifi_runtime);power_menu_reset();lock_wallpaper_invalidate();controls_enabled=0;lock_chart.current=0;lock_chart.mode=-1;lock_motion.initialized=lock_motion.active=0;memset(&chart_animation,0,sizeof chart_animation);tf_soft_lock_reset(&soft_lock,pin_policy.enabled);motion_cancel();if(!display_runtime_unlock_policy())return;tf_pin_lock(&pin_policy);display_policy.locked=pin_policy.locked;pending[0]=0;form_reset();sms_forward_cleanup();factory_extra_cleanup();pin_feedback[0]=0;scroll_y=0;if(factory_bus_active)display_runtime_login(!pin_policy.locked);}
/* A successful PIN entry alone is not enough: recheck the factory policy and
 * login acknowledgement before enabling confirmed business writes. */
static int screen_unlock_complete(void){controls_enabled=0;if(pin_policy.locked||soft_lock.locked||!display_runtime_unlock_policy()||!display_runtime_login(1))return 0;controls_enabled=1;return 1;}
/* Local no-PIN hold is isolated from native PIN authentication and business
 * actions. Return consumption even on the completing/releasing frame. */
static int screen_soft_input(drm_disp_t*d,uint32_t now,int pressed,int x,int y,int blocked,int*dirty){
 if(power_menu.active){if(soft_lock.locked)tf_soft_lock_cancel(&soft_lock);return 0;}
 if(pin_policy.enabled){tf_soft_lock_reset(&soft_lock,1);return 0;}
 int consumed=soft_lock.locked||soft_lock.block_release;
 int result=tf_soft_lock_touch(&soft_lock,now,pressed,x,y,!blocked&&display_runtime_ready&&factory_lifecycle.phase==TF_FL_READY&&backlight_is_on());
 if(result==TF_SOFT_UNLOCK){motion_cancel();if(!screen_unlock_complete())return -1;*dirty=1;}
 else if(result==TF_SOFT_PROGRESS&&backlight_is_on()&&frame_ready){
  int dark=theme_dark||lock_wallpaper.current;
  /* Only the integrated progress line changes while holding. The label and
   * surrounding wallpaper remain untouched; no repeated full-screen paint. */
  html_view_fill_round_rect(TF_SOFT_PROGRESS_X,TF_SOFT_PROGRESS_Y,TF_SOFT_PROGRESS_WIDTH,TF_SOFT_PROGRESS_HEIGHT,1,dark?47:196,dark?70:213,dark?91:234,255);
  int w=soft_lock.progress*TF_SOFT_PROGRESS_WIDTH/1000;if(w>0)html_view_fill_round_rect(TF_SOFT_PROGRESS_X,TF_SOFT_PROGRESS_Y,w,TF_SOFT_PROGRESS_HEIGHT,1,dark?115:32,dark?217:126,dark?195:201,255);
  if(!logical_damage(d,TF_SOFT_PROGRESS_X,TF_SOFT_PROGRESS_Y,TF_SOFT_PROGRESS_WIDTH,TF_SOFT_PROGRESS_HEIGHT))return -1;
 }
 return consumed;
}
static void action(const char*a){
 tf_page_state_cancel();
 if(!a||strncmp(a,"act:",4))return;a+=4;
 if(!display_runtime_ready||factory_lifecycle.phase!=TF_FL_READY||factory_lifecycle.brightness<=0)return;
 if(power_menu_action(a))return;
 if(pin_policy.locked){pin_action(a);if(!pin_policy.locked)screen_unlock_complete();return;}
 if(soft_lock.locked||soft_lock.block_release)return;
 if(!tf_fl_input_allowed(&factory_lifecycle,1))return;
 if(!strcmp(a,"screen-lock")){screen_lock();return;}
 if(!strcmp(a,"theme")){theme_dark=!theme_dark;return;}
 if(!strncmp(a,"page:",5)){sms_forward_cleanup();factory_extra_cleanup();advanced_page=0;change_page(a+5,0);return;}
 if(!strncmp(a,"sub:",4)){sms_forward_cleanup();factory_extra_cleanup();advanced_page=0;change_page(a+4,1);return;}
 if(!strcmp(a,"smsclose")){sms_id=-1;scroll_y=0;return;}
 if(!strncmp(a,"smsfilter:",10)){if(strlen(a+10)==1&&a[10]>='0'&&a[10]<='3'){sms_filter=a[10]-'0';sms_id=-1;scroll_y=0;}return;}
 if(!strcmp(a,"backfunc")){sms_id=-1;snprintf(page,sizeof page,"%s",previous);scroll_y=0;pending[0]=0;return;}
 if(!strncmp(a,"sms:",4)){char*end;long id=strtol(a+4,&end,10);if(!*end&&id>=0){sms_id=id;scroll_y=0;}return;}
 if(!strcmp(a,"cancel")){pending[0]=0;scroll_y=0;return;}
 if(!strcmp(a,"confirm")){if(!pending[0]||advanced_confirm())return;if(pending[0]=='{'){char payload[4096];snprintf(payload,sizeof payload,"%s",pending);pending[0]=0;show_busy("正在提交设备设置");if(control(payload)==0)verify_begin(payload);else show_notice("操作失败，请在 UFI 检查");scroll_y=0;}return;}
 if(advanced_action(a)){if(advanced_page<17||advanced_page>19)factory_extra_cleanup();return;}
 if(!strcmp(a,"wifi24")||!strcmp(a,"wifi5")){
  if(!control_guard())return;
  const char *band=!strcmp(a,"wifi24")?"2g":"5g";const tf_wifi_state*ws=wifi_observed();int on=tf_wifi_configured(ws,band,tick());
  if(on<0||ws->busy!=0){show_notice(ws->busy==1?"Wi-Fi 正在应用设置，请等待状态更新":"Wi-Fi 状态未知，未提交");return;}
  if(ws->module_user_enabled==0){show_notice("Wi-Fi 总开关已关闭，请先在 UFI 开启总开关");return;}
  snprintf(pending,sizeof pending,"{\"action\":\"wifi.radio.set\",\"params\":{\"band\":\"%s\",\"enabled\":%s}}",band,on?"false":"true");snprintf(pending_label,sizeof pending_label,"%s %s WiFi",on?"关闭":"开启",band);return;
 }
 show_notice("请在 UFI 配置此功能");
}
static int paint_frame(drm_disp_t*d,const char*html){if(!deferred_present)frame_ready=0;if(!html)return 0;int h=html_view_render_html(html);if(h<1)return 0;page_h=h;draw_rate_chart();if(deferred_present)return 1;if(drm_disp_dirty(d,0,0,d->width-1,d->height-1)<0)return 0;frame_ready=1;return 1;}
static int render(drm_disp_t*d){busy_visible=0;if(power_menu.active){refresh_tokens();power_menu_render();html_view_set_scroll(0);return paint_frame(d,advanced_html);}if(pin_policy.locked||soft_lock.locked){data_refresh(&state);if(data_snapshot_age_ms()>5000)state.valid=0;lock_dashboard_prepare();}if(pin_policy.locked){html_view_set_scroll(0);return paint_frame(d,pin_screen_html());}if(soft_lock.locked){html_view_set_scroll(0);return paint_frame(d,soft_screen_html(soft_lock.progress));}refresh_tokens();sync_home_page();build_sms();char path[256];snprintf(path,sizeof path,"%s/%s",UI,page);char*tmpl=readfile(path),*html=NULL;
 if(pending[0]){char label[10000];esc(label,sizeof label,pending_label);advanced_shell_frame("确认操作","act:cancel",0);ah("<div class='card'><p style='margin:8px 0 16px;word-break:break-all;line-height:24px'>%s</p><a href='act:confirm' class='button'>确认执行</a></div></div></body></html>",label);html=strdup(advanced_html);}
 else if(sms_id>=0){for(int i=0;i<state.sms_n;i++)if(state.sms[i].id==sms_id){char num[256],text[48000];esc(num,sizeof num,state.sms[i].num);esc(text,sizeof text,state.sms[i].text);advanced_shell_frame("短信详情","act:smsclose",0);ah("<div class='card'><h3 style='word-break:break-all'>%s</h3><p style='white-space:pre-wrap;word-break:break-all;margin-top:12px'>%s</p></div></div></body></html>",num,text);html=strdup(advanced_html);break;}}
 if(!html&&advanced_page)html=advanced_render();if(!html&&tmpl)html=fill(tmpl);free(tmpl);if(!html)html=strdup("<html><body style='background:#101828;color:white;padding:20px'><a href='act:page:index.html' style='float:right;color:white'>返回</a><h2>TopFlow Screen</h2><p>页面不可用，请在 UFI 插件检查屏幕程序。</p></body></html>");
 html_view_set_scroll(scroll_y);int ok=paint_frame(d,html);free(html);return ok;
}
/* Page buffers exist only while a swipe is active (at most 1.9 MiB at the
 * validated maximum pitch, normally 600 KiB). Vertical motion reuses the doc. */
static void motion_discard(void){free(swipe_old);free(swipe_next);swipe_old=swipe_next=NULL;settle.active=0;tf_drag_reset(&drag);chart_animation.active=0;}
static void motion_cancel(void){if(swipe_old){snprintf(page,sizeof page,"%s",swipe_page);snprintf(previous,sizeof previous,"%s",swipe_previous);scroll_y=swipe_scroll;}motion_discard();}
static int current_main_page(void){return tf_main_page_index(page);}
static int swipe_begin(drm_disp_t*d,int current,int direction){
 if(current<0||current>=TF_MAIN_PAGE_COUNT||d->pitch_px<320||d->pitch_px>1024)return 0;
 size_t bytes=(size_t)d->pitch_px*d->height*sizeof(uint16_t);
 swipe_old=malloc(bytes);swipe_next=malloc(bytes);if(!swipe_old||!swipe_next){free(swipe_old);free(swipe_next);swipe_old=swipe_next=NULL;return 0;}
 memcpy(swipe_old,d->fb,bytes);snprintf(swipe_page,sizeof swipe_page,"%s",page);snprintf(swipe_previous,sizeof swipe_previous,"%s",previous);swipe_scroll=scroll_y;swipe_direction=direction;swipe_top=html_view_pinned_height();
 change_page(tf_main_page_name(tf_next_page(current,direction>0?TF_NEXT:TF_PREVIOUS,TF_MAIN_PAGE_COUNT),aggregate_home),0);
 deferred_present=1;html_view_target_native_begin(swipe_next,d->pitch_px);int ok=render(d);html_view_target_end();deferred_present=0;chart_animation.active=0;
 if(!ok){motion_discard();frame_ready=0;return -1;}return 1;
}
static int swipe_draw(drm_disp_t*d,int shift){tf_slide_frame_region(d->fb,swipe_old,swipe_next,d->width,d->height,d->pitch_px,shift,tf_screen_slide_direction(swipe_direction),swipe_top);return logical_damage(d,0,swipe_top,d->width,d->height-swipe_top);}
static int swipe_finish(drm_disp_t*d,int commit){
 int ok;if(commit){memcpy(d->fb,swipe_next,(size_t)d->pitch_px*d->height*sizeof(uint16_t));html_view_set_scroll(0);ok=drm_disp_dirty(d,0,0,d->width-1,d->height-1)>=0;}
 else{snprintf(page,sizeof page,"%s",swipe_page);snprintf(previous,sizeof previous,"%s",swipe_previous);scroll_y=swipe_scroll;ok=render(d);}
 motion_discard();return ok;
}
static int repaint_scroll(drm_disp_t*d){
 chart_animation.active=0;html_view_set_scroll(scroll_y);int h=html_view_repaint();
 if(h<1)return render(d);page_h=h;draw_rate_chart();chart_animation.active=0;int top=html_view_pinned_height();return logical_damage(d,0,top,d->width,d->height-top);
}
static int runtime_wake(drm_disp_t*d){
 screen_lock();if(!running||!display_runtime_begin_frame()||!render(d))return display_runtime_fail();
 if(!display_runtime_wake_sensor())return display_runtime_fail();
 if(tf_display_wake(&display_policy,tick())!=TF_DISPLAY_LEVEL)return display_runtime_fail();if(!display_runtime_request(display_policy.brightness))return 0;controls_enabled=!pin_policy.locked&&!soft_lock.locked;return 1;
}
static int runtime_sleep(void){screen_lock();tf_display_sleep(&display_policy);return running&&display_runtime_request(0);}
/* Original power notifications distinguish sleep from wake. A duplicate wake
 * while already on must not relock the page or replay a display transaction. */
static int runtime_power_event(drm_disp_t*d,int event){if(event==1)return runtime_sleep();if(event==2)return display_policy.on?1:runtime_wake(d);return 0;}
/* A held power key opens a local overlay, never a second wake transaction on
 * an already lit screen. Physical short presses retain the original policy. */
static int runtime_key_event(drm_disp_t*d,int key_event){
 if(key_event==KEY_EV_SHORT)return backlight_is_on()?runtime_sleep():runtime_wake(d);
 if(key_event!=KEY_EV_LONG)return 1;
 if(!backlight_is_on()&&!runtime_wake(d))return 0;
 if(!running||!display_runtime_ready||factory_lifecycle.phase!=TF_FL_READY)return 0;
 motion_cancel();tf_display_activity(&display_policy,tick());power_menu_open();return running;
}
int main(int argc,char**argv){
 if(argc==2&&!strcmp(argv[1],"--monotonic-seconds")){long long value=monotonic_seconds();if(value<0)return 7;printf("%lld\n",value);return 0;}
 signal(SIGINT,stop_signal);signal(SIGTERM,stop_signal);signal(SIGPIPE,SIG_IGN);
 tf_network_runtime_init(&network_runtime);
 tf_wifi_runtime_init(&wifi_runtime);
 int preflight_only=argc==2&&!strcmp(argv[1],"--display-preflight");
 if(!preflight_only&&(argc!=3||strcmp(argv[1],"--display-adopt"))){fprintf(stderr,"Verified supervisor handover required\n");return 2;}
 /* This path is read-only and runs before DRM, evdev, brightness or datad.
  * The supervisor also runs it before stopping the original screen. */
 if(preflight_only){char receipt[384];if(!display_preflight_receipt(receipt,sizeof receipt)){fprintf(stderr,"%s\n",display_refusal?display_refusal:"DISPLAY_LIFECYCLE_PREFLIGHT_FAILED");return 7;}puts(receipt);return 0;}
 atexit(native_failure_publish);
 if(!display_prepare_adopt(argv[2])){fprintf(stderr,"DISPLAY_HANDOVER_UNAVAILABLE\n");return 7;}
 if(!pin_native_init(display_config.pin_enabled)){display_runtime_cleanup();pin_native_cleanup();fprintf(stderr,"PIN_STATE_UNAVAILABLE\n");return 7;}
 tf_soft_lock_reset(&soft_lock,pin_policy.enabled);
 const char*font=getenv("DEVUI_FONT");if(!font||!*font)font="/usr/ui/fonts/ZTEZhengYuan.ttf";
 if(access(UI "/index.html",R_OK)||access(font,R_OK)){native_failure_note("UI_RESOURCE");display_runtime_cleanup();pin_native_cleanup();return 2;}
 if(!display_runtime_begin_frame()){display_runtime_cleanup();pin_native_cleanup();return 7;}
 drm_disp_t d;if(drm_disp_init(&d)){native_failure_note("DRM_INIT");display_runtime_cleanup();pin_native_cleanup();return 3;}
 if(d.width!=320||d.height!=480){native_failure_note("DRM_DIMENSIONS");display_runtime_cleanup();pin_native_cleanup();drm_disp_close(&d);return 4;}
 if(!display_runtime_after_drm(d.fd>=0&&d.fb!=NULL)){display_runtime_cleanup();pin_native_cleanup();drm_disp_close(&d);return 7;}
 if(!tf_display_init_supported(&display_policy,&display_config,tick(),1)){native_failure_note("DISPLAY_POLICY_INIT");display_runtime_cleanup();pin_native_cleanup();drm_disp_close(&d);return 7;}
 touch_input_t touch;if(touch_input_init(&touch,320,480)){native_failure_note("TOUCH_INIT");display_runtime_cleanup();pin_native_cleanup();drm_disp_close(&d);return 5;}
 key_input_t key;key_input_init(&key);backlight_init();html_view_init(d.fb,d.width,d.height,d.pitch_px,DEVUI_ROTATE_180,font);html_view_set_uidir(UI);
 if(!html_view_ready()){native_failure_note("FONT_INIT");display_runtime_cleanup();pin_native_cleanup();touch_input_close(&touch);key_input_close(&key);drm_disp_close(&d);return 6;}
 active_display=&d;tf_http_wait_hook=busy_tick;
 int result=0;if(!display_runtime_startup_frame()){result=7;goto cleanup;}vendor_refresh(0);if(!render(&d)){native_failure_note("FIRST_FRAME");result=6;goto cleanup;}if(!display_runtime_adopt()){native_failure_note("DISPLAY_ADOPT");result=7;goto cleanup;}controls_enabled=!pin_policy.locked&&!soft_lock.locked;display_level_hook=display_runtime_request;display_auto_sensor_hook=display_runtime_prepare_auto_sensor;heartbeat();data_backend_init();data_backend_commit_latest();uint32_t last=tick(),gesture_block_until=0,last_interaction=0;int refresh_pending=1;time_t minute=time(NULL)/60;
 while(running){uint32_t now=tick();int dirty=0,x,y,pressed;
  if(!tf_fb_tick(&factory_bus)){native_failure_note("BUS_RUNTIME");result=7;break;}
  if(factory_bus.power_event){int event=factory_bus.power_event;factory_bus.power_event=0;tf_http_cancelled=0;if(!runtime_power_event(&d,event)){result=7;break;}touch_input_clear_taps(&touch);gesture_block_until=tick()+300;dirty=1;}
  if(factory_bus.resync){tf_http_cancelled=0;screen_lock();if(!running||!display_runtime_begin_frame()||!render(&d)||!display_runtime_resync()){result=7;break;}controls_enabled=!pin_policy.locked&&!soft_lock.locked;dirty=1;}
  if(!running){result=7;break;}tf_http_cancelled=0;
  /* Read input before background reconnection or configuration polling. */
  touch_input_read(&touch,&x,&y,&pressed);if(!display_runtime_touch(pressed,now)){result=7;break;}
  if(gesture_block_until){if((int32_t)(gesture_block_until-now)>0)touch_input_clear_taps(&touch);else gesture_block_until=0;}
  int k=key_input_poll(&key,now);if(k==KEY_EV_LONG||k==KEY_EV_SHORT){int ok=runtime_key_event(&d,k);if(!ok){result=7;break;}touch_input_clear_taps(&touch);gesture_block_until=tick()+300;dirty=1;}
  if(power_menu_filter_touch(pressed)){touch_input_clear_taps(&touch);gesture_block_until=tick()+120;}
  now=tick();int soft_consumed=screen_soft_input(&d,now,pressed,x,y,gesture_block_until!=0,&dirty);if(soft_consumed<0){result=7;break;}if(soft_consumed){touch_input_clear_taps(&touch);if(!soft_lock.locked&&soft_lock.block_release)gesture_block_until=tick()+300;}
  if(pressed)last_interaction=now;
  int can_interact=backlight_is_on()&&!power_menu.active&&!pin_policy.locked&&!soft_consumed&&!gesture_block_until;
  if(settle.active&&pressed){if(!swipe_finish(&d,settle.to==d.width)){result=6;break;}/* Continue this new press against the finished page; never swallow it. */}
  if(can_interact&&!settle.active){
   if(pressed){
    if(!drag.down)tf_drag_begin(&drag,touch.press_x,touch.press_y,scroll_y);
    int previous_mode=drag.mode,current=current_main_page();int content=drag.y0>=html_view_pinned_height();
    tf_drag_move(&drag,x,y,content&&current>=0&&sms_id<0&&!advanced_page&&!pending[0],content&&page_h>d.height,page_h>d.height?page_h-d.height:0,d.width);
    if(drag.mode==TF_DRAG_HORIZONTAL&&!previous_mode){int prepared=swipe_begin(&d,current,drag.direction);if(prepared<0){result=6;break;}if(!prepared){drag.mode=TF_DRAG_NONE;}}
    if(drag.mode&&(uint32_t)(now-motion_last_frame)>=16){motion_last_frame=now;chart_animation.active=0;int ok=1;
     if(drag.mode==TF_DRAG_HORIZONTAL&&swipe_old)ok=swipe_draw(&d,drag.offset);
     else if(drag.mode==TF_DRAG_VERTICAL&&scroll_y!=drag.offset){scroll_y=drag.offset;ok=repaint_scroll(&d);}
     if(!ok){result=6;break;}
    }
   }else if(drag.down){
    int mode=drag.mode;tf_drag_move(&drag,x,y,0,0,page_h>d.height?page_h-d.height:0,d.width);last_interaction=now;
    if(mode==TF_DRAG_HORIZONTAL&&swipe_old){tf_settle_begin(&settle,drag.offset,drag.offset>=56?d.width:0,tick());touch_input_clear_taps(&touch);}
    else if(mode==TF_DRAG_VERTICAL){if(scroll_y!=drag.offset){scroll_y=drag.offset;if(!repaint_scroll(&d)){result=6;break;}}touch_input_clear_taps(&touch);}
    tf_drag_reset(&drag);
   }
  }else if(!settle.active&&!swipe_old)tf_drag_reset(&drag);
  int x0,y0,x1,y1,is_tap;
  if(!soft_consumed&&!gesture_block_until&&!drag.mode&&!settle.active&&touch_input_take_latest_gesture(&touch,&x0,&y0,&x1,&y1,&is_tap)){
   if(!backlight_is_on()){touch_input_clear_taps(&touch);gesture_block_until=tick()+300;}
   else{
    int current=current_main_page(),content=y0>=html_view_pinned_height();tf_display_activity(&display_policy,now);
    enum tf_gesture gesture=tf_classify_gesture(x0,y0,x1,y1,is_tap,content&&!power_menu.active&&!pin_policy.locked&&current>=0&&sms_id<0&&!advanced_page,content&&!power_menu.active&&!pin_policy.locked&&page_h>480,pending[0]!=0||power_menu.active);
    last_interaction=now;
    if(gesture==TF_NEXT||gesture==TF_PREVIOUS){int direction=gesture==TF_NEXT?1:-1;int prepared=swipe_begin(&d,current,direction);if(prepared<0){result=6;break;}if(prepared)tf_settle_begin(&settle,0,d.width,tick());else{change_page(tf_main_page_name(tf_next_page(current,gesture,TF_MAIN_PAGE_COUNT),aggregate_home),0);dirty=1;}touch_input_clear_taps(&touch);}
    else if(gesture==TF_SCROLL){scroll_y=tf_motion_clamp(scroll_y-(y1-y0),page_h-480);if(!repaint_scroll(&d)){result=6;break;}}
    else if(gesture==TF_TAP){const char*a=html_view_click((float)x0,(float)y0);char copy[192];snprintf(copy,sizeof copy,"%s",a?a:"");action(copy);touch_input_clear_taps(&touch);gesture_block_until=tick()+((advanced_page==7||advanced_page==15||advanced_page==18||pin_policy.locked)?80:120);dirty=1;}
   }
  }
  if(settle.active){int offset;if(tf_settle_frame(&settle,tick(),&offset)){int ok=settle.active?swipe_draw(&d,offset):swipe_finish(&d,settle.to==d.width);if(!ok){result=6;break;}}}
  now=tick();int periodic=(uint32_t)(now-last)>=1000,interacting=pressed||drag.mode||swipe_old||settle.active||(uint32_t)(now-last_interaction)<160;
  if(!interacting)data_backend_poll(now);
  int sync_idle=!interacting&&!busy_visible&&!pending[0]&&!verifying[0]&&!power_menu.active&&display_runtime_ready&&backlight_is_on()&&!factory_bus.power_event&&!factory_bus.resync;
  if(tf_page_state_poll(now,sync_idle&&controls_enabled&&!pin_policy.locked&&!soft_lock.locked,sync_idle))refresh_pending=1;
  if(!running){result=7;break;}
  int wifi_visible=backlight_is_on()&&!pin_policy.locked&&!soft_lock.locked&&((!advanced_page&&!strcmp(page,"apps.html"))||advanced_page==22||advanced_page==20||(advanced_page==17&&fx.kind==2)||((advanced_page==6||advanced_page==7)&&form_kind==2)||strstr(verifying,"\"wifi.radio.set\"")!=NULL);
  if(!wifi_visible){if(tf_wifi_runtime_refresh(&wifi_runtime,now,0))refresh_pending=1;}
  else if(!interacting&&!busy_visible){if(tf_wifi_runtime_refresh(&wifi_runtime,now,1))refresh_pending=1;if(tf_wifi_runtime_poll(&wifi_runtime,now))refresh_pending=1;}
  if(periodic){last=now;if(!interacting){if(data_backend_commit_latest())refresh_pending=1;if(backlight_is_on()&&!busy_visible){uint32_t sampled_before=network_runtime.sampled_at;tf_network_runtime_refresh(&network_runtime,data_snapshot_age_ms()<=5000?data_raw_json():NULL,tick());if(network_runtime.sampled_at!=sampled_before)refresh_pending=1;}int en0=tf_external_enabled[0],en1=tf_external_enabled[1],was_verifying=verifying[0]!=0;uint32_t notice_before=notice_until;vendor_refresh(0);verify_update();if(en0!=tf_external_enabled[0]||en1!=tf_external_enabled[1]||was_verifying!=(verifying[0]!=0)||notice_before!=notice_until)refresh_pending=1;}
   time_t next_minute=time(NULL)/60;if(next_minute!=minute){minute=next_minute;refresh_pending=1;}
   if(notice_until&&tick()>=notice_until){notice_until=0;refresh_pending=1;}
   if(data_snapshot_age_ms()>5000&&chart_data_current)refresh_pending=1;
   if(pin_policy.locked||soft_lock.locked||verifying[0])refresh_pending=1;
   if(!pin_native_poll()){result=7;running=0;}
   int lux=-1,valid=display_policy.config.automatic&&backlight_is_on()?display_read_lux(&lux):0;int display_change=tf_display_tick(&display_policy,tick(),lux,valid,busy_visible||pending[0]);
   if(display_change==TF_DISPLAY_SLEEP){if(!runtime_sleep()){result=7;running=0;}}
  }
  /* Defer backlight transactions while dragging/settling; they share the
   * existing verified lifecycle and never create additional LCD on/off events. */
  if(running&&!interacting&&!busy_visible&&tf_display_animate(&display_policy,tick())==TF_DISPLAY_LEVEL&&!display_runtime_request(display_policy.brightness)){result=7;running=0;}
  if(pin_fault){result=7;running=0;}
  if(refresh_pending&&!interacting){dirty=1;refresh_pending=0;}
  if(dirty&&running&&!swipe_old&&!drag.mode){if(backlight_is_on()){if(!render(&d)){result=6;break;}heartbeat();}else if(periodic&&frame_ready)heartbeat();}
  else if(periodic&&frame_ready)heartbeat();
  if(!dirty&&!interacting&&running&&frame_ready&&backlight_is_on()&&!power_menu.active&&soft_lock.locked&&!pin_policy.locked&&!busy_visible&&!lock_rate_animation_tick(&d,tick())){frame_ready=0;result=6;break;}
  if(!dirty&&!interacting&&running&&frame_ready&&backlight_is_on()&&!power_menu.active&&!pin_policy.locked&&!soft_lock.locked&&!busy_visible&&!pending[0]&&!advanced_page&&!chart_animation_tick(&d,tick())){frame_ready=0;result=6;break;}
  usleep(backlight_is_on()?8000:30000);
 }
 cleanup:tf_page_state_close();tf_wifi_runtime_close(&wifi_runtime);html_view_set_lock_wallpaper(NULL);tf_wallpaper_clear(&lock_wallpaper);motion_discard();if(display_runtime_fault)result=7;if(result==6)native_failure_note("FRAME_RENDER");else if(result==7)native_failure_note("DISPLAY_RUNTIME");display_level_hook=NULL;display_auto_sensor_hook=NULL;tf_http_wait_hook=NULL;display_runtime_cleanup();sms_forward_cleanup();factory_extra_cleanup();pin_native_cleanup();data_backend_close();touch_input_close(&touch);key_input_close(&key);drm_disp_close(&d);return result;
}
