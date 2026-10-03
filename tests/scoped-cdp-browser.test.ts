import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { chromium } from "playwright-core";
import { connectLauncherBrowserHost, LAUNCHER_BROWSER_HOST_KIND, LAUNCHER_BROWSER_IDLE_URL } from "../src/launcher-browser-host";

const chrome = process.env.CODEX_CHATGPT_WEB_TEST_CHROME ?? "/usr/bin/google-chrome";

test.skipIf(!existsSync(chrome))("CDP acquisition ignores a blocked unrelated renderer and disconnects only its lease", async () => {
  const reservation = createServer();
  await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const root = mkdtempSync(join(tmpdir(), "cgw-scoped-cdp-"));
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: [`--remote-debugging-port=${port}`] });
  let connection: Awaited<ReturnType<typeof connectLauncherBrowserHost>> | undefined;
  let second: Awaited<ReturnType<typeof connectLauncherBrowserHost>> | undefined;
  const owned = await (await browser.newContext()).newPage();
  const unrelated = await (await browser.newContext()).newPage();
  try {
    await owned.setContent('<title>Owned page</title><form><textarea id="prompt-textarea"></textarea></form><iframe srcdoc="<input id=child>"></iframe>');
    await unrelated.setContent('<title>Unrelated page</title>');
    const session = await owned.context().newCDPSession(owned);
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: false });
    const { targetInfo } = await session.send("Target.getTargetInfo");
    const otherSession = await unrelated.context().newCDPSession(unrelated);
    const otherTarget = (await otherSession.send("Target.getTargetInfo")).targetInfo.targetId;
    await otherSession.detach();
    const descriptor = join(root, "launcher.json");
    writeFileSync(descriptor, JSON.stringify({ version: 3, kind: LAUNCHER_BROWSER_HOST_KIND,
      profile: "production", pid: process.pid, endpoint: `http://127.0.0.1:${port}`,
      control: { endpoint: `http://127.0.0.1:${port}`, token: "a".repeat(43) },
      helper: { executable: process.execPath, script: import.meta.path },
      partition: "persist:codex-web-gpt-chatgpt", idleUrl: LAUNCHER_BROWSER_IDLE_URL,
      surfaceId: "a".repeat(32), surfaceTargets: { ["a".repeat(32)]: targetInfo.targetId },
      createdAt: new Date().toISOString() }), { mode: 0o600 });
    const blocker = unrelated.evaluate(() => { for (;;) {} }).catch(() => {});
    await Bun.sleep(100);
    const started = performance.now();
    connection = await connectLauncherBrowserHost(descriptor, 1500);
    console.info(`SCOPED_CDP_ACQUISITION_MS=${Math.round(performance.now() - started)}`);
    expect(connection.context.pages()).toHaveLength(1);
    expect(await connection.page.evaluate(() => document.hasFocus())).toBe(true);
    const rootSession = await connection.browser.newBrowserCDPSession();
    await expect(rootSession.send("Target.closeTarget", { targetId: otherTarget })).rejects.toThrow("outside the leased launcher target");
    await rootSession.detach();
    await connection.page.locator("#prompt-textarea").fill("owned only");
    expect(await owned.locator("#prompt-textarea").inputValue()).toBe("owned only");
    await connection.page.frameLocator("iframe").locator("#child").fill("child frame");
    expect(await owned.frameLocator("iframe").locator("#child").inputValue()).toBe("child frame");
    second = await connectLauncherBrowserHost(descriptor, 1500);
    await connection.browser.close(); connection = undefined;
    expect(await second.page.title()).toBe("Owned page");
    expect(await owned.title()).toBe("Owned page");
    await unrelated.close();
    await blocker;
  } finally {
    await connection?.browser.close();
    await second?.browser.close();
    await unrelated.close().catch(() => {});
    await browser.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 15_000);
