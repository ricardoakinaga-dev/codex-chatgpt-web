# Linux launcher recovery — 2026-09-24

## Observed incident

- At 20:00:18 -03 the installed 6.0.0 Electron launcher (PID 366055)
  terminated with SIGTRAP. The core was truncated, so it does not establish
  the exact native assertion.
- A temporary restart service had spawned the AppImage with a detached Python
  `Popen` and then exited after checking only `/healthz`. Its exit coincided
  with the crash. The daemon survived, leaving a false-positive health signal.
- Detachment does not escape a systemd cgroup. Electron moves its main process
  into an application scope, while the AppImage mount and Chromium children
  remain in the launching service. Ending that service can kill those children.

## Changes

- The installed Linux runner submits installed-wrapper launches to a separate
  transient user service before starting the AppImage. A private child argument
  avoids recursive submission without leaking a bypass flag to future updates.
- Literal arguments and launch environment overrides are preserved. Failed
  submission is reported instead of falling back into the terminating parent.
- Native failures get bounded automatic restarts; normal exits do not restart.
  Mixed kill mode lets the main process perform its graceful shutdown first.
- Functional verification exposed a second failure: the current ChatGPT
  ProseMirror textbox has `data-composer-markdown` and no old composer ID or
  Lexical attribute. The shared selector now recognizes that explicit textbox
  without matching unrelated editors or read-only markdown.

## Verification and deployment

- Launcher suite: 338 passed. After the final service shutdown-option change,
  the launcher service/packaging regression subset passed again (15 tests).
- Browser/session/model-selection regression: 154 passed.
- Root and launcher TypeScript checks and native AppImage packaging succeeded.
- Live DOM check: exactly one visible, editable composer matched the new selector.
- Installed the rebuilt AppImage atomically, preserving the previous binary at
  `~/.local/lib/codex-web-gpt/6.0.0/Codex Web GPT.pre-launcher-fix-20260924.AppImage`.
- Started the installed wrapper from a real short-lived systemd oneshot service.
  The parent exited successfully in 23 ms; the separate launcher service and
  its browser/runtime remained alive. This exercises the failing ownership boundary.
- Installed CLI `doctor --json` returned `ok: true`: embedded browser authenticated
  and reachable, Codex route installed, proxy healthy, tunnel healthy and ready.
  Its standard connector warning remains: this diagnostic does not prove a
  ChatGPT connector attachment or a complete model/tool turn.
- Self-review checked recursion, argument quoting, bounded retries, clean-exit
  behavior, graceful stop, fallback extraction cleanup and source/installed runner
  equality. Existing browser-worker/model-selection edits were preserved.

## Operational notes

The active service name is `codex-web-gpt-<launch-pid>.service`; discover it with
`systemctl --user list-units 'codex-web-gpt-*'` and inspect its journal for native
stderr. Check both the launcher/browser and daemon, never `/healthz` alone.
These are local fixes in source and in the installed artifact; an upstream
replacement without these patches can overwrite them. No end-to-end model
generation or destructive crash injection was performed during recovery.
