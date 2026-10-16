$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$data=[IO.File]::ReadAllText("$root/upstream/src/data.c")
$parse=$data.Substring($data.IndexOf('static void getstr('),$data.IndexOf('static int set_nonblock(')-$data.IndexOf('static void getstr('))
$source=@'
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "data.h"
#include "json.h"
#include "battery_state.h"
#define DEVUI_STATE_BUF_MAX 1048576
#define DEVUI_SMS_BUF_MAX 1048576
#define DEVUI_SMS_OBJECT_MAX (DEVUI_SMS_TEXT_MAX + 32768)
PARSER
int main(void){
 devui_data_t d;char raw[256];
 for(int status=0;status<=4;status++)for(int plugged=0;plugged<=1;plugged++){
  snprintf(raw,sizeof raw,"{\"battery\":{\"percent\":100,\"charging\":%d,\"charger_connect\":%d}}",status,plugged);
  assert(parse_snapshot(&d,raw));assert(d.charging==status&&d.charger_connect==plugged&&d.bat_percent==100);
  assert(tf_battery_charging(status,plugged)==(status==1?(plugged?1:-1):status>=2?0:plugged?-1:0));
 }
 assert(!strcmp(tf_battery_class(1,1),"charging")&&!strcmp(tf_battery_label(1,1),"充电中"));
 assert(!strcmp(tf_battery_class(4,1),"full")&&!strcmp(tf_battery_label(4,1),"已充满"));
 assert(!strcmp(tf_battery_class(3,1),"plugged")&&!strcmp(tf_battery_label(3,1),"已插电 · 未充电"));
 assert(!strcmp(tf_battery_class(2,0),"discharging")&&!strcmp(tf_battery_label(2,0),"电池供电"));
 assert(!strcmp(tf_battery_class(1,0),"unknown")&&tf_battery_charging(1,0)==-1);
 const char*bad[]={"{}","{\"battery\":{}}","{\"battery\":{\"percent\":null,\"charging\":null,\"charger_connect\":null}}","{\"battery\":{\"percent\":101,\"charging\":5,\"charger_connect\":2}}","{\"battery\":{\"percent\":\"x\",\"charging\":\"1x\",\"charger_connect\":\"yes\"}}"};
 for(unsigned i=0;i<sizeof bad/sizeof bad[0];i++){parse_snapshot(&d,bad[i]);assert(d.bat_percent==-1&&d.charging==-1&&d.charger_connect==-1);assert(!strcmp(tf_battery_class(d.charging,d.charger_connect),"unknown"));}
 assert(parse_snapshot(&d,"{\"battery\":{\"percent\":0,\"charging\":\"1\",\"charger_connect\":\"1\"}}"));assert(d.bat_percent==0&&d.charging==1&&d.charger_connect==1);
 assert(tf_battery_fill(-1)==0&&tf_battery_fill(0)==0&&tf_battery_fill(49)==5&&tf_battery_fill(100)==10&&tf_battery_fill(101)==0);
 puts("PASS: actual battery parser preserves enum/unknown/zero; charge versus plugged idle/full; 100% does not imply full; bounded icon fill");return 0;
}
'@
[IO.File]::WriteAllText("$root/build-preview/test-battery.c",$source.Replace('PARSER',$parse))
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "-I$root/upstream/include" "$root/build-preview/test-battery.c" "$root/upstream/src/json.c" -o "$root/bin/test-battery.exe"
if($LASTEXITCODE -ne 0){throw 'Battery test build failed'}
& "$root/bin/test-battery.exe"
if($LASTEXITCODE -ne 0){throw 'Battery parser/state test failed'}
