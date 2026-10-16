/* Independent lock-screen chart scopes populated only by distinct samples. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_LOCKSCREEN_CHART_H
#define TF_LOCKSCREEN_CHART_H
#include "rate_history.h"
typedef struct{tf_rate_history scope[2];int initialized,mode,current;}tf_lock_chart;
static int tf_lock_chart_sample(tf_lock_chart*c,int mode,long stamp,double rx,double tx){
 if(!c->initialized){tf_rate_init(&c->scope[0]);tf_rate_init(&c->scope[1]);c->mode=-1;c->initialized=1;}
 if(mode<0||mode>1||stamp<0){c->mode=-1;c->current=0;return 0;}
 if(mode!=c->mode){tf_rate_init(&c->scope[mode]);c->mode=mode;}c->current=1;
 return tf_rate_push(&c->scope[mode],stamp,rx,tx);
}
#endif
