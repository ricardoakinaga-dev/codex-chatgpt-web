# Non-activating background launcher

## Behavior

- Embedded browser show, home activation and tab selection transfer keyboard
  focus only when the launcher window already owns desktop focus.
- A second `--hidden` invocation does not activate the existing window. Explicit
  desktop/tray opens still use the foreground activation path.
- Restoring saved maximized/fullscreen state waits for the first actual show,
  rather than implicitly making a hidden startup visible.
- Existing explicit interaction in manual/Zero Risk mode remains unchanged.

## Local deployment and evidence (2026-09-24)

- Persisted `showBrowserDuringTurns=false` and `keepRunningOnClose=true` through
  the running application's preference API.
- Launcher suite: 341 tests passed; launcher typecheck and AppImage build passed.
- Installed the rebuilt AppImage atomically with a backup named
  `Codex Web GPT.before-background-fix-20260924.AppImage` beside the installed binary.
- Restarted with `--hidden`, then invoked the wrapper with `--hidden` again.
  X11 `_NET_ACTIVE_WINDOW` was unchanged after both operations.
- Exercised real authenticated turn-start/end control requests with automatic
  reveal disabled and enabled, plus embedded home selection. Desktop focus
  remained unchanged. Temporary test tabs were released and the user's
  background preference restored. No prompt was submitted to a model.
- Installed runtime doctor returned `ok: true`, including authenticated embedded
  browser, healthy proxy and ready tunnel.
- Foreground opening and foreground tab focus are covered by regression tests.
  Native focus observation was on Linux/X11; other desktops were not exercised.
