#!/bin/sh
set -eu

SERVICE_CHILD=false
if [ "${1:-}" = "--service-child" ]; then
  SERVICE_CHILD=true
  shift
fi

if [ "$#" -lt 1 ]; then
  echo "Codex Web GPT AppImage runner requires an AppImage path" >&2
  exit 64
fi
APPIMAGE_PATH="$1"
shift
case "$APPIMAGE_PATH" in
  /*) ;;
  *) echo "Codex Web GPT AppImage path must be absolute" >&2; exit 64 ;;
esac
if [ ! -f "$APPIMAGE_PATH" ] || [ ! -x "$APPIMAGE_PATH" ]; then
  echo "Codex Web GPT AppImage is unavailable: $APPIMAGE_PATH" >&2
  exit 66
fi

# A detached process still belongs to its parent's systemd cgroup. In particular,
# a short-lived updater can kill the FUSE mount and Chromium children on exit,
# even after Electron has moved its main process to an application scope.
# Transfer the entire launch to a service before starting any AppImage children.
if [ "$SERVICE_CHILD" = false ] && [ -n "${CODEX_WEB_GPT_LAUNCHER_EXECUTABLE:-}" ] \
  && command -v systemd-run >/dev/null 2>&1 \
  && command -v systemctl >/dev/null 2>&1 \
  && systemctl --user show-environment >/dev/null 2>&1; then
  launch_service() {
    set -- "$0" --service-child "$APPIMAGE_PATH" "$@"
    # Inherit only launch-related overrides; values stay in the environment,
    # rather than appearing in the systemd-run command line or diagnostic log.
    for name in HOME PATH DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_RUNTIME_DIR \
      DBUS_SESSION_BUS_ADDRESS LANG LC_ALL TMPDIR APPIMAGE_EXTRACT_AND_RUN \
      CODEX_WEB_GPT_LAUNCHER_EXECUTABLE CODEX_WEB_GPT_APPIMAGE \
      CODEX_WEB_GPT_LAUNCHER_DATA_DIR CODEX_WEB_GPT_DEV_HOME \
      CODEX_CHATGPT_WEB_HOME CODEX_HOME; do
      if printenv "$name" >/dev/null 2>&1; then
        set -- "--setenv=$name" "$@"
      fi
    done
    exec systemd-run --user --quiet --collect --service-type=exec \
      --expand-environment=no --unit="codex-web-gpt-$$" \
      --property=Restart=on-failure --property=RestartSec=3s \
      --property=KillMode=mixed --property=TimeoutStopSec=120s \
      --property=StartLimitIntervalSec=60s --property=StartLimitBurst=3 \
      "$@"
  }
  launch_service "$@"
fi

fuse_ready() {
  [ "${APPIMAGE_EXTRACT_AND_RUN:-0}" != "1" ] || return 1
  [ -c /dev/fuse ] && [ -r /dev/fuse ] && [ -w /dev/fuse ] || return 1
  command -v fusermount3 >/dev/null 2>&1 || command -v fusermount >/dev/null 2>&1 || return 1
  if command -v ldconfig >/dev/null 2>&1; then
    ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2' || return 1
  elif [ ! -f /lib/libfuse.so.2 ] && [ ! -f /usr/lib/libfuse.so.2 ] \
    && [ ! -f /lib64/libfuse.so.2 ] && [ ! -f /usr/lib64/libfuse.so.2 ]; then
    return 1
  fi
  return 0
}

if fuse_ready; then
  exec "$APPIMAGE_PATH" "$@"
fi

RUNTIME_PARENT="${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}"
case "$RUNTIME_PARENT" in
  /*) ;;
  *) echo "AppImage fallback runtime directory must be absolute" >&2; exit 65 ;;
esac
FALLBACK_ROOT="$RUNTIME_PARENT/codex-web-gpt-appimage-$(id -u)"
umask 077
if [ -L "$FALLBACK_ROOT" ]; then
  echo "AppImage fallback root must not be a symbolic link" >&2
  exit 65
fi
mkdir -p "$FALLBACK_ROOT"
if [ ! -d "$FALLBACK_ROOT" ] || [ "$(stat -c '%u' "$FALLBACK_ROOT")" != "$(id -u)" ]; then
  echo "AppImage fallback root is not owned by the current user" >&2
  exit 65
fi
chmod 0700 "$FALLBACK_ROOT"

for stale in "$FALLBACK_ROOT"/run.*; do
  [ -d "$stale" ] && [ ! -L "$stale" ] || continue
  owner_pid="$(awk 'NR == 1 { print $1 }' "$stale/owner.pid" 2>/dev/null || true)"
  owner_start="$(awk 'NR == 1 { print $2 }' "$stale/owner.pid" 2>/dev/null || true)"
  case "$owner_pid:$owner_start" in
    *[!0-9:]*|:|*:|:*) active=false ;;
    *)
      current_start="$(sed 's/^[^)]*) //' "/proc/$owner_pid/stat" 2>/dev/null \
        | awk 'NR == 1 { print $20 }' || true)"
      if kill -0 "$owner_pid" 2>/dev/null && [ "$current_start" = "$owner_start" ]; then
        active=true
      else
        active=false
      fi
      ;;
  esac
  if [ "$active" = false ]; then
    case "$stale" in
      "$FALLBACK_ROOT"/run.*) rm -rf -- "$stale" ;;
    esac
  fi
done

RUN_DIR="$(mktemp -d "$FALLBACK_ROOT/run.XXXXXX")"
cleanup() {
  case "$RUN_DIR" in
    "$FALLBACK_ROOT"/run.*) rm -rf -- "$RUN_DIR" ;;
  esac
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
OWNER_START="$(sed 's/^[^)]*) //' "/proc/$$/stat" 2>/dev/null | awk 'NR == 1 { print $20 }' || true)"
case "$OWNER_START" in
  ''|*[!0-9]*) echo "Could not establish AppImage fallback process identity" >&2; exit 70 ;;
esac
printf '%s %s\n' "$$" "$OWNER_START" > "$RUN_DIR/owner.pid"

mkdir "$RUN_DIR/unpack"
(
  cd "$RUN_DIR/unpack"
  "$APPIMAGE_PATH" --appimage-extract >/dev/null
)
APP_DIR="$RUN_DIR/unpack/squashfs-root"
if [ ! -x "$APP_DIR/AppRun" ]; then
  echo "Codex Web GPT AppImage fallback extraction produced no executable AppRun" >&2
  exit 70
fi

unset APPIMAGE_EXTRACT_AND_RUN
set +e
APPIMAGE="$APPIMAGE_PATH" APPDIR="$APP_DIR" "$APP_DIR/AppRun" "$@"
STATUS="$?"
set -e
trap - EXIT HUP INT TERM
cleanup
exit "$STATUS"
