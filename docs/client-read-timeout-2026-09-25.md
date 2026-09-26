# Client read timeout for abandoned turns

## Problem

Bun does not reliably surface a dropped HTTP response consumer. When a Codex client died
mid-turn (observed live: the CLI was killed while a browser turn waited on a slow xhigh response),
`controller.enqueue` kept buffering heartbeats instead of failing, so the browser turn stayed
leased until ChatGPT responded or errored. With several concurrent turns that can exhaust the
five-tab ceiling, and it was only released by an explicit `/admin/cancel-turn`.

## Change

The SSE bridge now tracks sustained consumer backpressure. While `controller.desiredSize <= 0`,
the heartbeat tick records the first observation; once the client has not read for
`clientReadTimeoutMs` (default 30 s), the bridge logs `client_read_timeout` and runs the same
cancellation path as a dropped connection (`onCancel` → adapter abort → browser turn cancelled and
tab released). A live reader resets the timer on the next tick, so slow-but-reading clients are
unaffected.

## Verification

- `tests/bridge-stall-timeout.test.ts`: a never-read stream is cancelled by the budget; a
  continuously-read stream still reaches `response.completed`.
- The `clientReadTimeoutMs` option is a test seam; production uses the 30 s default.
