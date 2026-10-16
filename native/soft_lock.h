/* Local accidental-touch guard. No credential, I/O or factory policy changes. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_SOFT_LOCK_H
#define TF_SOFT_LOCK_H
#include <stdint.h>
#include <string.h>
#define TF_SOFT_HOLD_MS 1000u
#define TF_SOFT_LEFT 40
#define TF_SOFT_TOP 310
#define TF_SOFT_WIDTH 240
#define TF_SOFT_HEIGHT 64
#define TF_SOFT_PROGRESS_X 56
#define TF_SOFT_PROGRESS_Y 386
#define TF_SOFT_PROGRESS_WIDTH 208
#define TF_SOFT_PROGRESS_HEIGHT 4
typedef struct{int locked,down,holding,release_required,block_release,progress;uint32_t began,last_frame;}tf_soft_lock;
enum tf_soft_result{TF_SOFT_IDLE=0,TF_SOFT_PROGRESS=1,TF_SOFT_UNLOCK=2};
static void tf_soft_lock_reset(tf_soft_lock*p,int pin_enabled){memset(p,0,sizeof *p);p->locked=!pin_enabled;p->release_required=p->locked;}
static int tf_soft_lock_inside(int x,int y){return x>=TF_SOFT_LEFT&&x<TF_SOFT_LEFT+TF_SOFT_WIDTH&&y>=TF_SOFT_TOP&&y<TF_SOFT_TOP+TF_SOFT_HEIGHT;}
static int tf_soft_lock_cancel(tf_soft_lock*p){int changed=p->progress!=0;p->progress=p->holding=p->down=0;p->release_required=1;return changed?TF_SOFT_PROGRESS:TF_SOFT_IDLE;}
/* A press must begin inside after an observed release. Moving in from outside
 * or leaving and returning cannot complete a hold. The unlocking release is
 * consumed separately so it never becomes a tap on the newly visible page. */
static int tf_soft_lock_touch(tf_soft_lock*p,uint32_t now,int pressed,int x,int y,int eligible){
 if(!p->locked){if(!pressed)p->block_release=0;return TF_SOFT_IDLE;}
 if(!eligible)return tf_soft_lock_cancel(p);
 if(!pressed){int changed=p->progress!=0;p->progress=p->holding=p->down=p->release_required=0;return changed?TF_SOFT_PROGRESS:TF_SOFT_IDLE;}
 if(p->release_required)return TF_SOFT_IDLE;
 if(!p->down){p->down=1;if(!tf_soft_lock_inside(x,y))return tf_soft_lock_cancel(p);p->holding=1;p->began=p->last_frame=now;return TF_SOFT_IDLE;}
 if(!p->holding||!tf_soft_lock_inside(x,y))return tf_soft_lock_cancel(p);
 uint32_t elapsed=now-p->began;if(elapsed>=TF_SOFT_HOLD_MS){p->locked=p->holding=0;p->progress=1000;p->block_release=1;return TF_SOFT_UNLOCK;}
 if(now-p->last_frame<40)return TF_SOFT_IDLE;p->last_frame=now;p->progress=(int)elapsed;return TF_SOFT_PROGRESS;
}
#endif
