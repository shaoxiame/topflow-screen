#!/bin/sh
# SPDX-License-Identifier: MIT
# Authored offline. Status reads only; handover requires explicit confirmation.
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
known_failure() {
    case "${1:-}" in
        DISPLAY_STATE_UNKNOWN|FACTORY_ENVIRONMENT_CONFLICT|FACTORY_IDENTITY_CHANGED|FACTORY_LOCK_OWNER_CONFLICT|FACTORY_LOCK_HANDOVER_FAILED|FACTORY_PIN_PROTOCOL_UNVERIFIED|FACTORY_PERIODIC_WAKE_UNVERIFIED|DISPLAY_LIFECYCLE_PREFLIGHT_FAILED|DISPLAY_GUARD_UNAVAILABLE|FACTORY_PROCESS_UNAVAILABLE|FACTORY_PROVIDER_UNAVAILABLE|SLEEP_PROVIDER_UNAVAILABLE|DISPLAY_BRIGHTNESS_UNAVAILABLE|DISPLAY_SUSPEND_UNAVAILABLE|DISPLAY_LCD_LOCK_UNAVAILABLE|FACTORY_INTERNAL_LOCK_UNKNOWN|FACTORY_INTERNAL_LOCK_UNSTABLE|FACTORY_AUTOSLEEP_LOCK_ACTIVE|FACTORY_AUTOSLEEP_LOCK_UNKNOWN|FACTORY_INTERNAL_LOCK_ACTIVE|FACTORY_ALWAYS_ON_LOCK_ACTIVE|DISPLAY_LOCK_STATE_MISMATCH|DISPLAY_RECEIPT_FAILED|FACTORY_UI_NOT_RUNNING|FACTORY_PROCD_UNAVAILABLE|TOUCH_DRIVER_UNAVAILABLE|FACTORY_FONT_UNAVAILABLE|NATIVE_CHECKSUM_FAILED|DISPLAY_RECEIPT_INVALID|FACTORY_BUS_DEPENDENCY_MISSING|FACTORY_BUS_ADAPTER_MISSING|DATAD_STATE_UNAVAILABLE|MONOTONIC_CLOCK_UNAVAILABLE|TRANSITION_GUARD_UNAVAILABLE|TRANSITION_GUARD_UNCONFIRMED|FACTORY_STOP_UNCONFIRMED|TRANSITION_GUARD_REFRESH_FAILED|FACTORY_UI_RESPAWNED|RENDERER_STALLED|TRANSITION_GUARD_RELEASE_UNCONFIRMED|TRANSITION_GUARD_RELEASE_RECOVERED|RENDERER_EXITED|FACTORY_RESTORE_UNCONFIRMED|RENDERER_STILL_ACTIVE|PREFLIGHT_ABORTED|WAIT_CLOCK_UNAVAILABLE|FACTORY_HANDOVER_TIMEOUT) return 0;;
        *) return 1;;
    esac
}
known_renderer_failure() {
    case "${1:-}" in
        ADOPT_RECEIPT|ADOPT_CONFIG|ADOPT_POLICY_READ|ADOPT_POLICY_INVALID|ADOPT_POLICY_CHANGED|ADOPT_BRIGHTNESS|ADOPT_SENSOR_ID|ADOPT_SENSOR_READ|ADOPT_SENSOR_STATE|ADOPT_SENSOR_INIT|ADOPT_SENSOR_ENABLE|ADOPT_SENSOR_LUX|ADOPT_GUARD_ACTIVE|ADOPT_PIN_POLICY|ADOPT_FACTORY_PRESENT|ADOPT_INTERNAL_LOCK|ADOPT_GUARD_IDENTITY|ADOPT_AUTOSLEEP_LOCK|ADOPT_LIFECYCLE|ADOPT_SLEEP_PROVIDER|ADOPT_IDLE_GUARD|BUS_PATH|BUS_SOCKET|BUS_FORK|BUS_EXEC|BUS_READY_TIMEOUT|BUS_EOF|BUS_ULOOP|BUS_CONNECT|BUS_OBJECT|BUS_SUBSCRIBER|BUS_SLEEP_SUBSCRIBE|BUS_REREGISTER|BUS_POWER_EVENT|BUS_PARENT_FD|WAKE_SENSOR_GUARD|WAKE_POLICY_READ|WAKE_POLICY_CHANGED|WAKE_SENSOR_PREPARE|DISPLAY_POLICY_INIT|PIN_PROTECT|PIN_BOOT_ID|PIN_STATE_OPEN|PIN_STATE_INVALID|PIN_STATE_STORE|UI_RESOURCE|DRM_INIT|DRM_DIMENSIONS|TOUCH_INIT|FONT_INIT|FIRST_FRAME|DISPLAY_ADOPT|BUS_RUNTIME|DISPLAY_RUNTIME|FRAME_RENDER) return 0;;
        *) return 1;;
    esac
}
read_failure() {
    failure=; waiting=; waiting_remaining=; renderer_exit=; renderer_detail=
    if safe_run && [ -f "$RUN/last-status" ] && [ ! -L "$RUN/last-status" ]; then
        last_state=$(head -c 256 "$RUN/last-status" 2>/dev/null || true)
        case "$last_state" in
            failure:*)
                value=${last_state#failure:}; primary=${value%%:*}
                if known_failure "$primary"; then
                    failure=$primary
                    if [ "$value" != "$primary" ]; then
                        detail_fields=${value#*:}; exit_value=${detail_fields%%:*}; detail_value=${detail_fields#*:}
                        if [ "$detail_fields" != "$detail_value" ]; then
                            if clock_uint "$exit_value" && [ "$exit_value" -le 255 ]; then renderer_exit=$exit_value; fi
                            if known_renderer_failure "$detail_value"; then renderer_detail=$detail_value; fi
                        fi
                    fi
                fi;;
            waiting:FACTORY_INTERNAL_LOCK_ACTIVE:*|waiting:FACTORY_INTERNAL_LOCK_UNSTABLE:*|waiting:FACTORY_AUTOSLEEP_LOCK_ACTIVE:*)
                value=${last_state#waiting:}; waiting_deadline=${value##*:}; waiting=${value%:*}
                case "$waiting" in FACTORY_INTERNAL_LOCK_ACTIVE|FACTORY_INTERNAL_LOCK_UNSTABLE|FACTORY_AUTOSLEEP_LOCK_ACTIVE) ;; *) waiting=; return;; esac
                if clock_uint "$waiting_deadline" && waiting_now=$(wait_now); then
                    waiting_remaining=$((waiting_deadline-waiting_now))
                    [ "$waiting_remaining" -ge 0 ] || waiting_remaining=0
                    [ "$waiting_remaining" -le 360 ] || waiting_remaining=360
                else waiting_remaining=null; fi
                read_supervisor
                if ! own_supervisor "$supervisor" "$supervisor_start"; then waiting=; waiting_remaining=; failure=PREFLIGHT_ABORTED; fi;;
            preflight-not-completed) failure=PREFLIGHT_ABORTED;;
        esac
    fi
}
startup_failed() {
    read_failure
    [ -n "$failure" ] || failure=PREFLIGHT_ABORTED
    printf 'TOPFLOW_ERROR=%s\n' "$failure"
    exit 8
}
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
renderer_path_present() {
    case "${1:-}" in ''|*[!0-9]*) return 1;; esac
    [ "$1" -gt 1 ] || return 1
    case "$(readlink "/proc/$1/exe" 2>/dev/null || true)" in "$ROOT/topflow-screen"|"$ROOT/topflow-screen (deleted)") return 0;; *) return 1;; esac
}
own_renderer() {
    same_process "${1:-}" "${2:-}" && renderer_path_present "$1"
}
own_supervisor() {
    same_process "${1:-}" "${2:-}" && tr '\000' '\n' < "/proc/$1/cmdline" | grep -Fxq "$ROOT/supervisor.sh"
}
factory_running() {
    for factory_pid in $(pidof zte_topsw_devui 2>/dev/null || true); do
        [ "$(readlink "/proc/$factory_pid/exe" 2>/dev/null || true)" = /usr/bin/zte_topsw_devui ] && return 0
    done
    return 1
}
factory_identity() {
    for factory_pid in $(pidof zte_topsw_devui 2>/dev/null || true); do
        if [ "$(readlink "/proc/$factory_pid/exe" 2>/dev/null || true)" = /usr/bin/zte_topsw_devui ]; then
            factory_start=$(proc_start "$factory_pid") || return 1
            [ -n "$factory_start" ] || return 1
            printf '%s %s\n' "$factory_pid" "$factory_start"; return 0
        fi
    done
    return 1
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
recovery_guard_begin() {
    # Recovery must still attempt to restore the original if the guard is broken.
    if [ -z "$control_guard" ]; then
        control_guard=$(guard_name "$$" "$(proc_start "$$")") || return 0
        recovery_guard_names="$recovery_guard_names $control_guard"
    fi
    if guard_io_safe; then guard_acquire_io "$control_guard" || true; fi
}
read_renderer() {
    renderer=; renderer_start=
    [ ! -L "$RUN/renderer.pid" ] && [ -f "$RUN/renderer.pid" ] || return 0
    read -r renderer renderer_start < "$RUN/renderer.pid" || true
}
read_supervisor() {
    supervisor=; supervisor_start=
    [ ! -L "$RUN/supervisor.pid" ] && [ -f "$RUN/supervisor.pid" ] || return 0
    read -r supervisor supervisor_start < "$RUN/supervisor.pid" || true
}
# After acquiring the lifetime lock, these root-owned published records are
# stable even when both custom processes died before recording a failure.
# Names are exact PID+birth identifiers; signalling still requires live identity.
collect_saved_guards() {
    read_supervisor
    read_renderer
    if [ -f "$RUN/supervisor.pid" ]; then
        saved_guard=$(guard_name "$supervisor" "$supervisor_start") || { echo TOPFLOW_ERROR=TRANSITION_GUARD_RELEASE_UNCONFIRMED; exit 8; }
        recovery_guard_names="$recovery_guard_names $saved_guard"
    fi
    if [ -f "$RUN/renderer.pid" ]; then
        saved_guard=$(guard_name "$renderer" "$renderer_start") || { echo TOPFLOW_ERROR=TRANSITION_GUARD_RELEASE_UNCONFIRMED; exit 8; }
        recovery_guard_names="$recovery_guard_names $saved_guard ${saved_guard}_idle"
    fi
}
safe_run() {
    [ -d "$RUN" ] && [ ! -L "$RUN" ] && [ "$(readlink -f "$RUN")" = "$RUN" ] && [ "$(stat -c %u "$RUN")" = 0 ]
}
prepare_run() {
    lifecycle_lock
    # The embedded manager revalidates its exact trusted version under fd 7.
    if command -v tf_verify_install >/dev/null 2>&1; then tf_verify_install; fi
    if [ ! -e "$RUN" ] && [ ! -L "$RUN" ]; then mkdir "$RUN" 2>/dev/null || true; fi
    safe_run || { echo 'Unsafe runtime directory' >&2; exit 6; }
    chmod 700 "$RUN"
    for file in control.lock supervisor.lock supervisor.pid supervisor.log renderer.pid renderer.log renderer.failure heartbeat last-status pin-state autostart.lock autostart.pid autostart.status autostart.attempt autostart.cancel; do
        [ ! -L "$RUN/$file" ] && { [ ! -e "$RUN/$file" ] || [ -f "$RUN/$file" ]; } || { echo 'Unsafe runtime file' >&2; exit 6; }
        [ ! -f "$RUN/$file" ] || [ "$(stat -c %h "$RUN/$file")" = 1 ] || { echo 'Hard-linked runtime file' >&2; exit 6; }
    done
    command -v flock >/dev/null
    exec 9>"$RUN/control.lock"
    flock -n 9 || { echo 'Another screen control action is in progress; retry after its result' >&2; exit 7; }
}
safe_tree() {
    tree=$1
    [ -d "$tree" ] && [ ! -L "$tree" ] && [ "$(readlink -f "$tree")" = "$tree" ] && [ "$(stat -c %u "$tree")" = 0 ] || return 1
    # Refuse nested mounts, links, devices, FIFOs and sockets before removal.
    awk -v p="$tree" '$5 == p || index($5,p "/") == 1 { bad=1 } END { exit bad ? 1 : 0 }' /proc/self/mountinfo || return 1
    [ -z "$(find "$tree" -type l -print)" ] || return 1
    [ -z "$(find "$tree" ! -type f ! -type d -print)" ] || return 1
    find "$tree" -type f -print | while IFS= read -r full; do [ "$(stat -c %h "$full")" = 1 ] || exit 1; done || return 1
}
no_plugin_processes() {
    for process_dir in /proc/[0-9]*; do
        process_pid=${process_dir#/proc/}
        [ "$process_pid" = "$$" ] && continue
        process_exe=$(readlink "$process_dir/exe" 2>/dev/null || true)
        case "$process_exe" in "$ROOT/topflow-screen"|"$ROOT/topflow-screen (deleted)"|"$ROOT/topflow-factory-bus-aarch64"|"$ROOT/topflow-factory-bus-aarch64 (deleted)") return 1;; esac
        [ -r "$process_dir/cmdline" ] || continue
        if tr '\000' '\n' < "$process_dir/cmdline" 2>/dev/null | grep -Fxq -e "$ROOT/supervisor.sh" -e "$ROOT/screenctl.sh" -e "$ROOT/boot-hook.sh"; then return 1; fi
    done
    return 0
}
stop_orphan_renderers() {
    orphan_list=; orphan_count=0
    for process_dir in /proc/[0-9]*; do
        process_pid=${process_dir##*/}
        if renderer_path_present "$process_pid"; then
            process_start=$(proc_start "$process_pid" || true)
            [ -n "$process_start" ] || { echo 'Unverified renderer remains; restore aborted' >&2; exit 8; }
            orphan_count=$((orphan_count+1))
            [ "$orphan_count" -le 4 ] || { echo 'Unexpected renderer count; restore aborted' >&2; exit 8; }
            orphan_list="$orphan_list $process_pid:$process_start"
            orphan_guard=$(guard_name "$process_pid" "$process_start")
            recovery_guard_names="$recovery_guard_names $orphan_guard ${orphan_guard}_idle"
        fi
    done
    for identity in $orphan_list; do
        orphan_pid=${identity%:*}; orphan_start=${identity#*:}
        own_renderer "$orphan_pid" "$orphan_start" || continue
        recovery_guard_begin
        kill -TERM "$orphan_pid" 2>/dev/null || true
        n=0; while own_renderer "$orphan_pid" "$orphan_start" && [ "$n" -lt 6 ]; do sleep 1; n=$((n+1)); done
        if own_renderer "$orphan_pid" "$orphan_start"; then kill -KILL "$orphan_pid" 2>/dev/null || true; fi
        n=0; while own_renderer "$orphan_pid" "$orphan_start" && [ "$n" -lt 2 ]; do sleep 1; n=$((n+1)); done
        renderer_path_present "$orphan_pid" && { echo 'Renderer remains; refusing competing factory ownership' >&2; exit 8; }
    done
    return 0
}
stop_orphan_helpers() {
    for process_dir in /proc/[0-9]*; do
        helper_pid=${process_dir##*/}
        case "$(readlink "$process_dir/exe" 2>/dev/null || true)" in "$ROOT/topflow-factory-bus-aarch64"|"$ROOT/topflow-factory-bus-aarch64 (deleted)") ;; *) continue;; esac
        helper_birth=$(proc_start "$helper_pid") || { echo 'Bus helper identity unknown' >&2; exit 8; }
        same_process "$helper_pid" "$helper_birth" || { echo 'Bus helper identity changed' >&2; exit 8; }
        kill -TERM "$helper_pid" 2>/dev/null || true
        n=0; while same_process "$helper_pid" "$helper_birth" && [ "$n" -lt 2 ]; do sleep 1; n=$((n+1)); done
        if same_process "$helper_pid" "$helper_birth"; then kill -KILL "$helper_pid" 2>/dev/null || true; fi
        n=0; while same_process "$helper_pid" "$helper_birth" && [ "$n" -lt 2 ]; do sleep 1; n=$((n+1)); done
        same_process "$helper_pid" "$helper_birth" && { echo 'Bus helper remains; factory restart refused' >&2; exit 8; }
    done
}
# BEGIN WALLPAPER
# Bounded shell transactions; no HTTP file upload, daemon or factory setting.
wallpaper_fail() { printf 'TOPFLOW_ERROR=%s\n' "$1"; exit 8; }
wallpaper_hash_valid() { case "${1:-}" in ''|*[!a-f0-9]*) return 1;; esac; [ "${#1}" = 64 ]; }
wallpaper_nonce_valid() { case "${1:-}" in ''|*[!a-f0-9]*) return 1;; esac; [ "${#1}" = 32 ]; }
wallpaper_boot_valid() { printf '%s\n' "${1:-}" | grep -Eq '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'; }
wallpaper_boot_read() {
    [ -f /proc/sys/kernel/random/boot_id ] && [ ! -L /proc/sys/kernel/random/boot_id ] && [ "$(wc -c < /proc/sys/kernel/random/boot_id)" = 37 ] || wallpaper_fail WALLPAPER_BOOT_ID_UNAVAILABLE
    wallpaper_current_boot=$(cat /proc/sys/kernel/random/boot_id)
    wallpaper_boot_valid "$wallpaper_current_boot" || wallpaper_fail WALLPAPER_BOOT_ID_UNAVAILABLE
}
wallpaper_safe_file() {
    [ -f "$1" ] && [ ! -L "$1" ] && [ "$(stat -c %u "$1")" = 0 ] && [ "$(stat -c %h "$1")" = 1 ]
}
wallpaper_root() {
    [ -d "$ROOT" ] && [ ! -L "$ROOT" ] && [ "$(readlink -f "$ROOT")" = "$ROOT" ] && [ "$(stat -c %u "$ROOT")" = 0 ] || wallpaper_fail WALLPAPER_UNSAFE_PATH
    [ "$(stat -c %a "$ROOT")" = 700 ] || wallpaper_fail WALLPAPER_UNSAFE_PATH
    [ ! -e "$ROOT/.install-owner" ] && [ ! -L "$ROOT/.install-owner" ] && [ ! -e "$ROOT/.uninstalling" ] && [ ! -L "$ROOT/.uninstalling" ] || wallpaper_fail WALLPAPER_INSTALL_INCOMPLETE
}
wallpaper_valid() {
    wallpaper_safe_file "$1" && [ "$(wc -c < "$1")" = 307216 ] || return 1
    [ "$(od -An -v -tx1 -N16 "$1" | tr -d ' \n')" = 54465750353635314001e00100b00400 ]
}
wallpaper_digest() { wallpaper_sum=$(sha256sum "$1") || return 1; wallpaper_sum=${wallpaper_sum%% *}; wallpaper_hash_valid "$wallpaper_sum"; }
wallpaper_pending_read() {
    wallpaper_pending_hash=; wallpaper_pending_nonce=; wallpaper_recorded_boot=; wallpaper_previous_boot=false
    if [ ! -e "$ROOT/.lock-wallpaper.pending" ] && [ ! -L "$ROOT/.lock-wallpaper.pending" ]; then
        for wallpaper_temp in .lock-wallpaper.upload .lock-wallpaper.chunk; do
            [ ! -e "$ROOT/$wallpaper_temp" ] && [ ! -L "$ROOT/$wallpaper_temp" ] || wallpaper_fail WALLPAPER_UNKNOWN_UPLOAD
        done
        return 0
    fi
    wallpaper_safe_file "$ROOT/.lock-wallpaper.pending" || wallpaper_fail WALLPAPER_UNSAFE_PATH
    [ "$(wc -c < "$ROOT/.lock-wallpaper.pending")" -le 240 ] && [ "$(wc -l < "$ROOT/.lock-wallpaper.pending")" = 5 ] && [ "$(head -n 1 "$ROOT/.lock-wallpaper.pending")" = TOPFLOW_SCREEN_WALLPAPER_V2 ] || wallpaper_fail WALLPAPER_UNKNOWN_UPLOAD
    wallpaper_pending_hash=$(sed -n '2p' "$ROOT/.lock-wallpaper.pending")
    wallpaper_pending_nonce=$(sed -n '4p' "$ROOT/.lock-wallpaper.pending")
    wallpaper_recorded_boot=$(sed -n '5p' "$ROOT/.lock-wallpaper.pending")
    wallpaper_hash_valid "$wallpaper_pending_hash" && wallpaper_nonce_valid "$wallpaper_pending_nonce" && wallpaper_boot_valid "$wallpaper_recorded_boot" || wallpaper_fail WALLPAPER_UNKNOWN_UPLOAD
    wallpaper_install=$(sed -n '2p' "$ROOT/.topflow-install")
    wallpaper_hash_valid "$wallpaper_install" && [ "$(sed -n '3p' "$ROOT/.lock-wallpaper.pending")" = "$wallpaper_install" ] || wallpaper_fail WALLPAPER_INSTALL_CHANGED
    wallpaper_boot_read
    [ "$wallpaper_current_boot" = "$wallpaper_recorded_boot" ] || wallpaper_previous_boot=true
    wallpaper_receipt=$(printf 'TOPFLOW_SCREEN_WALLPAPER_V2\n%s\n%s\n%s\n%s' "$wallpaper_pending_hash" "$wallpaper_install" "$wallpaper_pending_nonce" "$wallpaper_recorded_boot")
    [ "$(cat "$ROOT/.lock-wallpaper.pending")" = "$wallpaper_receipt" ] && [ "$(tail -c 1 "$ROOT/.lock-wallpaper.pending" | wc -l)" = 1 ] || wallpaper_fail WALLPAPER_UNKNOWN_UPLOAD
    for wallpaper_temp in .lock-wallpaper.upload .lock-wallpaper.chunk; do
        if [ -e "$ROOT/$wallpaper_temp" ] || [ -L "$ROOT/$wallpaper_temp" ]; then
            wallpaper_limit=307216; [ "$wallpaper_temp" != .lock-wallpaper.chunk ] || wallpaper_limit=24576
            wallpaper_safe_file "$ROOT/$wallpaper_temp" && [ "$(wc -c < "$ROOT/$wallpaper_temp")" -le "$wallpaper_limit" ] || wallpaper_fail WALLPAPER_UNSAFE_PATH
        fi
    done
}
wallpaper_status() {
    wallpaper_root; wallpaper_boot_read; wallpaper_pending_read
    wallpaper_configured=false; wallpaper_hash=
    if [ -e "$ROOT/lock-wallpaper.rgb565" ] || [ -L "$ROOT/lock-wallpaper.rgb565" ]; then
        wallpaper_valid "$ROOT/lock-wallpaper.rgb565" && wallpaper_digest "$ROOT/lock-wallpaper.rgb565" || wallpaper_fail WALLPAPER_INVALID_FILE
        wallpaper_configured=true; wallpaper_hash=$wallpaper_sum
    fi
    wallpaper_pending=false; [ -z "$wallpaper_pending_hash" ] || wallpaper_pending=true
    wallpaper_uploaded_bytes=0; wallpaper_upload_valid=false
    if [ -n "$wallpaper_pending_hash" ] && [ -f "$ROOT/.lock-wallpaper.upload" ]; then
        wallpaper_uploaded_bytes=$(wc -c < "$ROOT/.lock-wallpaper.upload")
        if wallpaper_valid "$ROOT/.lock-wallpaper.upload" && wallpaper_digest "$ROOT/.lock-wallpaper.upload" && [ "$wallpaper_sum" = "$wallpaper_pending_hash" ]; then wallpaper_upload_valid=true; fi
    fi
    printf 'TOPFLOW_WALLPAPER={"configured":%s,"sha256":"%s","pending":%s,"pendingSha256":"%s","pendingNonce":"%s","pendingBootId":"%s","bootId":"%s","uploadedBytes":%s,"uploadValid":%s,"previousBoot":%s}\n' "$wallpaper_configured" "$wallpaper_hash" "$wallpaper_pending" "$wallpaper_pending_hash" "$wallpaper_pending_nonce" "$wallpaper_recorded_boot" "$wallpaper_current_boot" "$wallpaper_uploaded_bytes" "$wallpaper_upload_valid" "$wallpaper_previous_boot"
}
wallpaper_action() {
    [ "${2:-}" = --confirmed ] && wallpaper_hash_valid "${3:-}" || wallpaper_fail WALLPAPER_CONFIRM_REQUIRED
    wallpaper_nonce_valid "${4:-}" && wallpaper_boot_valid "${5:-}" || wallpaper_fail WALLPAPER_CONFIRM_REQUIRED
    if [ "$1" = wallpaper-chunk ]; then [ "$#" = 7 ] || wallpaper_fail WALLPAPER_CONFIRM_REQUIRED
    else [ "$#" = 5 ] || wallpaper_fail WALLPAPER_CONFIRM_REQUIRED; fi
    lifecycle_lock
    if command -v tf_verify_install >/dev/null 2>&1; then tf_verify_install; fi
    wallpaper_root; wallpaper_boot_read; wallpaper_pending_read
    wallpaper_target=$3
    [ "$5" = "$wallpaper_current_boot" ] || wallpaper_fail WALLPAPER_BOOT_CHANGED
    case "$1" in
        wallpaper-prepare)
            [ -z "$wallpaper_pending_hash" ] || wallpaper_fail WALLPAPER_UPLOAD_ACTIVE
            if [ -e "$ROOT/lock-wallpaper.rgb565" ] || [ -L "$ROOT/lock-wallpaper.rgb565" ]; then wallpaper_valid "$ROOT/lock-wallpaper.rgb565" || wallpaper_fail WALLPAPER_INVALID_FILE; fi
            wallpaper_install=$(sed -n '2p' "$ROOT/.topflow-install")
            wallpaper_hash_valid "$wallpaper_install" || wallpaper_fail WALLPAPER_INSTALL_CHANGED
            (set -C; printf 'TOPFLOW_SCREEN_WALLPAPER_V2\n%s\n%s\n%s\n%s\n' "$wallpaper_target" "$wallpaper_install" "$4" "$wallpaper_current_boot" > "$ROOT/.lock-wallpaper.pending") || wallpaper_fail WALLPAPER_UPLOAD_ACTIVE
            (set -C; : > "$ROOT/.lock-wallpaper.upload") || wallpaper_fail WALLPAPER_UNSAFE_PATH
            printf 'TOPFLOW_WALLPAPER=PREPARED\n';;
        wallpaper-chunk|wallpaper-commit|wallpaper-abort)
            [ "$wallpaper_pending_hash" = "$wallpaper_target" ] && [ "$wallpaper_pending_nonce" = "$4" ] || wallpaper_fail WALLPAPER_UPLOAD_CHANGED
            if [ "$1" = wallpaper-abort ]; then
                rm -f "$ROOT/.lock-wallpaper.chunk" "$ROOT/.lock-wallpaper.upload" "$ROOT/.lock-wallpaper.pending"
                printf 'TOPFLOW_WALLPAPER=ABORTED\n'; return
            fi
            [ "$wallpaper_previous_boot" = false ] || wallpaper_fail WALLPAPER_PREVIOUS_BOOT
            wallpaper_safe_file "$ROOT/.lock-wallpaper.upload" || wallpaper_fail WALLPAPER_UNSAFE_PATH
            [ ! -e "$ROOT/.lock-wallpaper.chunk" ] && [ ! -L "$ROOT/.lock-wallpaper.chunk" ] || wallpaper_fail WALLPAPER_CHUNK_PENDING
            if [ "$1" = wallpaper-chunk ]; then
                case "$6" in 0|[1-9]|[1-9][0-9]|[1-9][0-9][0-9]|[1-9][0-9][0-9][0-9]|[1-9][0-9][0-9][0-9][0-9]|[1-9][0-9][0-9][0-9][0-9][0-9]) ;; *) wallpaper_fail WALLPAPER_INVALID_OFFSET;; esac
                [ "$6" = "$(wc -c < "$ROOT/.lock-wallpaper.upload" | tr -d ' ')" ] || wallpaper_fail WALLPAPER_OFFSET_CHANGED
                [ "${#7}" -gt 0 ] && [ "${#7}" -le 32768 ] && [ "$((${#7} % 4))" = 0 ] || wallpaper_fail WALLPAPER_INVALID_CHUNK
                printf '%s\n' "$7" | grep -Eq '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' || wallpaper_fail WALLPAPER_INVALID_CHUNK
                (set -C; printf '%s' "$7" | base64 -d > "$ROOT/.lock-wallpaper.chunk") || wallpaper_fail WALLPAPER_INVALID_CHUNK
                wallpaper_safe_file "$ROOT/.lock-wallpaper.chunk" || wallpaper_fail WALLPAPER_UNSAFE_PATH
                wallpaper_chunk_bytes=$(wc -c < "$ROOT/.lock-wallpaper.chunk")
                [ "$wallpaper_chunk_bytes" -gt 0 ] && [ "$wallpaper_chunk_bytes" -le 24576 ] && [ "$(base64 "$ROOT/.lock-wallpaper.chunk" | tr -d '\n')" = "$7" ] || wallpaper_fail WALLPAPER_INVALID_CHUNK
                wallpaper_next_bytes=$(($6 + wallpaper_chunk_bytes))
                [ "$wallpaper_next_bytes" -le 307216 ] || wallpaper_fail WALLPAPER_TOO_LARGE
                cat "$ROOT/.lock-wallpaper.chunk" >> "$ROOT/.lock-wallpaper.upload"
                [ "$(wc -c < "$ROOT/.lock-wallpaper.upload" | tr -d ' ')" = "$wallpaper_next_bytes" ] || wallpaper_fail WALLPAPER_UPLOAD_CHANGED
                rm -f "$ROOT/.lock-wallpaper.chunk"
                printf 'TOPFLOW_WALLPAPER=CHUNKED\n'; return
            fi
            wallpaper_valid "$ROOT/.lock-wallpaper.upload" || wallpaper_fail WALLPAPER_INVALID_FILE
            wallpaper_identity=$(stat -c '%d:%i:%s:%Y:%Z' "$ROOT/.lock-wallpaper.upload")
            wallpaper_digest "$ROOT/.lock-wallpaper.upload" && [ "$wallpaper_sum" = "$wallpaper_target" ] || wallpaper_fail WALLPAPER_HASH_MISMATCH
            if [ -e "$ROOT/lock-wallpaper.rgb565" ] || [ -L "$ROOT/lock-wallpaper.rgb565" ]; then wallpaper_valid "$ROOT/lock-wallpaper.rgb565" || wallpaper_fail WALLPAPER_INVALID_FILE; fi
            wallpaper_safe_file "$ROOT/.lock-wallpaper.upload" && [ "$(stat -c '%d:%i:%s:%Y:%Z' "$ROOT/.lock-wallpaper.upload")" = "$wallpaper_identity" ] || wallpaper_fail WALLPAPER_UPLOAD_CHANGED
            chmod 600 "$ROOT/.lock-wallpaper.upload"
            mv -f "$ROOT/.lock-wallpaper.upload" "$ROOT/lock-wallpaper.rgb565"
            rm -f "$ROOT/.lock-wallpaper.pending"
            printf 'TOPFLOW_WALLPAPER=COMMITTED\n';;
        wallpaper-clear)
            [ -z "$wallpaper_pending_hash" ] || wallpaper_fail WALLPAPER_UPLOAD_ACTIVE
            if [ -e "$ROOT/lock-wallpaper.rgb565" ] || [ -L "$ROOT/lock-wallpaper.rgb565" ]; then
                wallpaper_valid "$ROOT/lock-wallpaper.rgb565" && wallpaper_digest "$ROOT/lock-wallpaper.rgb565" || wallpaper_fail WALLPAPER_INVALID_FILE
                [ "$wallpaper_sum" = "$wallpaper_target" ] || wallpaper_fail WALLPAPER_HASH_MISMATCH
                rm -f "$ROOT/lock-wallpaper.rgb565"
            fi
            printf 'TOPFLOW_WALLPAPER=CLEARED\n';;
        *) wallpaper_fail WALLPAPER_INVALID_ACTION;;
    esac
}
# END WALLPAPER

validate_install_tree() {
    [ "$(readlink -f /data/plugins)" = /data/plugins ] || { echo 'Unsafe plugin parent' >&2; exit 9; }
    safe_tree "$ROOT" || { echo 'Unsafe plugin tree; nothing removed' >&2; exit 9; }
    [ -f "$ROOT/.topflow-install" ] && [ "$(head -n 1 "$ROOT/.topflow-install")" = TOPFLOW_SCREEN_INSTALL_V1 ] && [ -f "$ROOT/.topflow-files" ] || { echo 'Install ownership not verified; nothing removed' >&2; exit 9; }
    [ ! -e "$ROOT/.upload-active" ] && [ ! -L "$ROOT/.upload-active" ] || { echo 'Upload still active or outcome unknown; cleanup refused' >&2; exit 9; }
    wallpaper_pending_read
    install_hash=$(sed -n '2p' "$ROOT/.topflow-install")
    case "$install_hash" in ''|*[!a-f0-9]*) echo 'Invalid install hash; nothing removed' >&2; exit 9;; esac
    [ "${#install_hash}" = 64 ] || { echo 'Invalid install hash length; nothing removed' >&2; exit 9; }
    if [ -e "$ROOT/.install-owner" ]; then
        install_owner=$(cat "$ROOT/.install-owner")
        case "$install_owner" in ''|*[!a-f0-9]*) echo 'Invalid partial install owner' >&2; exit 9;; esac
        [ "${#install_owner}" = 32 ] || { echo 'Invalid partial install owner length' >&2; exit 9; }
    elif [ -e "$ROOT/.payload.tar.gz" ]; then echo 'Unowned upload staging file' >&2; exit 9; fi
    # The manifest was produced from the locally verified archive. Unknown files
    # stop removal instead of being silently treated as ours.
    while IFS= read -r entry; do
        case "$entry" in ''|.*|/*|*..*|*[!A-Za-z0-9._/-]*) echo 'Unsafe installed manifest' >&2; exit 9;; esac
    done < "$ROOT/.topflow-files"
    find "$ROOT" -mindepth 1 -print | while IFS= read -r full; do
        entry=${full#"$ROOT/"}
        case "$entry" in lock-wallpaper.rgb565) wallpaper_valid "$full" || { echo TOPFLOW_ERROR=WALLPAPER_INVALID_FILE; exit 9; };; .lock-wallpaper.upload|.lock-wallpaper.pending|.lock-wallpaper.chunk) [ -n "$wallpaper_pending_hash" ] || { echo TOPFLOW_ERROR=WALLPAPER_UNKNOWN_UPLOAD; exit 9; };; .topflow-install|.topflow-files|.lifecycle.lock|.uninstalling|.install-owner|.payload.tar.gz|.autostart-enabled|.autostart-hook.lock|autostart-boot-created) [ -f "$full" ] || { echo 'Invalid metadata type; nothing removed' >&2; exit 9; };; .autostart-hook-work) [ -d "$full" ] || exit 9;; .autostart-hook-work/owner|.autostart-hook-work/before|.autostart-hook-work/after|.autostart-hook-work/created) [ -f "$full" ] || exit 9;; *) grep -Fxq "$entry" "$ROOT/.topflow-files" || { echo 'Unexpected plugin file; nothing removed' >&2; exit 9; };; esac
    done
}
uninstall_components() {
    validate_install_tree
    safe_tree "$RUN" || { echo 'Unsafe runtime tree; nothing removed' >&2; exit 9; }
    for full in "$RUN"/* "$RUN"/.[!.]* "$RUN"/..?*; do
        [ -e "$full" ] || continue
        [ -f "$full" ] || { echo 'Unexpected runtime directory; nothing removed' >&2; exit 9; }
        case "${full#"$RUN/"}" in control.lock|supervisor.lock|supervisor.pid|renderer.pid|renderer.failure|heartbeat|supervisor.log|renderer.log|last-status|pin-state|autostart.lock|autostart.pid|autostart.status|autostart.attempt|autostart.cancel) ;; *) echo 'Unexpected runtime file; nothing removed' >&2; exit 9;; esac
    done
    no_plugin_processes || { echo 'Plugin process still present; nothing removed' >&2; exit 9; }
    # Keep the marker and locks while removing executable entry points first.
    printf 'uninstalling\n' > "$ROOT/.uninstalling"
    rm -f "$ROOT/lock-wallpaper.rgb565" "$ROOT/.lock-wallpaper.upload" "$ROOT/.lock-wallpaper.pending" "$ROOT/.lock-wallpaper.chunk"
    rm -f "$ROOT/topflow-screen" "$ROOT/topflow-factory-bus-aarch64" "$ROOT/screenctl.sh" "$ROOT/supervisor.sh" "$ROOT/boot-hook.sh"
    while IFS= read -r entry; do [ ! -f "$ROOT/$entry" ] || rm -f "$ROOT/$entry"; done < "$ROOT/.topflow-files"
    find "$ROOT" -depth -mindepth 1 -type d -exec rmdir '{}' ';'
    rm -f "$ROOT/.payload.tar.gz" "$ROOT/.install-owner" "$ROOT/.autostart-enabled" "$ROOT/.autostart-hook.lock"
    # Entry points are already absent and .uninstalling is retained. A late
    # start checks both before takeover. Keep the verified ownership manifest
    # until runtime removal finishes, so an interrupted cleanup can be resumed.
    for full in "$RUN"/*; do [ ! -f "$full" ] || rm -f "$full"; done
    rmdir "$RUN"
    rm -f "$ROOT/.topflow-files" "$ROOT/.topflow-install" "$ROOT/.uninstalling" "$ROOT/.lifecycle.lock"
    rmdir "$ROOT"
    [ ! -e "$ROOT" ] && [ ! -L "$ROOT" ] && [ ! -e "$RUN" ] && [ ! -L "$RUN" ] || { echo 'Removal could not be confirmed' >&2; exit 9; }
    printf 'TOPFLOW_UNINSTALL=COMPONENTS_REMOVED\n'
}
# Plugin-owned boot integration. No init service or vendor file is changed.
AUTOSTART_LINE='sh /data/plugins/topflow-screen/screenctl.sh autostart-run >/dev/null 2>&1 & # TOPFLOW_SCREEN_AUTOSTART_V1'
BOOT=/data/plugins/ufi_tools_boot.sh
autostart_safe_file() {
    [ -f "$1" ] && [ ! -L "$1" ] && [ "$(readlink -f "$1")" = "$1" ] && [ "$(stat -c %u "$1")" = 0 ] && [ "$(stat -c %h "$1")" = 1 ]
}
autostart_boot_id() {
    autostart_boot=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null) || return 1
    [ "${#autostart_boot}" = 36 ] || return 1
    case "$autostart_boot" in *[!a-f0-9-]*) return 1;; esac
    printf '%s\n' "$autostart_boot"
}
autostart_hook_read() {
    autostart_hook=unknown
    if [ ! -e "$BOOT" ] && [ ! -L "$BOOT" ]; then autostart_hook=absent; return; fi
    autostart_safe_file "$BOOT" || { autostart_hook=conflict; return; }
    autostart_boot_size=$(wc -c < "$BOOT")
    [ "$autostart_boot_size" -ge 10 ] && [ "$autostart_boot_size" -le 131072 ] && [ "$(tail -c 1 "$BOOT" | wc -l)" = 1 ] && [ "$(LC_ALL=C tr -d '\000\015' < "$BOOT" | wc -c)" = "$autostart_boot_size" ] && sh -n "$BOOT" 2>/dev/null || { autostart_hook=conflict; return; }
    autostart_exact=$(grep -Fxc "$AUTOSTART_LINE" "$BOOT" || true)
    autostart_related=$(grep -Ec 'topflow-screen|TOPFLOW_SCREEN_AUTOSTART' "$BOOT" || true)
    if [ "$autostart_exact" = 1 ] && [ "$autostart_related" = 1 ] && [ "$(head -n 1 "$BOOT")" = '#!/bin/sh' ] && [ "$(sed -n '2p' "$BOOT")" = "$AUTOSTART_LINE" ]; then autostart_hook=present
    elif [ "$autostart_related" = 0 ]; then autostart_hook=absent
    else autostart_hook=conflict; fi
}
autostart_integrity() {
    autostart_safe_file "$ROOT/boot-integrity.sha256" || return 1
    [ "$(wc -c < "$ROOT/boot-integrity.sha256")" -le 65536 ] || return 1
    [ "$(wc -l < "$ROOT/boot-integrity.sha256")" -ge 7 ] || return 1
    while read -r autostart_digest autostart_name autostart_extra; do
        [ -z "$autostart_extra" ] && [ "${#autostart_digest}" = 64 ] || return 1
        case "$autostart_digest" in *[!a-f0-9]*) return 1;; esac
        case "$autostart_name" in ''|.*|/*|*..*|*[!A-Za-z0-9._/-]*) return 1;; esac
        autostart_safe_file "$ROOT/$autostart_name" || return 1
    done < "$ROOT/boot-integrity.sha256"
    for autostart_required in screenctl.sh supervisor.sh boot-hook.sh topflow-screen topflow-factory-bus-aarch64 topflow-screen.sha256 ui/index.html; do
        awk -v expected="$autostart_required" 'NF==2 && $2==expected {found++} END {exit found==1?0:1}' "$ROOT/boot-integrity.sha256" || return 1
    done
    (cd "$ROOT" && sha256sum -c boot-integrity.sha256 >/dev/null 2>&1)
}
autostart_marker_valid() {
    autostart_safe_file "$ROOT/.autostart-enabled" || return 1
    [ "$(wc -c < "$ROOT/.autostart-enabled")" -le 256 ] || return 1
    autostart_safe_file "$ROOT/.topflow-install" || return 1
    [ "$(head -n 1 "$ROOT/.topflow-install")" = TOPFLOW_SCREEN_INSTALL_V1 ] || return 1
    autostart_archive=$(sed -n '2p' "$ROOT/.topflow-install")
    [ "${#autostart_archive}" = 64 ] || return 1
    case "$autostart_archive" in *[!a-f0-9]*) return 1;; esac
    autostart_safe_file "$ROOT/boot-integrity.sha256" || return 1
    autostart_integrity_hash=$(sha256sum "$ROOT/boot-integrity.sha256") || return 1
    autostart_integrity_hash=${autostart_integrity_hash%% *}
    [ "$(cat "$ROOT/.autostart-enabled")" = "$(printf 'TOPFLOW_SCREEN_AUTOSTART_V1\n%s\n%s\n' "$autostart_archive" "$autostart_integrity_hash")" ]
}
autostart_known_reason() {
    case "${1:-}" in NONE|USER_DISABLED|USER_CANCELLED|BOOT_ALREADY_ATTEMPTED|DEPENDENCIES_NOT_READY|READY_TIMEOUT|INSTALL_CHANGED|INTEGRITY_FAILED|CONFIG_INVALID|HOOK_CONFLICT|CONTROL_BUSY|START_FAILED|SCREEN_READY|SCREEN_UNCONFIRMED|BOOT_ID_UNAVAILABLE) return 0;; *) return 1;; esac
}
autostart_record() { printf '%s %s\n' "$1" "$2" > "$RUN/autostart.status"; }
autostart_status() {
    autostart_enabled=false; autostart_state=disabled; autostart_reason=NONE
    autostart_hook_read
    if [ -e "$ROOT/.autostart-enabled" ] || [ -L "$ROOT/.autostart-enabled" ]; then
        if ! autostart_marker_valid; then autostart_state=failed; autostart_reason=CONFIG_INVALID
        elif [ "$autostart_hook" != present ]; then autostart_state=failed; autostart_reason=HOOK_CONFLICT
        elif ! autostart_integrity; then autostart_state=failed; autostart_reason=INTEGRITY_FAILED
        else autostart_enabled=true; autostart_state=enabled; fi
    fi
    if safe_run && autostart_safe_file "$RUN/autostart.status" && [ "$(wc -c < "$RUN/autostart.status")" -le 96 ]; then
        read -r autostart_saved_state autostart_saved_reason autostart_saved_extra < "$RUN/autostart.status" || true
        case "$autostart_saved_state" in waiting|starting|started|skipped|failed|cancelled)
            if [ -z "${autostart_saved_extra:-}" ] && autostart_known_reason "${autostart_saved_reason:-}" && [ "$autostart_reason" = NONE ]; then
                autostart_state=$autostart_saved_state; autostart_reason=$autostart_saved_reason
            fi;;
        esac
    fi
    printf ',"autostart":{"enabled":%s,"hook":"%s","state":"%s","reason":"%s"}' "$autostart_enabled" "$autostart_hook" "$autostart_state" "$autostart_reason"
}
autostart_own_worker() {
    same_process "${1:-}" "${2:-}" && tr '\000' '\n' < "/proc/$1/cmdline" | grep -Fxq "$ROOT/screenctl.sh" && tr '\000' '\n' < "/proc/$1/cmdline" | grep -Fxq autostart-run
}
autostart_cancel_pending() {
    autostart_cancel_boot=$(autostart_boot_id) || { echo TOPFLOW_ERROR=AUTOSTART_BOOT_ID_UNAVAILABLE; exit 8; }
    printf '%s\n' "$autostart_cancel_boot" > "$RUN/autostart.cancel"
    autostart_record cancelled USER_CANCELLED
    if [ -e "$RUN/autostart.pid" ] || [ -L "$RUN/autostart.pid" ]; then
        autostart_safe_file "$RUN/autostart.pid" || { echo TOPFLOW_ERROR=AUTOSTART_WORKER_UNVERIFIED; exit 8; }
        [ "$(wc -c < "$RUN/autostart.pid")" -le 64 ] || { echo TOPFLOW_ERROR=AUTOSTART_WORKER_UNVERIFIED; exit 8; }
        read -r autostart_pid autostart_birth autostart_extra < "$RUN/autostart.pid" || true
        [ -z "${autostart_extra:-}" ] || { echo TOPFLOW_ERROR=AUTOSTART_WORKER_UNVERIFIED; exit 8; }
        if autostart_own_worker "${autostart_pid:-}" "${autostart_birth:-}"; then
            kill -TERM "$autostart_pid" 2>/dev/null || true
            autostart_wait=0
            while autostart_own_worker "$autostart_pid" "$autostart_birth"; do
                [ "$autostart_wait" -lt 5 ] || { echo TOPFLOW_ERROR=AUTOSTART_WORKER_BUSY; exit 8; }
                sleep 1; autostart_wait=$((autostart_wait+1))
            done
        elif same_process "${autostart_pid:-}" "${autostart_birth:-}"; then
            echo TOPFLOW_ERROR=AUTOSTART_WORKER_UNVERIFIED; exit 8
        fi
        rm -f "$RUN/autostart.pid"
    fi
}
autostart_hook_disable() {
    autostart_hook_read
    if [ -f "$ROOT/boot-hook.sh" ] && [ ! -L "$ROOT/boot-hook.sh" ]; then
        if autostart_integrity; then
            sh "$ROOT/boot-hook.sh" disable || { echo TOPFLOW_ERROR=AUTOSTART_HOOK_CONFLICT; exit 8; }
        else
            # An interrupted first extraction may contain this helper before
            # its manifest. No boot entry or configuration may have existed.
            [ "$autostart_hook" = absent ] && [ ! -e "$ROOT/.autostart-enabled" ] && [ ! -e "$ROOT/autostart-boot-created" ] && [ ! -e "$ROOT/.autostart-hook-work" ] && [ ! -e "$ROOT/.autostart-hook.lock" ] || { echo TOPFLOW_ERROR=AUTOSTART_INTEGRITY_FAILED; exit 8; }
        fi
    elif [ "$autostart_hook" != absent ] || [ -e "$ROOT/autostart-boot-created" ] || [ -e "$ROOT/.autostart-hook-work" ]; then echo TOPFLOW_ERROR=AUTOSTART_HOOK_CONFLICT; exit 8; fi
    if [ -e "$ROOT/.autostart-enabled" ] || [ -L "$ROOT/.autostart-enabled" ]; then
        autostart_safe_file "$ROOT/.autostart-enabled" || { echo TOPFLOW_ERROR=AUTOSTART_CONFIG_INVALID; exit 8; }
        rm -f "$ROOT/.autostart-enabled"
    fi
}
autostart_boot_start_guard() {
    [ "${3:-}" = --autostart ] || return 0
    [ "${4:-}" = "$(autostart_boot_id)" ] && [ "${5:-}" = "$(stat -c %d:%i "$ROOT")" ] || { echo TOPFLOW_ERROR=AUTOSTART_INSTALL_CHANGED; exit 8; }
    autostart_marker_valid && autostart_integrity || { echo TOPFLOW_ERROR=AUTOSTART_INTEGRITY_FAILED; exit 8; }
    autostart_hook_read
    [ "$autostart_hook" = present ] || { echo TOPFLOW_ERROR=AUTOSTART_HOOK_CONFLICT; exit 8; }
    [ ! -e "$RUN/autostart.cancel" ] && [ ! -L "$RUN/autostart.cancel" ] || { echo TOPFLOW_ERROR=AUTOSTART_CANCELLED; exit 8; }
    autostart_safe_file "$RUN/autostart.attempt" && [ "$(cat "$RUN/autostart.attempt")" = "$4" ] || { echo TOPFLOW_ERROR=AUTOSTART_ATTEMPT_INVALID; exit 8; }
    autostart_record starting NONE
}
autostart_dependencies_ready() {
    factory_running && factory_provider_ready || return 1
    [ -c /dev/dri/card0 ] && [ -r /usr/ui/fonts/ZTEZhengYuan.ttf ] || return 1
    curl -q -f -s --noproxy '*' -m 2 http://127.0.0.1:9460/state | grep -q '"modems"'
}
autostart_worker_finished() {
    trap - EXIT
    trap '' HUP INT TERM
    if [ -n "${autostart_worker_identity:-}" ] && safe_run && autostart_safe_file "$RUN/autostart.pid" && [ "$(cat "$RUN/autostart.pid")" = "$autostart_worker_identity" ]; then rm -f "$RUN/autostart.pid"; fi
}
autostart_worker() {
    [ -d "$ROOT" ] && [ ! -L "$ROOT" ] && [ -f "$ROOT/.topflow-install" ] && [ ! -e "$ROOT/.install-owner" ] && [ ! -e "$ROOT/.uninstalling" ] || return 0
    autostart_marker_valid && autostart_integrity || return 0
    prepare_run
    autostart_marker_valid && autostart_integrity || { echo TOPFLOW_ERROR=AUTOSTART_INTEGRITY_FAILED; exit 8; }
    autostart_hook_read
    [ "$autostart_hook" = present ] || { autostart_record failed HOOK_CONFLICT; return 0; }
    autostart_current_boot=$(autostart_boot_id) || { autostart_record failed BOOT_ID_UNAVAILABLE; return 0; }
    if [ -e "$RUN/autostart.attempt" ]; then
        [ "$(cat "$RUN/autostart.attempt")" = "$autostart_current_boot" ] || { autostart_record failed CONFIG_INVALID; return 0; }
        return 0
    fi
    [ ! -e "$RUN/autostart.cancel" ] || { autostart_record cancelled USER_CANCELLED; return 0; }
    exec 6>"$RUN/autostart.lock"
    flock -n 6 || return 0
    autostart_worker_identity="$$ $(proc_start "$$")"
    printf '%s\n' "$autostart_worker_identity" > "$RUN/autostart.pid"
    printf '%s\n' "$autostart_current_boot" > "$RUN/autostart.attempt"
    autostart_install_id=$(stat -c %d:%i "$ROOT")
    autostart_install_marker=$(cat "$ROOT/.topflow-install")
    autostart_record waiting DEPENDENCIES_NOT_READY
    trap autostart_worker_finished EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    # Only the attempt lock stays held. UI controls must remain available.
    exec 7<&-
    exec 9>&-
    autostart_begin=$(wait_now) || { autostart_record failed BOOT_ID_UNAVAILABLE; return 0; }
    autostart_deadline=$((autostart_begin+120))
    while :; do
        [ "$(stat -c %d:%i "$ROOT" 2>/dev/null)" = "$autostart_install_id" ] && [ "$(cat "$ROOT/.topflow-install" 2>/dev/null)" = "$autostart_install_marker" ] || return 0
        if ! autostart_marker_valid || [ -e "$RUN/autostart.cancel" ]; then autostart_record cancelled USER_CANCELLED; return 0; fi
        autostart_now=$(wait_now) || { autostart_record failed BOOT_ID_UNAVAILABLE; return 0; }
        [ "$autostart_now" -lt "$autostart_deadline" ] || { autostart_record failed READY_TIMEOUT; return 0; }
        if autostart_dependencies_ready; then break; fi
        sleep 2
    done
    # This controller obtains the lifecycle lock again and rechecks opt-in,
    # cancellation and installation identity under that lock before takeover.
    if ! sh "$ROOT/screenctl.sh" start --confirmed --autostart "$autostart_current_boot" "$autostart_install_id" >/dev/null 2>&1; then
        [ -e "$RUN/autostart.cancel" ] || autostart_record failed START_FAILED
        return 0
    fi
    autostart_healthy=0; autostart_checks=0
    while [ "$autostart_checks" -lt 30 ]; do
        [ -e "$RUN/autostart.cancel" ] && return 0
        autostart_snapshot=$(sh "$ROOT/screenctl.sh" status 6>&- 2>/dev/null) || autostart_snapshot=
        case "$autostart_snapshot" in *'"mode":"custom"'*'"ready":true'*'"supervised":true'*) autostart_healthy=$((autostart_healthy+1));; *) autostart_healthy=0;; esac
        if [ "$autostart_healthy" -ge 3 ]; then autostart_record started SCREEN_READY; return 0; fi
        read_failure
        if [ -n "$failure" ]; then autostart_record failed START_FAILED; return 0; fi
        sleep 1; autostart_checks=$((autostart_checks+1))
    done
    # The existing supervisor retains failure recovery. Never automatically
    # retry or forcibly switch after a manual control may have taken ownership.
    autostart_record failed SCREEN_UNCONFIRMED
}
# END AUTOSTART

case "${1:-status}" in
 wallpaper-status)
    [ -z "${2:-}" ] || wallpaper_fail WALLPAPER_INVALID_ACTION
    wallpaper_status
    ;;
 wallpaper-prepare|wallpaper-chunk|wallpaper-commit|wallpaper-abort|wallpaper-clear)
    wallpaper_action "$@"
    ;;
 autostart-run)
    autostart_worker
    ;;
 autostart-enable|autostart-disable)
    [ "${2:-}" = --confirmed ] || { echo 'Explicit autostart setting confirmation required' >&2; exit 2; }
    prepare_run
    [ ! -e "$ROOT/.install-owner" ] && [ ! -e "$ROOT/.uninstalling" ] || { echo TOPFLOW_ERROR=AUTOSTART_INSTALL_CHANGED; exit 8; }
    if [ "$1" = autostart-enable ]; then
        autostart_integrity || { echo TOPFLOW_ERROR=AUTOSTART_INTEGRITY_FAILED; exit 8; }
        if [ -e "$ROOT/.autostart-enabled" ] || [ -L "$ROOT/.autostart-enabled" ]; then autostart_safe_file "$ROOT/.autostart-enabled" || { echo TOPFLOW_ERROR=AUTOSTART_CONFIG_INVALID; exit 8; }; fi
        sh "$ROOT/boot-hook.sh" enable || { echo TOPFLOW_ERROR=AUTOSTART_HOOK_CONFLICT; exit 8; }
        autostart_archive=$(sed -n '2p' "$ROOT/.topflow-install")
        autostart_integrity_hash=$(sha256sum "$ROOT/boot-integrity.sha256"); autostart_integrity_hash=${autostart_integrity_hash%% *}
        printf 'TOPFLOW_SCREEN_AUTOSTART_V1\n%s\n%s\n' "$autostart_archive" "$autostart_integrity_hash" > "$ROOT/.autostart-enabled"
        autostart_marker_valid || { echo TOPFLOW_ERROR=AUTOSTART_CONFIG_INVALID; exit 8; }
    else
        autostart_hook_disable
        autostart_cancel_pending
    fi
    if [ "$1" = autostart-enable ]; then printf 'TOPFLOW_AUTOSTART=ENABLED\n'; else printf 'TOPFLOW_AUTOSTART=DISABLED\n'; fi
    ;;
 status)
    read_failure
    failure_field=$(autostart_status)
    if [ -n "$failure" ]; then
        failure_field=$failure_field',"failure":"'$failure'"'
        [ -z "$renderer_exit" ] || failure_field=$failure_field',"rendererExitStatus":'$renderer_exit
        [ -z "$renderer_detail" ] || failure_field=$failure_field',"rendererFailure":"'$renderer_detail'"'
    elif [ -n "$waiting" ]; then failure_field=$failure_field',"waiting":"'$waiting'","waitingRemaining":'$waiting_remaining; fi
    renderer=; renderer_start=
    if safe_run; then read_renderer; fi
    if own_renderer "$renderer" "$renderer_start"; then
        ready=false; age=null; supervised=false
        read_supervisor
        if own_supervisor "$supervisor" "$supervisor_start"; then supervised=true; fi
        if [ ! -L "$RUN/heartbeat" ] && [ -f "$RUN/heartbeat" ]; then
            beat=$(cat "$RUN/heartbeat" 2>/dev/null || true)
            if clock_uint "$beat" && now=$(monotonic_now); then
                age=$((now-beat))
                [ "$age" -lt 0 ] || [ "$age" -gt 12 ] || ready=true
            fi
        fi
        printf '{"mode":"custom","pid":%s,"ready":%s,"heartbeatAge":%s,"supervised":%s%s}\n' "$renderer" "$ready" "$age" "$supervised" "$failure_field"
    elif renderer_path_present "$renderer"; then printf '{"mode":"unknown"%s}\n' "$failure_field"
    elif factory_running; then printf '{"mode":"factory"%s}\n' "$failure_field"
    else printf '{"mode":"unknown"%s}\n' "$failure_field"; fi
    ;;
 start)
    [ "${2:-}" = '--confirmed' ] || { echo 'Explicit switch confirmation required' >&2; exit 2; }
    [ -z "${3:-}" ] || [ "$3" = --autostart ] || exit 2
    [ "$(uname -m)" = aarch64 ] || { echo 'Requires aarch64' >&2; exit 3; }
    [ -x "$ROOT/topflow-screen" ] && [ -r "$ROOT/ui/index.html" ] || { echo 'Payload incomplete' >&2; exit 4; }
    [ -f "$ROOT/supervisor.sh" ] && [ ! -L "$ROOT/supervisor.sh" ]
    command -v ubus >/dev/null
    [ -x /etc/init.d/zte_topsw_devui ] && [ -c /dev/dri/card0 ]
    prepare_run
    autostart_boot_start_guard "$@"
    [ -d "$ROOT" ] && [ ! -L "$ROOT" ] && [ ! -e "$ROOT/.uninstalling" ] && [ ! -e "$ROOT/.install-owner" ] && [ -f "$ROOT/.topflow-install" ] && [ -x "$ROOT/topflow-screen" ] || { echo 'Installation incomplete, changed or uninstall is active' >&2; exit 8; }
    read_failure
    [ "$failure" != TRANSITION_GUARD_RELEASE_UNCONFIRMED ] && [ "$failure" != FACTORY_RESTORE_UNCONFIRMED ] && [ "$failure" != RENDERER_STILL_ACTIVE ] || { echo TOPFLOW_ERROR=TRANSITION_GUARD_RELEASE_UNCONFIRMED; exit 8; }
    read_renderer
    if own_renderer "$renderer" "$renderer_start"; then echo 'Already running'; exit 0; fi
    renderer_path_present "$renderer" && { echo 'Existing renderer identity changed; refusing concurrent ownership' >&2; exit 8; }
    exec 8>"$RUN/supervisor.lock"
    if ! flock -n 8; then echo 'Supervisor is still active; query status or restore before starting' >&2; exit 7; fi
    recovery_guard_names=
    collect_saved_guards
    for old_guard in $recovery_guard_names; do
        old_guard_state=2
        if guard_io_safe; then old_guard_state=0; guard_observe "$old_guard" || old_guard_state=$?; fi
        if [ "$old_guard_state" != 1 ]; then
            printf 'failure:TRANSITION_GUARD_RELEASE_UNCONFIRMED\n' > "$RUN/last-status"
            echo TOPFLOW_ERROR=TRANSITION_GUARD_RELEASE_UNCONFIRMED; exit 8
        fi
    done
    # Confirm the old lifetime owner has exited before launching a new one.
    rm -f "$RUN/supervisor.pid" "$RUN/renderer.pid"
    flock -u 8
    exec 8>&-
    printf 'starting\n' > "$RUN/last-status"
    nohup sh "$ROOT/supervisor.sh" --confirmed --lifecycle-held >/dev/null 2>&1 </dev/null 6>&- 9>&- &
    child=$!
    child_start=$(proc_start "$child" || true)
    # The control flock stays held until the child has published its identity.
    n=0
    while [ "$n" -lt 5 ]; do
        read_supervisor
        if [ "$supervisor" = "$child" ] && own_supervisor "$supervisor" "$supervisor_start"; then
            echo 'Switch supervisor started; query status to verify the result.'; exit 0
        fi
        same_process "$child" "$child_start" || { startup_failed; }
        sleep 1; n=$((n+1))
    done
    if own_supervisor "$child" "$child_start"; then kill -TERM "$child" 2>/dev/null || true; fi
    echo 'Supervisor startup not confirmed; restore and inspect status' >&2; exit 8
    ;;
 restore|uninstall)
    [ "${2:-}" = '--confirmed' ] || { echo 'Explicit restore confirmation required' >&2; exit 2; }
    if [ "$1" = uninstall ]; then validate_install_tree; fi
    prepare_run
    # A manual recovery wins over this boot's pending handover; future boots
    # remain enabled unless the user disables or uninstalls the feature.
    if [ "$1" = uninstall ]; then autostart_hook_disable; fi
    if [ -e "$ROOT/.autostart-enabled" ] || [ -e "$RUN/autostart.attempt" ] || [ -e "$RUN/autostart.pid" ]; then autostart_cancel_pending; fi
    recovery_guard_names=
    control_guard=
    exec 8>"$RUN/supervisor.lock"
    if ! flock -n 8; then
        read_supervisor
        own_supervisor "$supervisor" "$supervisor_start" || { echo 'Active supervisor identity cannot be verified; no process signalled' >&2; exit 8; }
        recovery_guard_begin
        recovery_guard_names="$recovery_guard_names $(guard_name "$supervisor" "$supervisor_start")"
        kill -TERM "$supervisor" 2>/dev/null || true
        n=0
        until flock -n 8; do
            [ "$n" -lt 20 ] || { echo 'Supervisor cleanup still active; restore not confirmed' >&2; exit 8; }
            sleep 1; n=$((n+1))
        done
    fi
    # Re-read after the lifetime owner has exited: its cleanup can fail only
    # after our cancellation signal and publish retained identities at that time.
    collect_saved_guards
    # Both flocks prevent delayed/new supervisor takeover after restoration.
    # Stop only a verified orphan of our binary; never use killall or vendor stop.
    read_renderer
    if renderer_path_present "$renderer" && ! own_renderer "$renderer" "$renderer_start"; then
        echo 'Renderer identity changed; no process signalled and no competing factory started' >&2; exit 8
    fi
    if own_renderer "$renderer" "$renderer_start"; then
        renderer_guard=$(guard_name "$renderer" "$renderer_start")
        recovery_guard_names="$recovery_guard_names $renderer_guard ${renderer_guard}_idle"
        recovery_guard_begin
        kill -TERM "$renderer" 2>/dev/null || true
        n=0; while own_renderer "$renderer" "$renderer_start" && [ "$n" -lt 6 ]; do sleep 1; n=$((n+1)); done
        if own_renderer "$renderer" "$renderer_start"; then kill -KILL "$renderer" 2>/dev/null || true; fi
        n=0; while own_renderer "$renderer" "$renderer_start" && [ "$n" -lt 2 ]; do sleep 1; n=$((n+1)); done
        own_renderer "$renderer" "$renderer_start" && { echo 'Renderer still alive; refusing concurrent display ownership' >&2; exit 8; }
    fi
    stop_orphan_renderers
    stop_orphan_helpers
    if ! factory_running; then recovery_guard_begin; sleep 2; /etc/init.d/zte_topsw_devui start 7>&- 8>&- 9>&-; fi
    factory_stable || { echo 'Factory PID and service methods not stable; no deletion performed' >&2; exit 5; }
    for released_guard in $recovery_guard_names; do
        guard_release "$released_guard" || { echo 'Owned transition guard release unconfirmed; allow the bounded owned lease to expire (at most 180 seconds)' >&2; exit 5; }
    done
    rm -f "$RUN/renderer.pid" "$RUN/heartbeat" "$RUN/supervisor.pid"
    if [ "$1" = uninstall ]; then uninstall_components; exit 0; fi
    printf 'factory-restored\n' > "$RUN/last-status"
    echo 'Factory process is running; verify screen and touch visually.'
    ;;
 *) echo 'usage: screenctl.sh status | start --confirmed | restore --confirmed | uninstall --confirmed | autostart-enable --confirmed | autostart-disable --confirmed | autostart-run' >&2; exit 2;;
esac
