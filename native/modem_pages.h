/* Native per-card details; only supported actions are exposed. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_MODEM_PAGES_H
#define TF_MODEM_PAGES_H
#include "modem_logic.h"
#include "sim_source_runtime.h"
static char modem_selected[8]="5G",modem_origin[96]="index.html",modem_pending_op[24]="";
static int modem_network_parent=0;
static char vendor_pending_id[8]="";static int vendor_pending_enabled=-1;
static int source_pending_index=-1,source_pending_before=-1,source_pending_target=-1;
static int source_verify_index=-1,source_verify_target=-1;static uint32_t source_verify_at=0;
static int modem_source_enabled(int index){return index==0?1:index==1||index==2?tf_external_enabled[index-1]:-1;}
static void modem_source_after_module_change(int index){if(index>0&&index<3)tf_source_refresh(index,1);}
static void modem_source_render(void){
 int index=tf_source_index(modem_selected),current=index>=0?source_current[index]:-1,enabled=modem_source_enabled(index);
 ah("<div class='card'><b>SIM 卡源</b><p style='margin:9px 0'>当前：%s</p>",tf_source_name(current));
 for(int wanted=0;wanted<2;wanted++){
  if(current==wanted)ah("<div class='hint' style='margin:7px 0'>%s · 当前使用</div>",tf_source_name(wanted));
  else if(tf_source_permitted(index,current,wanted,enabled))ah("<a class='button secondary' href='act:modem-source:%d' style='margin:7px 0'>%s%s</a>",wanted,current<0?"选择":"切换为",tf_source_name(wanted));
  else ah("<div class='note' style='margin:9px 0'>%s · 暂不可切换</div>",tf_source_name(wanted));
 }
 if(enabled!=1)ah("<p class='note'>请先启用此卡模块，再选择卡源。切换不会代替启用操作。</p>");
 else if(current<0)ah("<p class='note'>原厂尚未返回当前卡源，可直接选择目标。未插实体卡也可选择内置卡；不会把空值当成插拔卡。</p>");
 else ah("<p class='note'>插拔卡位于卡槽；内置卡固定在设备内部。切换可能短暂断网。</p>");
 if(index>0&&enabled>=0)ah("<a class='button %s' href='act:modem-enable:%d' style='margin:8px 0'>%s此卡模块</a>",enabled?"secondary":"",!enabled,enabled?"停用":"启用");
 else if(index>0)ah("<p class='note'>原厂启用状态未知；请先读取状态。</p>");
 ah("<a class='button secondary' href='act:modem-source-refresh' style='margin-top:8px'>读取卡源状态</a></div>");
}
static int modem_source_confirm(void){
 if(strcmp(pending,"@simsource"))return 0;pending[0]=0;if(!control_guard())return 1;
 int index=source_pending_index,wanted=source_pending_target,before=source_pending_before;
 source_pending_index=source_pending_target=source_pending_before=-1;
 if(advanced_page!=4||index!=tf_source_index(modem_selected)||index<0||index>2){show_notice("卡片选择已变化，请重新选择");return 1;}
 show_busy("正在核对原厂卡源");if(index)vendor_refresh(1);tf_source_refresh(index,1);
 if(source_current[index]!=before||!tf_source_permitted(index,source_current[index],wanted,modem_source_enabled(index))){show_notice("原厂卡源或启用状态已变化，请重新选择");return 1;}
 show_busy("正在切换 SIM 卡源");if(tf_http_cancelled||!control_guard()){show_notice("切换已取消，未提交卡源操作");return 1;}
 source_verify_index=index;source_verify_target=wanted;source_verify_at=tick();
 int accepted=tf_source_set(index,wanted);verify_begin("@simsource");
 if(!accepted){snprintf(verification_message,sizeof verification_message,"提交结果未确认，正在读取卡源；不会自动重试");show_notice(verification_message);}
 scroll_y=0;return 1;
}
static int modem_source_verify(void){
 if(strcmp(verifying,"@simsource"))return 0;
 if(source_verify_index<0||source_verify_index>2||source_verify_target<0||source_verify_target>1){verifying[0]=0;show_notice("卡源回读目标无效；未自动重试");return 1;}
 if((uint32_t)(tick()-source_verify_at)>=2000){source_verify_at=tick();tf_source_refresh(source_verify_index,1);
  if(source_current[source_verify_index]==source_verify_target){verifying[0]=0;snprintf(verification_message,sizeof verification_message,"%s 已切换为%s；网络注册状态见卡片详情",tf_source_id(source_verify_index),tf_source_name(source_verify_target));show_notice(verification_message);return 1;}}
 if((uint32_t)(tick()-verify_started)>15000){verifying[0]=0;snprintf(verification_message,sizeof verification_message,"原厂卡源回读未确认；未自动重试，请读取当前状态");show_notice(verification_message);}return 1;
}
static void modem_row(const char*key,const char*value){char k[256],v[2048];esc(k,sizeof k,key);esc(v,sizeof v,value&&*value?value:"—");ah("<table style='width:100%%;margin:4px 0;line-height:20px;border-collapse:collapse;border-spacing:0'><tr><td class='note' style='width:88px;vertical-align:top;padding:0;margin:0;height:20px'>%s</td><td style='word-break:break-all;font-size:14px;padding:0;height:20px'>%s</td></tr></table>",k,v);}
static void modem_render(void){char title[64];snprintf(title,sizeof title,"%s · 卡片详情",modem_selected);advanced_shell(title);tf_json d;tf_modem m;int valid=fresh_state(&d);if(!valid){modem_source_render();ah("<div class='hint'>当前网络数据不可用；卡源读取与模块启用使用原厂独立接口。</div>");return;}if(!tf_modem_snapshot(&d,modem_selected,&m)){tf_free(&d);modem_source_render();ah("<div class='hint'>设备尚未提供此基带的网络数据；卡源读取与模块启用使用原厂独立接口。</div>");return;}
 ah("<div class='card'>");modem_row("连接状态",m.status);modem_row("SIM 卡",m.presence==1?"已检测到":m.presence==0?"未插卡":"尚未确认");ah("</div>");
 modem_source_render();
 char v[256];ah("<div class='card'><b>实时与签约速率</b>");const char*rkeys[]={"tx_speed","rx_speed"},*rlab[]={"实时上行","实时下行"};for(int i=0;i<2;i++){double rate=tf_modem_rate(&d,&m,rkeys[i]);if(rate<0)strcpy(v,"—");else snprintf(v,sizeof v,"%.2f Mbps",rate*8/1e6);modem_row(rlab[i],v);}long long qci;if(tf_modem_qos_ready(&d,&m)&&tf_int(&d,tf_key(&d,m.qos,"qci"),&qci)&&qci>0&&qci<=255)snprintf(v,sizeof v,"%lld",qci);else strcpy(v,"—");modem_row("QCI",v);
 ah("<div style='border-top:1px solid #888;margin:9px 0'></div>");const char*akeys[]={"ambr_ul","ambr_dl"},*alab[]={"签约上行","签约下行"};for(int i=0;i<2;i++){tf_modem_ambr_text(v,sizeof v,tf_modem_ambr(&d,&m,akeys[i]));modem_row(alab[i],v);}ah("<p class='note' style='margin:6px 0 0'>签约速率为网络最近下发上限，非实时测速。</p></div>");
 ah("<div class='card'><b>网络信息</b>");modem_row("模块可用性",m.availability==1?"可用":m.availability==0?"不可用":"未知");if(strcmp(modem_selected,"5G"))modem_row("独立启用状态",m.enabled==1?"已启用（原厂状态）":m.enabled==0?"未启用（原厂状态）":"未知");const char*keys[]={"operator","type","band"},*labels[]={"运营商","网络类型","频段"};for(int i=0;i<3;i++){v[0]=0;tf_gets(&d,m.net,keys[i],v,sizeof v);modem_row(labels[i],v);}ah("</div>");
 ah("<div class='card'><b>服务小区信号</b>");const char*metrics[]={"RSRP","RSRQ","SINR","RSSI","PCI","频道","Cell ID","TAC"};for(int i=0;i<8;i++){if(!tf_modem_signal(&d,&m,i,v,sizeof v))strcpy(v,"—");modem_row(metrics[i],v);}ah("</div>");
 if(!strcmp(modem_selected,"5G")){ah("<h3 style='margin:14px 0 8px'>此卡管理</h3>");if(m.connected==1)ah("<a class='button secondary' href='act:modem-op:disconnect' style='margin-bottom:8px'>断开主卡数据</a>");else if(m.connected==0&&m.presence==1&&!m.locked&&m.availability!=0)ah("<a class='button' href='act:modem-op:connect' style='margin-bottom:8px'>连接主卡数据</a>");if(m.roaming>=0)ah("<a class='button secondary' href='act:modem-op:roam%d' style='margin-bottom:8px'>数据漫游：%s · 点击%s</a>",!m.roaming,m.roaming?"允许":"禁止",m.roaming?"禁止":"允许");ah("<a class='button secondary' href='act:modem-network' style='margin-bottom:8px'>信号 · 频段与基站锁定</a>");}
 else ah("<p class='note'>模块启停与卡源选择位于上方。启用后可能仍需等待 SIM 检测和注册。</p>");
 if(!strcmp(modem_selected,"5G"))ah("<a class='button secondary' href='act:sim-security' style='margin-bottom:8px'>SIM PIN / PUK</a>");
 if(!strcmp(modem_selected,"5G"))ah("<a class='button secondary' href='act:operators' style='margin-bottom:8px'>运营商选择</a>");
 ah("<a class='button secondary' href='act:apn-open' style='margin-bottom:8px'>APN 配置</a><div class='card'><b>SIM 原始状态</b>");modem_row("SIM",m.state);modem_row("基带",m.modem_state);ah("</div><p class='note'>未知状态不会显示为未插卡；未确认可用的数据速率显示 —。每次修改仍需确认。</p>");tf_free(&d);
}
static int modem_action(const char*a){if(!strncmp(a,"modem:",6)){const char*id=a+6;if(strcmp(id,"5G")&&strcmp(id,"4G1")&&strcmp(id,"4G2"))return 1;snprintf(modem_selected,sizeof modem_selected,"%s",id);snprintf(modem_origin,sizeof modem_origin,"%s",page);advanced_page=4;modem_network_parent=0;scroll_y=0;show_busy("正在读取卡片状态");vendor_refresh(1);tf_source_refresh(tf_source_index(id),0);return 1;}
 if(!strcmp(a,"modem-source-refresh")){if(advanced_page==4){show_busy("正在读取原厂卡源");vendor_refresh(1);int ok=tf_source_refresh(tf_source_index(modem_selected),1);show_notice(ok?"已读取当前 SIM 卡源":"原厂尚未返回有效卡源");}return 1;}
 if(!strncmp(a,"modem-source:",13)){
  if(advanced_page!=4||!control_guard()||strlen(a+13)!=1||(a[13]!='0'&&a[13]!='1'))return 1;
  int index=tf_source_index(modem_selected),wanted=a[13]-'0';show_busy("正在核对卡片状态");if(index)vendor_refresh(1);tf_source_refresh(index,1);
  if(index<0||!tf_source_permitted(index,source_current[index],wanted,modem_source_enabled(index))){show_notice("此卡模块未启用、启用状态未知或已是目标卡源，请重新读取");return 1;}
  source_pending_index=index;source_pending_before=source_current[index];source_pending_target=wanted;strcpy(pending,"@simsource");
  if(source_pending_before<0)snprintf(pending_label,sizeof pending_label,"%s 当前卡源尚未确认。将明确选择%s，不推测原卡源。可能短暂断网；仅操作这张卡的原厂接口一次，随后回读目标卡源。不会启用其他模块或自动重试。",modem_selected,tf_source_name(wanted));
  else snprintf(pending_label,sizeof pending_label,"将 %s 从%s切换为%s。可能短暂断网；仅操作这张卡的原厂卡源接口，随后回读卡源。不会启用其他模块或自动重试。",modem_selected,tf_source_name(source_pending_before),tf_source_name(wanted));scroll_y=0;return 1;
 }
 if(!strncmp(a,"modem-enable:",13)){if(advanced_page!=4||!control_guard()||!strcmp(modem_selected,"5G")||strlen(a+13)!=1||(a[13]!='0'&&a[13]!='1'))return 1;vendor_refresh(1);int i=!strcmp(modem_selected,"4G1")?0:1,wanted=a[13]-'0';if(tf_external_enabled[i]<0||tf_external_enabled[i]==wanted){show_notice("原厂状态已变化或不可用，请重新选择");return 1;}snprintf(vendor_pending_id,sizeof vendor_pending_id,"%s",modem_selected);vendor_pending_enabled=wanted;strcpy(pending,"@vendor");snprintf(pending_label,sizeof pending_label,"%s %s 的原厂模块。此操作可能中断该卡网络，确认后调用原厂接口并回读状态。",wanted?"启用":"停用",modem_selected);scroll_y=0;return 1;}
 if(!strcmp(a,"modem-network")){if(advanced_page==4&&!strcmp(modem_selected,"5G")){modem_network_parent=1;advanced_page=1;scroll_y=0;}return 1;}
 if(!strncmp(a,"modem-op:",9)){if(advanced_page!=4||!control_guard())return 1;tf_json d;int valid=fresh_state(&d);if(valid){valid=tf_modem_control(pending,sizeof pending,&d,modem_selected,a+9);tf_free(&d);}if(!valid){pending[0]=0;show_notice("状态不适合此操作或接口尚未确认");return 1;}snprintf(modem_pending_op,sizeof modem_pending_op,"%s",a+9);const char*label=!strcmp(a+9,"connect")?"连接主卡数据":!strcmp(a+9,"disconnect")?"断开主卡数据":!strcmp(a+9,"roam0")?"禁止主卡数据漫游":"允许主卡数据漫游";snprintf(pending_label,sizeof pending_label,"%s。可能中断当前网络；将回读实际状态，不自动重试。",label);scroll_y=0;return 1;}return 0;}
static int modem_recheck(const char*payload,const tf_json*d){char kind[64];if(!json_get(payload,"action",kind,sizeof kind))return 0;if(strcmp(kind,"cellular.connect")&&strcmp(kind,"cellular.disconnect")&&strcmp(kind,"cellular.set"))return 1;char actual[4096];return *modem_pending_op&&tf_modem_control(actual,sizeof actual,d,modem_selected,modem_pending_op)&&!strcmp(actual,payload);}
#endif
