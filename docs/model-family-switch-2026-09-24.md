# Model-family switching and Sol hydration

## Diagnosis

Trace `36afb3c4e90c` failed selecting 5.6 before submission. The installed picker
had zero legacy `[role="menuitem"][aria-expanded][aria-hidden="false"]` controls,
but one `data-model-picker-view-toggle="true"` control. The current picker exposes
`data-model-picker-view="simple"` / `"advanced"` instead of `aria-expanded`.
The language advice in the generic error did not describe this failure.

## Changes

- Open the model list through its explicit simple/advanced state when present;
  keep the legacy expanded-control path for older pickers.
- Do not collapse an already-open advanced list. Reject ambiguous controls,
  unknown states and clicks that fail to select the requested radio row.
- Continue proving both the selected family and effort; never silently retain
  another model or downgrade the requested one.
- Replace speculative language-changing advice with a neutral availability check.
- Sol smoke testing exposed a separate hydration transition: a UUID turn key
  temporarily becomes `fallback-turn-0`, then returns to the same UUID. Ignore
  these display-index placeholders rather than rebinding response ownership to
  them and later misreporting restoration as a second user submission.

## Verification and local deployment

- Real Portuguese picker: 6 → 5.6 → 6 → 5.6, with semantic Pro/family confirmation
  after every transition; approximately 1.5–1.8 seconds each.
- 167 regression tests passed across model switching, session controls and worker
  contracts. Root/launcher typechecks and native AppImage build passed.
- First installed Pro smoke inherited an incompatible global `high` effort and
  correctly failed request validation. Retested with the route's supported `max`:
  native Codex thread `01a0d607-634e-7152-94b6-b6bcdaa3c241` delivered `OK_56_PRO`
  and `turn.completed`.
- The first Sol/high smoke exposed the transient-key bug. After the hydration
  fix, source browser smoke and installed native Codex both completed. Final
  installed Sol/high thread `01a0d60b-2f7f-7403-8182-174d9346ab26` delivered
  `OK_56_SOL` followed by `turn.completed`, exit code 0.
- Installed atomically, restarted hidden only after verifying no active turns;
  retained `Codex Web GPT.before-model-switch-fix-20260924.AppImage` for rollback.
- Test-only effort overrides did not alter the user's persistent Codex settings.
  Native smoke requests prohibited tools and file access; no project task was replayed.
