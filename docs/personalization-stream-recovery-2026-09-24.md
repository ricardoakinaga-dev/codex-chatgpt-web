# Personalization and current ChatGPT renderer recovery

## Incident

Trace `221b2c4d6d34` successfully selected the model in 1,630 ms, then failed
prompt attachment after 30,019 ms with the personalization readiness deadline.
The current Portuguese UI displayed `Personalizado`; the named preflight only
recognized English and Chinese. Its fallback could not recognize the new mention
menu, then waited for a legacy structural personalization control.

## Changes

- Recognize the observed exact Portuguese `Personalizado` / `Não personalizado`
  labels in the existing named personalization path, including owned-menu choices.
- Support the new `data-list-navigation-item` mention rows and their `aria-current`
  keyboard ownership. Retain exact connector identity checks before activation.
- Recognize noneditable `app://` connector mentions by exact display name, preserve
  duplicate rejection, and exclude their label from prompt-integrity text.
- Support the semantic submit button inside the active composer's form and the
  observed stop controls in that form.
- Support persistent `data-turn-key` user/assistant pairs in submission tracking.
  Baselines retain both role identities even when inner history is virtualized.
  Bind the persistent response container while Pro is still thinking rather than
  waiting for its final answer heading. Legacy identity handling is retained.
- Parse only explicitly assistant-owned Markdown in paired containers. User
  content is neither an answer nor a stopped-thinking signal. Require an external
  completion action after the final answer, not a copy button inside code content.

## Executed verification

- Personalization/connector preparation on a fresh real background tab: the
  Portuguese state was recognized in about 14 ms and full connector+text
  attachment completed in about 0.75 seconds, without increasing timeouts.
- Full browser tests revealed and fixed the subsequent send and response-reader
  incompatibilities; merely fixing preflight was not considered completion.
- Focused regression suite: 184 passed across browser-worker contracts, response
  DOM, personalization preflight, connector DOM and session controls.
- Root and launcher typechecks and native AppImage build passed.
- Installed the rebuilt AppImage atomically and restarted hidden while idle.
  Pre-change backup: `Codex Web GPT.before-personalization-fix-20260924.AppImage`.
- Actual installed Codex CLI smoke, read-only sandbox, model
  `chatgpt-web/gpt-6-pro`, requested only `OK` and prohibited tools/file access:
  thread `01a0d5df-c628-7873-b46b-706652fcbb19` returned `agent_message: OK`
  followed by `turn.completed`, with exit code 0 and no stream reconnect loop.
  The initial unsupported WebSocket transport fell back to the working HTTP
  stream; it was not the personalization failure.
- Installed CLI doctor returned `ok: true`. Installed/built CLI SHA-256 matched.

## Scope and limitations

The successful smoke covers prompt preparation, connector attachment, actual
model submission, answer parsing and terminal streaming completion. It does not
exercise image uploads, all locales, multi-tool workflows or long compactions.
Compatibility with the observed DOM schemas is tested; future ChatGPT markup
changes can still require updates. Existing local browser/model edits were kept.
