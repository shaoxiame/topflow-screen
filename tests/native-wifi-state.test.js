'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const native=path.resolve(__dirname,'../native');
function runC(name,source){
  const dir=path.join(native,'build-preview');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,name+'.c'),exe=path.join(dir,name+'.exe');fs.writeFileSync(file,source);
  const zig=path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe');
  const built=cp.spawnSync(zig,['cc','-target','x86_64-windows-gnu','-std=c11','-D_GNU_SOURCE','-O2','-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),file,path.join(native,'upstream/src/json.c'),'-o',exe],{encoding:'utf8'});
  assert.equal(built.status,0,built.stdout+built.stderr);
  const run=cp.spawnSync(exe,[],{encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);
}
const fixtures=String.raw`
static char fixture[2048];
static const char*reply(int radio,int ap,int active,int busy,int module,int user){
 snprintf(fixture,sizeof fixture,"{\"ok\":true,\"action\":\"wifi.state\",\"result\":{\"busy\":%s,\"module\":{\"enabled\":%s,\"user_enabled\":%s},\"radios\":[{\"band\":\"2g\",\"enabled\":%s,\"radio_enabled\":%s}],\"aps\":[{\"section\":\"main_2g\",\"band\":\"2g\",\"enabled\":%s,\"active\":%s,\"state\":\"%s\"}]}}",busy?"true":"false",module?"true":"false",user?"true":"false",radio&&ap?"true":"false",radio?"true":"false",ap?"true":"false",active?"true":"false",active?"up":"absent");return fixture;
}
`;
test('native Wi-Fi reads radio, module and on-air state independently; stale and malformed states never become on',()=>{
runC('test-wifi-state',String.raw`
#include <assert.h>
#include "wifi_state.h"
`+fixtures+String.raw`
int main(void){tf_wifi_state s;tf_wifi_state_reset(&s);assert(!tf_wifi_state_fresh(&s,0));
 /* TopFlow closes wifiN and parks main AP on wlanx without changing its disabled flag. */
 assert(tf_wifi_state_parse(reply(0,1,0,0,1,1),100,1,&s));
 assert(s.bands[0].ap_enabled==1&&tf_wifi_configured(&s,"2g",100)==0);
 assert(tf_wifi_effective(&s,"2g",100)==0&&tf_wifi_status(&s,"2g",100)==TF_WIFI_OFF);
 assert(tf_wifi_verify_radio("{\"action\":\"wifi.radio.set\",\"params\":{\"band\":\"2g\",\"enabled\":false}}",&s,100,0));
 assert(!tf_wifi_verify_radio("{\"action\":\"wifi.radio.set\",\"params\":{\"band\":\"2g\",\"enabled\":false}}",&s,100,1));
 assert(tf_wifi_configured(&s,"5g",100)==-1&&tf_wifi_status(&s,"5g",100)==TF_WIFI_UNKNOWN);
 assert(tf_wifi_state_parse(reply(1,1,0,1,0,1),200,2,&s));
 assert(tf_wifi_configured(&s,"2g",200)==1&&tf_wifi_effective(&s,"2g",200)==-1&&tf_wifi_status(&s,"2g",200)==TF_WIFI_STARTING);
 assert(tf_wifi_state_parse(reply(1,1,1,0,1,1),300,3,&s));assert(tf_wifi_status(&s,"2g",300)==TF_WIFI_ON);
 assert(tf_wifi_status(&s,"2g",6300)==TF_WIFI_ON&&tf_wifi_status(&s,"2g",6301)==TF_WIFI_UNKNOWN);
 assert(tf_wifi_state_parse(reply(1,1,0,0,0,0),400,4,&s));assert(tf_wifi_status(&s,"2g",400)==TF_WIFI_OFF);
 assert(tf_wifi_state_parse(reply(1,1,0,0,0,1),450,5,&s));assert(tf_wifi_configured(&s,"2g",450)==1&&tf_wifi_effective(&s,"2g",450)==0&&tf_wifi_status(&s,"2g",450)==TF_WIFI_UNAVAILABLE&&!strcmp(tf_wifi_status_label(tf_wifi_status(&s,"2g",450)),"尚未广播"));
 assert(tf_wifi_state_parse(reply(1,1,0,0,1,1),500,5,&s));assert(tf_wifi_status(&s,"2g",500)==TF_WIFI_UNAVAILABLE);
 assert(tf_wifi_state_parse(reply(1,1,1,0,1,1),UINT32_MAX-100,6,&s));assert(tf_wifi_state_fresh(&s,20));
 const char*unknown="{\"ok\":true,\"action\":\"wifi.state\",\"result\":{\"busy\":null,\"module\":{\"enabled\":null,\"user_enabled\":null},\"radios\":[{\"band\":\"2g\",\"enabled\":null}],\"aps\":[]}}";
 assert(tf_wifi_state_parse(unknown,700,7,&s)&&tf_wifi_configured(&s,"2g",700)==-1&&tf_wifi_status(&s,"2g",700)==TF_WIFI_UNKNOWN);
 const char*bad[]={"{}","{\"ok\":true,\"action\":\"wifi.status\",\"result\":{}}","{\"ok\":true,\"action\":\"wifi.state\",\"result\":{\"module\":{},\"radios\":[],\"aps\":null}}","{\"ok\":true,\"action\":\"wifi.state\",\"result\":{\"module\":{},\"radios\":[{\"band\":\"2g\"},{\"band\":\"2g\"}],\"aps\":[]}}"};
 for(unsigned i=0;i<sizeof bad/sizeof*bad;i++)assert(!tf_wifi_state_parse(bad[i],800,8,&s));
 /* No fallback to misleading snapshot main AP configuration. */
 assert(!tf_wifi_state_parse("{\"wlan\":{\"bands\":[{\"band\":\"2g\",\"enabled\":1}]}}",900,9,&s));
 puts("wifi state semantic regressions passed");return 0;}
`);
});
test('nonblocking fixed wifi.state reader handles fragmentation, timeout, disconnect, bad HTTP and bounded memory without writes',()=>{
const local=fs.readFileSync(path.join(native,'local_http.h'),'utf8');
const decoder=local.slice(local.indexOf('static int tf_http_decode('),local.indexOf('static int tf_http_timeout('));
runC('test-wifi-state-runtime',String.raw`
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <stdarg.h>
#include <sys/types.h>
#include "wifi_state.h"
`+decoder+fixtures+String.raw`
#define TF_WIFI_RUNTIME_TEST_IO
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
#define POLLERR 8
#define POLLHUP 16
#define POLLNVAL 32
typedef unsigned socklen_t;
struct sockaddr {unsigned short family;};
struct sockaddr_in {unsigned short sin_family,sin_port;uint32_t sin_addr;};
struct pollfd {int fd;short events,revents;};
static int opened,closed,polls,connect_mode,receive_mode,io_budget,partial_send=1;
static char wire[70000],sent[1024];static size_t wire_size,read_at,sent_size;
static unsigned short mock_htons(unsigned short v){return(unsigned short)((v<<8)|(v>>8));}
static int mock_inet_pton(int family,const char*text,void*target){assert(family==AF_INET&&!strcmp(text,"127.0.0.1"));*(uint32_t*)target=0x0100007f;return 1;}
static int mock_socket(int family,int type,int protocol){assert(family==AF_INET&&type==SOCK_STREAM&&!protocol);opened++;return 23;}
static int mock_fcntl(int fd,int cmd,int arg){assert(fd==23);assert((cmd==F_SETFD&&arg==FD_CLOEXEC)||(cmd==F_SETFL&&arg==O_NONBLOCK));return 0;}
static int mock_connect(int fd,const struct sockaddr*a,size_t n){assert(fd==23&&n==sizeof(struct sockaddr_in));const struct sockaddr_in*v=(const struct sockaddr_in*)a;assert(v->sin_port==mock_htons(9460));if(connect_mode==2){errno=ECONNREFUSED;return-1;}errno=EINPROGRESS;return-1;}
static int mock_poll(struct pollfd*p,unsigned count,int timeout){assert(count==1&&timeout==0&&p->fd==23);polls++;if(receive_mode==3)return 0;p->revents=p->events;return 1;}
static int mock_getsockopt(int fd,int level,int name,void*value,socklen_t*size){assert(fd==23&&level==SOL_SOCKET&&name==SO_ERROR&&*size==sizeof(int));*(int*)value=connect_mode==1?ECONNREFUSED:0;return 0;}
static int mock_close(int fd){assert(fd==23);closed++;return 0;}
static ssize_t mock_send(int fd,const void*bytes,size_t n,int flags){assert(fd==23&&!flags&&n<=8192);io_budget+=(int)n;if(partial_send&&n>7)n=7;assert(sent_size+n<sizeof sent);memcpy(sent+sent_size,bytes,n);sent_size+=n;sent[sent_size]=0;return(ssize_t)n;}
static ssize_t mock_recv(int fd,void*out,size_t n,int flags){assert(fd==23&&!flags&&n<=8192);io_budget+=(int)n;if(receive_mode==1){errno=EAGAIN;return-1;}if(receive_mode==2){errno=ECONNRESET;return-1;}if(read_at==wire_size)return 0;if(n>wire_size-read_at)n=wire_size-read_at;if(partial_send&&n>19)n=19;memcpy(out,wire+read_at,n);read_at+=n;return(ssize_t)n;}
#define htons mock_htons
#define inet_pton mock_inet_pton
#define socket mock_socket
#define fcntl mock_fcntl
#define connect mock_connect
#define poll mock_poll
#define getsockopt mock_getsockopt
#define close mock_close
#define send mock_send
#define recv mock_recv
#include "wifi_state_runtime.h"
static void setup(const char*body){wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.0 200 OK\r\nContent-Length: %zu\r\n\r\n%s",strlen(body),body);sent_size=read_at=0;connect_mode=receive_mode=0;}
static int finish(tf_wifi_runtime*r,uint32_t now){int changed=0;for(int i=0;i<400&&r->fd>=0;i++){io_budget=0;changed|=tf_wifi_runtime_poll(r,now+(unsigned)i);assert(io_budget<=8192);}assert(r->fd<0);return changed;}
int main(void){tf_wifi_runtime r;tf_wifi_runtime_init(&r);assert(r.fd==-1&&!r.raw);setup(reply(1,1,1,0,1,1));
 assert(!tf_wifi_runtime_refresh(&r,100,1)&&r.fd==23);int count=opened;tf_wifi_runtime_refresh(&r,101,1);assert(opened==count);assert(finish(&r,100)&&r.state.valid&&r.sequence==1);
 assert(strstr(sent,"POST /control HTTP/1.0\r\nHost: 127.0.0.1:9460\r\nConnection: close\r\n")&&strstr(sent,"{\"action\":\"wifi.state\",\"params\":{}}")&&!strstr(sent,"wifi.radio.set"));
 tf_wifi_runtime_refresh(&r,3099,1);assert(opened==count);setup(reply(0,1,0,0,1,1));tf_wifi_runtime_refresh(&r,3100,1);assert(finish(&r,3100)&&r.sequence==2&&tf_wifi_status(&r.state,"2g",3400)==TF_WIFI_OFF);
 assert(tf_wifi_runtime_refresh(&r,3500,0)&&!r.state.valid&&r.fd<0&&!r.raw);tf_wifi_runtime_refresh(&r,4000,0);assert(opened==closed);
 setup(reply(1,1,1,0,1,1));receive_mode=3;tf_wifi_runtime_refresh(&r,5000,1);assert(!tf_wifi_runtime_poll(&r,7499));assert(tf_wifi_runtime_poll(&r,7500)&&r.fd<0&&!r.state.valid&&!r.raw);
 setup(reply(1,1,1,0,1,1));tf_wifi_runtime_invalidate(&r);tf_wifi_runtime_refresh(&r,8000,1);receive_mode=2;assert(finish(&r,8000)&&!r.state.valid);
 setup("not json");tf_wifi_runtime_invalidate(&r);tf_wifi_runtime_refresh(&r,9000,1);assert(finish(&r,9000)&&!r.state.valid);
 setup("{}");wire_size=(size_t)snprintf(wire,sizeof wire,"HTTP/1.0 200 OK\r\nContent-Length: 9\r\n\r\n{}");tf_wifi_runtime_invalidate(&r);tf_wifi_runtime_refresh(&r,10000,1);assert(finish(&r,10000)&&!r.state.valid);
 setup(reply(1,1,1,0,1,1));connect_mode=1;tf_wifi_runtime_invalidate(&r);tf_wifi_runtime_refresh(&r,11000,1);assert(tf_wifi_runtime_poll(&r,11000)&&!r.state.valid);
 setup(reply(1,1,1,0,1,1));connect_mode=2;tf_wifi_runtime_invalidate(&r);assert(tf_wifi_runtime_refresh(&r,12000,1)&&r.fd<0&&!r.raw);
 setup(reply(1,1,1,0,1,1));tf_wifi_runtime_invalidate(&r);tf_wifi_runtime_refresh(&r,13000,1);tf_wifi_runtime_close(&r);assert(opened==closed&&!r.raw);
 setup("{}");memset(wire,'x',sizeof wire);wire_size=sizeof wire;partial_send=0;tf_wifi_runtime_refresh(&r,14000,1);assert(finish(&r,14000)&&!r.raw&&!r.state.valid&&read_at==65536);
 setup(reply(1,1,1,0,1,1));tf_wifi_runtime_invalidate(&r);tf_wifi_runtime_refresh(&r,15000,1);assert(finish(&r,15000)&&r.state.valid);assert(tf_wifi_runtime_poll(&r,r.state.sampled_at+6001)&&!r.state.valid);
 assert(opened==closed);puts("wifi nonblocking socket lifecycle passed");return 0;}
`);
const runtime=fs.readFileSync(path.join(native,'wifi_state_runtime.h'),'utf8');
assert.doesNotMatch(runtime,/\b(?:system|execv|fork|pthread_create|fopen|usleep|nanosleep)\s*\(/);
assert.match(runtime,/poll\(&p,1,0\)/);
});
