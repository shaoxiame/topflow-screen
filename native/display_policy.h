/* Evidence-backed display policy; no I/O or credentials. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_DISPLAY_POLICY_H
#define TF_DISPLAY_POLICY_H
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <limits.h>
typedef struct {
 int pin_enabled,automatic,brightness,timeout_seconds,wakeup_periodic;
 int sensor_enabled,sensor_lux,live_brightness,max_brightness;
} tf_display_config;
typedef struct {
 tf_display_config config;
 uint32_t last_activity,last_sensor,last_ramp;
 int initialized,on,locked,brightness,sensor_valid;
 int auto_target,auto_filtered_q8,auto_history[3],auto_history_next;
} tf_display_policy;
enum tf_display_result { TF_DISPLAY_INVALID=-1,TF_DISPLAY_NO_CHANGE=0,TF_DISPLAY_LEVEL=1,TF_DISPLAY_SLEEP=2 };
static void tf_display_config_empty(tf_display_config*c){memset(c,0,sizeof *c);c->pin_enabled=c->automatic=c->brightness=c->timeout_seconds=c->wakeup_periodic=c->sensor_enabled=c->sensor_lux=c->live_brightness=c->max_brightness=INT_MIN;}
static int tf_display_integer(const char*s,int lo,int hi,int*value){if(!s||!*s)return 0;char*end;long n=strtol(s,&end,10);if(end==s||n<lo||n>hi)return 0;while(isspace((unsigned char)*end))end++;if(*end)return 0;*value=(int)n;return 1;}
/* Original B22 uses an inverted enum: 0 requires PIN, 1 disables it.
 * Boot callers compare ZTD_GetLcdLockStatus output with zero before passing
 * the boolean lockpin flag (0x4343f8..434440 and 0x434a24..434a48).
 * Keep the rest of this renderer on a normalized enabled boolean. */
static int tf_display_factory_pin_enabled(int raw,int*enabled){if(!enabled||(raw!=0&&raw!=1))return 0;*enabled=raw==0;return 1;}
/* Actual sensor returns "3 lux"; accept this exact unit or the SDK integer form. */
static int tf_display_lux(const char*s,int*value){if(!s||!*s)return 0;char*end;long n=strtol(s,&end,10);if(end==s||n<0||n>10000000)return 0;while(isspace((unsigned char)*end))end++;if(!strncmp(end,"lux",3))end+=3;while(isspace((unsigned char)*end))end++;if(*end)return 0;*value=(int)n;return 1;}
/* libzte_SDKowrt.so calculateBrightness @0x183e8, integer arithmetic. */
static int tf_display_curve(int lux){if(lux<0)return -1;if(lux<=1)return 10;if(lux<=40)return 10+(lux-2)*125/38;if(lux<=200)return 135+(lux-40)*120/160;return 255;}
/* Persistent policy and transient driver readiness are different facts. The
 * original owner may disable a sensor while exiting; that does not turn a
 * previously valid brightness policy into unknown configuration. Runtime may
 * proceed only after independently restoring and observing driver readiness. */
static int tf_display_policy_valid(const tf_display_config*c){return c&&(c->pin_enabled==0||c->pin_enabled==1)&&(c->automatic==0||c->automatic==1)&&c->brightness>=1&&c->brightness<=255&&(c->timeout_seconds==-1||(c->timeout_seconds>=1&&c->timeout_seconds<=86400))&&(c->wakeup_periodic==0||c->wakeup_periodic==1);}
static int tf_display_live_valid(const tf_display_config*c){return c&&c->live_brightness>=0&&c->live_brightness<=255&&c->max_brightness==255;}
static int tf_display_sensor_valid(const tf_display_config*c){return c&&(c->sensor_enabled==1&&c->sensor_lux>=0&&c->sensor_lux<=10000000);}
static int tf_display_valid(const tf_display_config*c){return tf_display_policy_valid(c)&&tf_display_live_valid(c)&&(!c->automatic||tf_display_sensor_valid(c));}
static int tf_display_same_policy(const tf_display_config*a,const tf_display_config*b){return tf_display_policy_valid(a)&&tf_display_policy_valid(b)&&a->pin_enabled==b->pin_enabled&&a->automatic==b->automatic&&a->brightness==b->brightness&&a->timeout_seconds==b->timeout_seconds&&a->wakeup_periodic==b->wakeup_periodic;}
/* A runtime settings refresh is not another takeover. Allow externally changed
 * brightness/mode/timeout, while authentication and unsupported periodic wake
 * remain the exact policy under which this owner was started. */
static int tf_display_external_policy_compatible(const tf_display_config*a,const tf_display_config*b){return tf_display_policy_valid(a)&&tf_display_policy_valid(b)&&a->pin_enabled==b->pin_enabled&&a->wakeup_periodic==0&&b->wakeup_periodic==0;}

/* A getter is not an authentication protocol. Never substitute a local PIN. */
static const char*tf_display_preflight_reason_supported(const tf_display_config*c,int pin_handover){if(!tf_display_policy_valid(c)||!tf_display_live_valid(c))return "DISPLAY_STATE_UNKNOWN";if(c->pin_enabled!=0&&!pin_handover)return "FACTORY_PIN_PROTOCOL_UNVERIFIED";if(c->wakeup_periodic!=0)return "FACTORY_PERIODIC_WAKE_UNVERIFIED";return NULL;}
static inline const char*tf_display_preflight_reason(const tf_display_config*c){return tf_display_preflight_reason_supported(c,0);}
/* Filter the original lux curve, not the user's saved brightness. Three-sample
 * median rejects isolated light spikes; Q8 low-pass + eight-level deadband
 * suppress small fluctuations. No allocations, worker, log or persistent state. */
static void tf_display_smoothing_reset(tf_display_policy*p,uint32_t now){int level=p->config.automatic&&p->config.sensor_lux>=0?tf_display_curve(p->config.sensor_lux):p->brightness;p->auto_target=p->brightness;p->auto_filtered_q8=level*256;for(int i=0;i<3;i++)p->auto_history[i]=level;p->auto_history_next=0;p->last_sensor=p->last_ramp=now;p->sensor_valid=p->config.sensor_lux>=0;}
/* Merge observed settings without waking, unlocking, extending idle time, or
 * trusting a transient output read as proof of lifecycle ownership. The caller
 * applies TF_DISPLAY_LEVEL through the existing guarded brightness path. */
static int tf_display_accept_external(tf_display_policy*p,const tf_display_config*c,uint32_t now){
 if(!p||!p->initialized||!tf_display_external_policy_compatible(&p->config,c))return TF_DISPLAY_INVALID;
 int mode_changed=p->config.automatic!=c->automatic;
 int fixed_changed=!c->automatic&&p->config.brightness!=c->brightness;
 tf_display_config next=*c;next.live_brightness=p->brightness;next.max_brightness=p->config.max_brightness;
 if(!tf_display_sensor_valid(&next))next.sensor_lux=-1;
 p->config=next;
 if(mode_changed||fixed_changed)tf_display_smoothing_reset(p,now);
 if(!next.automatic||next.sensor_enabled!=1){p->sensor_valid=0;p->auto_target=p->brightness;}
 if(p->on&&!next.automatic&&p->brightness!=next.brightness){p->brightness=p->auto_target=next.brightness;return TF_DISPLAY_LEVEL;}
 return TF_DISPLAY_NO_CHANGE;
}
static int tf_display_init_supported(tf_display_policy*p,const tf_display_config*c,uint32_t now,int pin_handover){memset(p,0,sizeof *p);p->locked=1;if(!c)return 0;p->config=*c;if(tf_display_preflight_reason_supported(c,pin_handover)||!tf_display_valid(c))return 0;p->initialized=1;p->on=c->live_brightness>0;p->locked=c->pin_enabled;p->brightness=c->live_brightness;p->last_activity=now;tf_display_smoothing_reset(p,now);return 1;}
static inline int tf_display_init(tf_display_policy*p,const tf_display_config*c,uint32_t now){return tf_display_init_supported(p,c,now,0);}
static void tf_display_activity(tf_display_policy*p,uint32_t now){if(p->initialized&&p->on)p->last_activity=now;}
static int tf_display_wake(tf_display_policy*p,uint32_t now){if(!p->initialized)return TF_DISPLAY_INVALID;p->on=1;p->locked=p->config.pin_enabled;p->last_activity=now;p->brightness=p->config.automatic?tf_display_curve(p->config.sensor_lux):p->config.brightness;tf_display_smoothing_reset(p,now);return p->brightness>0?TF_DISPLAY_LEVEL:TF_DISPLAY_INVALID;}
static int tf_display_sleep(tf_display_policy*p){if(!p->initialized)return TF_DISPLAY_INVALID;p->on=0;p->locked=p->config.pin_enabled;p->brightness=p->auto_target=0;return TF_DISPLAY_SLEEP;}
static int tf_display_tick(tf_display_policy*p,uint32_t now,int lux,int sensor_valid,int inhibit_timeout){if(!p->initialized)return TF_DISPLAY_INVALID;if(!p->on)return TF_DISPLAY_NO_CHANGE;if(inhibit_timeout)p->last_activity=now;else if(p->config.timeout_seconds!=-1&&now-p->last_activity>=(uint32_t)p->config.timeout_seconds*1000)return tf_display_sleep(p);if(!p->config.automatic||now-p->last_sensor<1000)return TF_DISPLAY_NO_CHANGE;p->last_sensor=now;p->sensor_valid=sensor_valid&&p->config.sensor_enabled==1&&lux>=0&&lux<=10000000;if(!p->sensor_valid){p->auto_target=p->brightness;return TF_DISPLAY_NO_CHANGE;}int level=tf_display_curve(lux);p->config.sensor_lux=lux;p->auto_history[p->auto_history_next]=level;p->auto_history_next=(p->auto_history_next+1)%3;int a=p->auto_history[0],b=p->auto_history[1],c=p->auto_history[2],median=a>b?(b>c?b:a>c?c:a):(a>c?a:b>c?c:b);p->auto_filtered_q8+=(median*256-p->auto_filtered_q8)/4;int target=(p->auto_filtered_q8+128)/256;if(abs(target-p->auto_target)>=8)p->auto_target=target;return TF_DISPLAY_NO_CHANGE;}
/* Run from the existing idle loop, never the draw path. At most ten requests
 * per second during adaptation, three hardware levels per step. A late loop
 * does not catch up in one jump; stale/invalid samples freeze the ramp. */
static int tf_display_animate(tf_display_policy*p,uint32_t now){if(!p->initialized)return TF_DISPLAY_INVALID;if(!p->on||!p->config.automatic||!p->sensor_valid||now-p->last_sensor>2500||now-p->last_ramp<100)return TF_DISPLAY_NO_CHANGE;p->last_ramp=now;int delta=p->auto_target-p->brightness;if(!delta)return TF_DISPLAY_NO_CHANGE;int step=(abs(delta)+7)/8;if(step>3)step=3;p->brightness+=delta>0?step:-step;return TF_DISPLAY_LEVEL;}
#endif
