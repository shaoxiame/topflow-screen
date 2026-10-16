/* SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * Gestures operate in logical screen coordinates, after evdev transforms.
 * Deliberately ambiguous diagonal drags do nothing; they never become taps.
 */
#ifndef TOPFLOW_GESTURE_H
#define TOPFLOW_GESTURE_H
#include <stdlib.h>
enum tf_gesture { TF_NONE, TF_TAP, TF_NEXT, TF_PREVIOUS, TF_SCROLL };
static inline int tf_tap_eligible(int max_distance_squared) {
    return max_distance_squared <= 14 * 14;
}
static inline enum tf_gesture tf_classify_gesture(int x0,int y0,int x1,int y1,
                                                 int tap_eligible,int main_page,
                                                 int can_scroll,int modal) {
    int dx=x1-x0,dy=y1-y0,ax=abs(dx),ay=abs(dy);
    if(tap_eligible && dx*dx+dy*dy<=14*14) return TF_TAP;
    if(!modal && main_page && ax>=56 && ax>=ay*2)
        return dx<0?TF_NEXT:TF_PREVIOUS;
    if(can_scroll && ay>=20 && ay*10>=ax*13)
        return TF_SCROLL;
    return TF_NONE;
}
static inline int tf_next_page(int current,enum tf_gesture gesture,int count) {
    if(current<0||current>=count||count<=0)return current;
    return gesture==TF_NEXT?(current+1)%count:
           gesture==TF_PREVIOUS?(current+count-1)%count:current;
}
#endif
