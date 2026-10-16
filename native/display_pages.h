/* Original display settings, with explicit confirmation before any write. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_DISPLAY_PAGES_H
#define TF_DISPLAY_PAGES_H
static int display_settings_valid=0,display_draft_level=135;
static const char*display_settings_error="DISPLAY_STATE_UNKNOWN";
static int display_settings_read(void){int okay=display_read_settings_config(&display_config);display_settings_error=okay?NULL:display_config_failure;return okay;}
static int display_percent(int level){return (level*100+127)/255;}
static void display_settings_render(void){
 advanced_shell("显示与锁屏");char v[96];
 ah("<a class='button secondary' href='act:screen-lock' style='margin-bottom:10px'>立即锁屏</a>");
 if(!display_settings_valid){ah("<div class='hint'>原厂显示配置未读齐，亮度修改暂不可用。<p class='note'>%s</p></div>",display_settings_error?display_settings_error:"DISPLAY_STATE_UNKNOWN");}
 else{
  ah("<div class='card'><b>亮度模式</b><table style='width:100%%;border-spacing:5px;margin-top:8px'><tr><td style='width:50%%'><a class='button %s' href='act:display-mode:0'>固定亮度</a></td><td style='width:50%%'><a class='button %s' href='act:display-mode:1'>自适应</a></td></tr></table><p class='note'>%s</p>",display_config.automatic?"secondary":"",display_config.automatic?"":"secondary",display_config.automatic?"随光线平滑调节，过滤短暂波动":"保持所选亮度，不随光线变化");
  if(display_config.automatic&&display_config.sensor_lux>=0){snprintf(v,sizeof v,"%d lux",display_config.sensor_lux);modem_row("环境光",v);}
  else if(display_config.automatic)ah("<p class='note'>光感暂未读到，保持当前亮度；可切换为固定亮度。</p>");
  ah("</div>");
  if(!display_config.automatic){
   int percent=display_percent(display_draft_level);ah("<div class='card'><div class='cardtitle'>固定亮度 <span class='pill'>%s</span></div><table style='width:100%%;border-spacing:5px'><tr><td style='width:25%%'><a class='button secondary' href='act:display-step:-1' style='font-size:22px'>-</a></td><td style='width:50%%;text-align:center'><span style='font-size:29px;font-weight:bold'>%d</span><span class='note'> %%</span></td><td style='width:25%%'><a class='button secondary' href='act:display-step:1' style='font-size:22px'>+</a></td></tr></table><div class='bar' style='margin:10px 4px'><span style='width:%d%%'></span></div><a class='button' href='act:display-apply'>应用固定亮度</a><p class='note' style='margin-top:8px'>加减每次 1%%，点击应用后生效</p><table style='width:100%%;border-spacing:5px'>",display_draft_level==display_config.brightness?"当前":"待应用",percent,percent);
   const int presets[]={5,10,25,50,75,100};for(int i=0;i<6;i++){if(!(i%3))ah("<tr>");ah("<td style='width:33.33%%'><a class='button %s' href='act:display-preset:%d'>%d%%</a></td>",percent==presets[i]?"":"secondary",presets[i],presets[i]);if(i%3==2)ah("</tr>");}
   ah("</table></div>");
  }
  ah("<div class='card'><b>自动熄屏</b><p class='note'>屏幕熄灭时间；系统休眠设置不变</p>");const int times[]={15,30,60,120,-1};const char*labels[]={"15 秒","30 秒","1 分钟","2 分钟","保持亮屏"};for(int i=0;i<5;i++)ah("<a class='button %s' href='act:display-time:%d' style='margin-top:6px'>%s</a>",display_config.timeout_seconds==times[i]?"":"secondary",times[i],labels[i]);
  ah("</div><div class='card'><b>锁屏保护</b><p class='note'>%s</p><p class='note'>%s</p></div>",display_config.pin_enabled?"已开启密码；使用原厂四位锁屏码":"未启用锁屏码；长按解锁进入",display_config.pin_enabled?"首次接管和程序重启先保护等待 300 秒。五次错码后另需等待 300 秒。":"唤醒后显示防误触页，长按解锁即可操作。");
 }
 ah("<a class='button secondary' href='act:display-refresh'>刷新显示状态</a></div></body></html>");
}
static int display_settings_action(const char*a){
 if(!strcmp(a,"display")||!strcmp(a,"display-refresh")){if(!strcmp(a,"display"))settings_child_parent=advanced_page==12?12:0;advanced_page=16;scroll_y=0;show_busy("正在读取原厂显示设置");display_settings_valid=display_settings_read();if(display_settings_valid)display_draft_level=display_config.brightness;return 1;}
 if(strncmp(a,"display-",8))return 0;if(advanced_page!=16||!display_settings_valid||!control_guard())return 1;
 int kind=-1,value=0;
 if(!strncmp(a,"display-step:",13)||!strncmp(a,"display-preset:",15)){
  if(display_config.automatic){show_notice("请先选择固定亮度");return 1;}int percent=display_percent(display_draft_level),step=!strncmp(a,"display-step:",13);if(!tf_display_integer(a+(step?13:15),-1,100,&value))return 1;
  if(step){if(value!=-1&&value!=1)return 1;percent+=value;}else{if(value!=5&&value!=10&&value!=25&&value!=50&&value!=75&&value!=100)return 1;percent=value;}
  if(percent<4)percent=4;if(percent>100)percent=100;display_draft_level=(percent*255+50)/100;return 1;
 }
 if(!strcmp(a,"display-apply")){if(display_config.automatic){show_notice("请先选择固定亮度");return 1;}if(display_draft_level==display_config.brightness){show_notice("亮度未改变");return 1;}kind=1;value=display_draft_level;}
 else if(!strncmp(a,"display-mode:",13)){kind=0;if(!tf_display_integer(a+13,0,1,&value))return 1;if(value==display_config.automatic){show_notice("已使用此亮度模式");return 1;}}
 else if(!strcmp(a,"display-auto")){kind=0;value=!display_config.automatic;}
 else if(!strncmp(a,"display-time:",13)){kind=2;if(!tf_display_integer(a+13,-1,120,&value)||(value!=-1&&value!=15&&value!=30&&value!=60&&value!=120))return 1;}
 else return 1;
 snprintf(pending,sizeof pending,"@display:%d:%d",kind,value);
 if(kind==0)snprintf(pending_label,sizeof pending_label,value?"开启自适应亮度，随环境光平滑调节。":"使用固定亮度 %d%%，不随环境光变化。",display_percent(display_config.brightness));
 else if(kind==1)snprintf(pending_label,sizeof pending_label,"将固定亮度设置为 %d%%，保存到原厂显示配置。",display_percent(value));
 else snprintf(pending_label,sizeof pending_label,value==-1?"保持亮屏，可能增加耗电。":"将自动熄屏设置为 %d 秒；系统休眠设置不变。",value);
 scroll_y=0;return 1;
}
static int display_settings_confirm(void){
 if(strncmp(pending,"@display:",9))return 0;int kind,value;char extra;if(sscanf(pending+9,"%d:%d%c",&kind,&value,&extra)!=2){pending[0]=0;return 1;}pending[0]=0;if(!control_guard())return 1;
 if(kind<0||kind>2||(kind==0&&(value<0||value>1))||(kind==1&&(value<10||value>255))||(kind==2&&value!=-1&&value!=15&&value!=30&&value!=60&&value!=120))return 1;
 display_settings_valid=display_settings_read();if(!display_settings_valid){show_notice("显示配置未读齐，未修改；请查看页面错误码");return 1;}
 if(kind==1&&display_config.automatic){show_notice("设备已切到自适应模式，固定亮度未修改");return 1;}
 show_busy("正在更新显示设置");int ok=display_write_setting(kind,value);const char*failure=display_config_failure;display_settings_valid=display_settings_read();if(display_settings_valid)display_draft_level=display_config.brightness;
 ok=ok&&display_settings_valid&&(kind==0?display_config.automatic:kind==1?display_config.brightness:display_config.timeout_seconds)==value;
 if(ok)show_notice("显示设置已保存并回读确认");else{char message[192];snprintf(message,sizeof message,"显示设置未确认（%s）；未自动重试",failure?failure:"DISPLAY_STATE_UNKNOWN");show_notice(message);}scroll_y=0;return 1;
}
#endif
