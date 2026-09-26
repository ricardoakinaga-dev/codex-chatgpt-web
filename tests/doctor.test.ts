import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, saveConfig } from "../src/config";
import { formatDoctorReport, runDoctor } from "../src/doctor";

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
