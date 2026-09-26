import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Page } from "playwright-core";
import {
  ChatGptSubmissionRejectionObserver,
  throwIfChatGptRateLimitDialog,
} from "../src/adapters/chatgpt-web/browser-worker";

function dialogPage(text: string, buttonText: string): { page: Page; pressed: string[] } {
  const pressed: string[] = [];
  const createDialog = () => {
    let matches = true;
    let buttonMatches = true;
    const button = {
      last: () => button,
      isVisible: async () => matches && buttonMatches,
      press: async (key: string) => { pressed.push(key); },
    };
    const dialog = {
      filter: ({ hasText }: { hasText: string | RegExp }) => {
        matches &&= typeof hasText === "string" ? text.includes(hasText) : hasText.test(text);
        return dialog;
      },
      last: () => dialog,
      isVisible: async () => matches,
      getByRole: (_role: string, options?: { name?: string | RegExp }) => {
        const name = options?.name;
        buttonMatches = name === undefined
          || (typeof name === "string" ? buttonText === name : name.test(buttonText));
        return button;
      },
    };
    return dialog;
  };
  return {
    page: { locator: () => createDialog() } as unknown as Page,
    pressed,
  };
}

test.each([
  ["Muitas solicitações. Aguarde um momento antes de tentar novamente.", "Entendi"],
  ["Muitas requisições. Você está fazendo solicitações com muita frequência.", "Ok"],
])("the Brazilian Portuguese rate-limit dialog is acknowledged and returns a structured 429: %s", async (message, button) => {
  const fixture = dialogPage(message, button);

  await expect(throwIfChatGptRateLimitDialog(fixture.page)).rejects.toMatchObject({
    name: "ChatGptWebAdapterError",
    status: 429,
    errorType: "rate_limit_error",
    code: "rate_limit_exceeded",
    retryable: false,
  });
  expect(fixture.pressed).toEqual(["Enter"]);
});

test("a 429 submission response becomes a structured rate-limit failure with its retry-after", async () => {
  const frame = {};
  const page = Object.assign(new EventEmitter(), { mainFrame: () => frame });
  const observer = new ChatGptSubmissionRejectionObserver();
  const request = {
    method: () => "POST",
    url: () => "https://chatgpt.com/backend-api/f/conversation",
    frame: () => frame,
  };
  observer.begin(page as unknown as Page);
  page.emit("request", request);
  page.emit("response", {
    request: () => request,
    status: () => 429,
    headers: () => ({ "retry-after": "45", "content-type": "application/json" }),
    json: async () => ({}),
  });

  expect(await observer.failure()).toMatchObject({
    name: "ChatGptWebAdapterError",
    status: 429,
    errorType: "rate_limit_error",
    code: "rate_limit_exceeded",
    retryable: false,
    message: "ChatGPT rate limit: too many requests. Try again in 45s.",
  });
  observer.dispose();
  expect(page.listenerCount("request")).toBe(0);
  expect(page.listenerCount("response")).toBe(0);
});

test("an unrelated submission status keeps the normal response path", async () => {
  const frame = {};
  const page = Object.assign(new EventEmitter(), { mainFrame: () => frame });
  const observer = new ChatGptSubmissionRejectionObserver();
  const request = {
    method: () => "POST",
    url: () => "https://chatgpt.com/backend-api/f/conversation",
    frame: () => frame,
  };
  observer.begin(page as unknown as Page);
  page.emit("request", request);
  page.emit("response", {
    request: () => request,
    status: () => 200,
    headers: () => ({ "content-type": "application/json" }),
    json: async () => ({}),
  });

  expect(await observer.failure()).toBeUndefined();
  observer.dispose();
});
