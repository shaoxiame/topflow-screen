$ErrorActionPreference='Stop'
$root=$PSScriptRoot
New-Item -ItemType Directory -Force "$root/build-preview","$root/bin","$root/preview" | Out-Null
$source=@'
#include <assert.h>
#include <stdio.h>
#include "transition.h"
int main(void){uint16_t old[]={1,2,3,4,900,901,5,6,7,8,902,903},next[]={101,102,103,104,800,801,105,106,107,108,802,803},out[12];for(int i=0;i<12;i++)out[i]=777;
 tf_slide_frame(out,old,next,4,2,6,1,-1);assert(out[0]==104&&out[1]==1&&out[3]==3&&out[6]==108&&out[7]==5&&out[4]==777&&out[5]==777);
 tf_slide_frame(out,old,next,4,2,6,1,1);assert(out[0]==2&&out[2]==4&&out[3]==101&&out[6]==6&&out[9]==105&&out[10]==777);
 tf_slide_frame(out,old,next,4,2,6,0,1);assert(out[0]==1&&out[3]==4);tf_slide_frame(out,old,next,4,2,6,4,1);assert(out[0]==101&&out[3]==104);
 tf_slide_frame(out,old,next,4,2,6,4,-1);assert(out[0]==101&&out[3]==104&&out[6]==105&&out[9]==108);
 tf_slide_frame(out,old,next,4,2,6,5,-1);assert(out[0]==101&&out[4]==777);
 puts("PASS: upright slide: next moves old page left, previous moves right; full endpoints; row pitch/padding; bounds");return 0;}
'@
[IO.File]::WriteAllText("$root/build-preview/test-transition.c",$source)
& "$root/toolchain/zig-x86_64-windows-0.14.1/zig.exe" cc -target x86_64-windows-gnu "-I$root" "$root/build-preview/test-transition.c" -o "$root/bin/test-transition.exe"
if($LASTEXITCODE -ne 0){throw 'Transition test build failed'}
& "$root/bin/test-transition.exe"
if($LASTEXITCODE -ne 0){throw 'Transition tests failed'}
