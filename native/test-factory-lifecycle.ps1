$ErrorActionPreference='Stop'
$tfRoot=$PSScriptRoot
$tfSource=@'
#include <assert.h>
#include <stdio.h>
#include "factory_lifecycle.h"
#include "factory_guard.h"
static tf_fl_snapshot snapshot(int light){tf_fl_snapshot s={1,1,1,1,1,1,light,light>0,0};return s;}
static void prepared(tf_factory_lifecycle*p,int light){tf_fl_init(p);tf_fl_snapshot s=snapshot(light);assert(tf_fl_prepare(p,TF_FL_REQUIRED,&s));}
static void ack(tf_factory_lifecycle*p,enum tf_fl_action action,int observed,uint32_t now){tf_fl_command c=tf_fl_next(p);assert(c.action==action);assert(tf_fl_ack(p,c,1,observed,now)==1);}
static void adopt(tf_factory_lifecycle*p,int light,uint32_t now){prepared(p,light);assert(tf_fl_adopt(p,1,1,light,1,now));ack(p,TF_FL_ACQUIRE_OWN_GUARD,1,now+1);ack(p,TF_FL_EMIT_LCD,0,now+2);ack(p,TF_FL_VERIFY_LCD_LOCK,light>0,now+3);ack(p,TF_FL_RELEASE_OWN_GUARD,0,now+4);assert(p->phase==TF_FL_READY);}
typedef struct{char active[256];char last[128];int writes,fail_read,fail_write,oversize;uint32_t now,expires;} fake_io;
static int read_active(void*arg,char*buffer,size_t capacity){fake_io*x=arg;if(x->fail_read)return -1;if(x->oversize)return (int)capacity;if(x->expires&&x->now>=x->expires){strcpy(x->active,"sysZteSleepLock zteSleepBacklight\n");x->expires=0;}size_t n=strlen(x->active);assert(n<capacity);memcpy(buffer,x->active,n);return (int)n;}
static int write_fixed(void*arg,enum tf_guard_resource resource,const char*text,size_t size){fake_io*x=arg;x->writes++;assert(size<sizeof x->last);memcpy(x->last,text,size);x->last[size]=0;if(x->fail_write)return 0;if(resource==TF_GUARD_ACQUIRE){assert(!strcmp(text,"topflow_screen_222_9876 10000000000\n"));strcpy(x->active,"sysZteSleepLock zteSleepBacklight topflow_screen_222_9876\n");x->expires=x->now+10000;}else{assert(resource==TF_GUARD_RELEASE);assert(!strcmp(text,"topflow_screen_222_9876\n"));strcpy(x->active,"sysZteSleepLock zteSleepBacklight\n");x->expires=0;}return 1;}
int main(void){
 tf_factory_lifecycle p;tf_fl_init(&p);assert(tf_fl_next(&p).action==TF_FL_NONE);
 for(unsigned bit=1;bit<=128;bit<<=1){tf_fl_init(&p);tf_fl_snapshot s=snapshot(40);assert(!tf_fl_prepare(&p,TF_FL_REQUIRED&~bit,&s));assert(p.error==TF_FL_MISSING_CAPABILITY);}
 tf_fl_snapshot s=snapshot(40);s.original_internal_lock_present=1;tf_fl_init(&p);assert(!tf_fl_prepare(&p,TF_FL_REQUIRED,&s)&&p.error==TF_FL_VENDOR_LOCK_PRESENT);
 s=snapshot(40);s.lcd_lock_present=0;tf_fl_init(&p);assert(!tf_fl_prepare(&p,TF_FL_REQUIRED,&s));
 s=snapshot(40);s.authentication_ready=0;tf_fl_init(&p);assert(!tf_fl_prepare(&p,TF_FL_REQUIRED,&s));
 s=snapshot(40);s.original_present=0;tf_fl_init(&p);assert(!tf_fl_prepare(&p,TF_FL_REQUIRED,&s));
 prepared(&p,40);assert(!tf_fl_adopt(&p,0,1,40,1,0)&&p.phase==TF_FL_RECOVER);
 prepared(&p,40);assert(!tf_fl_adopt(&p,1,1,40,0,0)&&p.error==TF_FL_FRAME_NOT_READY);
 adopt(&p,40,100);assert(!tf_fl_input_allowed(&p,0));assert(tf_fl_input_allowed(&p,1));
 assert(tf_fl_request(&p,80,1,200));assert(tf_fl_next(&p).action==TF_FL_SET_BRIGHTNESS);ack(&p,TF_FL_SET_BRIGHTNESS,80,201);assert(p.phase==TF_FL_READY&&!p.guard_held);
 assert(tf_fl_request(&p,0,1,300));tf_fl_command stale=tf_fl_next(&p);ack(&p,TF_FL_ACQUIRE_OWN_GUARD,1,301);assert(tf_fl_ack(&p,stale,1,1,302)==0);
 ack(&p,TF_FL_SET_BRIGHTNESS,0,302);ack(&p,TF_FL_EMIT_LCD,0,303);tf_fl_command observe=tf_fl_next(&p);assert(tf_fl_ack(&p,observe,1,1,304)==0&&p.guard_held);ack(&p,TF_FL_VERIFY_LCD_LOCK,0,305);ack(&p,TF_FL_RELEASE_OWN_GUARD,0,306);assert(!tf_fl_input_allowed(&p,1));
 assert(!tf_fl_request(&p,80,0,400));assert(tf_fl_request(&p,80,1,400));
 s=snapshot(80);assert(!tf_fl_prepare(&p,TF_FL_REQUIRED,&s)&&p.phase==TF_FL_GUARD);ack(&p,TF_FL_ACQUIRE_OWN_GUARD,1,401);
 ack(&p,TF_FL_SET_BRIGHTNESS,80,402);ack(&p,TF_FL_EMIT_LCD,0,403);ack(&p,TF_FL_VERIFY_LCD_LOCK,1,404);ack(&p,TF_FL_RELEASE_OWN_GUARD,0,405);
 for(int fail_stage=0;fail_stage<5;fail_stage++){
  adopt(&p,80,0);assert(tf_fl_request(&p,0,1,100));
  for(int i=0;i<fail_stage;i++){tf_fl_command c=tf_fl_next(&p);int observed=c.action==TF_FL_ACQUIRE_OWN_GUARD?1:0;assert(tf_fl_ack(&p,c,1,observed,101+i)==1);}
  tf_fl_command c=tf_fl_next(&p);assert(tf_fl_ack(&p,c,0,0,110)==-1&&p.phase==TF_FL_RECOVER);assert(!tf_fl_input_allowed(&p,1));
  ack(&p,TF_FL_RESTORE_FACTORY,1,111);assert(p.phase==TF_FL_RECOVERY_RELEASE);ack(&p,TF_FL_RELEASE_OWN_GUARD,0,112);assert(p.phase==TF_FL_FACTORY);
 }
 adopt(&p,80,0);tf_fl_request(&p,0,1,100);ack(&p,TF_FL_ACQUIRE_OWN_GUARD,1,101);tf_fl_command late=tf_fl_next(&p);assert(tf_fl_ack(&p,late,1,0,3100)==-1&&p.error==TF_FL_TIMEOUT);assert(tf_fl_ack(&p,late,1,0,3101)==0);
 tf_fl_command recover=tf_fl_next(&p);assert(tf_fl_ack(&p,recover,1,0,3102)==-1&&p.phase==TF_FL_BLOCKED&&p.guard_held);
 adopt(&p,80,UINT32_MAX-20);assert(tf_fl_request(&p,0,1,UINT32_MAX-10));tf_fl_tick(&p,50,1);assert(p.phase==TF_FL_GUARD);tf_fl_tick(&p,3000,1);assert(p.error==TF_FL_TIMEOUT);
 adopt(&p,80,0);tf_fl_tick(&p,30,0);assert(p.error==TF_FL_PROVIDER_LOST&&p.phase==TF_FL_RECOVER);
 adopt(&p,80,0);assert(tf_fl_resync(&p,1,0,1,100));ack(&p,TF_FL_ACQUIRE_OWN_GUARD,1,101);assert(tf_fl_next(&p).action==TF_FL_EMIT_LCD&&tf_fl_next(&p).value==0);
 tf_fl_tick(&p,101,0);assert(p.phase==TF_FL_RECOVER);
 fake_io io={0};strcpy(io.active,"sysZteSleepLock zteSleepBacklight\n");tf_guard_io adapter={&io,read_active,write_fixed};tf_factory_guard guard;
 assert(tf_guard_init(&guard,222,9876,adapter));assert(io.writes==0);assert(tf_guard_release(&guard)&&io.writes==0);
 assert(tf_guard_token_present("topflow_screen_222_98760 topflow_screen_222_9876x","topflow_screen_222_9876")==0);
 assert(tf_guard_acquire(&guard)&&guard.held&&io.writes==1);assert(tf_guard_observe(&guard,"zteSleepBacklight")==1);
 assert(tf_guard_release(&guard)&&io.writes==2&&!guard.held);assert(!strcmp(io.active,"sysZteSleepLock zteSleepBacklight\n"));
 assert(tf_guard_acquire(&guard));io.now=10000;int before=io.writes;assert(tf_guard_release(&guard)&&io.writes==before);assert(strstr(io.active,"sysZteSleepLock"));
 io.fail_read=1;assert(!tf_guard_acquire(&guard));assert(!tf_guard_release(&guard));io.fail_read=0;io.oversize=1;assert(tf_guard_observe(&guard,guard.name)==-1);io.oversize=0;io.fail_write=1;assert(!tf_guard_acquire(&guard));
 char name[80];assert(!tf_guard_make_name(name,sizeof name,1,123));assert(!tf_guard_make_name(name,sizeof name,222,0));assert(!tf_guard_make_name(name,4,222,123));
 uint64_t birth=0;assert(tf_guard_starttime("222 (name with ) chars) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 9876\n",&birth)&&birth==9876);assert(!tf_guard_starttime("222 (bad) S 1",&birth));assert(!tf_guard_starttime("222 (bad) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 -1",&birth));
 puts("PASS: complete capability preflight; no vendor lock deletion; locked first frame; ordered display/event/lock readback; stale ACK; all five I/O faults; timeout/wrap; provider loss; recovery barrier; resubscription readback; unique timed guard; expiry; unknown/truncated reads; no secret or device I/O");return 0;
}
'@
[IO.File]::WriteAllText("$tfRoot/build-preview/test-factory-lifecycle.c",$tfSource)
& "$tfRoot/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$tfRoot" "$tfRoot/build-preview/test-factory-lifecycle.c" -o "$tfRoot/bin/test-factory-lifecycle.exe"
if($LASTEXITCODE -ne 0){throw 'Lifecycle test build failed'}
& "$tfRoot/bin/test-factory-lifecycle.exe"
if($LASTEXITCODE -ne 0){throw 'Lifecycle tests failed'}
# Compile Linux-only fixed sysfs adapter as AArch64, but never execute it.
& "$tfRoot/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target aarch64-linux-musl "-I$tfRoot" -c "$tfRoot/build-preview/test-factory-lifecycle.c" -o "$tfRoot/build-preview/test-factory-lifecycle-aarch64.o"
if($LASTEXITCODE -ne 0){throw 'Linux guard adapter compile failed'}
