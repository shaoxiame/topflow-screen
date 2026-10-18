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
static int failed,rpc_calls,normal_calls,quick_calls,lookup_calls,lookup_cancel,lookup_replace,rpc_failure,send_failure;
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
static int ubus_lookup_id(struct ubus_context*c,const char*n,uint32_t*out){assert(c==bus&&!strcmp(n,"zwrt_mc.device.manager"));lookup_calls++;*out=17;if(lookup_cancel){lookup_cancel=0;event("mode_power_on","");}if(lookup_replace){lookup_replace=0;event("mode_power_on","");event("mode_power_off","normal");}return 0;}
static int ubus_invoke(struct ubus_context*c,uint32_t id,const char*method,struct blob_attr*head,void*callback,void*private_data,int timeout){(void)head;assert(c==bus&&id==17&&(!strcmp(method,"poweroff_quicken_compelte")||!strcmp(method,"poweroff_compelte"))&&!callback&&!private_data&&timeout==1500&&reset_flag==0&&have_module);int quick=!strcmp(method,"poweroff_quicken_compelte");rpc_order[rpc_calls++]=quick?'Q':'N';if(quick)quick_calls++;else normal_calls++;return rpc_failure;}
ACTUAL_EVENTS
typedef struct {int fd,ready,failed,power_event,resync,waiting,start_stage;int pid;uint32_t sequence,ack_sequence,ack_value;uint64_t ping_ms;uint32_t device_power_sequence,device_power_off_seen,device_quicken_pending,device_poweroff_pending;int device_power_state;}tf_factory_bus;
static ssize_t recv(int fd,void*out,size_t cap,int flags){assert(fd==3&&cap==sizeof(tf_bus_packet)&&flags==(MSG_DONTWAIT|MSG_TRUNC));if(qi==qn){errno=EAGAIN;return -1;}memcpy(out,&queue[qi++],sizeof(tf_bus_packet));return sizeof(tf_bus_packet);}
ACTUAL_POLL
static int tf_fb_command(tf_factory_bus*s,uint32_t type,uint32_t value,int timeout){assert((type==TF_BUS_QUICKEN_COMPLETE||type==TF_BUS_POWEROFF_COMPLETE)&&timeout==2500);int result=device_complete(value,type==TF_BUS_QUICKEN_COMPLETE);assert(tf_fb_poll(s));return result;}
ACTUAL_COMPLETE
static void event(const char*action,const char*parameter){struct blob_attr a={.value=action},p={.value=parameter},m={.fields={action?&a:NULL,parameter?&p:NULL}};device_power_broadcast(bus,NULL,"zwrt_device_power_state_event",&m);}
static void reset(void){device_power_sequence=quicken_pending=poweroff_pending=0;poweroff_needed=quicken_needed=poweroff_done=quicken_done=0;failed=rpc_calls=normal_calls=quick_calls=lookup_calls=lookup_cancel=lookup_replace=rpc_failure=send_failure=0;qn=qi=0;memset(rpc_order,0,sizeof rpc_order);}
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
 event("mode_power_on","");event("mode_power_off_quickening","");assert(tf_fb_poll(&c));rpc_failure=1;assert(!tf_fb_power_complete(&c)&&quick_calls==3);assert(device_complete(c.device_quicken_pending,1)&&quick_calls==3);rpc_failure=0;
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
