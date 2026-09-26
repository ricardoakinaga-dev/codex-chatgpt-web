# Paired-renderer source-range audit

## Context

Since `6432fa8` the paired ChatGPT renderer (`data-turn-key`) buffers all answer text until the
completion fence. That keeps turns reliable — Responses deltas cannot be retracted after Codex
receives them — but it makes time-to-first-answer-token equal to the whole generation.

Restoring incremental streaming needs one fact this repository cannot observe offline: whether the
paired renderer exposes immutable per-block source ranges (`data-start`/`data-end`) and whether a
block that survives the existing 750 ms stability + following-block rule is ever rewritten later.

## Change

- `ChatGptResponseDomSnapshot` now carries `pairedTurn` so callers can distinguish renderers.
- `ChatGptPairedRangeAudit` (shadow observer) applies the exact `ChatGptMarkdownBuffer` commit rule
  to ranged blocks only, converts no HTML, and emits nothing.
- One privacy-safe line is logged at completion of every turn:

  ```text
  [chatgpt-web] renderer_audit {"paired":true,"segments":5,"rangedBlockObservations":42,"commitsPredicted":7,"rewritesAfterPredictedCommit":0,"orderViolations":0}
  ```

No answer-text streaming behavior changed. `streamable` still excludes every paired block.

## How to read the audit

Run a few real tasks on the affected account, then inspect the launcher/daemon log:

| Observation | Meaning | Next action |
| --- | --- | --- |
| `paired:false` | Legacy renderer: it already streams completed blocks | Nothing to do for this account |
| `paired:true`, `rangedBlockObservations:0` | The paired renderer exposes no source ranges | Range-based streaming is impossible; the provisional/reset design is implemented instead (`docs/paired-provisional-streaming-2026-09-25.md`) |
| `paired:true`, `commitsPredicted > 0`, `rewritesAfterPredictedCommit == 0` across several turns | Ranged blocks are stable and append-only in practice | Enable ranged streaming for paired blocks (`streamable &&= sourceStart !== undefined`) behind a live smoke |
| `paired:true`, `rewritesAfterPredictedCommit > 0` | A predicted commit was rewritten; streaming would have failed the turn | Keep buffering; pursue a provisional-delta + authoritative-done contract with Codex |

`orderViolations` is diagnostic only: non-monotonic source ranges would also reject a ranged
commit in the real buffer.

## Verification

- `tests/paired-range-audit.test.ts`: commit prediction requires a following block plus the
  stability window; rewrites after a predicted commit are counted; the active tail block is never
  predicted; unranged blocks are ignored; non-monotonic ranges are flagged.
- `tests/browser-response-dom.test.ts`: the production page callback reports `pairedTurn` true for
  `data-turn-key` answers and false for the legacy renderer; paired buffering behavior is unchanged.

## Deliberately not changed

- No paired block is marked streamable. Enabling it without live evidence would reintroduce the
  `browser_stream_inconsistent` failures the buffering fix removed.
- The fixed 250 ms UI settles and the duplicate effort-menu verification were left intact: each is
  cheap to remove but can only be proven safe against the live ChatGPT UI, not against the
  Domino-based contract tests.
