$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$client=[IO.File]::ReadAllText("$root/factory_bus_client.h")
$poll=$client.Substring($client.IndexOf('static int tf_fb_poll('),$client.IndexOf('static int tf_fb_command(')-$client.IndexOf('static int tf_fb_poll('))
$start=$client.Substring($client.IndexOf('static const char*tf_fb_stage_code('));$start=$start.Substring(0,$start.LastIndexOf('#endif'))
$failure=[IO.File]::ReadAllText("$root/native_failure.h")
$failure=$failure.Substring($failure.IndexOf('static const char*native_failure_code;'),$failure.IndexOf('static void native_failure_publish(')-$failure.IndexOf('static const char*native_failure_code;'))
$prefix=@'
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include "factory_bus_protocol.h"
typedef int pid_t;typedef long long ssize_t;
typedef struct{int fd,ready,failed,power_event,resync,waiting,start_stage;pid_t pid;uint32_t sequence,ack_sequence,ack_value;uint64_t ping_ms;}tf_factory_bus;
struct pollfd{int fd;short events,revents;};
enum{MSG_DONTWAIT=1,MSG_TRUNC=2,AF_UNIX=1,SOCK_SEQPACKET=5,SOCK_CLOEXEC=524288,PR_SET_PDEATHSIG=1,SIGKILL=9,F_SETFD=2,O_RDWR=2,POLLIN=1};
static uint64_t now;static tf_bus_packet queue[16];static int count,index_,at_eof,stops,fail_path,fail_socket,fail_fork;
static uint64_t tf_fb_now(void){return now;}
static void tf_fb_init(tf_factory_bus*s){memset(s,0,sizeof *s);s->fd=-1;s->pid=-1;}
static void tf_fb_stop(tf_factory_bus*s){stops++;tf_fb_init(s);}
static int poll(struct pollfd*p,int n,int ms){(void)p;(void)n;now+=(unsigned)ms;return 0;}
static ssize_t recv(int fd,void*out,size_t size,int flags){assert(fd==3&&size==16&&flags==(MSG_DONTWAIT|MSG_TRUNC));if(index_<count){memcpy(out,&queue[index_++],16);return 16;}if(at_eof)return 0;errno=EAGAIN;return-1;}
static ssize_t readlink(const char*path,char*out,size_t cap){assert(!strcmp(path,"/proc/self/exe")&&cap>64);if(fail_path)return-1;strcpy(out,"/data/plugins/topflow-screen/topflow-screen");return strlen(out);}
static int socketpair(int family,int kind,int protocol,int pair[2]){assert(family==AF_UNIX&&kind==(SOCK_SEQPACKET|SOCK_CLOEXEC)&&!protocol);pair[0]=3;pair[1]=4;return fail_socket?-1:0;}
static int getpid(void){return 123;}static int fork(void){return fail_fork?-1:124;}
static int close(int fd){(void)fd;return 0;}
static int prctl(int a,int b){(void)a;(void)b;return 0;}static int getppid(void){return 123;}
static int dup2(int a,int b){(void)a;return b;}static int fcntl(int a,int b,int c){(void)a;(void)b;(void)c;return 0;}
static int open(const char*p,int flags){(void)p;(void)flags;return 4;}static int execv(const char*p,char*const args[]){(void)p;(void)args;assert(0);return-1;}
static void fake_exit(int code){(void)code;assert(0);}
#define _exit fake_exit
'@
$suffix=@'
static void reset(void){now=0;count=index_=at_eof=stops=fail_path=fail_socket=fail_fork=0;native_failure_code=NULL;}
static void push(unsigned type,unsigned value){queue[count++]=(tf_bus_packet){TF_BUS_MAGIC,type,0,value};}
int main(void){tf_factory_bus s;assert(!tf_bus_command_valid(NULL));
 reset();for(unsigned i=1;i<=9;i++)push(TF_BUS_START_STAGE,i);push(TF_BUS_READY,0);assert(tf_fb_start(&s)&&s.ready&&stops==0&&!native_failure_code);
 for(int stage=1;stage<=9;stage++){reset();for(int i=1;i<=stage;i++)push(TF_BUS_START_STAGE,(unsigned)i);assert(!tf_fb_start(&s));assert(now==4000&&stops==1&&s.start_stage==0&&s.fd==-1);assert(!strcmp(native_failure_code,tf_fb_stage_code(stage)));}
 reset();push(TF_BUS_START_STAGE,5);push(TF_BUS_FATAL,0);assert(!tf_fb_start(&s)&&now==0&&stops==1&&!strcmp(native_failure_code,"BUS_SLEEP_SUBSCRIBE"));
 reset();push(TF_BUS_START_STAGE,3);at_eof=1;assert(!tf_fb_start(&s)&&now==0&&!strcmp(native_failure_code,"BUS_OBJECT"));
 reset();at_eof=1;assert(!tf_fb_start(&s)&&!strcmp(native_failure_code,"BUS_EXEC"));
 reset();push(TF_BUS_START_STAGE,2);push(TF_BUS_START_STAGE,1);assert(!tf_fb_start(&s)&&!strcmp(native_failure_code,"BUS_CONNECT"));
 reset();fail_path=1;assert(!tf_fb_start(&s)&&!strcmp(native_failure_code,"BUS_PATH")&&stops==0);
 reset();fail_socket=1;assert(!tf_fb_start(&s)&&!strcmp(native_failure_code,"BUS_SOCKET")&&stops==0);
 reset();fail_fork=1;assert(!tf_fb_start(&s)&&!strcmp(native_failure_code,"BUS_FORK")&&stops==0);
 reset();native_failure_note("secret=1234");assert(!native_failure_code);native_failure_note("FIRST_FRAME");native_failure_note("BUS_RUNTIME");assert(!strcmp(native_failure_code,"FIRST_FRAME"));
 puts("PASS: actual parent startup/poll code; stages 1..9 each timeout at 4000ms; early FATAL/EOF; bad ordering; setup failures; first safe code survives stop/reset; no external service execution");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-startup-diagnostics.c",$prefix+"`n"+$failure+"`n"+$poll+"`n"+$start+"`n"+$suffix)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror "-I$root" "$root/build-preview/test-startup-diagnostics.c" -o "$root/bin/test-startup-diagnostics.exe"
if($LASTEXITCODE-ne0){throw 'Startup diagnostic test compile failed'}
& "$root/bin/test-startup-diagnostics.exe"
if($LASTEXITCODE-ne0){throw 'Startup diagnostic tests failed'}
$drm=[IO.File]::ReadAllText("$root/upstream/src/drm_disp.c")
$drm=$drm.Substring($drm.IndexOf('int drm_disp_dirty('),$drm.IndexOf('void drm_disp_close(')-$drm.IndexOf('int drm_disp_dirty('))
$drmTest=@'
#include <assert.h>
#include <errno.h>
#include <string.h>
#include <stdio.h>
#include "drm_disp.h"
#include "drm_uapi.h"
static int error,submissions;
static int xioctl(int fd,unsigned long request,void*arg){assert(fd==4&&request==DRM_IOCTL_MODE_DIRTYFB);struct drm_mode_fb_dirty_cmd*d=arg;assert(d->fb_id==8&&d->num_clips==1);submissions++;errno=error;return error?-1:0;}
'@
$drmEnd=@'
int main(void){drm_disp_t d={0};d.fd=4;d.fb_id=8;d.width=320;d.height=480;
 error=EINVAL;assert(drm_disp_dirty(&d,0,0,319,479)==-EINVAL);error=ENOSYS;assert(drm_disp_dirty(&d,0,0,319,479)==-ENOSYS);error=EIO;assert(drm_disp_dirty(&d,0,0,319,479)==-EIO);error=0;assert(!drm_disp_dirty(&d,0,0,319,479)&&submissions==4);assert(drm_disp_dirty(&d,5,0,0,0)==-EINVAL&&submissions==4);puts("PASS: actual DIRTYFB wrapper never converts unsupported/invalid/IO failures into frame readiness");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-dirty-barrier.c",$drmTest+"`n"+$drm+"`n"+$drmEnd)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror "-I$root/upstream/include" "$root/build-preview/test-dirty-barrier.c" -o "$root/bin/test-dirty-barrier.exe"
if($LASTEXITCODE-ne0){throw 'Dirty barrier test compile failed'}
& "$root/bin/test-dirty-barrier.exe"
if($LASTEXITCODE-ne0){throw 'Dirty barrier tests failed'}
foreach($file in @('display_runtime.h','display_native.h','topflow_main.c')){if([IO.File]::ReadAllText("$root/$file").Contains('is_suspended_enter')){throw 'Read-to-clear node remains in production runtime'}}
Write-Output 'PASS: preflight and runtime contain no read-to-clear event path'
$record=[IO.File]::ReadAllText("$root/native_failure.h");$record=$record.Substring($record.IndexOf('static const char*native_failure_code;'));$record=$record.Substring(0,$record.LastIndexOf('#endif'))
$recordPrefix=@'
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>
#define open test_open
#define fstat test_fstat
#define close test_close
typedef long long ssize_t;
enum{O_RDONLY=0,O_DIRECTORY=65536,O_CLOEXEC=524288,O_NOFOLLOW=131072,O_WRONLY=1,O_CREAT=64,O_NONBLOCK=2048};
static int bad_dir,bad_file,symlink_,fail_write,eintr_,writes,truncates;static char written[128];
static int open(const char*path,int flags){assert(!strcmp(path,"/tmp/topflow-screen")&&flags==(O_RDONLY|O_DIRECTORY|O_CLOEXEC|O_NOFOLLOW));return 10;}
static int openat(int fd,const char*path,int flags,int mode){assert(fd==10&&!strcmp(path,"renderer.failure")&&flags==(O_WRONLY|O_CREAT|O_CLOEXEC|O_NOFOLLOW|O_NONBLOCK)&&mode==0600);if(symlink_){errno=ELOOP;return-1;}return 11;}
static int fstat(int fd,struct stat*s){memset(s,0,sizeof *s);s->st_mode=fd==10?S_IFDIR|0700:S_IFREG|0600;s->st_nlink=1;s->st_uid=0;
 int bad=fd==10?bad_dir:bad_file;if(bad==1)s->st_uid=1;else if(bad==2)s->st_mode|=0004;else if(bad==3)s->st_mode=S_IFIFO|0600;else if(bad==4)s->st_nlink=2;else if(bad==5)s->st_size=129;return 0;}
static int close(int fd){assert(fd==10||fd==11);return 0;}
static ssize_t pwrite(int fd,const void*p,size_t n,int offset){assert(fd==11&&offset==0&&n<64);if(eintr_){eintr_=0;errno=EINTR;return-1;}writes++;memcpy(written,p,n);written[n]=0;return fail_write?(ssize_t)n-1:(ssize_t)n;}
static int ftruncate(int fd,int n){assert(fd==11&&n>0&&n<64);truncates++;return 0;}
'@
$recordSuffix=@'
static void reset(void){bad_dir=bad_file=symlink_=fail_write=eintr_=writes=truncates=0;written[0]=0;native_failure_code=NULL;}
int main(void){reset();native_failure_publish();assert(!writes);native_failure_note("PIN_PROTECT");native_failure_publish();assert(writes==1&&truncates==1&&!strcmp(written,"TF_NATIVE_FAILURE_V1 PIN_PROTECT\n"));
 for(int i=1;i<=3;i++){reset();bad_dir=i;native_failure_note("BUS_CONNECT");native_failure_publish();assert(!writes&&!truncates);}
 for(int i=1;i<=5;i++){reset();bad_file=i;native_failure_note("BUS_CONNECT");native_failure_publish();assert(!writes&&!truncates);}
 reset();symlink_=1;native_failure_note("BUS_CONNECT");native_failure_publish();assert(!writes&&!truncates);
 reset();eintr_=1;native_failure_note("BUS_OBJECT");native_failure_publish();assert(writes==1&&truncates==1);
 reset();fail_write=1;native_failure_note("BUS_OBJECT");native_failure_publish();assert(writes==1&&!truncates);
 puts("PASS: actual failure publisher validates owned directory/file, permissions/type/link count/size, NOFOLLOW, bounded exact record, EINTR and short-write; never saves stderr or payloads");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-failure-record.c",$recordPrefix+"`n"+$record+"`n"+$recordSuffix)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror "$root/build-preview/test-failure-record.c" -o "$root/bin/test-failure-record.exe"
if($LASTEXITCODE-ne0){throw 'Failure record test compile failed'}
& "$root/bin/test-failure-record.exe"
if($LASTEXITCODE-ne0){throw 'Failure record tests failed'}
