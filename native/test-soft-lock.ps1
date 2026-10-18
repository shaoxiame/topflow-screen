$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
function Slice([string]$start,[string]$end){$a=$main.IndexOf($start);$b=$main.IndexOf($end,$a);if($a -lt 0 -or $b -lt 0){throw "Missing main boundary $start"};return $main.Substring($a,$b-$a)}
$unlock=Slice 'static int screen_unlock_complete(void)' '/* Local no-PIN hold'
$input=Slice 'static int screen_soft_input(' 'static void action('
$action=(Slice 'static void action(' ' if(!strcmp(a,"screen-lock"))')+" content_actions++;}`n"
$render=(Slice 'static int render(drm_disp_t*d)' 'refresh_tokens();sync_home_page();')+"return paint_frame(d,`"PRIVATE CONTENT`");}`n"
$dispatch=Slice '  now=tick();int soft_consumed=' '  if(pressed)last_interaction=now;'
$gesture=[regex]::Match($main,'if\(!soft_consumed&&!gesture_block_until&&!drag.mode&&!settle.active&&touch_input_take_latest_gesture[^\{]+\{').Value+'content_actions++;}'
$source=@'
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "soft_lock.h"
#define TF_FL_READY 6
static tf_soft_lock soft_lock;
static struct{int current;}lock_wallpaper;
static struct{int active;}power_menu;
static int power_menu_action(const char*a){return 0;}
static char advanced_html[16];
static void refresh_tokens(void){}
static void power_menu_render(void){}
static struct{int enabled,locked;}pin_policy;
static struct{int phase,brightness;}factory_lifecycle;
static int display_runtime_ready=1,on=1,frame_ready=1,theme_dark,controls_enabled,busy_visible;
static int reads,logins,login_value,policy_ok=1,login_ok=1,cancelled,damage,content_actions,pin_calls;
static char painted[64];
static uint32_t test_clock,gesture_block_until;static int queued,clear_calls,take_calls;static struct{int mode;}drag;static struct{int active;}settle;
static uint32_t tick(void){return test_clock;}
static int tf_http_cancelled,test_oem_on=1;static int runtime_factory_power_read(int force){(void)force;return test_oem_on;}static void tf_page_state_cancel(void){}
static void touch_input_clear_taps(int*t){queued=0;clear_calls++;}
static int touch_input_take_latest_gesture(int*t,int*x0,int*y0,int*x1,int*y1,int*tap){take_calls++;int was=queued;queued=0;return was;}
typedef struct{int unused;}drm_disp_t;
static int display_runtime_unlock_policy(void){reads++;return policy_ok;}
static int display_runtime_login(int value){logins++;login_value=value;return login_ok;}
static int backlight_is_on(void){return on;}
static void motion_cancel(void){cancelled++;}
static void html_view_fill_round_rect(int x,int y,int w,int h,int radius,int r,int g,int b,int a){assert(x==TF_SOFT_PROGRESS_X&&y==TF_SOFT_PROGRESS_Y&&w>=0&&w<=TF_SOFT_PROGRESS_WIDTH&&h==TF_SOFT_PROGRESS_HEIGHT&&radius==1);}
static int html_view_text_width_px(const char*s,int size){assert(size==15);return 120;}
static void html_view_draw_text_px(int x,int y,const char*s,int size,int bold,int r,int g,int b,int a){assert(x==100&&y==333&&size==15&&bold==1&&r==255&&g==255&&b==255&&a==255);assert(!strcmp(s,"长按解锁"));}
static int logical_damage(drm_disp_t*d,int x,int y,int w,int h){assert(d&&x==TF_SOFT_PROGRESS_X&&y==TF_SOFT_PROGRESS_Y&&w==TF_SOFT_PROGRESS_WIDTH&&h==TF_SOFT_PROGRESS_HEIGHT);damage++;return 1;}
UNLOCK
INPUT
static int tf_fl_input_allowed(void*p,int valid){return valid;}
static void pin_action(const char*a){pin_calls++;}
ACTION
static struct{int valid;}state;static void data_refresh(void*p){}static uint32_t data_snapshot_age_ms(void){return 0;}
static void lock_dashboard_prepare(void){}
static void html_view_set_scroll(int scroll){assert(scroll==0);}
static const char*pin_screen_html(void){return "PIN ONLY";}
static const char*soft_screen_html(int progress){return "HOLD ONLY";}
static int paint_frame(drm_disp_t*d,const char*html){snprintf(painted,sizeof painted,"%s",html);return 1;}
RENDER
static void loop_frame(drm_disp_t*display,uint32_t clock,int pressed,int x,int y){drm_disp_t d=*display;int dirty=0,result=0,touch=0,x0,y0,x1,y1,is_tap;test_clock=clock;uint32_t now=clock;if(gesture_block_until){if((int32_t)(gesture_block_until-now)>0)touch_input_clear_taps(&touch);else gesture_block_until=0;}do{
DISPATCH
GESTURE
}while(0);assert(!result);}
static void reset(int pin){test_oem_on=1;pin_policy.enabled=pin;pin_policy.locked=pin;tf_soft_lock_reset(&soft_lock,pin);controls_enabled=0;factory_lifecycle.phase=TF_FL_READY;factory_lifecycle.brightness=100;display_runtime_ready=on=policy_ok=login_ok=1;reads=logins=cancelled=damage=content_actions=pin_calls=0;gesture_block_until=queued=clear_calls=take_calls=0;}
int main(void){drm_disp_t d={0};int dirty=0;
 reset(0);assert(render(&d)&&!strcmp(painted,"HOLD ONLY"));action("act:confirm");assert(!content_actions&&!controls_enabled&&!reads&&!logins);
 /* A finger already down at entry cannot satisfy the hold. */
 assert(screen_soft_input(&d,100,1,100,390,0,&dirty)==1);assert(screen_soft_input(&d,2100,1,100,390,0,&dirty)==1&&soft_lock.locked&&!dirty);
 assert(screen_soft_input(&d,2200,0,100,390,0,&dirty)==1);assert(screen_soft_input(&d,2300,1,100,390,0,&dirty)==1);assert(screen_soft_input(&d,2799,1,100,390,0,&dirty)==1&&soft_lock.progress==499&&damage==1);assert(screen_soft_input(&d,3299,1,100,390,0,&dirty)==1&&soft_lock.locked&&!dirty);
 assert(screen_soft_input(&d,3900,1,100,390,0,&dirty)==1&&!soft_lock.locked&&soft_lock.block_release&&controls_enabled&&dirty&&reads==1&&logins==1&&login_value==1);assert(render(&d)&&!strcmp(painted,"PRIVATE CONTENT"));action("act:confirm");assert(!content_actions);assert(screen_soft_input(&d,5300,1,290,100,0,&dirty)==1);assert(screen_soft_input(&d,5400,0,290,100,0,&dirty)==1&&!soft_lock.block_release);action("act:confirm");assert(content_actions==1);
 /* Execute actual loop dispatch, touch-clear and gesture guards together. */
 reset(0);loop_frame(&d,0,0,100,390);loop_frame(&d,100,1,100,390);queued=1;loop_frame(&d,1100,1,100,390);assert(!soft_lock.locked&&controls_enabled&&!queued&&!content_actions);queued=1;loop_frame(&d,3100,1,290,100);assert(!queued&&!content_actions&&soft_lock.block_release);queued=1;loop_frame(&d,3200,0,290,100);assert(!queued&&!content_actions&&!soft_lock.block_release);loop_frame(&d,3600,0,290,100);assert(!content_actions);queued=1;loop_frame(&d,3700,0,290,100);assert(content_actions==1);
 /* Outside-down, move-out/back, release, and interruption require a new press. */
 reset(0);screen_soft_input(&d,0,0,0,0,0,&dirty);screen_soft_input(&d,100,1,10,390,0,&dirty);screen_soft_input(&d,1200,1,100,390,0,&dirty);assert(soft_lock.locked&&!soft_lock.progress&&!controls_enabled);screen_soft_input(&d,1300,0,100,390,0,&dirty);screen_soft_input(&d,1400,1,100,390,0,&dirty);screen_soft_input(&d,1900,1,100,390,0,&dirty);assert(soft_lock.progress==500);screen_soft_input(&d,1950,1,300,390,0,&dirty);screen_soft_input(&d,3000,1,100,390,0,&dirty);assert(soft_lock.locked&&!soft_lock.progress);screen_soft_input(&d,3100,0,100,390,0,&dirty);screen_soft_input(&d,3200,1,100,390,0,&dirty);screen_soft_input(&d,3700,1,100,390,0,&dirty);screen_soft_input(&d,3800,1,100,390,1,&dirty);screen_soft_input(&d,5000,1,100,390,0,&dirty);assert(soft_lock.locked&&!soft_lock.progress&&!controls_enabled);screen_soft_input(&d,5100,0,100,390,0,&dirty);screen_soft_input(&d,5200,1,100,390,0,&dirty);screen_soft_input(&d,5600,1,100,390,0,&dirty);screen_soft_input(&d,5700,0,100,390,0,&dirty);assert(!soft_lock.progress&&soft_lock.locked);
 /* Sleep interruption drops progress and keeps authorization revoked. */
 reset(0);screen_soft_input(&d,0,0,0,0,0,&dirty);screen_soft_input(&d,100,1,100,390,0,&dirty);screen_soft_input(&d,600,1,100,390,0,&dirty);on=0;screen_soft_input(&d,700,1,100,390,0,&dirty);on=1;screen_soft_input(&d,2000,1,100,390,0,&dirty);assert(soft_lock.locked&&!soft_lock.progress&&!controls_enabled);tf_soft_lock_reset(&soft_lock,0);screen_soft_input(&d,4000,1,100,390,0,&dirty);assert(soft_lock.locked&&!controls_enabled);
 /* Existing PIN wins; local hold cannot authorize it or expose content. */
 reset(1);assert(render(&d)&&!strcmp(painted,"PIN ONLY"));screen_soft_input(&d,0,0,0,0,0,&dirty);screen_soft_input(&d,100,1,100,390,0,&dirty);screen_soft_input(&d,2000,1,100,390,0,&dirty);assert(pin_policy.locked&&!controls_enabled&&!reads&&!logins&&!soft_lock.locked);action("act:theme");assert(pin_calls==1&&!content_actions);
 /* Completion rechecks unchanged original policy and login acknowledgement. */
 reset(0);screen_soft_input(&d,0,0,0,0,0,&dirty);screen_soft_input(&d,1,1,100,390,0,&dirty);policy_ok=0;assert(screen_soft_input(&d,1001,1,100,390,0,&dirty)==-1&&!controls_enabled&&reads==1&&!logins);
 reset(0);screen_soft_input(&d,0,0,0,0,0,&dirty);screen_soft_input(&d,1,1,100,390,0,&dirty);policy_ok=0;test_oem_on=0;assert(screen_soft_input(&d,1001,1,100,390,0,&dirty)==1&&soft_lock.locked&&!controls_enabled);test_oem_on=1;
 reset(0);screen_soft_input(&d,0,0,0,0,0,&dirty);screen_soft_input(&d,1,1,100,390,0,&dirty);login_ok=0;assert(screen_soft_input(&d,1001,1,100,390,0,&dirty)==-1&&!controls_enabled&&logins==1);
 /* Wrap-around and exact rectangle bounds, including right/bottom exclusion. */
 tf_soft_lock q;tf_soft_lock_reset(&q,0);tf_soft_lock_touch(&q,UINT32_MAX-600,0,20,366,1);tf_soft_lock_touch(&q,UINT32_MAX-500,1,20,366,1);assert(tf_soft_lock_touch(&q,499,1,299,425,1)==TF_SOFT_UNLOCK);assert(!tf_soft_lock_inside(300,390)&&!tf_soft_lock_inside(100,426)&&!tf_soft_lock_inside(19,366)&&!tf_soft_lock_inside(20,365));
 puts("PASS: actual main no-PIN render/action/input gates; 1000ms inside-only hold; progress damage only; initial held finger/outside/move-out/release/interruption reset; completing release consumed; enabled PIN priority; policy/login failure cannot authorize; timer wrap and exact hit bounds");return 0;
}
'@
$source=$source.Replace("`nUNLOCK`n","`n$unlock`n").Replace('INPUT',$input).Replace('ACTION',$action).Replace('RENDER',$render).Replace('DISPATCH',$dispatch).Replace('GESTURE',$gesture)
[IO.File]::WriteAllText("$root/build-preview/test-soft-lock.c",$source)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-soft-lock.c" -o "$root/bin/test-soft-lock.exe"
if($LASTEXITCODE -ne 0){throw 'Soft lock integration test build failed'}
& "$root/bin/test-soft-lock.exe"
if($LASTEXITCODE -ne 0){throw 'Soft lock integration test failed'}
if($main -notmatch 'if\(!soft_consumed&&!gesture_block_until&&!drag.mode&&!settle.active&&touch_input_take_latest_gesture' -or $main -notmatch 'if\(soft_consumed\)\{touch_input_clear_taps' -or $main -notmatch 'controls_enabled=!pin_policy.locked&&!soft_lock.locked'){throw 'Missing production gesture consumption or no-PIN authorization guard'}
Write-Output 'PASS: production gesture dispatcher blocks soft-lock touches and consumes release'
