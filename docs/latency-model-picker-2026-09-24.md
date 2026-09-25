# Latency and misleading model-capacity diagnosis

## Evidence

The user reported high latency and `Selected model is at capacity` on 2026-09-24.
The corresponding browser trace `ee033fadb47d` did not submit a message:

- browser page: 95 ms;
- new-chat preparation: 2,618 ms;
- effort selection: failed after 70,022 ms;
- terminal submission state: `prepared`, not `accepted`;
- captured UI: composer present, no recognized effort controls.

Local `/healthz` completed in 0.354 ms. The machine had about 52 GiB of available
RAM; sampled CPU idle was 87–94%, with effectively no ongoing swap or I/O wait.
These idle-time observations do not establish resource usage during every past turn.

## Cause and fix

The current ChatGPT UI uses `data-composer-navigation-target="reasoning"` on its
model trigger and `data-model-picker-power-slider` on its effort slider. The old
selectors recognized neither. The new slider uses an enabled ARIA root and plain
selected ticks, instead of the legacy explicit `data-locked` on every tick.

The shared selectors now support both schemas. New-schema availability requires
an explicitly enabled root and the exact ARIA-range tick count, preserves explicit
locks, and rejects invalid lock values. Legacy lock validation remains strict.

The initial missing-control path threw a plain Error containing `unavailable`.
The generic adapter classifier inferred HTTP 503 and `server_is_overloaded`,
which Codex displayed as model capacity. It now emits the existing typed 502
UI error with retry disabled, preserving the real failure across helper transport.

## Verification

- A real fresh, background launcher tab successfully selected and verified
  family 6 / Pro in 1,804 ms; preparation was 2,614 ms. No model prompt was sent.
- Browser/session/model-selection tests: 156 passed. The final session-test
  typing-only correction was rechecked separately: 19 passed.
- Harness/session tests previously passed (104), including typed error handling.
- Root and launcher typechecking and native AppImage packaging passed.
- Installed the rebuilt AppImage atomically after checking there were no active
  turns; retained `Codex Web GPT.before-picker-latency-fix-20260924.AppImage`.
- Restarted hidden; installed runtime doctor returned `ok: true`.

## Other latency in the historical sample

Successful inline turns took approximately 3.7–10.1 seconds before send. Median
stage durations: page acquisition 152 ms, new-chat preparation 2,248 ms, model
selection 2,980 ms, prompt attachment 2,486 ms, send 966 ms. Stage populations
differ, so these medians must not be summed as a measured end-to-end median.

One Bigger Context / multipart-2 turn waited 175,440 ms for the first-part
acknowledgement and took 191.32 seconds before the final-part send. This is one
observation, not a typical latency claim. Bigger Context remains enabled as
requested by the existing configuration. Post-send durations also include model
reasoning and tool execution; they are not isolated server inference timings.
