'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),native=path.join(root,'native');
const zig=path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe');
const source=fs.readFileSync(path.join(native,'upstream/src/key_input.c'),'utf8');

function compileRun(code){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'topflow-power-key-'));
 try{
  const input=path.join(dir,'test.c'),output=path.join(dir,process.platform==='win32'?'test.exe':'test');
  fs.writeFileSync(input,code);
  const useZig=process.platform==='win32';
  const build=cp.spawnSync(useZig?zig:(process.env.CC||'cc'),[
   ...(useZig?['cc','-target','x86_64-windows-gnu']:[]),'-std=c11','-O2','-Wall','-Wextra','-Werror',
   '-UNDEBUG','-I'+native,'-I'+path.join(native,'upstream/include'),input,'-o',output],{encoding:'utf8'});
  assert.equal(build.status,0,build.error?.message||build.stderr);
  const run=cp.spawnSync(output,[],{encoding:'utf8'});
  assert.equal(run.status,0,run.error?.message||run.stdout+run.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('power key reducer preserves threshold, queued timestamps, repeats, resync and initial-held safety',()=>{
 compileRun(String.raw`
#include <assert.h>
#include "key_press.h"
static tf_key_press_t s;
static int key(int value,uint32_t event_ms,uint32_t now_ms){return tf_key_press_event(&s,1,116,value,event_ms,1,1,now_ms);}
static void up(void){tf_key_press_baseline(&s,0);}
int main(void){
 assert(KEY_LONG_MS==1200);
 up();assert(key(1,100,100)==KEY_EV_NONE);
 assert(tf_key_press_tick(&s,1299)==KEY_EV_NONE);
 assert(key(0,1299,1299)==KEY_EV_SHORT);
 assert(key(0,1300,1300)==KEY_EV_NONE);
 up();key(1,100,100);assert(key(0,1300,1300)==KEY_EV_LONG);
 assert(tf_key_press_tick(&s,5000)==KEY_EV_NONE);
 up();key(1,100,100);assert(tf_key_press_tick(&s,1300)==KEY_EV_LONG);
 assert(tf_key_press_tick(&s,1301)==KEY_EV_NONE);
 assert(key(0,1400,1400)==KEY_EV_NONE);

 /* Repeated down and kernel autorepeat do not restart or duplicate a hold. */
 up();key(1,100,100);assert(key(1,900,900)==KEY_EV_NONE);
 assert(key(2,1100,1100)==KEY_EV_NONE);
 assert(tf_key_press_tick(&s,1300)==KEY_EV_LONG);
 key(1,1400,1400);key(2,1500,1500);
 assert(tf_key_press_tick(&s,4000)==KEY_EV_NONE);
 assert(key(0,4100,4100)==KEY_EV_NONE);
 assert(key(1,5000,5000)==KEY_EV_NONE);
 assert(key(0,5100,5100)==KEY_EV_SHORT);

 /* Both edges may have accumulated during a slow HTTP response. */
 up();key(1,100,5000);assert(key(0,1300,5000)==KEY_EV_LONG);
 up();key(1,100,5000);assert(key(0,1299,5000)==KEY_EV_SHORT);
 up();key(1,100,5000);assert(tf_key_press_tick(&s,5000)==KEY_EV_LONG);
 /* Legacy realtime timestamps still measure queued press/release duration. */
 up();tf_key_press_event(&s,1,116,1,100000,1,0,5000);
 assert(tf_key_press_tick(&s,5000)==KEY_EV_NONE);
 assert(tf_key_press_event(&s,1,116,0,101200,1,0,5000)==KEY_EV_LONG);

 /* Initial or resynchronised held/unknown state must be released first. */
 for(int held=-1;held<=1;held+=2){
  tf_key_press_baseline(&s,held);key(1,100,100);key(2,200,200);
  assert(tf_key_press_tick(&s,6000)==KEY_EV_NONE);
  assert(key(0,6100,6100)==KEY_EV_NONE);
  key(1,7000,7000);assert(key(0,7100,7100)==KEY_EV_SHORT);
 }
 up();key(1,100,100);
 assert(tf_key_press_event(&s,0,3,0,200,1,1,200)==KEY_EV_NONE);
 assert(s.sync_lost&&!s.baseline_needed);
 assert(key(0,1400,1400)==KEY_EV_NONE);
 assert(key(1,1500,1500)==KEY_EV_NONE);
 assert(tf_key_press_tick(&s,9000)==KEY_EV_NONE);
 tf_key_press_event(&s,0,0,0,9000,1,1,9000);
 assert(s.sync_lost&&s.baseline_needed);
 tf_key_press_baseline(&s,1);assert(!s.sync_lost&&!s.baseline_needed);
 assert(key(0,10000,10000)==KEY_EV_NONE);
 key(1,11000,11000);assert(key(0,12200,12200)==KEY_EV_LONG);

 /* Unrelated keys, malformed clocks and backward timestamps are inert. */
 up();assert(tf_key_press_event(&s,1,115,1,100,1,1,100)==KEY_EV_NONE);
 assert(tf_key_press_tick(&s,2000)==KEY_EV_NONE);
 assert(key(2,2100,2100)==KEY_EV_NONE);
 assert(key(0,2200,2200)==KEY_EV_NONE);
 assert(tf_key_press_event(&s,1,116,1,100,0,1,100)==KEY_EV_NONE);
 assert(key(0,2000,2000)==KEY_EV_NONE);
 up();key(1,1000,1000);assert(key(0,900,1500)==KEY_EV_NONE);
 up();key(1,1000,1000);
 assert(tf_key_press_event(&s,1,116,0,1200,0,1,1200)==KEY_EV_NONE);
 assert(tf_key_press_tick(&s,5000)==KEY_EV_NONE);
 /* A slightly newer event than the loop snapshot uses poll time to avoid
  * unsigned underflow, while normal 32-bit millisecond wrap stays valid. */
 up();key(1,101,100);assert(tf_key_press_tick(&s,100)==KEY_EV_NONE);
 up();uint32_t start=UINT32_MAX-600;key(1,start,start);
 assert(tf_key_press_tick(&s,start+1199)==KEY_EV_NONE);
 assert(key(0,start+1200,start+1200)==KEY_EV_LONG);
 up();key(1,start,start);assert(tf_key_press_tick(&s,start+1200)==KEY_EV_LONG);
 assert(key(0,start+1201,start+1201)==KEY_EV_NONE);
 return 0;
}
`);
});

test('production evdev reader drains queued edges and fails closed after overrun, partial reads or removal',()=>{
 // Compile the real reader, replacing only OS declarations with an in-memory
 // fd fixture. This never opens /dev/input or contacts the user's device.
 const reader=source.replace(/^#include <(?:dirent\.h|fcntl\.h|sys\/ioctl\.h|time\.h|unistd\.h)>\r?\n/gm,'');
 compileRun(String.raw`
#include <assert.h>
#include <stddef.h>
#include <stdarg.h>
#include <stdint.h>
#include <string.h>
#include <errno.h>
typedef ptrdiff_t ssize_t;
typedef struct {int unused;} DIR;
struct dirent {char d_name[32];};
#define O_RDONLY 0
#define O_NONBLOCK 0x800
#define O_CLOEXEC 0x80000
#define CLOCK_MONOTONIC 1
#define _IOC_READ 2u
#define _IOC(dir,type,nr,len) (((unsigned long)(dir)<<30)|((unsigned long)(len)<<16)|((unsigned long)(type)<<8)|(nr))
#define _IOW(type,nr,t) _IOC(1u,type,nr,sizeof(t))
static DIR *mock_opendir(const char*);
static struct dirent *mock_readdir(DIR*);
static int mock_closedir(DIR*);
static int mock_open(const char*,int);
static int mock_close(int);
static int mock_ioctl(int,unsigned long,...);
static ssize_t mock_read(int,void*,size_t);
#define opendir mock_opendir
#define readdir mock_readdir
#define closedir mock_closedir
#define open mock_open
#define close mock_close
#define ioctl mock_ioctl
#define read mock_read
PRODUCTION_READER
static DIR directory;
static struct dirent entry={"event7"};
static struct kev events[32];
static size_t cursor,count;
static int enumerated,held,clock_unavailable,key_query_failed,closed,read_failure,interrupt_once;
static DIR *mock_opendir(const char*p){assert(!strcmp(p,"/dev/input"));enumerated=0;return &directory;}
static struct dirent *mock_readdir(DIR*d){assert(d==&directory);return enumerated++?NULL:&entry;}
static int mock_closedir(DIR*d){assert(d==&directory);return 0;}
static int mock_open(const char*p,int flags){assert(!strcmp(p,"/dev/input/event7"));assert(flags==(O_RDONLY|O_NONBLOCK|O_CLOEXEC));return 42;}
static int mock_close(int fd){assert(fd==42);closed++;return 0;}
static int mock_ioctl(int fd,unsigned long req,...){
 assert(fd==42);va_list ap;va_start(ap,req);void *out=va_arg(ap,void*);va_end(ap);
 if(req==EVIOCSCLOCKID_){assert(*(int*)out==CLOCK_MONOTONIC);return clock_unavailable?-1:0;}
 unsigned long *bits=out;
 if(req==EVIOCGBIT_(0,sizeof(unsigned long))){bits[0]=1UL<<EV_KEY;return 0;}
 size_t len=((KEY_POWER/(8*sizeof(long)))+1)*sizeof(unsigned long);
 if(req==EVIOCGBIT_(EV_KEY,len)){bits[KEY_POWER/(8*sizeof(long))]|=1UL<<(KEY_POWER%(8*sizeof(long)));return 0;}
 assert(req==EVIOCGKEY_(len));if(key_query_failed)return -1;
 if(held)bits[KEY_POWER/(8*sizeof(long))]|=1UL<<(KEY_POWER%(8*sizeof(long)));
 return 0;
}
static ssize_t mock_read(int fd,void*out,size_t len){
 assert(fd==42&&len==sizeof(struct kev));
 if(interrupt_once){interrupt_once=0;errno=EINTR;return -1;}
 if(cursor<count){memcpy(out,&events[cursor++],len);return (ssize_t)len;}
 if(read_failure==1){errno=EIO;return -1;}
 if(read_failure==2)return 3;
 if(read_failure==3)return 0;
 errno=EAGAIN;return -1;
}
static void append(unsigned type,unsigned code,int value,uint32_t ms){
 assert(count<32);events[count++]=(struct kev){ms/1000,(ms%1000)*1000,type,code,value};
}
static void edge(int value,uint32_t ms){append(1,116,value,ms);}
static void reset(key_input_t*k,int down){
 cursor=count=0;held=down;clock_unavailable=key_query_failed=closed=read_failure=interrupt_once=0;
 assert(key_input_init(k)==0&&k->fd==42&&k->monotonic_clock);
}
int main(void){
 key_input_t k;
 reset(&k,0);edge(1,100);edge(0,1300);interrupt_once=1;
 assert(key_input_poll(&k,9000)==KEY_EV_LONG);
 assert(key_input_poll(&k,10000)==KEY_EV_NONE);
 reset(&k,0);edge(1,100);edge(0,1299);
 assert(key_input_poll(&k,9000)==KEY_EV_SHORT);
 reset(&k,0);edge(1,100);edge(1,1100);edge(2,1200);
 assert(key_input_poll(&k,1300)==KEY_EV_LONG);
 edge(0,1400);assert(key_input_poll(&k,1400)==KEY_EV_NONE);
 reset(&k,0);edge(1,100);edge(0,200);edge(1,500);edge(0,1700);
 assert(key_input_poll(&k,8000)==KEY_EV_LONG); /* LONG dominates old SHORT */
 reset(&k,1);edge(1,100);edge(2,200);edge(0,5000);
 assert(key_input_poll(&k,9000)==KEY_EV_NONE);
 edge(1,10000);edge(0,11200);assert(key_input_poll(&k,13000)==KEY_EV_LONG);

 reset(&k,0);edge(1,100);edge(0,200);append(0,3,0,300);edge(1,400);
 assert(key_input_poll(&k,8000)==KEY_EV_NONE&&k.press.sync_lost);
 append(0,0,0,8100);held=1;edge(0,8200);
 assert(key_input_poll(&k,8300)==KEY_EV_NONE&&!k.press.sync_lost);
 edge(1,9000);edge(0,10200);assert(key_input_poll(&k,11000)==KEY_EV_LONG);
 reset(&k,0);edge(1,100);append(0,3,0,200);append(0,0,0,300);
 key_query_failed=1;edge(1,400);edge(0,5000);
 assert(key_input_poll(&k,6000)==KEY_EV_NONE);
 key_query_failed=0;edge(1,7000);edge(0,7100);
 assert(key_input_poll(&k,8000)==KEY_EV_SHORT);

 reset(&k,0);key_query_failed=1;assert(key_input_init(&k)==0);
 edge(1,100);edge(0,2000);assert(key_input_poll(&k,3000)==KEY_EV_NONE);
 reset(&k,0);clock_unavailable=1;assert(key_input_init(&k)==0&&!k.monotonic_clock);
 edge(1,100000);edge(0,101200);assert(key_input_poll(&k,9000)==KEY_EV_LONG);
 for(int failure=1;failure<=3;failure++){
  reset(&k,0);edge(1,100);read_failure=failure;
  assert(key_input_poll(&k,5000)==KEY_EV_NONE&&k.fd==-1&&closed==1);
  assert(key_input_poll(&k,9000)==KEY_EV_NONE);
 }
 reset(&k,0);edge(1,100);events[0].usec=1000000;
 edge(0,2000);assert(key_input_poll(&k,3000)==KEY_EV_NONE);
 reset(&k,0);edge(1,100);key_input_poll(&k,200);key_input_close(&k);
 assert(k.fd==-1&&closed==1&&!k.press.pressed);
 return 0;
}
`.replace('PRODUCTION_READER',reader));
});

test('unchanged production key reader compiles for the Linux target',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'topflow-power-key-linux-'));
 try{
  const useZig=process.platform==='win32';
  const build=cp.spawnSync(useZig?zig:(process.env.CC||'cc'),[
   ...(useZig?['cc','-target','aarch64-linux-musl']:[]),'-std=c11','-D_GNU_SOURCE','-Wall','-Wextra','-Werror',
   '-I'+path.join(native,'upstream/include'),'-c',path.join(native,'upstream/src/key_input.c'),'-o',path.join(dir,'key.o')],{encoding:'utf8'});
  assert.equal(build.status,0,build.error?.message||build.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
