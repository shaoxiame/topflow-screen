/* Offline single-character Pinyin input, bounded memory, no learning/history. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_PINYIN_LOGIC_H
#define TF_PINYIN_LOGIC_H
#include <stddef.h>
#include <string.h>
#include "pinyin_data.h"
typedef struct {char letters[7];unsigned page;} tf_pinyin;
static void tf_pinyin_clear(tf_pinyin*p){memset(p,0,sizeof *p);}
static const char*tf_pinyin_candidates(const tf_pinyin*p){
 size_t lo=0,hi=TF_PINYIN_COUNT;while(lo<hi){size_t mid=lo+(hi-lo)/2;int c=strcmp(p->letters,tf_pinyin_entries[mid].syllable);if(!c)return tf_pinyin_entries[mid].characters;if(c<0)hi=mid;else lo=mid+1;}return "";
}
static int tf_pinyin_push(tf_pinyin*p,unsigned c){
 size_t n=strlen(p->letters);if(c<'a'||c>'z'||n>=6)return 0;
 p->letters[n]=(char)c;p->letters[n+1]=0;
 for(size_t i=0;i<TF_PINYIN_COUNT;i++)if(!strncmp(tf_pinyin_entries[i].syllable,p->letters,n+1)){p->page=0;return 1;}
 p->letters[n]=0;return 0;
}
static void tf_pinyin_backspace(tf_pinyin*p){size_t n=strlen(p->letters);if(n)p->letters[n-1]=0;p->page=0;}
static unsigned tf_pinyin_count(const tf_pinyin*p){return(unsigned)(strlen(tf_pinyin_candidates(p))/3);}
static int tf_pinyin_candidate(const tf_pinyin*p,unsigned index,char out[4]){
 const char*s=tf_pinyin_candidates(p);size_t n=strlen(s)/3;if(index>=n){out[0]=0;return 0;}memcpy(out,s+(size_t)index*3,3);out[3]=0;return 1;
}
static int tf_pinyin_commit(tf_pinyin*p,unsigned index,char*out,size_t cap,size_t byte_limit){
 char c[4];size_t n=strlen(out);if(!tf_pinyin_candidate(p,index,c)||n+3>byte_limit||n+3>=cap)return 0;
 memcpy(out+n,c,4);tf_pinyin_clear(p);return 1;
}
#endif
