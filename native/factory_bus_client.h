/* Parent adapter for the private factory-bus helper. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_FACTORY_BUS_CLIENT_H
#define TF_FACTORY_BUS_CLIENT_H
#include "factory_bus_protocol.h"
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
typedef struct {
 int fd,ready,failed,power_event,resync,waiting,start_stage;pid_t pid;
 uint32_t sequence,ack_sequence,ack_value;uint64_t ping_ms;
} tf_factory_bus;
static uint64_t tf_fb_now(void){struct timespec t;if(clock_gettime(CLOCK_MONOTONIC,&t))return 0;return (uint64_t)t.tv_sec*1000+t.tv_nsec/1000000;}
static void tf_fb_init(tf_factory_bus*s){memset(s,0,sizeof *s);s->fd=-1;s->pid=-1;}
static int tf_fb_poll(tf_factory_bus*s){
 if(s->fd<0||s->failed)return 0;
 for(int i=0;i<32;i++){
  tf_bus_packet p;ssize_t n=recv(s->fd,&p,sizeof p,MSG_DONTWAIT|MSG_TRUNC);
  if(n<0&&(errno==EAGAIN||errno==EINTR))return 1;
  if(n!=sizeof p||!tf_bus_response_valid(&p)){s->failed=1;return 0;}
  switch(p.type){
  case TF_BUS_START_STAGE:if(s->ready||p.value<=(uint32_t)s->start_stage){s->failed=1;return 0;}s->start_stage=(int)p.value;break;
  case TF_BUS_READY:if(s->ready){s->failed=1;return 0;}s->ready=1;break;
  case TF_BUS_ACK:
   if(!s->waiting||p.sequence!=s->sequence){s->failed=1;return 0;}
   s->ack_sequence=p.sequence;s->ack_value=p.value;break;
  case TF_BUS_SLEEP:s->power_event=1;break;
  case TF_BUS_WAKE:s->power_event=2;break;
  case TF_BUS_RESYNC:s->resync=1;break;
  default:s->failed=1;return 0;
  }
 }return 1;
}
static int tf_fb_command(tf_factory_bus*s,uint32_t type,uint32_t value,int timeout_ms){
 if(s->fd<0||!s->ready||s->failed||s->waiting||s->sequence==UINT32_MAX)return 0;
 tf_bus_packet p={TF_BUS_MAGIC,type,++s->sequence,value};
 if(!tf_bus_command_valid(&p)){s->failed=1;return 0;}
 s->waiting=1;s->ack_sequence=0;s->ack_value=0;
 if(send(s->fd,&p,sizeof p,MSG_NOSIGNAL|MSG_DONTWAIT)!=sizeof p){s->failed=1;s->waiting=0;return 0;}
 uint64_t until=tf_fb_now()+(uint64_t)timeout_ms;
 while(tf_fb_now()<until){
  if(!tf_fb_poll(s))break;
  if(s->ack_sequence==p.sequence){s->waiting=0;s->ping_ms=tf_fb_now();if(!s->ack_value)s->failed=1;return s->ack_value==1;}
  struct pollfd f={s->fd,POLLIN,0};poll(&f,1,10);
 }
 s->waiting=0;s->failed=1;return 0;
}
static int tf_fb_tick(tf_factory_bus*s){
 if(!tf_fb_poll(s))return 0;
 if(!s->waiting&&tf_fb_now()-s->ping_ms>=2000)return tf_fb_command(s,TF_BUS_PING,0,2500);
 return 1;
}
static void tf_fb_stop(tf_factory_bus*s){
 if(s->fd>=0&&s->ready&&!s->failed)tf_fb_command(s,TF_BUS_STOP,0,500);
 if(s->fd>=0)close(s->fd);s->fd=-1;
 if(s->pid>0){
  int status;uint64_t until=tf_fb_now()+500;pid_t got=0;
  do{got=waitpid(s->pid,&status,WNOHANG);if(got==s->pid||(got<0&&errno==ECHILD))break;if(got<0&&errno!=EINTR)break;poll(NULL,0,10);}while(tf_fb_now()<until);
  if(got==0||(got<0&&errno==EINTR)){kill(s->pid,SIGKILL);while(waitpid(s->pid,&status,0)<0&&errno==EINTR){}}
 }tf_fb_init(s);
}
static const char*tf_fb_stage_code(int stage){static const char*const codes[]={"BUS_EOF","BUS_ULOOP","BUS_CONNECT","BUS_OBJECT","BUS_SUBSCRIBER","BUS_SLEEP_SUBSCRIBE","BUS_REREGISTER","BUS_POWER_EVENT","BUS_PARENT_FD","BUS_READY_TIMEOUT"};return stage>=0&&stage<=9?codes[stage]:"BUS_EOF";}
static int tf_fb_start(tf_factory_bus*s){
 tf_fb_init(s);char path[1024];ssize_t n=readlink("/proc/self/exe",path,sizeof path-1);
 if(n<=0||n>=(ssize_t)sizeof(path)-1){native_failure_note("BUS_PATH");return 0;}path[n]=0;
 char*slash=strrchr(path,'/');if(!slash||(size_t)(slash-path)+sizeof("/topflow-factory-bus-aarch64")>sizeof path){native_failure_note("BUS_PATH");return 0;}
 strcpy(slash,"/topflow-factory-bus-aarch64");
 int pair[2];if(socketpair(AF_UNIX,SOCK_SEQPACKET|SOCK_CLOEXEC,0,pair)){native_failure_note("BUS_SOCKET");return 0;}
 pid_t owner=getpid(),child=fork();
 if(child==0){
  if(prctl(PR_SET_PDEATHSIG,SIGKILL)<0||getppid()!=owner)_exit(127);
  close(pair[0]);if(pair[1]!=3){if(dup2(pair[1],3)<0)_exit(127);close(pair[1]);}
  if(fcntl(3,F_SETFD,0)<0)_exit(127);
  int null=open("/dev/null",O_RDWR);if(null<0)_exit(127);
  for(int i=0;i<3;i++)if(dup2(null,i)<0)_exit(127);
  for(int i=4;i<256;i++)close(i);
  char*const args[]={path,"--parent-fd","3",NULL};execv(path,args);_exit(127);
 }
 close(pair[1]);if(child<0){close(pair[0]);native_failure_note("BUS_FORK");return 0;}s->pid=child;s->fd=pair[0];
 uint64_t until=tf_fb_now()+4000;
 while(tf_fb_now()<until){if(!tf_fb_poll(s))break;if(s->ready){s->ping_ms=tf_fb_now();return 1;}struct pollfd p={s->fd,POLLIN,0};poll(&p,1,10);}
 native_failure_note(s->start_stage?tf_fb_stage_code(s->start_stage):s->failed?"BUS_EXEC":"BUS_READY_TIMEOUT");tf_fb_stop(s);return 0;
}
#endif
