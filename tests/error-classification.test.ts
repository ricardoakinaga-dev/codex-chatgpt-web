import { expect, test } from "bun:test";
import {
  adapterFailureFromMessage,
  classifyError,
  inferHttpStatusFromAdapterMessage,
  parseRetryAfterFromMessage,
} from "../src/lib/errors";

test("local availability failures are never reported to Codex as model capacity", () => {
  for (const message of [
    "Launcher browser host is unavailable: descriptor is missing at /tmp/launcher-browser.json",
    "ChatGPT composer is unavailable. Reload ChatGPT and retry the task.",
    "Bigger Context is unavailable for Luna because its accumulated browser transcript still shares one 28,000-token transport budget",
    "ChatGPT temporarily reduced service quality",
  ]) {
    expect(inferHttpStatusFromAdapterMessage(message)).not.toBe(503);
    expect(adapterFailureFromMessage(message).error.code).not.toBe("server_is_overloaded");
  }
});

test("only explicit overload wording still maps to capacity", () => {
  expect(inferHttpStatusFromAdapterMessage("launcher is temporarily unavailable")).toBe(503);
  expect(inferHttpStatusFromAdapterMessage("the upstream served an overloaded response")).toBe(503);
  expect(inferHttpStatusFromAdapterMessage("server is busy")).toBe(503);
  expect(adapterFailureFromMessage("server is busy").error.code).toBe("server_is_overloaded");
});

test("internal authentication wording no longer becomes invalid_api_key", () => {
  const message = "ChatGPT authentication could not be verified: no visible composer is present";
  expect(inferHttpStatusFromAdapterMessage(message)).toBe(502);
  expect(adapterFailureFromMessage(message).error).toMatchObject({
    type: "server_error",
    code: "upstream_server_error",
  });
});

test("structured error types are authoritative over message keywords", () => {
  expect(classifyError(502, "server_error", "ChatGPT authentication could not be verified")).toMatchObject({
    type: "server_error",
    code: "upstream_server_error",
  });
  expect(classifyError(502, "server_error", "upstream is temporarily unavailable")).toMatchObject({
    type: "server_error",
    code: "server_is_overloaded",
  });
  expect(classifyError(429, "rate_limit_error", "completely unrelated text")).toMatchObject({
    type: "rate_limit_error",
    code: "rate_limit_exceeded",
  });
  expect(classifyError(401, "authentication_error", "completely unrelated text")).toMatchObject({
    type: "authentication_error",
    code: "invalid_api_key",
  });
});

test("retry-after parsing understands seconds, minutes and hours", () => {
  expect(parseRetryAfterFromMessage("Try again in 30s.")).toBe(30);
  expect(parseRetryAfterFromMessage("Try again in a few minutes.")).toBeUndefined();
  expect(parseRetryAfterFromMessage("Try again in 2 minutes.")).toBe(120);
  expect(parseRetryAfterFromMessage("retry after 1 hour")).toBe(3_600);
});
