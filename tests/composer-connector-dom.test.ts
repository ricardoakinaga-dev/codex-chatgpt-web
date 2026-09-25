import { expect, test } from "bun:test";
import { ChatGptBrowserWorker } from "../src/adapters/chatgpt-web/browser-worker";
const { createDocument } = require("@mixmark-io/domino") as { createDocument(html: string): Document };

function fixture(html: string) {
  const document = createDocument(`<div id="editor">${html}</div>`);
  const editor = document.getElementById("editor")!;
  const composer = {
    locator: (selector: string) => ({ filter: () => ({
      evaluateAll: async (read: (elements: Element[]) => unknown) => read(Array.from(editor.querySelectorAll(selector))),
    }) }),
    evaluate: async (read: (element: Element) => unknown) => read(editor),
  };
  const worker = Object.assign(Object.create(ChatGptBrowserWorker.prototype), {
    config: { appName: "Codex Native2" }, activeComposer: async () => composer,
  });
  return { worker, composer };
}

test("connector identity supports both editors without treating plain text or another app as selected", async () => {
  for (const [html, selected] of [
    ['<span data-id="plugin:123" data-keyword="Codex Native2">Codex Native2</span>', true],
    ['<span app-mention-path="app://123" app-mention-display-name="Codex Native2" contenteditable="false">Codex Native2</span>', true],
    ['<span app-mention-path="app://123" app-mention-display-name="Other" contenteditable="false">Codex Native2</span>', false],
    ['<span app-mention-path="https://example.com" app-mention-display-name="Codex Native2" contenteditable="false">Codex Native2</span>', false],
    ['<span app-mention-path="app://123" app-mention-display-name="Codex Native2" contenteditable="true">Codex Native2</span>', false],
    ['<p>Codex Native2</p>', false],
  ] as const) {
    const { worker, composer } = fixture(html);
    expect(await worker.connectorIsSelected(composer)).toBe(selected);
  }
});

test("duplicate selected connector identities across schemas fail closed", async () => {
  const { worker, composer } = fixture('<span data-id="plugin:1" data-keyword="Codex Native2"></span><span app-mention-path="app://2" app-mention-display-name="Codex Native2" contenteditable="false"></span>');
  await expect(worker.connectorIsSelected(composer)).rejects.toThrow("duplicate");
});

test("prompt integrity removes a ProseMirror connector pill but preserves the actual multiline draft", async () => {
  const { worker } = fixture('<p><span app-mention-path="app://123" app-mention-display-name="Codex Native2" contenteditable="false"><span>Codex Native2</span></span> First line</p><p>Codex Native2 in the actual prompt</p>');
  expect(await worker.attachedPromptText({})).toBe("First line\nCodex Native2 in the actual prompt");
});
