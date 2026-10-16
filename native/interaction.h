/* Bounded, monotonic touch motion. No timers, I/O or background workers. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_INTERACTION_H
#define TF_INTERACTION_H
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
enum {TF_DRAG_NONE,TF_DRAG_VERTICAL,TF_DRAG_HORIZONTAL};
typedef struct{int down,mode,x0,y0,scroll0,direction,offset;}tf_drag;
typedef struct{int active,from,to;uint32_t began,duration,last_frame;}tf_settle;
static int tf_motion_clamp(int v,int maximum){return v<0?0:v>maximum?maximum:v;}
static void tf_drag_reset(tf_drag*d){memset(d,0,sizeof *d);}
static void tf_drag_begin(tf_drag*d,int x,int y,int scroll){tf_drag_reset(d);d->down=1;d->x0=x;d->y0=y;d->scroll0=scroll;}
static int tf_drag_move(tf_drag*d,int x,int y,int swipe,int scroll,int maximum,int width){
 if(!d->down)return TF_DRAG_NONE;int dx=x-d->x0,dy=y-d->y0,ax=abs(dx),ay=abs(dy);
 if(!d->mode){if(swipe&&ax>=12&&ax*10>=ay*13){d->mode=TF_DRAG_HORIZONTAL;d->direction=dx<0?1:-1;}
  else if(scroll&&ay>=12&&ay*10>=ax*13)d->mode=TF_DRAG_VERTICAL;}
 if(d->mode==TF_DRAG_HORIZONTAL)d->offset=tf_motion_clamp(-dx*d->direction,width);
 else if(d->mode==TF_DRAG_VERTICAL)d->offset=tf_motion_clamp(d->scroll0-dy,maximum);
 return d->mode;
}
static void tf_settle_begin(tf_settle*s,int from,int to,uint32_t now){s->active=1;s->from=from;s->to=to;s->began=now;s->last_frame=now-16;s->duration=144;}
/* Time rather than frame count determines the end; slow submissions skip ahead. */
static int tf_settle_frame(tf_settle*s,uint32_t now,int*out){
 if(!s->active)return 0;uint32_t elapsed=now-s->began;
 if(elapsed>=s->duration){*out=s->to;s->active=0;return 1;}
 if((uint32_t)(now-s->last_frame)<16)return 0;s->last_frame=now;
 double t=(double)elapsed/s->duration,ease=1-(1-t)*(1-t)*(1-t);
 *out=s->from+(int)((s->to-s->from)*ease);return 1;
}
#endif
