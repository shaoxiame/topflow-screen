/* Manual primary-modem cell lock via existing datad actions. No scanning. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_CELL_FORM_H
#define TF_CELL_FORM_H
static int cell_form_nr=0;
static int cell_form_capable(int nr){
 char raw[16384];if(tf_http(9460,"GET","/capabilities",NULL,NULL,raw,sizeof raw)!=200)return 0;
 tf_json d;if(!tf_parse(&d,raw))return 0;int found=0,a=tf_key(&d,0,"controls");
 if(a>=0&&d.t[a].type=='[')for(int i=a+1;i<d.t[a].next;i=d.t[i].next){char name[64];if(tf_string(&d,i,name,sizeof name)&&!strcmp(name,nr?"cell.lock_nr":"cell.lock_lte"))found=1;}
 tf_free(&d);return found;
}
static int cell_form_payload(char*out,size_t cap){tf_json d;if(!fresh_state(&d))return 0;int ok=tf_cell_manual_payload(out,cap,&d,cell_form_nr,form_values[0],form_values[1],form_values[2]);tf_free(&d);return ok;}
static void cell_form_render(void){
 advanced_shell(cell_form_nr?"手动锁定 NR 小区":"手动锁定 LTE 小区");
 for(int i=0;i<(cell_form_nr?3:2);i++){char safe[128];esc(safe,sizeof safe,*form_values[i]?form_values[i]:"点击输入");ah("<a class='tf-field' href='act:edit:%d'><span class='tf-field-label'>%s</span><span class='tf-field-value'>%s</span></a>",i,form_label(i),safe);}
 ah("<p class='note'>PCI：0–%d；%s：1–%d。%s</p><div class='hint'>只设置 5G 主基带，可能短暂断网。回读确认锁定配置，不代表已经驻留目标小区。</div><a class='button' href='act:form-apply' style='margin-top:10px'>检查并确认锁定</a></div></body></html>",cell_form_nr?1007:503,cell_form_nr?"ARFCN":"EARFCN",cell_form_nr?3279165:262143,cell_form_nr?"频段填写数字，例如 78；必须在设备支持列表中。":"");
}
static int cell_form_open(int nr){
 if(advanced_page!=1||!control_guard())return 1;
 show_busy("正在读取基站锁定能力");if(!cell_form_capable(nr)){show_notice("现有接口未确认支持此类锁定");return 1;}
 tf_json d;if(!fresh_state(&d)){show_notice("设备状态过期，请刷新后重试");return 1;}
 unsigned char allowed[TF_BANDS],selected[TF_BANDS];if(nr&&!tf_band_snapshot(&d,1,allowed,selected)&&!tf_band_snapshot(&d,2,allowed,selected)){tf_free(&d);show_notice("NR 支持频段未确认，未打开手动锁定");return 1;}
 form_reset();form_kind=5;cell_form_nr=nr;form_return_page=1;snprintf(form_parent,sizeof form_parent,"network.html");
 long long pci,channel,band;if(tf_current_cell(&d,nr,&pci,&channel,&band)){snprintf(form_values[0],sizeof form_values[0],"%lld",pci);snprintf(form_values[1],sizeof form_values[1],"%lld",channel);if(nr)snprintf(form_values[2],sizeof form_values[2],"%lld",band);}
 tf_free(&d);advanced_page=6;scroll_y=0;return 1;
}
static int cell_form_prepare(void){
 if(!cell_form_payload(form_payload,sizeof form_payload)){memset(form_payload,0,sizeof form_payload);show_notice("PCI、频道或支持频段无效，或设备状态已过期");return 1;}
 snprintf(pending,sizeof pending,"@cell-manual");snprintf(pending_label,sizeof pending_label,"手动锁定主基带 %s 小区：PCI %s / %s %s%s%s。可能短暂断网；确认只提交一次，随后回读锁定配置。",cell_form_nr?"NR":"LTE",form_values[0],cell_form_nr?"ARFCN":"EARFCN",form_values[1],cell_form_nr?" / n":"",cell_form_nr?form_values[2]:"");scroll_y=0;return 1;
}
static int cell_form_confirm(void){
 if(strcmp(pending,"@cell-manual"))return 0;pending[0]=0;
 if(!control_guard()||form_kind!=5){memset(form_payload,0,sizeof form_payload);return 1;}
 show_busy("正在核对基站锁定参数");char checked[4096],response[8192];
 if(!cell_form_capable(cell_form_nr)||!cell_form_payload(checked,sizeof checked)||strcmp(checked,form_payload)){memset(form_payload,0,sizeof form_payload);show_notice("能力、频段或草稿已变化，未提交");return 1;}
 show_busy("正在提交主基带锁定配置");int accepted=tf_http(9460,"POST","/control",NULL,form_payload,response,sizeof response)==200&&tf_control_success(response,form_payload);
 if(accepted)verify_begin(form_payload);else show_notice("基站锁定请求未确认，未自动重试");
 memset(response,0,sizeof response);memset(checked,0,sizeof checked);memset(form_payload,0,sizeof form_payload);scroll_y=0;return 1;
}
#endif
