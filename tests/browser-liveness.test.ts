import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Browser } from "playwright-core";
import { ChatGptBrowserWorker } from "../src/adapters/chatgpt-web/browser-worker";

interface WorkerInternals {
  browser?: unknown;
  context?: unknown;
  page?: unknown;
  managedBrowserReady?: unknown;
  watchedBrowsers: WeakSet<Browser>;
  watchBrowserLiveness(browser: Browser): void;
}

function workerWithState(state: {
  browser: unknown;
  context: unknown;
  page: unknown;
  managedBrowserReady: unknown;
}): WorkerInternals {
  const worker = Object.create(ChatGptBrowserWorker.prototype) as unknown as WorkerInternals;
  Object.assign(worker, state, { watchedBrowsers: new WeakSet<Browser>() });
  return worker;
}

test("a disconnected managed browser invalidates every cached surface reference", () => {
  const emitter = new EventEmitter();
  const browser = emitter as unknown as Browser;
  const context = {};
  const page = {};
  const worker = workerWithState({
    browser,
    context,
    page,
    managedBrowserReady: Promise.resolve({ browser, context }),
  });

  worker.watchBrowserLiveness(browser);
  emitter.emit("disconnected");

  expect(worker.browser).toBeUndefined();
  expect(worker.context).toBeUndefined();
  expect(worker.page).toBeUndefined();
  expect(worker.managedBrowserReady).toBeUndefined();
});

test("liveness watching is idempotent and ignores unrelated browsers", () => {
  const emitter = new EventEmitter();
  const otherEmitter = new EventEmitter();
  const browser = emitter as unknown as Browser;
  const worker = workerWithState({
    browser,
    context: {},
    page: {},
    managedBrowserReady: Promise.resolve({ browser, context: {} }),
  });

  worker.watchBrowserLiveness(browser);
  worker.watchBrowserLiveness(browser);
  expect(emitter.listenerCount("disconnected")).toBe(1);

  otherEmitter.emit("disconnected");
  expect(worker.browser).toBe(browser);

  emitter.emit("disconnected");
  expect(worker.browser).toBeUndefined();
});
