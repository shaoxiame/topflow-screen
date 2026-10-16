/* Optional local lock wallpaper. Fixed RGB565 only; no image parser, writes or
 * background worker. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_LOCK_WALLPAPER_H
#define TF_LOCK_WALLPAPER_H
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#ifndef TF_WALLPAPER_TEST_SYSTEM
#include <errno.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#endif
#define TF_WALLPAPER_WIDTH 320
#define TF_WALLPAPER_HEIGHT 480
#define TF_WALLPAPER_BYTES 307200u
#define TF_WALLPAPER_FILE_BYTES 307216u
static const unsigned char tf_wallpaper_header[16]={'T','F','W','P','5','6','5','1',0x40,0x01,0xe0,0x01,0x00,0xb0,0x04,0x00};
typedef struct {uint16_t *pixels;struct stat identity;int current,refresh;} tf_wallpaper;
static tf_wallpaper lock_wallpaper={.refresh=1};
static void tf_wallpaper_clear(tf_wallpaper*w){free(w->pixels);w->pixels=NULL;w->current=0;memset(&w->identity,0,sizeof w->identity);}
static int tf_wallpaper_same(const struct stat*a,const struct stat*b){return a->st_dev==b->st_dev&&a->st_ino==b->st_ino&&a->st_size==b->st_size&&a->st_mode==b->st_mode&&a->st_uid==b->st_uid&&a->st_nlink==b->st_nlink&&a->st_mtim.tv_sec==b->st_mtim.tv_sec&&a->st_mtim.tv_nsec==b->st_mtim.tv_nsec&&a->st_ctim.tv_sec==b->st_ctim.tv_sec&&a->st_ctim.tv_nsec==b->st_ctim.tv_nsec;}
static int tf_wallpaper_read(int fd,void*buffer,size_t length){unsigned char*p=buffer;while(length){ssize_t n=read(fd,p,length);if(n<0&&errno==EINTR)continue;if(n<=0||(size_t)n>length)return 0;p+=n;length-=(size_t)n;}return 1;}
/* Open each component through its verified directory fd, never through a
 * caller path. NONBLOCK prevents a substituted FIFO from delaying the UI. */
static int tf_wallpaper_open(void){
 const char*parts[]={"data","plugins","topflow-screen"};struct stat st;
 int dir=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC|O_NOFOLLOW);if(dir<0)return -1;
 for(unsigned i=0;i<sizeof parts/sizeof parts[0];i++){int next=openat(dir,parts[i],O_RDONLY|O_DIRECTORY|O_CLOEXEC|O_NOFOLLOW);close(dir);if(next<0)return -1;dir=next;if(fstat(dir,&st)||!S_ISDIR(st.st_mode)||st.st_uid!=0){close(dir);return -1;}}
 int fd=openat(dir,"lock-wallpaper.rgb565",O_RDONLY|O_CLOEXEC|O_NOFOLLOW|O_NONBLOCK);close(dir);return fd;
}
static int tf_wallpaper_load(tf_wallpaper*w){
 int fd=tf_wallpaper_open();struct stat before,after;unsigned char header[16];w->refresh=0;
 if(fd<0){tf_wallpaper_clear(w);return 0;}
 if(fstat(fd,&before)||!S_ISREG(before.st_mode)||before.st_uid!=0||before.st_nlink!=1||(before.st_mode&0022)||before.st_size!=TF_WALLPAPER_FILE_BYTES)goto invalid;
 if(w->current&&w->pixels&&tf_wallpaper_same(&w->identity,&before)){close(fd);return 1;}
 if(!tf_wallpaper_read(fd,header,sizeof header)||memcmp(header,tf_wallpaper_header,sizeof header))goto invalid;
 /* Reuse the one bounded buffer on updates; failure discards all partial data. */
 if(!w->pixels){w->pixels=malloc(TF_WALLPAPER_BYTES);if(!w->pixels)goto invalid;}
 if(!tf_wallpaper_read(fd,w->pixels,TF_WALLPAPER_BYTES)||fstat(fd,&after)||!tf_wallpaper_same(&before,&after))goto invalid;
 close(fd);w->identity=after;w->current=1;return 1;
 invalid:close(fd);tf_wallpaper_clear(w);return 0;
}
static void lock_wallpaper_invalidate(void){lock_wallpaper.refresh=1;}
static void lock_wallpaper_prepare(void){if(lock_wallpaper.refresh)tf_wallpaper_load(&lock_wallpaper);}
#endif
