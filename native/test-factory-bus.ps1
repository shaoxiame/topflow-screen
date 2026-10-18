$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$zig=Join-Path $root 'toolchain/zig-x86_64-windows-0.14.1/zig.exe'
$out=Join-Path $root 'build-preview'
$source=@'
#include <assert.h>
#include <stdio.h>
#include "factory_bus_logic.h"
int main(void){
 assert(sizeof(tf_bus_packet)==16);
 for(unsigned i=0;i<64;i++)for(unsigned v=0;v<5;v++){
  tf_bus_packet p={TF_BUS_MAGIC,i,1,v};
  int want=((i==TF_BUS_LCD||i==TF_BUS_LOGIN)&&v<=1)||((i==TF_BUS_PING||i==TF_BUS_STOP)&&v==0)||(i==TF_BUS_TOUCH&&v==1)||((i==TF_BUS_QUICKEN_COMPLETE||i==TF_BUS_POWEROFF_COMPLETE)&&v>0);
  assert(tf_bus_command_valid(&p)==want);
  p.magic=0;assert(!tf_bus_command_valid(&p));p.magic=TF_BUS_MAGIC;p.sequence=0;assert(!tf_bus_command_valid(&p));
 }
 assert(!tf_bus_command_valid(NULL));assert(!tf_bus_response_valid(NULL));
 tf_bus_packet ack={TF_BUS_MAGIC,TF_BUS_ACK,50,1};assert(tf_bus_response_valid(&ack));
 ack.value=2;assert(!tf_bus_response_valid(&ack));ack.value=0;assert(tf_bus_response_valid(&ack));ack.sequence=0;assert(!tf_bus_response_valid(&ack));
 for(unsigned type=TF_BUS_READY;type<=TF_BUS_FATAL;type++)if(type!=TF_BUS_ACK){tf_bus_packet p={TF_BUS_MAGIC,type,0,0};assert(tf_bus_response_valid(&p));p.sequence=1;assert(!tf_bus_response_valid(&p));p.sequence=0;p.value=1;assert(!tf_bus_response_valid(&p));}
 for(unsigned v=0;v<12;v++){tf_bus_packet p={TF_BUS_MAGIC,TF_BUS_START_STAGE,0,v};assert(tf_bus_response_valid(&p)==(v>=1&&v<=9));p.sequence=1;assert(!tf_bus_response_valid(&p));}
 for(unsigned v=0;v<32;v++){tf_bus_packet p={TF_BUS_MAGIC,TF_BUS_DEVICE_POWER,1,v};assert(tf_bus_response_valid(&p)==(v==1||v==2||v==6||v==10||v==14));p.sequence=0;assert(!tf_bus_response_valid(&p));}
 assert(!strcmp(tf_bus_login_value(1),"ok"));assert(!strcmp(tf_bus_login_value(0),""));assert(!strcmp(tf_bus_login_value(-1),""));
 assert(tf_bus_direct_value("1\r\n",3)==1);assert(tf_bus_direct_value("0\n",2)==0);assert(tf_bus_direct_value("0",1)==0);
 assert(tf_bus_direct_value(NULL,1)==-1);assert(tf_bus_direct_value("",0)==-1);assert(tf_bus_direct_value("true",4)==-1);
 assert(tf_bus_direct_value("1junk",5)==-1);assert(tf_bus_direct_value("01",2)==-1);assert(tf_bus_direct_value("2",1)==-1);assert(tf_bus_direct_value(" 1",2)==-1);
 assert(tf_bus_direct_request("0")==0);assert(tf_bus_direct_request("1")==1);assert(tf_bus_direct_request("1\n")==-1);assert(tf_bus_direct_request(NULL)==-1);
 assert(tf_bus_power_action("gotoSleep")==TF_BUS_SLEEP);assert(tf_bus_power_action("gotoWakeup")==TF_BUS_WAKE);
 assert(!tf_bus_power_action("gotoWakeup; reboot"));assert(!tf_bus_power_action("GOTOSLEEP"));assert(!tf_bus_power_action(NULL));
 assert(tf_bus_power_broadcast_action("goToSleep")==TF_BUS_SLEEP);assert(tf_bus_power_broadcast_action("goToWakeup")==TF_BUS_WAKE);
 assert(!tf_bus_power_broadcast_action("gotoSleep"));assert(!tf_bus_power_action("goToSleep"));
 assert(tf_bus_device_power_action("mode_power_on","")==1);
 assert(!tf_bus_device_power_action("mode_power_on_charger",""));
 assert(tf_bus_device_power_action("mode_power_off","normal")==6);
 assert(tf_bus_device_power_action("mode_power_off","quicken")==6);
 assert(tf_bus_device_power_action("mode_power_off_quickening","")==14);
 assert(tf_bus_device_power_action("mode_power_off_unreal","")==6);
 assert(tf_bus_device_power_action("mode_power_off_quicken","")==2);
 assert(tf_bus_device_power_action("mode_power_off_charger","")==2);
 assert(tf_bus_device_power_action("mode_power_off_charger_quicken","")==2);
 assert(tf_bus_device_power_action("zwrt_mode_lcd_reboot","")==6);
 assert(!tf_bus_device_power_action("zwrt_mode_lcd_reset",""));
 assert(!tf_bus_device_power_action("mode_power_off", "unknown"));
 assert(!tf_bus_device_power_action("mode_power_on",NULL));assert(!tf_bus_device_power_action(NULL,""));
 assert(!tf_bus_device_power_action("goToWakeup",""));assert(!tf_bus_device_power_action("quicken_power_on","1"));
 assert(!tf_bus_device_power_action("mode_power_off_quickening; reboot",""));
 puts("factory-bus: protocol rejection, exact service contracts and event routing passed");return 0;
}
'@
$file=Join-Path $out 'test-factory-bus.c'
[IO.File]::WriteAllText($file,$source,[Text.UTF8Encoding]::new($false))
$binary=Join-Path $out 'test-factory-bus.exe'
& $zig cc -target x86_64-windows-gnu -std=c11 -Wall -Wextra -Werror "-I$root" $file -o $binary
if($LASTEXITCODE -ne 0){throw 'Factory bus protocol test compile failed'}
& $binary
if($LASTEXITCODE -ne 0){throw 'Factory bus protocol tests failed'}
