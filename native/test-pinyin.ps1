$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$zig=Join-Path $root 'toolchain/zig-x86_64-windows-0.14.1/zig.exe'
$out=Join-Path $root 'build-preview'
$source=@'
#include <assert.h>
#include <stdio.h>
#include "pinyin_logic.h"
static void syllable(tf_pinyin*p,const char*s){tf_pinyin_clear(p);for(;*s;s++)assert(tf_pinyin_push(p,(unsigned char)*s));}
int main(void){
 tf_pinyin p;tf_pinyin_clear(&p);char out[32]="",c[4];
 syllable(&p,"ni");assert(tf_pinyin_count(&p)>0);assert(tf_pinyin_candidate(&p,0,c));assert(!strcmp(c,"你"));assert(tf_pinyin_commit(&p,0,out,sizeof out,20));assert(!strcmp(out,"你"));assert(!*p.letters);
 syllable(&p,"hao");assert(tf_pinyin_commit(&p,0,out,sizeof out,20));assert(!strcmp(out,"你好"));
 syllable(&p,"zhong");assert(!tf_pinyin_commit(&p,0,out,sizeof out,8));assert(!strcmp(out,"你好"));assert(!strcmp(p.letters,"zhong"));
 assert(!tf_pinyin_candidate(&p,999999,c));assert(!*c);assert(!tf_pinyin_push(&p,';'));assert(!tf_pinyin_push(&p,'x'));
 syllable(&p,"zhuang");assert(!tf_pinyin_push(&p,'a'));assert(!strcmp(p.letters,"zhuang"));tf_pinyin_backspace(&p);assert(!strcmp(p.letters,"zhuan"));assert(p.page==0);
 syllable(&p,"lv");assert(strstr(tf_pinyin_candidates(&p),"绿"));
 for(size_t i=0;i<TF_PINYIN_COUNT;i++){
  if(i)assert(strcmp(tf_pinyin_entries[i-1].syllable,tf_pinyin_entries[i].syllable)<0);
  syllable(&p,tf_pinyin_entries[i].syllable);assert(strlen(tf_pinyin_candidates(&p))%3==0);unsigned n=tf_pinyin_count(&p);assert(n>0);
  for(unsigned j=0;j<n;j++){assert(tf_pinyin_candidate(&p,j,c));assert((unsigned char)c[0]>=0xe0&&(unsigned char)c[0]<=0xef);assert(((unsigned char)c[1]&0xc0)==0x80&&((unsigned char)c[2]&0xc0)==0x80);}
 }
 puts("pinyin: Chinese composition/commit, bounded candidate paging, UTF-8 byte limits, all 402 syllables passed");
 return 0;
}
'@
$file=Join-Path $out 'test-pinyin.c'
[IO.File]::WriteAllText($file,$source,[Text.UTF8Encoding]::new($false))
$binary=Join-Path $out 'test-pinyin.exe'
& $zig cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror "-I$root" $file -o $binary
if($LASTEXITCODE -ne 0){throw 'Pinyin test compile failed'}
& $binary
if($LASTEXITCODE -ne 0){throw 'Pinyin tests failed'}
