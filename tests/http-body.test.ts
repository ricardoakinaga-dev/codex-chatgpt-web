import { expect, test } from "bun:test";
import { readJsonRequestBody, RequestBodyLimitError } from "../src/http-body";
import { compactRequest, responseRequest } from "../src/server";
import { defaultConfig } from "../src/config";

test("unknown-length request bodies stop reading and cancel when the encoded limit is exceeded", async () => {
  const chunk = new Uint8Array(1024 * 1024);
  let produced = 0;
  let cancelled = false;
  const request = new Request("http://127.0.0.1/v1/responses", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced === 70) controller.close();
        else { produced += 1; controller.enqueue(chunk); }
      },
      cancel() { cancelled = true; },
    }),
  });
  await expect(readJsonRequestBody(request)).rejects.toThrow("Encoded request body exceeds");
  expect(produced).toBeLessThan(70);
  expect(cancelled).toBe(true);
});

test("decodes Codex zstd-compressed JSON request bodies", async () => {
  const body = { model: "chatgpt-web/pro", reasoning: { effort: "ultra" }, input: [{ role: "user", content: "hello" }] };
  const compressed = Bun.zstdCompressSync(Buffer.from(JSON.stringify(body)));
  const encoded = new ArrayBuffer(compressed.byteLength);
  new Uint8Array(encoded).set(compressed);
  const request = new Request("http://127.0.0.1/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", "content-encoding": "zstd" },
    body: encoded,
  });

  expect(await readJsonRequestBody(request)).toEqual(body);
});

test("zstd decompression enforces the decoded output budget", async () => {
  const compressed = Bun.zstdCompressSync(new Uint8Array(128 * 1024 * 1024 + 1));
  const encoded = new ArrayBuffer(compressed.byteLength);
  new Uint8Array(encoded).set(compressed);
  const request = new Request("http://127.0.0.1/v1/responses", {
    method: "POST", headers: { "content-encoding": "zstd" }, body: encoded,
  });
  await expect(readJsonRequestBody(request)).rejects.toBeInstanceOf(RequestBodyLimitError);
});

test("rejects unsupported request content encodings", async () => {
  const request = new Request("http://127.0.0.1/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", "content-encoding": "br" },
    body: "{}",
  });

  await expect(readJsonRequestBody(request)).rejects.toThrow("Unsupported Content-Encoding: br");
});

test.each([responseRequest, compactRequest])("oversized HTTP bodies return 413 before running an adapter", async handler => {
  const request = new Request("http://127.0.0.1/v1/responses", {
    method: "POST", headers: { "content-length": String(64 * 1024 * 1024 + 1) }, body: "{}",
  });
  const response = await handler(request, defaultConfig("browser-only"), () => {
    throw new Error("Oversized input must never open a browser turn");
  });
  expect(response.status).toBe(413);
  expect((await response.json()).error.message).toContain("Encoded request body exceeds");
});

test("stream-size rejection is not blocked by an unread request-clone branch", async () => {
  const chunk = new Uint8Array(1024 * 1024);
  let produced = 0;
  let cancelled = false;
  const request = new Request("http://127.0.0.1/v1/responses", {
    method: "POST", body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced === 70) controller.close();
        else { produced += 1; controller.enqueue(chunk); }
      }, cancel() { cancelled = true; },
    }),
  });
  const clone = request.clone();
  try {
    await expect(readJsonRequestBody(request)).rejects.toThrow("Encoded request body exceeds");
    expect(produced).toBeLessThan(70);
  } finally {
    await clone.body!.cancel();
  }
  expect(cancelled).toBe(true);
});

test("request cancellation releases a body reader that has not produced any bytes", async () => {
  const abort = new AbortController();
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const request = new Request("http://127.0.0.1/v1/responses", {
    method: "POST", signal: abort.signal,
    body: new ReadableStream<Uint8Array>({
      start(controller) { source = controller; },
      cancel() { cancelled = true; },
    }),
  });
  const result = readJsonRequestBody(request).catch(error => error);
  try {
    abort.abort();
    const outcome = await Promise.race([result, Bun.sleep(100).then(() => new Error("Reader ignored cancellation"))]);
    expect(outcome).toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
  } finally {
    if (!cancelled) source.close();
    await result;
  }
});
