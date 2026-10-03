// Proves scripts/smoke-test.mjs fails when an event handler throws at startup. pi only reports
// such errors as `extension_error` lines on stdout (exit 0, empty stderr).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

void test("smoke-test fails when a session_start handler throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-smoke-fixture-"));
  try {
    await mkdir(join(dir, "scripts"));
    await mkdir(join(dir, "src"));
    await copyFile(join(root, "scripts/smoke-test.mjs"), join(dir, "scripts/smoke-test.mjs"));
    await copyFile(
      join(root, "test/fixtures/throwing-session-start.ts"),
      join(dir, "src/index.ts")
    );
    await writeFile(
      join(dir, "package.json"),
      `${JSON.stringify({ name: "smoke-fixture", type: "module", pi: { extensions: ["./src/index.ts"] } })}\n`
    );
    await symlink(join(root, "node_modules"), join(dir, "node_modules"), "junction");

    const result = spawnSync(process.execPath, ["--import=tsx", "scripts/smoke-test.mjs"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 90_000,
    });

    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /session_start handler threw: boom/);
    assert.match(result.stderr, /reported 1 extension error/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
