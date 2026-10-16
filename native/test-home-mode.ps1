$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$functions=@('static int valid_page(', 'static void change_page(', 'static void sync_home_page(', 'static int current_main_page(') | ForEach-Object {
 $prefix=$_; $lines=@($main -split '\r?\n' | Where-Object {$_.StartsWith($prefix)})
 if($lines.Count -ne 1){throw "Missing production function $prefix"}; $lines[0]
}
$source=@'
#include <assert.h>
#include <ctype.h>
#include <stdio.h>
#include <string.h>
#include "home_mode.h"
#include "gesture.h"
#define UI "/fixture/ui"
#define R_OK 4
static char page[96]="index.html",previous[96]="index.html",pending[32]="",accessed[256];
static int aggregate_home,advanced_page,scroll_y;static long sms_id=-1;
static int access(const char*path,int mode){assert(mode==R_OK);snprintf(accessed,sizeof accessed,"%s",path);return 0;}
FUNCTIONS
int main(void){
 assert(TF_MAIN_PAGE_COUNT==3);assert(!strcmp(tf_home_page(0),"index.html")&&!strcmp(tf_home_page(-1),"index.html"));
 for(int enabled=0;enabled<=1;enabled++){
  aggregate_home=enabled;strcpy(page,tf_home_page(enabled));
  for(int i=0;i<TF_MAIN_PAGE_COUNT;i++){assert(current_main_page()==i);assert(strcmp(page,tf_home_page(!enabled)));change_page(tf_main_page_name(tf_next_page(i,TF_PREVIOUS,TF_MAIN_PAGE_COUNT),enabled),0);change_page(tf_main_page_name(i,enabled),0);change_page(tf_main_page_name(tf_next_page(i,TF_NEXT,TF_MAIN_PAGE_COUNT),enabled),0);}
  assert(!strcmp(page,tf_home_page(enabled)));change_page(tf_main_page_name(tf_next_page(0,TF_PREVIOUS,TF_MAIN_PAGE_COUNT),enabled),0);assert(!strcmp(page,"apps.html"));
  change_page(enabled?"index.html":"aggregate.html",0);assert(!strcmp(page,tf_home_page(enabled)));assert(strstr(accessed,tf_home_page(enabled)));
 }
 strcpy(page,"index.html");aggregate_home=1;scroll_y=160;sync_home_page();assert(!strcmp(page,"aggregate.html")&&scroll_y==0);
 aggregate_home=0;sync_home_page();assert(!strcmp(page,"index.html"));
 strcpy(page,"settings.html");scroll_y=160;aggregate_home=1;sync_home_page();assert(!strcmp(page,"settings.html")&&scroll_y==160&&current_main_page()==-1);
 /* A mode update must not reset a form/modal or SMS view over a home slot. */
 strcpy(page,"index.html");advanced_page=7;sync_home_page();assert(!strcmp(page,"index.html")&&scroll_y==160);advanced_page=0;
 strcpy(pending,"pending");sync_home_page();assert(!strcmp(page,"index.html")&&scroll_y==160);pending[0]=0;
 sms_id=4;sync_home_page();assert(!strcmp(page,"index.html")&&scroll_y==160);sms_id=-1;sync_home_page();assert(!strcmp(page,"aggregate.html")&&scroll_y==0);
 strcpy(page,"subpages/sms.html");sync_home_page();assert(current_main_page()==-1&&!strcmp(page,"subpages/sms.html"));
 puts("PASS: actual navigation has one mode-dependent home in three pages; settings is a detail; hidden home aliases cannot bypass mode; enable/disable updates home; detail/form/modal navigation preserved; no control writes");return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-home-mode.c",$source.Replace('FUNCTIONS',($functions -join "`n")))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-home-mode.c" -o "$root/bin/test-home-mode.exe"
if($LASTEXITCODE -ne 0){throw 'Home mode test build failed'}
& "$root/bin/test-home-mode.exe"
if($LASTEXITCODE -ne 0){throw 'Home mode test failed'}
if($main -match '"aggregation\.set"|\\"aggregation\.set\\"'){throw 'Screen still writes aggregation mode'}
foreach($file in Get-ChildItem "$root/ui" -Recurse -Filter '*.html'){
 $html=[IO.File]::ReadAllText($file.FullName)
 if($html -match 'href="act:aggregate"|href="act:page:aggregate.html"| / 0[345]'){throw "Stale mode entry/page count: $($file.Name)"}
}
