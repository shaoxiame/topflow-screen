$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$native=[IO.File]::ReadAllText("$root/pin_native.h")
$functions=$native.Substring($native.IndexOf('static int pin_boot_shape'),$native.IndexOf('static int pin_native_poll')-$native.IndexOf('static int pin_boot_shape'))
$source=@'
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include "pin_policy.h"
typedef long long ssize_t;
#define O_CREAT 1
#define O_EXCL 2
#define O_RDWR 4
#define O_CLOEXEC 8
#define O_NOFOLLOW 16
#define LOCK_EX 1
#define LOCK_NB 2
#define PR_SET_DUMPABLE 4
#define S_ISREG(m) (((m)&0100000)!=0)
struct stat {int st_mode,st_uid,st_nlink;long long st_size;};
static struct stat file_stat;
static tf_pin_policy pin_policy;
static int pin_state_fd=-1,exists,open_calls,symlink,lock_failure,write_failure,truncate_failure,sync_failure,boot_read_failure,boot_invalid;
static int pin_fault,protect_calls,protect_failure;
static char pin_boot[37],file_data[256];
static const char*failure_code;
static void native_failure_note(const char*code){assert(code&&*code);if(!failure_code)failure_code=code;}
static uint64_t pin_now(void){return 1000;}
static int display_read_text(const char*path,char*out,size_t cap){assert(!strcmp(path,"/proc/sys/kernel/random/boot_id"));if(boot_read_failure)return 0;snprintf(out,cap,"%s",boot_invalid?"invalid\n":"00000000-0000-0000-0000-000000000001\n");return 1;}
static int open(const char*path,int flags,...){assert(!strcmp(path,"/tmp/topflow-screen/pin-state"));assert(flags&O_NOFOLLOW);assert(flags&O_CLOEXEC);open_calls++;if(flags&O_EXCL){if(exists){errno=EEXIST;return-1;}exists=1;return 10;}if(symlink){errno=ELOOP;return-1;}return 10;}
static int fstat(int fd,struct stat*out){assert(fd==10);*out=file_stat;return 0;}
static int flock(int fd,int flags){assert(fd==10&&flags==(LOCK_EX|LOCK_NB));return lock_failure?-1:0;}
static ssize_t pread(int fd,char*out,size_t cap,long long offset){assert(fd==10&&!offset);size_t n=strlen(file_data);if(n>cap)n=cap;memcpy(out,file_data,n);return(ssize_t)n;}
static ssize_t pwrite(int fd,const char*in,size_t n,long long offset){assert(fd==10&&!offset&&n<128);if(write_failure)return(ssize_t)n-1;memcpy(file_data,in,n);file_data[n]=0;return(ssize_t)n;}
static int ftruncate(int fd,int n){assert(fd==10&&n<128);return truncate_failure?-1:0;}
static int fsync(int fd){assert(fd==10);return sync_failure?-1:0;}
static int prctl(int option,int value){assert(option==PR_SET_DUMPABLE&&value==0);protect_calls++;return protect_failure?-1:0;}
static int mlock(const void*ptr,size_t size){assert(ptr==&pin_policy&&size==sizeof pin_policy);protect_calls++;return protect_failure?-1:0;}
FUNCTIONS
static void reset(void){file_stat=(struct stat){0100600,0,1,0};exists=open_calls=symlink=lock_failure=write_failure=truncate_failure=sync_failure=boot_read_failure=boot_invalid=0;pin_fault=protect_calls=protect_failure=0;failure_code=NULL;file_data[0]=0;pin_state_fd=-1;memset(&pin_policy,0,sizeof pin_policy);}
static void record(void){exists=1;strcpy(file_data,"TFPIN1 00000000-0000-0000-0000-000000000001 4 299000\n");file_stat.st_size=strlen(file_data);}
static void refused(const char*code){assert(!pin_open_state());assert(failure_code&&!strcmp(failure_code,code));}
int main(void){reset();assert(pin_open_state()&&pin_policy.locked&&pin_policy.deadline==301000&&pin_policy.handover_wait&&open_calls==1&&!failure_code);assert(strlen(file_data)<128&&!strstr(file_data,"2026"));reset();record();assert(pin_open_state()&&pin_policy.failures==4&&pin_policy.deadline==301000&&open_calls==2&&!failure_code);
 reset();boot_read_failure=1;protect_failure=1;assert(pin_native_init(0)&&!pin_policy.enabled&&!pin_policy.locked&&!pin_policy.deadline&&!pin_fault&&open_calls==0&&protect_calls==0&&!failure_code);assert(pin_store()&&open_calls==0);tf_pin_lock(&pin_policy);assert(!pin_policy.locked);
 reset();assert(!pin_native_init(-1)&&pin_policy.locked&&open_calls==0&&protect_calls==0&&!strcmp(failure_code,"ADOPT_PIN_POLICY"));reset();assert(!pin_native_init(2)&&pin_policy.locked&&open_calls==0&&protect_calls==0&&!strcmp(failure_code,"ADOPT_PIN_POLICY"));
 reset();assert(pin_native_init(1)&&pin_policy.enabled&&pin_policy.locked&&pin_policy.handover_wait&&protect_calls==2&&open_calls==1&&!failure_code);reset();protect_failure=1;assert(!pin_native_init(1)&&pin_policy.locked&&open_calls==0&&!strcmp(failure_code,"PIN_PROTECT"));
 reset();boot_read_failure=1;refused("PIN_BOOT_ID");assert(open_calls==0);reset();boot_invalid=1;refused("PIN_BOOT_ID");assert(open_calls==0);
 reset();record();symlink=1;refused("PIN_STATE_OPEN");reset();file_stat.st_nlink=2;refused("PIN_STATE_INVALID");reset();file_stat.st_mode=0100644;refused("PIN_STATE_INVALID");reset();file_stat.st_mode=0040600;refused("PIN_STATE_INVALID");reset();file_stat.st_uid=1000;refused("PIN_STATE_INVALID");reset();file_stat.st_size=128;refused("PIN_STATE_INVALID");reset();lock_failure=1;refused("PIN_STATE_INVALID");
 reset();exists=1;refused("PIN_STATE_INVALID");reset();record();file_data[8]=0;refused("PIN_STATE_INVALID");reset();record();strcpy(file_data,"TFPIN1 00000000-0000-0000-0000-000000000001 4 999000\n");refused("PIN_STATE_INVALID");reset();record();strcpy(file_data,"TFPIN1 00000000-0000-0000-0000-000000000002 4 999000\n");assert(pin_open_state()&&pin_policy.deadline==301000&&pin_policy.failures==0&&!failure_code);
 reset();write_failure=1;refused("PIN_STATE_STORE");reset();truncate_failure=1;refused("PIN_STATE_STORE");reset();sync_failure=1;refused("PIN_STATE_STORE");
 puts("PASS: no-PIN init performs no state access and stays unlocked; unknown policy rejected; enabled PIN protected; restart state; link/hardlink/owner/mode/lock/oversize rejection; corrupt state fail closed; reboot quarantine; partial write/truncate/fsync failure; exact failure codes; no credential in persistence");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-pin-storage.c",$source.Replace('FUNCTIONS',$functions))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-pin-storage.c" -o "$root/bin/test-pin-storage.exe"
if($LASTEXITCODE -ne 0){throw 'PIN storage test build failed'}
& "$root/bin/test-pin-storage.exe"
if($LASTEXITCODE -ne 0){throw 'PIN storage tests failed'}
