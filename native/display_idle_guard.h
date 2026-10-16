/* Own finite equivalent of the factory's 180000ms post-LCD-off timer.
 * Never acquires/releases the original auto-sleep lock. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_DISPLAY_IDLE_GUARD_H
#define TF_DISPLAY_IDLE_GUARD_H
#include "factory_guard.h"
typedef struct {tf_factory_guard guard;int off_cycle;} tf_display_idle_guard;
static int tf_idle_init(tf_display_idle_guard*p,const tf_factory_guard*transition){
 if(!p||!transition||!transition->valid)return 0;
 memset(p,0,sizeof *p);p->guard.io=transition->io;
 int n=snprintf(p->guard.name,sizeof p->guard.name,"%s_idle",transition->name);
 p->guard.valid=n>0&&(size_t)n<sizeof p->guard.name;return p->guard.valid;
}
/* Must precede changing an awake LCD to off. A repeated off request, including
 * after lease expiry, cannot restart the original three-minute delay. */
static int tf_idle_before_off(tf_display_idle_guard*p,int previous,int next){
 if(!p||!p->guard.valid||previous<0||previous>255||next<0||next>255)return 0;
 if(previous==0||next>0||p->off_cycle)return 1;
 if(!tf_guard_acquire_timeout(&p->guard,180))return 0;
 p->off_cycle=1;return 1;
}
/* Only a successfully observed original backlight lock can replace this lease.
 * Leaving an off lease for the supervisor on exit is deliberate: cleanup must
 * not open a sleep window before the original provider is stable. */
static int tf_idle_confirm_on(tf_display_idle_guard*p,int brightness,int lcd_lock){
 if(!p||!p->guard.valid)return 0;
 if(brightness<=0)return 1;
 if(lcd_lock!=1)return 0;
 if(!tf_guard_release(&p->guard))return 0;p->off_cycle=0;return 1;
}
#endif
