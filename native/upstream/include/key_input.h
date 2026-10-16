/*
 * key_input.h - power-key (KEY_POWER) reader via Linux evdev.
 *
 * Auto-probes /dev/input/event* for KEY_POWER without touchscreen axes, then
 * reports short/long presses without grabbing or reconfiguring the device.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef U60PRO_KEY_INPUT_H
#define U60PRO_KEY_INPUT_H

#include "../../key_press.h"

typedef struct {
    int fd;
    int monotonic_clock;
    tf_key_press_t press;
} key_input_t;

int  key_input_init(key_input_t *k);
/* Non-blocking: drain events, return one edge or NONE. LONG takes priority
 * over older queued SHORT edges. A long release never adds a SHORT. */
int  key_input_poll(key_input_t *k, uint32_t now_ms);
void key_input_close(key_input_t *k);

#endif /* U60PRO_KEY_INPUT_H */
