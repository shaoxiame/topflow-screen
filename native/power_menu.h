/* Physical-key power overlay. No background service or direct shutdown command.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_POWER_MENU_H
#define TF_POWER_MENU_H
static struct { int active,choice,submitted,saved_scroll,await_release,result; char message[256]; } power_menu;
static int power_menu_allowed(void){return display_runtime_ready&&tf_fl_input_allowed(&factory_lifecycle,1)&&controls_enabled&&!pin_policy.locked&&!soft_lock.locked&&!soft_lock.block_release;}
static void power_menu_reset(void){memset(&power_menu,0,sizeof power_menu);}
static void power_menu_close(void){int saved=power_menu.saved_scroll;power_menu_reset();scroll_y=saved;}
static void power_menu_open(void){
 if(power_menu.active)return;
 power_menu_reset();power_menu.active=1;power_menu.saved_scroll=scroll_y;power_menu.await_release=1;scroll_y=0;
 /* Never let a new physical-key interaction confirm an unrelated old action. */
 pending[0]=pending_label[0]=0;
 tf_soft_lock_cancel(&soft_lock);
 power_reboot_supported=power_off_supported=0;
 if(power_menu_allowed()){show_busy("正在读取电源操作能力");power_capabilities_load();}
}
/* A finger already held at menu entry must be released before any menu tap. */
static int power_menu_filter_touch(int pressed){
 if(!power_menu.active||!power_menu.await_release)return 0;
 if(!pressed)power_menu.await_release=0;
 return 1;
}
static int power_menu_action(const char*a){
 if(!power_menu.active)return 0;
 if(!strcmp(a,"power-menu-close")){power_menu_close();return 1;}
 if(!strcmp(a,"theme")){theme_dark=!theme_dark;return 1;}
 if(power_menu.await_release)return 1;
 if(!strcmp(a,"power-menu-back")){power_menu.choice=0;return 1;}
 if(power_menu.submitted)return 1;
 if(!power_menu_allowed())return 1;
 if(!strcmp(a,"power-menu-reboot")||!strcmp(a,"power-menu-off")){
  int choice=!strcmp(a,"power-menu-reboot")?1:2;
  if(!power_menu.choice&&(choice==1?power_reboot_supported:power_off_supported))power_menu.choice=choice;
  return 1;
 }
 if(!strcmp(a,"power-menu-confirm")&&(power_menu.choice==1||power_menu.choice==2)){
  /* Consume the confirmation before any blocking call; no repeat or retry. */
  int reboot=power_menu.choice==1;power_menu.choice=0;power_menu.submitted=1;
  power_menu.result=power_device_submit(reboot);
  snprintf(power_menu.message,sizeof power_menu.message,"%s",notice);
 }
 /* Every unrelated link is consumed while the overlay is present. */
 return 1;
}
static void power_menu_card(int reboot,int enabled){
 const char*tag=enabled?"a":"div",*name=reboot?"重启":"关机";
 ah("<%s class='pm-card%s'",tag,enabled?"":" pm-disabled");
 if(enabled)ah(" href='act:power-menu-%s'",reboot?"reboot":"off");
 ah("><span class='pm-icon %s'><i class='pm-ring'></i><i class='pm-core'></i><i class='pm-gap'></i><i class='%s'></i></span><b>%s</b><small>%s</small></%s>",reboot?"pm-blue":"pm-red",reboot?"pm-arrow":"pm-stem",name,reboot?"重新启动设备":"关闭设备电源",tag);
}
static void power_menu_render(void){
 advanced_n=0;
 ah("<html><head><link rel='stylesheet' href='style.css'><style>"
 ".pm-body{padding:20px 18px 12px}.pm-title{font-size:25px;font-weight:650;line-height:34px;margin-bottom:6px}.pm-note{font-size:12px;line-height:19px;color:#5e6e88}.pm-card{display:block;position:relative;height:82px;padding:17px 12px 12px 72px;margin:12px 0;border:1px solid #dfe7f4;border-radius:17px;background:#fff}.pm-card b{display:block;font-size:19px;line-height:26px}.pm-card small{display:block;font-size:12px;line-height:20px;color:#5e6e88}.pm-disabled b,.pm-disabled small{color:#8c99ae}.pm-icon{display:block;position:absolute;left:17px;top:21px;width:38px;height:38px;border-radius:12px}.pm-red{background:#fff0ef;color:#c65557}.pm-blue{background:#ebf1ff;color:#426fd0}.pm-ring{position:absolute;left:9px;top:9px;display:block;width:20px;height:20px;border-radius:10px;background:#c65557}.pm-blue .pm-ring{background:#426fd0}.pm-core{position:absolute;left:11px;top:11px;display:block;width:16px;height:16px;border-radius:8px;background:#fff0ef}.pm-blue .pm-core,.pm-blue .pm-gap{background:#ebf1ff}.pm-gap{position:absolute;left:14px;top:7px;display:block;width:10px;height:8px;background:#fff0ef}.pm-stem{position:absolute;left:17px;top:6px;display:block;width:3px;height:14px;background:#c65557;border-radius:2px}.pm-arrow{position:absolute;left:22px;top:6px;display:block;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:6px solid #426fd0}.pm-buttons{margin-top:20px}.pm-buttons .button{height:45px;line-height:45px;font-size:14px;margin:10px 0}.pm-cancel{display:block;text-align:center;line-height:42px;font-size:14px;color:#5e6e88}.pm-summary{padding:24px 18px;border:1px solid #dfe7f4;border-radius:18px;background:#fff;margin-top:20px}.pm-summary h2{font-size:22px;line-height:31px;margin-bottom:12px}.pm-summary p{font-size:13px;line-height:22px}.pm-warn{margin-top:14px;padding:10px 12px;border-radius:11px;background:#eaf0ff;font-size:12px;line-height:19px;color:#5272ad}.dark .pm-card,.dark .pm-summary{background:#17243a;border-color:#2b3b55}.dark .pm-note,.dark .pm-card small,.dark .pm-cancel{color:#a0aec3}.dark .pm-red{background:#442f39;color:#f1a4a4}.dark .pm-blue{background:#243b60;color:#9bbbff}.dark .pm-ring,.dark .pm-stem{background:#f1a4a4}.dark .pm-blue .pm-ring{background:#9bbbff}.dark .pm-core,.dark .pm-gap{background:#442f39}.dark .pm-blue .pm-core,.dark .pm-blue .pm-gap{background:#243b60}.dark .pm-arrow{border-bottom-color:#9bbbff}.dark .pm-warn{background:#243b60;color:#b6cff5}.dark .pm-disabled b,.dark .pm-disabled small{color:#7c8ca6}"
 "</style></head><body class='%s tf-detail'><div class='top'><span>%s</span><span class='topright'>%s%%</span></div><div class='titlebar has-back'><span class='brand'>TOPFLOW<span class='connect'>CONNECT</span></span><a class='header-back' href='act:power-menu-close'>&lsaquo;</a></div><div class='pm-body'>",theme_dark?"dark":"light",lookup("TIME"),lookup("BAT"));
 int allowed=power_menu_allowed();
 if(power_menu.submitted){char safe[1536];esc(safe,sizeof safe,power_menu.message);ah("<div class='pm-summary'><h2>%s</h2><p>%s</p></div><div class='pm-buttons'><a class='button secondary' href='act:power-menu-close'>返回</a></div>",power_menu.result==1?"请求已接受":"操作未确认",safe);}
 else if(power_menu.choice&&allowed){int reboot=power_menu.choice==1;ah("<h1 class='pm-title'>确认%s</h1><p class='pm-note'>设备电源操作</p><div class='pm-summary'><h2>确定%s设备？</h2><p>所有卡的数据连接、Wi-Fi 与管理连接将中断。</p><p class='pm-note' style='margin-top:12px'>%s</p></div><div class='pm-buttons'><a class='button' style='background:%s' href='act:power-menu-confirm'>确认%s</a><a class='button secondary' href='act:power-menu-back'>取消</a></div>",reboot?"重启":"关机",reboot?"重启":"关闭",reboot?"重启后按当前自启动设置加载屏幕。":"再次使用时需要手动开机。",reboot?"#306bfa":"#bd505a",reboot?"重启":"关机");}
 else{ah("<h1 class='pm-title'>电源菜单</h1><p class='pm-note'>选择操作后再次确认</p>");power_menu_card(0,allowed&&power_off_supported);power_menu_card(1,allowed&&power_reboot_supported);if(!allowed)ah("<div class='pm-warn'>屏幕已锁定，请先返回解锁。</div>");else if(!power_reboot_supported||!power_off_supported)ah("<div class='pm-warn'>不可用的操作尚未获得接口支持。关闭菜单后可重新长按读取。</div>");ah("<a class='pm-cancel' href='act:power-menu-close'>%s</a><p class='pm-note' style='text-align:center'>短按电源键仍可息屏</p>",allowed?"取消":"返回解锁");}
 ah("</div></body></html>");
}
#endif
