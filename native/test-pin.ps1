$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$source=@'
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include "pin_policy.h"
#include "display_policy.h"
#define TF_PIN_TITLE "TOPFLOW"
static int pin_percent=79,pin_status=1,pin_connection=1;
#define TF_PIN_BAT_PERCENT pin_percent
#define TF_PIN_BAT_STATUS pin_status
#define TF_PIN_BAT_CONNECTION pin_connection
static tf_pin_policy pin_policy;
static tf_display_policy display_policy;
static uint64_t mock_now=1000;
static int theme_dark=0,pin_fault=0;
static char pin_feedback[128];
static uint64_t pin_now(void){return mock_now;}
static uint32_t tick(void){return(uint32_t)mock_now;}
static int pin_native_poll(void){tf_pin_poll(&pin_policy,mock_now);return 1;}
static int pin_native_attempt(void){return tf_pin_attempt(&pin_policy,"2026",mock_now);}
static struct tm*localtime_r(const time_t*t,struct tm*out){struct tm*p=localtime(t);if(p)*out=*p;return p?out:NULL;}
static void esc(char*out,size_t cap,const char*s){snprintf(out,cap,"%s",s);}
#include "pin_view.h"
static void input(tf_pin_policy*p,const char*s,uint64_t now){tf_pin_clear(p);for(int i=0;s[i];i++)assert(tf_pin_digit(p,s[i]-'0',now));}
static void output(const char*dir,const char*name){for(theme_dark=0;theme_dark<2;theme_dark++){char path[4096];snprintf(path,sizeof path,"%s/%s%s.html",dir,name,theme_dark?"-dark":"");FILE*f=fopen(path,"wb");assert(f);const char*h=pin_screen_html();assert(!strstr(h,"2026")&&!strstr(h,"act:theme")&&!strstr(h,"act:advback")&&!strstr(h,"运营商"));assert(strstr(h,"pin-screen")&&strstr(h,"pin-keypad")&&strstr(h,"pin-dots"));fwrite(h,1,strlen(h),f);fclose(f);}}
static void soft_output(const char*dir,int progress){for(theme_dark=0;theme_dark<2;theme_dark++){char path[4096];snprintf(path,sizeof path,"%s/soft-lock%s%s.html",dir,progress?"-progress":"",theme_dark?"-dark":"");FILE*f=fopen(path,"wb");assert(f);const char*h=soft_screen_html(progress);assert(!strstr(h,"href='act:")&&!strstr(h,"2026")&&strstr(h,"长按解锁")&&!strstr(h,"继续按住")&&strstr(h,"lock-rates"));fwrite(h,1,strlen(h),f);fclose(f);}}
int main(int argc,char**argv){assert(argc==2);tf_pin_policy p;tf_pin_start(&p,1,1000,3,0);assert(p.locked&&p.failures==3&&p.handover_wait&&tf_pin_seconds(&p,1000)==300);assert(!tf_pin_digit(&p,2,300999));assert(tf_pin_attempt(&p,"2026",300999)==TF_PIN_WAIT);assert(tf_pin_poll(&p,301000)&&!p.deadline&&!p.failures&&!p.handover_wait);input(&p,"2026",301000);assert(tf_pin_attempt(&p,"2026",301000)==TF_PIN_OK&&!p.locked&&p.input_len==0);tf_pin_lock(&p);assert(p.locked&&!p.input_len);assert(!tf_pin_digit(&p,10,301000));
 for(int i=0;i<5;i++){input(&p,"1111",301000+i);assert(tf_pin_attempt(&p,"2026",301000+i)==TF_PIN_WRONG);assert(p.failures==i+1);}assert(tf_pin_seconds(&p,301004)==300&&!p.handover_wait);assert(!tf_pin_digit(&p,2,601003));assert(tf_pin_poll(&p,601004)&&!p.failures);input(&p,"2026",601004);assert(tf_pin_attempt(&p,"bad",601004)==TF_PIN_INVALID&&p.locked);tf_pin_clear(&p);
 tf_pin_start(&p,1,700000,4,750000);assert(p.deadline==1000000&&p.handover_wait&&p.failures==4);assert(!tf_pin_digit(&p,2,999999));tf_pin_start(&p,0,0,5,999999);assert(!p.enabled&&!p.locked&&!p.failures&&!p.deadline&&!p.handover_wait);assert(!tf_pin_digit(&p,1,0)&&tf_pin_attempt(&p,"2026",0)==TF_PIN_INVALID);tf_pin_lock(&p);assert(!p.locked&&!p.input_len&&!tf_pin_seconds(&p,0));
 char boot[37];int failures;uint64_t deadline;const char*record="TFPIN1 00000000-0000-0000-0000-000000000000 4 999000\n";assert(tf_pin_record_read(record,boot,&failures,&deadline)&&failures==4&&deadline==999000);assert(!tf_pin_record_read("",boot,&failures,&deadline));assert(!tf_pin_record_read("TFPIN1 bad 0 1\n",boot,&failures,&deadline));assert(!tf_pin_record_read("TFPIN1 00000000-0000-0000-0000-000000000000 6 1\n",boot,&failures,&deadline));assert(!tf_pin_record_read("TFPIN1 00000000-0000-0000-0000-000000000000 0 -1\n",boot,&failures,&deadline));assert(!tf_pin_record_read("TFPIN1 00000000-0000-0000-0000-000000000000 0 18446744073709551616\n",boot,&failures,&deadline));assert(!tf_pin_record_read("TFPIN1 00000000-0000-0000-0000-000000000000 0 1\nextra",boot,&failures,&deadline));
 tf_pin_start(&pin_policy,1,mock_now,0,0);output(argv[1],"lock-handover");assert(!strstr(pin_screen_html(),"href='act:pin:"));mock_now+=300000;pin_native_poll();pin_action("pin:2");pin_action("pin:0");output(argv[1],"lock-entry");{const char*h=pin_screen_html();int dots=0,filled=0,keys=0;for(const char*p=h;(p=strstr(p,"class='pin-dot"));p++)if(strncmp(p,"class='pin-dots",15))dots++;for(const char*p=h;(p=strstr(p,"pin-dot filled"));p++)filled++;for(const char*p=h;(p=strstr(p,"href='act:pin:"));p++)keys++;assert(dots==4&&filled==2&&keys==12&&strstr(h,"79%")&&strstr(h,"top-power charging"));pin_percent=100;assert(strstr(pin_screen_html(),"top-power charging"));pin_status=4;assert(strstr(pin_screen_html(),"top-power full"));pin_percent=pin_status=pin_connection=-1;assert(strstr(pin_screen_html(),"top-power unknown")&&!strstr(pin_screen_html(),"-1%"));pin_percent=79;pin_status=1;pin_connection=1;}pin_action("page:index.html");assert(pin_policy.locked&&pin_policy.input_len==2);pin_action("pin:clear");for(int i=0;i<5;i++){input(&pin_policy,"1111",mock_now);pin_action("pin:submit");}output(argv[1],"lock-cooldown");assert(!strstr(pin_screen_html(),"首次接管保护等待"));
 mock_now+=300000;pin_native_poll();input(&pin_policy,"2026",mock_now);pin_action("pin:submit");assert(!pin_policy.locked&&pin_policy.input_len==0);
 tf_pin_start(&pin_policy,0,mock_now,0,0);assert(!pin_policy.locked&&pin_screen_html()==NULL);pin_action("pin:2");assert(!pin_policy.locked&&!pin_policy.input_len);tf_pin_lock(&pin_policy);assert(!pin_policy.locked&&pin_screen_html()==NULL);
 soft_output(argv[1],0);soft_output(argv[1],500);
 puts("PASS: no-PIN has no credential authentication; local hold page is separate; configured PIN retains full 300s handover, four-digit fixture verification, five failures/300s, restart quarantine, masked RAM input, bounded corrupt record rejection and distinct lock messages");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-pin.c",$source)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-pin.c" -o "$root/bin/test-pin.exe"
if($LASTEXITCODE -ne 0){throw 'PIN tests build failed'}
& "$root/bin/test-pin.exe" "$root/preview"
if($LASTEXITCODE -ne 0){throw 'PIN policy tests failed'}
$io=[IO.File]::ReadAllText("$root/pin_native.h")
foreach($invariant in @('O_NOFOLLOW','O_EXCL','LOCK_EX|LOCK_NB','st.st_nlink!=1','st.st_uid!=0','PR_SET_DUMPABLE','mlock(','fsync(','volatile char*wipe')){if(!$io.Contains($invariant)){throw "Missing PIN boundary: $invariant"}}
Write-Output 'PASS: PIN file ownership/no-link/exclusive lock, durable state, core-dump prohibition and credential wipe boundaries present'
