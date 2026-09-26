import { expect, test } from "bun:test";
import { AsyncEventQueue } from "../src/event-queue";

test("a concurrent consumer drains a long synthetic burst when the queue is allowed to grow", async () => {
  const queue = new AsyncEventQueue<number>(4, "grow");
  const collected = queue.collect();
  for (let index = 0; index < 10_000; index += 1) queue.push(index);
  queue.close();
  const values = await collected;
  expect(values).toHaveLength(10_000);
  expect(values[0]).toBe(0);
  expect(values.at(-1)).toBe(9_999);
});

test("the default overflow policy still fails a stalled consumer instead of growing without bound", () => {
  const queue = new AsyncEventQueue<number>(4);
  for (let index = 0; index < 4; index += 1) queue.push(index);
  expect(() => queue.push(4)).toThrow("Adapter event backlog exceeded");
});

test("closing the queue releases waiting consumers exactly once", async () => {
  const queue = new AsyncEventQueue<string>(4);
  const collected = queue.collect();
  queue.push("one");
  queue.close();
  expect(await collected).toEqual(["one"]);
});
