# Codex-global effort normalization

## Problem

Codex applies `model_reasoning_effort` globally. A route that supports only a nearby level used to
fail the whole request with a non-retryable HTTP 400 (for example the inherited `high` effort on a
Pro route, recorded in `docs/model-family-switch-2026-09-24.md`).

## Policy

- A requested effort that the route supports is used unchanged.
- A known Codex effort level (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`)
  that the route does not support is normalized to the closest supported level, preferring the
  higher level on a tie, and the substitution is logged.
- An unknown effort string is not a Codex level and still fails closed with the existing error.

## Verification

`tests/chatgpt-web-models.test.ts` covers the Sol route: `low → medium`, `max → xhigh`,
`ultra → xhigh`, `xhigh → high` without Extra High, and `invented` still throws. The Zero Risk
route keeps its fixed technical effort.
