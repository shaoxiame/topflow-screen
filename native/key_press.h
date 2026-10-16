/* Pure power-key edge reducer. No device access, timers or background work.
 * SPDX-License-Identifier: MIT
 */
#ifndef TOPFLOW_KEY_PRESS_H
#define TOPFLOW_KEY_PRESS_H
#include <stdint.h>
#include <string.h>

#define KEY_EV_NONE  0
#define KEY_EV_SHORT 1
#define KEY_EV_LONG  2
#define KEY_LONG_MS 1200

typedef struct {
    int pressed, long_emitted, ignore_until_release;
    int sync_lost, baseline_needed;
    uint32_t press_ms, press_event_ms;
} tf_key_press_t;

/* held: 0 = known released; 1 = held; -1 = unknown. Existing holds are never
 * converted into a fresh gesture, including after a kernel queue overrun. */
static inline void tf_key_press_baseline(tf_key_press_t *s, int held)
{
    memset(s, 0, sizeof(*s));
    s->ignore_until_release = held != 0;
}

static inline int tf_key_press_tick(tf_key_press_t *s, uint32_t now_ms)
{
    uint32_t elapsed = now_ms - s->press_ms;
    if (!s->sync_lost && !s->ignore_until_release && s->pressed &&
        !s->long_emitted && elapsed <= UINT32_C(0x7fffffff) &&
        elapsed >= KEY_LONG_MS) {
        s->long_emitted = 1;
        return KEY_EV_LONG;
    }
    return KEY_EV_NONE;
}

/* event_ms is the kernel event timestamp (modulo uint32 milliseconds).
 * monotonic_clock says that this fd's timestamps share the caller's clock.
 * Even on older kernels without EVIOCSCLOCKID, the press/release timestamp
 * difference preserves a long gesture queued while the UI was busy. */
static inline int tf_key_press_event(tf_key_press_t *s, unsigned type,
    unsigned code, int value, uint32_t event_ms, int timestamp_valid,
    int monotonic_clock, uint32_t now_ms)
{
    if (type == 0 && code == 3) { /* EV_SYN / SYN_DROPPED */
        tf_key_press_baseline(s, -1);
        s->sync_lost = 1;
        return KEY_EV_NONE;
    }
    if (s->sync_lost) {
        if (type == 0 && code == 0) s->baseline_needed = 1; /* SYN_REPORT */
        return KEY_EV_NONE;
    }
    if (type != 1 || code != 116 || value == 2) return KEY_EV_NONE;
    if (value != 0 && value != 1) return KEY_EV_NONE;
    if (!timestamp_valid) {
        tf_key_press_baseline(s, value ? -1 : 0);
        return KEY_EV_NONE;
    }
    if (s->ignore_until_release) {
        if (value == 0) tf_key_press_baseline(s, 0);
        return KEY_EV_NONE;
    }
    if (value == 1) {
        if (s->pressed) return KEY_EV_NONE; /* duplicate down never restarts */
        s->pressed = 1;
        s->long_emitted = 0;
        s->press_event_ms = event_ms;
        s->press_ms = monotonic_clock &&
            now_ms - event_ms <= UINT32_C(0x7fffffff) ? event_ms : now_ms;
        return KEY_EV_NONE;
    }
    if (!s->pressed) return KEY_EV_NONE;
    s->pressed = 0;
    if (s->long_emitted) return KEY_EV_NONE;
    uint32_t elapsed = event_ms - s->press_event_ms;
    /* A backwards/jumped event clock is not evidence of a fresh gesture. */
    if (elapsed > UINT32_C(0x7fffffff)) return KEY_EV_NONE;
    if (elapsed >= KEY_LONG_MS) {
        s->long_emitted = 1;
        return KEY_EV_LONG;
    }
    return KEY_EV_SHORT;
}
#endif
