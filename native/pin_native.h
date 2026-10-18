/* No development-device PIN read. Runtime-only RAM credential handling. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_PIN_NATIVE_H
#define TF_PIN_NATIVE_H
#include <sys/file.h>
#include <sys/mman.h>
#include "pin_policy.h"
static tf_pin_policy pin_policy;
static int pin_state_fd=-1,pin_fault=0;
static int(*pin_power_on_hook)(void)=NULL;
static char pin_boot[37],pin_feedback[128];
static uint64_t pin_now(void){struct timespec t;if(clock_gettime(CLOCK_MONOTONIC,&t))return 0;return(uint64_t)t.tv_sec*1000+(uint64_t)t.tv_nsec/1000000;}
static int pin_boot_shape(const char*s){if(strlen(s)!=36)return 0;for(int i=0;i<36;i++){if(i==8||i==13||i==18||i==23){if(s[i]!='-')return 0;}else if(!isxdigit((unsigned char)s[i]))return 0;}return 1;}
static int pin_store(void){if(!pin_policy.enabled)return 1;if(pin_state_fd<0)return 0;char record[128];int n=snprintf(record,sizeof record,"TFPIN1 %s %d %llu\n",pin_boot,pin_policy.failures,(unsigned long long)pin_policy.deadline);if(n<1||n>=(int)sizeof record)return 0;ssize_t w;do{w=pwrite(pin_state_fd,record,(size_t)n,0);}while(w<0&&errno==EINTR);int ok=w==n&&ftruncate(pin_state_fd,n)==0&&fsync(pin_state_fd)==0;memset(record,0,sizeof record);return ok;}
static int pin_open_state(void){char boot[64];if(!display_read_text("/proc/sys/kernel/random/boot_id",boot,sizeof boot)){native_failure_note("PIN_BOOT_ID");return 0;}size_t n=strlen(boot);while(n&&(boot[n-1]=='\n'||boot[n-1]=='\r'))boot[--n]=0;if(!pin_boot_shape(boot)){native_failure_note("PIN_BOOT_ID");return 0;}memcpy(pin_boot,boot,37);int created=1;pin_state_fd=open("/tmp/topflow-screen/pin-state",O_CREAT|O_EXCL|O_RDWR|O_CLOEXEC|O_NOFOLLOW,0600);if(pin_state_fd<0&&errno==EEXIST){created=0;pin_state_fd=open("/tmp/topflow-screen/pin-state",O_RDWR|O_CLOEXEC|O_NOFOLLOW);}if(pin_state_fd<0){native_failure_note("PIN_STATE_OPEN");return 0;}struct stat st;if(fstat(pin_state_fd,&st)||!S_ISREG(st.st_mode)||st.st_uid!=0||st.st_nlink!=1||(st.st_mode&0777)!=0600||st.st_size<0||st.st_size>127||flock(pin_state_fd,LOCK_EX|LOCK_NB)){native_failure_note("PIN_STATE_INVALID");return 0;}
 int failures=0;uint64_t deadline=0,now=pin_now();if(!created){char rec[128],oldboot[37];ssize_t count=pread(pin_state_fd,rec,sizeof rec-1,0);if(count<=0||count>127){native_failure_note("PIN_STATE_INVALID");return 0;}rec[count]=0;if(!tf_pin_record_read(rec,oldboot,&failures,&deadline)){native_failure_note("PIN_STATE_INVALID");return 0;}if(strcmp(oldboot,pin_boot)){failures=0;deadline=0;}else if(deadline>now+300000){native_failure_note("PIN_STATE_INVALID");return 0;}memset(rec,0,sizeof rec);}tf_pin_start(&pin_policy,1,now,failures,deadline);int stored=pin_store();if(!stored)native_failure_note("PIN_STATE_STORE");return stored;}
static int pin_native_init(int enabled){memset(&pin_policy,0,sizeof pin_policy);pin_policy.locked=1;if(enabled!=0&&enabled!=1){native_failure_note("ADOPT_PIN_POLICY");return 0;}pin_policy.enabled=enabled;pin_policy.locked=enabled;if(!enabled)return 1;if(prctl(PR_SET_DUMPABLE,0)<0||mlock(&pin_policy,sizeof pin_policy)<0){native_failure_note("PIN_PROTECT");return 0;}if(!pin_open_state()){pin_fault=1;return 0;}return 1;}
static int pin_native_poll(void){if(tf_pin_poll(&pin_policy,pin_now())&&!pin_store()){pin_fault=1;return 0;}return !pin_fault;}
static void pin_native_cleanup(void){tf_pin_clear(&pin_policy);if(pin_state_fd>=0){close(pin_state_fd);pin_state_fd=-1;}munlock(&pin_policy,sizeof pin_policy);memset(&pin_policy,0,sizeof pin_policy);memset(pin_feedback,0,sizeof pin_feedback);}
static int pin_native_attempt(void){
 if(pin_power_on_hook&&!pin_power_on_hook()){tf_pin_lock(&pin_policy);return TF_PIN_WAIT;}
 if(tf_pin_seconds(&pin_policy,pin_now()))return TF_PIN_WAIT;if(pin_policy.input_len!=4)return TF_PIN_INVALID;
 char credential[16];memset(credential,0,sizeof credential);if(mlock(credential,sizeof credential)<0){pin_fault=1;return TF_PIN_INVALID;}
 char*const args[]={"uci","-q","get","zwrt_deviceui.Screen.Lock_Screen_PIN_Value",NULL};
 int ok=vendor_exec("/sbin/uci",args,NULL,credential,sizeof credential)==0;
 int cancelled=pin_power_on_hook&&!pin_power_on_hook();
 size_t n=strlen(credential);while(n&&(credential[n-1]=='\n'||credential[n-1]=='\r'))credential[--n]=0;
 int result=cancelled?TF_PIN_WAIT:ok?tf_pin_attempt(&pin_policy,credential,pin_now()):TF_PIN_INVALID;
 volatile char*wipe=credential;for(size_t i=0;i<sizeof credential;i++)wipe[i]=0;munlock(credential,sizeof credential);
 /* OEM shutdown cancels this attempt; it is neither a wrong PIN nor a
  * damaged credential store. Preserve retry counters and do not restart UI. */
 if(cancelled){tf_pin_lock(&pin_policy);return TF_PIN_WAIT;}
 if(result==TF_PIN_INVALID||!pin_store()){pin_fault=1;pin_policy.locked=1;return TF_PIN_INVALID;}return result;
}
#endif
