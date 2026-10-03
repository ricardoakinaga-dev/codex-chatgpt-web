import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, saveConfig } from "../src/config";
import { formatDoctorReport, runDoctor } from "../src/doctor";
import { LAUNCHER_BROWSER_HOST_KIND, LAUNCHER_BROWSER_IDLE_URL } from "../src/launcher-browser-host";

const roots: string[] = [];

function fixture(): { appHome: string; codexHome: string } {
  const root = join(tmpdir(), `codex-chatgpt-web-doctor-${process.pid}-${Date.now()}-${Math.random()}`);
  const appHome = join(root, "app");
  const codexHome = join(root, "codex");
  mkdirSync(appHome, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  roots.push(root);
  process.env.CODEX_CHATGPT_WEB_HOME = appHome;
  process.env.CODEX_HOME = codexHome;
  return { appHome, codexHome };
}

afterEach(() => {
  delete process.env.CODEX_CHATGPT_WEB_HOME;
  delete process.env.CODEX_HOME;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("doctor completes and reports a damaged integration journal instead of throwing", async () => {
  const { appHome } = fixture();
  saveConfig(defaultConfig("browser-only"));
  mkdirSync(join(appHome, "codex"), { recursive: true });
  writeFileSync(join(appHome, "codex", "integration-journal.recovery.json"), "{ not valid json");

  const report = await runDoctor();
  expect(Array.isArray(report.checks)).toBe(true);
  const codex = report.checks.find(check => check.id === "codex");
  expect(codex?.status).toBe("error");
  expect(codex?.message).toBe("Codex integration could not be inspected");
  expect(codex?.detail).toContain("Invalid Codex integration journal");
  expect(report.ok).toBe(false);
  expect(formatDoctorReport(report)).toContain("Doctor result: not ready");
});

test("doctor reports a missing Codex route when no journal exists", async () => {
  fixture();
  saveConfig(defaultConfig("browser-only"));

  const report = await runDoctor();
  const codex = report.checks.find(check => check.id === "codex");
  expect(codex).toMatchObject({ status: "error", message: "Codex model route is not installed" });
});

test.each([
  { status: 409, code: "browser_busy", expected: "warning" },
  { status: 400, code: undefined, expected: "warning" },
  { status: 502, code: "browser_busy", expected: "error" },
])("doctor distinguishes occupied browser from unavailable session (HTTP $status)", async ({ status, code, expected }) => {
  const { appHome } = fixture();
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
    return Response.json({ error: "ChatGPT browser is running Codex turn busy_trace_123", ...(code ? { code } : {}) }, { status });
  } });
  try {
    const descriptorPath = join(appHome, "launcher.json");
    const endpoint = `http://127.0.0.1:${server.port}`;
    writeFileSync(descriptorPath, JSON.stringify({ version: 3, kind: LAUNCHER_BROWSER_HOST_KIND,
      profile: "production", pid: process.pid, endpoint,
      control: { endpoint, token: "a".repeat(43) },
      helper: { executable: process.execPath, script: import.meta.path },
      partition: "persist:codex-web-gpt-chatgpt", idleUrl: LAUNCHER_BROWSER_IDLE_URL,
      surfaceId: "a".repeat(32), surfaceTargets: { ["a".repeat(32)]: "owned-target" },
      createdAt: new Date().toISOString() }), { mode: 0o600 });
    saveConfig({ ...defaultConfig("browser-only"), browserHost: "launcher",
      browserHostDescriptorPath: descriptorPath, port: server.port! });
    const report = await runDoctor();
    const browser = report.checks.find(check => check.id === "browser-host");
    expect(browser?.status).toBe(expected);
    if (expected === "warning") {
      expect(browser?.message).toContain("busy");
      expect(browser?.message).not.toContain("authenticated");
    }
  } finally {
    server.stop(true);
  }
});
