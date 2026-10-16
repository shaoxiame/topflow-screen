/* Fixed read-only original display preflight. No PIN value is read. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_DISPLAY_NATIVE_H
#define TF_DISPLAY_NATIVE_H
#include "display_policy.h"
static tf_display_policy display_policy;
static tf_display_config display_config;
static const char*display_refusal="DISPLAY_STATE_UNKNOWN";
static const char*display_config_failure="ADOPT_CONFIG";
static int(*display_level_hook)(int)=NULL;
static int(*display_auto_sensor_hook)(void)=NULL;
static int display_read_text(const char*path,char*out,size_t cap){FILE*f=fopen(path,"rb");if(!f)return 0;size_t n=fread(out,1,cap-1,f);int ok=!ferror(f)&&feof(f)&&n>0;fclose(f);out[n]=0;return ok;}
static int display_read_number(const char*path,int lo,int hi,int*out){char text[64];return display_read_text(path,text,sizeof text)&&tf_display_integer(text,lo,hi,out);}
static int display_read_lux(int*out){char text[64];return display_read_text("/sys/class/input/input3/driver/lux",text,sizeof text)&&tf_display_lux(text,out);}
static int display_uci_value(const char*text,const char*key,int lo,int hi,int*out){size_t len=strlen(key);int seen=0;const char*p=text;while(*p){const char*e=strchr(p,'\n');size_t n=e?(size_t)(e-p):strlen(p);if(n>len+1&&!memcmp(p,key,len)&&p[len]=='='){if(seen++)return 0;const char*v=p+len+1;size_t z=n-len-1;if(z&&v[z-1]=='\r')z--;if(z>=2&&v[0]=='\''&&v[z-1]=='\''){v++;z-=2;}if(z>=48)return 0;char num[48];memcpy(num,v,z);num[z]=0;if(!tf_display_integer(num,lo,hi,out))return 0;}if(!e)break;p=e+1;}return seen==1;}
static int display_sensor_identity(void){char name[64];if(!display_read_text("/sys/class/input/input3/name",name,sizeof name))return 0;size_t n=strlen(name);while(n&&isspace((unsigned char)name[n-1]))name[--n]=0;return !strcmp(name,"lightsensor-level");}
static int display_read_policy_observed(tf_display_config*c){tf_display_config_empty(c);display_config_failure="ADOPT_CONFIG";char output[2048];char*const args[]={"uci","-q","batch",NULL};const char*commands="show zwrt_deviceui.Screen.Lock_Screen_PIN_Enable_State\nshow zwrt_deviceui.Screen.auto_screen_brightness\nshow zwrt_deviceui.Screen.brightness\nshow zwrt_deviceui.Screen.screen_show_interval\nshow zwrt_deviceui.Screen.screen_wakeup\n";if(vendor_exec("/sbin/uci",args,commands,output,sizeof output)){display_config_failure="ADOPT_POLICY_READ";return 0;}
 int raw_pin;int ok=display_uci_value(output,"zwrt_deviceui.Screen.Lock_Screen_PIN_Enable_State",0,1,&raw_pin)&&tf_display_factory_pin_enabled(raw_pin,&c->pin_enabled)&&display_uci_value(output,"zwrt_deviceui.Screen.auto_screen_brightness",0,1,&c->automatic)&&display_uci_value(output,"zwrt_deviceui.Screen.brightness",1,255,&c->brightness)&&display_uci_value(output,"zwrt_deviceui.Screen.screen_show_interval",-1,86400,&c->timeout_seconds)&&display_uci_value(output,"zwrt_deviceui.Screen.screen_wakeup",0,1,&c->wakeup_periodic);memset(output,0,sizeof output);
 if(!ok||!tf_display_policy_valid(c)){display_config_failure="ADOPT_POLICY_INVALID";return 0;}return 1;}
static int display_read_output(tf_display_config*c){
 if(!display_read_number("/sys/class/leds/led:lcd/brightness",0,255,&c->live_brightness)||!display_read_number("/sys/class/leds/led:lcd/max_brightness",1,255,&c->max_brightness)||!tf_display_live_valid(c)){display_config_failure="ADOPT_BRIGHTNESS";return 0;}
 return 1;}
static int display_sensor_read_enable(int*enabled){char text[64];
 if(!display_read_text("/sys/class/input/input3/driver/enable",text,sizeof text)){display_config_failure="ADOPT_SENSOR_READ";return 0;}
 if(!tf_display_integer(text,0,1,enabled)){display_config_failure="ADOPT_SENSOR_STATE";return 0;}return 1;}
static int display_read_config_observed(tf_display_config*c){
 if(!display_read_policy_observed(c)||!display_read_output(c))return 0;
 if(!display_sensor_identity()){display_config_failure="ADOPT_SENSOR_ID";return 0;}
 if(!display_sensor_read_enable(&c->sensor_enabled))return 0;
 c->sensor_lux=-1;display_read_lux(&c->sensor_lux);return 1;}
static int display_read_config(tf_display_config*c){return display_read_config_observed(c)&&tf_display_valid(c);}
/* A settings page is not a display takeover. A transient lux/driver read must
 * not hide the known persistent settings or prevent switching to fixed light.
 * Keep the stricter config reader above for startup and ownership checks. */
static int display_read_settings_config(tf_display_config*c){
 if(!display_read_policy_observed(c))return 0;
 if(!display_read_output(c)){c->live_brightness=-1;c->max_brightness=-1;}
 c->sensor_enabled=c->sensor_lux=-1;
 if(display_sensor_identity()&&display_sensor_read_enable(&c->sensor_enabled)&&c->sensor_enabled==1)display_read_lux(&c->sensor_lux);
 return 1;
}
static int display_preflight(void){if(!display_read_config_observed(&display_config)){display_refusal="DISPLAY_STATE_UNKNOWN";return 0;}display_refusal=tf_display_preflight_reason_supported(&display_config,1);return !display_refusal;}
/* Only the owning runtime may supply a write callback. Preflight never calls
 * this function. Observe an existing device and follow the verified original
 * init/enable sequence only for a positively observed disabled sensor, once;
 * never invent a lux value or reset a sensor after an unreadable state.
 * Device kernel evidence shows sensor I/O unavailable while QPIC is off. The
 * owning runtime calls this only AFTER DRM has submitted its initial black
 * frame, never between the original and replacement display pipes. */
static int display_sensor_prepare(tf_display_config*c,int(*enable_once)(void),int(*guard_alive)(void)){
 if(!c->automatic)return 1;
 uint32_t began=tick();
 if(tf_http_cancelled){display_config_failure="ADOPT_SENSOR_ENABLE";return 0;}
 if(!guard_alive||!guard_alive()){display_config_failure="ADOPT_GUARD_ACTIVE";return 0;}
 if(!display_sensor_identity()){display_config_failure="ADOPT_SENSOR_ID";return 0;}
 int enabled_once=0;display_config_failure="ADOPT_SENSOR_READ";
 for(int attempt=0;attempt<=20;attempt++){
  if((uint32_t)(tick()-began)>=2000)break;
  if(tf_http_cancelled){display_config_failure="ADOPT_SENSOR_ENABLE";return 0;}
  if(!guard_alive()){display_config_failure="ADOPT_GUARD_ACTIVE";return 0;}
  /* IPC and a single kernel sysfs operation have their own bounds. The
   * monotonic budget prevents slow calls from multiplying our retry window. */
  if((uint32_t)(tick()-began)>=2000)break;
  if(display_sensor_read_enable(&c->sensor_enabled)){
   if((uint32_t)(tick()-began)>=2000){display_config_failure="ADOPT_SENSOR_READ";return 0;}
   if(c->sensor_enabled==0&&!enabled_once){
    enabled_once=1;display_config_failure="ADOPT_SENSOR_ENABLE";if(!enable_once||!enable_once())return 0;
    if((uint32_t)(tick()-began)>=2000)return 0;
   }
   c->sensor_lux=-1;
   if(c->sensor_enabled==1&&display_read_lux(&c->sensor_lux)&&tf_display_sensor_valid(c)){
    if(!guard_alive()){display_config_failure="ADOPT_GUARD_ACTIVE";return 0;}
    if((uint32_t)(tick()-began)>=2000){display_config_failure="ADOPT_SENSOR_LUX";return 0;}return 1;
   }
   display_config_failure=c->sensor_enabled==1?"ADOPT_SENSOR_LUX":"ADOPT_SENSOR_ENABLE";
  }else if(!strcmp(display_config_failure,"ADOPT_SENSOR_STATE"))return 0;
  if(attempt<20)poll(NULL,0,100);
 }
 return 0;
}
/* Exact SDK setters commit these keys; never call SDK init or arbitrary UCI. */
static int display_write_setting(int kind,int value){const char*key=NULL;display_config_failure="DISPLAY_SETTING_INVALID";if(kind==0&&(value==0||value==1))key="auto_screen_brightness";else if(kind==1&&value>=10&&value<=255)key="brightness";else if(kind==2&&(value==-1||value==15||value==30||value==60||value==120))key="screen_show_interval";if(!key||!display_level_hook)return 0;tf_display_config before;if(!display_read_settings_config(&before))return 0;if(before.pin_enabled!=display_policy.config.pin_enabled){display_config_failure="DISPLAY_PIN_POLICY_CHANGED";return 0;}if(kind==1&&before.automatic){display_config_failure="DISPLAY_MODE_CHANGED";return 0;}if(kind==0&&value==1&&!tf_display_sensor_valid(&before)){if(!display_auto_sensor_hook||!display_auto_sensor_hook()){display_config_failure="DISPLAY_AUTO_SENSOR_PREPARE";return 0;}if(!display_read_settings_config(&before)||!tf_display_sensor_valid(&before)||!tf_display_same_policy(&display_policy.config,&before)){display_config_failure="DISPLAY_AUTO_SENSOR_READBACK";return 0;}}if(tf_http_cancelled){display_config_failure="DISPLAY_SETTING_CANCELLED";return 0;}char batch[192],out[256];snprintf(batch,sizeof batch,"set zwrt_deviceui.Screen.%s='%d'\ncommit zwrt_deviceui\n",key,value);char*const args[]={"uci","-q","batch",NULL};if(vendor_exec("/sbin/uci",args,batch,out,sizeof out)){display_config_failure="DISPLAY_SETTING_WRITE";return 0;}tf_display_config after;if(!display_read_settings_config(&after))return 0;if((kind==0?after.automatic:kind==1?after.brightness:after.timeout_seconds)!=value||after.pin_enabled!=before.pin_enabled){display_config_failure="DISPLAY_SETTING_READBACK";return 0;}display_config=after;display_policy.config=after;uint32_t now=tick();tf_display_activity(&display_policy,now);tf_display_smoothing_reset(&display_policy,now);if(backlight_is_on()&&!after.automatic&&kind!=2){int level=after.brightness;if(!display_level_hook(level)){display_config_failure="DISPLAY_OUTPUT_APPLY";return 0;}display_policy.brightness=display_policy.auto_target=level;}return 1;}

#endif
