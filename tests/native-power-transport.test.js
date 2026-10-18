'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const native=path.resolve(__dirname,'../native');
test('actual power HTTP loop preserves transmission evidence, bounded waits and immediate cancellation without resubmitting',()=>{
 const http=fs.readFileSync(path.join(native,'local_http.h'),'utf8');
 const begin=http.indexOf('static volatile sig_atomic_t tf_http_cancelled=0;'),end=http.lastIndexOf('#endif');assert(begin>=0&&end>begin);
 const clock='static long long tf_monotonic_ms(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return(long long)t.tv_sec*1000+t.tv_nsec/1000000;}';assert(http.includes(clock));
 // The production HTTP parser, poll, send, receive and cancellation loops stay
 // intact. Only the clock and OS socket boundary are deterministic PC doubles.
 const production=http.slice(begin,end).replace(clock,'static long long tf_monotonic_ms(void){return clock_ms;}');
 const source=String.raw`
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <strings.h>
#include <ctype.h>
#include <errno.h>
#include <signal.h>
#include <sys/types.h>
#define AF_INET 2
#define SOCK_STREAM 1
#define SOL_SOCKET 1
#define SO_ERROR 4
#define MSG_NOSIGNAL 0
#define F_SETFD 2
#define FD_CLOEXEC 1
#define F_SETFL 4
#define O_NONBLOCK 2048
#define POLLIN 1
#define POLLOUT 4
#define POLLHUP 16
typedef unsigned socklen_t;
struct sockaddr {unsigned short family;};
struct sockaddr_in {unsigned short sin_family,sin_port;uint32_t sin_addr;};
struct pollfd {int fd;short events,revents;};
static long long clock_ms,response_at,cancel_at,started;
static int opened,closed,polls,sends,receives,hooks,connect_mode,send_limit,receive_limit,receive_reset,cancel_stage,cancel_in_receive,eof_allowed;
static size_t sent_size,request_size,read_size,wire_size;
static char wire[32768],sent[2048];
static int*cancel_flag;
static unsigned short htons(unsigned short v){return(unsigned short)((v<<8)|(v>>8));}
static int inet_pton(int family,const char*value,void*out){assert(family==AF_INET&&!strcmp(value,"127.0.0.1"));*(uint32_t*)out=0x0100007f;return 1;}
static int socket(int family,int type,int protocol){assert(family==AF_INET&&type==SOCK_STREAM&&!protocol);opened++;return 23;}
static int fcntl(int fd,int command,int value){assert(fd==23);assert((command==F_SETFD&&value==FD_CLOEXEC)||(command==F_SETFL&&value==O_NONBLOCK));return 0;}
static int connect(int fd,const struct sockaddr*address,size_t size){assert(fd==23&&size==sizeof(struct sockaddr_in));const struct sockaddr_in*a=(const struct sockaddr_in*)address;assert(a->sin_family==AF_INET&&a->sin_port==htons(9460));if(connect_mode==2){errno=ECONNREFUSED;return -1;}if(connect_mode==1){errno=EINPROGRESS;return -1;}return 0;}
static int getsockopt(int fd,int level,int name,void*out,socklen_t*size){assert(fd==23&&level==SOL_SOCKET&&name==SO_ERROR&&*size==sizeof(int));*(int*)out=0;return 0;}
static int close(int fd){assert(fd==23);closed++;return 0;}
static int poll(struct pollfd*p,unsigned count,int milliseconds){assert(count==1&&p->fd==23&&milliseconds>0);polls++;int step=milliseconds>125?125:milliseconds;clock_ms+=step;if(p->events==POLLIN&&clock_ms<response_at)return 0;p->revents=p->events;return 1;}
static ssize_t send(int fd,const void*data,size_t size,int flags){assert(fd==23&&!flags&&size&&sent_size+size<sizeof sent);sends++;if(!request_size)request_size=size;if(send_limit&&size>(size_t)send_limit)size=(size_t)send_limit;memcpy(sent+sent_size,data,size);sent_size+=size;sent[sent_size]=0;return(ssize_t)size;}
static ssize_t recv(int fd,void*out,size_t size,int flags){assert(fd==23&&!flags&&size);receives++;if(receive_reset){errno=ECONNRESET;return -1;}if(read_size==wire_size){assert(eof_allowed);return 0;}if(size>wire_size-read_size)size=wire_size-read_size;if(receive_limit&&size>(size_t)receive_limit)size=(size_t)receive_limit;memcpy(out,wire+read_size,size);read_size+=size;if(cancel_in_receive)*cancel_flag=1;return(ssize_t)size;}
PRODUCTION_HTTP
static void hook(void){hooks++;if((cancel_stage==1&&!sent_size)||(cancel_stage==2&&sent_size&&sent_size<request_size)||(cancel_stage==3&&request_size&&sent_size==request_size)||(cancel_stage==4&&read_size)||(cancel_at&&clock_ms>=cancel_at))tf_http_cancelled=1;}
static void setup(const char*body){
 clock_ms=started=1000;response_at=cancel_at=0;opened=closed=polls=sends=receives=hooks=connect_mode=send_limit=receive_limit=receive_reset=cancel_stage=cancel_in_receive=0;eof_allowed=1;
 sent_size=request_size=read_size=0;sent[0]=0;tf_http_cancelled=0;tf_http_hook_at=0;tf_http_wait_hook=hook;cancel_flag=(int*)&tf_http_cancelled;
 wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.0 200 OK\r\nContent-Length: %zu\r\n\r\n%s",strlen(body),body);
}
static const char*off="{\"action\":\"device.poweroff\",\"params\":{}}";
static const char*reboot="{\"action\":\"device.reboot\",\"params\":{}}";
static const char*reply="{\"ok\":true,\"action\":\"device.poweroff\"}";
static char output[4096];static tf_http_transfer transfer;
static int call(int timeout){memset(&transfer,0xff,sizeof transfer);return tf_http_power_timeout(9460,"POST","/control",NULL,off,output,sizeof output,timeout,&transfer);}
static void counts(void){assert(opened==closed&&opened<=1);assert(transfer.sent_bytes==sent_size&&transfer.received_bytes==read_size);if(sent_size)assert(transfer.request_bytes==request_size&&sent_size<=request_size);}
int main(void){
 setup(reply);tf_http_cancelled=1;assert(call(10000)==-1&&!opened&&!sends&&!receives&&transfer.cancelled&&!transfer.request_bytes&&!transfer.sent_bytes&&!transfer.received_bytes);
 setup(reply);cancel_stage=1;assert(call(10000)==-1&&opened==1&&!sends&&!receives&&transfer.request_bytes>0&&transfer.cancelled);counts();assert(clock_ms==started);
 setup(reply);send_limit=17;cancel_stage=2;assert(call(10000)==-1&&sends==1&&!receives&&transfer.sent_bytes==17&&transfer.sent_bytes<transfer.request_bytes&&transfer.cancelled);counts();assert(clock_ms-started<=125);
 setup(reply);cancel_stage=3;assert(call(10000)==-1&&sends==1&&!receives&&transfer.sent_bytes==transfer.request_bytes&&transfer.cancelled);counts();assert(clock_ms-started<=125);
 setup(reply);receive_limit=13;cancel_stage=4;assert(call(10000)==-1&&receives==1&&transfer.received_bytes==13&&transfer.sent_bytes==transfer.request_bytes&&transfer.cancelled&&!output[0]);counts();assert(clock_ms-started<=250);
 setup(reply);cancel_in_receive=1;eof_allowed=0;assert(call(10000)==200&&receives==1&&transfer.cancelled&&!strcmp(output,reply));counts();assert(clock_ms-started<=250);
 setup(reply);eof_allowed=0;assert(call(10000)==200&&receives==1&&!transfer.cancelled&&!strcmp(output,reply));counts();assert(sends==1&&strstr(sent,"POST /control HTTP/1.0\r\nHost: 127.0.0.1:9460\r\n")&&strstr(sent,off));
 setup(reply);send_limit=19;receive_limit=11;assert(call(10000)==200&&sends>1&&receives>1&&!strcmp(output,reply));counts();assert(sent_size==request_size&&strstr(sent,off));
 setup(reply);response_at=started+7000;assert(call(5000)==-1&&!receives&&!transfer.cancelled&&clock_ms-started==5000&&hooks>30);counts();
 setup(reply);response_at=started+7000;assert(call(10000)==200&&receives==1&&!strcmp(output,reply)&&clock_ms-started>=7000&&clock_ms-started<10000&&hooks>40);counts();
 setup(reply);response_at=started+7000;cancel_at=started+1000;assert(call(10000)==-1&&!receives&&transfer.cancelled&&clock_ms-started<=1000&&transfer.sent_bytes==transfer.request_bytes);counts();
 setup(reply);response_at=started+20000;assert(call(10000)==-1&&!receives&&!transfer.cancelled&&clock_ms-started==10000);counts();
 setup(reply);connect_mode=2;assert(call(10000)==-1&&!sends&&!receives&&transfer.request_bytes>0&&!transfer.sent_bytes&&!transfer.cancelled);counts();
 setup(reply);connect_mode=1;assert(call(10000)==200&&!strcmp(output,reply));counts();
 setup(reply);receive_reset=1;assert(call(10000)==-1&&receives==1&&transfer.sent_bytes==transfer.request_bytes&&!transfer.received_bytes&&!transfer.cancelled);counts();
 setup(reply);wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n%zx\r\n%s\r\n0\r\n\r\n",strlen(reply),reply);cancel_in_receive=1;eof_allowed=0;assert(call(10000)==200&&!strcmp(output,reply)&&transfer.cancelled);counts();
 setup(reply);wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.0 200 OK\r\n\r\n%s",reply);cancel_in_receive=1;assert(call(10000)==-1&&transfer.cancelled&&transfer.received_bytes==wire_size&&!output[0]);counts();
 setup(reply);wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.0 200 OK\r\n\r\n%s",reply);assert(call(10000)==200&&receives==2&&!strcmp(output,reply));counts();
 setup(reply);wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.0 200 OK\r\nContent-Length: %zu\r\n\r\n%s",strlen(reply)+3,reply);cancel_in_receive=1;assert(call(10000)==-1&&transfer.cancelled&&!output[0]);counts();
 setup(reply);wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n%zx\r\n%s\r\n",strlen(reply),reply);cancel_in_receive=1;assert(call(10000)==-1&&transfer.cancelled&&!output[0]);counts();
 setup(reply);wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.1 200 OK\r\nContent-Length: %zu\r\nTransfer-Encoding: chunked\r\n\r\n%s",strlen(reply),reply);cancel_in_receive=1;assert(call(10000)==-1&&transfer.cancelled&&!output[0]);counts();
 setup(reply);wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.0 503 Unavailable\r\nContent-Length: 2\r\n\r\n{}");assert(call(10000)==503&&!strcmp(output,"{}"));counts();
 setup(reply);wire[0]='X';assert(call(10000)==-1);counts();
 setup(reply);wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.0 200 OK\r\nContent-Length: 30000\r\n\r\n");memset(wire+wire_size,'x',30000);wire_size+=30000;assert(call(10000)==-1&&transfer.received_bytes==sizeof output+16384);counts();
 /* Existing generic callers still wait for EOF and honour the same cancel. */
 setup(reply);cancel_in_receive=1;assert(tf_http_timeout(9460,"POST","/control",NULL,off,output,sizeof output,10000)==-1&&opened==closed&&sends==1);
 setup(reply);assert(tf_http_power_timeout(9460,"POST","/control",NULL,reboot,output,sizeof output,10000,&transfer)==200&&strstr(sent,reboot));counts();
 for(int i=0;i<7;i++){
  setup(reply);const char*method=i==1?"GET":"POST",*route=i==2?"/other":"/control",*secret=i==3?"secret":NULL,*body=i==4?"{\"action\":\"wifi.radio.set\"}":i==5?"{\"action\":\"device.poweroff\",\"params\":{\"extra\":true}}":off;
  memset(&transfer,0xff,sizeof transfer);assert(tf_http_power_timeout(i==0?2333:9460,method,route,secret,body,output,sizeof output,10000,i==6?NULL:&transfer)==-1&&!opened&&!sends);if(i!=6)assert(!transfer.request_bytes&&!transfer.sent_bytes&&!transfer.received_bytes&&!transfer.cancelled);
 }
 puts("PASS: actual HTTP transport retains exact sent/received evidence, framed replies, 7s responses, bounded 10s timeout and immediate OFF cancellation; one connection, no retry or fallback");return 0;
}
`.replace('PRODUCTION_HTTP',production);
 const dir=path.join(native,'build-preview');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'test-power-transport.c'),exe=path.join(dir,'test-power-transport.exe');fs.writeFileSync(file,source);
 const build=cp.spawnSync(path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe'),['cc','-target','x86_64-windows-gnu','-std=c11','-Wall','-Wextra','-Werror','-Wno-unused-function','-O2','-UNDEBUG',file,'-o',exe],{encoding:'utf8',timeout:120000});assert.equal(build.status,0,build.stderr);
 const run=cp.spawnSync(exe,[],{encoding:'utf8',timeout:10000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/actual HTTP transport/);
});
