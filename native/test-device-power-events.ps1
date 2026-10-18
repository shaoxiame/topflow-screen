$ErrorActionPreference='Stop'
$root=$PSScriptRoot
function Extract([string]$text,[string]$start,[string]$end){$a=$text.IndexOf($start);$b=$text.IndexOf($end,$a);if($a -lt 0 -or $b -le $a){throw "Missing boundary: $start"};return $text.Substring($a,$b-$a)}
$helper=[IO.File]::ReadAllText("$root/factory_bus.c")
$client=[IO.File]::ReadAllText("$root/factory_bus_client.h")
$events=Extract $helper 'static const struct blobmsg_policy device_power_policy[]' 'static void parent_event('
$poll=Extract $client 'static int tf_fb_poll(' 'static int tf_fb_command('
$complete=Extract $client 'static int tf_fb_power_complete(' 'static void tf_fb_stop('
$source=@'
#include <assert.h>
#include <stdio.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <errno.h>
#include "factory_bus_logic.h"
#define MSG_DONTWAIT 1
#define MSG_TRUNC 2
#define BLOBMSG_TYPE_STRING 3
struct ubus_context{int unused;};struct ubus_event_handler{int unused;};
struct blob_attr{const char*value;struct blob_attr*fields[2];};
struct blobmsg_policy{const char*name;int type;};
struct blob_buf{struct blob_attr*head;};
static struct ubus_context storage,*bus=&storage;
static uint32_t device_power_sequence,quicken_pending,poweroff_pending;
static int poweroff_needed,quicken_needed,poweroff_done,quicken_done;
static int device_power_current,sleep_unavailable,sleep_recovery_trigger;static uint64_t sleep_recovery_deadline,sleep_recovery_next;
static uint64_t monotonic_ms(void){return 1;}
static int failed,rpc_calls,normal_calls,quick_calls,lookup_calls,lookup_cancel,lookup_replace,lookup_advance,rpc_failure,send_failure;
static char rpc_order[64];
static void event(const char*,const char*);
static int reset_flag,have_module;static tf_bus_packet queue[64];static size_t qn,qi;
static void fail(void){failed=1;}
static int send_packet(uint32_t type,uint32_t sequence,uint32_t value){if(send_failure)return 0;assert(qn<64);queue[qn++]=(tf_bus_packet){TF_BUS_MAGIC,type,sequence,value};return 1;}
static void*blob_data(struct blob_attr*p){return p;}static int blob_len(struct blob_attr*p){(void)p;return 2;}
static const char*blobmsg_get_string(struct blob_attr*p){return p->value;}
static void blobmsg_parse(const struct blobmsg_policy*p,int n,struct blob_attr**out,void*data,int len){assert(n==2&&len==2&&!strcmp(p[0].name,"action")&&!strcmp(p[1].name,"parameter"));struct blob_attr*m=data;out[0]=m->fields[0];out[1]=m->fields[1];}
static void blob_buf_init(struct blob_buf*b,int id){(void)id;b->head=NULL;reset_flag=-1;have_module=0;}
static void blobmsg_add_string(struct blob_buf*b,const char*k,const char*v){(void)b;assert(!strcmp(k,"moduleName")&&!strcmp(v,"zte_topsw_devui"));have_module=1;}
static void blobmsg_add_u32(struct blob_buf*b,const char*k,uint32_t v){(void)b;assert(!strcmp(k,"resetFlag"));reset_flag=(int)v;}
static void blob_buf_free(struct blob_buf*b){(void)b;}
static int ubus_lookup_id(struct ubus_context*c,const char*n,uint32_t*out){assert(c==bus&&!strcmp(n,"zwrt_mc.device.manager"));lookup_calls++;*out=17;if(lookup_cancel){lookup_cancel=0;event("mode_power_on","");}if(lookup_replace){lookup_replace=0;event("mode_power_on","");event("mode_power_off","normal");}if(lookup_advance){lookup_advance=0;event("mode_power_off_quickening","");event("mode_power_off_unreal","");}return 0;}
static int device_manager_lookup(uint32_t*out){return ubus_lookup_id(bus,"zwrt_mc.device.manager",out)==0;}
static int ubus_invoke(struct ubus_context*c,uint32_t id,const char*method,struct blob_attr*head,void*callback,void*private_data,int timeout){(void)head;assert(c==bus&&id==17&&(!strcmp(method,"poweroff_quicken_compelte")||!strcmp(method,"poweroff_compelte"))&&!callback&&!private_data&&timeout==1500&&reset_flag==0&&have_module);int quick=!strcmp(method,"poweroff_quicken_compelte");rpc_order[rpc_calls++]=quick?'Q':'N';if(quick)quick_calls++;else normal_calls++;return rpc_failure;}
ACTUAL_EVENTS
typedef struct {int fd,ready,failed,power_event,resync,waiting,start_stage;int pid;uint32_t sequence,ack_sequence,ack_value;uint64_t ping_ms;uint32_t waiting_type,completion_result,abandoned_completion[4];uint32_t device_power_sequence,device_power_off_seen,device_quicken_pending,device_poweroff_pending;int device_power_state,sleep_unavailable;}tf_factory_bus;
static ssize_t recv(int fd,void*out,size_t cap,int flags){assert(fd==3&&cap==sizeof(tf_bus_packet)&&flags==(MSG_DONTWAIT|MSG_TRUNC));if(qi==qn){errno=EAGAIN;return -1;}memcpy(out,&queue[qi++],sizeof(tf_bus_packet));return sizeof(tf_bus_packet);}
ACTUAL_POLL
static int tf_fb_command(tf_factory_bus*s,uint32_t type,uint32_t value,int timeout){assert((type==TF_BUS_QUICKEN_COMPLETE||type==TF_BUS_POWEROFF_COMPLETE)&&timeout==2500);s->completion_result=device_complete(value,type==TF_BUS_QUICKEN_COMPLETE);assert(tf_fb_poll(s));return 1;}
ACTUAL_COMPLETE
static void event(const char*action,const char*parameter){struct blob_attr a={.value=action},p={.value=parameter},m={.fields={action?&a:NULL,parameter?&p:NULL}};device_power_broadcast(bus,NULL,"zwrt_device_power_state_event",&m);}
static void reset(void){device_power_sequence=quicken_pending=poweroff_pending=0;poweroff_needed=quicken_needed=poweroff_done=quicken_done=0;failed=rpc_calls=normal_calls=quick_calls=lookup_calls=lookup_cancel=lookup_replace=lookup_advance=rpc_failure=send_failure=0;qn=qi=0;memset(rpc_order,0,sizeof rpc_order);}
int main(void){
 tf_factory_bus c={.fd=3};
 event("quicken_power_on","1");event("mode_power_off",NULL);assert(!qn&&!rpc_calls);
 event("mode_power_off","normal");assert(tf_fb_poll(&c)&&c.device_power_state==2&&c.device_poweroff_pending==1&&!c.device_quicken_pending);
 assert(tf_fb_power_complete(&c)&&normal_calls==1&&!c.device_poweroff_pending&&poweroff_done);
 event("mode_power_off","normal");event("mode_power_off_unreal","");assert(tf_fb_poll(&c)&&!c.device_poweroff_pending&&tf_fb_power_complete(&c)&&normal_calls==1);
 event("mode_power_on","");event("zwrt_mode_lcd_reboot","");assert(tf_fb_poll(&c)&&c.device_poweroff_pending&&tf_fb_power_complete(&c)&&normal_calls==2&&!quick_calls);
 reset();c=(tf_factory_bus){.fd=3};
 event("mode_power_off","quicken");event("mode_power_off_quickening","");assert(tf_fb_poll(&c)&&c.device_power_sequence==2&&c.device_power_off_seen==2&&c.device_quicken_pending==2&&c.device_poweroff_pending==2);
 assert(tf_fb_power_complete(&c)&&quick_calls==1&&!normal_calls&&!c.device_quicken_pending&&c.device_poweroff_pending==2);
 assert(tf_fb_power_complete(&c)&&normal_calls==1&&!c.device_poweroff_pending&&!strcmp(rpc_order,"QN"));
 event("mode_power_off_quickening","");event("mode_power_off_unreal","");event("mode_power_off","quicken");assert(tf_fb_poll(&c)&&!c.device_quicken_pending&&!c.device_poweroff_pending&&tf_fb_power_complete(&c)&&rpc_calls==2);
 /* A normal completion already delivered before quickening is not repeated. */
 event("mode_power_on","");event("mode_power_off","quicken");assert(tf_fb_poll(&c)&&tf_fb_power_complete(&c)&&normal_calls==2);
 event("mode_power_off_quickening","");assert(tf_fb_poll(&c)&&!c.device_poweroff_pending&&c.device_quicken_pending&&tf_fb_power_complete(&c)&&quick_calls==2);
 /* Later same-cycle stages preserve unfinished normal work at their new seq. */
 event("mode_power_on","");event("mode_power_off","normal");assert(tf_fb_poll(&c));uint32_t old=c.device_poweroff_pending;
 event("mode_power_off_unreal","");assert(device_complete(old,0)&&normal_calls==2);assert(tf_fb_poll(&c)&&c.device_poweroff_pending>old&&tf_fb_power_complete(&c)&&normal_calls==3);
 /* ON cancels both pending receipts before callback/lookup can send. */
 event("mode_power_on","");event("mode_power_off_quickening","");assert(tf_fb_poll(&c));old=c.device_quicken_pending;
 event("mode_power_on","");assert(device_complete(old,1)&&quick_calls==2);assert(tf_fb_poll(&c)&&!c.device_quicken_pending&&!c.device_poweroff_pending);
 event("mode_power_off_quickening","");assert(tf_fb_poll(&c));lookup_cancel=1;assert(tf_fb_power_complete(&c)&&quick_calls==2&&!c.device_quicken_pending&&!c.device_poweroff_pending);
 /* OFF/ON/OFF during lookup invalidates old work, yet exposes the new cycle. */
 event("mode_power_off","normal");assert(tf_fb_poll(&c));lookup_replace=1;assert(tf_fb_power_complete(&c)&&normal_calls==3&&c.device_poweroff_pending);assert(tf_fb_power_complete(&c)&&normal_calls==4);
 /* A failed attempt never replays in the same cycle. */
 event("mode_power_on","");event("mode_power_off_quickening","");assert(tf_fb_poll(&c));rpc_failure=1;assert(tf_fb_power_complete(&c)&&c.completion_result==TF_COMPLETE_UNKNOWN&&quick_calls==3&&!c.failed);assert(device_complete(c.device_quicken_pending,1)==TF_COMPLETE_STALE&&quick_calls==3);rpc_failure=0;
 event("mode_power_off_quickening","");assert(tf_fb_poll(&c)&&!c.device_quicken_pending&&c.device_poweroff_pending&&tf_fb_power_complete(&c)&&normal_calls==5);
 event("mode_power_on","");event("mode_power_off","normal");event("mode_power_on","");event("mode_power_off","normal");assert(tf_fb_poll(&c)&&c.device_power_state==2&&c.device_poweroff_pending==device_power_sequence);
 /* A batched later OFF stage cannot erase an unacknowledged quickening. */
 reset();c=(tf_factory_bus){.fd=3};
 event("mode_power_off_quickening","");event("mode_power_off_unreal","");
 assert(tf_fb_poll(&c)&&c.device_quicken_pending==2&&c.device_poweroff_pending==2);
 assert(device_complete(1,1)&&!rpc_calls); /* old sequence is stale */
 assert(tf_fb_power_complete(&c)&&quick_calls==1&&!normal_calls);
 assert(tf_fb_power_complete(&c)&&normal_calls==1&&!strcmp(rpc_order,"QN"));
 event("mode_power_off_quickening","");event("mode_power_off_unreal","");
 assert(tf_fb_poll(&c)&&!c.device_quicken_pending&&!c.device_poweroff_pending&&tf_fb_power_complete(&c)&&rpc_calls==2);
 event("mode_power_on","");event("mode_power_off_quickening","");event("mode_power_off_unreal","");
 assert(tf_fb_poll(&c)&&tf_fb_power_complete(&c)&&tf_fb_power_complete(&c)&&!strcmp(rpc_order,"QNQN"));
 /* A newer OFF stage during lookup keeps never-submitted work available.
  * The old token is stale; fresh dark observations may finish Q then N. */
 reset();c=(tf_factory_bus){.fd=3};event("mode_power_off","normal");assert(tf_fb_poll(&c));lookup_advance=1;
 assert(tf_fb_power_complete(&c)&&c.completion_result==TF_COMPLETE_STALE&&!rpc_calls&&!poweroff_done&&!quicken_done&&c.device_quicken_pending&&c.device_poweroff_pending);
 assert(tf_fb_power_complete(&c)&&tf_fb_power_complete(&c)&&!strcmp(rpc_order,"QN")&&normal_calls==1&&quick_calls==1);
 assert(!failed);queue[qn++]=(tf_bus_packet){TF_BUS_MAGIC,TF_BUS_DEVICE_POWER,c.device_power_sequence,TF_DEVICE_ON};assert(!tf_fb_poll(&c)&&c.failed);
 send_failure=1;event("mode_power_on","");assert(failed);
 puts("PASS: actual MC callback/client, normal/reboot and quick receipts once per OFF cycle, Q-before-N, cross-phase work preserved, ON and lookup replacement cancel old work, no replay after failure");return 0;
}

'@
$source=$source.Replace('ACTUAL_EVENTS',$events).Replace('ACTUAL_POLL',$poll).Replace('ACTUAL_COMPLETE',$complete)
New-Item -ItemType Directory -Force "$root/build-preview" | Out-Null
[IO.File]::WriteAllText("$root/build-preview/test-device-power-events.c",$source,[Text.UTF8Encoding]::new($false))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror -Wno-unused-function "-I$root" "$root/build-preview/test-device-power-events.c" -o "$root/build-preview/test-device-power-events.exe"
if($LASTEXITCODE -ne 0){throw 'Device power event test compile failed'}
& "$root/build-preview/test-device-power-events.exe"
if($LASTEXITCODE -ne 0){throw 'Device power event test failed'}
if($helper -notmatch 'ubus_register_event_handler\(bus,&device_power_event,"zwrt_device_power_state_event"\)'){throw 'Missing real MC event registration'}
if($helper -match '"poweroff_(?:quicken_)?(?:subscribe|unsubscribe)"'){throw 'Must not add a shutdown participant'}

# Exercise the actual command framing and both endpoints as well as the MC
# business call. The first harness deliberately isolates event sequencing;
# this one must not substitute tf_fb_command or parent_event.
$sendfail=Extract $helper 'static int send_packet(' 'static void lost('
$devicecomplete=Extract $helper 'static int device_complete(' 'static void parent_event('
$parent=Extract $helper 'static void parent_event(' 'static void watchdog_tick('
$clienttype=Extract $client 'typedef struct {' 'static uint64_t tf_fb_now('
$commands=Extract $client 'static int tf_fb_poll(' 'static int tf_fb_tick('
$transport=@'
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <sys/types.h>
#include "factory_bus_protocol.h"
#define MSG_NOSIGNAL 1
#define MSG_DONTWAIT 2
#define MSG_TRUNC 4
#define POLLIN 1
struct pollfd{int fd;short events,revents;};struct uloop_fd{int fd;};
struct ubus_context{int unused;};struct blob_attr{int unused;};struct blob_buf{struct blob_attr*head;};
static struct ubus_context storage,*bus=&storage;static struct uloop_fd parent_io={3};
static uint32_t last_sequence,device_power_sequence,quicken_pending,poweroff_pending;
static int quicken_done,poweroff_done,failed,stopping,ui_logged_in,completion_busy,sleep_recovery_busy,sleep_unavailable;
static uint64_t last_parent_ms,clock_ms=1000;
static int rpc_failure,rpc_calls,lookup_failure,lookup_on,lookup_reentry,ended,ack_zero,fatal_packets,reset_flag,have_module,defer_commands,eof_client;
static tf_bus_packet tx[32],rx[32];static unsigned tn,ti,rn,ri;
static uint64_t monotonic_ms(void){return clock_ms;}static uint64_t tf_fb_now(void){return clock_ms;}
static void parent_event(struct uloop_fd*,unsigned int);
static ssize_t send(int fd,const void*p,size_t n,int flags){(void)flags;assert(n==sizeof(tf_bus_packet));if(fd==3){assert(rn<32);memcpy(&rx[rn],p,n);if(rx[rn].type==TF_BUS_ACK&&!rx[rn].value)ack_zero++;if(rx[rn].type==TF_BUS_FATAL)fatal_packets++;rn++;}else{assert(fd==4&&tn<32);memcpy(&tx[tn++],p,n);if(!defer_commands)parent_event(&parent_io,0);}return (ssize_t)n;}
static ssize_t recv(int fd,void*p,size_t n,int flags){(void)flags;assert(n==sizeof(tf_bus_packet));if(fd==3&&ti<tn){memcpy(p,&tx[ti++],n);return (ssize_t)n;}if(fd==4&&ri<rn){memcpy(p,&rx[ri++],n);return (ssize_t)n;}if(fd==4&&eof_client)return 0;errno=EAGAIN;return -1;}
static int poll(struct pollfd*p,unsigned n,int ms){(void)p;(void)n;clock_ms+=(unsigned)ms;return 0;}static void uloop_end(void){ended++;}
ACTUAL_SEND_FAIL
static int lcd_event(int value){(void)value;return 0;}static int touch_event(void){return 1;}
static int device_manager_lookup(uint32_t*id){
 if(lookup_reentry){unsigned before=ti;parent_event(&parent_io,0);assert(ti==before&&completion_busy);}
 if(lookup_on){device_power_sequence++;quicken_pending=poweroff_pending=0;quicken_done=poweroff_done=0;send_packet(TF_BUS_DEVICE_POWER,device_power_sequence,TF_DEVICE_ON);}
 *id=17;return !lookup_failure;
}
static void blob_buf_init(struct blob_buf*b,int n){assert(!n);b->head=NULL;reset_flag=-1;have_module=0;}
static void blobmsg_add_string(struct blob_buf*b,const char*k,const char*v){(void)b;assert(!strcmp(k,"moduleName")&&!strcmp(v,"zte_topsw_devui"));have_module=1;}
static void blobmsg_add_u32(struct blob_buf*b,const char*k,uint32_t v){(void)b;assert(!strcmp(k,"resetFlag"));reset_flag=(int)v;}
static void blob_buf_free(struct blob_buf*b){(void)b;}
static int ubus_invoke(struct ubus_context*c,uint32_t id,const char*m,struct blob_attr*h,void*cb,void*data,int ms){(void)h;assert(c==bus&&id==17&&(!strcmp(m,"poweroff_quicken_compelte")||!strcmp(m,"poweroff_compelte"))&&!cb&&!data&&ms==1500&&reset_flag==0&&have_module);rpc_calls++;return rpc_failure;}
ACTUAL_DEVICE_COMPLETE
ACTUAL_PARENT
ACTUAL_CLIENT_TYPE
ACTUAL_COMMANDS
ACTUAL_COMPLETE
static tf_factory_bus c;
static void reset(void){rpc_failure=rpc_calls=lookup_failure=lookup_on=lookup_reentry=ended=ack_zero=fatal_packets=failed=stopping=completion_busy=defer_commands=eof_client=0;tn=ti=rn=ri=0;last_sequence=0;device_power_sequence=quicken_pending=poweroff_pending=1;quicken_done=poweroff_done=0;c=(tf_factory_bus){.fd=4,.ready=1,.device_power_sequence=1,.device_quicken_pending=1,.device_poweroff_pending=1};}
static void result_packet(uint32_t sequence,uint32_t value){assert(rn<32);rx[rn++]=(tf_bus_packet){TF_BUS_MAGIC,TF_BUS_COMPLETE_RESULT,sequence,value};}
int main(void){
 reset();lookup_reentry=1;assert(tf_fb_power_complete(&c)&&c.completion_result==TF_COMPLETE_CONFIRMED&&rpc_calls==1&&!c.failed&&!failed&&!fatal_packets&&!completion_busy);
 assert(tf_fb_power_complete(&c)&&rpc_calls==2&&c.completion_result==TF_COMPLETE_CONFIRMED);assert(tf_fb_power_complete(&c)&&rpc_calls==2);
 reset();rpc_failure=7;assert(tf_fb_power_complete(&c)&&rpc_calls==1&&c.completion_result==TF_COMPLETE_UNKNOWN&&!c.failed&&!failed&&!fatal_packets&&!ack_zero);assert(tf_fb_command(&c,TF_BUS_PING,0,2500));assert(device_complete(1,1)==TF_COMPLETE_STALE&&rpc_calls==1);
 reset();lookup_failure=1;assert(tf_fb_power_complete(&c)&&!rpc_calls&&quicken_done&&!quicken_pending&&c.completion_result==TF_COMPLETE_UNKNOWN&&!c.failed&&!failed);assert(device_complete(1,1)==TF_COMPLETE_STALE&&!rpc_calls);
 reset();lookup_on=1;assert(tf_fb_power_complete(&c)&&!rpc_calls&&c.completion_result==TF_COMPLETE_STALE&&c.device_power_state==1&&!c.device_quicken_pending&&!c.device_poweroff_pending&&!quicken_done&&!poweroff_done);
 /* Two timed-out completions retain separate precise tombstones. */
 reset();defer_commands=1;assert(tf_fb_power_complete(&c)&&c.completion_result==TF_COMPLETE_UNKNOWN&&c.abandoned_completion[0]==1&&!c.failed);assert(tf_fb_power_complete(&c)&&c.abandoned_completion[1]==2&&!c.failed&&tn==2&&!rpc_calls);
 defer_commands=0;parent_event(&parent_io,0);assert(rpc_calls==2&&tf_fb_poll(&c)&&!c.failed&&!c.abandoned_completion[0]&&!c.abandoned_completion[1]&&c.completion_result==TF_COMPLETE_UNKNOWN);assert(tf_fb_command(&c,TF_BUS_PING,0,2500));
 result_packet(1,TF_COMPLETE_CONFIRMED);assert(!tf_fb_poll(&c)&&c.failed); /* late duplicate not whitelisted */
 reset();defer_commands=1;assert(tf_fb_power_complete(&c));result_packet(99,TF_COMPLETE_UNKNOWN);assert(!tf_fb_poll(&c)&&c.failed);
 reset();for(int i=0;i<4;i++)c.abandoned_completion[i]=10+i;assert(tf_fb_power_complete(&c)&&!tn&&!c.device_quicken_pending&&c.completion_result==TF_COMPLETE_UNKNOWN&&!c.failed);assert(tf_fb_command(&c,TF_BUS_PING,0,2500));
 reset();defer_commands=1;assert(tf_fb_power_complete(&c));rx[rn++]=(tf_bus_packet){TF_BUS_MAGIC,TF_BUS_ACK,1,1};assert(!tf_fb_poll(&c)&&c.failed); /* wrong late packet type */
 reset();assert(!tf_fb_command(&c,TF_BUS_LCD,0,2500)&&failed&&fatal_packets==1&&ack_zero==1&&c.failed);
 reset();eof_client=1;defer_commands=1;assert(!tf_fb_power_complete(&c)&&c.failed); /* real peer loss */
 reset();result_packet(1,3);assert(!tf_fb_poll(&c)&&c.failed); /* malformed result */
 reset();rx[rn++]=(tf_bus_packet){TF_BUS_MAGIC,TF_BUS_FATAL,0,0};assert(!tf_fb_power_complete(&c)&&c.failed);
 puts("PASS: actual helper/client completion UNKNOWN and stale are nonfatal without replay; exact Q/N late tombstones, full capacity suppression, reentry guard; real EOF/FATAL/malformed/unsolicited and LCD ACK0 remain fatal");return 0;
}
'@
$transport=$transport.Replace('ACTUAL_SEND_FAIL',$sendfail).Replace('ACTUAL_DEVICE_COMPLETE',$devicecomplete).Replace('ACTUAL_PARENT',$parent).Replace('ACTUAL_CLIENT_TYPE',$clienttype).Replace('ACTUAL_COMMANDS',$commands).Replace('ACTUAL_COMPLETE',$complete)
[IO.File]::WriteAllText("$root/build-preview/test-power-completion-transport.c",$transport,[Text.UTF8Encoding]::new($false))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror -Wno-unused-function "-I$root" "$root/build-preview/test-power-completion-transport.c" -o "$root/build-preview/test-power-completion-transport.exe"
if($LASTEXITCODE -ne 0){throw 'Power completion transport compile failed'}
& "$root/build-preview/test-power-completion-transport.exe"
if($LASTEXITCODE -ne 0){throw 'Power completion transport tests failed'}

# Execute the real lookup fork/deadline/pump and callback guards with only OS
# and ubus boundaries simulated; no device, live ubus or power writes.
$lookup=Extract $helper 'static int bus_object_lookup(' '/* Firmware ubus_subscribe'
$serve=Extract $helper 'static const struct blobmsg_policy enable_policy=' '/* Keep original method names/signatures:'
$reregister=Extract $helper 'static void reregistered(' 'static void power_broadcast('
$watchdog=Extract $helper 'static void watchdog_tick(' 'int main('
$lookupSource=@'
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <setjmp.h>
#include <sys/types.h>
#include "factory_bus_protocol.h"
#define O_CLOEXEC 1
#define O_NONBLOCK 2
#define O_RDWR 4
#define PR_SET_PDEATHSIG 1
#define SIGKILL 9
#define WNOHANG 1
#define WIFEXITED(s) ((s)>=0)
#define WEXITSTATUS(s) (s)
#define POLLIN 1
#define POLLHUP 2
#define POLLERR 4
#define BLOBMSG_TYPE_STRING 3
#define UBUS_STATUS_OK 0
#define UBUS_STATUS_UNKNOWN_ERROR 9
#define UBUS_STATUS_INVALID_ARGUMENT 2
#define UBUS_STATUS_METHOD_NOT_FOUND 3
struct pollfd{int fd;short events,revents;};
typedef struct {int unused;} DIR;struct dirent{char d_name[32];};
struct ubus_context{struct {int fd;}sock;};struct ubus_object{int unused;};struct ubus_request_data{int unused;};struct ubus_event_handler{int unused;};struct uloop_timeout{int unused;};
struct blob_attr{int unused;};struct blob_buf{struct blob_attr*head;};struct blobmsg_policy{const char*name;int type;};
static struct ubus_context storage={{8}},fresh={{21}},*bus=&storage;
static int failed,completion_busy,reregister_pending,ui_logged_in,sleep_recovery_busy,sleep_unavailable,sleep_recovery_trigger,device_power_current;
static uint64_t sleep_recovery_deadline;
static void recover_sleep(void){}
static uint64_t last_parent_ms,clock_ms;
static int mode,child_branch,parent_mismatch,closed[600],directory_index,kill_calls,reap_calls,read_calls,pump_calls,bus_queued,exit_value,connect_calls,lookup_calls,subscribe_calls,resync_calls,direct_calls,reply_calls,timer_calls;
static uint32_t observed_sequence;
static jmp_buf child_exit;
static uint64_t monotonic_ms(void){return clock_ms;}
static int pipe2(int p[2],int flags){assert(flags==(O_CLOEXEC|O_NONBLOCK));p[0]=10;p[1]=11;return 0;}
static int getpid(void){return 42;}static int getppid(void){return parent_mismatch?43:42;}
static int fork(void){return child_branch?0:101;}
static int prctl(int option,int value){assert(option==PR_SET_PDEATHSIG&&value==SIGKILL);return 0;}
static void mock_exit(int value){exit_value=value;longjmp(child_exit,1);}
#define _exit mock_exit
static int close(int fd){assert(fd>=0&&fd<600);closed[fd]++;return 0;}
static int open(const char*path,int flags){assert(!strcmp(path,"/dev/null")&&flags==(O_RDWR|O_CLOEXEC));return 20;}
static int dup2(int from,int to){assert(from==20&&to>=0&&to<3);return to;}
static DIR*opendir(const char*path){static DIR d;assert(!strcmp(path,"/proc/self/fd"));return &d;}
static int dirfd(DIR*d){(void)d;return 30;}
static struct dirent*readdir(DIR*d){(void)d;static struct dirent e;static const char*names[]={".","..","0","1","2","3","8","10","11","20","30","511"};if(directory_index==12)return NULL;snprintf(e.d_name,sizeof e.d_name,"%s",names[directory_index++]);return &e;}
static int closedir(DIR*d){(void)d;closed[30]++;return 0;}
static struct ubus_context*ubus_connect(void*p){assert(!p&&closed[3]&&closed[8]&&closed[511]&&!closed[11]&&closed[30]);connect_calls++;return &fresh;}
static int ubus_lookup_id(struct ubus_context*c,const char*name,uint32_t*out){assert(c==&fresh&&!strcmp(name,"zwrt_mc.device.manager"));lookup_calls++;*out=17;return 0;}
static ssize_t write(int fd,const void*data,size_t n){assert(fd==11&&n==4&&*(const uint32_t*)data==17);return 4;}
static ssize_t read(int fd,void*data,size_t n){assert(fd==10);read_calls++;if(mode==1||mode==4){errno=EAGAIN;return -1;}if(read_calls>1)return 0;uint32_t value=mode==2?0:17;size_t count=mode==3?2:4;assert(n>=count);memcpy(data,&value,count);return (ssize_t)count;}
static int waitpid(int pid,int*status,int flags){assert(pid==101);if(!flags){assert(kill_calls);reap_calls++;*status=0;return pid;}assert(flags==WNOHANG);if(mode==1||mode==4)return 0;*status=mode==5?1:0;reap_calls++;return pid;}
static int kill(int pid,int signal){assert(pid==101&&signal==SIGKILL);kill_calls++;return 0;}
static int poll(struct pollfd*p,unsigned n,int ms){clock_ms+=(unsigned)ms;if(mode==6&&!ms){errno=EINTR;return -1;}for(unsigned i=0;i<n;i++)if(p[i].fd==8&&bus_queued){p[i].revents=POLLIN;return 1;}return 0;}
static void ubus_handle_event(struct ubus_context*c){assert(c==bus&&completion_busy);bus_queued=0;pump_calls++;observed_sequence++;if(mode==4)failed=1;}
ACTUAL_LOOKUP
static void blob_buf_init(struct blob_buf*b,int value){assert(!value);b->head=NULL;}
static void blob_buf_free(struct blob_buf*b){(void)b;}
static void blobmsg_add_string(struct blob_buf*b,const char*k,const char*v){(void)b;assert(k&&v);}
static const char*tf_bus_login_value(int n){return n?"1":"0";}
static int direct_get(char value[2]){direct_calls++;value[0]='0';value[1]=0;return 1;}
static int direct_set(int v){(void)v;direct_calls++;return 1;}
static void*blob_data(struct blob_attr*p){return p;}static int blob_len(struct blob_attr*p){(void)p;return 1;}
static void blobmsg_parse(const struct blobmsg_policy*p,int n,struct blob_attr**out,void*data,int len){(void)p;(void)n;(void)len;*out=data;}
static const char*blobmsg_get_string(struct blob_attr*p){(void)p;return "1";}
static int tf_bus_direct_request(const char*v){(void)v;return 1;}
static int ubus_send_reply(struct ubus_context*c,struct ubus_request_data*r,struct blob_attr*b){(void)r;(void)b;assert(c==bus);reply_calls++;return 0;}
ACTUAL_SERVE
static int subscribe_sleep(void){subscribe_calls++;return 1;}
static int send_packet(uint32_t type,uint32_t seq,uint32_t value){assert(type==TF_BUS_RESYNC&&!seq&&!value);resync_calls++;return 1;}
static void fail(void){failed=1;}
ACTUAL_REREGISTER
static void uloop_timeout_set(struct uloop_timeout*t,int ms){(void)t;assert(ms==1000);timer_calls++;}
ACTUAL_WATCHDOG
static void reset(void){failed=mode=child_branch=parent_mismatch=directory_index=kill_calls=reap_calls=read_calls=pump_calls=bus_queued=exit_value=connect_calls=lookup_calls=subscribe_calls=resync_calls=direct_calls=reply_calls=timer_calls=reregister_pending=0;clock_ms=last_parent_ms=0;completion_busy=1;observed_sequence=1;memset(closed,0,sizeof closed);}
int main(void){uint32_t id;
 reset();assert(device_manager_lookup(&id)&&id==17&&reap_calls==1&&!kill_calls&&closed[10]&&closed[11]);
 reset();mode=1;assert(!device_manager_lookup(&id)&&!id&&clock_ms==500&&kill_calls==1&&reap_calls==1&&closed[10]);
 reset();mode=2;assert(!device_manager_lookup(&id)&&!id&&!kill_calls); /* zero ID */
 reset();mode=3;assert(!device_manager_lookup(&id)&&!id&&!kill_calls); /* incomplete pipe */
 reset();mode=5;assert(!device_manager_lookup(&id)&&!id&&!kill_calls); /* child exit failure */
 reset();bus_queued=1;assert(device_manager_lookup(&id)&&pump_calls==1&&observed_sequence==2&&!clock_ms); /* child done and ON both queued */
 reset();mode=6;bus_queued=1;assert(!device_manager_lookup(&id)&&!id&&!pump_calls&&!kill_calls); /* interrupted final poll cannot authorize stale RPC */
 reset();mode=4;bus_queued=1;assert(!device_manager_lookup(&id)&&failed&&pump_calls==1&&kill_calls==1&&reap_calls==1&&clock_ms==10); /* actual bus failure still aborts */
 reset();child_branch=1;if(!setjmp(child_exit)){device_manager_lookup(&id);assert(0);}assert(exit_value==0&&connect_calls==1&&lookup_calls==1&&closed[3]&&closed[8]&&closed[511]&&!closed[11]);
 reset();child_branch=1;parent_mismatch=1;if(!setjmp(child_exit)){device_manager_lookup(&id);assert(0);}assert(exit_value==127&&!connect_calls&&!lookup_calls);
 reset();assert(serve(bus,NULL,NULL,"zwrt_deviceui_direct_power_mode_get",NULL)==UBUS_STATUS_UNKNOWN_ERROR);assert(serve(bus,NULL,NULL,"zwrt_deviceui_direct_power_mode_set",NULL)==UBUS_STATUS_UNKNOWN_ERROR);assert(!direct_calls&&!reply_calls);
 assert(serve(bus,NULL,NULL,"zwrt_deviceui_touch_status_get",NULL)==UBUS_STATUS_OK&&reply_calls==1);reregistered(bus,NULL,NULL,NULL);assert(reregister_pending&&!subscribe_calls&&!resync_calls);watchdog_tick(NULL);assert(reregister_pending&&!subscribe_calls&&!resync_calls&&timer_calls==1);
 completion_busy=0;watchdog_tick(NULL);assert(!reregister_pending&&subscribe_calls==1&&resync_calls==1&&timer_calls==2);watchdog_tick(NULL);assert(subscribe_calls==1&&resync_calls==1);assert(serve(bus,NULL,NULL,"zwrt_deviceui_direct_power_mode_get",NULL)==UBUS_STATUS_OK&&direct_calls==1);
 puts("PASS: actual lookup 500ms kill/reap, fast-child queued ON pump, independent child connection with inherited low/high FDs closed, parent-death guard; busy direct calls bounded, touch getter live and deferred re-registration preserved");return 0;
}
'@
$lookupSource=$lookupSource.Replace('ACTUAL_LOOKUP',$lookup).Replace('ACTUAL_SERVE',$serve).Replace('ACTUAL_REREGISTER',$reregister).Replace('ACTUAL_WATCHDOG',$watchdog)
[IO.File]::WriteAllText("$root/build-preview/test-power-completion-lookup.c",$lookupSource,[Text.UTF8Encoding]::new($false))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror -Wno-unused-function "-I$root" "$root/build-preview/test-power-completion-lookup.c" -o "$root/build-preview/test-power-completion-lookup.exe"
if($LASTEXITCODE -ne 0){throw 'Power completion lookup compile failed'}
& "$root/build-preview/test-power-completion-lookup.exe"
if($LASTEXITCODE -ne 0){throw 'Power completion lookup tests failed'}
