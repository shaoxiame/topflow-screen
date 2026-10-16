/* Scoped, expiring transition guard. No vendor locks are changed.
 * Linux v5.15 Documentation/ABI/testing/sysfs-power and kernel/power/wakelock.c.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_FACTORY_GUARD_H
#define TF_FACTORY_GUARD_H
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include <limits.h>

enum tf_guard_resource { TF_GUARD_ACTIVE=1,TF_GUARD_ACQUIRE=2,TF_GUARD_RELEASE=3 };
typedef struct {
 void*context;
 int (*read_active)(void*,char*,size_t);
 int (*write_fixed)(void*,enum tf_guard_resource,const char*,size_t);
} tf_guard_io;
typedef struct {
 char name[80];tf_guard_io io;int valid,attempted,held;
} tf_factory_guard;
#define TF_GUARD_TIMEOUT_NS "10000000000"
#define TF_IDLE_TIMEOUT_NS "180000000000"

static int tf_guard_make_name(char*out,size_t size,long pid,uint64_t birth){
 if(!out||pid<=1||pid>INT_MAX||!birth)return 0;
 int n=snprintf(out,size,"topflow_screen_%ld_%llu",pid,(unsigned long long)birth);
 return n>0&&(size_t)n<size;
}
static int tf_guard_init(tf_factory_guard*g,long pid,uint64_t birth,tf_guard_io io){
 memset(g,0,sizeof *g);g->io=io;
 g->valid=io.read_active&&io.write_fixed&&tf_guard_make_name(g->name,sizeof g->name,pid,birth);return g->valid;
}
static int tf_guard_token_present(const char*text,const char*name){
 if(!text||!name||!*name)return -1;size_t wanted=strlen(name);
 while(*text){while(isspace((unsigned char)*text))text++;const char*start=text;while(*text&&!isspace((unsigned char)*text))text++;
  if((size_t)(text-start)==wanted&&!memcmp(start,name,wanted))return 1;
 }return 0;
}
static int tf_guard_observe(tf_factory_guard*g,const char*name){
 if(!g||!g->valid)return -1;char active[8192];
 int n=g->io.read_active(g->io.context,active,sizeof active);
 if(n<0||(size_t)n>=sizeof active)return -1;
 active[n]=0;return tf_guard_token_present(active,name);
}
/* No indefinite form is exposed, and no periodic refresh occurs here. */
static int tf_guard_acquire_timeout(tf_factory_guard*g,int seconds){
 if(seconds!=10&&seconds!=180)return 0;
 if(!g||!g->valid)return 0;char request[112];
 int n=snprintf(request,sizeof request,"%s %s\n",g->name,seconds==180?TF_IDLE_TIMEOUT_NS:TF_GUARD_TIMEOUT_NS);
 if(n<=0||(size_t)n>=sizeof request)return 0;
 g->attempted=1;
 if(!g->io.write_fixed(g->io.context,TF_GUARD_ACQUIRE,request,(size_t)n))return 0;
 int observed=tf_guard_observe(g,g->name);g->held=observed==1;return g->held;
}
static int tf_guard_acquire(tf_factory_guard*g){return tf_guard_acquire_timeout(g,10);}
static int tf_guard_release(tf_factory_guard*g){
 if(!g||!g->valid)return 0;if(!g->attempted)return 1;
 int observed=tf_guard_observe(g,g->name);if(observed<0)return 0;
 if(observed){char request[88];int n=snprintf(request,sizeof request,"%s\n",g->name);
  if(n<=0||(size_t)n>=sizeof request||!g->io.write_fixed(g->io.context,TF_GUARD_RELEASE,request,(size_t)n))return 0;
  if(tf_guard_observe(g,g->name)!=0)return 0;
 }
 g->held=g->attempted=0;return 1;
}
static int tf_guard_starttime(const char*stat_line,uint64_t*out){
 if(!stat_line||!out)return 0;const char*p=strrchr(stat_line,')');if(!p)return 0;p++;
 for(int field=0;field<20;field++){
  while(*p==' ')p++;if(!*p)return 0;const char*start=p;while(*p&&*p!=' '&&*p!='\n')p++;
  if(field==19){char value[24];size_t n=(size_t)(p-start);if(!n||n>=sizeof value)return 0;
   for(size_t i=0;i<n;i++)if(start[i]<'0'||start[i]>'9')return 0;
   memcpy(value,start,n);value[n]=0;errno=0;char*end;unsigned long long v=strtoull(value,&end,10);
   if(errno||*end||!v)return 0;*out=(uint64_t)v;return 1;
  }
 }return 0;
}

#ifdef __linux__
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/vfs.h>
static int tf_guard_open_sysfs(const char*path,int flags){
 int fd=open(path,flags|O_CLOEXEC|O_NOFOLLOW);if(fd<0)return -1;
 struct stat st;struct statfs fs;
 if(fstat(fd,&st)||!S_ISREG(st.st_mode)||fstatfs(fd,&fs)||fs.f_type!=0x62656572){close(fd);return -1;}
 return fd;
}
static int tf_guard_linux_read(void*context,char*buffer,size_t capacity){
 (void)context;if(capacity<2)return -1;
 int fd=tf_guard_open_sysfs("/sys/power/wake_lock",O_RDONLY);if(fd<0)return -1;
 ssize_t n;do{n=read(fd,buffer,capacity-1);}while(n<0&&errno==EINTR);
 int saved=errno;close(fd);errno=saved;
 if(n<0||(size_t)n==capacity-1)return -1;return (int)n;
}
static int tf_guard_linux_write(void*context,enum tf_guard_resource resource,const char*buffer,size_t size){
 (void)context;const char*path=resource==TF_GUARD_ACQUIRE?"/sys/power/wake_lock":resource==TF_GUARD_RELEASE?"/sys/power/wake_unlock":NULL;
 if(!path||size==0||size>111)return 0;
 int fd=tf_guard_open_sysfs(path,O_WRONLY);if(fd<0)return 0;
 ssize_t n;do{n=write(fd,buffer,size);}while(n<0&&errno==EINTR);
 int saved=errno;int result=close(fd);errno=saved;return n==(ssize_t)size&&result==0;
}
/* Read-only construction. Acquiring/releasing requires explicit calls above. */
static int tf_guard_linux_current(tf_factory_guard*g){
 char buffer[4096];int fd=open("/proc/self/stat",O_RDONLY|O_CLOEXEC|O_NOFOLLOW);if(fd<0)return 0;
 ssize_t n=read(fd,buffer,sizeof buffer-1);close(fd);if(n<=0||(size_t)n==sizeof buffer-1)return 0;buffer[n]=0;
 uint64_t birth;if(!tf_guard_starttime(buffer,&birth))return 0;
 tf_guard_io io={NULL,tf_guard_linux_read,tf_guard_linux_write};return tf_guard_init(g,(long)getpid(),birth,io);
}
#endif
#endif
