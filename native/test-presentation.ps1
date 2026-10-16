$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$data=[IO.File]::ReadAllText("$root/upstream/src/data.c")
$parse=$data.Substring($data.IndexOf('static void getstr('),$data.IndexOf('static int set_nonblock(')-$data.IndexOf('static void getstr('))
if($data -match 'force_hsr_enabled|DEVUI_FORCE_HSR|u60-force-hsr'){throw 'Release data layer contains a forced-state debug override'}
$helpers=$main.Substring($main.IndexOf('static void esc('),$main.IndexOf('static char smslist[')-$main.IndexOf('static void esc('))
$code=@'
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <ctype.h>
#include "data.h"
#include "json.h"
#include "modem_logic.h"
#include "radio_status.h"
#include "rate_history.h"
#include "lockscreen_chart.h"
#include "battery_state.h"
#include "screen_geometry.h"
#include "network_status.h"
#include <sys/types.h>
static ssize_t presentation_readlink(const char*p,char*b,size_t n){(void)p;(void)b;(void)n;return -1;}
#define readlink presentation_readlink
#include "network_runtime.h"
static tf_network_runtime network_runtime;
#define DEVUI_STATE_BUF_MAX 1048576
#define DEVUI_SMS_BUF_MAX 1048576
#define DEVUI_SMS_OBJECT_MAX (DEVUI_SMS_TEXT_MAX + 32768)
PARSER
typedef struct{int width,height;}drm_disp_t;
static devui_data_t state;
static const char*fixture;
static char page[32]="index.html",notice[256]="";
static int theme_dark=0,controls_enabled=0,aggregate_home=0;
static uint32_t notice_until=0,snapshot_age=0;
static struct tm*localtime_r(const time_t*t,struct tm*out){struct tm*p=localtime(t);if(p)*out=*p;return p?out:NULL;}
static const char*data_raw_json(void){return fixture;}
static uint32_t data_snapshot_age_ms(void){return snapshot_age;}
int data_refresh(devui_data_t*d){return parse_snapshot(d,fixture);}
static uint32_t tick(void){return 1000;}
static void vendor_refresh(int force){(void)force;tf_json d;if(!tf_parse(&d,fixture))return;int mods=tf_key(&d,tf_key(&d,0,"factory"),"modems");tf_external_enabled[0]=tf_bool(&d,tf_key(&d,tf_key(&d,mods,"4G1"),"enabled"));tf_external_enabled[1]=tf_bool(&d,tf_key(&d,tf_key(&d,mods,"4G2"),"enabled"));tf_free(&d);}
static int html_view_rect(const char*s,int*x,int*y,int*w,int*h){(void)s;(void)x;(void)y;(void)w;(void)h;return 0;}
static void html_view_rate_chart(int x,int y,int w,int h,const double*a,const double*b,int n){(void)x;(void)y;(void)w;(void)h;(void)a;(void)b;(void)n;}
static int html_view_chart_save(int x,int y,int w,int h){(void)x;(void)y;(void)w;(void)h;return 0;}
static int html_view_chart_restore(void){return 0;}
static int html_view_pinned_height(void){return 67;}
static void html_view_set_clip_top(int top){(void)top;}
static int drm_disp_dirty(drm_disp_t*d,int a,int b,int c,int e){(void)d;(void)a;(void)b;(void)c;(void)e;return 0;}
HELPERS
static const char*value(const char*key){for(int i=0;i<nt;i++)if(!strcmp(tokens[i].k,key))return tokens[i].v;assert(!"Missing presentation token");return "";}
static char*load(const char*path){FILE*f=fopen(path,"rb");assert(f);fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);char*s=calloc((size_t)n+1,1);assert(s&&fread(s,1,(size_t)n,f)==(size_t)n);fclose(f);return s;}
static void battery_presentation(void){
 const char*states[]={"{\"battery\":{\"charging\":1,\"charger_connect\":1,\"percent\":100}}","{\"battery\":{\"charging\":3,\"charger_connect\":1,\"percent\":80}}","{\"battery\":{\"charging\":4,\"charger_connect\":1,\"percent\":100}}","{\"battery\":{\"charging\":2,\"charger_connect\":0,\"percent\":80}}","{\"battery\":{}}"};
 const char*classes[]={"charging","plugged","full","discharging","unknown"};
 const char*labels[]={"充电中","已插电 · 未充电","已充满","电池供电","充电状态未知"};
 for(int i=0;i<5;i++){fixture=states[i];refresh_tokens();assert(!strcmp(value("BAT_CLASS"),classes[i])&&!strcmp(value("BAT_STATE"),labels[i]));assert(!strcmp(value("BAT_FILL"),i==4?"0":i==0||i==2?"10":"8"));}
 fixture=states[0];snapshot_age=6001;refresh_tokens();assert(!strcmp(value("BAT_CLASS"),"unknown")&&!strcmp(value("BAT"),"—")&&!strcmp(value("BAT_FILL"),"0"));snapshot_age=0;
}
static void home_presentation(void){
 const char*states[]={"{\"aggregation\":{\"enabled\":false,\"online\":true}}","{\"aggregation\":{\"enabled\":true,\"online\":false}}","{}","{\"aggregation\":{\"enabled\":null}}","{\"aggregation\":{\"enabled\":\"invalid\"}}"};
 for(int i=0;i<5;i++){fixture=states[i];snapshot_age=0;refresh_tokens();assert(aggregate_home==(i==1));assert(!strcmp(value("HOME_MODE"),i==1?"聚合模式":"普通模式"));if(i==1)assert(!strcmp(value("AGG_LIVE"),"聚合已开启"));}
 fixture=states[1];snapshot_age=6001;refresh_tokens();assert(!aggregate_home&&!strcmp(value("HOME_MODE"),"普通模式"));snapshot_age=0;
}

static void radio_presentation(void){
 const char*raws[]={"LTE","lte+","LTE_CA"," NSA ","NR5G-NSA","ENDC","sa","NR5G_SA","5G","5ga","5G-A","5G_ADVANCED","Only_5G","NRCA","5G+","not-SA","<script>5GA</script>"};
 const char*labels[]={"4G","4G+","4G+","5G NSA","5G NSA","5G NSA","5G SA","5G SA","5G","5G-A","5G-A","5G-A","—","—","—","—","—"};
 char sample[4096],key[40];
 for(int id=0;id<3;id++)for(unsigned r=0;r<sizeof raws/sizeof*raws;r++){
  const char*modem=id==0?"5G":id==1?"4G1":"4G2";
  snprintf(sample,sizeof sample,"{\"modems\":[{\"id\":\"%s\",\"sim\":{\"state\":\"sim ready\"},\"wwan\":{\"status\":\"ipv4_connected\"},\"net\":{\"type\":\"%s\",\"operator\":\"China Unicom\",\"band\":\"n78\"},\"qos\":{\"qci\":6}}]}",modem,raws[r]);
  fixture=sample;tf_external_enabled[0]=tf_external_enabled[1]=1;refresh_tokens();snprintf(key,sizeof key,"M%s_TYPE",modem);assert(!strcmp(value(key),labels[r]));
 }
 const char*sim[]={"sim undetected","wait pin","sim error","sim ready","sim ready","sim ready"};const int enabled[]={1,1,1,0,-1,1};
 for(int i=0;i<6;i++){
  snprintf(sample,sizeof sample,"{\"modems\":[{\"id\":\"4G1\",\"sim\":{\"state\":\"%s\"},\"wwan\":{\"status\":\"disconnected\"},\"net\":{\"type\":\"5GA\",\"band\":\"n78\"},\"qos\":{\"qci\":6}}]}",sim[i]);fixture=sample;tf_external_enabled[0]=enabled[i];refresh_tokens();
  assert(!strcmp(value("M4G1_TYPE"),i==5?"5G-A":"—"));assert(!strcmp(value("M4G1_BAND"),i==5?"n78":""));assert(!strcmp(value("M4G1_QCI"),i==5?"6":"—"));
  if(i==5)assert(strstr(value("M4G1_STATUSLINE"),"未联网"));else assert(!strstr(value("M4G1_STATUSLINE"),"QCI"));
 }
 snapshot_age=6001;refresh_tokens();assert(!strcmp(value("M4G1_TYPE"),"—")&&!strcmp(value("M4G1_QCI"),"—"));snapshot_age=0;fixture="{}";
}

static void network_presentation(void){
 fixture="{\"aggregation\":{\"enabled\":true,\"online\":false,\"tcp_tunnel_count\":0,\"controller\":{\"icg_process_running\":true},\"traffic\":{\"remaining_bytes\":9316368043,\"today_used_bytes\":125405}},\"net\":{\"type\":\"SA\",\"nr_band\":\"n78\",\"nr_bw\":\"100\",\"nrca\":\"\",\"lteca\":\"\"},\"runtime\":{\"link_rates\":[{\"interface\":\"eth0\",\"rx_bps\":125000,\"tx_bps\":5000}]}}";
 network_runtime.sampled=1;network_runtime.sampled_at=1000;network_runtime.carrier=1;network_runtime.speed_mbps=1000;network_runtime.factory_online=1;network_runtime.factory_tunnels=1;
 refresh_tokens();assert(aggregate_home&&!strcmp(value("AGG_LIVE"),"聚合在线"));assert(!strcmp(value("AGG_REMAIN"),"9.32 GB"));assert(!strcmp(value("ETH_STATE"),"已插网线")&&!strcmp(value("ETH_SPEED"),"1000 Mbps"));assert(!strcmp(value("ETH_RX"),"1.00 Mbps")&&!strcmp(value("ETH_TX"),"0.04 Mbps"));assert(strstr(ca_detail_html,"n78")&&strstr(ca_detail_html,"100.0 MHz"));assert(!strcmp(value("M4G1_RX_UNIT"),""));
 network_runtime.sampled_at=(uint32_t)(1000-7000);refresh_tokens();assert(!strcmp(value("AGG_LIVE"),"聚合已开启"));assert(!strcmp(value("ETH_STATE"),"插线状态未知")&&!strcmp(value("ETH_SPEED"),"—"));
 snapshot_age=6001;refresh_tokens();assert(!aggregate_home&&!strcmp(value("AGG_REMAIN"),"—")&&!strcmp(value("AGG_LIVE"),"状态未知"));snapshot_age=0;tf_network_runtime_init(&network_runtime);
}
int main(int argc,char**argv){tf_network_runtime_init(&network_runtime);assert(argc==3);radio_presentation();battery_presentation();home_presentation();network_presentation();char*normal=load(argv[1]),*aggregate=load(argv[2]);fixture=normal;vendor_refresh(0);refresh_tokens();assert(nt<192);assert(!strcmp(value("M5G_RX_VALUE"),"328.6")&&!strcmp(value("M5G_TX_VALUE"),"46.28"));assert(!strcmp(value("M5G_TITLE"),"中国联通")&&!strcmp(value("M5G_STATUSLINE"),"已联网 · QCI 6"));assert(!strcmp(value("M4G1_TITLE"),"扩展卡 1")&&!strcmp(value("M4G1_CLASS"),"off")&&!strcmp(value("M4G1_STATUSLINE"),"未启用")&&!strcmp(value("M4G1_RX_VALUE"),"—"));assert(!strcmp(value("ONLINE_COUNT"),"1")&&!strcmp(value("RSRP"),"-88"));assert(!strcmp(value("SUM_RX_VALUE"),"328.6"));for(int i=0;i<nt;i++)for(int j=i+1;j<nt;j++)assert(strcmp(tokens[i].k,tokens[j].k));fixture=aggregate;vendor_refresh(0);refresh_tokens();assert(!strcmp(value("SUM_RX_VALUE"),"463.4")&&!strcmp(value("SUM_TX_VALUE"),"71.41")&&!strcmp(value("ONLINE_COUNT"),"3"));snapshot_age=6001;vendor_refresh(0);refresh_tokens();assert(!strcmp(value("M5G_RX_VALUE"),"—")&&!strcmp(value("SUM_RX_VALUE"),"—")&&!strcmp(value("ONLINE_COUNT"),"—")&&!chart_data_current);assert(!strcmp(value("M5G_RX_FONT"),"29"));fixture="{\"aggregation\":{}}";snapshot_age=0;vendor_refresh(0);refresh_tokens();assert(!strcmp(value("AGG_LIVE"),"状态未知"));nt=0;rate_parts("EDGE",1000.0*1e6/8);assert(!strcmp(value("EDGE_FONT"),"24"));nt=0;rate_parts("EDGE",9999.9*1e6/8);assert(!strcmp(value("EDGE_FONT"),"24"));nt=0;rate_parts("EDGE",10000.0*1e6/8);assert(!strcmp(value("EDGE_FONT"),"20"));free(normal);free(aggregate);puts("PASS: actual native snapshot parser+presentation matches browser fixtures: rate precision, primary metrics, QCI/title, disabled cards, totals/online count and stale gaps");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-presentation.c",$code.Replace('PARSER',$parse).Replace('HELPERS',$helpers))
node -e "const fs=require('fs'),vm=require('vm'),s=fs.readFileSync('src/fixtures.js','utf8');const c={};vm.runInNewContext(s+';this.data=TF_FIXTURES',c);for(const name of ['normal','aggregate'])fs.writeFileSync('native/build-preview/presentation-'+name+'.json',JSON.stringify(c.data[name]));"
if($LASTEXITCODE -ne 0){throw 'Fixture export failed'}
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/build-preview/test-presentation.c" "$root/upstream/src/json.c" -o "$root/bin/test-presentation.exe"
if($LASTEXITCODE -ne 0){throw 'Presentation test build failed'}
& "$root/bin/test-presentation.exe" "$root/build-preview/presentation-normal.json" "$root/build-preview/presentation-aggregate.json"
if($LASTEXITCODE -ne 0){throw 'Presentation test failed'}
