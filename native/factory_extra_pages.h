/* Native SIM PIN/PUK and WPS. Existing factory APIs; no initialization writes. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_FACTORY_EXTRA_PAGES_H
#define TF_FACTORY_EXTRA_PAGES_H
#include "factory_extra_protocol.h"
#if defined(__linux__)
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#endif
#ifndef TF_EXTRA_CALL
static int tf_extra_call(const char*input,char*out,size_t cap){
 tf_extra_command check;if(!tf_extra_decode(input,strlen(input),&check)){if(cap)out[0]=0;return 0;}tf_extra_wipe(&check,sizeof check);
 char helper[1024];ssize_t n=readlink("/proc/self/exe",helper,sizeof helper-1);if(n<=0||n>=(ssize_t)sizeof helper-1)return 0;helper[n]=0;char*slash=strrchr(helper,'/');if(!slash||(size_t)(slash-helper)+sizeof("/topflow-factory-bus-aarch64")>sizeof helper)return 0;strcpy(slash,"/topflow-factory-bus-aarch64");char*const args[]={helper,"--extra",NULL};return vendor_exec_timeout(helper,args,input,out,cap,6000)==0;
}
#define TF_EXTRA_CALL tf_extra_call
#endif
typedef struct {int kind,parent,field,op,slot,valid,wps_present[2],wps_remaining[2],operator_count,operator_index;char values[3][9],wps_state[2][48],net_state[64],net_result[64];tf_extra_sim sim;tf_extra_operator operators[20];} tf_extra_ui;
_Static_assert(sizeof(tf_extra_ui)<=8192,"SIM draft fits private pages");
_Alignas(4096) static union {tf_extra_ui value;unsigned char pages[8192];} fx_storage;
#define fx (fx_storage.value)
static uint32_t fx_loaded_at;
static int fx_locked;
static void factory_extra_cleanup(void){tf_extra_wipe(&fx_storage,sizeof fx_storage);fx_loaded_at=0;
#if defined(__linux__)
 if(fx_locked)munlock(&fx_storage,sizeof fx_storage);
#endif
 fx_locked=0;
}
static void fx_clear_codes(void){tf_extra_wipe(fx.values,sizeof fx.values);fx.op=0;}
static int fx_current_main(int locked){
 tf_json d;tf_modem m;if(strcmp(modem_selected,"5G")||!fresh_state(&d))return 0;int ok=tf_modem_snapshot(&d,"5G",&m)&&m.presence==1&&!m.conflict&&m.enabled!=0&&m.availability!=0;
 if(locked)ok=ok&&(m.locked==1||m.locked==2);tf_free(&d);return ok;
}
static int fx_sim_parse(const char*raw){
 memset(&fx.sim,0,sizeof fx.sim);fx.sim.pin_left=fx.sim.puk_left=fx.sim.slot=-1;tf_json d;if(!tf_parse(&d,raw))return 0;long long n;
 int ok=tf_bool(&d,tf_key(&d,0,"ok"))==1&&tf_gets(&d,0,"sim_state",fx.sim.state,sizeof fx.sim.state)&&tf_gets(&d,0,"modem_state",fx.sim.modem,sizeof fx.sim.modem)&&tf_int(&d,tf_key(&d,0,"slot"),&n)&&n>=1&&n<=2;if(ok)fx.sim.slot=(int)n;
 if(tf_int(&d,tf_key(&d,0,"pin_remaining"),&n)&&n>=0&&n<=3)fx.sim.pin_left=(int)n;
 if(tf_int(&d,tf_key(&d,0,"puk_remaining"),&n)&&n>=0&&n<=10)fx.sim.puk_left=(int)n;
 tf_free(&d);fx.sim.valid=ok;fx_loaded_at=tick();return ok;
}
static int fx_wps_parse(const char*raw){
 memset(fx.wps_present,0,sizeof fx.wps_present);memset(fx.wps_state,0,sizeof fx.wps_state);tf_json d;if(!tf_parse(&d,raw))return 0;int a=tf_key(&d,0,"bands"),ok=tf_bool(&d,tf_key(&d,0,"ok"))==1&&a>=0&&d.t[a].type=='[';
 if(ok)for(int i=a+1;i<d.t[a].next;i=d.t[i].next){char section[32],state[48];long long remaining;if(!tf_gets(&d,i,"section",section,sizeof section)){ok=0;break;}int b=!strcmp(section,"main_2g")?0:!strcmp(section,"main_5g")?1:-1;if(b<0||fx.wps_present[b]||!tf_gets(&d,i,"state",state,sizeof state)||!tf_int(&d,tf_key(&d,i,"remaining"),&remaining)||remaining<0||remaining>600){ok=0;break;}fx.wps_present[b]=1;fx.wps_remaining[b]=(int)remaining;strcpy(fx.wps_state[b],state);}
 tf_free(&d);fx_loaded_at=tick();return ok&&(fx.wps_present[0]||fx.wps_present[1]);
}
static int fx_net_parse(const char*raw){
 fx.operator_count=0;*fx.net_state=*fx.net_result=0;tf_json d;if(!tf_parse(&d,raw))return 0;int a=tf_key(&d,0,"operators"),ok=tf_bool(&d,tf_key(&d,0,"ok"))==1&&tf_gets(&d,0,"state",fx.net_state,sizeof fx.net_state)&&tf_gets(&d,0,"result",fx.net_result,sizeof fx.net_result)&&a>=0&&d.t[a].type=='['&&d.t[a].count<=20;
 if(ok)for(int i=a+1;i<d.t[a].next;i=d.t[i].next){tf_extra_operator*r=&fx.operators[fx.operator_count];long long status;ok=tf_gets(&d,i,"name",r->name,sizeof r->name)&&*r->name&&tf_gets(&d,i,"plmn",r->plmn,sizeof r->plmn)&&tf_extra_digits(r->plmn,5,6)&&tf_gets(&d,i,"rat",r->rat,sizeof r->rat)&&tf_extra_digits(r->rat,1,10)&&strtoul(r->rat,NULL,10)<=2147483647UL&&tf_int(&d,tf_key(&d,i,"status"),&status)&&status>=0&&status<=99999999;if(!ok)break;r->status=(int)status;fx.operator_count++;}
 tf_free(&d);fx_loaded_at=tick();if(!ok)fx.operator_count=0;return ok;
}
static int fx_load(void){char raw[16384];int okay=TF_EXTRA_CALL(fx.kind==1?"SIM_READ\n":fx.kind==2?"WPS_READ\n":"NET_READ\n",raw,sizeof raw);fx.valid=okay&&(fx.kind==1?fx_sim_parse(raw):fx.kind==2?fx_wps_parse(raw):fx_net_parse(raw));tf_extra_wipe(raw,sizeof raw);return fx.valid;}
static int fx_net_slot(void){tf_json d;tf_modem m;if(strcmp(modem_selected,"5G")||!fresh_state(&d))return 0;int okay=tf_modem_snapshot(&d,"5G",&m)&&m.presence==1&&!m.locked&&!m.conflict&&m.enabled!=0&&m.availability!=0&&m.slot>=1&&m.slot<=2;int slot=okay?m.slot:0;tf_free(&d);return slot;}
static int fx_wifi_enabled(int band){return tf_wifi_effective(wifi_observed(),band?"5g":"2g",tick())==1;}
static int fx_unlock_op(void){if(!fx.valid||!fx_current_main(1)||tick()-fx_loaded_at>30000)return 0;tf_extra_command c={0};c.slot=fx.sim.slot;c.op=TF_X_PIN;if(tf_extra_sim_allows(&fx.sim,&c))return TF_X_PIN;c.op=TF_X_PUK;return tf_extra_sim_allows(&fx.sim,&c)?TF_X_PUK:0;}
static const char*fx_wps_label(int i){const char*s=fx.wps_state[i];return!strcmp(s,"idle")?(fx.wps_remaining[i]>0?"等待配对":"空闲"):!strcmp(s,"running")?"正在配对":!strcmp(s,"success")?"配对成功":!strcmp(s,"overlap")?"检测到多个配对请求":s;}
static void factory_extra_render(void){
 if(advanced_page==19){advanced_shell("手动选择运营商 · 主卡");ah("<a class='button secondary' href='act:fx-refresh' style='margin-bottom:8px'>刷新扫描与注册结果</a>");if(!fx.valid)ah("<div class='hint'>原厂选网状态读取失败；未自动开始扫描。</div>");else{const char*state=!strcmp(fx.net_state,"manual_selecting")?"正在搜索":!strcmp(fx.net_state,"manual_selected")?"搜索完成":!strcmp(fx.net_state,"manual_search_fail")?"搜索失败":*fx.net_state?fx.net_state:"尚无手动搜索状态";const char*result=!strcmp(fx.net_result,"manual_success")?"注册成功":!strcmp(fx.net_result,"manual_fail")?"注册失败":*fx.net_result?fx.net_result:"尚无手动注册结果";char safe[512];esc(safe,sizeof safe,state);ah("<div class='card'><b>%s</b>",safe);esc(safe,sizeof safe,result);ah("<p class='note'>%s</p></div>",safe);if(fx_net_slot()&&tf_extra_net_scan_allowed(fx.net_state))ah("<a class='button' href='act:fx-net-scan' style='margin-bottom:9px'>开始搜索运营商</a>");for(int i=0;i<fx.operator_count;i++){tf_extra_operator*r=&fx.operators[i];esc(safe,sizeof safe,r->name);ah("<div class='card'><b>%s</b><p class='note'>PLMN %s · RAT %s<br>原厂状态值 %d</p>",safe,r->plmn,r->rat,r->status);if(!strcmp(fx.net_state,"manual_selected")&&fx_net_slot())ah("<a class='button secondary' href='act:fx-net-select:%d' style='margin-top:7px'>选择此运营商</a>",i);ah("</div>");}}ah("<p class='note'>仅处理主卡运营商列表，不采集邻区。搜索或选择可能中断网络；每次需确认，不自动扫描或重试。RAT 和状态值保留原厂返回值。</p></div></body></html>");return;}
 if(advanced_page==18){advanced_shell_frame(fx.op==TF_X_PUK?(fx.field==0?"输入 PUK":fx.field==1?"输入新 PIN":"确认新 PIN"):"输入 SIM PIN","act:advback",0);char masked[9];size_t n=strlen(fx.values[fx.field]);memset(masked,'*',n);masked[n]=0;ah("<div class='card' style='font-size:26px;letter-spacing:5px;text-align:center;height:48px;line-height:48px'>%s</div><p class='note'>%zu / 8 位 · 仅保存在内存</p><table style='width:100%%;border-spacing:5px;table-layout:fixed'>",masked,n);for(int i=1;i<=12;i++){if(i%3==1)ah("<tr>");if(i<=9)ah("<td style='width:33.33%%'><a class='button secondary' href='act:fx-digit:%d' style='height:42px;line-height:42px;font-size:21px'>%d</a></td>",i,i);else if(i==10)ah("<td style='width:33.33%%'><a class='button secondary' href='act:fx-delete' style='height:42px;line-height:42px'>退格</a></td>");else if(i==11)ah("<td style='width:33.33%%'><a class='button secondary' href='act:fx-digit:0' style='height:42px;line-height:42px;font-size:21px'>0</a></td>");else ah("<td style='width:33.33%%'><a class='button' href='act:fx-done' style='height:42px;line-height:42px'>完成</a></td>");if(i%3==0)ah("</tr>");}ah("</table><p class='note'>PIN 为 4–8 位；PUK 为 8 位。错误提交会消耗 SIM 剩余次数，输入过程不会提交。</p></div></body></html>");return;}
 advanced_shell(fx.kind==1?"SIM PIN / PUK · 主卡":"WPS 配对");ah("<a class='button secondary' href='act:fx-refresh' style='margin-bottom:9px'>读取最新状态</a>");if(!fx.valid){ah("<div class='hint'>当前状态读取失败；控制不可用。</div></div></body></html>");return;}
 if(fx.kind==1){char safe[256];esc(safe,sizeof safe,fx.sim.state);ah("<div class='card'><b>卡槽 %d · %s</b><p class='note'>PIN 剩余：",fx.sim.slot,safe);if(fx.sim.pin_left>=0)ah("%d 次",fx.sim.pin_left);else ah("未知");ah("<br>PUK 剩余：");if(fx.sim.puk_left>=0)ah("%d 次",fx.sim.puk_left);else ah("未知");ah("</p></div>");int op=fx_unlock_op();if(op){fx.op=op;for(int i=0;i<(op==TF_X_PUK?3:1);i++){const char*label=op==TF_X_PIN?"SIM PIN":i==0?"PUK":i==1?"新 PIN":"再次输入新 PIN";ah("<a class='tf-field' href='act:fx-edit:%d'><span class='tf-field-label'>%s</span><span class='tf-field-value'>%s</span></a>",i,label,*fx.values[i]?"已输入 · 内容隐藏":"点击输入");}ah("<a class='button' href='act:fx-apply' style='margin:9px 0'>检查并确认%s</a><p class='note'>仅校验当前 5G 主基带卡槽。错误输入会减少剩余次数；不会自动重试或保存 PIN。</p>",op==TF_X_PUK?"解锁 PUK":"验证 PIN");}else ah("<div class='hint'>当前无需解锁，或卡状态/次数尚未确认。未启用、未插卡或状态冲突时不允许提交。</div>");}
 else{for(int i=0;i<2;i++){char status[256];esc(status,sizeof status,fx.wps_present[i]?fx_wps_label(i):"状态未知");ah("<div class='card'><b>%s · 主 Wi-Fi</b><p class='note'>%s",i?"5 GHz":"2.4 GHz",status);if(fx.wps_present[i])ah(" · 剩余 %d 秒",fx.wps_remaining[i]);ah("</p>");if(fx.wps_present[i]&&fx_wifi_enabled(i)&&tf_extra_wps_start_allowed(fx.wps_state[i],fx.wps_remaining[i]))ah("<a class='button' href='act:fx-wps:%d' style='margin-top:8px'>开始此频段配对</a>",i);else ah("<p class='note'>%s</p>",fx.wps_present[i]&&(!strcmp(fx.wps_state[i],"running")||fx.wps_remaining[i]>0)?"正在配对，请刷新结果或取消":"频段关闭或尚未回到空闲状态");ah("</div>");}ah("<a class='button secondary' href='act:fx-wps-cancel' style='margin:9px 0'>取消主 Wi-Fi 双频配对</a><p class='note'>点击后确认，调用原厂 WPS；不会开启已关闭的 Wi-Fi。配对结果请刷新读取。</p>");}ah("</div></body></html>");
}
static int factory_extra_action(const char*a){
 if(!strcmp(a,"sim-security")||!strcmp(a,"wps")||!strcmp(a,"operators")){int sim=!strcmp(a,"sim-security"),net=!strcmp(a,"operators");if((sim||net)&&strcmp(modem_selected,"5G")){show_notice("此外卡目标接口尚未确认，未调用主卡接口");return 1;}int parent=advanced_page;factory_extra_cleanup();
#if defined(__linux__)
  struct rlimit core={0,0};if(sim&&(setrlimit(RLIMIT_CORE,&core)||prctl(PR_SET_DUMPABLE,0)||mlock(&fx_storage,sizeof fx_storage))){show_notice("无法保护 PIN 内存，未打开输入");return 1;}if(sim)fx_locked=1;
#endif
  fx.kind=sim?1:net?3:2;fx.parent=parent;advanced_page=net?19:17;scroll_y=0;show_busy("正在读取原厂状态");fx_load();return 1;}
 if(advanced_page!=17&&advanced_page!=18&&advanced_page!=19)return 0;
 if(!strcmp(a,"advback")){if(advanced_page==18)advanced_page=17;else{int parent=fx.parent;factory_extra_cleanup();advanced_page=parent;if(!parent)strcpy(page,"settings.html");}scroll_y=0;return 1;}
 if(!strcmp(a,"fx-refresh")){if(advanced_page==17||advanced_page==19){fx_clear_codes();show_busy("正在读取原厂状态");fx_load();}return 1;}
 if(!strcmp(a,"fx-net-scan")||!strncmp(a,"fx-net-select:",14)){if(advanced_page!=19||fx.kind!=3||!fx.valid||!control_guard()||!fx_net_slot()||tick()-fx_loaded_at>30000)return 1;if(!strcmp(a,"fx-net-scan")){if(!tf_extra_net_scan_allowed(fx.net_state))return 1;strcpy(pending,"@fx-net-scan");strcpy(pending_label,"开始主卡运营商搜索，可能暂时中断数据连接。不会采集邻区；仅启动一次，随后通过刷新查看原厂结果。");}else{char*end;long i=strtol(a+14,&end,10);if(*end||i<0||i>=fx.operator_count||strcmp(fx.net_state,"manual_selected"))return 1;fx.operator_index=(int)i;strcpy(pending,"@fx-net-select");tf_extra_operator*r=&fx.operators[i];snprintf(pending_label,sizeof pending_label,"选择主卡运营商 %s（PLMN %s，RAT %s）。可能中断网络，只有原厂返回的当前列表条目可提交；不会自动重试。",r->name,r->plmn,r->rat);}fx.slot=fx_net_slot();scroll_y=0;return 1;}
 if(!strncmp(a,"fx-edit:",8)){if(advanced_page==17&&fx.kind==1&&strlen(a+8)==1&&a[8]>='0'&&a[8]<(fx_unlock_op()==TF_X_PUK?'3':'1')){fx.op=fx_unlock_op();if(fx.op){fx.field=a[8]-'0';advanced_page=18;scroll_y=0;}}return 1;}
 if(!strncmp(a,"fx-digit:",9)){if(advanced_page==18&&strlen(a+9)==1&&a[9]>='0'&&a[9]<='9'){size_t n=strlen(fx.values[fx.field]);if(n<8){fx.values[fx.field][n]=a[9];fx.values[fx.field][n+1]=0;}}return 1;}
 if(!strcmp(a,"fx-delete")){if(advanced_page==18){size_t n=strlen(fx.values[fx.field]);if(n)fx.values[fx.field][n-1]=0;}return 1;}
 if(!strcmp(a,"fx-done")){if(advanced_page==18){advanced_page=17;scroll_y=0;}return 1;}
 if(!strcmp(a,"fx-apply")){if(advanced_page!=17||fx.kind!=1||!control_guard())return 1;int op=fx_unlock_op();if(!op||!tf_extra_digits(fx.values[0],op==TF_X_PUK?8:4,8)||(op==TF_X_PUK&&(!tf_extra_digits(fx.values[1],4,8)||strcmp(fx.values[1],fx.values[2])))){show_notice("卡状态已变化、长度无效或新 PIN 不一致；未提交");return 1;}fx.op=op;fx.slot=fx.sim.slot;strcpy(pending,"@fx-pin");snprintf(pending_label,sizeof pending_label,"在主基带卡槽 %d %s。当前剩余 %d 次；错误输入会减少次数，耗尽可能永久锁卡。仅提交一次，不会自动重试。",fx.slot,op==TF_X_PUK?"用 PUK 解锁并设置新 PIN":"校验 SIM PIN",op==TF_X_PUK?fx.sim.puk_left:fx.sim.pin_left);scroll_y=0;return 1;}
 if(!strncmp(a,"fx-wps:",7)||!strcmp(a,"fx-wps-cancel")){if(advanced_page!=17||fx.kind!=2||!fx.valid||!control_guard())return 1;if(!strcmp(a,"fx-wps-cancel")){strcpy(pending,"@fx-wps-cancel");strcpy(pending_label,"取消主 Wi-Fi 的 2.4 GHz 与 5 GHz WPS 配对请求。");}else if(strlen(a+7)==1&&(a[7]=='0'||a[7]=='1')&&fx.wps_present[a[7]-'0']&&tf_extra_wps_start_allowed(fx.wps_state[a[7]-'0'],fx.wps_remaining[a[7]-'0'])&&fx_wifi_enabled(a[7]-'0')){snprintf(pending,sizeof pending,"@fx-wps:%c",a[7]);snprintf(pending_label,sizeof pending_label,"启动 %s 主 Wi-Fi 的 WPS 配对。在配对窗口内，请在需要连接的设备上启动 WPS。",a[7]=='0'?"2.4 GHz":"5 GHz");}scroll_y=0;return 1;}
 return 0;
}
static int factory_extra_confirm(void){
 if(strncmp(pending,"@fx-",4))return 0;char marker[64];snprintf(marker,sizeof marker,"%s",pending);pending[0]=0;if(!control_guard()){fx_clear_codes();return 1;}char request[128],response[2048];int sim=!strcmp(marker,"@fx-pin");
 if(!strcmp(marker,"@fx-net-scan")||!strcmp(marker,"@fx-net-select")){int scan=!strcmp(marker,"@fx-net-scan");if(fx.kind!=3||!fx.slot||fx_net_slot()!=fx.slot){show_notice("当前卡已变化或未就绪，未提交");return 1;}if(scan)snprintf(request,sizeof request,"NET_SCAN\n%d\n",fx.slot);else{if(fx.operator_index<0||fx.operator_index>=fx.operator_count)return 1;tf_extra_operator*r=&fx.operators[fx.operator_index];snprintf(request,sizeof request,"NET_SELECT\n%s\n%s\n%d\n",r->plmn,r->rat,fx.slot);}show_busy(scan?"正在请求运营商搜索":"正在请求手动注册");int okay=TF_EXTRA_CALL(request,response,sizeof response),sent=0;tf_json d;if(okay&&tf_parse(&d,response)){sent=tf_bool(&d,tf_key(&d,0,"submitted"))==1&&tf_bool(&d,tf_key(&d,0,"accepted"))==1;tf_free(&d);}tf_extra_wipe(request,sizeof request);tf_extra_wipe(response,sizeof response);fx_load();show_notice(sent?"请求已提交一次；请刷新查看原厂搜索或注册结果":"当前条目、卡状态已变化或请求未确认；未自动重试");scroll_y=0;return 1;}
 if(sim){tf_extra_command cmd={0};cmd.op=fx.op;cmd.slot=fx.slot;if(fx.kind!=1||!fx_current_main(1)||!fx_load()||!tf_extra_sim_allows(&fx.sim,&cmd)){fx_clear_codes();show_notice("当前卡槽、锁定状态或剩余次数已变化，未提交");return 1;}if(fx.op==TF_X_PUK)snprintf(request,sizeof request,"PUK\n%s\n%s\n%d\n",fx.values[0],fx.values[1],fx.slot);else snprintf(request,sizeof request,"PIN\n%s\n%d\n",fx.values[0],fx.slot);}
 else if(!strcmp(marker,"@fx-wps-cancel")&&fx.kind==2)strcpy(request,"WPS_CANCEL\n");
 else if((!strcmp(marker,"@fx-wps:0")||!strcmp(marker,"@fx-wps:1"))&&fx.kind==2&&wifi_status_read_now()&&!tf_http_cancelled&&control_guard()&&fx_wifi_enabled(marker[8]-'0')&&fx_load()&&fx.wps_present[marker[8]-'0']&&tf_extra_wps_start_allowed(fx.wps_state[marker[8]-'0'],fx.wps_remaining[marker[8]-'0']))snprintf(request,sizeof request,"WPS_START\nmain_%s\n",marker[8]=='0'?"2g":"5g");else{fx_clear_codes();show_notice("设置状态已变化，未提交");return 1;}
#if defined(__linux__)
 if(sim&&mlock(request,sizeof request)){tf_extra_wipe(request,sizeof request);fx_clear_codes();show_notice("无法保护提交内存，未发送");return 1;}
#endif
 show_busy(sim?"正在校验 SIM，请勿重复提交":"正在请求原厂 WPS 配对");
 if(tf_http_cancelled||!control_guard()){
#if defined(__linux__)
  if(sim)munlock(request,sizeof request);
#endif
  tf_extra_wipe(request,sizeof request);tf_extra_wipe(response,sizeof response);fx_clear_codes();show_notice("操作已取消或屏幕已锁定，未提交");return 1;
 }
 int okay=TF_EXTRA_CALL(request,response,sizeof response);tf_extra_wipe(request,sizeof request);
#if defined(__linux__)
 if(sim)munlock(request,sizeof request);
#endif
 fx_clear_codes();tf_json d;int submitted=0,accepted=0;if(okay&&tf_parse(&d,response)){submitted=tf_bool(&d,tf_key(&d,0,"submitted"))==1;accepted=tf_bool(&d,tf_key(&d,0,"accepted"))==1;tf_free(&d);}fx.valid=okay&&(sim?fx_sim_parse(response):fx_wps_parse(response));tf_extra_wipe(response,sizeof response);
 if(sim)show_notice(submitted&&fx.valid&&!strcmp(fx.sim.state,"sim ready")?"SIM 状态回读已就绪":submitted?"已提交一次；请检查当前状态和剩余次数，未自动重试":"状态校验未通过或结果未知，未自动重试");
 else show_notice(submitted&&accepted?"已请求原厂配对操作；请刷新查看实际结果":"配对请求未确认，未自动重试");scroll_y=0;return 1;
}
#endif
