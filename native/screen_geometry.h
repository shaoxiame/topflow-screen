/* Logical damage rectangles share the renderer's board orientation. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_SCREEN_GEOMETRY_H
#define TF_SCREEN_GEOMETRY_H
#include "devui_config.h"
static int tf_screen_damage(int width,int height,int x,int y,int w,int h,int*out){
 if(!out||width<1||height<1||w<1||h<1)return 0;
 long long right=(long long)x+w-1,bottom=(long long)y+h-1;
 if(right<0||bottom<0||x>=width||y>=height)return 0;
 if(x<0)x=0;if(y<0)y=0;if(right>=width)right=width-1;if(bottom>=height)bottom=height-1;
#if DEVUI_ROTATE_180
 out[0]=width-1-(int)right;out[1]=height-1-(int)bottom;out[2]=width-1-x;out[3]=height-1-y;
#else
 out[0]=x;out[1]=y;out[2]=(int)right;out[3]=(int)bottom;
#endif
 return 1;
}
static int tf_screen_slide_direction(int logical){return DEVUI_ROTATE_180?-logical:logical;}
#endif
