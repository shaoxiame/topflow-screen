/* Existing datad modes and dual-band control; no invented current-mode mapping. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_WIRELESS_PAGES_H
#define TF_WIRELESS_PAGES_H
static const char*wireless_modes[]={"WL_AND_5G","LTE_AND_5G","Only_5G","WCDMA_AND_LTE","Only_LTE","Only_WCDMA"};
static const char*wireless_labels[]={"自动 5G / 4G / 3G","5G NSA","5G SA","4G / 3G","仅 4G","仅 3G"};
static int wireless_parent=0,wireless_dual=-1,wireless_dual_supported=-1,wireless_mode_cap=0,wireless_dual_cap=0;
static void wireless_capabilities(void){char raw[16384];wireless_mode_cap=wireless_dual_cap=0;if(tf_http(9460,"GET","/capabilities",NULL,NULL,raw,sizeof raw)!=200)return;tf_json d;if(!tf_parse(&d,raw))return;int a=tf_key(&d,0,"controls");if(a>=0&&d.t[a].type=='[')for(int i=a+1;i<d.t[a].next;i=d.t[i].next){char name[64];if(tf_string(&d,i,name,sizeof name)){if(!strcmp(name,"network.set_mode"))wireless_mode_cap=1;if(!strcmp(name,"wifi.set_dual_band"))wireless_dual_cap=1;}}tf_free(&d);}
static int wireless_dual_read(void){wireless_dual=wireless_dual_supported=-1;const char*request="{\"action\":\"wifi.dual_band_status\",\"params\":{}}";char raw[4096];if(tf_http(9460,"POST","/control",NULL,request,raw,sizeof raw)!=200||!tf_control_success(raw,request))return 0;tf_json d;if(!tf_parse(&d,raw))return 0;int r=tf_key(&d,0,"result");wireless_dual_supported=tf_bool(&d,tf_key(&d,r,"supported"));wireless_dual=tf_bool(&d,tf_key(&d,r,"enabled"));tf_free(&d);return wireless_dual_supported>=0&&wireless_dual>=0;}
static int wireless_current_mode(char*out,size_t cap){tf_json d;*out=0;if(!fresh_state(&d))return 0;int ok=tf_gets(&d,tf_key(&d,0,"net"),"net_select",out,cap)&&*out;tf_free(&d);return ok;}
static void wireless_render(void){
 advanced_shell(advanced_page==20?"Wi-Fi 双频合一":"主卡网络制式");
 if(advanced_page==20){ah("<div class='card'><b>双频合一</b><p class='note'>%s</p>",wireless_dual_supported==0?"当前设备不支持":wireless_dual<0?"原厂状态未确认":wireless_dual?"已开启":"已关闭");if(wireless_dual_cap&&wireless_dual_supported==1&&wireless_dual>=0)ah("<a class='button' href='act:wireless-dual-toggle' style='margin-top:8px'>%s双频合一</a>",wireless_dual?"关闭":"开启");ah("<p class='note'>使用原厂双频合一功能；修改后无线连接可能中断。</p></div>");}
 else{char current[96],safe[512];int known=wireless_current_mode(current,sizeof current);esc(safe,sizeof safe,known?current:"未知");ah("<div class='card'><b>当前原厂值</b><p style='margin-top:8px;word-break:break-all'>%s</p><p class='note'>未将此值换算成其他制式。以下选择来自现有 UFI 面板已核实选项。</p></div>",safe);if(known&&wireless_mode_cap)for(int i=0;i<6;i++)ah("<a class='button %s' href='act:wireless-mode:%d' style='margin:8px 0'>%s</a>",!strcmp(current,wireless_modes[i])?"":"secondary",i,wireless_labels[i]);else ah("<div class='hint'>当前状态或控制能力未确认，暂不允许修改。</div>");ah("<p class='note'>只控制 5G 主基带；变更可能重新拨号。</p>");}
 ah("<a class='button secondary' href='act:wireless-refresh' style='margin:10px 0'>重新读取状态</a></div></body></html>");
}
static int wireless_action(const char*a){
 if(!strcmp(a,"wifi-dual")||!strcmp(a,"network-mode")){wireless_parent=advanced_page;advanced_page=!strcmp(a,"wifi-dual")?20:21;scroll_y=0;show_busy("正在读取现有控制能力");wireless_capabilities();if(advanced_page==20)wireless_dual_read();return 1;}
 if(advanced_page!=20&&advanced_page!=21)return 0;
 if(!strcmp(a,"advback")){advanced_page=wireless_parent;scroll_y=0;return 1;}
 if(!strcmp(a,"wireless-refresh")){show_busy("正在重新读取原厂状态");wireless_capabilities();if(advanced_page==20)wireless_dual_read();return 1;}
 if(!strcmp(a,"wireless-dual-toggle")){if(advanced_page!=20||!control_guard()||!wireless_dual_cap||wireless_dual_supported!=1||wireless_dual<0)return 1;snprintf(pending,sizeof pending,"@wireless-dual:%d",!wireless_dual);snprintf(pending_label,sizeof pending_label,"%s原厂双频合一。无线连接可能中断；提交一次后独立读取实际开关状态。",wireless_dual?"关闭":"开启");scroll_y=0;return 1;}
 if(!strncmp(a,"wireless-mode:",14)){char current[96];if(advanced_page!=21||!control_guard()||!wireless_mode_cap||!wireless_current_mode(current,sizeof current)||strlen(a+14)!=1||a[14]<'0'||a[14]>'5')return 1;int i=a[14]-'0';if(!strcmp(current,wireless_modes[i])){show_notice("网络制式未改变");return 1;}snprintf(pending,sizeof pending,"@wireless-mode:%d",i);snprintf(pending_label,sizeof pending_label,"将主基带原厂值 %s 改为 %s（%s）。这可能重新拨号，确认后只提交一次。",current,wireless_labels[i],wireless_modes[i]);scroll_y=0;return 1;}
 return 0;
}
static int wireless_confirm(void){
 if(strncmp(pending,"@wireless-",10))return 0;char marker[64];snprintf(marker,sizeof marker,"%s",pending);pending[0]=0;if(!control_guard())return 1;show_busy("正在核对原厂控制能力");wireless_capabilities();char payload[256],raw[4096];int dual=!strncmp(marker,"@wireless-dual:",15);
 if(strlen(marker)!=16||marker[15]<'0'||marker[15]>(dual?'1':'5')){show_notice("操作参数已失效");return 1;}int value=marker[15]-'0';
 if(dual){if(!wireless_dual_cap||!wireless_dual_read()||wireless_dual_supported!=1||wireless_dual==value){show_notice("双频状态或能力已变化，未提交");return 1;}snprintf(payload,sizeof payload,"{\"action\":\"wifi.set_dual_band\",\"params\":{\"enabled\":%s}}",value?"true":"false");}
 else{char current[96];if(strncmp(marker,"@wireless-mode:",15)||!wireless_mode_cap||!wireless_current_mode(current,sizeof current)){show_notice("网络状态或能力已变化，未提交");return 1;}snprintf(payload,sizeof payload,"{\"action\":\"network.set_mode\",\"params\":{\"mode\":\"%s\"}}",wireless_modes[value]);}
 show_busy("正在更新原厂无线设置");int accepted=tf_http(9460,"POST","/control",NULL,payload,raw,sizeof raw)==200&&tf_control_success(raw,payload);
 if(dual){int readback=wireless_dual_read();show_notice(accepted&&readback&&wireless_dual==value?"双频合一状态回读一致":"双频合一结果未确认，未自动重试");}else if(accepted)verify_begin(payload);else show_notice("网络制式请求未确认，未自动重试");scroll_y=0;return 1;
}
#endif
