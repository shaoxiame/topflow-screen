/* TopFlow factory display service adapter. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Uses the already installed OpenWrt libraries; never initializes ZTE's SDK.
 * The parent owns display brightness, PIN policy, timeout and restoration.
 * No HTTP listener, credential access, persistent config, logs or SDK threads.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#include <libubus.h>
#include "factory_bus_protocol.h"
#include "factory_bus_logic.h"
#include "factory_extra_rpc.h"

static struct ubus_context *bus;
static struct uloop_fd parent_io;
static struct uloop_timeout watchdog;
static struct ubus_subscriber sleep_sub;
static struct ubus_event_handler rereg_event,power_event,device_power_event;
static uint32_t sleep_id;
static int ui_logged_in,failed,stopping,completion_busy,reregister_pending;
static uint64_t last_parent_ms;
static uint32_t last_sequence;
static uint32_t device_power_sequence,quicken_pending,poweroff_pending;
static int poweroff_needed,quicken_needed,poweroff_done,quicken_done;
/* A missing sleep object is recoverable only after an explicit MC OFF. The
 * bus/UI provider remain alive; availability independently gates the renderer. */
static int device_power_current,sleep_unavailable,sleep_recovery_busy,sleep_recovery_trigger;
static uint64_t sleep_recovery_deadline,sleep_recovery_next;
static uint32_t sleep_subscribe_id;
static int sleep_subscribe_lost;
static void recover_sleep(void);
static uint64_t monotonic_ms(void){struct timespec t;if(clock_gettime(CLOCK_MONOTONIC,&t))return 0;return (uint64_t)t.tv_sec*1000+t.tv_nsec/1000000;}
static int send_packet(uint32_t type,uint32_t sequence,uint32_t value){
 tf_bus_packet p={TF_BUS_MAGIC,type,sequence,value};
 return send(parent_io.fd,&p,sizeof p,MSG_NOSIGNAL|MSG_DONTWAIT)==sizeof p;
}
static void fail(void){if(!failed){failed=1;send_packet(TF_BUS_FATAL,0,0);}uloop_end();}
static void lost(struct ubus_context*ctx){(void)ctx;fail();}

/* Fixed commands only, bounded child lifetime/output, no shell interpolation. */
static int fixed_exec(char*const argv[],char*out,size_t cap){
 int p[2];if(!out||cap<2||pipe2(p,O_CLOEXEC))return 0;out[0]=0;
 pid_t owner=getpid(),child=fork();
 if(child==0){
  if(prctl(PR_SET_PDEATHSIG,SIGKILL)<0||getppid()!=owner)_exit(127);
  if(dup2(p[1],1)<0)_exit(127);
  int n=open("/dev/null",O_RDWR);if(n<0||dup2(n,0)<0||dup2(n,2)<0)_exit(127);
  for(int fd=3;fd<256;fd++)close(fd);
  execv(argv[0],argv);_exit(127);
 }
 close(p[1]);if(child<0){close(p[0]);return 0;}
 fcntl(p[0],F_SETFL,O_NONBLOCK);uint64_t until=monotonic_ms()+1800;
 size_t used=0;int status=0,done=0,bad=0;
 while(monotonic_ms()<until){
  ssize_t n=read(p[0],out+used,cap-used-1);
  if(n>0){used+=(size_t)n;if(used>=cap-1){bad=1;break;}}
  else if(n<0&&errno!=EAGAIN&&errno!=EINTR){bad=1;break;}
  pid_t got=waitpid(child,&status,WNOHANG);
  if(got==child){done=1;while(used<cap-1&&(n=read(p[0],out+used,cap-used-1))>0)used+=(size_t)n;if(used>=cap-1)bad=1;break;}
  if(got<0&&errno!=EINTR){bad=1;break;}
  struct pollfd f={p[0],POLLIN,0};poll(&f,1,10);
 }
 if(!done){kill(child,SIGKILL);while(waitpid(child,&status,0)<0&&errno==EINTR){}bad=1;}
 close(p[0]);out[used]=0;return !bad&&done&&WIFEXITED(status)&&WEXITSTATUS(status)==0;
}
static int direct_get(char out[2]){
 char text[32];char*const argv[]={"/sbin/uci","-q","get","zwrt_deviceui.Device.direct_power_mode_switch",NULL};
 if(!fixed_exec(argv,text,sizeof text))return 0;
 int value=tf_bus_direct_value(text,strlen(text));
 if(value<0)return 0;out[0]=(char)('0'+value);out[1]=0;return 1;
}
static int direct_set(int enabled){
 char out[512];char*const args[]={"/bin/ubus","-t","1","call","zwrt_bsp.charger","set",
  enabled?"{\"source_module\":\"zte_topsw_devui\",\"direct_power_supply_mode\":\"enable\"}":
          "{\"source_module\":\"zte_topsw_devui\",\"direct_power_supply_mode\":\"disable\"}",NULL};
 return fixed_exec(args,out,sizeof out);
}
static const struct blobmsg_policy enable_policy={.name="enable",.type=BLOBMSG_TYPE_STRING};
static int serve(struct ubus_context*ctx,struct ubus_object*obj,struct ubus_request_data*req,const char*method,struct blob_attr*msg){
 (void)obj;struct blob_buf result={0};int rc=UBUS_STATUS_OK;
 if((completion_busy||sleep_recovery_busy)&&(!strcmp(method,"zwrt_deviceui_direct_power_mode_get")||!strcmp(method,"zwrt_deviceui_direct_power_mode_set")))return UBUS_STATUS_UNKNOWN_ERROR;
 blob_buf_init(&result,0);
 if(!strcmp(method,"zwrt_deviceui_touch_status_get"))blobmsg_add_string(&result,"lcd_login",tf_bus_login_value(ui_logged_in));
 else if(!strcmp(method,"zwrt_deviceui_direct_power_mode_get")){
  char value[2];if(!direct_get(value))rc=UBUS_STATUS_UNKNOWN_ERROR;else blobmsg_add_string(&result,"enable",value);
 }else if(!strcmp(method,"zwrt_deviceui_direct_power_mode_set")){
  struct blob_attr*value=NULL;
  if(msg)blobmsg_parse(&enable_policy,1,&value,blob_data(msg),blob_len(msg));
  if(!value)rc=UBUS_STATUS_INVALID_ARGUMENT;
  else {int enabled=tf_bus_direct_request(blobmsg_get_string(value));if(enabled<0)rc=UBUS_STATUS_INVALID_ARGUMENT;else if(!direct_set(enabled))rc=UBUS_STATUS_UNKNOWN_ERROR;}
 }else rc=UBUS_STATUS_METHOD_NOT_FOUND;
 if(rc==UBUS_STATUS_OK&&ubus_send_reply(ctx,req,result.head))rc=UBUS_STATUS_UNKNOWN_ERROR;
 blob_buf_free(&result);return rc;
}
/* Keep original method names/signatures: original exports no declared params. */
static const struct ubus_method methods[]={
 UBUS_METHOD_NOARG("zwrt_deviceui_touch_status_get",serve),
 UBUS_METHOD_NOARG("zwrt_deviceui_direct_power_mode_get",serve),
 UBUS_METHOD_NOARG("zwrt_deviceui_direct_power_mode_set",serve)
};
static struct ubus_object_type object_type=UBUS_OBJECT_TYPE("zwrt_deviceui",methods);
static struct ubus_object object={.name="zwrt_deviceui",.type=&object_type,.methods=methods,.n_methods=3};
static int lcd_event(int on){
 struct blob_buf b={0};blob_buf_init(&b,0);
 blobmsg_add_string(&b,"moduleName","zte_topsw_devui");blobmsg_add_string(&b,"lcd_status",on?"on":"off");
 int rc=ubus_send_event(bus,"zwrt_deviceui_event.lcdstatus",b.head);blob_buf_free(&b);return rc==0;
}
static int touch_event(void){
 struct blob_buf b={0};blob_buf_init(&b,0);
 blobmsg_add_u32(&b,"touch_status",1);
 int rc=ubus_send_event(bus,"zwrt_deviceui_event.touchstatus",b.head);blob_buf_free(&b);return rc==0;
}
static const struct blobmsg_policy action_policy={.name="action",.type=BLOBMSG_TYPE_STRING};
static void power_action(struct blob_attr*msg,int broadcast){
 struct blob_attr*value=NULL;if(!msg)return;
 blobmsg_parse(&action_policy,1,&value,blob_data(msg),blob_len(msg));if(!value)return;
 uint32_t type=broadcast?tf_bus_power_broadcast_action(blobmsg_get_string(value)):tf_bus_power_action(blobmsg_get_string(value));
 if(type&&!send_packet(type,0,0))fail();
}
static int notified(struct ubus_context*ctx,struct ubus_object*obj,struct ubus_request_data*req,const char*method,struct blob_attr*msg){
 (void)ctx;(void)obj;(void)req;
 if(!strcmp(method,"zwrt_zte_sleep_faw.power_status"))power_action(msg,0);
 return 0;
}
static void removed(struct ubus_context*ctx,struct ubus_subscriber*sub,uint32_t id){
 (void)ctx;(void)sub;
 if(sleep_recovery_busy&&id&&id==sleep_subscribe_id){sleep_subscribe_lost=1;return;}
 /* A delayed remove for an older subscription must not invalidate its successor. */
 if(!sleep_id||id!=sleep_id)return;
 if(device_power_current!=TF_DEVICE_OFF){fail();return;}
 sleep_id=0;sleep_recovery_deadline=sleep_recovery_next=0;sleep_recovery_trigger=0;
 if(!sleep_unavailable){sleep_unavailable=1;if(!send_packet(TF_BUS_SLEEP_PROVIDER,0,0))fail();}
}
static int subscribe_sleep(void){
 uint32_t id=0;if(ubus_lookup_id(bus,"zwrt_zte_sleep_faw.power_status",&id))return 0;
 if(sleep_id==id)return 1;
 if(sleep_id)ubus_unsubscribe(bus,&sleep_sub,sleep_id);
 if(ubus_subscribe(bus,&sleep_sub,id))return 0;sleep_id=id;return 1;
}
static void reregistered(struct ubus_context*ctx,struct ubus_event_handler*ev,const char*type,struct blob_attr*msg){
 (void)ctx;(void)ev;(void)type;(void)msg;
 if(completion_busy||sleep_recovery_busy){reregister_pending=1;return;}reregister_pending=0;
 if(sleep_unavailable){sleep_recovery_trigger=1;recover_sleep();return;}
 if(!subscribe_sleep()||!send_packet(TF_BUS_RESYNC,0,0))fail();
}
static void power_broadcast(struct ubus_context*ctx,struct ubus_event_handler*ev,const char*type,struct blob_attr*msg){(void)ctx;(void)ev;(void)type;power_action(msg,1);}
/* libubus lookup has no timeout argument. Isolate this read-only lookup on a
 * fresh connection, with a 500 ms parent deadline. The child never calls the
 * completion method and cannot retain either inherited provider/socket. */
static int bus_object_lookup(const char*name,uint32_t*out){
 int p[2];if(!out||!name||(strcmp(name,"zwrt_mc.device.manager")&&strcmp(name,"zwrt_zte_sleep_faw.power_status"))||pipe2(p,O_CLOEXEC|O_NONBLOCK))return 0;*out=0;
 pid_t owner=getpid(),child=fork();
 if(child==0){
  if(prctl(PR_SET_PDEATHSIG,SIGKILL)<0||getppid()!=owner)_exit(127);
  close(p[0]);int nullfd=open("/dev/null",O_RDWR|O_CLOEXEC);if(nullfd<0)_exit(127);
  for(int fd=0;fd<3;fd++)if(dup2(nullfd,fd)<0)_exit(127);
  DIR*d=opendir("/proc/self/fd");if(!d)_exit(127);int directory=dirfd(d);struct dirent*entry;
  while((entry=readdir(d))){char*end;long fd=strtol(entry->d_name,&end,10);if(!*entry->d_name||*end||fd<3||fd>INT32_MAX||fd==p[1]||fd==directory)continue;close((int)fd);}closedir(d);
  if(getppid()!=owner)_exit(127);
  struct ubus_context*lookup=ubus_connect(NULL);if(!lookup)_exit(127);
  uint32_t id=0;int rc=ubus_lookup_id(lookup,name,&id);
  if(!rc&&id&&write(p[1],&id,sizeof id)==sizeof id)_exit(0);_exit(1);
 }
 close(p[1]);if(child<0){close(p[0]);return 0;}
 uint64_t until=monotonic_ms()+500;uint32_t id=0;size_t used=0;int status=0,done=0,bad=0;
 while(!failed&&monotonic_ms()<until){
  ssize_t n=read(p[0],(char*)&id+used,sizeof id-used);if(n>0)used+=(size_t)n;else if(n<0&&errno!=EAGAIN&&errno!=EINTR){bad=1;break;}
  pid_t got=waitpid(child,&status,WNOHANG);if(got==child){done=1;if(used<sizeof id){n=read(p[0],(char*)&id+used,sizeof id-used);if(n>0)used+=(size_t)n;}break;}if(got<0&&errno!=EINTR){bad=1;break;}
  struct pollfd f[2]={{p[0],POLLIN,0},{bus->sock.fd,POLLIN,0}};int polled=poll(f,2,10);
  if(polled<0&&errno!=EINTR){bad=1;break;}
  /* Pump only the existing bus fd, never the whole uloop: queued parent
   * commands/watchdog cannot reenter this synchronous completion attempt. */
  if(polled>0&&(f[1].revents&(POLLIN|POLLHUP|POLLERR)))ubus_handle_event(bus);
 }
 if(!done){kill(child,SIGKILL);while(waitpid(child,&status,0)<0&&errno==EINTR){}bad=1;}
 close(p[0]);
 /* A fast child can finish before the loop polls the parent bus. Consume an
  * already queued ON before device_complete rechecks the original OFF token. */
 if(!bad&&!failed){struct pollfd ready={bus->sock.fd,POLLIN,0};int polled=poll(&ready,1,0);if(polled<0)bad=1;else if(polled>0&&(ready.revents&(POLLIN|POLLHUP|POLLERR)))ubus_handle_event(bus);}
 if(!bad&&!failed&&done&&WIFEXITED(status)&&WEXITSTATUS(status)==0&&used==sizeof id&&id){*out=id;return 1;}return 0;
}
static int device_manager_lookup(uint32_t*out){return bus_object_lookup("zwrt_mc.device.manager",out);}
/* Firmware ubus_subscribe waits without a library deadline. During recovery
 * only, bound that call in this helper; an expired timer is a genuine helper
 * failure and the existing parent EOF recovery applies. No other process or
 * system timer/configuration is touched. */
static void sleep_subscribe_expired(int sig){(void)sig;_exit(7);}
static int recovery_subscribe(uint32_t id,unsigned timeout_ms){
 if(!timeout_ms||timeout_ms>1000)return 0;
 sigset_t set,oldmask,pending;struct sigaction action={0},oldaction;
 struct itimerval timer={0},oldtimer;struct timespec zero={0,0};
 sigemptyset(&set);sigaddset(&set,SIGALRM);
 if(sigprocmask(SIG_BLOCK,&set,&oldmask))return 0;
 if(sigismember(&oldmask,SIGALRM)||getitimer(ITIMER_REAL,&oldtimer)||oldtimer.it_value.tv_sec||oldtimer.it_value.tv_usec){sigprocmask(SIG_SETMASK,&oldmask,NULL);return 0;}
 action.sa_handler=sleep_subscribe_expired;sigemptyset(&action.sa_mask);
 if(sigaction(SIGALRM,&action,&oldaction)){sigprocmask(SIG_SETMASK,&oldmask,NULL);return 0;}
 timer.it_value.tv_sec=timeout_ms/1000;timer.it_value.tv_usec=(timeout_ms%1000)*1000;
 if(setitimer(ITIMER_REAL,&timer,NULL)){sigaction(SIGALRM,&oldaction,NULL);sigprocmask(SIG_SETMASK,&oldmask,NULL);return 0;}
 uint64_t begin=monotonic_ms();
 if(sigprocmask(SIG_SETMASK,&oldmask,NULL))_exit(7);
 int rc=ubus_subscribe(bus,&sleep_sub,id);
 if(sigprocmask(SIG_BLOCK,&set,NULL))_exit(7);
 memset(&timer,0,sizeof timer);if(setitimer(ITIMER_REAL,&timer,NULL))_exit(7);
 if(sigpending(&pending))_exit(7);int expired=sigismember(&pending,SIGALRM);
 if(expired&&sigtimedwait(&set,NULL,&zero)!=SIGALRM)_exit(7);
 if(sigaction(SIGALRM,&oldaction,NULL)||sigprocmask(SIG_SETMASK,&oldmask,NULL))_exit(7);
 return !expired&&monotonic_ms()-begin<timeout_ms&&!failed&&rc==0;
}
static void recover_sleep(void){
 if(!sleep_unavailable||failed||completion_busy||sleep_recovery_busy)return;
 uint64_t now=monotonic_ms();
 if(device_power_current==TF_DEVICE_ON){
  if(!sleep_recovery_deadline||now>=sleep_recovery_deadline){fail();return;}
  if(now<sleep_recovery_next&&!sleep_recovery_trigger)return;
 }else if(!sleep_recovery_trigger)return; /* OFF has no retry loop. */
 sleep_recovery_trigger=0;sleep_recovery_busy=1;
 if(!sleep_id){uint32_t id=0;if(bus_object_lookup("zwrt_zte_sleep_faw.power_status",&id)&&!failed){
  sleep_subscribe_id=id;sleep_subscribe_lost=0;
  now=monotonic_ms();unsigned limit=1000;
  if(device_power_current==TF_DEVICE_ON&&sleep_recovery_deadline<=now)limit=0;
  else if(device_power_current==TF_DEVICE_ON&&sleep_recovery_deadline-now<limit)limit=(unsigned)(sleep_recovery_deadline-now);
  if(recovery_subscribe(id,limit)&&!sleep_subscribe_lost)sleep_id=id;
  sleep_subscribe_id=0;
 }}
 sleep_recovery_busy=0;if(failed)return;now=monotonic_ms();
 /* Availability is not ON: a restored OFF subscription still needs dark LCD
  * resync/completion. The parent's separate MC latch continues to forbid wake. */
 if(device_power_current==TF_DEVICE_ON&&(!sleep_recovery_deadline||now>=sleep_recovery_deadline)){fail();return;}
 if(!sleep_id){if(device_power_current==TF_DEVICE_ON)sleep_recovery_next=now+1000;return;}
 /* A re-registration received inside this successful attempt is satisfied by
  * the confirmed subscription and the RESYNC below, not another lookup. */
 sleep_unavailable=0;reregister_pending=0;sleep_recovery_deadline=sleep_recovery_next=0;
 if(!send_packet(TF_BUS_SLEEP_PROVIDER,0,1)||!send_packet(TF_BUS_RESYNC,0,0))fail();
}
static const struct blobmsg_policy device_power_policy[]={
 {.name="action",.type=BLOBMSG_TYPE_STRING},{.name="parameter",.type=BLOBMSG_TYPE_STRING}
};
static void device_power_broadcast(struct ubus_context*ctx,struct ubus_event_handler*ev,const char*type,struct blob_attr*msg){
 (void)ctx;(void)ev;(void)type;struct blob_attr*fields[2]={NULL,NULL};if(!msg)return;
 blobmsg_parse(device_power_policy,2,fields,blob_data(msg),blob_len(msg));if(!fields[0]||!fields[1])return;
 uint32_t state=tf_bus_device_power_action(blobmsg_get_string(fields[0]),blobmsg_get_string(fields[1]));if(!state)return;
 device_power_current=state==TF_DEVICE_ON?TF_DEVICE_ON:TF_DEVICE_OFF;
 if(sleep_unavailable){
  if(device_power_current==TF_DEVICE_ON){if(!sleep_recovery_deadline)sleep_recovery_deadline=monotonic_ms()+3000;sleep_recovery_trigger=1;}
  else{sleep_recovery_deadline=sleep_recovery_next=0;sleep_recovery_trigger=0;}
 }
 if(device_power_sequence==UINT32_MAX){fail();return;}device_power_sequence++;
 if(state==TF_DEVICE_ON){quicken_pending=poweroff_pending=0;poweroff_needed=quicken_needed=poweroff_done=quicken_done=0;}
 else{
  if(state&TF_DEVICE_NORMAL)poweroff_needed=1;
  if(state&TF_DEVICE_QUICK)quicken_needed=1;
  /* Preserve both required completions across quickening/unreal, but bind
   * pending work to the latest event so ON/new OFF invalidates old receipts. */
  poweroff_pending=poweroff_needed&&!poweroff_done?device_power_sequence:0;
  quicken_pending=quicken_needed&&!quicken_done?device_power_sequence:0;
  state=TF_DEVICE_OFF|(poweroff_pending?TF_DEVICE_NORMAL:0)|(quicken_pending?TF_DEVICE_QUICK:0);
 }
 if(!send_packet(TF_BUS_DEVICE_POWER,device_power_sequence,state))fail();
}
static int device_complete(uint32_t event_sequence,int quick){
 uint32_t*pending=quick?&quicken_pending:&poweroff_pending;int*done=quick?&quicken_done:&poweroff_done;
 if(sleep_unavailable||!*pending||*pending!=event_sequence||*done)return TF_COMPLETE_STALE;
 /* Remove this in-flight token, but let a newer same-cycle phase rebind work
  * that has never reached the RPC. An ON/new cycle must not inherit our done
  * write. A stable lookup failure still consumes this cycle's one attempt. */
 *pending=0;
 uint32_t id;int found=device_manager_lookup(&id);
 if(sleep_unavailable||device_power_sequence!=event_sequence||*done)return TF_COMPLETE_STALE;
 *done=1;
 if(!found)return TF_COMPLETE_UNKNOWN;
 struct blob_buf b={0};blob_buf_init(&b,0);blobmsg_add_string(&b,"moduleName","zte_topsw_devui");blobmsg_add_u32(&b,"resetFlag",0);
 int rc=ubus_invoke(bus,id,quick?"poweroff_quicken_compelte":"poweroff_compelte",b.head,NULL,NULL,1500);
 blob_buf_free(&b);return rc==0?TF_COMPLETE_CONFIRMED:TF_COMPLETE_UNKNOWN;
}

static void parent_event(struct uloop_fd*fd,unsigned int events){
 (void)events;if(completion_busy||sleep_recovery_busy)return;
 for(int i=0;i<16;i++){
  tf_bus_packet p;ssize_t n=recv(fd->fd,&p,sizeof p,MSG_DONTWAIT|MSG_TRUNC);
  if(n<0&&(errno==EAGAIN||errno==EINTR))return;
  if(n!=sizeof p||!tf_bus_command_valid(&p)||p.sequence<=last_sequence){fail();return;}
  last_sequence=p.sequence;last_parent_ms=monotonic_ms();int ok=1;
  if(p.type==TF_BUS_LCD)ok=!sleep_unavailable&&lcd_event((int)p.value);
  else if(p.type==TF_BUS_TOUCH)ok=!sleep_unavailable&&touch_event();
  else if(p.type==TF_BUS_LOGIN)ui_logged_in=(int)p.value;
  else if(p.type==TF_BUS_QUICKEN_COMPLETE||p.type==TF_BUS_POWEROFF_COMPLETE){
   completion_busy=1;int result=device_complete(p.value,p.type==TF_BUS_QUICKEN_COMPLETE);completion_busy=0;
   if(failed)return;
   if(!send_packet(TF_BUS_COMPLETE_RESULT,p.sequence,(uint32_t)result)){fail();return;}
   continue;
  }
  else if(p.type==TF_BUS_STOP)stopping=1;
  if(!send_packet(TF_BUS_ACK,p.sequence,ok?1:0)||!ok){fail();return;}
  if(stopping){uloop_end();return;}
 }
}
static void watchdog_tick(struct uloop_timeout*t){
 if(!completion_busy&&!sleep_recovery_busy&&reregister_pending){reregistered(bus,NULL,NULL,NULL);if(failed)return;}
 if(!completion_busy&&!sleep_recovery_busy){recover_sleep();if(failed)return;}
 if(!completion_busy&&!sleep_recovery_busy&&monotonic_ms()-last_parent_ms>8000){fail();return;}
 unsigned delay=1000;uint64_t now=monotonic_ms();
 if(sleep_unavailable&&device_power_current==TF_DEVICE_ON&&sleep_recovery_deadline){uint64_t left=sleep_recovery_deadline>now?sleep_recovery_deadline-now:1;if(left<delay)delay=(unsigned)left;}
 uloop_timeout_set(t,(int)delay);
}
int main(int argc,char**argv){
 if(argc==2&&!strcmp(argv[1],"--extra"))return tf_extra_rpc_main();
 /* Only an inherited private socketpair can start the service. */
 if(argc!=3||strcmp(argv[1],"--parent-fd"))return 64;
 char*end=NULL;long fd=strtol(argv[2],&end,10);if(!end||*end||fd<3||fd>255)return 64;
 struct stat st;int socktype=0;socklen_t socklen=sizeof socktype;
 if(fstat((int)fd,&st)||!S_ISSOCK(st.st_mode)||getsockopt((int)fd,SOL_SOCKET,SO_TYPE,&socktype,&socklen)||socktype!=SOCK_SEQPACKET)return 64;
 pid_t owner=getppid();if(owner<=1||prctl(PR_SET_PDEATHSIG,SIGKILL)<0||getppid()!=owner)return 65;
 signal(SIGPIPE,SIG_IGN);parent_io.fd=(int)fd;parent_io.cb=parent_event;
 if(!send_packet(TF_BUS_START_STAGE,0,1)||uloop_init())return 66;
 if(!send_packet(TF_BUS_START_STAGE,0,2)){uloop_done();return 68;}
 bus=ubus_connect(NULL);if(!bus){uloop_done();return 67;}
 bus->connection_lost=lost;ubus_add_uloop(bus);
 sleep_sub.cb=notified;sleep_sub.remove_cb=removed;
 rereg_event.cb=reregistered;power_event.cb=power_broadcast;device_power_event.cb=device_power_broadcast;
 int rc=!send_packet(TF_BUS_START_STAGE,0,3)||ubus_add_object(bus,&object)||
  !send_packet(TF_BUS_START_STAGE,0,4)||ubus_register_subscriber(bus,&sleep_sub)||
  !send_packet(TF_BUS_START_STAGE,0,5)||!subscribe_sleep()||
  !send_packet(TF_BUS_START_STAGE,0,6)||ubus_register_event_handler(bus,&rereg_event,"zte_sleep_event_re_registration")||
  !send_packet(TF_BUS_START_STAGE,0,7)||ubus_register_event_handler(bus,&power_event,"zte_sleep_event_go_to_sleep_or_wakeup")||ubus_register_event_handler(bus,&device_power_event,"zwrt_device_power_state_event")||
  !send_packet(TF_BUS_START_STAGE,0,8)||uloop_fd_add(&parent_io,ULOOP_READ)||!send_packet(TF_BUS_START_STAGE,0,9);
 if(!rc){last_parent_ms=monotonic_ms();watchdog.cb=watchdog_tick;uloop_timeout_set(&watchdog,1000);if(send_packet(TF_BUS_READY,0,0))uloop_run();else failed=1;}
 else failed=1;
 uloop_timeout_cancel(&watchdog);ubus_free(bus);uloop_done();close(parent_io.fd);
 return failed?68:0;
}
