$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$source=[IO.File]::ReadAllText("$root/upstream/src/touch_input.c")
$from=$source.IndexOf('static int scale(')
$to=$source.IndexOf('void touch_input_read(', $from)
$transforms=$source.Substring($from,$to-$from)
$from=$source.IndexOf('int touch_input_take_latest_gesture(')
$to=$source.IndexOf('void touch_input_drop_replayed_release(', $from)
$queue=$source.Substring($from,$to-$from)
$test=@'
#include <stdio.h>
#include <stdint.h>
#include <assert.h>
#include <string.h>
#include "gesture.h"
#include "touch_input.h"
#include "devui_config.h"
TRANSFORMS
QUEUE
int main(void){
 assert(tf_classify_gesture(240,200,100,205,0,1,0,0)==TF_NEXT);
 assert(tf_classify_gesture(80,200,220,195,0,1,0,0)==TF_PREVIOUS);
 assert(tf_next_page(4,TF_NEXT,5)==0 && tf_next_page(0,TF_PREVIOUS,5)==4);
 assert(tf_classify_gesture(200,200,145,200,0,1,0,0)==TF_NONE);
 assert(tf_classify_gesture(200,200,144,200,0,1,0,0)==TF_NEXT);
 assert(tf_classify_gesture(200,200,140,240,0,1,1,0)==TF_NONE);
 assert(tf_classify_gesture(200,200,190,120,0,1,1,0)==TF_SCROLL);
 assert(tf_classify_gesture(200,200,190,120,0,1,0,0)==TF_NONE);
 assert(tf_classify_gesture(200,200,100,202,0,0,1,0)==TF_NONE);
 assert(tf_classify_gesture(200,200,100,202,0,1,1,1)==TF_NONE);
 assert(tf_classify_gesture(200,200,190,120,0,0,1,1)==TF_SCROLL);
 assert(tf_classify_gesture(100,100,106,104,1,1,0,1)==TF_TAP);
 assert(tf_tap_eligible(14*14) && !tf_tap_eligible(15*15));
 assert(tf_classify_gesture(100,100,100,100,tf_tap_eligible(80*80),1,1,0)==TF_NONE);
 touch_input_t t;memset(&t,0,sizeof t);t.screen_w=320;t.screen_h=480;
 int x=20,y=30;apply_transform(&t,&x,&y);assert(x==20 && y==30);
 int x2=200,y2=30;apply_transform(&t,&x2,&y2);
 assert(tf_classify_gesture(x,y,x2,y2,0,1,0,0)==TF_PREVIOUS);
 assert(scale(4095,0,4095,319)==319 && scale(-1,0,4095,319)==0);
 t.strokeq_head=0;t.strokeq_tail=2;t.tapq_head=0;t.tapq_tail=1;
 t.strokeq_x0[0]=100;t.strokeq_x1[0]=102;t.strokeq_tap[0]=1;
 t.strokeq_x0[1]=240;t.strokeq_y0[1]=100;t.strokeq_x1[1]=100;t.strokeq_y1[1]=101;t.strokeq_tap[1]=0;
 int a,b,c,d,tap;
 assert(touch_input_take_latest_gesture(&t,&a,&b,&c,&d,&tap));
 assert(a==240 && c==100 && tap==0);
 assert(t.tapq_head==t.tapq_tail && t.strokeq_head==t.strokeq_tail);
 assert(!touch_input_take_latest_gesture(&t,&a,&b,&c,&d,&tap));
 puts("PASS: swipe order/wrap; thresholds; diagonal/vertical separation; modal/subpage exclusion; drag is not tap; TopFlow upright coordinates; no stale queued tap");
 return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-gestures.c",$test.Replace('TRANSFORMS',$transforms).Replace('QUEUE',$queue))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/build-preview/test-gestures.c" -o "$root/bin/test-gestures.exe"
if($LASTEXITCODE -ne 0){throw 'Gesture test build failed'}
& "$root/bin/test-gestures.exe"
if($LASTEXITCODE -ne 0){throw 'Gesture tests failed'}
