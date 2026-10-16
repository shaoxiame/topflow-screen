$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$runtime=[IO.File]::ReadAllText("$root/display_runtime.h")
$start=$runtime.IndexOf('static int display_sensor_write_attribute(')
$end=$runtime.IndexOf('static int display_prepare_adopt(')
if($start -lt 0 -or $end -le $start){throw 'Sensor callback source boundaries missing'}
$implementation=$runtime.Substring($start,$end-$start)
$prefix=@'
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <sys/types.h>
/* Execute the production Linux branch with sysfs calls replaced in-process. */
#define __linux__ 1
static int tf_http_cancelled,owner=1,identity=1,state_read=1,enabled,guard=1;
static int open_count,write_count,close_count,open_fail,write_fail,short_write,close_fail,expire_after_init,expire_during_read;
static char opened[2][64],written[2][4];
static const char*display_config_failure="ADOPT_SENSOR_ENABLE";
static struct {const char*name;}factory_guard={"topflow_screen_123_456"};
static int display_factory_process(void){return owner?0:1;}
static int tf_guard_observe(void*g,const char*name){assert(g==&factory_guard&&!strcmp(name,factory_guard.name));return guard;}
static int display_sensor_identity(void){return identity;}
static int display_sensor_read_enable(int*out){if(!state_read){display_config_failure="ADOPT_SENSOR_READ";return 0;}if(expire_during_read)guard=0;*out=enabled;return 1;}
static int tf_guard_open_sysfs(const char*path,int flags){
 assert(flags==O_WRONLY&&open_count<2);
 assert(!strcmp(path,open_count?"/sys/class/input/input3/driver/enable":"/sys/class/input/input3/driver/init"));
 snprintf(opened[open_count],sizeof opened[0],"%s",path);open_count++;
 return open_fail==open_count?-1:open_count+9;
}
static ssize_t test_write(int fd,const void*data,size_t n){
 assert(fd>=10&&fd<=11&&n==2&&!memcmp(data,"1\n",2));
 memcpy(written[fd-10],data,n);write_count++;
 if(write_fail==fd-9){errno=EIO;return -1;}if(short_write==fd-9)return 1;return 2;
}
static int test_close(int fd){assert(fd>=10&&fd<=11);close_count++;if(fd==10&&expire_after_init)guard=0;return close_fail==fd-9?-1:0;}
#define write test_write
#define close test_close
'@
$suffix=@'
static void reset(void){tf_http_cancelled=0;owner=identity=state_read=guard=1;enabled=0;open_count=write_count=close_count=open_fail=write_fail=short_write=close_fail=expire_after_init=expire_during_read=0;memset(opened,0,sizeof opened);memset(written,0,sizeof written);display_config_failure="ADOPT_SENSOR_ENABLE";}
static void refused(const char*code,int expected_open){assert(!display_sensor_write_enabled());assert(!strcmp(display_config_failure,code)&&open_count==expected_open);}
int main(void){
 reset();assert(display_sensor_write_enabled()&&open_count==2&&write_count==2&&close_count==2);assert(!strcmp(written[0],"1\n")&&!strcmp(written[1],"1\n"));
 reset();enabled=1;assert(display_sensor_write_enabled()&&open_count==0);
 reset();state_read=0;refused("ADOPT_SENSOR_READ",0);
 reset();identity=0;refused("ADOPT_SENSOR_ID",0);
 reset();owner=0;refused("ADOPT_GUARD_ACTIVE",0);
 reset();guard=0;refused("ADOPT_GUARD_ACTIVE",0);
 reset();tf_http_cancelled=1;refused("ADOPT_GUARD_ACTIVE",0);
 reset();expire_during_read=1;refused("ADOPT_GUARD_ACTIVE",0);
 reset();open_fail=1;refused("ADOPT_SENSOR_INIT",1);assert(write_count==0&&close_count==0);
 reset();write_fail=1;refused("ADOPT_SENSOR_INIT",1);assert(close_count==1);
 reset();short_write=1;refused("ADOPT_SENSOR_INIT",1);assert(close_count==1);
 reset();close_fail=1;refused("ADOPT_SENSOR_INIT",1);
 reset();expire_after_init=1;refused("ADOPT_GUARD_ACTIVE",1);
 reset();open_fail=2;refused("ADOPT_SENSOR_ENABLE",2);assert(write_count==1&&close_count==1);
 reset();write_fail=2;refused("ADOPT_SENSOR_ENABLE",2);assert(close_count==2);
 reset();short_write=2;refused("ADOPT_SENSOR_ENABLE",2);assert(close_count==2);
 reset();close_fail=2;refused("ADOPT_SENSOR_ENABLE",2);
 puts("PASS: production sensor callback follows observed OFF -> fixed init=1 -> guard recheck -> fixed enable=1; ON/unreadable state never resets; all open/write/close and ownership failures stop before subsequent writes");
 return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-sensor-handover.c",$prefix+"`n"+$implementation+"`n"+$suffix)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-sensor-handover.c" -o "$root/bin/test-sensor-handover.exe"
if($LASTEXITCODE -ne 0){throw 'Sensor handover test build failed'}
& "$root/bin/test-sensor-handover.exe"
if($LASTEXITCODE -ne 0){throw 'Sensor handover test failed'}
