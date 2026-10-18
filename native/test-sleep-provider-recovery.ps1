$ErrorActionPreference='Stop'
$root=$PSScriptRoot
function Extract([string]$text,[string]$start,[string]$end){$a=$text.IndexOf($start);$b=$text.IndexOf($end,$a);if($a -lt 0 -or $b -le $a){throw "Missing boundary: $start"};return $text.Substring($a,$b-$a)}
$helper=[IO.File]::ReadAllText("$root/factory_bus.c")
$client=[IO.File]::ReadAllText("$root/factory_bus_client.h")
$source=@'
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <sys/types.h>
#include "factory_bus_logic.h"
#define BLOBMSG_TYPE_STRING 3
#define MSG_DONTWAIT 1
#define MSG_TRUNC 2
struct ubus_context{int unused;};struct ubus_subscriber{int unused;};struct ubus_event_handler{int unused;};struct uloop_timeout{int unused;};
struct blob_attr{const char*value;struct blob_attr*fields[2];};struct blobmsg_policy{const char*name;int type;};
static struct ubus_context storage,*bus=&storage;static struct ubus_subscriber sleep_sub;
static uint32_t sleep_id,device_power_sequence,quicken_pending,poweroff_pending,sleep_subscribe_id;
static int poweroff_needed,quicken_needed,poweroff_done,quicken_done,device_power_current,sleep_unavailable,sleep_recovery_busy,sleep_recovery_trigger,sleep_subscribe_lost;
static int failed,completion_busy,reregister_pending;
static uint64_t last_parent_ms,clock_ms,sleep_recovery_deadline,sleep_recovery_next;
static int lookup_calls,subscribe_calls,lookup_ok,subscribe_ok,lookup_mode,subscribe_mode,available,unavailable,resync,timer_ms;
static tf_bus_packet queue[128];static unsigned qn,qi;
static uint64_t monotonic_ms(void){return clock_ms;}
static void fail(void){failed=1;}
static int send_packet(uint32_t type,uint32_t sequence,uint32_t value){assert(qn<128);queue[qn++]=(tf_bus_packet){TF_BUS_MAGIC,type,sequence,value};if(type==TF_BUS_SLEEP_PROVIDER){if(value)available++;else unavailable++;}if(type==TF_BUS_RESYNC)resync++;return 1;}
static void recover_sleep(void);static void event(const char*,const char*);
ACTUAL_LOST
ACTUAL_REMOVED
static int subscribe_sleep(void){subscribe_calls++;return subscribe_ok;}
ACTUAL_REREGISTER
static int bus_object_lookup(const char*name,uint32_t*id){assert(!strcmp(name,"zwrt_zte_sleep_faw.power_status")&&sleep_recovery_busy);lookup_calls++;*id=42;
 if(lookup_mode==1){lookup_mode=0;event("mode_power_off_unreal","");}
 else if(lookup_mode==2){lookup_mode=0;event("mode_power_off_unreal","");event("mode_power_on","");}
 else if(lookup_mode==3){lookup_mode=0;reregistered(bus,NULL,NULL,NULL);assert(reregister_pending);}
 else if(lookup_mode==4){lookup_mode=0;lost(bus);}
 else if(lookup_mode==5){clock_ms=sleep_recovery_deadline;}
 return lookup_ok;
}
static int recovery_subscribe(uint32_t id,unsigned limit){assert(id==42&&sleep_recovery_busy&&limit<=1000);if(!limit)return 0;subscribe_calls++;
 if(subscribe_mode==1){subscribe_mode=0;removed(bus,&sleep_sub,id);}
 else if(subscribe_mode==2){subscribe_mode=0;event("mode_power_off_unreal","");}
 else if(subscribe_mode==3){subscribe_mode=0;clock_ms=sleep_recovery_deadline;}
 return subscribe_ok;
}
ACTUAL_RECOVER
static void*blob_data(struct blob_attr*p){return p;}static int blob_len(struct blob_attr*p){(void)p;return 2;}
static const char*blobmsg_get_string(struct blob_attr*p){return p->value;}
static void blobmsg_parse(const struct blobmsg_policy*p,int n,struct blob_attr**out,void*data,int len){assert(n==2&&len==2&&!strcmp(p[0].name,"action")&&!strcmp(p[1].name,"parameter"));struct blob_attr*m=data;out[0]=m->fields[0];out[1]=m->fields[1];}
ACTUAL_EVENTS
static void uloop_timeout_set(struct uloop_timeout*t,int ms){(void)t;assert(ms>0&&ms<=1000);timer_ms=ms;}
ACTUAL_WATCHDOG
ACTUAL_CLIENT_TYPE
static ssize_t recv(int fd,void*out,size_t cap,int flags){assert(fd==3&&cap==sizeof(tf_bus_packet)&&flags==(MSG_DONTWAIT|MSG_TRUNC));if(qi==qn){errno=EAGAIN;return -1;}memcpy(out,&queue[qi++],cap);return (ssize_t)cap;}
ACTUAL_POLL
static void event(const char*action,const char*parameter){struct blob_attr a={.value=action},p={.value=parameter},m={.fields={action?&a:NULL,parameter?&p:NULL}};device_power_broadcast(bus,NULL,NULL,&m);}
static void reset(void){sleep_id=10;device_power_sequence=quicken_pending=poweroff_pending=sleep_subscribe_id=0;poweroff_needed=quicken_needed=poweroff_done=quicken_done=device_power_current=sleep_unavailable=sleep_recovery_busy=sleep_recovery_trigger=sleep_subscribe_lost=failed=completion_busy=reregister_pending=0;last_parent_ms=clock_ms=100;sleep_recovery_deadline=sleep_recovery_next=0;lookup_calls=subscribe_calls=lookup_mode=subscribe_mode=available=unavailable=resync=timer_ms=0;lookup_ok=subscribe_ok=1;qn=qi=0;}
static void off_remove(void){event("mode_power_off_unreal","");removed(bus,&sleep_sub,10);assert(!failed&&sleep_unavailable&&!sleep_id&&unavailable==1);}
int main(void){tf_factory_bus c;
 reset();removed(bus,&sleep_sub,10);assert(failed&&!unavailable); /* no explicit OFF */
 reset();event("mode_power_on","");removed(bus,&sleep_sub,10);assert(failed&&!unavailable); /* ordinary ON loss stays fatal */
 reset();event("mode_power_off_unreal","");removed(bus,&sleep_sub,9);assert(!failed&&sleep_id==10&&!unavailable); /* stale ID */
 removed(bus,&sleep_sub,10);removed(bus,&sleep_sub,10);assert(unavailable==1&&!failed);for(int i=0;i<30;i++){clock_ms+=1000;last_parent_ms=clock_ms;watchdog_tick(NULL);}assert(!lookup_calls&&!subscribe_calls&&!available&&!failed); /* no OFF lookup polling */
 /* Remove -> reregister while OFF -> ON. No resume until both facts hold. */
 reset();off_remove();reregistered(bus,NULL,NULL,NULL);assert(sleep_id==42&&!sleep_unavailable&&available==1&&lookup_calls==1&&subscribe_calls==1);event("mode_power_on","");watchdog_tick(NULL);assert(!failed&&!sleep_unavailable&&available==1&&resync==1&&lookup_calls==1);
 c=(tf_factory_bus){.fd=3};assert(tf_fb_poll(&c)&&!c.failed&&c.device_power_state==1&&c.device_power_sequence==2&&!c.sleep_unavailable&&c.resync);
 removed(bus,&sleep_sub,10);assert(!failed&&sleep_id==42);removed(bus,&sleep_sub,42);assert(failed); /* stale remove ignored; current ON remove fatal */
 /* ON arrives first, but availability gate precedes it on the wire. */
 reset();off_remove();event("mode_power_on","");c=(tf_factory_bus){.fd=3};assert(tf_fb_poll(&c)&&c.sleep_unavailable&&c.device_power_state==1&&!c.failed);watchdog_tick(NULL);assert(tf_fb_poll(&c)&&!c.sleep_unavailable&&c.resync&&available==1&&!failed);
 reregistered(bus,NULL,NULL,NULL);assert(!failed&&available==1); /* ordinary resync cannot fabricate another ON */
 /* The latest OFF cancels a waiting ON and its retry window. */
 reset();off_remove();event("mode_power_on","");event("mode_power_off_unreal","");watchdog_tick(NULL);assert(!lookup_calls&&!sleep_recovery_deadline&&!available);reregistered(bus,NULL,NULL,NULL);assert(sleep_id==42&&!sleep_unavailable&&available==1);event("mode_power_on","");watchdog_tick(NULL);c=(tf_factory_bus){.fd=3};assert(tf_fb_poll(&c)&&c.device_power_sequence==4&&c.device_power_state==1&&!c.sleep_unavailable&&!failed);
 /* Callback reentrancy can replace ON during either lookup or subscription. */
 reset();off_remove();event("mode_power_on","");lookup_mode=1;watchdog_tick(NULL);assert(!failed&&!sleep_unavailable&&available==1&&!sleep_recovery_deadline&&sleep_id==42);event("mode_power_on","");watchdog_tick(NULL);assert(available==1&&!failed);
 reset();off_remove();event("mode_power_on","");subscribe_mode=2;watchdog_tick(NULL);assert(!failed&&!sleep_unavailable&&available==1&&!sleep_recovery_deadline);
 reset();off_remove();event("mode_power_on","");lookup_mode=2;watchdog_tick(NULL);assert(!failed&&available==1);c=(tf_factory_bus){.fd=3};assert(tf_fb_poll(&c)&&c.device_power_sequence==4&&!c.failed);
 /* A just-subscribed object removed during the call is never marked ready. */
 reset();off_remove();event("mode_power_on","");subscribe_mode=1;watchdog_tick(NULL);assert(!failed&&sleep_unavailable&&!sleep_id&&!available);clock_ms+=1000;watchdog_tick(NULL);assert(available==1&&!failed);
 /* Completion busy cannot enter nested recovery; deferred rereg is retained. */
 reset();off_remove();completion_busy=1;reregistered(bus,NULL,NULL,NULL);watchdog_tick(NULL);assert(reregister_pending&&!lookup_calls);completion_busy=0;watchdog_tick(NULL);assert(!reregister_pending&&lookup_calls==1&&available==1);event("mode_power_on","");watchdog_tick(NULL);assert(available==1);
 reset();off_remove();event("mode_power_on","");lookup_mode=3;watchdog_tick(NULL);assert(!failed&&available==1&&!reregister_pending&&lookup_calls==1&&subscribe_calls==1);watchdog_tick(NULL);assert(!reregister_pending&&available==1&&lookup_calls==1&&subscribe_calls==1);
 /* A three-second ON budget never publishes a late availability result. */
 reset();off_remove();event("mode_power_on","");lookup_ok=0;watchdog_tick(NULL);assert(lookup_calls==1&&!failed);clock_ms+=500;watchdog_tick(NULL);assert(lookup_calls==1);clock_ms+=500;watchdog_tick(NULL);assert(lookup_calls==2);clock_ms+=1000;watchdog_tick(NULL);assert(lookup_calls==3);clock_ms+=1000;watchdog_tick(NULL);assert(failed&&lookup_calls==3&&!available);
 reset();off_remove();event("mode_power_on","");lookup_mode=5;watchdog_tick(NULL);assert(failed&&!subscribe_calls&&!available);
 reset();off_remove();event("mode_power_on","");subscribe_mode=3;watchdog_tick(NULL);assert(failed&&!available);
 /* Actual whole bus loss is never transformed into a recoverable object loss. */
 reset();off_remove();event("mode_power_on","");lookup_mode=4;watchdog_tick(NULL);assert(failed&&!subscribe_calls&&!available);
 reset();off_remove();lost(bus);assert(failed);
 puts("PASS: actual sleep remove/reregister/MC callback/client: explicit OFF only, availability before ON, OFF no polling, bounded ON retries, stale and in-flight IDs, new OFF cancellation, nested callbacks, real bus loss fatal");return 0;
}
'@
$parts=@{
 ACTUAL_LOST=(Extract $helper 'static void lost(' '/* Fixed commands only');
 ACTUAL_REMOVED=(Extract $helper 'static void removed(' 'static int subscribe_sleep(');
 ACTUAL_REREGISTER=(Extract $helper 'static void reregistered(' 'static void power_broadcast(');
 ACTUAL_RECOVER=(Extract $helper 'static void recover_sleep(void){' 'static const struct blobmsg_policy device_power_policy');
 ACTUAL_EVENTS=(Extract $helper 'static const struct blobmsg_policy device_power_policy' 'static int device_complete(');
 ACTUAL_WATCHDOG=(Extract $helper 'static void watchdog_tick(' 'int main(');
 ACTUAL_CLIENT_TYPE=(Extract $client 'typedef struct {' 'static uint64_t tf_fb_now(');
 ACTUAL_POLL=(Extract $client 'static int tf_fb_poll(' 'static int tf_fb_command(')
}
foreach($entry in $parts.GetEnumerator()){$source=$source.Replace($entry.Key,$entry.Value)}
New-Item -ItemType Directory -Force "$root/build-preview" | Out-Null
$path="$root/build-preview/test-sleep-provider-recovery.c"
[IO.File]::WriteAllText($path,$source,[Text.UTF8Encoding]::new($false))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror -Wno-unused-function "-I$root" $path -o "$root/build-preview/test-sleep-provider-recovery.exe"
if($LASTEXITCODE -ne 0){throw 'Sleep provider recovery compile failed'}
& "$root/build-preview/test-sleep-provider-recovery.exe"
if($LASTEXITCODE -ne 0){throw 'Sleep provider recovery test failed'}

# The actual recovery timer wrapper, including the arm/disarm signal-mask
# ordering and a queued late alarm. Only POSIX/ubus boundaries are simulated.
$timer=Extract $helper 'static void sleep_subscribe_expired(' 'static void recover_sleep(void){'
$timerSource=@'
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <setjmp.h>
#define SIGALRM 14
#define SIG_BLOCK 1
#define SIG_SETMASK 2
#define ITIMER_REAL 0
typedef unsigned sigset_t;
struct timeval{long tv_sec,tv_usec;};struct timespec{long tv_sec,tv_nsec;};
struct itimerval{struct timeval it_interval,it_value;};
struct sigaction{void(*sa_handler)(int);sigset_t sa_mask;};
static void*bus=(void*)1;static int sleep_sub,failed;
static sigset_t mask,pending;
static struct sigaction handler;
static struct itimerval armed;
static uint64_t clock_ms;
static int mode,subscribes,drains,exited,arm_calls,disarm_calls;
static jmp_buf exit_jump;
static uint64_t monotonic_ms(void){return clock_ms;}
static void mock_exit(int n){exited=n;longjmp(exit_jump,1);}
#define _exit mock_exit
static void original_handler(int n){(void)n;assert(0);}
static int sigemptyset(sigset_t*s){*s=0;return 0;}
static int sigaddset(sigset_t*s,int signal){assert(signal==SIGALRM);*s|=1;return 0;}
static int sigismember(const sigset_t*s,int signal){assert(signal==SIGALRM);return !!(*s&1);}
static int sigprocmask(int how,const sigset_t*value,sigset_t*old){if(old)*old=mask;if(how==SIG_BLOCK)mask|=*value;else{assert(how==SIG_SETMASK);mask=*value;}return 0;}
static int getitimer(int which,struct itimerval*out){assert(which==ITIMER_REAL&&(mask&1));*out=armed;return 0;}
static int sigaction(int signal,const struct sigaction*value,struct sigaction*old){assert(signal==SIGALRM&&(mask&1));if(mode==7&&old)return -1;if(old)*old=handler;handler=*value;return 0;}
static int setitimer(int which,const struct itimerval*value,struct itimerval*old){assert(which==ITIMER_REAL&&(mask&1)&&!old);if(value->it_value.tv_sec||value->it_value.tv_usec){arm_calls++;if(mode==6)return -1;}else{disarm_calls++;if(mode==8)return -1;}armed=*value;return 0;}
static int sigpending(sigset_t*out){assert(mask&1);*out=pending;return 0;}
static int sigtimedwait(const sigset_t*set,void*info,const struct timespec*timeout){assert(*set==1&&!info&&!timeout->tv_sec&&!timeout->tv_nsec&&(mask&1)&&(pending&1));pending&=~1u;drains++;return SIGALRM;}
static int ubus_subscribe(void*ctx,int*sub,uint32_t id){assert(ctx==bus&&sub==&sleep_sub&&id==42&&!mask&&handler.sa_handler!=original_handler);subscribes++;unsigned ms=(unsigned)(armed.it_value.tv_sec*1000+armed.it_value.tv_usec/1000);assert(ms&&ms<=1000);
 if(mode==1){pending|=1;return 0;} /* alarm queues just as the call returns */
 if(mode==2){handler.sa_handler(SIGALRM);assert(0);} /* real deadline exits helper */
 if(mode==3)return 9;
 if(mode==4){clock_ms+=ms;return 0;}
 clock_ms+=10;return 0;
}
ACTUAL_TIMER
static void reset(void){mask=pending=0;handler=(struct sigaction){.sa_handler=original_handler};memset(&armed,0,sizeof armed);failed=mode=subscribes=drains=exited=arm_calls=disarm_calls=0;clock_ms=100;}
static void restored(void){assert(!mask&&!pending&&!armed.it_value.tv_sec&&!armed.it_value.tv_usec&&handler.sa_handler==original_handler);}
int main(void){
 reset();assert(!recovery_subscribe(42,0)&&!recovery_subscribe(42,1001)&&!subscribes);assert(recovery_subscribe(42,1000)&&subscribes==1&&arm_calls==1&&disarm_calls==1);restored();assert(recovery_subscribe(42,50)&&subscribes==2);restored();
 reset();mode=1;assert(!recovery_subscribe(42,1000)&&drains==1&&subscribes==1);restored();mode=0;assert(recovery_subscribe(42,1000));restored(); /* old pending alarm cannot kill later work */
 reset();mode=2;if(!setjmp(exit_jump)){recovery_subscribe(42,1000);assert(0);}assert(exited==7&&subscribes==1); /* EOF fallback, not successful subscription */
 reset();mode=3;assert(!recovery_subscribe(42,1000));restored();
 reset();mode=4;assert(!recovery_subscribe(42,1000));restored();
 reset();failed=1;assert(!recovery_subscribe(42,1000));restored();
 reset();mask=1;assert(!recovery_subscribe(42,1000)&&mask==1&&!subscribes&&!arm_calls);
 reset();armed.it_value.tv_sec=2;assert(!recovery_subscribe(42,1000)&&!mask&&armed.it_value.tv_sec==2&&!subscribes&&handler.sa_handler==original_handler);
 reset();mode=6;assert(!recovery_subscribe(42,1000)&&!subscribes);restored();
 reset();mode=7;assert(!recovery_subscribe(42,1000)&&!subscribes);restored();
 reset();mode=8;if(!setjmp(exit_jump)){recovery_subscribe(42,1000);assert(0);}assert(exited==7); /* an unsafe cleanup cannot return to normal work */
 puts("PASS: actual recovery subscription timer: blocked arm/disarm, one-second maximum, shorter remaining budget, pending alarm drain, old mask/handler restore, real timeout exits, unsafe cleanup fails closed");return 0;
}
'@
$timerSource=$timerSource.Replace('ACTUAL_TIMER',$timer)
[IO.File]::WriteAllText("$root/build-preview/test-sleep-provider-timer.c",$timerSource,[Text.UTF8Encoding]::new($false))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror "-I$root" "$root/build-preview/test-sleep-provider-timer.c" -o "$root/build-preview/test-sleep-provider-timer.exe"
if($LASTEXITCODE -ne 0){throw 'Sleep provider timer compile failed'}
& "$root/build-preview/test-sleep-provider-timer.exe"
if($LASTEXITCODE -ne 0){throw 'Sleep provider timer test failed'}
