/* Bounded, non-secret failure record. Never captures stderr or API payloads. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_NATIVE_FAILURE_H
#define TF_NATIVE_FAILURE_H
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
static const char*native_failure_code;
static int native_failure_known(const char*code){
 static const char*const allowed[]={
 "ADOPT_RECEIPT","ADOPT_CONFIG","ADOPT_POLICY_READ","ADOPT_POLICY_INVALID","ADOPT_POLICY_CHANGED","ADOPT_BRIGHTNESS","ADOPT_SENSOR_ID","ADOPT_SENSOR_READ","ADOPT_SENSOR_STATE","ADOPT_SENSOR_INIT","ADOPT_SENSOR_ENABLE","ADOPT_SENSOR_LUX","ADOPT_GUARD_ACTIVE","ADOPT_PIN_POLICY","ADOPT_FACTORY_PRESENT","ADOPT_INTERNAL_LOCK","ADOPT_GUARD_IDENTITY","ADOPT_AUTOSLEEP_LOCK","ADOPT_LIFECYCLE","ADOPT_SLEEP_PROVIDER","ADOPT_IDLE_GUARD",
 "WAKE_SENSOR_GUARD","WAKE_POLICY_READ","WAKE_POLICY_CHANGED","WAKE_SENSOR_PREPARE",
 "BUS_PATH","BUS_SOCKET","BUS_FORK","BUS_EXEC","BUS_READY_TIMEOUT","BUS_EOF","BUS_ULOOP","BUS_CONNECT","BUS_OBJECT","BUS_SUBSCRIBER","BUS_SLEEP_SUBSCRIBE","BUS_REREGISTER","BUS_POWER_EVENT","BUS_PARENT_FD",
 "DISPLAY_POLICY_INIT","PIN_PROTECT","PIN_BOOT_ID","PIN_STATE_OPEN","PIN_STATE_INVALID","PIN_STATE_STORE","UI_RESOURCE","DRM_INIT","DRM_DIMENSIONS","TOUCH_INIT","FONT_INIT","FIRST_FRAME","DISPLAY_ADOPT","BUS_RUNTIME","DISPLAY_RUNTIME","FRAME_RENDER"};
 if(!code)return 0;for(size_t i=0;i<sizeof allowed/sizeof *allowed;i++)if(!strcmp(code,allowed[i]))return 1;return 0;
}
static void native_failure_note(const char*code){if(!native_failure_code&&native_failure_known(code))native_failure_code=code;}
static void native_failure_publish(void){
 if(!native_failure_code)return;
 int directory=open("/tmp/topflow-screen",O_RDONLY|O_DIRECTORY|O_CLOEXEC|O_NOFOLLOW);if(directory<0)return;
 struct stat st;if(fstat(directory,&st)||!S_ISDIR(st.st_mode)||st.st_uid!=0||(st.st_mode&0777)!=0700){close(directory);return;}
 int fd=openat(directory,"renderer.failure",O_WRONLY|O_CREAT|O_CLOEXEC|O_NOFOLLOW|O_NONBLOCK,0600);close(directory);if(fd<0)return;
 if(fstat(fd,&st)||!S_ISREG(st.st_mode)||st.st_uid!=0||st.st_nlink!=1||(st.st_mode&0777)!=0600||st.st_size<0||st.st_size>128){close(fd);return;}
 char record[64];int n=snprintf(record,sizeof record,"TF_NATIVE_FAILURE_V1 %s\n",native_failure_code);
 if(n>0&&(size_t)n<sizeof record){ssize_t written;do{written=pwrite(fd,record,(size_t)n,0);}while(written<0&&errno==EINTR);if(written==n)ftruncate(fd,n);}
 close(fd);
}
#endif
