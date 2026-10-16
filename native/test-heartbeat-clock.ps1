$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$begin=$main.IndexOf('static long long monotonic_seconds(')
$end=$main.IndexOf('static uint32_t tick(',$begin)
if($begin -lt 0 -or $end -lt $begin){throw 'Heartbeat source boundary missing'}
$body=$main.Substring($begin,$end-$begin).Replace('clock_gettime(','test_clock_gettime(').Replace('fopen(','test_fopen(').Replace('fprintf(','test_fprintf(').Replace('fclose(','test_fclose(')
$code=@'
#include <stdio.h>
#include <time.h>
#include <assert.h>
#include <string.h>
#define CLOCK_MONOTONIC 1
static long long mono=0,wall=1000000,last=-1;
static int frame_ready=1,opened=0,clock_error=0;
static int test_clock_gettime(int clock,struct timespec*t){assert(clock==CLOCK_MONOTONIC);if(clock_error)return -1;t->tv_sec=(time_t)mono;t->tv_nsec=0;return 0;}
static FILE*test_fopen(const char*p,const char*m){assert(!strcmp(p,"/tmp/topflow-screen/heartbeat")&&!strcmp(m,"w"));opened++;return(FILE*)1;}
static int test_fprintf(FILE*f,const char*format,long long value){(void)f;assert(!strcmp(format,"%lld\n"));last=value;return 1;}
static int test_fclose(FILE*f){(void)f;return 0;}
IMPLEMENTATION
int main(void){
 heartbeat();assert(last==0);mono=500;heartbeat();assert(last==500);wall+=7200;assert(monotonic_seconds()==500);heartbeat();assert(last==500);wall-=36000;heartbeat();assert(last==500);mono+=2;heartbeat();assert(last==502);int before=opened;clock_error=1;heartbeat();assert(opened==before&&monotonic_seconds()==-1);clock_error=0;frame_ready=0;mono+=30;heartbeat();assert(opened==before);assert(wall==971200);
 puts("PASS: actual monotonic clock heartbeat, valid boot zero, suspended wall jump, backwards NTP, awake advance and failed-clock/no-frame refusal");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-heartbeat-clock.c",$code.Replace('IMPLEMENTATION',$body))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "$root/build-preview/test-heartbeat-clock.c" -o "$root/bin/test-heartbeat-clock.exe"
if($LASTEXITCODE -ne 0){throw 'Heartbeat clock test build failed'}
& "$root/bin/test-heartbeat-clock.exe"
if($LASTEXITCODE -ne 0){throw 'Heartbeat clock test failed'}
$entry=$main.Substring($main.IndexOf('int main('),350)
if($entry -notmatch '^int main\([^\n]+\)\{\s*if\(argc==2&&!strcmp\(argv\[1\],"--monotonic-seconds"\)\)'){throw 'Clock CLI no longer precedes runtime initialization'}
Write-Output 'PASS: read-only clock CLI is the first main branch'
