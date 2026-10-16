#!/bin/sh
# SPDX-License-Identifier: MIT
# Display ownership only. No network changes, vendor stop hook or boot changes.
set -eu
umask 077
ROOT=/data/plugins/topflow-screen
RUN=/tmp/topflow-screen
# Heartbeat and watchdog share CLOCK_MONOTONIC, excluding suspend and NTP jumps.
clock_uint() {
    case "${1:-}" in ''|*[!0-9]*|0?*) return 1;; esac
    [ "${#1}" -le 10 ]
}
monotonic_now() {
    [ -f "$ROOT/topflow-screen" ] && [ ! -L "$ROOT/topflow-screen" ] && [ -x "$ROOT/topflow-screen" ] || return 1
    if [ "${clock_verified:-0}" != 1 ]; then
        (cd "$ROOT" && sha256sum -c topflow-screen.sha256 >/dev/null 2>&1) || return 1
    fi
    clock_value=$("$ROOT/topflow-screen" --monotonic-seconds 2>/dev/null) || return 1
    clock_uint "$clock_value" || return 1
    printf '%s\n' "$clock_value"
}
# A handover deadline includes system suspend; heartbeat still uses MONOTONIC.
wait_now() {
    read -r wait_uptime wait_idle < /proc/uptime || return 1
    case "$wait_uptime" in *.*) wait_value=${wait_uptime%%.*};; *) return 1;; esac
    clock_uint "$wait_value" || return 1
    printf '%s\n' "$wait_value"
}
# Open the existing installation lock without creating it. Recheck both the
# directory and the held inode after flock: a removed/reinstalled path is not
# the same installation, even when it contains identical package bytes.
lifecycle_lock() {
    [ -d "$ROOT" ] && [ ! -L "$ROOT" ] && [ "$(readlink -f "$ROOT")" = "$ROOT" ] && [ "$(stat -c %u "$ROOT")" = 0 ] || { echo 'Installation is absent or unsafe' >&2; exit 8; }
    [ -f "$ROOT/.topflow-install" ] && [ ! -L "$ROOT/.topflow-install" ] || { echo 'Installation ownership is absent' >&2; exit 8; }
    lifecycle_root=$(stat -c '%d:%i' "$ROOT") || exit 8
    lifecycle_marker=$(cat "$ROOT/.topflow-install") || exit 8
    [ -f "$ROOT/.lifecycle.lock" ] && [ ! -L "$ROOT/.lifecycle.lock" ] && [ "$(stat -c %h "$ROOT/.lifecycle.lock")" = 1 ] && [ "$(stat -c %u "$ROOT/.lifecycle.lock")" = 0 ] || { echo 'Installation lock is absent or unsafe' >&2; exit 8; }
    if [ "${1:-}" != inherited ]; then exec 7<"$ROOT/.lifecycle.lock"; fi
    lifecycle_fd=$(stat -L -c '%d:%i' "/proc/self/fd/7") || exit 8
    flock -n 7 || { echo 'Another installation lifecycle action is in progress' >&2; exit 7; }
    [ "$(stat -c '%d:%i' "$ROOT" 2>/dev/null)" = "$lifecycle_root" ] && [ "$(stat -c '%d:%i' "$ROOT/.lifecycle.lock" 2>/dev/null)" = "$lifecycle_fd" ] && [ "$(cat "$ROOT/.topflow-install" 2>/dev/null)" = "$lifecycle_marker" ] || { echo 'Installation changed while acquiring its lock' >&2; exit 8; }
}
# END LIFECYCLE_LOCK
[ "${1:-}" = '--confirmed' ] || { echo 'Explicit handover confirmation required' >&2; exit 2; }
[ -d "$ROOT" ] && [ ! -L "$ROOT" ] && [ ! -e "$ROOT/.uninstalling" ] && [ ! -e "$ROOT/.install-owner" ] && [ -f "$ROOT/.topflow-install" ] || exit 2
[ -d "$RUN" ] && [ ! -L "$RUN" ] && [ "$(readlink -f "$RUN")" = "$RUN" ] || exit 2
[ "$(stat -c %u "$RUN")" = 0 ] || exit 2
for file in supervisor.lock supervisor.pid renderer.pid renderer.log renderer.failure heartbeat last-status pin-state; do
    [ ! -L "$RUN/$file" ] && { [ ! -e "$RUN/$file" ] || [ -f "$RUN/$file" ]; } || exit 2
    [ ! -f "$RUN/$file" ] || [ "$(stat -c %h "$RUN/$file")" = 1 ] || exit 2
done
command -v flock >/dev/null
if [ "${2:-}" = --lifecycle-held ]; then lifecycle_lock inherited; elif [ -z "${2:-}" ]; then lifecycle_lock; else exit 2; fi
exec 8>"$RUN/supervisor.lock"
flock -n 8 || { echo 'Display handover already owned'; exit 1; }
# A single short status replaces prior status. No append logs or raw diagnostics.
printf 'checking\n' > "$RUN/last-status"
proc_start() {
    case "${1:-}" in ''|*[!0-9]*) return 1;; esac
    [ "$1" -gt 1 ] || return 1
    ps_line=$(cat "/proc/$1/stat" 2>/dev/null) || return 1
    printf '%s\n' "${ps_line##*) }" | awk '{print $20}'
}
same_process() {
    case "${2:-}" in ''|*[!0-9]*) return 1;; esac
    [ "$(proc_start "${1:-}" 2>/dev/null || true)" = "$2" ]
}
factory_running() {
    for factory_pid in $(pidof zte_topsw_devui 2>/dev/null || true); do
        [ "$(readlink "/proc/$factory_pid/exe" 2>/dev/null || true)" = /usr/bin/zte_topsw_devui ] && return 0
    done
    return 1
}
factory_identity() {
    factory_identity_value=
    for factory_pid in $(pidof zte_topsw_devui 2>/dev/null || true); do
        [ -z "$factory_identity_value" ] && [ "$(readlink "/proc/$factory_pid/exe" 2>/dev/null || true)" = /usr/bin/zte_topsw_devui ] || return 1
        factory_start=$(proc_start "$factory_pid") || return 1
        case "$factory_start" in ''|*[!0-9]*) return 1;; esac
        factory_identity_value="$factory_pid $factory_start"
    done
    [ -n "$factory_identity_value" ] || return 1
    printf '%s\n' "$factory_identity_value"
}
factory_provider_ready() {
    provider=$(ubus -t 2 -v list zwrt_deviceui 2>/dev/null) || return 1
    for method in zwrt_deviceui_touch_status_get zwrt_deviceui_direct_power_mode_get zwrt_deviceui_direct_power_mode_set; do
        printf '%s\n' "$provider" | grep -Fq "\"$method\"" || return 1
    done
}
factory_stable() {
    stable_factory=$(factory_identity) || return 1
    stable_count=0
    while [ "$stable_count" -lt 3 ]; do
        sleep 1
        [ "$(factory_identity || true)" = "$stable_factory" ] && factory_provider_ready || return 1
        stable_count=$((stable_count+1))
    done
}
# Fixed sysfs only. A ten-second lease expires even if both custom processes die.
# Never release the original global/internal locks or scan for prefix matches.
guard_name() {
    case "${1:-}:${2:-}" in *[!0-9:]*) return 1;; esac
    [ -n "${1:-}" ] && [ -n "${2:-}" ] && [ "$1" -gt 1 ] && [ "$2" -gt 0 ] || return 1
    printf 'topflow_screen_%s_%s\n' "$1" "$2"
}
guard_io_safe() {
    for guard_path in /sys/power/wake_lock /sys/power/wake_unlock; do
        [ -f "$guard_path" ] && [ ! -L "$guard_path" ] && [ -w "$guard_path" ] || return 1
    done
    [ -r /sys/power/wake_lock ]
}
guard_active_io() { cat /sys/power/wake_lock; }
guard_acquire_io() { printf '%s 10000000000\n' "$1" > /sys/power/wake_lock; }
guard_release_io() { printf '%s\n' "$1" > /sys/power/wake_unlock; }
# END GUARD_IO
# Display ownership is pinned to the exact firmware analyzed locally. These
# checks reject another screen plugin's supervisor/mount/preload, not remove it.
factory_environment() {
    [ -f /etc/init.d/zte_topsw_devui ] && [ ! -L /etc/init.d/zte_topsw_devui ] || return 1
    factory_mounts=$(awk '$5=="/etc/init.d/zte_topsw_devui" || $5=="/usr/bin/zte_topsw_devui" { found=1 } END {print found?1:0}' /proc/self/mountinfo) || return 1
    [ "$factory_mounts" = 0 ] || return 1
    grep -Eq '^PROG=/usr/bin/zte_topsw_devui[[:space:]]*$' /etc/init.d/zte_topsw_devui || return 1
    printf '%s\n' '781e3c6ffa2a9db4d61a3cf1bb38461131dc3faed07499a2c9360bc582040dd2  /usr/bin/zte_topsw_devui' | sha256sum -c - >/dev/null 2>&1 || return 1
    printf '%s\n' 'bc1d10b18af247448758df97dac5f8895e6927f5fe81fc3b4dd538d676eed11a  /etc/init.d/zte_topsw_devui' | sha256sum -c - >/dev/null 2>&1 || return 1
    [ -r "/proc/$old_factory_pid/maps" ] && [ -r "/proc/$old_factory_pid/environ" ] || return 1
    factory_maps=$(awk '/touchui-hook|topflow-wallpaper/ {found=1} $2 ~ /x/ && $6 ~ /\.so([.]|$)/ && $6 !~ /^\/(lib|usr\/lib)\// {found=1} END {print found?1:0}' "/proc/$old_factory_pid/maps") || return 1
    [ "$factory_maps" = 0 ] || return 1
    factory_env=$(tr '\000' '\n' < "/proc/$old_factory_pid/environ") || return 1
    factory_preload=$(printf '%s\n' "$factory_env" | awk '/^LD_PRELOAD=./ {found=1} END {print found?1:0}') || return 1
    unset factory_env
    [ "$factory_preload" = 0 ]
}
old_factory_alive() {
    same_process "$old_factory_pid" "$old_factory_birth" && [ "$(readlink "/proc/$old_factory_pid/exe" 2>/dev/null || true)" = /usr/bin/zte_topsw_devui ]
}
factory_autosleep_release_io() { printf '%s\n' zte_topsw_devui_auto_sleep_lock > /sys/power/wake_unlock; }
# END FACTORY_LOCK_IO
# Map writer truncates/replaces its contents. Require two equal complete reads,
# including metadata and a terminating newline for nonempty maps. A stable
# empty map is valid when the final internal lock has been removed.
factory_lock_owner() {
    lock_map=/tmp/wakelockMap.txt
    [ -f "$lock_map" ] && [ ! -L "$lock_map" ] || return 1
    map_size=$(wc -c < "$lock_map") || return 1
    [ "$map_size" -le 8192 ] || return 1
    map_before=$(stat -c '%d:%i:%s:%Y:%Z' "$lock_map") || return 1
    map_first=$(cat "$lock_map") || return 1
    if [ "$map_size" -gt 0 ]; then
        [ "$(tail -c 1 "$lock_map" | wc -l)" -eq 1 ] || return 1
        [ "$(printf '%s\n' "$map_first" | wc -c)" -eq "$map_size" ] || return 1
    fi
    sleep 0.1
    map_second=$(cat "$lock_map") || return 1
    [ "$map_first" = "$map_second" ] && [ "$map_before" = "$(stat -c '%d:%i:%s:%Y:%Z' "$lock_map")" ] || return 1
    printf '%s\n' "$map_first" | awk '
        NF==0 {next}
        NF!=2 || $1 !~ /^[A-Za-z0-9_-]+$/ || $2 !~ /^[0-9]+$/ || $2<2 || $2>2147483647 {bad=1;next}
        $1=="zte_topsw_devui" {owner=$2;count++}
        END {if(bad || count>1) exit 1; print count?owner:0}'
}
# Only called with the exact original PID gone and the transition lease held.
# The user explicitly switches to a freshly awakened screen: its next OFF event
# establishes a new 180s idle lease, rather than guessing an old timer remainder.
handover_factory_locks() {
    ! factory_running && ! old_factory_alive || return 1
    guard_observe "$supervisor_guard" || return 1
    map_owner=$(factory_lock_owner) || return 1
    [ "$map_owner" = 0 ] || [ "$map_owner" = "$old_factory_pid" ] || return 1
    if [ "$map_owner" = "$old_factory_pid" ]; then
        ! factory_running && ! old_factory_alive && guard_observe "$supervisor_guard" || return 1
        ubus -t 2 call zwrt_zte_sleep_faw.wakelock internalDeleteWakelock "{\"sourceId\":$old_factory_pid,\"lockName\":\"zte_topsw_devui\"}" >/dev/null || return 1
    fi
    # Confirm service application, not merely successful message submission.
    cleared=0
    for attempt in 1 2 3 4 5; do
        ! factory_running && ! old_factory_alive || return 1
        map_owner=$(factory_lock_owner) || return 1
        if [ "$map_owner" = 0 ]; then cleared=$((cleared+1)); else
            [ "$map_owner" = "$old_factory_pid" ] || return 1
            cleared=0
        fi
        [ "$cleared" -lt 2 ] || break
        sleep 0.1
    done
    [ "$cleared" -ge 2 ] || return 1
    ! factory_running && ! old_factory_alive && guard_observe "$supervisor_guard" || return 1
    auto_result=0; guard_observe zte_topsw_devui_auto_sleep_lock || auto_result=$?
    [ "$auto_result" != 2 ] || return 1
    if [ "$auto_result" = 0 ]; then
        # Fixed SDK display-lock name only; never alter global/network locks.
        factory_autosleep_release_io || return 1
    fi
    auto_result=0; guard_observe zte_topsw_devui_auto_sleep_lock || auto_result=$?
    [ "$auto_result" = 1 ] && [ "$(factory_lock_owner)" = 0 ] && ! factory_running && ! old_factory_alive && guard_observe "$supervisor_guard"
}
guard_observe() {
    guard_active=$(guard_active_io) || return 2
    printf '%s\n' "$guard_active" | awk -v own="$1" '{ for(i=1;i<=NF;i++) if($i==own) found=1 } END { exit found ? 0 : 1 }'
}
guard_release() {
    guard_io_safe || return 1
    guard_result=0; guard_observe "$1" || guard_result=$?
    [ "$guard_result" != 2 ] || return 1
    [ "$guard_result" != 0 ] || guard_release_io "$1" || return 1
    guard_result=0; guard_observe "$1" || guard_result=$?
    [ "$guard_result" = 1 ]
}
known_failure() {
    case "${1:-}" in
        DISPLAY_STATE_UNKNOWN|FACTORY_ENVIRONMENT_CONFLICT|FACTORY_IDENTITY_CHANGED|FACTORY_LOCK_OWNER_CONFLICT|FACTORY_LOCK_HANDOVER_FAILED|FACTORY_PIN_PROTOCOL_UNVERIFIED|FACTORY_PERIODIC_WAKE_UNVERIFIED|DISPLAY_LIFECYCLE_PREFLIGHT_FAILED|DISPLAY_GUARD_UNAVAILABLE|FACTORY_PROCESS_UNAVAILABLE|FACTORY_PROVIDER_UNAVAILABLE|SLEEP_PROVIDER_UNAVAILABLE|DISPLAY_BRIGHTNESS_UNAVAILABLE|DISPLAY_SUSPEND_UNAVAILABLE|DISPLAY_LCD_LOCK_UNAVAILABLE|FACTORY_INTERNAL_LOCK_UNKNOWN|FACTORY_INTERNAL_LOCK_UNSTABLE|FACTORY_AUTOSLEEP_LOCK_ACTIVE|FACTORY_AUTOSLEEP_LOCK_UNKNOWN|FACTORY_INTERNAL_LOCK_ACTIVE|FACTORY_ALWAYS_ON_LOCK_ACTIVE|DISPLAY_LOCK_STATE_MISMATCH|DISPLAY_RECEIPT_FAILED|FACTORY_UI_NOT_RUNNING|FACTORY_PROCD_UNAVAILABLE|TOUCH_DRIVER_UNAVAILABLE|FACTORY_FONT_UNAVAILABLE|NATIVE_CHECKSUM_FAILED|DISPLAY_RECEIPT_INVALID|FACTORY_BUS_DEPENDENCY_MISSING|FACTORY_BUS_ADAPTER_MISSING|DATAD_STATE_UNAVAILABLE|MONOTONIC_CLOCK_UNAVAILABLE|TRANSITION_GUARD_UNAVAILABLE|TRANSITION_GUARD_UNCONFIRMED|FACTORY_STOP_UNCONFIRMED|TRANSITION_GUARD_REFRESH_FAILED|FACTORY_UI_RESPAWNED|RENDERER_STALLED|TRANSITION_GUARD_RELEASE_UNCONFIRMED|TRANSITION_GUARD_RELEASE_RECOVERED|RENDERER_EXITED|FACTORY_RESTORE_UNCONFIRMED|RENDERER_STILL_ACTIVE|PREFLIGHT_ABORTED|WAIT_CLOCK_UNAVAILABLE|FACTORY_HANDOVER_TIMEOUT) return 0;;
        *) return 1;;
    esac
}
failure_code=
renderer_exit=
renderer_detail=
renderer_reaped=0
known_renderer_failure() {
    case "${1:-}" in
        ADOPT_RECEIPT|ADOPT_CONFIG|ADOPT_POLICY_READ|ADOPT_POLICY_INVALID|ADOPT_POLICY_CHANGED|ADOPT_BRIGHTNESS|ADOPT_SENSOR_ID|ADOPT_SENSOR_READ|ADOPT_SENSOR_STATE|ADOPT_SENSOR_INIT|ADOPT_SENSOR_ENABLE|ADOPT_SENSOR_LUX|ADOPT_GUARD_ACTIVE|ADOPT_PIN_POLICY|ADOPT_FACTORY_PRESENT|ADOPT_INTERNAL_LOCK|ADOPT_GUARD_IDENTITY|ADOPT_AUTOSLEEP_LOCK|ADOPT_LIFECYCLE|ADOPT_SLEEP_PROVIDER|ADOPT_IDLE_GUARD|BUS_PATH|BUS_SOCKET|BUS_FORK|BUS_EXEC|BUS_READY_TIMEOUT|BUS_EOF|BUS_ULOOP|BUS_CONNECT|BUS_OBJECT|BUS_SUBSCRIBER|BUS_SLEEP_SUBSCRIBE|BUS_REREGISTER|BUS_POWER_EVENT|BUS_PARENT_FD|WAKE_SENSOR_GUARD|WAKE_POLICY_READ|WAKE_POLICY_CHANGED|WAKE_SENSOR_PREPARE|DISPLAY_POLICY_INIT|PIN_PROTECT|PIN_BOOT_ID|PIN_STATE_OPEN|PIN_STATE_INVALID|PIN_STATE_STORE|UI_RESOURCE|DRM_INIT|DRM_DIMENSIONS|TOUCH_INIT|FONT_INIT|FIRST_FRAME|DISPLAY_ADOPT|BUS_RUNTIME|DISPLAY_RUNTIME|FRAME_RENDER) return 0;;
        *) return 1;;
    esac
}
read_renderer_diagnostic() {
    # An enum-only first-failure record, never arbitrary stderr or runtime data.
    diagnostic="$RUN/renderer.failure"
    [ -f "$diagnostic" ] && [ ! -L "$diagnostic" ] && [ "$(stat -c %u "$diagnostic")" = 0 ] && [ "$(stat -c %h "$diagnostic")" = 1 ] && [ "$(stat -c %a "$diagnostic")" = 600 ] || return 0
    diagnostic_size=$(wc -c < "$diagnostic")
    [ "$diagnostic_size" -gt 0 ] && [ "$diagnostic_size" -le 64 ] && [ "$(wc -l < "$diagnostic")" = 1 ] || return 0
    diagnostic_value=$(cat "$diagnostic")
    case "$diagnostic_value" in 'TF_NATIVE_FAILURE_V1 '*) diagnostic_value=${diagnostic_value#TF_NATIVE_FAILURE_V1 };; *) return 0;; esac
    if known_renderer_failure "$diagnostic_value"; then renderer_detail=$diagnostic_value; fi
}
collect_renderer_exit() {
    [ -n "$renderer" ] && [ "$renderer_reaped" = 0 ] || return 0
    # wait is safe only after the original child has vanished or is a zombie.
    # Identity-read failure alone must never introduce a blocking wait.
    if [ -d "/proc/$renderer" ]; then
        exit_stat=$(cat "/proc/$renderer/stat" 2>/dev/null) || return 0
        case "${exit_stat##*) }" in 'Z '*) ;; *) return 0;; esac
    fi
    if wait "$renderer" 2>/dev/null; then renderer_exit=0; else renderer_exit=$?; fi
    renderer_reaped=1
    read_renderer_diagnostic
}
record_status() {
    if [ -n "$failure_code" ]; then
        if [ -n "$renderer_exit$renderer_detail" ]; then printf 'failure:%s:%s:%s\n' "$failure_code" "${renderer_exit:--}" "${renderer_detail:--}" > "$RUN/last-status";
        else printf 'failure:%s\n' "$failure_code" > "$RUN/last-status"; fi
    else printf '%s\n' "$1" > "$RUN/last-status"; fi
}
fail() { failure_code=$1; record_status failed; printf 'TOPFLOW_ERROR=%s\n' "$failure_code"; exit "${2:-7}"; }
renderer=
renderer_start=
took_factory=0
supervisor_guard=
handover_guard_active=0
guard_cleanup_failed=0
renderer_path_present() {
    case "$renderer" in ''|*[!0-9]*) return 1;; esac
    [ "$renderer" -gt 1 ] || return 1
    case "$(readlink "/proc/$renderer/exe" 2>/dev/null || true)" in "$ROOT/topflow-screen"|"$ROOT/topflow-screen (deleted)") return 0;; *) return 1;; esac
}
own_renderer() {
    same_process "$renderer" "$renderer_start" && renderer_path_present
}
helpers_gone() {
    for helper_dir in /proc/[0-9]*; do
        case "$(readlink "$helper_dir/exe" 2>/dev/null || true)" in "$ROOT/topflow-factory-bus-aarch64"|"$ROOT/topflow-factory-bus-aarch64 (deleted)") return 1;; esac
    done
    return 0
}
restore_factory() {
    # Signal traps exit; cleanup only runs from EXIT and cannot resume handover.
    trap - EXIT
    trap '' HUP INT TERM
    # Refresh only this bounded guard at the two finite recovery stages, never
    # from the steady-state watchdog. A crashed recovery cannot pin the system.
    if [ "$took_factory" = 1 ] && [ -n "$supervisor_guard" ]; then guard_acquire_io "$supervisor_guard" || true; fi
    if own_renderer; then
        kill -TERM "$renderer" 2>/dev/null || true
        n=0; while own_renderer && [ "$n" -lt 5 ]; do sleep 1; n=$((n+1)); done
        if own_renderer; then kill -KILL "$renderer" 2>/dev/null || true; fi
        n=0; while own_renderer && [ "$n" -lt 2 ]; do sleep 1; n=$((n+1)); done
    fi
    collect_renderer_exit
    # Parent-death SIGKILL closes the helper's bus object/socket. Never start the
    # vendor provider while our helper is still present, even without a renderer.
    n=0; while ! helpers_gone && [ "$n" -lt 3 ]; do sleep 1; n=$((n+1)); done
    if renderer_path_present || ! helpers_gone; then
        failure_code=RENDERER_STILL_ACTIVE
        guard_cleanup_failed=1
        record_status renderer-still-active
        echo 'ERROR: renderer remains or identity changed; refusing concurrent factory ownership'
    elif [ "$took_factory" = 1 ]; then
        if [ -n "$supervisor_guard" ]; then guard_acquire_io "$supervisor_guard" || true; fi
        if ! factory_running; then sleep 2; /etc/init.d/zte_topsw_devui start 8>&- || true; fi
        if factory_stable; then
            guard_cleanup_ok=1
            if [ -n "$supervisor_guard" ]; then guard_release "$supervisor_guard" || guard_cleanup_ok=0; fi
            if renderer_guard=$(guard_name "$renderer" "$renderer_start"); then
                guard_release "$renderer_guard" || guard_cleanup_ok=0
                guard_release "${renderer_guard}_idle" || guard_cleanup_ok=0
            fi
            if [ "$guard_cleanup_ok" = 1 ]; then
                [ "$failure_code" != TRANSITION_GUARD_RELEASE_UNCONFIRMED ] || failure_code=TRANSITION_GUARD_RELEASE_RECOVERED
                record_status factory-restored
            else
                failure_code=TRANSITION_GUARD_RELEASE_UNCONFIRMED
                guard_cleanup_failed=1
                record_status factory-guard-release-unconfirmed
            fi
        else failure_code=FACTORY_RESTORE_UNCONFIRMED; guard_cleanup_failed=1; record_status factory-restart-unconfirmed; fi
    else
        if [ -n "$supervisor_guard" ] && factory_running && factory_provider_ready; then
            if ! guard_release "$supervisor_guard"; then failure_code=TRANSITION_GUARD_RELEASE_UNCONFIRMED; guard_cleanup_failed=1; fi
        fi
        record_status preflight-not-completed
    fi
    if [ "$guard_cleanup_failed" = 0 ]; then
        if ! renderer_path_present; then rm -f "$RUN/renderer.pid" "$RUN/heartbeat"; fi
        rm -f "$RUN/supervisor.pid"
    fi
    [ "$guard_cleanup_failed" = 0 ] || exit 8
    # fd 8 releases on exit, after cleanup. Never unlink its lock file.
}
trap restore_factory EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s %s\n' "$$" "$(proc_start "$$")" > "$RUN/supervisor.pid"
# The published supervisor now owns fd 8. Let controllers take the lifecycle
# lock to cancel it; the launching controller retains its inherited fd 7.
exec 7<&-
factory_running || { fail FACTORY_UI_NOT_RUNNING 2; }
original_identity=$(factory_identity) || fail FACTORY_PROCESS_UNAVAILABLE
old_factory_pid=${original_identity%% *}
old_factory_birth=${original_identity#* }
factory_environment || fail FACTORY_ENVIRONMENT_CONFLICT
factory_provider_ready || { fail FACTORY_PROVIDER_UNAVAILABLE 3; }
ubus call service list '{"name":"zte_topsw_devui"}' | grep -q zte_topsw_devui || { fail FACTORY_PROCD_UNAVAILABLE 3; }
found_touch=0
for name in /sys/class/input/event*/device/name; do
    [ -r "$name" ] || continue
    grep -q sitronix "$name" && found_touch=1 || true
done
[ "$found_touch" = 1 ] || { fail TOUCH_DRIVER_UNAVAILABLE 4; }
[ -r /usr/ui/fonts/ZTEZhengYuan.ttf ] || { fail FACTORY_FONT_UNAVAILABLE 5; }
(cd "$ROOT" && sha256sum -c topflow-screen.sha256) || { fail NATIVE_CHECKSUM_FAILED 5; }
clock_verified=1
# This mode only reads display policy. Reject PIN/unknown policy before stopping
# the original provider or opening DRM, touch, backlight or network controls.
if ! display_capability=$("$ROOT/topflow-screen" --display-preflight 2>&1 8>&-); then
    if known_failure "$display_capability"; then fail "$display_capability"; fi
    fail DISPLAY_LIFECYCLE_PREFLIGHT_FAILED
fi
record_status checking
printf '%s\n' "$display_capability" | awk '
 NR != 1 || NF != 13 { bad=1 }
 $1 != "DISPLAY_PREFLIGHT_OK" { bad=1 }
 $2 != "PIN_GUARD=initial-300s-v1" && $2 != "PIN_GUARD=none" { bad=1 }
 $3 !~ /^BRIGHTNESS=[0-9]+$/ || $4 !~ /^LCDLOCK=[01]$/ { bad=1 }
 $5 !~ /^AUTO=[01]$/ || $6 !~ /^LEVEL=[0-9]+$/ || $7 !~ /^TIMEOUT=(-1|[0-9]+)$/ || $8 != "PERIODIC=0" {bad=1}
 $9 !~ /^SENSOR=[01]$/ || $10 !~ /^LUX=(-1|[0-9]+)$/ || $11 !~ /^INTERNAL=[01]$/ || $12 !~ /^AUTOLOCK=[01]$/ || $13 != "DIRECT=1" {bad=1}
 { split($3,b,"="); split($4,l,"="); if (b[2]>255 || (b[2]>0)!=l[2]) bad=1 }
 { split($6,v,"="); if(v[2]<1 || v[2]>255) bad=1; split($7,v,"="); if(v[2]!=-1 && (v[2]<1 || v[2]>86400)) bad=1; split($10,v,"="); if(v[2]>10000000) bad=1 }
 END { exit bad || NR!=1 ? 1 : 0 }' || { fail DISPLAY_RECEIPT_INVALID; }
for dependency in /lib/ld-musl-aarch64.so.1 /lib/libubus.so.20230605 /lib/libubox.so.20230523; do
    [ -r "$dependency" ] || { fail FACTORY_BUS_DEPENDENCY_MISSING; }
done
[ -x "$ROOT/topflow-factory-bus-aarch64" ] || { fail FACTORY_BUS_ADAPTER_MISSING; }
curl -q -f -s --noproxy '*' -m 3 http://127.0.0.1:9460/state | grep -q '"modems"' || { fail DATAD_STATE_UNAVAILABLE 5; }
monotonic_now >/dev/null || { fail MONOTONIC_CLOCK_UNAVAILABLE; }
# service.delete stops only its display instance and bypasses the vendor
# stop_service hook, which would unload the touch driver.
guard_io_safe || { fail TRANSITION_GUARD_UNAVAILABLE; }
supervisor_guard=$(guard_name "$$" "$(proc_start "$$")") || exit 7
guard_acquire_io "$supervisor_guard" && guard_observe "$supervisor_guard" || { fail TRANSITION_GUARD_UNCONFIRMED; }
handover_guard_active=1
[ "$(factory_identity || true)" = "$original_identity" ] || fail FACTORY_IDENTITY_CHANGED
map_owner=$(factory_lock_owner) || fail FACTORY_INTERNAL_LOCK_UNKNOWN
[ "$map_owner" = 0 ] || [ "$map_owner" = "$old_factory_pid" ] || fail FACTORY_LOCK_OWNER_CONFLICT
factory_environment || fail FACTORY_ENVIRONMENT_CONFLICT
[ "$(factory_identity || true)" = "$original_identity" ] && guard_observe "$supervisor_guard" || fail FACTORY_IDENTITY_CHANGED
took_factory=1
ubus -t 2 call service delete '{"name":"zte_topsw_devui"}' || fail FACTORY_STOP_UNCONFIRMED
n=0
while old_factory_alive && [ "$n" -lt 3 ]; do sleep 1; n=$((n+1)); done
if old_factory_alive; then kill -KILL "$old_factory_pid" || fail FACTORY_STOP_UNCONFIRMED; fi
n=0
while factory_running && [ "$n" -lt 2 ]; do sleep 1; n=$((n+1)); done
factory_running && { fail FACTORY_STOP_UNCONFIRMED 6; }
guard_observe "$supervisor_guard" || fail TRANSITION_GUARD_REFRESH_FAILED
guard_acquire_io "$supervisor_guard" && guard_observe "$supervisor_guard" || { fail TRANSITION_GUARD_REFRESH_FAILED; }
# QPIC pipe teardown completes asynchronously after closing the old DRM fd.
sleep 2
handover_factory_locks || fail FACTORY_LOCK_HANDOVER_FAILED
guard_acquire_io "$supervisor_guard" && guard_observe "$supervisor_guard" || { fail TRANSITION_GUARD_REFRESH_FAILED; }
rm -f "$RUN/heartbeat" "$RUN/renderer.failure"
started_at=$(monotonic_now) || { fail MONOTONIC_CLOCK_UNAVAILABLE; }
"$ROOT/topflow-screen" --display-adopt "$display_capability" >/dev/null 2>&1 8>&- &
renderer=$!
renderer_start=$(proc_start "$renderer" || true)
if guard_name "$renderer" "$renderer_start" >/dev/null 2>&1; then
    printf '%s %s\n' "$renderer" "$renderer_start" > "$RUN/renderer.pid"
fi
record_status renderer-started
sleep 1
last_beat=$started_at
while own_renderer; do
    factory_running && { failure_code=FACTORY_UI_RESPAWNED; break; }
    now=$(monotonic_now) || { failure_code=MONOTONIC_CLOCK_UNAVAILABLE; break; }
    beat=$(cat "$RUN/heartbeat" 2>/dev/null || true)
    valid_beat=0
    # fopen("w") may briefly expose an empty/partial sample. Keep the most
    # recent validated value, and never accept backward or future timestamps.
    if clock_uint "$beat" && [ "$beat" -ge "$last_beat" ] && [ "$beat" -le "$now" ]; then
        last_beat=$beat
        valid_beat=1
    fi
    age=$((now-last_beat))
    [ "$age" -ge 0 ] && [ "$age" -le 12 ] || { failure_code=RENDERER_STALLED; echo 'Renderer stalled; rolling back'; break; }
    if [ "$handover_guard_active" = 1 ] && [ "$valid_beat" = 1 ]; then
        guard_release "$supervisor_guard" || { failure_code=TRANSITION_GUARD_RELEASE_UNCONFIRMED; break; }
        handover_guard_active=0
        # The runtime's own transitions each use a separately owned short guard.
        # Keep our name for a bounded recovery refresh; do not renew it here.
    fi
    sleep 2
done
if ! own_renderer; then
    [ -n "$failure_code" ] || failure_code=RENDERER_EXITED
    collect_renderer_exit
fi
# EXIT cleanup completes before the lifetime flock is released.
