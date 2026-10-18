/* Read-only OEM power state. A quick-boot preference is not a power state.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_FACTORY_POWER_STATE_H
#define TF_FACTORY_POWER_STATE_H
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <sys/stat.h>
#include <ctype.h>
enum tf_factory_power { TF_FACTORY_POWER_UNKNOWN=0,TF_FACTORY_POWER_ON=1,TF_FACTORY_POWER_OFF=2 };
/* UCI's simple generated tokens only: reject unfinished quotes, escaped or
 * overlong values and duplicate options instead of guessing a boot state. */
static int tf_power_token(const char**cursor,const char*end,char*out,size_t cap){
 const char*p=*cursor;size_t n=0;while(p<end&&isspace((unsigned char)*p))p++;
 if(p==end||*p=='#'){*cursor=end;out[0]=0;return 0;}
 char quote=(*p=='\''||*p=='"')?*p++:0;int closed=!quote;
 while(p<end){char c=*p;if(quote&&c==quote){p++;closed=1;break;}if(!quote&&(isspace((unsigned char)c)||c=='#'))break;
  if(c=='\\'||c=='\''||c=='"'||(unsigned char)c<32||n+1>=cap)return -1;out[n++]=c;p++;
 }
 if(!closed||(!n&&!quote)||(p<end&&!isspace((unsigned char)*p)&&*p!='#'))return -1;
 out[n]=0;*cursor=p;return 1;
}
static int tf_factory_power_parse(const char*raw,size_t size){
 if(!raw||!size||size>32768||memchr(raw,0,size)||raw[size-1]!='\n')return TF_FACTORY_POWER_UNKNOWN;
 int in_mode=0,sections=0,found=0,state=TF_FACTORY_POWER_UNKNOWN;const char*p=raw,*end=raw+size;
 while(p<end){const char*e=memchr(p,'\n',(size_t)(end-p));if(!e)return TF_FACTORY_POWER_UNKNOWN;
  const char*q=p;char kind[32],key[96],value[128],extra[4];int first=tf_power_token(&q,e,kind,sizeof kind);p=e+1;
  if(first<0)return TF_FACTORY_POWER_UNKNOWN;if(!first)continue;
  if(strcmp(kind,"config")&&strcmp(kind,"option"))continue;
  if(tf_power_token(&q,e,key,sizeof key)!=1)return TF_FACTORY_POWER_UNKNOWN;
  if(!strcmp(kind,"option")&&(!in_mode||strcmp(key,"mode_main_state")))continue;
  if(tf_power_token(&q,e,value,sizeof value)!=1||tf_power_token(&q,e,extra,sizeof extra)!=0)return TF_FACTORY_POWER_UNKNOWN;
  if(!strcmp(kind,"config")){in_mode=!strcmp(value,"mode");if(in_mode&&++sections>1)return TF_FACTORY_POWER_UNKNOWN;continue;}
  if(!in_mode||strcmp(key,"mode_main_state"))continue;if(found++)return TF_FACTORY_POWER_UNKNOWN;
  if(!strcmp(value,"mode_power_on")||!strcmp(value,"mode_power_on_charger"))state=TF_FACTORY_POWER_ON;
  else if(!strcmp(value,"mode_power_off")||!strncmp(value,"mode_power_off_",15))state=TF_FACTORY_POWER_OFF;
 }
 return found==1?state:TF_FACTORY_POWER_UNKNOWN;
}
/* Only this fixed existing file is read in production. No UCI command,
 * filesystem writes, consumable kernel events or logging. File rewrites are
 * unknown unless one complete bounded snapshot has stable metadata. */
static int tf_factory_power_read_path(const char*path){
 char raw[32769];struct stat before,after,current;FILE*f=fopen(path,"rb");if(!f)return TF_FACTORY_POWER_UNKNOWN;
 int fd=fileno(f),okay=fstat(fd,&before)==0&&S_ISREG(before.st_mode)&&before.st_size>0&&before.st_size<=32768;
 size_t n=okay?fread(raw,1,sizeof raw-1,f):0;
 okay=okay&&!ferror(f)&&feof(f)&&fstat(fd,&after)==0;fclose(f);
 if(!okay||stat(path,&current)||n!=(size_t)before.st_size||before.st_dev!=after.st_dev||before.st_ino!=after.st_ino||before.st_size!=after.st_size||before.st_mtime!=after.st_mtime||before.st_ctime!=after.st_ctime||after.st_size!=current.st_size||after.st_mtime!=current.st_mtime||after.st_ctime!=current.st_ctime)return TF_FACTORY_POWER_UNKNOWN;
#ifdef __linux__
 if(after.st_dev!=current.st_dev||after.st_ino!=current.st_ino)return TF_FACTORY_POWER_UNKNOWN;
 if(before.st_mtim.tv_nsec!=after.st_mtim.tv_nsec||before.st_ctim.tv_nsec!=after.st_ctim.tv_nsec||after.st_mtim.tv_nsec!=current.st_mtim.tv_nsec||after.st_ctim.tv_nsec!=current.st_ctim.tv_nsec)return TF_FACTORY_POWER_UNKNOWN;
#endif
 return tf_factory_power_parse(raw,n);
}
/* A non-ON sample cancels the current transaction even if a later read is ON.
 * Only the main loop clears interrupted, after discarding stale input. */
typedef struct{int observed,off_latched,sampled,interrupted;uint32_t sampled_at;}tf_factory_power_watch;
static int tf_factory_power_due(const tf_factory_power_watch*p,uint32_t now){return !p->sampled||(uint32_t)(now-p->sampled_at)>=(p->off_latched?1000u:250u);}
static void tf_factory_power_observe(tf_factory_power_watch*p,int state,uint32_t now){p->sampled=1;p->sampled_at=now;p->observed=state;if(state!=TF_FACTORY_POWER_ON)p->interrupted=1;if(state==TF_FACTORY_POWER_OFF)p->off_latched=1;}
static int tf_factory_power_can_use(const tf_factory_power_watch*p){return p->sampled&&p->observed==TF_FACTORY_POWER_ON&&!p->off_latched&&!p->interrupted;}
#endif
