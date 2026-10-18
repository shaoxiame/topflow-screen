$ErrorActionPreference='Stop'
$root=$PSScriptRoot
function Extract([string]$text,[string]$start,[string]$end){$a=$text.IndexOf($start);$b=$text.IndexOf($end,$a);if($a -lt 0 -or $b -le $a){throw "Missing boundary: $start"};return $text.Substring($a,$b-$a)}
$main=[IO.File]::ReadAllText("$root/topflow_main.c")
$runtime=[IO.File]::ReadAllText("$root/display_runtime.h")
$vendor=[IO.File]::ReadAllText("$root/vendor_modem.h")
# Reuse the existing main-loop fixture's peripheral UI/data stubs, replacing
# its policy-success stub with production policy + production bounded vendor
# wait + production busy hook. No production waiting/cancellation is mocked.
$base=[IO.File]::ReadAllText("$root/test-factory-power.ps1")
$a=$base.IndexOf('$branchSource=@''')+('$branchSource=@''').Length
$b=$base.IndexOf("'@",$a)
if($a -lt 15 -or $b -le $a){throw 'Missing main branch fixture'}
$source=$base.Substring($a,$b-$a)
$source=$source.Substring(0,$source.IndexOf('int main(void){'))
$loop=$main.Substring($main.IndexOf('while(running){uint32_t now=tick();'))
$branch=Extract $loop 'if(factory_power.off_latched||factory_power_quiet)' 'if(!tf_factory_power_can_use'
$parts=@{
 ACTUAL_POWER=(Extract $main 'static int runtime_factory_power_read(int force){' 'static void esc(');
 ACTUAL_OFF=(Extract $main 'static void runtime_factory_discard(void)' 'int main(');
 ACTUAL_LOCK=(Extract $main 'static void screen_lock(void)' '/* A successful PIN entry');
 ACTUAL_WAKE=(Extract $main 'static int runtime_wake(' '/* A held power key');
 ACTUAL_BRANCH=$branch
}
foreach($entry in $parts.GetEnumerator()){$source=$source.Replace($entry.Key,$entry.Value)}
$os=@'
static void busy_tick(void);static void event(int,uint32_t,uint32_t);static int runtime_pin_ready(void);
static void(*tf_http_wait_hook)(void)=busy_tick;
static int vendor_ready,vendor_read_done,vendor_forks,vendor_kills,vendor_polls,inject_kind,injected,invalid_policy,bus_failed,check_private;
static int private_form,private_sms,private_extra;
static long long tf_monotonic_ms(void){return clock_ms;}
struct pollfd{int fd;short events,revents;};
#define POLLIN 1
#define WNOHANG 1
#define SIGKILL 9
#define PR_SET_PDEATHSIG 1
#define O_WRONLY 1
#define O_NONBLOCK 2
#define F_SETFL 1
#define WIFEXITED(s) ((s)>=0)
#define WEXITSTATUS(s) (s)
static int mock_pipe(int*p){static int next=10;p[0]=next++;p[1]=next++;return 0;}
static int mock_close(int fd){(void)fd;return 0;}
static int mock_getpid(void){return 50;}static int mock_getppid(void){return 50;}
static int mock_fork(void){vendor_ready=vendor_read_done=0;vendor_forks++;return 51;}
static int mock_prctl(int a,int b){(void)a;(void)b;assert(0);return -1;}
static void mock_exit(int a){(void)a;assert(0);}
static int mock_dup2(int a,int b){(void)a;(void)b;assert(0);return -1;}
static int mock_open(const char*p,int f){(void)p;(void)f;assert(0);return -1;}
static int mock_execv(const char*p,char*const*a){(void)p;(void)a;assert(0);return -1;}
static ssize_t mock_write(int fd,const void*data,size_t size){(void)fd;(void)data;return (ssize_t)size;}
static ssize_t mock_read(int fd,void*out,size_t cap){(void)fd;if(!vendor_ready){errno=EAGAIN;return -1;}if(vendor_read_done)return 0;const char*response=invalid_policy?"bad\n":"0\n";size_t n=strlen(response);assert(cap>=n);memcpy(out,response,n);vendor_read_done=1;return (ssize_t)n;}
static int mock_waitpid(int child,int*status,int flags){assert(child==51);if(flags==WNOHANG&&!vendor_ready)return 0;if(status)*status=0;return child;}
static int mock_kill(int child,int sig){assert(child==51&&sig==SIGKILL);vendor_kills++;return 0;}
static int mock_fcntl(int fd,int op,int flags){(void)fd;assert(op==F_SETFL&&flags==O_NONBLOCK);return 0;}
static int mock_poll(struct pollfd*p,int n,int ms){assert(p&&n==1&&ms==20);clock_ms+=(unsigned)ms;vendor_ready=1;vendor_polls++;
 if(check_private){assert(pin_policy.locked&&display_policy.locked&&!controls_enabled&&!pin_policy.input_len&&!pin_policy.input[0]&&!private_form&&!private_sms&&!private_extra&&!pending[0]&&!pin_feedback[0]);}
 if(inject_kind&&!injected){injected=1;if(inject_kind==1)event(TF_FACTORY_POWER_OFF,factory_bus.device_power_sequence+1,factory_bus.device_power_off_seen+1);else if(inject_kind==2)factory_bus.resync=1;else if(inject_kind==3)factory_bus.power_event=2;else bus_failed=1;if(inject_kind!=4)assert(!runtime_pin_ready());}
 return 1;
}
#define pipe mock_pipe
#define close mock_close
#define getpid mock_getpid
#define getppid mock_getppid
#define fork mock_fork
#define prctl mock_prctl
#define _exit mock_exit
#define dup2 mock_dup2
#define open mock_open
#define execv mock_execv
#define write mock_write
#define read mock_read
#define waitpid mock_waitpid
#define kill mock_kill
#define fcntl mock_fcntl
#define poll mock_poll
ACTUAL_VENDOR
#undef pipe
#undef close
#undef getpid
#undef getppid
#undef fork
#undef prctl
#undef _exit
#undef dup2
#undef open
#undef execv
#undef write
#undef read
#undef waitpid
#undef kill
#undef fcntl
#undef poll
'@
$os=$os.Replace('ACTUAL_VENDOR',(Extract $vendor 'static void vendor_reap(' 'static void vendor_refresh('))
$old='static int vendor_exec(const char*p,char*const*a,const char*i,char*out,size_t cap){(void)p;(void)a;(void)i;(void)out;(void)cap;assert(0);return -1;}'
if(!$source.Contains($old)){throw 'Missing vendor success stub to replace'}
$source=$source.Replace($old,$os)
$source=$source.Replace('static void form_reset(void){}','static void form_reset(void){private_form=0;}').Replace('static void sms_forward_cleanup(void){}','static void sms_forward_cleanup(void){private_sms=0;}').Replace('static void factory_extra_cleanup(void){}','static void factory_extra_cleanup(void){private_extra=0;}')
$source=$source.Replace('#include <stdint.h>',"#include <stdint.h>`n#include <stddef.h>`n#include <errno.h>`n#include <sys/types.h>")
$hook=@'
static int frame_ready=1,theme_dark,busy_phase;static uint32_t busy_last,busy_heartbeat;
static drm_disp_t*active_display=&d;
static void heartbeat(void);
static int tf_fb_tick(void*p){assert(p==&factory_bus);return !bus_failed;}
static void html_view_fill_round_rect(int x,...){(void)x;}
static int logical_damage(drm_disp_t*p,int x,int y,int w,int h){(void)p;(void)x;(void)y;(void)w;(void)h;return 1;}
ACTUAL_POWER_READY
ACTUAL_PIN_READY
static int(*display_power_on_hook)(void)=runtime_factory_power_ready;
ACTUAL_BUSY
ACTUAL_UNLOCK
'@
$hook=$hook.Replace('ACTUAL_BUSY',(Extract $main 'static void busy_tick(void)' 'static void show_busy(')).Replace('ACTUAL_UNLOCK',(Extract $runtime 'static int display_runtime_interrupted(void)' 'static void display_runtime_cleanup('))
$hook=$hook.Replace('ACTUAL_POWER_READY',([regex]::Match($main,'static int runtime_factory_power_ready\(void\)\{[^\r\n]+').Value)).Replace('ACTUAL_PIN_READY',([regex]::Match($main,'static int runtime_pin_ready\(void\)\{[^\r\n]+').Value))
$old='static int display_runtime_unlock_policy(void){assert(!factory_bus.sleep_unavailable);policy_reads++;return 1;}'
if(!$source.Contains($old)){throw 'Missing policy success stub to replace'}
$source=$source.Replace($old,$hook).Replace('assert(p==&key&&now==clock_ms);','assert(p==&key&&now<=clock_ms);')
$source=$source.Replace('static int display_runtime_interrupted(void){return running&&!display_runtime_fault&&tf_http_cancelled&&(factory_bus.power_event||factory_bus.resync||!runtime_factory_power_read(1));}','')
$ordinary=Extract $loop "if(factory_bus.resync){`n" '/* Read input before background'
$source+="`nstatic int ordinary_resume(void){int result=0;for(int step=0;step<1;step++){int dirty=0;`n$ordinary`n(void)dirty;}return result;}`n"
$source+=@'
static void seed_private(void){pin_policy.locked=0;pin_policy.input_len=4;memcpy(pin_policy.input,"1234",5);display_policy.locked=0;controls_enabled=1;private_form=private_sms=private_extra=1;strcpy(pending,"queued-write");strcpy(pin_feedback,"old-pin-feedback");check_private=1;}
static void assert_locked(void){assert(pin_policy.locked&&display_policy.locked&&!controls_enabled&&!pin_policy.input_len&&!pin_policy.input[0]&&!private_form&&!private_sms&&!private_extra&&!pending[0]&&!pin_feedback[0]);}
static void assert_resumed(void){assert(running&&!display_runtime_fault&&actual_light>0&&display_policy.on&&!tf_http_cancelled&&!factory_power_quiet&&!factory_power.off_latched&&!factory_bus.power_event&&!factory_bus.resync&&runtime_pin_ready());assert_locked();}
int main(int argc,char**argv){
 assert(argc==2);int mode=atoi(argv[1]);assert(mode>=0&&mode<=14);
 tf_display_config config={1,1,135,30,0,1,40,135,255};assert(tf_display_init_supported(&display_policy,&config,0,1));tf_pin_start(&pin_policy,1,0,0,0);pin_policy.locked=0;tf_soft_lock_reset(&soft_lock,1);factory_lifecycle.phase=TF_FL_READY;actual_light=135;
 int result,ordinary=mode==3||(mode>=8&&mode<=10)||mode==14;
 if(ordinary){event(TF_FACTORY_POWER_ON,1,0);runtime_factory_power_read(1);factory_bus.resync=1;factory_bus.power_event=mode==14?1:0;inject_kind=mode==8?2:mode==9||mode==14?3:mode==10?1:0;seed_private();clock_ms=2000;result=ordinary_resume();}
 else{
  event(TF_FACTORY_POWER_OFF,1,1);clock_ms=1000;assert(!main_off_step()&&factory_power_quiet&&!actual_light);
  factory_bus.power_event=mode==1||mode==7?2:0;factory_bus.resync=mode==2||mode==7;inject_kind=mode==4?1:mode==5?2:mode==6?3:mode==13?4:0;invalid_policy=mode==12;
  if(mode==11){factory_bus.sleep_unavailable=1;factory_bus.resync=1;event(TF_FACTORY_POWER_ON,2,1);clock_ms=1500;assert(!main_off_step()&&factory_power_quiet&&!vendor_forks&&!positive_requests);factory_bus.sleep_unavailable=0;factory_bus.power_event=2;}
  seed_private();
  event(TF_FACTORY_POWER_ON,2,1);clock_ms=2000;result=main_off_step();
 }
 assert(vendor_forks>=1&&vendor_polls>=1); /* production vendor loop actually awaited and called production hook */
 assert_locked();
 if(mode==12||mode==13){assert(result==7&&!running&&display_runtime_fault&&tf_http_cancelled&&!renders&&!positive_requests);assert(vendor_kills==(mode==13));printf("PASS: mode %d genuine policy/transport failure remains fatal, no PIN bypass\n",mode);return 0;}
 assert(!result&&running&&!display_runtime_fault);
 if(injected){
  assert(tf_http_cancelled&&vendor_kills==1&&!renders&&!positive_requests);assert_locked();
  if(inject_kind==1){
   assert(factory_power.off_latched);clock_ms+=1000;assert(!main_off_step()&&factory_power_quiet&&!actual_light&&!positive_requests&&!renders); /* the fresh OFF is not consumed as ON */
   event(TF_FACTORY_POWER_ON,factory_bus.device_power_sequence+1,factory_bus.device_power_off_seen);clock_ms++;assert(!main_off_step());assert_resumed();
  }else{
   assert(ordinary?factory_bus.resync:factory_power.off_latched&&factory_power_quiet&&!actual_light);
   if(inject_kind==2)assert(factory_bus.resync);else assert(factory_bus.power_event==2);
   clock_ms+=1000;result=ordinary?ordinary_resume():main_off_step();assert(!result);assert_resumed();
  }
  printf("PASS: mode %d fresh event cancels production wait, clears secrets before wait, preserves pending work and resumes next cycle with PIN locked\n",mode);
 }else{assert_resumed();assert(!vendor_kills);printf("PASS: mode %d old notification batch resumes without another key, PIN protection retained\n",mode);}
 return 0;
}
'@
New-Item -ItemType Directory -Force "$root/build-preview" | Out-Null
$path="$root/build-preview/test-wake-resume.c"
[IO.File]::WriteAllText($path,$source,[Text.UTF8Encoding]::new($false))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror -Wno-unused-function -Wno-unused-variable "-I$root" $path -o "$root/build-preview/test-wake-resume.exe"
if($LASTEXITCODE -ne 0){throw 'Wake resume wait/cancellation test compile failed'}
foreach($mode in 0..14){& "$root/build-preview/test-wake-resume.exe" "$mode";if($LASTEXITCODE -ne 0){throw "Wake resume mode $mode failed"}}
