/*
 * key_input.c - power-key reader via Linux evdev (clean-room).
 *
 * SPDX-License-Identifier: MIT
 */
#include "key_input.h"

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <time.h>
#include <unistd.h>

struct kev {
    unsigned long sec;
    unsigned long usec;
    uint16_t type;
    uint16_t code;
    int32_t  value;
};

#define EV_KEY     0x01
#define EV_ABS     0x03
#define KEY_POWER  116

#define EVIOCGBIT_(ev, len) _IOC(_IOC_READ, 'E', 0x20 + (ev), len)
#define EVIOCGKEY_(len) _IOC(_IOC_READ, 'E', 0x18, len)
#define EVIOCSCLOCKID_ _IOW('E', 0xa0, int)

static int test_bit(const unsigned long *arr, int bit)
{
    return (arr[bit / (8 * sizeof(long))] >> (bit % (8 * sizeof(long)))) & 1UL;
}

/* A real power button: reports KEY_POWER but is not a touchscreen (no ABS). */
static int is_power_key_dev(int fd)
{
    unsigned long ev[(EV_ABS / (8 * sizeof(long))) + 1];
    memset(ev, 0, sizeof(ev));
    if (ioctl(fd, EVIOCGBIT_(0, sizeof(ev)), ev) < 0) return 0;
    if (test_bit(ev, EV_ABS)) return 0;       /* skip touchscreens */

    unsigned long key[(KEY_POWER / (8 * sizeof(long))) + 1];
    memset(key, 0, sizeof(key));
    if (ioctl(fd, EVIOCGBIT_(EV_KEY, sizeof(key)), key) < 0) return 0;
    return test_bit(key, KEY_POWER);
}

static int power_key_held(int fd)
{
    unsigned long key[(KEY_POWER / (8 * sizeof(long))) + 1];
    memset(key, 0, sizeof(key));
    if (ioctl(fd, EVIOCGKEY_(sizeof(key)), key) < 0) return -1;
    return test_bit(key, KEY_POWER);
}

int key_input_init(key_input_t *k)
{
    memset(k, 0, sizeof(*k));
    k->fd = -1;
    tf_key_press_baseline(&k->press, -1);

    DIR *dir = opendir("/dev/input");
    if (!dir) return -1;

    struct dirent *de;
    char path[288];
    while ((de = readdir(dir)) != NULL) {
        if (strncmp(de->d_name, "event", 5) != 0) continue;
        snprintf(path, sizeof(path), "/dev/input/%s", de->d_name);
        int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
        if (fd < 0) continue;
        if (is_power_key_dev(fd)) {
            k->fd = fd;
            fprintf(stderr, "key: power button on %s\n", path);
            break;
        }
        close(fd);
    }
    closedir(dir);

    if (k->fd < 0) {
        fprintf(stderr, "key: no KEY_POWER device found\n");
        return -1;
    }
    /* This ioctl selects timestamps on our read-only fd only. No EVIOCGRAB,
     * device writes or kernel autorepeat configuration is used. */
    int clock_id = CLOCK_MONOTONIC;
    k->monotonic_clock = ioctl(k->fd, EVIOCSCLOCKID_, &clock_id) == 0;
    tf_key_press_baseline(&k->press, power_key_held(k->fd));
    return 0;
}

int key_input_poll(key_input_t *k, uint32_t now_ms)
{
    if (k->fd < 0) return KEY_EV_NONE;

    struct kev ev;
    int result = KEY_EV_NONE;

    for (;;) {
        ssize_t count = read(k->fd, &ev, sizeof(ev));
        if (count != (ssize_t)sizeof(ev)) {
            if (count < 0 && errno == EINTR) continue;
            if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) break;
            /* A removed fd, EOF or incomplete record cannot leave a live
             * hold behind that would later become a phantom LONG. */
            key_input_close(k);
            return KEY_EV_NONE;
        }
        int valid = ev.usec < 1000000UL;
        uint32_t event_ms = (uint32_t)ev.sec * 1000u + (uint32_t)(ev.usec / 1000u);
        int edge = tf_key_press_event(&k->press, ev.type, ev.code, ev.value,
            event_ms, valid, k->monotonic_clock, now_ms);
        if (k->press.sync_lost) result = KEY_EV_NONE;
        if (k->press.baseline_needed)
            tf_key_press_baseline(&k->press, power_key_held(k->fd));
        if (edge > result) result = edge;
    }
    int edge = tf_key_press_tick(&k->press, now_ms);
    if (edge > result) result = edge;
    return result;
}

void key_input_close(key_input_t *k)
{
    if (k->fd >= 0) close(k->fd);
    k->fd = -1;
    k->monotonic_clock = 0;
    tf_key_press_baseline(&k->press, -1);
}
