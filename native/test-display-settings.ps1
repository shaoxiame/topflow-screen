$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$advanced=[IO.File]::ReadAllText("$root/advanced_controls.h")
$shell=$advanced.Substring($advanced.IndexOf('static void advanced_shell_frame('),$advanced.IndexOf('#include "modem_pages.h"')-$advanced.IndexOf('static void advanced_shell_frame('))
$source=@'
#include <assert.h>
#include <stdio.h>
#include <stdarg.h>
#include "display_policy.h"
static char html[32768],pending[128],pending_label[1600],notice[256],verifying[2],verification_message[64];
static size_t advanced_n;static int theme_dark,controls_enabled=1,advanced_page,settings_child_parent,scroll_y;
static uint32_t notice_until;static uint32_t tick(void){return 0;}
static tf_display_config display_config,observed={0,0,135,30,0,1,40,135,255};
static int writes,last_kind,last_value,read_fail,write_fail;
static const char*lookup(const char*k){if(!strcmp(k,"TIME"))return "14:36";if(!strcmp(k,"BAT"))return "80";if(!strcmp(k,"BAT_FILL"))return "8";if(!strcmp(k,"BAT_CLASS"))return "charging";if(!strcmp(k,"BAT_MARK"))return "";return "充电中";}
static void esc(char*out,size_t cap,const char*text){snprintf(out,cap,"%s",text);}
static void ah(const char*fmt,...){va_list ap;va_start(ap,fmt);int n=vsnprintf(html+advanced_n,sizeof html-advanced_n,fmt,ap);va_end(ap);assert(n>=0&&(size_t)n<sizeof html-advanced_n);advanced_n+=(size_t)n;}
ACTUAL_SHELL
static void modem_row(const char*k,const char*v){ah("<div class='row last'><span class='key'>%s</span><span class='value'>%s</span></div>",k,v);}
static int control_guard(void){return controls_enabled;}
static void show_notice(const char*s){snprintf(notice,sizeof notice,"%s",s);}
static void show_busy(const char*s){assert(s&&*s);}
static const char*display_config_failure="ADOPT_POLICY_READ";
static int display_read_settings_config(tf_display_config*c){if(read_fail)return 0;*c=observed;return 1;}
static int display_write_setting(int kind,int value){writes++;last_kind=kind;last_value=value;if(write_fail)return 0;if(kind==0)observed.automatic=value;else if(kind==1)observed.brightness=value;else observed.timeout_seconds=value;return 1;}
#include "display_pages.h"
static void output(const char*dir,const char*name){for(theme_dark=0;theme_dark<=1;theme_dark++){display_settings_render();char path[1024];snprintf(path,sizeof path,"%s/%s%s.html",dir,name,theme_dark?"-dark":"");FILE*f=fopen(path,"wb");assert(f);fwrite(html,1,strlen(html),f);fclose(f);}}
int main(int argc,char**argv){assert(argc==2);
 assert(display_settings_action("display")&&advanced_page==16&&display_draft_level==135&&!writes);output(argv[1],"display-fixed");assert(strstr(html,"固定亮度")&&strstr(html,"自适应")&&strstr(html,"act:display-step:-1")&&strstr(html,"act:screen-lock"));{const char*apply=strstr(html,"act:display-apply");assert(apply&&!strstr(apply+1,"act:display-apply")&&apply<strstr(html,"act:display-preset:5"));}
 assert(display_settings_action("display-step:1")&&display_percent(display_draft_level)==54&&!writes&&!pending[0]);assert(display_settings_action("display-preset:25")&&display_percent(display_draft_level)==25&&!writes);
 assert(display_settings_action("display-apply")&&!strcmp(pending,"@display:1:64")&&!writes);pending[0]=0;assert(!display_settings_confirm()&&!writes);
 assert(display_settings_action("display-apply")&&display_settings_confirm()&&writes==1&&last_kind==1&&last_value==64&&observed.brightness==64&&!pending[0]);assert(!display_settings_confirm()&&writes==1);
 for(int i=0;i<200;i++)display_settings_action("display-step:-1");assert(display_draft_level==10);for(int i=0;i<200;i++)display_settings_action("display-step:1");assert(display_draft_level==255);assert(writes==1);
 display_settings_action("display-mode:1");assert(!strcmp(pending,"@display:0:1"));controls_enabled=0;assert(display_settings_confirm()&&!pending[0]&&writes==1);controls_enabled=1;
 display_settings_action("display-mode:1");assert(display_settings_confirm()&&writes==2&&observed.automatic==1);output(argv[1],"display-adaptive");assert(strstr(html,"平滑调节")&&!strstr(html,"act:display-apply")&&!strstr(html,"act:display-step:"));
 display_settings_action("display-preset:50");display_settings_action("display-apply");assert(!pending[0]&&writes==2);
 display_settings_action("display-mode:0");assert(display_settings_confirm()&&writes==3&&observed.automatic==0);
 display_settings_action("display-preset:50");display_settings_action("display-apply");observed.automatic=1;assert(display_settings_confirm()&&writes==3&&strstr(notice,"自适应模式"));observed.automatic=0;display_settings_action("display-refresh");
 display_settings_action("display-time:60");assert(display_settings_confirm()&&writes==4&&last_kind==2&&last_value==60);
 display_settings_action("display-mode:1");read_fail=1;assert(display_settings_confirm()&&writes==4&&!pending[0]);read_fail=0;display_settings_action("display-refresh");
 for(int i=0;i<5;i++){const char*bad[]={"display-mode:2","display-step:2","display-preset:101","display-time:31","display-level:999"};display_settings_action(bad[i]);assert(!pending[0]&&writes==4);}
 observed.sensor_enabled=0;display_settings_action("display-refresh");display_settings_action("display-mode:1");assert(!strcmp(pending,"@display:0:1")&&writes==4);pending[0]=0;observed.sensor_enabled=1;display_settings_action("display-refresh");
 display_settings_action("display-mode:1");write_fail=1;assert(display_settings_confirm()&&writes==5&&!pending[0]&&strstr(notice,"未确认"));assert(!display_settings_confirm()&&writes==5);
 read_fail=1;assert(display_settings_action("display-refresh")&&!display_settings_valid);display_settings_render();assert(strstr(html,"act:screen-lock")&&!strstr(html,"act:display-apply"));read_fail=0;observed.sensor_enabled=observed.sensor_lux=-1;observed.automatic=1;assert(display_settings_action("display-refresh")&&display_settings_valid);display_settings_render();assert(strstr(html,"光感暂未读到")&&strstr(html,"act:display-mode:0"));
 puts("PASS: actual display UI has explicit fixed/adaptive modes, local 1-percent draft and presets; confirm once/cancel/no-repeat, readonly denial, stale-mode refusal, bounded values, sensor failure and unknown results; lock remains accessible when settings fail; no device I/O");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-display-settings.c",$source.Replace('ACTUAL_SHELL',$shell))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-display-settings.c" -o "$root/bin/test-display-settings.exe"
if($LASTEXITCODE -ne 0){throw 'Display settings test build failed'}
& "$root/bin/test-display-settings.exe" "$root/preview"
if($LASTEXITCODE -ne 0){throw 'Display settings test failed'}
