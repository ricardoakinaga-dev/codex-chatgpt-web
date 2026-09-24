const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const runner = path.resolve(__dirname, "../assets/linux-appimage-runner.sh");
const linuxOnly = { skip: process.platform !== "linux" };

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "launcher-service-"));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const appImage = path.join(root, "Codex $HOME Web GPT.AppImage");
  const marker = path.join(root, "args.json");
  fs.writeFileSync(appImage, "#!/bin/sh\nexit 99\n", { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "systemctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "systemd-run"), [
    `#!${process.execPath}`,
    'require("node:fs").writeFileSync(process.env.MARKER, JSON.stringify(process.argv.slice(2)));',
    'process.exit(Number(process.env.SERVICE_EXIT || 0));',
  ].join("\n"), { mode: 0o755 });
  return {
    root, bin, appImage, marker,
    env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, MARKER: marker,
      CODEX_WEB_GPT_LAUNCHER_EXECUTABLE: path.join(root, "launcher"),
      CODEX_CHATGPT_WEB_HOME: path.join(root, "profile with spaces"),
    },
  };
}

test("installed runner transfers launch and literal arguments to its own service", linuxOnly, () => {
  if (process.platform !== "linux") return;
  const f = fixture();
  try {
    const result = spawnSync(runner, [f.appImage, "--hidden", "literal $HOME"], {
      env: f.env, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const args = JSON.parse(fs.readFileSync(f.marker, "utf8"));
    assert.ok(args.includes("--service-type=exec"));
    assert.ok(args.includes("--expand-environment=no"));
    assert.ok(args.includes("--property=Restart=on-failure"));
    assert.ok(args.includes("--property=StartLimitBurst=3"));
    assert.ok(args.includes("--setenv=CODEX_CHATGPT_WEB_HOME"));
    assert.ok(!args.join(" ").includes(f.env.CODEX_CHATGPT_WEB_HOME));
    assert.deepEqual(args.slice(-5), [runner, "--service-child", f.appImage, "--hidden", "literal $HOME"]);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("service submission failure is reported without launching in the dying parent", linuxOnly, () => {
  if (process.platform !== "linux") return;
  const f = fixture();
  try {
    const result = spawnSync(runner, [f.appImage], {
      env: { ...f.env, SERVICE_EXIT: "42" }, timeout: 10_000,
    });
    assert.equal(result.status, 42);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("service child executes fallback once and preserves arguments and exit code", linuxOnly, () => {
  if (process.platform !== "linux") return;
  const f = fixture();
  try {
    const appRun = path.join(f.root, "AppRun");
    fs.writeFileSync(appRun, "#!/bin/sh\n[ \"$1\" = 'literal $HOME' ] || exit 98\nexit 23\n", { mode: 0o755 });
    fs.writeFileSync(f.appImage, [
      '#!/bin/sh', '[ "$1" = "--appimage-extract" ] || exit 99',
      'mkdir squashfs-root', 'cp "$APPRUN" squashfs-root/AppRun',
    ].join("\n"), { mode: 0o755 });
    const result = spawnSync(runner, ["--service-child", f.appImage, "literal $HOME"], {
      env: { ...f.env, APPIMAGE_EXTRACT_AND_RUN: "1", APPRUN: appRun, XDG_RUNTIME_DIR: f.root },
      encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.status, 23, result.stderr);
    assert.equal(fs.existsSync(f.marker), false, "must not recursively submit another service");
    assert.deepEqual(fs.readdirSync(path.join(f.root, `codex-web-gpt-appimage-${process.getuid()}`)), []);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
