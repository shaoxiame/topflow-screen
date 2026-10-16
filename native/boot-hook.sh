#!/bin/sh
# SPDX-License-Identifier: MIT
# Edit only this plugin's one documented UFI boot entry. Never run the boot file.
set -eu
umask 077
ROOT=/data/plugins/topflow-screen
BOOT=/data/plugins/ufi_tools_boot.sh
TF_OWNER=0
LINE='sh /data/plugins/topflow-screen/screenctl.sh autostart-run >/dev/null 2>&1 & # TOPFLOW_SCREEN_AUTOSTART_V1'
CREATED="$ROOT/autostart-boot-created"
WORK="$ROOT/.autostart-hook-work"
LOCK="$ROOT/.autostart-hook.lock"
owned_work=0
fail() { printf 'TOPFLOW_AUTOSTART_HOOK=conflict\n%s\n' "$1" >&2; exit 8; }
safe_path() {
    check_path=$1
    while :; do
        [ ! -L "$check_path" ] || return 1
        [ "$check_path" != / ] || break
        check_path=${check_path%/*}; [ -n "$check_path" ] || check_path=/
    done
}
safe_file() {
    safe_path "$1" && [ -f "$1" ] && [ "$(stat -c %h "$1")" = 1 ] && [ "$(stat -c %u "$1")" = "$TF_OWNER" ]
}
root_guard() {
    safe_path "$ROOT" && [ -d "$ROOT" ] && [ "$(stat -c %u "$ROOT")" = "$TF_OWNER" ] || fail 'Unsafe plugin root'
    [ "$(stat -c '%d:%i' "$ROOT")" = "$root_identity" ] || fail 'Plugin root changed'
}
created_guard() {
    created_identity=
    if [ -e "$CREATED" ] || [ -L "$CREATED" ]; then
        safe_file "$CREATED" && [ "$(wc -c < "$CREATED")" -le 96 ] && [ "$(wc -l < "$CREATED")" -eq 2 ] && [ "$(head -n 1 "$CREATED")" = TOPFLOW_SCREEN_BOOT_CREATED_V1 ] || fail 'Unknown boot ownership receipt'
        created_identity=$(sed -n '2p' "$CREATED")
        printf '%s\n' "$created_identity" | grep -Eq '^[0-9]+:[0-9]+$' || fail 'Unknown boot file identity'
        [ "$(tail -c 1 "$CREATED" | wc -l)" -eq 1 ] || fail 'Incomplete boot ownership receipt'
    fi
}
boot_guard() {
    safe_path "$BOOT" || fail 'Unsafe UFI boot path'
    if [ -e "$BOOT" ]; then
        safe_file "$BOOT" || fail 'Unsafe UFI boot file'
        boot_bytes=$(wc -c < "$BOOT")
        [ "$boot_bytes" -ge 10 ] && [ "$boot_bytes" -le 131072 ] || fail 'Unsupported UFI boot size'
        [ "$(head -n 1 "$BOOT")" = '#!/bin/sh' ] || fail 'Unsupported UFI boot interpreter'
        [ "$(tail -c 1 "$BOOT" | wc -l)" -eq 1 ] || fail 'UFI boot file needs a final line break'
        [ "$(LC_ALL=C tr -d '\000\015' < "$BOOT" | wc -c)" -eq "$boot_bytes" ] || fail 'Unsupported UFI boot text encoding'
        # Similar/modified commands may belong to a different screen installer.
        awk -v line="$LINE" '($0 ~ /TOPFLOW_SCREEN_AUTOSTART/ || $0 ~ /\/data\/plugins\/topflow-screen/) && ($0 != line || NR != 2) {bad=1} END {exit bad}' "$BOOT" || fail 'Unknown TopFlow startup entry or position'
        sh -n "$BOOT" || fail 'UFI boot script is not valid shell'
    fi
}
boot_state() {
    if [ -f "$BOOT" ] && grep -qxF "$LINE" "$BOOT"; then printf 'TOPFLOW_AUTOSTART_HOOK=enabled\n'
    else printf 'TOPFLOW_AUTOSTART_HOOK=disabled\n'; fi
}
work_guard() {
    safe_path "$WORK" && [ -d "$WORK" ] && [ "$(stat -c %u "$WORK")" = "$TF_OWNER" ] || fail 'Unsafe boot transaction directory'
    safe_file "$WORK/owner" && [ "$(wc -c < "$WORK/owner")" -eq 28 ] && [ "$(cat "$WORK/owner")" = TOPFLOW_SCREEN_BOOT_WORK_V1 ] || fail 'Unknown boot transaction owner'
    for entry in "$WORK"/* "$WORK"/.[!.]* "$WORK"/..?*; do
        [ -e "$entry" ] || [ -L "$entry" ] || continue
        case "${entry##*/}" in owner|before|after|created) safe_file "$entry" || fail 'Unsafe boot transaction file';; *) fail 'Unknown boot transaction file';; esac
    done
}
clear_work() {
    [ "$owned_work" = 1 ] || return 0
    work_guard
    rm -f "$WORK/before" "$WORK/after" "$WORK/created" "$WORK/owner"
    rmdir "$WORK"
    owned_work=0
}
cleanup() { clear_work; }
snapshot() {
    boot_guard
    if [ -f "$BOOT" ]; then
        before_state=$(stat -c '%d:%i:%u:%g:%h:%a:%s:%Y:%Z' "$BOOT")
        before_hash=$(sha256sum "$BOOT"); before_hash=${before_hash%% *}
        before_mode=$(stat -c %a "$BOOT")
        before_group=$(stat -c %g "$BOOT")
        cp "$BOOT" "$WORK/before"
        [ "$(sha256sum "$WORK/before" | cut -d ' ' -f 1)" = "$before_hash" ] || fail 'UFI boot changed during snapshot'
    else before_state=absent; before_hash=; before_mode=700; before_group=; printf '#!/bin/sh\n' > "$WORK/before"; fi
}
unchanged() {
    root_guard; boot_guard; created_guard
    if [ "$before_state" = absent ]; then [ ! -e "$BOOT" ] && [ ! -L "$BOOT" ] || fail 'UFI boot was created by another operation'
    else
        [ "$(stat -c '%d:%i:%u:%g:%h:%a:%s:%Y:%Z' "$BOOT")" = "$before_state" ] && [ "$(sha256sum "$BOOT" | cut -d ' ' -f 1)" = "$before_hash" ] || fail 'UFI boot changed; retry after the other plugin finishes'
    fi
}
case "${1:-}" in enable|disable|status) action=$1;; *) fail 'Unknown boot action';; esac
safe_path "$ROOT" && [ -d "$ROOT" ] || fail 'Plugin is absent or unsafe'
root_identity=$(stat -c '%d:%i' "$ROOT")
root_guard; created_guard; boot_guard
if [ "$action" = status ]; then boot_state; exit 0; fi
safe_path "$LOCK" || fail 'Unsafe boot editor lock'
if [ -e "$LOCK" ]; then safe_file "$LOCK" && [ "$(wc -c < "$LOCK")" -eq 0 ] || fail 'Unsafe boot editor lock'; fi
exec 6>>"$LOCK"
flock -n 6 || fail 'Another boot editor is active'
safe_file "$LOCK" && [ "$(stat -c '%d:%i' "$LOCK")" = "$(stat -L -c '%d:%i' /proc/self/fd/6)" ] || fail 'Boot editor lock changed'
root_guard
if [ -e "$WORK" ] || [ -L "$WORK" ]; then work_guard; owned_work=1; clear_work; fi
mkdir "$WORK"
printf 'TOPFLOW_SCREEN_BOOT_WORK_V1\n' > "$WORK/owner"
owned_work=1
trap cleanup EXIT
trap 'exit 8' HUP INT TERM
snapshot
# Insert immediately after the shebang: it remains a top-level command even if
# another plugin has functions, an early exit, or an exec later in the script.
awk -v line="$LINE" -v add="$action" 'NR==1 {print; if(add=="enable")print line; next} $0 != line {print}' "$WORK/before" > "$WORK/after"
sh -n "$WORK/after" || fail 'Generated boot entry failed syntax validation'
if [ "$action" = enable ] && [ "$before_state" = absent ]; then
    printf 'TOPFLOW_SCREEN_BOOT_CREATED_V1\n%s\n' "$(stat -c '%d:%i' "$WORK/after")" > "$WORK/created"
    unchanged
    # Bind to the staged inode before the first shared-file commit. If another
    # plugin creates its own boot script before our commit, this receipt cannot
    # claim that different file, even if it contains only the same shebang.
    mv "$WORK/created" "$CREATED"
fi
if [ "$action" = disable ] && [ -f "$CREATED" ] && { [ "$before_state" = absent ] || [ "$(stat -c '%d:%i' "$BOOT")" = "$created_identity" ]; } && [ "$(wc -c < "$WORK/after")" -eq 10 ] && [ "$(cat "$WORK/after")" = '#!/bin/sh' ]; then
    unchanged
    [ "$before_state" = absent ] || rm -f "$BOOT"
    rm -f "$CREATED"
elif cmp -s "$WORK/before" "$WORK/after"; then
    unchanged
else
    chmod "$before_mode" "$WORK/after"
    [ -z "$before_group" ] || chgrp "$before_group" "$WORK/after"
    unchanged
    mv -f "$WORK/after" "$BOOT"
    boot_guard
fi
if [ "$action" = disable ] && [ -f "$CREATED" ]; then rm -f "$CREATED"; fi
clear_work
boot_state
