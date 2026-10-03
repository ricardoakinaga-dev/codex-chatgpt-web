import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const chrome = process.env.CODEX_CHATGPT_WEB_TEST_CHROME ?? "/usr/bin/google-chrome";

test.skipIf(!existsSync(chrome))("launcher startup failure is visible and offers keyboard-accessible reload", async () => {
  const root = mkdtempSync(join(tmpdir(), "cgw-startup-browser-"));
  const app = resolve(import.meta.dir, "../launcher/src/App.tsx");
  const reactDom = resolve(import.meta.dir, "../launcher/node_modules/react-dom/client.js");
  const react = resolve(import.meta.dir, "../launcher/node_modules/react/index.js");
  const entry = join(root, "entry.tsx");
  writeFileSync(entry, `
    import { createRoot } from ${JSON.stringify(reactDom)};
    import { createElement } from ${JSON.stringify(react)};
    import { App } from ${JSON.stringify(app)};
    createRoot(document.getElementById("root")).render(createElement(App));
  `);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const build = await Bun.build({ entrypoints: [entry], target: "browser",
      outdir: root, naming: { entry: "[name]-[hash].[ext]", chunk: "chunk-[hash].js", asset: "asset-[name]-[hash].[ext]" } });
    expect(build.success).toBe(true);
    const script = build.outputs.find(output => output.kind === "entry-point" && output.path.endsWith(".js"));
    if (!script) throw new Error("Startup fixture did not produce JavaScript");
    let navigations = 0;
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
      if (new URL(request.url).pathname === `/${basename(script.path)}`) return new Response(script);
      navigations += 1;
      return new Response(`<!doctype html><html><body><div id="root"></div><script type="module" src="/${basename(script.path)}"></script></body></html>`,
        { headers: { "content-type": "text/html" } });
    } });
    browser = await chromium.launch({ executablePath: chrome, headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const scope = window as unknown as { codexWebLauncher: unknown; startupCalls: number };
      scope.startupCalls = 0;
      scope.codexWebLauncher = new Proxy({}, { get(_target, key) {
        if (key === "snapshot") return async () => { scope.startupCalls += 1; throw new Error("Synthetic startup IPC failure"); };
        if (String(key).startsWith("on")) return () => () => {};
        return async () => null;
      } });
    });
    await page.goto(`http://127.0.0.1:${server.port}`);
    await page.waitForFunction(() => (window as unknown as { startupCalls: number }).startupCalls > 0);
    await expect(page.getByRole("alert").textContent({ timeout: 2_000 })).resolves.toContain("Synthetic startup IPC failure");
    expect(await page.locator(".launch-loading").count()).toBe(0);
    const before = navigations;
    await page.getByRole("button", { name: "Reload launcher" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("alert").waitFor({ state: "visible", timeout: 2_000 });
    expect(navigations).toBeGreaterThan(before);
  } finally {
    await browser?.close();
    server?.stop(true);
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);
