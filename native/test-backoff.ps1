$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$data=[IO.File]::ReadAllText("$root/upstream/src/data.c")
$calls=$data.Substring($data.IndexOf('int data_backend_init(void)'),$data.IndexOf('int data_backend_commit_latest(void)')-$data.IndexOf('int data_backend_init(void)'))
$refresh=$data.Substring($data.IndexOf('int data_refresh(devui_data_t *d)'),$data.IndexOf('int data_refresh_live(devui_data_t *d)')-$data.IndexOf('int data_refresh(devui_data_t *d)'))
$source=@'
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <assert.h>
#define DEVUI_BACKEND_RETRY_MS 2000
typedef struct {int cpu_usage,hsr;} devui_data_t;
static struct {int inited,started,sse_fd,current_valid,live_valid;uint32_t next_retry_ms;unsigned long long live_version;devui_data_t current_data;}g_backend;
static uint32_t clock_now=1000;static int http_calls,open_calls,drains,open_ok,drop_stream;
static uint32_t mono_ms(void){return clock_now;}
static void backend_init_once(void){if(!g_backend.inited){memset(&g_backend,0,sizeof g_backend);g_backend.inited=1;g_backend.sse_fd=-1;}}
static int fetch_state_http(void){http_calls++;return-1;}
static int open_sse_stream(void){open_calls++;if(open_ok){g_backend.sse_fd=10;g_backend.next_retry_ms=0;return 0;}return-1;}
static int data_backend_commit_latest(void){return 0;}
static int drain_sse_stream(void){drains++;if(drop_stream){g_backend.sse_fd=-1;g_backend.next_retry_ms=clock_now+2000;}return 0;}
static int force_hsr_enabled(void){return 0;}
CALLS
REFRESH
int main(void){devui_data_t d;
 data_backend_init();assert(http_calls==1&&open_calls==1);
 for(int i=0;i<100;i++){clock_now=1000+i*15;data_backend_poll(clock_now);data_refresh(&d);data_backend_init();}
 assert(http_calls==1&&open_calls==1);
 clock_now=2999;data_backend_poll(clock_now);assert(http_calls==1);clock_now=3000;data_backend_poll(clock_now);assert(http_calls==2&&open_calls==2);
 clock_now=5000;open_ok=1;data_backend_poll(clock_now);assert(http_calls==3&&g_backend.sse_fd==10);for(int i=0;i<100;i++)data_backend_poll(clock_now);assert(http_calls==3);
 drop_stream=1;data_backend_poll(clock_now);assert(http_calls==3&&g_backend.sse_fd==-1);clock_now=6999;data_backend_poll(clock_now);assert(http_calls==3);clock_now=7000;data_backend_poll(clock_now);assert(http_calls==4);
 memset(&g_backend,0,sizeof g_backend);open_ok=0;drop_stream=0;clock_now=UINT32_MAX-500;data_backend_init();int before=http_calls;clock_now=1000;data_backend_poll(clock_now);assert(http_calls==before);clock_now=1500;data_backend_poll(clock_now);assert(http_calls==before+1);
 puts("PASS: invalid/no backend retries at most once per 2s; cached refresh never reconnects; SSE drop respects deadline; uint32 wrap safe");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-backoff.c",$source.Replace('CALLS',$calls).Replace('REFRESH',$refresh))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "$root/build-preview/test-backoff.c" -o "$root/bin/test-backoff.exe"
if($LASTEXITCODE -ne 0){throw 'Backend backoff build failed'}
& "$root/bin/test-backoff.exe"
if($LASTEXITCODE -ne 0){throw 'Backend backoff tests failed'}
