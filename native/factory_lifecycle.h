/* Display/sleep transaction coordinator. No syscalls, credentials or SDK init.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Protocol evidence: analysis/factory-lifecycle-protocol.txt.
 * This is NOT a complete transport/provider implementation. Callers must supply
 * every capability below and perform the specified action/readback contracts.
 */
#ifndef TF_FACTORY_LIFECYCLE_H
#define TF_FACTORY_LIFECYCLE_H
#include <stdint.h>
#include <string.h>

enum tf_fl_capability {
 TF_FL_DISPLAY_IO=1u, TF_FL_LCD_EVENT=2u, TF_FL_SLEEP_LISTENER=4u,
 TF_FL_DEVICEUI_PROVIDER=8u, TF_FL_LOCK_OBSERVATION=16u,
 TF_FL_OWN_GUARD=32u, TF_FL_FACTORY_RECOVERY=64u,
 TF_FL_AUTHENTICATION=128u, TF_FL_REQUIRED=255u
};
enum tf_fl_phase {
 TF_FL_NEW,TF_FL_PREPARED,TF_FL_GUARD,TF_FL_DISPLAY,TF_FL_EVENT,
 TF_FL_OBSERVE,TF_FL_RELEASE,TF_FL_READY,TF_FL_RECOVER,
 TF_FL_RECOVERY_RELEASE,TF_FL_FACTORY,TF_FL_BLOCKED
};
enum tf_fl_action {
 TF_FL_NONE,TF_FL_ACQUIRE_OWN_GUARD,TF_FL_SET_BRIGHTNESS,
 TF_FL_EMIT_LCD,TF_FL_VERIFY_LCD_LOCK,TF_FL_RELEASE_OWN_GUARD,
 TF_FL_RESTORE_FACTORY
};
enum tf_fl_error {
 TF_FL_OK,TF_FL_MISSING_CAPABILITY,TF_FL_UNKNOWN_STATE,TF_FL_VENDOR_LOCK_PRESENT,
 TF_FL_WRONG_OWNER,TF_FL_FRAME_NOT_READY,TF_FL_BUSY,TF_FL_IO_FAILURE,
 TF_FL_READBACK_MISMATCH,TF_FL_TIMEOUT,TF_FL_PROVIDER_LOST
};
typedef struct {
 int original_present,original_provider_present,sleep_provider_present;
 int config_known,authentication_ready,periodic_wake_ready;
 int brightness,lcd_lock_present,original_internal_lock_present;
} tf_fl_snapshot;
typedef struct {
 enum tf_fl_action action;uint32_t epoch;int value;
} tf_fl_command;
typedef struct {
 enum tf_fl_phase phase;enum tf_fl_error error;
 uint32_t capabilities,epoch,started_ms;
 int brightness,target,guard_attempted,guard_held,needs_display,needs_event;
 int provider_ready,auth_ready;
} tf_factory_lifecycle;

#define TF_FL_TRANSITION_TIMEOUT_MS 3000u
static void tf_fl_init(tf_factory_lifecycle*p){memset(p,0,sizeof *p);p->phase=TF_FL_NEW;p->brightness=-1;}
static int tf_fl_bool(int value){return value==0||value==1;}
static int tf_fl_prepare(tf_factory_lifecycle*p,uint32_t caps,const tf_fl_snapshot*s){
 if(p->phase!=TF_FL_NEW&&p->phase!=TF_FL_FACTORY){p->error=TF_FL_BUSY;return 0;}
 tf_fl_init(p);p->capabilities=caps;
 if((caps&TF_FL_REQUIRED)!=TF_FL_REQUIRED){p->error=TF_FL_MISSING_CAPABILITY;return 0;}
 if(!s||s->config_known!=1||s->authentication_ready!=1||s->periodic_wake_ready!=1||
    !tf_fl_bool(s->lcd_lock_present)||
    s->brightness<0||s->brightness>255||!tf_fl_bool(s->original_internal_lock_present)){
  p->error=TF_FL_UNKNOWN_STATE;return 0;
 }
 if(s->original_present!=1||s->original_provider_present!=1||s->sleep_provider_present!=1){p->error=TF_FL_WRONG_OWNER;return 0;}
 /* A vendor lock is not ours to delete; sourceId is not an ownership barrier. */
 if(s->original_internal_lock_present){p->error=TF_FL_VENDOR_LOCK_PRESENT;return 0;}
 if((s->brightness>0)!=s->lcd_lock_present){
  p->error=TF_FL_UNKNOWN_STATE;return 0;
 }
 p->brightness=s->brightness;p->auth_ready=1;p->phase=TF_FL_PREPARED;return 1;
}
static void tf_fl_recover(tf_factory_lifecycle*p,enum tf_fl_error reason){
 p->error=reason;p->phase=TF_FL_RECOVER;p->provider_ready=0;
 /* Keep any owned transition guard until the original provider is stable. */
 ++p->epoch;
}
static void tf_fl_start_transition(tf_factory_lifecycle*p,int target,uint32_t now,int resync){
 ++p->epoch;p->started_ms=now;p->target=target;p->needs_display=target!=p->brightness;
 p->needs_event=resync||((target>0)!=(p->brightness>0));p->guard_attempted=0;
 p->error=TF_FL_OK;
 if(p->needs_event){p->guard_attempted=1;p->phase=TF_FL_GUARD;}
 else p->phase=p->needs_display?TF_FL_DISPLAY:TF_FL_READY;
}
/* Call only after original PID is gone, new provider/listeners are registered,
 * and a complete safe first frame (possibly a locked frame) has been generated.
 * No authentication wait is needed to report a locked first frame as ready.
 */
static int tf_fl_adopt(tf_factory_lifecycle*p,int original_gone,int providers_ready,
                      int live_brightness,int frame_ready,uint32_t now){
 if(p->phase!=TF_FL_PREPARED){p->error=TF_FL_WRONG_OWNER;return 0;}
 if(original_gone!=1||providers_ready!=1||live_brightness<0||live_brightness>255){
  tf_fl_recover(p,TF_FL_WRONG_OWNER);return 0;
 }
 if(!frame_ready){tf_fl_recover(p,TF_FL_FRAME_NOT_READY);return 0;}
 p->provider_ready=1;p->brightness=live_brightness;tf_fl_start_transition(p,live_brightness,now,1);return 1;
}
static int tf_fl_request(tf_factory_lifecycle*p,int target,int frame_ready,uint32_t now){
 if(p->phase!=TF_FL_READY||!p->provider_ready){p->error=TF_FL_BUSY;return 0;}
 if(target<0||target>255){tf_fl_recover(p,TF_FL_UNKNOWN_STATE);return 0;}
 if(target>0&&!frame_ready){p->error=TF_FL_FRAME_NOT_READY;return 0;}
 tf_fl_start_transition(p,target,now,0);return 1;
}
/* A sleep-service restart/re-registration requires resubscription first, then
 * fresh physical brightness readback and LCD resynchronization. Never replay an
 * old desired brightness as if it were the observed hardware state. */
static int tf_fl_resync(tf_factory_lifecycle*p,int subscriptions_ready,int observed_brightness,
                      int frame_ready,uint32_t now){
 if(p->phase!=TF_FL_READY||subscriptions_ready!=1){tf_fl_recover(p,TF_FL_PROVIDER_LOST);return 0;}
 if(observed_brightness<0||observed_brightness>255||!frame_ready){tf_fl_recover(p,TF_FL_UNKNOWN_STATE);return 0;}
 p->brightness=observed_brightness;tf_fl_start_transition(p,observed_brightness,now,1);return 1;
}
static tf_fl_command tf_fl_next(const tf_factory_lifecycle*p){
 tf_fl_command c={TF_FL_NONE,p->epoch,p->target};
 switch(p->phase){
 case TF_FL_GUARD:c.action=TF_FL_ACQUIRE_OWN_GUARD;c.value=1;break;
 case TF_FL_DISPLAY:c.action=TF_FL_SET_BRIGHTNESS;break;
 case TF_FL_EVENT:c.action=TF_FL_EMIT_LCD;c.value=p->target>0;break;
 case TF_FL_OBSERVE:c.action=TF_FL_VERIFY_LCD_LOCK;c.value=p->target>0;break;
 case TF_FL_RELEASE:case TF_FL_RECOVERY_RELEASE:c.action=TF_FL_RELEASE_OWN_GUARD;c.value=0;break;
 case TF_FL_RECOVER:c.action=TF_FL_RESTORE_FACTORY;c.value=0;break;
 default:break;
 }return c;
}
/* ACK contracts:
 * guard acquisition/release: observed is readback presence of OUR OWN lock;
 * display: observed is a fresh brightness readback, not the requested value;
 * LCD event: success only says delivered; next action separately verifies the
 * sleep manager's zteSleepBacklight lock. Mismatch remains pending until timeout.
 * restore: success+observed=1 means custom processes/resources are gone and the
 * original PID/birth/provider are stable; it must never mean just start submitted.
 */
static int tf_fl_ack(tf_factory_lifecycle*p,tf_fl_command c,int success,int observed,uint32_t now){
 tf_fl_command expected=tf_fl_next(p);
 if(c.epoch!=expected.epoch||c.action!=expected.action||c.action==TF_FL_NONE)return 0;
 if(p->phase<TF_FL_RECOVER&&(uint32_t)(now-p->started_ms)>=TF_FL_TRANSITION_TIMEOUT_MS){tf_fl_recover(p,TF_FL_TIMEOUT);return -1;}
 if(!success){
  if(p->phase==TF_FL_RECOVER||p->phase==TF_FL_RECOVERY_RELEASE){p->phase=TF_FL_BLOCKED;p->error=TF_FL_IO_FAILURE;}
  else tf_fl_recover(p,TF_FL_IO_FAILURE);
  return -1;
 }
 switch(p->phase){
 case TF_FL_GUARD:
  if(observed!=1){tf_fl_recover(p,TF_FL_READBACK_MISMATCH);return -1;}
  p->guard_held=1;p->phase=p->needs_display?TF_FL_DISPLAY:TF_FL_EVENT;break;
 case TF_FL_DISPLAY:
  if(observed!=p->target){tf_fl_recover(p,TF_FL_READBACK_MISMATCH);return -1;}
  p->brightness=observed;p->phase=p->needs_event?TF_FL_EVENT:TF_FL_READY;break;
 case TF_FL_EVENT:p->phase=TF_FL_OBSERVE;break;
 case TF_FL_OBSERVE:
  if(!tf_fl_bool(observed)){tf_fl_recover(p,TF_FL_READBACK_MISMATCH);return -1;}
  if(observed!=(p->target>0)){
   if((uint32_t)(now-p->started_ms)>=TF_FL_TRANSITION_TIMEOUT_MS){tf_fl_recover(p,TF_FL_TIMEOUT);return -1;}
   return 0;
  }p->phase=TF_FL_RELEASE;break;
 case TF_FL_RELEASE:
  if(observed!=0){tf_fl_recover(p,TF_FL_READBACK_MISMATCH);return -1;}
  p->guard_held=0;p->guard_attempted=0;p->phase=TF_FL_READY;break;
 case TF_FL_RECOVER:
  if(observed!=1){p->phase=TF_FL_BLOCKED;p->error=TF_FL_READBACK_MISMATCH;return -1;}
  p->phase=p->guard_attempted?TF_FL_RECOVERY_RELEASE:TF_FL_FACTORY;break;
 case TF_FL_RECOVERY_RELEASE:
  if(observed!=0){p->phase=TF_FL_BLOCKED;p->error=TF_FL_READBACK_MISMATCH;return -1;}
  p->guard_held=0;p->guard_attempted=0;p->phase=TF_FL_FACTORY;break;
 default:return 0;
 }return 1;
}
static void tf_fl_tick(tf_factory_lifecycle*p,uint32_t now,int providers_alive){
 if(p->phase==TF_FL_NEW||p->phase==TF_FL_PREPARED||p->phase>=TF_FL_RECOVER)return;
 if(!providers_alive){tf_fl_recover(p,TF_FL_PROVIDER_LOST);return;}
 if(p->phase!=TF_FL_READY&&(uint32_t)(now-p->started_ms)>=TF_FL_TRANSITION_TIMEOUT_MS)tf_fl_recover(p,TF_FL_TIMEOUT);
}
static int tf_fl_input_allowed(const tf_factory_lifecycle*p,int unlocked){return p->phase==TF_FL_READY&&p->brightness>0&&p->provider_ready&&p->auth_ready&&unlocked;}
#endif
