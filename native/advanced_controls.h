/* Native touch-only controls. Loaded after main UI helper definitions. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_ADVANCED_CONTROLS_H
#define TF_ADVANCED_CONTROLS_H
#include <stdarg.h>
#include "modem_logic.h"
#include "wifi_state.h"
static const tf_wifi_state *wifi_observed(void);
static void wifi_status_invalidate(void);
static int wifi_status_read_now(void);
static int band_rat=0,settings_child_parent=0;
static unsigned char band_allowed[TF_BANDS],band_selected[TF_BANDS];
static char verifying[4096]="",verification_message[192]="尚未提交修改";
static uint32_t verify_started=0;static long verify_stamp=-1;
static unsigned long long verify_wifi_sequence=0;
static char advanced_html[MAX_HTML];static size_t advanced_n;
static void ah(const char*fmt,...){if(advanced_n>=sizeof advanced_html-1)return;va_list args;va_start(args,fmt);int n=vsnprintf(advanced_html+advanced_n,sizeof advanced_html-advanced_n,fmt,args);va_end(args);if(n>0)advanced_n+=(size_t)n<sizeof advanced_html-advanced_n?(size_t)n:sizeof advanced_html-advanced_n-1;}
static int fresh_state(tf_json*d){return data_snapshot_age_ms()<=5000&&tf_parse(d,data_raw_json());}
#include "band_state_sync.h"
static int control_guard(void){if(!controls_enabled){show_notice("屏幕尚未解锁或接管未完成，请先解锁");return 0;}if(verifying[0]){show_notice("正在等待上一操作状态回读");return 0;}return 1;}
static void verify_begin(const char*payload){snprintf(verifying,sizeof verifying,"%s",payload);verify_started=tick();verify_stamp=json_get_int(data_raw_json(),"ts",-1);verify_wifi_sequence=wifi_observed()->sequence;if(strstr(payload,"\"wifi.radio.set\""))wifi_status_invalidate();snprintf(verification_message,sizeof verification_message,"请求已接受，正在回读实际状态");show_notice(verification_message);}
static int modem_source_verify(void);
static void modem_source_after_module_change(int index);
static void verify_update(void){
 if(modem_source_verify())return;
 if(!verifying[0])return;const char*raw=data_raw_json();long stamp=raw?json_get_int(raw,"ts",-1):-1;
 if(strstr(verifying,"\"wifi.radio.set\"")){
  if(tf_wifi_verify_radio(verifying,wifi_observed(),tick(),verify_wifi_sequence)){verifying[0]=0;snprintf(verification_message,sizeof verification_message,"Wi-Fi 开关配置已回读确认；广播状态见当前页面");show_notice(verification_message);}
  else if((uint32_t)(tick()-verify_started)>90000){verifying[0]=0;snprintf(verification_message,sizeof verification_message,"Wi-Fi 状态暂未确认；请查看 UFI，未重复提交");show_notice(verification_message);}return;
 }
 if(!strncmp(verifying,"@vendor:",8)){static uint32_t last=0;if(tick()-last>=2000){last=tick();vendor_refresh(1);int i=strstr(verifying,"4G1")?0:1,wanted=verifying[strlen(verifying)-1]-'0';if(tf_external_enabled[i]==wanted){verifying[0]=0;modem_source_after_module_change(i+1);snprintf(verification_message,sizeof verification_message,"原厂启用状态回读一致，修改已生效");show_notice(verification_message);return;}}if(tick()-verify_started>15000){verifying[0]=0;snprintf(verification_message,sizeof verification_message,"原厂状态回读未确认；未自动重试");show_notice(verification_message);}return;}
 if(data_snapshot_age_ms()<=5000&&stamp>=0&&stamp!=verify_stamp&&tf_verify_datad(verifying,raw)){int cooling=strstr(verifying,"cooling.")!=NULL;if(strstr(verifying,"band.set_")){memcpy(band_original,band_selected,sizeof band_original);band_external=0;}verifying[0]=0;snprintf(verification_message,sizeof verification_message,"%s",cooling?"散热策略回读一致；物理效果待实测":"状态回读一致，修改已生效");show_notice(verification_message);}
 else if(tick()-verify_started>15000){verifying[0]=0;snprintf(verification_message,sizeof verification_message,"回读未确认，请检查当前状态；未自动重试");show_notice(verification_message);}
}
static int band_load(int rat){tf_json d;if(!fresh_state(&d))return 0;unsigned char allowed[TF_BANDS],selected[TF_BANDS];int n=tf_band_snapshot(&d,rat,allowed,selected);tf_free(&d);if(n){memcpy(band_allowed,allowed,sizeof allowed);memcpy(band_selected,selected,sizeof selected);memcpy(band_original,selected,sizeof selected);band_external=0;band_state_known=1;band_rat=rat;advanced_page=2;scroll_y=0;}return n;}
static void advanced_shell_frame(const char*title,const char*back,int controls){
 char safe[256],result[1024];esc(safe,sizeof safe,title);esc(result,sizeof result,verification_message);advanced_n=0;
 ah("<html><head><link rel='stylesheet' href='style.css'></head><body class='%s tf-detail%s'><div class='top'><span>%s</span><span class='topright'>",theme_dark?"dark":"light",controls?"":" tf-keyboard",lookup("TIME"));
 if(controls)ah("<span class='tf-control'>%s</span>",controls_enabled?"可操作":"已锁定");
 ah("<span class='top-power %s' title='%s'><span class='charge-bolt'><i class='a'></i><i class='b'></i><i class='c'></i><i class='d'></i><i class='e'></i></span><span class='charge-mark'>%s</span>%s%% <span class='top-battery'><i style='width:%spx'></i><b></b></span></span></span></div><div class='titlebar has-back'><a class='header-theme' href='act:theme' title='切换主题'><span class='theme-moon'><i></i></span><span class='theme-sun'><i class='core'></i><i class='n'></i><i class='s'></i><i class='w'></i><i class='e'></i></span></a><a class='header-back tf-back' href='%s' aria-label='返回上一层'>&lsaquo;</a><span class='brand'>TOPFLOW<span class='connect'>CONNECT</span></span></div><div class='tf-form'><h2 class='tf-page-title'>%s</h2>",lookup("BAT_CLASS"),lookup("BAT_STATE"),lookup("BAT_MARK"),lookup("BAT"),lookup("BAT_FILL"),back,safe);
 if(notice_until>tick()){char note[1536];esc(note,sizeof note,notice);ah("<div class='hint'>%s</div>",note);}if(verifying[0]&&(notice_until<=tick()||strcmp(notice,verification_message)))ah("<p class='note' style='margin-bottom:8px'>%s</p>",result);
}
static void advanced_shell(const char*title){advanced_shell_frame(title,"act:advback",1);}
#include "modem_pages.h"
static int guest_form_verify(const char*payload);
static void traffic_form_render(void);
#include "form_pages.h"
#include "sms_forward_pages.h"
#include "display_pages.h"
#include "factory_extra_pages.h"
#include "wireless_pages.h"
#include "power_pages.h"
#include "service_pages.h"
#include "traffic_pages.h"
static void wifi_overview_render(void){
 advanced_shell("Wi-Fi 设置");tf_json d;int valid=fresh_state(&d);const char*bands[]={"2g","5g"},*names[]={"2.4 GHz","5 GHz"};
 for(int k=0;k<2;k++){
  char ssid[128]="未读取到名称",safe[768];
  if(valid){int a=tf_key(&d,tf_key(&d,0,"wlan"),"bands");if(a>=0&&d.t[a].type=='[')for(int i=a+1;i<d.t[a].next;i=d.t[i].next){char band[16];if(tf_gets(&d,i,"band",band,sizeof band)&&!strcmp(band,bands[k])){char value[128];if(tf_gets(&d,i,"ssid",value,sizeof value)&&*value)snprintf(ssid,sizeof ssid,"%s",value);break;}}}
  esc(safe,sizeof safe,ssid);const char*label=tf_wifi_status_label(tf_wifi_status(wifi_observed(),bands[k],tick()));
  ah("<a class='linkcard' href='act:wifi-edit:%s'><span class='tile' style='font-size:11px'>%s</span><span class='linktext'><b>%s <span class='ufitag'>%s</span></b><small>%s</small></span><span class='chevron'>&rsaquo;</span></a>",bands[k],k?"5G":"2.4G",names[k],label,safe);
 }
 if(valid)tf_free(&d);ah("<a class='linkcard' href='act:wifi-dual'><span class='tile' style='font-size:12px'>双频</span><span class='linktext'><b>双频合一</b><small>使用原厂双频设置</small></span><span class='chevron'>&rsaquo;</span></a><a class='linkcard' href='act:guest'><span class='tile'>G</span><span class='linktext'><b>访客网络</b><small>独立名称、密码和访问设置</small></span><span class='chevron'>&rsaquo;</span></a><a class='linkcard' href='act:wps'><span class='tile' style='font-size:12px'>WPS</span><span class='linktext'><b>WPS 配对</b><small>主 Wi-Fi 分频配对与取消</small></span><span class='chevron'>&rsaquo;</span></a><p class='note'>选择频段查看名称、密码和加密方式。修改前会再次确认。</p></div></body></html>");
}
static char*advanced_render(void){
 if(advanced_page==22){wifi_overview_render();return strdup(advanced_html);}
 if(advanced_page==20||advanced_page==21){wireless_render();return strdup(advanced_html);}
 if(advanced_page>=17&&advanced_page<=19){factory_extra_render();return strdup(advanced_html);}
 if(advanced_page==16){display_settings_render();return strdup(advanced_html);}
 if(advanced_page>=13&&advanced_page<=15){sms_forward_render();return strdup(advanced_html);}
 if(advanced_page==10){traffic_render();return strdup(advanced_html);}
 if(advanced_page==9){clients_render();return strdup(advanced_html);}if(advanced_page==11){guest_render();return strdup(advanced_html);}if(advanced_page==12){more_render();return strdup(advanced_html);}
 if(advanced_page==8){power_render();return strdup(advanced_html);}
 if(advanced_page==5){apn_render();return strdup(advanced_html);}
 if(advanced_page==6||advanced_page==7){form_render();return strdup(advanced_html);}
 if(advanced_page==4){modem_render();ah("</div></body></html>");return strdup(advanced_html);}
 if(advanced_page==1){advanced_shell("网络控制");ah("<a class='button secondary' href='act:network-mode' style='margin-bottom:8px'>主卡网络制式设置</a>");tf_json d;char lte[256]="未知",nr[256]="未知",safe[1024];int valid=fresh_state(&d);long long p,c,b;
  if(valid){int net=tf_key(&d,0,"net");char raw[160];if(tf_gets(&d,net,"lock_lte_cell",raw,sizeof raw))snprintf(lte,sizeof lte,"%s",*raw?raw:"未锁定");if(tf_gets(&d,net,"lock_nr_cell",raw,sizeof raw))snprintf(nr,sizeof nr,"%s",*raw?raw:"未锁定");}
  ah("<div class='card'><b>当前 5G 主基带</b>");esc(safe,sizeof safe,lte);ah("<p class='note'>LTE 锁定：%s</p>",safe);esc(safe,sizeof safe,nr);ah("<p class='note'>NR 锁定：%s</p></div>",safe);
  const char*names[]={"锁定当前 LTE 服务小区","锁定当前 NR 服务小区"};for(int i=0;i<2;i++){if(valid&&tf_current_cell(&d,i,&p,&c,&b)){ah("<a class='button' style='margin-bottom:8px' href='act:cell:%d'>%s</a><p class='note'>PCI %lld / %s %lld",i,names[i],p,i?"ARFCN":"EARFCN",c);if(i)ah(" / n%lld",b);ah("</p>");}else ah("<div class='hint'>%s：当前数据不完整</div>",names[i]);}
  ah("<a class='button secondary' href='act:cell-manual:0' style='margin-top:8px'>手动输入 LTE 小区</a><a class='button secondary' href='act:cell-manual:1' style='margin-top:8px'>手动输入 NR 小区</a><a class='button secondary' href='act:cell:unlock' style='margin:8px 0'>解除主基带全部基站锁定</a><h3 style='margin:14px 0 8px'>频段选择</h3><a class='button' href='act:bands:0' style='margin-bottom:7px'>LTE 频段</a><a class='button' href='act:bands:1' style='margin-bottom:7px'>NR SA 频段</a><a class='button' href='act:bands:2'>NR NSA 频段</a><p class='note'>支持频段来自设备能力。修改前二次确认；改变频段或基站可能重新拨号。4G1 / 4G2 不在此控制范围。</p>");if(valid)tf_free(&d);
 }else if(advanced_page==2){band_observe();const char*names[]={"LTE 频段","NR SA 频段","NR NSA 频段"};advanced_shell(names[band_rat]);if(!band_state_known)ah("<div class='hint'>当前频段状态不可用，未覆盖本地选择。</div>");if(band_external)ah("<div class='hint'>UFI 频段配置已变化，已保留本地选择。</div><a class='button secondary' href='act:bands:%d'>读取当前配置</a>",band_rat);ah("<p class='note'>蓝色为本地待应用选择；尚未写入设备。</p><table style='width:100%%;border-spacing:5px'>");int col=0;for(int b=1;b<TF_BANDS;b++)if(band_allowed[b]){if(!col)ah("<tr>");ah("<td style='width:25%%'><a class='button %s' href='act:band-toggle:%d' style='font-size:14px'>%s%d</a></td>",band_selected[b]?"":"secondary",b,band_rat?"n":"B",b);col++;if(col==4){ah("</tr>");col=0;}}if(col)ah("</tr>");ah("</table><a class='button secondary' style='margin:8px 0' href='act:band-auto'>选中全部支持频段（自动）</a><a class='button' href='act:band-apply'>确认应用所选频段</a><p class='note'>空选择不可应用；自动选择设备支持的全部频段。</p>");
 }else if(advanced_page==3){advanced_shell("遨游世界");char safe[4096];esc(safe,sizeof safe,ay_message);ah("<p class='note'>%s</p><a class='button secondary' href='act:ay-refresh' style='margin:7px 0'>刷新现有引擎状态</a>",safe);
  if(ay_identity[0]){const char*modes[]={"rule","global","direct"},*labels[]={"规则","全局","直连"};ah("<div class='card'><b>运行模式</b><table style='width:100%%;border-spacing:4px'><tr>");for(int i=0;i<3;i++)ah("<td><a class='button %s' href='act:ay-mode:%s'>%s</a></td>",!strcmp(ay_mode,modes[i])?"":"secondary",modes[i],labels[i]);ah("</tr></table></div>");
   int total=ay_selected<0?ay_count:ay_member_count;if(ay_offset>=total)ay_offset=0;
   if(ay_selected>=0){esc(safe,sizeof safe,ay_groups[ay_selected].name);ah("<h3 style='font-size:15px;word-break:break-all;margin:10px 0'>%s</h3>",safe);esc(safe,sizeof safe,ay_groups[ay_selected].now);ah("<p class='note' style='word-break:break-all'>当前：%s</p>",safe);}else ah("<h3 style='margin:10px 0'>策略组</h3>");
   for(int i=ay_offset;i<total&&i<ay_offset+6;i++){if(ay_selected<0){ay_group*g=&ay_groups[i];char now[4096];esc(safe,sizeof safe,g->name);esc(now,sizeof now,g->now);if(!strcmp(g->type,"Selector"))ah("<a class='sms' href='act:ay-group:%d'><b style='word-break:break-all'>%s</b><p class='note' style='word-break:break-all'>%s</p></a>",i,safe,now);else ah("<div class='sms'><b style='word-break:break-all'>%s</b><p class='note'>自动策略 · 只读</p><p class='note' style='word-break:break-all'>%s</p></div>",safe,now);}else{esc(safe,sizeof safe,ay_members[i]);ah("<a class='sms' href='act:ay-node:%d' style='word-break:break-all;%s'>%s%s</a>",i,!strcmp(ay_members[i],ay_groups[ay_selected].now)?(theme_dark?"background:#243a60;color:#9dbfff":"background:#e0eaff;color:#306bff"):"",!strcmp(ay_members[i],ay_groups[ay_selected].now)?"当前 · ":"",safe);}}
   ah("<p class='note' style='text-align:center'>%d / %d</p>",total?ay_offset/6+1:0,(total+5)/6);if(ay_offset>0)ah("<a class='button secondary' style='margin:6px 0' href='act:ay-prev'>上一页</a>");if(ay_offset+6<total)ah("<a class='button secondary' style='margin:6px 0' href='act:ay-next'>下一页</a>");ah("<p class='note'>仅调整已运行引擎的模式与手选策略。原遨游插件重载后，运行态选择可能被覆盖。</p>");}
 }else return NULL;
 ah("</div></body></html>");return strdup(advanced_html);
}
static int advanced_action(const char*a){
 if(!strcmp(a,"wifi")){advanced_page=22;scroll_y=0;return 1;}
 if(wireless_action(a))return 1;
 if(factory_extra_action(a))return 1;
 if(display_settings_action(a))return 1;
 if(sms_forward_action(a))return 1;
 if(traffic_action(a))return 1;
 if(service_action(a))return 1;
 if(power_action(a))return 1;
 if(form_action(a))return 1;
 if(modem_action(a))return 1;
 if(!strcmp(a,"controls")){show_notice(controls_enabled?"已可操作；每次修改和发送仍需确认":"解锁屏幕后即可操作");return 1;}
 if(!strcmp(a,"advback")){if(advanced_page==12||advanced_page==22){int wifi=advanced_page==22;advanced_page=0;strcpy(page,wifi?"apps.html":"settings.html");}else if(advanced_page==8||advanced_page==9||advanced_page==10||advanced_page==11||advanced_page==16){advanced_page=settings_child_parent;if(!advanced_page)strcpy(page,"settings.html");}else if(advanced_page==7)advanced_page=6;else if(advanced_page==6&&form_kind==4){advanced_page=10;form_reset();}else if(advanced_page==6&&form_is_guest){advanced_page=11;form_reset();}else if(advanced_page==6&&form_kind==3){advanced_page=5;form_reset();}else if(advanced_page==5){advanced_page=4;}else if(advanced_page==6){snprintf(page,sizeof page,"%s",form_parent);advanced_page=form_return_page;form_reset();}else if(advanced_page==2)advanced_page=1;else if(advanced_page==1&&modem_network_parent){advanced_page=4;modem_network_parent=0;}else if(advanced_page==4){snprintf(page,sizeof page,"%s",modem_origin);advanced_page=0;}else if(advanced_page==3&&ay_selected>=0){ay_selected=-1;ay_offset=0;}else{if(advanced_page==3)snprintf(page,sizeof page,"apps.html");else if(advanced_page==1)snprintf(page,sizeof page,"network.html");advanced_page=0;}scroll_y=0;return 1;}
 if(!strcmp(a,"network")){modem_network_parent=0;advanced_page=1;scroll_y=0;return 1;}
 if(!strncmp(a,"bands:",6)){char*end;long r=strtol(a+6,&end,10);if(*end||r<0||r>2||!band_load((int)r))show_notice("设备未提供可靠的支持频段列表");return 1;}
 if(!strncmp(a,"band-toggle:",12)){char*end;long b=strtol(a+12,&end,10);if(advanced_page==2&&!*end&&b>0&&b<TF_BANDS&&band_allowed[b])band_selected[b]=!band_selected[b];return 1;}
 if(!strcmp(a,"band-auto")){if(advanced_page==2)memcpy(band_selected,band_allowed,sizeof band_selected);return 1;}
 if(!strcmp(a,"band-apply")){if(advanced_page!=2||!control_guard())return 1;tf_json d;unsigned char allowed[TF_BANDS],selected[TF_BANDS];int ok=fresh_state(&d);if(ok){ok=tf_band_snapshot(&d,band_rat,allowed,selected)&&band_baseline_matches(allowed,selected)&&tf_band_payload(pending,sizeof pending,band_rat,allowed,band_selected);tf_free(&d);}if(!ok){pending[0]=0;show_notice("选择为空、UFI 配置已变化或数据不可用；请先读取当前配置");return 1;}const char*name[]={"LTE","NR SA","NR NSA"};char bands[4096],params[4096];json_get(pending,"params",params,sizeof params);json_get(params,"bands",bands,sizeof bands);snprintf(pending_label,sizeof pending_label,"将主基带 %s 频段设为：%s。此操作可能重新拨号。",name[band_rat],bands);scroll_y=0;return 1;}
 if(!strncmp(a,"cell:",5)){if(!control_guard())return 1;if(!strcmp(a+5,"unlock")){snprintf(pending,sizeof pending,"{\"action\":\"cell.unlock_all\",\"params\":{}}");snprintf(pending_label,sizeof pending_label,"解除 5G 主基带的 LTE 与 NR 基站锁定。此操作可能重新拨号。");}else if(!strcmp(a+5,"0")||!strcmp(a+5,"1")){tf_json d;int nr=a[5]=='1',ok=fresh_state(&d);if(ok){ok=tf_cell_payload(pending,sizeof pending,&d,nr);tf_free(&d);}if(!ok){pending[0]=0;show_notice("当前服务小区数据不完整，未提交");return 1;}char params[512];json_get(pending,"params",params,sizeof params);snprintf(pending_label,sizeof pending_label,"锁定当前 %s 服务小区：%s。此操作可能重新拨号。",nr?"NR":"LTE",params);}scroll_y=0;return 1;}
 if(!strcmp(a,"aoyou")||!strcmp(a,"ay-refresh")){advanced_page=3;scroll_y=0;show_busy("正在读取遨游状态");ay_refresh();return 1;}
 if(!strncmp(a,"ay-mode:",8)){if(!control_guard())return 1;const char*m=a+8;if(strcmp(m,"rule")&&strcmp(m,"global")&&strcmp(m,"direct"))return 1;if(!ay_identity[0]){show_notice("请先读取已运行的遨游引擎");return 1;}snprintf(pending,sizeof pending,"@ay-mode:%s",m);snprintf(pending_label,sizeof pending_label,"将遨游现有引擎切换到%s模式。",!strcmp(m,"rule")?"规则":!strcmp(m,"global")?"全局":"直连");scroll_y=0;return 1;}
 if(!strncmp(a,"ay-group:",9)){char*end;long i=strtol(a+9,&end,10);if(!*end&&i>=0&&i<ay_count){show_busy("正在读取策略组");if(!ay_open_group((int)i))show_notice("策略组不可手选或引擎已变化，请刷新");scroll_y=0;}return 1;}
 if(!strncmp(a,"ay-node:",8)){if(!control_guard())return 1;char*end;long i=strtol(a+8,&end,10);if(*end||ay_selected<0||i<0||i>=ay_member_count)return 1;snprintf(ay_pending_group,sizeof ay_pending_group,"%s",ay_groups[ay_selected].name);snprintf(ay_pending_member,sizeof ay_pending_member,"%s",ay_members[i]);snprintf(pending,sizeof pending,"@ay-select");snprintf(pending_label,sizeof pending_label,"策略组 %s 选择 %s。",ay_pending_group,ay_pending_member);scroll_y=0;return 1;}
 if(!strcmp(a,"ay-next")||!strcmp(a,"ay-prev")){int total=ay_selected<0?ay_count:ay_member_count;if(!strcmp(a,"ay-next")&&ay_offset+6<total)ay_offset+=6;else if(!strcmp(a,"ay-prev")&&ay_offset>=6)ay_offset-=6;scroll_y=0;return 1;}
 return 0;
}
static int advanced_confirm(void){
 if(pending[0]=='{'){
  char action[64];if(json_get(pending,"action",action,sizeof action)&&!strcmp(action,"wifi.radio.set")){
   char payload[4096],band[16],raw[8192];snprintf(payload,sizeof payload,"%s",pending);pending[0]=0;if(!control_guard())return 1;
   tf_json p;int desired=-1;if(tf_parse(&p,payload)){int params=tf_key(&p,0,"params");if(tf_gets(&p,params,"band",band,sizeof band))desired=tf_bool(&p,tf_key(&p,params,"enabled"));tf_free(&p);}
   show_busy("正在读取当前 Wi-Fi 开关");
   if(desired<0||!wifi_status_read_now()||tf_http_cancelled||!control_guard()||wifi_observed()->busy!=0||wifi_observed()->module_user_enabled==0||tf_wifi_configured(wifi_observed(),band,tick())<0){show_notice("Wi-Fi 正在应用、已关闭或状态未知，未提交");return 1;}
   if(tf_wifi_configured(wifi_observed(),band,tick())==desired){show_notice("UFI 已设为此状态，无需重复修改");return 1;}
   show_busy("正在更新 Wi-Fi 开关");
   if(!tf_http_cancelled&&control_guard()&&tf_http_timeout(9460,"POST","/control",NULL,payload,raw,sizeof raw,10000)==200&&tf_control_success(raw,payload))verify_begin(payload);else{wifi_status_invalidate();show_notice("Wi-Fi 请求结果未确认，未重复提交；请核对当前状态");}
   scroll_y=0;return 1;
  }
 }
 if(modem_source_confirm())return 1;
 if(wireless_confirm())return 1;
 if(factory_extra_confirm())return 1;
 if(display_settings_confirm())return 1;
 if(sms_forward_confirm())return 1;
 if(service_guest_confirm())return 1;
 if(power_confirm())return 1;
 if(form_confirm())return 1;
 if(!strcmp(pending,"@vendor")){pending[0]=0;if(!control_guard())return 1;vendor_refresh(1);int index=!strcmp(vendor_pending_id,"4G1")?0:1;if(tf_external_enabled[index]<0||tf_external_enabled[index]==vendor_pending_enabled){show_notice("原厂状态已变化，请重新选择");return 1;}show_busy("正在设置原厂卡片模块");if(vendor_set_enabled(vendor_pending_id,vendor_pending_enabled)){char marker[64];snprintf(marker,sizeof marker,"@vendor:%s:%d",vendor_pending_id,vendor_pending_enabled);verify_begin(marker);}else show_notice("原厂操作未确认；未自动重试");scroll_y=0;return 1;}
 if(!strcmp(pending,"@enable")||!strcmp(pending,"@disable")){pending[0]=0;show_notice("操作权限随屏幕解锁状态管理");return 1;}
 if(!control_guard()){pending[0]=0;return 1;}
 if(!strncmp(pending,"@ay-mode:",9)||!strcmp(pending,"@ay-select")){char mode[16]="";if(!strncmp(pending,"@ay-mode:",9))snprintf(mode,sizeof mode,"%s",pending+9);pending[0]=0;show_busy("正在更新遨游设置");int result=ay_apply(*mode?mode:NULL,ay_pending_group,ay_pending_member);snprintf(verification_message,sizeof verification_message,"%s",result==1?"遨游状态回读一致，修改已生效":result<0?"请求已接受，但回读未确认；请刷新": "遨游修改失败或引擎已变化；未自动重试");show_notice(verification_message);scroll_y=0;return 1;}
 /* Recheck current cell and supported bands after time spent in confirmation. */
 if(pending[0]=='{'){tf_json p,d;if(!tf_parse(&p,pending))return 1;char kind[64];tf_gets(&p,0,"action",kind,sizeof kind);int valid=fresh_state(&d);if(valid){valid=modem_recheck(pending,&d)&&traffic_recheck(pending,&d)&&service_client_recheck(pending,&d);if(valid&&(!strcmp(kind,"cell.lock_nr")||!strcmp(kind,"cell.lock_lte"))){char actual[4096];valid=tf_cell_payload(actual,sizeof actual,&d,!strcmp(kind,"cell.lock_nr"))&&!strcmp(actual,pending);}else if(!strncmp(kind,"band.set_",9)){int rat=!strcmp(kind,"band.set_lte")?0:!strcmp(kind,"band.set_nr_sa")?1:!strcmp(kind,"band.set_nr_nsa")?2:-1;unsigned char allowed[TF_BANDS],selected[TF_BANDS],wanted[TF_BANDS];char validated[4096];valid=rat==band_rat&&rat>=0&&tf_band_snapshot(&d,rat,allowed,selected)&&band_baseline_matches(allowed,selected)&&tf_band_value(&p,tf_key(&p,tf_key(&p,0,"params"),"bands"),wanted)&&tf_band_payload(validated,sizeof validated,rat,allowed,wanted)&&!strcmp(validated,pending);}tf_free(&d);}tf_free(&p);if(!valid){pending[0]=0;show_notice("设备状态已变化或不可用，请重新选择");return 1;}}
 return 0;
}
#endif
