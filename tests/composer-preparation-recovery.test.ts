import { expect, test } from "bun:test";
import { ChatGptBrowserWorker, throwIfChatGptSignedOutComposer } from "../src/adapters/chatgpt-web/browser-worker";
import { ChatGptWebAdapterError } from "../src/adapters/chatgpt-web/adapter-error";
import { CHATGPT_COMPOSER_SELECTOR, CHATGPT_TEMPORARY_CHAT_URL } from "../src/chatgpt-session";

const prepare = (ChatGptBrowserWorker.prototype as any).prepareChatSurface;
const unavailable = () => new ChatGptWebAdapterError("ChatGPT composer did not appear", {
  status: 502, errorType: "server_error", code: "chatgpt_composer_unavailable", retryable: false,
});

test("signed-out lightweight composer reports sign-in instead of a hydration timeout", async () => {
  const page: any = { url: () => CHATGPT_TEMPORARY_CHAT_URL,
    locator: () => ({ isVisible: async () => true }),
    evaluate: async () => ({ status: 200, hasUser: false, hasAccessToken: false }),
  };
  await expect(throwIfChatGptSignedOutComposer(page)).rejects.toMatchObject({ status: 401, code: "chatgpt_sign_in_required", retryable: false });
  page.evaluate = async () => ({ status: 200, hasUser: true, hasAccessToken: true });
  await expect(throwIfChatGptSignedOutComposer(page)).resolves.toBeUndefined();
  page.evaluate = async () => undefined;
  await expect(throwIfChatGptSignedOutComposer(page)).resolves.toBeUndefined();
});

function fixture(options: { ready?: boolean; messages?: number; expired?: boolean; recover?: boolean } = {}) {
  let ready = options.ready ?? false;
  let reloads = 0;
  const budgets: number[] = [];
  const composer: any = { count: async () => ready ? 1 : 0, nth: () => composer, isVisible: async () => ready };
  const absent: any = { filter: () => absent, last: () => absent, isVisible: async () => false, count: async () => options.messages ?? 0 };
  const alert: any = { filter: ({ hasText }: { hasText: RegExp | string }) => options.expired
    && (typeof hasText === "string" ? "Your session has expired".includes(hasText) : hasText.test("Your session has expired")) ? alert : absent,
    last: () => alert, isVisible: async () => true };
  const page: any = {
    url: () => CHATGPT_TEMPORARY_CHAT_URL,
    locator: (selector: string) => selector === CHATGPT_COMPOSER_SELECTOR ? composer
      : selector.includes('role="alert"') || selector.includes('role="dialog"') ? alert : absent,
    reload: async () => { reloads += 1; ready = options.recover !== false; },
  };
  const worker: any = { activeComposer: async (_page: unknown, budget: number, signal?: AbortSignal) => {
    budgets.push(budget);
    signal?.throwIfAborted();
    if (!ready) throw unavailable();
    return composer;
  } };
  return { page, worker, composer, budgets, reloads: () => reloads };
}

test("an empty new chat recovers once before submission instead of abandoning the task", async () => {
  const f = fixture();
  expect(await prepare.call(f.worker, f.page)).toBe(f.composer);
  expect(f.reloads()).toBe(1);
  expect(f.budgets).toEqual([8_000, 20_000]);
});

test("a healthy composer adds no recovery or artificial delay", async () => {
  const f = fixture({ ready: true });
  expect(await prepare.call(f.worker, f.page)).toBe(f.composer);
  expect(f.reloads()).toBe(0);
  expect(f.budgets).toEqual([8_000]);
});

test("existing conversation messages prohibit automatic reload", async () => {
  const f = fixture({ messages: 1 });
  await expect(prepare.call(f.worker, f.page)).rejects.toMatchObject({ code: "chatgpt_composer_unavailable" });
  expect(f.reloads()).toBe(0);
});

test("multiple visible composers prohibit automatic recovery or guessing an input", async () => {
  const f = fixture();
  f.worker.activeComposer = async () => { throw new ChatGptWebAdapterError("Ambiguous compositor", {
    status: 502, errorType: "server_error", code: "chatgpt_composer_ambiguous", retryable: false,
  }); };
  await expect(prepare.call(f.worker, f.page)).rejects.toMatchObject({ code: "chatgpt_composer_ambiguous" });
  expect(f.reloads()).toBe(0);
});

test("a typed compositor failure cannot hide an expired-session alert", async () => {
  const f = fixture({ expired: true });
  await expect(prepare.call(f.worker, f.page)).rejects.toMatchObject({ status: 401, code: "chatgpt_session_expired" });
  expect(f.reloads()).toBe(0);
});

test("persistent unavailability exhausts one recovery without an endless loop", async () => {
  const f = fixture({ recover: false });
  await expect(prepare.call(f.worker, f.page)).rejects.toMatchObject({ code: "chatgpt_composer_unavailable" });
  expect(f.reloads()).toBe(1);
  expect(f.budgets).toHaveLength(2);
});

test("cancellation reaches the hydration wait and never reloads the page", async () => {
  const f = fixture();
  const controller = new AbortController();
  f.worker.activeComposer = async (_page: unknown, _budget: number, signal?: AbortSignal) => new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
  });
  const result = prepare.call(f.worker, f.page, undefined, false, controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(f.reloads()).toBe(0);
}, 1000);
