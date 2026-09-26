# Mutable paired-renderer text recovery

> Superseded for normal paired turns by `docs/paired-provisional-streaming-2026-09-25.md`:
> append-only provisional deltas now stream live and the confirmed final Markdown is committed
> through `text_reset`. Compaction and Luna rolling checkpoints keep this buffered behavior.

## Observed failure

At 2026-09-25 00:23:37 UTC, trace `4fdf27ddf09e` committed the browser completion
fence at revision 78, then failed with `browser_stream_inconsistent`. The
diagnostic reported `text_changed`, 33 committed characters versus 235 observed
characters. The stream had already accepted submission and executed tool calls.
This was not a launcher process crash. Privacy-safe diagnostics do not retain the
conflicting paragraph contents, so the exact text-level rewrite is not known.

The paired renderer lacks immutable per-block source identities. Its Markdown
segments fall back to positional keys, which can be reused after paragraph
replacement, rearrangement or rehydration across tool phases. A following block
and 750 ms without changes do not prove those segments are append-only.

## Fix

Paired-renderer snapshots now mark answer segments non-streamable until the
existing completion tracker and broker completion fence permit `finish()`. Each
observation can replace mutable pending content, and only the confirmed final
Markdown is delivered. This avoids committing an intermediate positional block
that cannot later be retracted from a Responses stream.

Legacy source-block streaming and the committed-text integrity check remain
unchanged. Tool calls/results continue while answer text is buffered. This
deliberately trades early answer-text deltas for reliable final delivery on the
new renderer; it does not increase model-generation time or replay tool calls.

## Evidence

- Added a production DOM-callback regression covering long-stable intermediate
  paragraphs, rewritten paragraphs, replacement by headings/lists, no premature
  deltas, no stale/user text leakage, and exact final Markdown.
- Added a legacy regression proving incremental delivery still works and genuine
  rewrites of committed content still fail the integrity guard.
- 149 tests passed across response DOM, Markdown buffering and worker contracts.
- Root/launcher typechecks and native AppImage build passed.
- Verified zero active turns before the local restart; installed atomically,
  preserving `Codex Web GPT.before-mutable-markdown-fix-20260924.AppImage`.
- Installed Codex CLI end-to-end smoke used `chatgpt-web/gpt-6-pro` in a read-only
  sandbox, thread `01a0d5f6-246e-7413-8c0e-0b9ab734bd3d`. Two separate Python
  arithmetic commands returned 42 with exit code 0. The final title, paragraph
  and two-item list arrived followed by `turn.completed`; CLI exit code was 0.
- The user's original task was not replayed. Its exact long-running workload
  was not repeated; coverage combines the observed failure shape, deterministic
  rewrite regression and a real multi-tool completion.
