import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import type { Locator } from "playwright-core";
import { ChatGptBrowserWorker, ChatGptCompletionTracker, CHATGPT_COMPLETION_SETTLE_MS } from "../src/adapters/chatgpt-web/browser-worker";
import { ChatGptMarkdownBuffer, type ChatGptMarkdownSegment } from "../src/adapters/chatgpt-web/markdown";

const smokeHtml = readFileSync(new URL("./fixtures/chatgpt-dil-smoke.html", import.meta.url), "utf8");
type Snapshot = {
  responsePresent: boolean;
  visibleText: string;
  fullHtml: string;
  markdownSegments: ChatGptMarkdownSegment[];
  completionActionVisible: boolean;
  stoppedThinkingVisible: boolean;
  traceBlocks: { kind: string; text: string }[];
};

// Execute the production page callback, with only missing Domino browser APIs supplied.
async function snapshot(html: string): Promise<Snapshot> {
  const { createWindow } = require("@mixmark-io/domino");
  const window = createWindow(html);
  const innerText = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "innerText");
  const append = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "append");
  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    configurable: true, get() { return this.textContent; },
  });
  Object.defineProperty(window.HTMLElement.prototype, "append", {
    configurable: true, value(this: HTMLElement, ...nodes: Node[]) { nodes.forEach(node => this.appendChild(node)); },
  });
  const collections = [window.document.querySelectorAll("div"), window.document.body.children].map(Object.getPrototypeOf);
  const iterators = collections.map(prototype => Object.getOwnPropertyDescriptor(prototype, Symbol.iterator));
  for (const prototype of collections) Object.defineProperty(prototype, Symbol.iterator, {
    configurable: true, value: Array.prototype[Symbol.iterator],
  });
  try {
    const context = createContext({
      document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
      Node: window.Node, NodeFilter: window.NodeFilter, performance: { timeOrigin: 1 },
      getComputedStyle: (element: HTMLElement) => ({
        display: element.style.display || "block", visibility: "visible", opacity: "1",
      }),
      MutationObserver: class { observe() {} },
    });
    const errors: unknown[] = [];
    const locator = {
      evaluate: async (callback: Function, options: unknown) => {
        try { return runInContext(`(${callback.toString()})`, context)(window.document.getElementById("turn"), options); }
        catch (error) { errors.push(error); throw error; }
      },
      page: () => ({ isClosed: () => false }),
    } as unknown as Locator;
    const worker = Object.create(ChatGptBrowserWorker.prototype) as {
      responseDomSnapshot(locator: Locator): Promise<Snapshot>;
    };
    const result = await worker.responseDomSnapshot(locator);
    expect(errors).toEqual([]);
    return result;
  } finally {
    collections.forEach((prototype, index) => {
      if (iterators[index]) Object.defineProperty(prototype, Symbol.iterator, iterators[index]!);
      else delete prototype[Symbol.iterator];
    });
    if (innerText) Object.defineProperty(window.HTMLElement.prototype, "innerText", innerText);
    else delete window.HTMLElement.prototype.innerText;
    if (append) Object.defineProperty(window.HTMLElement.prototype, "append", append);
    else delete window.HTMLElement.prototype.append;
  }
}

test("keeps an unfinished hyperlink buffered and detects changed destinations after delivery", async () => {
  const page = (href: string) => `<section id="turn"><div class="markdown"><p data-start="0" data-end="99"><strong><a${href}>Open report</a></strong>.</p><p data-start="100" data-end="115">Next paragraph.</p></div></section>`;
  const buffer = new ChatGptMarkdownBuffer(markdown => markdown, 0);
  const pending = await snapshot(page(""));
  expect(buffer.observe(pending.markdownSegments, 0)).toBe("");
  const linked = await snapshot(page(' href="https://example.com/report#details"'));
  expect(buffer.observe(linked.markdownSegments, 1000)).toBe("**[Open report](https://example.com/report#details)**.");
  expect(buffer.finish().markdown).toBe("**[Open report](https://example.com/report#details)**.\n\nNext paragraph.");
  const changed = await snapshot(page(' href="https://example.com/different"'));
  buffer.observe(changed.markdownSegments, 2000);
  expect(buffer.currentSnapshotIsConsistent()).toBeFalse();
  expect(() => buffer.finish()).toThrow("completed text block");
});

test("captured DIL smoke response reaches Markdown delivery and stable completion", async () => {
  // Also cover a changed CSS module hash and nested Markdown without duplicate delivery.
  for (const html of [
    smokeHtml,
    smokeHtml.replaceAll("fv0XaG_", "changed_"),
    smokeHtml.replace('<p class="w6asjq_TextBase _85PZeG_Text">', '<p class="markdown">'),
    '<section id="turn"><div class="markdown"><p>CODEX WEB GPT READY</p></div><button data-testid="copy-turn-action-button"></button></section>',
  ]) {
    const response = await snapshot(html);
    expect(response.visibleText).toBe("CODEX WEB GPT READY");
    expect(response.completionActionVisible).toBeTrue();
    const buffer = new ChatGptMarkdownBuffer();
    buffer.observe(response.markdownSegments, 0);
    expect(buffer.finish().markdown).toBe("CODEX WEB GPT READY");
    const tracker = new ChatGptCompletionTracker();
    const state = { ...response, running: false, currentText: response.visibleText, currentHtml: response.fullHtml };
    expect(tracker.update({ ...state, running: true }, 0)).toBeFalse();
    expect(tracker.update(state, 1)).toBeFalse();
    expect(tracker.update(state, 1 + CHATGPT_COMPLETION_SETTLE_MS)).toBeTrue();
    expect(response.traceBlocks.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "answer", text: "CODEX WEB GPT READY" },
    ]);
  }
});

test("DIL response extraction preserves ownership, commentary and completion boundaries", async () => {
  for (const html of [
    smokeHtml.replace('data-message-author-role="assistant"', 'data-message-author-role="user"'),
    smokeHtml.replace("fv0XaG_DilResponseRoot", "unrelated-widget"),
    smokeHtml.replace('dir="auto"', 'dir="auto" style="display:none"'),
    smokeHtml.replace('class="grow"', 'class="grow" data-streaming-response-status="thinking"'),
    smokeHtml.replace('class="grow"', 'class="grow" data-testid="cot-v5"'),
  ]) {
    const response = await snapshot(html);
    expect(response.visibleText).toBe("");
    expect(response.completionActionVisible).toBeFalse();
  }
  const noCopy = await snapshot(smokeHtml.replace('data-testid="copy-turn-action-button"', 'data-testid="other-action"'));
  expect(noCopy.visibleText).toBe("CODEX WEB GPT READY");
  expect(noCopy.completionActionVisible).toBeFalse();
});

test("paired turns read only assistant Markdown and require an external completion control", async () => {
  const content = `<div id="turn" data-turn-key="pair-1">
    <div data-user-message-bubble="true"><div data-markdown-text-tone="user-message">SECRET USER PROMPT<p>Stopped thinking</p></div><button aria-label="Copiar mensagem"></button></div>
    <div data-markdown-text-style="assistant-message"><p>OK</p><pre><code>example</code><button aria-label="Copiar"></button></pre></div>
    FOOTER
  </div>`;
  const pending = await snapshot(content);
  expect(pending.visibleText).not.toContain("SECRET USER PROMPT");
  expect(pending.visibleText).not.toContain("FOOTER");
  expect(pending.completionActionVisible).toBeFalse();
  expect(pending.stoppedThinkingVisible).toBeFalse();
  const completed = await snapshot(content.replace("FOOTER", '<button aria-label="Copiar"></button>'));
  expect(completed.completionActionVisible).toBeTrue();
  expect(completed.fullHtml).not.toContain("SECRET USER PROMPT");
});

test("paired renderer revisions after tool calls are buffered until completion without leaking stale paragraphs", async () => {
  const paired = (answer: string, completed = false) => `<div id="turn" data-turn-key="active-pair">
    <div data-user-message-bubble="true">Private task input</div>
    <div data-markdown-text-style="assistant-message">${answer}</div>
    ${completed ? '<button aria-label="Copiar"></button>' : ''}
  </div>`;
  const buffer = new ChatGptMarkdownBuffer();
  const initial = await snapshot(paired('<p>Vou verificar os arquivos.</p><p>Preparando a primeira etapa.</p>'));
  expect(buffer.observe(initial.markdownSegments, 0)).toBe("");
  // This used to commit positional block 0 after 750 ms, although it can still change.
  expect(buffer.observe(initial.markdownSegments, 10_000)).toBe("");
  const revised = await snapshot(paired('<p>Executei as verificações e corrigi os problemas encontrados.</p><p>Validando os testes.</p>'));
  expect(buffer.observe(revised.markdownSegments, 20_000)).toBe("");
  expect(buffer.observe(revised.markdownSegments, 30_000)).toBe("");
  const final = await snapshot(paired('<h2>Resultado</h2><p>Correção concluída.</p><ul><li>Testes passaram.</li><li>Dados preservados.</li></ul>', true));
  expect(buffer.observe(final.markdownSegments, 40_000)).toBe("");
  expect(final.completionActionVisible).toBeTrue();
  expect(buffer.currentSnapshotIsConsistent()).toBeTrue();
  const completed = buffer.finish();
  expect(completed.markdown).toBe("## Resultado\n\nCorreção concluída.\n\n- Testes passaram.\n- Dados preservados.");
  expect(completed.delta).toBe(completed.markdown);
  expect(completed.markdown).not.toContain("Vou verificar");
  expect(completed.markdown).not.toContain("Private task input");
});

test("legacy renderer still streams completed blocks and rejects genuine committed-text rewrites", async () => {
  const legacy = (text: string) => `<section id="turn"><div class="markdown"><p data-start="0" data-end="25">${text}</p><p data-start="26" data-end="60">Next block</p></div></section>`;
  const buffer = new ChatGptMarkdownBuffer();
  const first = await snapshot(legacy("Original paragraph"));
  expect(buffer.observe(first.markdownSegments, 0)).toBe("");
  expect(buffer.observe(first.markdownSegments, 1000)).toBe("Original paragraph");
  const changed = await snapshot(legacy("Changed paragraph"));
  buffer.observe(changed.markdownSegments, 2000);
  expect(buffer.currentSnapshotIsConsistent()).toBeFalse();
  expect(() => buffer.finish()).toThrow("completed text block");
});
