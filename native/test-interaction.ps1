$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$a=$main.IndexOf('static int paint_frame(drm_disp_t*d,const char*html){');$b=$main.IndexOf('static int render(drm_disp_t*d)', $a)
$paint=$main.Substring($a,$b-$a)
$a=$main.IndexOf('static void motion_discard(void){');$b=$main.IndexOf('static int runtime_wake(', $a)
$motion=$main.Substring($a,$b-$a)
function Get-MainLine([string]$prefix){
 $lines=@($main -split '\r?\n' | Where-Object {$_.TrimStart().StartsWith($prefix)})
 if($lines.Count -ne 1){throw "Expected one actual main branch: $prefix"}
 return $lines[0]
}
$interrupt=Get-MainLine 'if(settle.active&&pressed)'
$fastGesture=Get-MainLine 'if(gesture==TF_NEXT||gesture==TF_PREVIOUS)'
$release=Get-MainLine 'if(mode==TF_DRAG_HORIZONTAL&&swipe_old)'
$screenLock=Get-MainLine 'static void screen_lock(void){'
$sleep=Get-MainLine 'static int runtime_sleep(void){'
$source=@'
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include "interaction.h"
#include "home_mode.h"
#include "soft_lock.h"
static tf_soft_lock soft_lock;
#include "transition.h"
#include "screen_geometry.h"
#include "gesture.h"
#include "touch_input.h"
typedef struct{int width,height,pitch_px;uint16_t*fb;}drm_disp_t;
static tf_drag drag;static tf_settle settle;static uint16_t *swipe_old,*swipe_next;
static int swipe_direction,swipe_top,swipe_scroll,deferred_present,frame_ready,page_h=960,scroll_y=160;
static char swipe_page[96],swipe_previous[96],page[96]="apps.html",previous[96]="network.html",document_page[96];
static int aggregate_home=0;
static struct{int active;}chart_animation;
static struct{int current,mode;}lock_chart;
static struct{int initialized,active;}lock_motion;
static int submissions,parse_calls,repaint_calls,doc_scroll=160,saved_scroll;static uint16_t *target,*saved_target;
static uint32_t clock_now,render_delay;
static int clear_calls,interrupt_input_eligible,interrupt_can_interact;
static uint32_t interrupt_guard;
static uint32_t tick(void){return clock_now;}
void touch_input_clear_taps(touch_input_t*t){clear_calls++;t->in_tap=0;}
static void draw_rate_chart(void){}
static int html_view_pinned_height(void){return 67;}
static void html_view_set_scroll(int scroll){doc_scroll=scroll;}
static int html_view_render_html(const char*s){assert(s);parse_calls++;clock_now+=render_delay;for(int i=0;i<320*480;i++)target[i]=!strcmp(page,"index.html")?22:11;return 960;}
static int html_view_repaint(void){repaint_calls++;return 960;}
static int drm_disp_dirty(drm_disp_t*d,int x,int y,int x2,int y2){assert(d&&x==0&&x2==319&&y>=0&&y2==479);submissions++;return 0;}
static int logical_damage(drm_disp_t*d,int x,int y,int w,int h){return drm_disp_dirty(d,x,y,x+w-1,y+h-1)>=0;}
PAINT
static int render(drm_disp_t*d){strcpy(document_page,page);html_view_set_scroll(scroll_y);return paint_frame(d,"actual-paint-path");}
static void html_view_target_native_begin(uint16_t*p,int pitch){assert(pitch==320);saved_target=target;saved_scroll=doc_scroll;target=p;}
static void html_view_target_end(void){target=saved_target;doc_scroll=saved_scroll;}
static void change_page(const char*p,int sub){assert(!sub);strcpy(previous,page);strcpy(page,p);scroll_y=0;}
MOTION
/* Execute the production branch bodies, including their own break/error paths.
 * Extra locals deliberately allow a regression to the old input-clearing/guard
 * code to compile, then fail behavior assertions instead of a text check. */
static int interrupt_settle(drm_disp_t*display,int pressed){
 drm_disp_t d=*display;int result=0,can_interact=1;uint32_t now=tick(),gesture_block_until=0;
 touch_input_t touch={0};touch.in_tap=1;
 do{INTERRUPT_BRANCH}while(0);
 interrupt_input_eligible=touch.in_tap;interrupt_guard=gesture_block_until;interrupt_can_interact=can_interact;return result;
}
static int quick_gesture(drm_disp_t*display,enum tf_gesture gesture){
 drm_disp_t d=*display;int result=0,current=current_main_page(),dirty=0;uint32_t now=tick();touch_input_t touch={0};touch.in_tap=1;
 do{FAST_BRANCH}while(0);return result;
}
static void release_horizontal(drm_disp_t*display){
 drm_disp_t d=*display;int mode=TF_DRAG_HORIZONTAL;uint32_t now=tick()-200;touch_input_t touch={0};touch.in_tap=1;
 do{RELEASE_BRANCH}while(0);
}
static int controls_enabled=1,factory_bus_active=1,running=1,login_value=-1,sleep_calls,output_level=-1;
static char pending[8]="request",pin_feedback[8]="hint";
static struct{int enabled,locked;}pin_policy;
typedef struct{int locked;}test_display_policy;
static test_display_policy display_policy;
static int unlock_seen_scroll=-1;static char unlock_seen_page[96],unlock_seen_previous[96];
static int display_runtime_unlock_policy(void){unlock_seen_scroll=scroll_y;strcpy(unlock_seen_page,page);strcpy(unlock_seen_previous,previous);return 1;}
static void tf_pin_lock(void*p){(void)p;pin_policy.locked=pin_policy.enabled;}
static int power_menu_resets;
static void power_menu_reset(void){power_menu_resets++;}
static void form_reset(void){}
static void sms_forward_cleanup(void){}
static void factory_extra_cleanup(void){}
static int display_runtime_login(int value){login_value=value;return 1;}
static void tf_display_sleep(test_display_policy*p){assert(p==&display_policy);sleep_calls++;}
static int display_runtime_request(int level){output_level=level;return 1;}
SCREEN_LOCK
RUNTIME_SLEEP
static void source_apps(drm_disp_t*d){motion_discard();strcpy(page,"apps.html");strcpy(previous,"network.html");scroll_y=160;assert(render(d));}
int main(void){
 tf_drag q;tf_drag_begin(&q,250,200,100);assert(tf_drag_move(&q,245,202,1,1,480,320)==TF_DRAG_NONE);
 assert(tf_drag_move(&q,200,203,1,1,480,320)==TF_DRAG_HORIZONTAL&&q.direction==1&&q.offset==50);
 assert(tf_drag_move(&q,260,202,1,1,480,320)==TF_DRAG_HORIZONTAL&&q.offset==0);
 tf_drag_begin(&q,80,200,100);assert(tf_drag_move(&q,160,205,1,1,480,320)==TF_DRAG_HORIZONTAL&&q.direction==-1&&q.offset==80);
 tf_drag_begin(&q,80,200,100);assert(tf_drag_move(&q,83,150,1,1,480,320)==TF_DRAG_VERTICAL&&q.offset==150);
 assert(tf_drag_move(&q,83,-600,1,1,480,320)==TF_DRAG_VERTICAL&&q.offset==480);
 assert(tf_drag_move(&q,83,900,1,1,480,320)==TF_DRAG_VERTICAL&&q.offset==0);
 tf_drag_begin(&q,80,200,0);assert(tf_drag_move(&q,95,215,1,1,480,320)==TF_DRAG_NONE);
 tf_drag_begin(&q,80,20,0);assert(tf_drag_move(&q,160,20,0,0,480,320)==TF_DRAG_NONE);
 tf_settle a;int offset;tf_settle_begin(&a,50,320,100);assert(tf_settle_frame(&a,100,&offset)&&offset==50);assert(!tf_settle_frame(&a,105,&offset));assert(tf_settle_frame(&a,180,&offset)&&offset>50&&offset<320);assert(tf_settle_frame(&a,500,&offset)&&offset==320&&!a.active);
 tf_settle_begin(&a,200,0,UINT32_MAX-20);assert(tf_settle_frame(&a,10,&offset)&&offset<200&&offset>0);assert(tf_settle_frame(&a,140,&offset)&&offset==0&&!a.active);
 uint16_t fb[320*480];for(int i=0;i<320*480;i++)fb[i]=11;target=fb;drm_disp_t d={320,480,320,fb};frame_ready=1;
 assert(swipe_begin(&d,2,1)==1&&swipe_old&&swipe_next&&parse_calls==1&&submissions==0&&frame_ready);
 assert(!strcmp(page,"index.html")&&!strcmp(document_page,"index.html")&&doc_scroll==160);
 assert(swipe_draw(&d,100)&&submissions==1&&fb[0]==11&&fb[66*320+319]==11&&fb[67*320+319]==22);
 assert(swipe_finish(&d,1)&&submissions==2&&!swipe_old&&!swipe_next&&doc_scroll==0&&fb[0]==22);
 assert(swipe_begin(&d,0,-1)==1);assert(swipe_draw(&d,20));assert(swipe_finish(&d,0));assert(!strcmp(page,"index.html")&&!strcmp(document_page,"index.html")&&doc_scroll==0&&!swipe_old&&!swipe_next);
 int before=parse_calls;scroll_y=200;assert(repaint_scroll(&d)&&repaint_calls==1&&parse_calls==before&&doc_scroll==200);
 assert(swipe_begin(&d,0,1)==1);motion_discard();assert(!swipe_old&&!swipe_next&&!settle.active&&!drag.down&&!chart_animation.active);
 /* Cancel a genuinely scrolled source, rather than only a page at offset zero. */
 source_apps(&d);assert(swipe_begin(&d,2,1)==1);assert(swipe_draw(&d,31));assert(swipe_finish(&d,0));
 assert(!strcmp(page,"apps.html")&&!strcmp(previous,"network.html")&&!strcmp(document_page,"apps.html"));
 assert(scroll_y==160&&doc_scroll==160&&!swipe_old&&!swipe_next);
 /* New down during settling must keep tap eligibility and allow normal input
  * to continue immediately on whichever page the prior gesture selected. */
 source_apps(&d);assert(swipe_begin(&d,2,1)==1);tf_settle_begin(&settle,90,320,tick());int cleared=clear_calls;
 assert(!interrupt_settle(&d,1)&&clear_calls==cleared&&interrupt_input_eligible&&interrupt_can_interact&&!interrupt_guard);
 assert(!settle.active&&!swipe_old&&!swipe_next&&!strcmp(page,"index.html")&&!strcmp(document_page,"index.html")&&doc_scroll==0);
 source_apps(&d);assert(swipe_begin(&d,2,1)==1);tf_settle_begin(&settle,31,0,tick());cleared=clear_calls;
 assert(!interrupt_settle(&d,1)&&clear_calls==cleared&&interrupt_input_eligible&&interrupt_can_interact&&!interrupt_guard);
 assert(!strcmp(page,"apps.html")&&!strcmp(document_page,"apps.html")&&scroll_y==160&&doc_scroll==160);
 /* Actual quick-gesture branch: preparing the destination takes 200 ms.
  * That work must not consume any of the 144 ms settling duration. */
 source_apps(&d);clock_now=1000;render_delay=200;cleared=clear_calls;
 assert(!quick_gesture(&d,TF_NEXT)&&clock_now==1200&&settle.began==1200&&settle.active&&clear_calls==cleared+1);
 assert(tf_settle_frame(&settle,tick(),&offset)&&offset==0&&settle.active);
 assert(tf_settle_frame(&settle,1272,&offset)&&offset>0&&offset<320&&settle.active);
 assert(tf_settle_frame(&settle,1344,&offset)&&offset==320&&!settle.active);assert(swipe_finish(&d,1));render_delay=0;
 source_apps(&d);assert(swipe_begin(&d,2,1)==1);drag.offset=120;clock_now=2000;cleared=clear_calls;release_horizontal(&d);
 assert(settle.began==2000&&settle.from==120&&settle.to==320&&clear_calls==cleared+1);assert(swipe_finish(&d,0));
 /* Production sleep entry restores the source before policy/auth work, drops
  * all animation buffers, then applies its existing scroll-reset/lock policy. */
 source_apps(&d);assert(swipe_begin(&d,2,1)==1);tf_settle_begin(&settle,25,0,tick());drag.down=1;chart_animation.active=1;int submitted=submissions;
 assert(runtime_sleep()&&sleep_calls==1&&output_level==0&&login_value==1&&power_menu_resets==1);
 assert(!strcmp(unlock_seen_page,"apps.html")&&!strcmp(unlock_seen_previous,"network.html")&&unlock_seen_scroll==160);
 assert(!strcmp(page,"apps.html")&&!strcmp(previous,"network.html")&&scroll_y==0&&!controls_enabled&&!pending[0]&&!pin_feedback[0]);
 assert(!swipe_old&&!swipe_next&&!settle.active&&!drag.down&&!chart_animation.active&&submissions==submitted);
 assert(render(&d)&&!strcmp(document_page,"apps.html")&&doc_scroll==0);
 puts("PASS: continuous gesture thresholds/direction/clamps, monotonic settle skips late frames, no offscreen DRM submit, pinned swipe rows, scrolled-source commit/cancel document/scroll, retained scroll repaint, actual main branches preserve new input and exclude 200ms preparation from animation, sleep cancels to source before policy and frees motion buffers");return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-interaction.c",$source.Replace('PAINT',$paint).Replace('MOTION',$motion).Replace('INTERRUPT_BRANCH',$interrupt).Replace('FAST_BRANCH',$fastGesture).Replace('RELEASE_BRANCH',$release).Replace('SCREEN_LOCK',$screenLock).Replace('RUNTIME_SLEEP',$sleep))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/build-preview/test-interaction.c" -o "$root/bin/test-interaction.exe"
if($LASTEXITCODE -ne 0){throw 'Interaction test build failed'}
& "$root/bin/test-interaction.exe"
if($LASTEXITCODE -ne 0){throw 'Interaction test failed'}
if($main -match 'usleep\(16000\)|gesture_block_until=tick\(\)\+150|const int steps\[\]'){throw 'Blocking fixed-frame swipe path remains'}
if($main.IndexOf('touch_input_read(&touch') -gt $main.IndexOf('if(!interacting)data_backend_poll')){throw 'Background polling precedes input'}
