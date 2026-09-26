import { expect, test } from "bun:test";
import { bridgeToResponsesSSE } from "../src/bridge";
import type { AdapterEvent } from "../src/types";

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

test("a mid-stream failure finalizes open answer text as incomplete, never completed", async () => {
  const frames = await collect([
    { type: "text_delta", text: "partial answer" },
    {
      type: "error",
      message: "ChatGPT stopped responding after the task started.",
      status: 502,
      errorType: "server_error",
      code: "chatgpt_submitted_turn_failed",
      retryable: false,
    },
  ]);
  const itemDone = frames.find(frame => frame.type === "response.output_item.done");
  expect((itemDone?.item as { status?: string; type?: string } | undefined)).toMatchObject({
    type: "message",
    status: "incomplete",
  });
  expect(frames.some(frame => frame.type === "response.failed")).toBe(true);
  expect(frames.some(frame => frame.type === "response.completed")).toBe(false);
});

test("a partially streamed tool call is never committed as an executable call", async () => {
  const frames = await collect([
    { type: "tool_call_start", id: "call_partial_1", name: "exec_command" },
    { type: "tool_call_delta", arguments: '{"cmd":"ls -la' },
    {
      type: "error",
      message: "browser stream died mid-call",
      status: 502,
      errorType: "server_error",
      code: "upstream_server_error",
      retryable: false,
    },
  ]);
  const itemDone = frames.find(frame => (
    frame.type === "response.output_item.done"
    && (frame.item as { type?: string } | undefined)?.type === "function_call"
  ));
  expect((itemDone?.item as { status?: string } | undefined)).toMatchObject({ status: "incomplete" });
  expect(frames.some(frame => frame.type === "response.function_call_arguments.done")).toBe(false);
});

test("a normal completed turn still commits its message as completed", async () => {
  const frames = await collect([
    { type: "text_delta", text: "complete answer" },
    { type: "done", endTurn: true },
  ]);
  const itemDone = frames.find(frame => frame.type === "response.output_item.done");
  expect((itemDone?.item as { status?: string } | undefined)).toMatchObject({ status: "completed" });
  expect(frames.some(frame => frame.type === "response.completed")).toBe(true);
});
