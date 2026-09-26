# Paired provisional streaming

## Evidence

Two measurements made the previous buffering decision revisable:

1. The shadow audit (`docs/paired-range-audit-2026-09-25.md`) reported
   `paired:true, rangedBlockObservations:0` for real turns on the affected account: the paired
   renderer exposes no immutable `data-start`/`data-end` ranges, so range-based streaming is
   impossible.
2. A controlled Codex experiment (local mock SSE provider, `codex exec`, CLI 0.156.1) proved that
   `response.output_text.done` is authoritative: a provisional
   `response.output_text.delta` ("PROVISIONAL_DELTA") was replaced by the `.done` text
   ("FINAL_AUTHORITATIVE") in the final message, with exit code 0. Deltas are UI-only; they never
   have to be retracted.

## Change

- `AdapterEvent` gains `text_reset`: an authoritative replacement for the open assistant text.
  The bridge applies it to the open message without emitting a delta, so the item's `.done`
  payload carries the confirmed Markdown.
- `ChatGptMarkdownBuffer` gains a provisional mode for paired blocks. It emits only the longest
  observed extension of an already-emitted block, so Codex never receives text that must be
  retracted. A rewrite or reorder holds all further emission; `finish()` still returns the
  complete authoritative Markdown (delta `""`).
- `responseDomSnapshot` marks paired answer blocks `provisional` when the caller enables it
  (normal turns only; compaction and Luna rolling checkpoints keep buffered behavior).
- The browser helper forwards `text_reset` over its protocol and advertises the `text-reset`
  feature. The daemon-side feed replaces its accumulated text and emits one `text_reset` before
  completion.
- One redundant fixed settle after the effort-slider step loop was removed: the loop already
  reads matching ARIA values after each key press, and persistence is still proven by the menu
  reopen that also validates the model family.

## Verification

- `tests/paired-provisional-streaming.test.ts`: append-only extensions, rewrite hold, multi-block
  separation, authoritative finish, streamed and non-streaming `text_reset`, feed reset.
- `tests/browser-response-dom.test.ts`: paired blocks become provisional only when enabled;
  legacy blocks keep streaming; default paired behavior is unchanged.
- Full suite: 839 tests, 0 failures; root and launcher typechecks pass.
- Live probes against the real launcher browser host (2 turns):
  events now include `text_delta` during generation followed by `text_reset` and `done`;
  TTFT for answer text was ~11.8–14.6 s instead of the full generation; the reset carried the
  formatted Markdown (`- Coffee ...`), and the adapter's internal answer-equality check passed.
  `effort_selection` dropped from 2133 ms to 1873 ms after the settle removal.

## Limitations

- The live view may briefly show text that the final answer does not keep; the completion reset
  corrects the transcript, and a rewrite simply stops live emission for the rest of the turn.
- Provisional mode is off for compaction turns and Luna rolling checkpoints.
- The helper and daemon must come from the same runtime bundle: an older daemon rejects the new
  event. Installed runtimes materialize both together.
