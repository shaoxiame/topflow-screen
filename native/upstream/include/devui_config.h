/*
 * devui_config.h - TopFlow board configuration for the reused devui backends.
 *
 * All hardware specifics are auto-detected at runtime. The values here are
 * only fallbacks / tunables. Override them with -D flags from the Makefile if
 * you port this to a different device.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef U60PRO_DEVUI_CONFIG_H
#define U60PRO_DEVUI_CONFIG_H

/* DRM device node. */
#ifndef DEVUI_DRM_CARD
#define DEVUI_DRM_CARD "/dev/dri/card0"
#endif

/*
 * TopFlow uses upright framebuffer and touch coordinates. The upstream U60Pro
 * default was 180 degrees; do not carry that board-specific default here.
 */
#ifndef DEVUI_ROTATE_180
#define DEVUI_ROTATE_180 0
#endif

/*
 * Apply the same 180° transform to touch coordinates so taps line up with the
 * rotated display. Tune the axis flags below on real hardware if needed.
 */
#ifndef DEVUI_TOUCH_ROTATE_180
#define DEVUI_TOUCH_ROTATE_180 0
#endif

/* Swap / invert raw touch axes (set during on-device calibration). */
#ifndef DEVUI_TOUCH_SWAP_XY
#define DEVUI_TOUCH_SWAP_XY 0
#endif
#ifndef DEVUI_TOUCH_INVERT_X
#define DEVUI_TOUCH_INVERT_X 0
#endif
#ifndef DEVUI_TOUCH_INVERT_Y
#define DEVUI_TOUCH_INVERT_Y 0
#endif

/*
 * Last-resort fallbacks if DRM enumeration fails. These were observed on
 * U60Pro hardware (connector/crtc ids, panel geometry). Enumeration is always
 * tried first; these only kick in when GETRESOURCES yields nothing usable.
 */
#ifndef DEVUI_FALLBACK_CONNECTOR_ID
#define DEVUI_FALLBACK_CONNECTOR_ID 31
#endif
#ifndef DEVUI_FALLBACK_CRTC_ID
#define DEVUI_FALLBACK_CRTC_ID 34
#endif
#ifndef DEVUI_FALLBACK_WIDTH
#define DEVUI_FALLBACK_WIDTH 320
#endif
#ifndef DEVUI_FALLBACK_HEIGHT
#define DEVUI_FALLBACK_HEIGHT 480
#endif

#endif /* U60PRO_DEVUI_CONFIG_H */
