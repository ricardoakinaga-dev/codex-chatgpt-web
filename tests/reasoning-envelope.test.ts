import { expect, test } from "bun:test";
import {
  BRIDGE_REASONING_PREFIX,
  decodeReasoningEnvelope,
  encodeReasoningEnvelope,
} from "../src/responses/reasoning-envelope";

test("a signed reasoning envelope round-trips every captured field", () => {
  const envelope = {
    sig: "sig-abc",
    red: ["opaque-one", "opaque-two"],
    txt: "hidden thinking text",
  };
  const encoded = encodeReasoningEnvelope(envelope);
  expect(encoded.startsWith(BRIDGE_REASONING_PREFIX)).toBe(true);
  expect(decodeReasoningEnvelope(encoded)).toEqual(envelope);
});

test("a text-only envelope survives the round-trip", () => {
  const encoded = encodeReasoningEnvelope({ txt: "only hidden text" });
  expect(decodeReasoningEnvelope(encoded)).toEqual({ txt: "only hidden text" });
});

test("native encrypted blobs and garbage are never claimed as bridge envelopes", () => {
  expect(decodeReasoningEnvelope("gAAAAABm-native-openai-blob")).toBeNull();
  expect(decodeReasoningEnvelope(`${BRIDGE_REASONING_PREFIX}not-base64-json`)).toBeNull();
  expect(decodeReasoningEnvelope(`${BRIDGE_REASONING_PREFIX}${Buffer.from("[]").toString("base64")}`)).toBeNull();
  expect(decodeReasoningEnvelope(`${BRIDGE_REASONING_PREFIX}${Buffer.from('{"sig":42}').toString("base64")}`)).toBeNull();
});

test("non-string redacted entries are dropped instead of corrupting the envelope", () => {
  const encoded = `${BRIDGE_REASONING_PREFIX}${Buffer.from(
    JSON.stringify({ sig: "sig-1", red: ["kept", 7, null] }),
  ).toString("base64")}`;
  expect(decodeReasoningEnvelope(encoded)).toEqual({ sig: "sig-1", red: ["kept"] });
});
