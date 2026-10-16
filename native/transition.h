/* Finite RGB565 slide composition. No timers/background animation. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_TRANSITION_H
#define TF_TRANSITION_H
#include <stdint.h>
#include <string.h>
static void tf_slide_frame_region(uint16_t*dst,const uint16_t*old,const uint16_t*next,int width,int height,int pitch,int shift,int direction,int top){
 if(!dst||!old||!next||width<1||height<1||pitch<width||shift<0||shift>width||top<0||top>=height)return;
 for(int y=top;y<height;y++){uint16_t*d=dst+(size_t)y*pitch;const uint16_t*a=old+(size_t)y*pitch,*b=next+(size_t)y*pitch;
  if(direction<0){memcpy(d,b+width-shift,(size_t)shift*sizeof *d);memcpy(d+shift,a,(size_t)(width-shift)*sizeof *d);}
  else{memcpy(d,a+shift,(size_t)(width-shift)*sizeof *d);memcpy(d+width-shift,b,(size_t)shift*sizeof *d);}
 }
}
static void tf_slide_frame(uint16_t*dst,const uint16_t*old,const uint16_t*next,int width,int height,int pitch,int shift,int direction){tf_slide_frame_region(dst,old,next,width,height,pitch,shift,direction,0);}
#endif
