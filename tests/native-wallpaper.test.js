'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const native=path.resolve(__dirname,'../native'),zig=path.join(native,'toolchain/zig-x86_64-windows-0.14.1/zig.exe');
function compile(source,linux=false){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'topflow-wallpaper-'));try{const input=path.join(dir,'test.c'),output=path.join(dir,linux?'test.o':'test.exe');fs.writeFileSync(input,source);const useZig=process.platform==='win32';const args=[...(useZig?['cc','-target',linux?'aarch64-linux-musl':'x86_64-windows-gnu']:[]),'-std=c11','-D_GNU_SOURCE','-O2','-UNDEBUG','-I'+native,input,...(linux?['-c']:[]),'-o',output];let result=cp.spawnSync(useZig?zig:process.env.CC||'cc',args,{encoding:'utf8'});assert.equal(result.status,0,result.error?.message||result.stderr);if(!linux){result=cp.spawnSync(output,[],{encoding:'utf8'});assert.equal(result.status,0,result.error?.message||result.stdout+result.stderr);}}finally{fs.rmSync(dir,{recursive:true,force:true});}}

test('fixed wallpaper loader rejects unsafe metadata and partial changes, caches once and never writes',()=>compile(String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#define TF_WALLPAPER_TEST_SYSTEM
typedef intptr_t ssize_t;
struct stamp{long tv_sec,tv_nsec;};
struct stat{unsigned long st_dev,st_ino,st_mode,st_uid,st_nlink;long st_size;struct stamp st_mtim,st_ctim;};
#define O_RDONLY 0
#define O_DIRECTORY 1
#define O_CLOEXEC 2
#define O_NOFOLLOW 4
#define O_NONBLOCK 8
#define S_ISDIR(m) (((m)&0170000)==0040000)
#define S_ISREG(m) (((m)&0170000)==0100000)
static unsigned char data[307216];static struct stat filemeta;
static int nextfd,opens,closes,reads,bytes,offset,file_stats,bad_directory,missing,changed,eof,interrupt_read,fail_stat;
static int open(const char*p,int flags){assert(!strcmp(p,"/")&&flags==(O_RDONLY|O_DIRECTORY|O_CLOEXEC|O_NOFOLLOW));opens++;nextfd=10;return nextfd;}
static int openat(int dir,const char*p,int flags){const char*parts[]={"data","plugins","topflow-screen","lock-wallpaper.rgb565"};int index=dir-10;assert(index>=0&&index<4&&!strcmp(p,parts[index]));assert(flags==(index==3?(O_RDONLY|O_CLOEXEC|O_NOFOLLOW|O_NONBLOCK):(O_RDONLY|O_DIRECTORY|O_CLOEXEC|O_NOFOLLOW)));if((bad_directory==index+1)||(missing&&index==3)){errno=ELOOP;return -1;}opens++;if(index==3){offset=file_stats=0;}return ++nextfd;}
static int close(int fd){assert(fd>=10&&fd<=14);closes++;return 0;}
static int fstat(int fd,struct stat*out){assert(fd>=11&&fd<=14);if(fd==14){file_stats++;if(fail_stat)return -1;*out=filemeta;if(changed&&file_stats>1)out->st_mtim.tv_nsec++;}else{memset(out,0,sizeof *out);out->st_mode=0040755;out->st_uid=bad_directory==-fd?1:0;}return 0;}
static ssize_t read(int fd,void*out,size_t n){assert(fd==14);reads++;if(interrupt_read){interrupt_read=0;errno=EINTR;return -1;}if(eof&&offset>16)return 0;if(n>8192)n=8192;if(offset+n>sizeof data)return 0;memcpy(out,data+offset,n);offset+=(int)n;bytes+=(int)n;return (ssize_t)n;}
#include "lock_wallpaper.h"
static void reset(void){tf_wallpaper_clear(&lock_wallpaper);memset(&filemeta,0,sizeof filemeta);filemeta.st_dev=1;filemeta.st_ino=22;filemeta.st_size=sizeof data;filemeta.st_mode=0100600;filemeta.st_nlink=1;filemeta.st_mtim.tv_sec=100;filemeta.st_ctim.tv_sec=100;memcpy(data,tf_wallpaper_header,16);memset(data+16,0xa5,sizeof data-16);opens=closes=reads=bytes=offset=file_stats=bad_directory=missing=changed=eof=interrupt_read=fail_stat=0;lock_wallpaper.refresh=1;}
static void balanced(void){assert(opens==closes);}
int main(void){
 reset();lock_wallpaper_prepare();assert(lock_wallpaper.current&&lock_wallpaper.pixels&&bytes==307216&&!lock_wallpaper.refresh);uint16_t*saved=lock_wallpaper.pixels;int old_reads=reads,old_opens=opens;for(int i=0;i<100;i++)lock_wallpaper_prepare();assert(reads==old_reads&&opens==old_opens);lock_wallpaper_invalidate();lock_wallpaper_prepare();assert(lock_wallpaper.current&&lock_wallpaper.pixels==saved&&reads==old_reads);balanced();
 filemeta.st_mtim.tv_nsec++;data[16]=0;lock_wallpaper_invalidate();lock_wallpaper_prepare();assert(lock_wallpaper.current&&lock_wallpaper.pixels==saved&&((unsigned char*)saved)[0]==0&&bytes==614432);balanced();
 missing=1;lock_wallpaper_invalidate();lock_wallpaper_prepare();assert(!lock_wallpaper.current&&!lock_wallpaper.pixels);balanced();
 for(int i=0;i<10;i++){reset();switch(i){case 0:filemeta.st_size--;break;case 1:filemeta.st_size++;break;case 2:filemeta.st_mode=0010600;break;case 3:filemeta.st_mode=0120600;break;case 4:filemeta.st_uid=1000;break;case 5:filemeta.st_nlink=2;break;case 6:filemeta.st_mode=0100660;break;case 7:fail_stat=1;break;case 8:filemeta.st_mode=0100602;break;case 9:filemeta.st_size=-1;break;}assert(!tf_wallpaper_load(&lock_wallpaper)&&!lock_wallpaper.pixels&&!reads);balanced();}
 for(int i=0;i<16;i++){reset();data[i]^=1;assert(!tf_wallpaper_load(&lock_wallpaper)&&!lock_wallpaper.pixels&&bytes==16);balanced();}
 for(int i=1;i<=4;i++){reset();bad_directory=i;assert(!tf_wallpaper_load(&lock_wallpaper)&&!reads);balanced();}
 for(int i=11;i<=13;i++){reset();bad_directory=-i;assert(!tf_wallpaper_load(&lock_wallpaper)&&!reads);balanced();}
 reset();changed=1;assert(!tf_wallpaper_load(&lock_wallpaper)&&!lock_wallpaper.pixels);balanced();reset();eof=1;assert(!tf_wallpaper_load(&lock_wallpaper)&&!lock_wallpaper.pixels);balanced();reset();interrupt_read=1;assert(tf_wallpaper_load(&lock_wallpaper)&&lock_wallpaper.current&&bytes==307216);balanced();tf_wallpaper_clear(&lock_wallpaper);
 puts("PASS wallpaper: fixed dimensions/header/length; directory and file ownership/link/type; bounded one-buffer cache; no per-frame reads; interrupted/partial/replaced files fail to default; no writes");return 0;
}
`));

test('wallpaper production I/O compiles unchanged for Linux',()=>compile('#include "lock_wallpaper.h"\nint main(void){lock_wallpaper_invalidate();lock_wallpaper_prepare();tf_wallpaper_clear(&lock_wallpaper);return 0;}\n',true));

test('wallpaper reads occur only at lock entry and renderer isolates it from other pages',()=>{
 const main=fs.readFileSync(path.join(native,'topflow_main.c'),'utf8'),loader=fs.readFileSync(path.join(native,'lock_wallpaper.h'),'utf8'),renderer=fs.readFileSync(path.join(native,'upstream/src/html_view.cpp'),'utf8');
 assert.match(main,/screen_lock\(void\)\{power_menu_reset\(\);lock_wallpaper_invalidate\(\)/);
 assert.match(main,/lock_dashboard_prepare\(void\)\{lock_wallpaper_prepare\(\);html_view_set_lock_wallpaper/);
 assert.match(main,/cleanup:html_view_set_lock_wallpaper\(NULL\);tf_wallpaper_clear/);
 assert.doesNotMatch(loader,/\b(?:write|pwrite|fwrite|rename|unlink|system|popen|pthread_create|printf|fprintf)\s*\(/);
 assert.match(renderer,/g_lock_wallpaper && g_w == 320 && g_h == 480 && g_doc && g_doc->root\(\) &&\s*g_doc->root\(\)->select_one\("body.tf-wallpaper"\)/);
 assert.doesNotMatch(renderer,/stbi_load|jpeg_read|png_read/);
});
