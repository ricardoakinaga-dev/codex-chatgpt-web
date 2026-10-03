import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("response snapshot skips entries exceeding its UTF-8 byte budget", () => {
  const root = mkdtempSync(join(tmpdir(), "cgw-state-utf8-"));
  try {
    const module = resolve(import.meta.dir, "../src/responses/state.ts");
    const child = Bun.spawnSync([process.execPath, "--eval", `
      import { rememberResponseState, flushResponseState } from ${JSON.stringify(module)};
      rememberResponseState({ input: [{ role: "user", content: "漢".repeat(800_000) }] },
        { id: "utf8-oversized", status: "completed", output: [] });
      flushResponseState();
    `], { env: { ...process.env, CODEX_CHATGPT_WEB_HOME: root }, stdout: "pipe", stderr: "pipe" });
    expect(child.exitCode).toBe(0);
    const snapshot = JSON.parse(readFileSync(join(root, "responses-state.json"), "utf8"));
    expect(snapshot.states).toHaveLength(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
