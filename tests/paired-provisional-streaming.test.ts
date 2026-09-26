import { expect, test } from "bun:test";
import { buildResponseJSON, bridgeToResponsesSSE } from "../src/bridge";
import { ChatGptMarkdownBuffer, type ChatGptMarkdownSegment } from "../src/adapters/chatgpt-web/markdown";
import { ChatGptTextFeed } from "../src/adapters/chatgpt-web/turn-execution";
import type { AdapterEvent } from "../src/types";

function segment(
  index: number,
  html: string,
  text: string,
  extra: Partial<ChatGptMarkdownSegment> = {},
): ChatGptMarkdownSegment {
  return {
    key: `${index}:p`,
    tag: "p",
    html,
    text,
    streamable: false,
    provisional: true,
    ...extra,
  };
}

async function collect(events: AdapterEvent[]): Promise<Record<string, unknown>[]> {
  async function* source(): AsyncGenerator<AdapterEvent> {
    for (const event of events) yield event;
  }
  const body = await new Response(bridgeToResponsesSSE(source(), "chatgpt-web/test")).text();
  return body
    .split("\n\n")
    .filter(chunk => chunk.startsWith("event: "))
    .map(chunk => JSON.parse(chunk.slice(chunk.indexOf("\ndata: ") + 7)) as Record<string, unknown>);
}

test("paired provisional text streams only append-only extensions", () => {
  const buffer = new ChatGptMarkdownBuffer();
  expect(buffer.provisional).toBeFalse();
  expect(buffer.observe([segment(0, "<p>Olá</p>", "Olá")], 0)).toBe("Olá");
  expect(buffer.provisional).toBeTrue();
  expect(buffer.observe([segment(0, "<p>Olá, mundo</p>", "Olá, mundo")], 100)).toBe(", mundo");
  expect(buffer.observe([segment(0, "<p>Olá, mundo</p>", "Olá, mundo")], 200)).toBe("");
  const final = buffer.finish();
  expect(final.markdown).toBe("Olá, mundo");
  expect(final.delta).toBe("");
});

test("a rewritten provisional block holds emission and finish publishes the truth", () => {
  const buffer = new ChatGptMarkdownBuffer();
  expect(buffer.observe([segment(0, "<p>Rascunho</p>", "Rascunho")], 0)).toBe("Rascunho");
  // The rewrite is not an extension of what Codex already received.
  expect(buffer.observe([segment(0, "<p>Resposta final</p>", "Resposta final")], 100)).toBe("");
  // Once content/order is ambiguous, even a later clean extension stays held.
  expect(buffer.observe([segment(0, "<p>Resposta final completa</p>", "Resposta final completa")], 200)).toBe("");
  const final = buffer.finish();
  expect(final.markdown).toBe("Resposta final completa");
  expect(final.delta).toBe("");
});

test("provisional multi-block answers separate blocks and finish authoritatively", () => {
  const buffer = new ChatGptMarkdownBuffer();
  const first = [
    segment(0, "<h2>Resultado</h2>", "Resultado", { tag: "h2" }),
    segment(1, "<p>Primeiro.</p>", "Primeiro."),
  ];
  expect(buffer.observe(first, 0)).toBe("Resultado\n\nPrimeiro.");
  expect(buffer.observe([
    segment(0, "<h2>Resultado</h2>", "Resultado", { tag: "h2" }),
    segment(1, "<p>Primeiro. Segundo.</p>", "Primeiro. Segundo."),
  ], 100)).toBe(" Segundo.");
  const final = buffer.finish();
  expect(final.markdown).toBe("## Resultado\n\nPrimeiro. Segundo.");
});

test("a text reset replaces provisional deltas in the streamed message", async () => {
  const frames = await collect([
    { type: "text_delta", text: "PROVISORIO" },
    { type: "text_reset", text: "FINAL" },
    { type: "done", endTurn: true },
  ]);
  const textDone = frames.find(frame => frame.type === "response.output_text.done");
  expect(textDone?.text).toBe("FINAL");
  const itemDone = frames.find(frame => frame.type === "response.output_item.done");
  expect(itemDone?.item).toMatchObject({
    type: "message",
    status: "completed",
    content: [{ type: "output_text", text: "FINAL", annotations: [] }],
  });
  expect(frames
    .filter(frame => frame.type === "response.output_text.delta")
    .map(frame => frame.delta)).toEqual(["PROVISORIO"]);
  expect(frames.some(frame => frame.type === "response.completed")).toBe(true);
});

test("a reset without a provisional delta still commits the message", async () => {
  const frames = await collect([
    { type: "text_reset", text: "FINAL" },
    { type: "done", endTurn: true },
  ]);
  const itemDone = frames.find(frame => frame.type === "response.output_item.done");
  expect(itemDone?.item).toMatchObject({
    type: "message",
    content: [{ type: "output_text", text: "FINAL", annotations: [] }],
  });
  expect(frames.some(frame => frame.type === "response.output_text.delta")).toBe(false);
});

test("the non-streaming builder keeps only the authoritative reset text", () => {
  const json = buildResponseJSON([
    { type: "text_delta", text: "PROVISORIO" },
    { type: "text_reset", text: "FINAL" },
    { type: "done", endTurn: true },
  ], "chatgpt-web/test") as {
    status: string;
    output: Array<{ type: string; content?: Array<{ text: string }> }>;
  };
  expect(json.status).toBe("completed");
  expect(json.output[0]?.content?.[0]?.text).toBe("FINAL");
});

test("the text feed carries a reset without queueing a delta", async () => {
  const feed = new ChatGptTextFeed();
  feed.push("A");
  const waiting = feed.wait();
  feed.reset("B");
  await waiting;
  expect(feed.value()).toBe("B");
  expect(feed.drain()).toEqual(["A"]);
  expect(feed.takeReset()).toBe("B");
  expect(feed.takeReset()).toBeUndefined();
});
