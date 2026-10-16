$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$escape=[regex]::Match($main,'(?m)^static void esc\([^\r\n]+').Value
$begin=$main.IndexOf('static char smslist[')
$finish=$main.IndexOf('static const char *lookup(')
if(!$escape -or $begin -lt 0 -or $finish -lt $begin){throw 'SMS source boundaries changed'}
$code=@'
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "data.h"
#include "sms_logic.h"
static devui_data_t state;
static int sms_filter;
ESCAPE
IMPLEMENTATION
int main(int argc,char**argv){assert(argc==2);state.sms_n=5;for(int i=0;i<5;i++){state.sms[i].id=100+i;state.sms[i].tag=i==4?-1:i;state.sms[i].unread=i==1;snprintf(state.sms[i].num,sizeof state.sms[i].num,"10086");snprintf(state.sms[i].date,sizeof state.sms[i].date,"10-16 08:00");snprintf(state.sms[i].text,sizeof state.sms[i].text,"本机分类预览 %d · <内容不会成为标签>",i);}for(sms_filter=0;sms_filter<4;sms_filter++){build_sms();assert(!strstr(smslist,"<内容")&&strstr(smslist,"&lt;内容"));for(int i=0;i<5;i++){char key[40];snprintf(key,sizeof key,"href='act:sms:%d'",100+i);assert((strstr(smslist,key)!=NULL)==tf_sms_filter_match(sms_filter,state.sms[i].tag,state.sms[i].unread));}char path[4096];snprintf(path,sizeof path,"%s/sms-filter-%d.part",argv[1],sms_filter);FILE*f=fopen(path,"wb");assert(f);fwrite(smslist,1,strlen(smslist),f);fclose(f);}state.sms_n=DEVUI_SMS_MAX;for(int i=0;i<DEVUI_SMS_MAX;i++){state.sms[i].tag=1;memset(state.sms[i].text,'<',DEVUI_SMS_TEXT_MAX-1);state.sms[i].text[DEVUI_SMS_TEXT_MAX-1]=0;}sms_filter=0;build_sms();assert(strlen(smslist)<sizeof smslist&&strstr(smslist,"最多显示 32 条"));puts("PASS: actual SMS renderer tag filters, unknown direction, escaped content, maximum snapshot bounds");return 0;}
'@
$code=$code.Replace('ESCAPE',$escape).Replace('IMPLEMENTATION',$main.Substring($begin,$finish-$begin))
[IO.File]::WriteAllText("$root/build-preview/test-sms-layout.c",$code)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/build-preview/test-sms-layout.c" -o "$root/bin/test-sms-layout.exe"
if($LASTEXITCODE -ne 0){throw 'SMS layout test build failed'}
& "$root/bin/test-sms-layout.exe" "$root/preview"
if($LASTEXITCODE -ne 0){throw 'SMS layout test failed'}
$template=[IO.File]::ReadAllText("$root/ui/subpages/sms.html")
for($filter=0;$filter -lt 4;$filter++){
 foreach($theme in @('light','dark')){
  $html=$template.Replace('{{SMSLIST}}',[IO.File]::ReadAllText("$root/preview/sms-filter-$filter.part")).Replace('{{THEME}}',$theme).Replace('{{TIME}}','08:00').Replace('{{DATASTATE}}','本机预览').Replace('{{BAT}}','81').Replace('{{TOAST}}','筛选仅作用于当前服务快照')
  [IO.File]::WriteAllText("$root/preview/sms-filter-$filter-$theme.html",$html)
 }
}
