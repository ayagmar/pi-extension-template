// Loads every starter in the real pi CLI (RPC mode, no model call), like scripts/smoke-test.mjs
// does for the package entry. A factory that throws, a host-dependency warning or any other
// startup diagnostic on stderr fails the test. Starters you delete are simply not checked.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const startersDir = join(root, "starters");
const starters = listStarters();

for (const starter of starters) {
  void test(`pi loads starters/${starter} in RPC mode without diagnostics`, () => {
    const agentDir = mkdtempSync(join(tmpdir(), "pi-starter-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          piCli(),
          "--mode",
          "rpc",
          "--no-extensions",
          "--extension",
          join(startersDir, starter),
          "--no-session",
        ],
        {
          cwd: root,
          input: `${JSON.stringify({ id: "commands", type: "get_commands" })}\n`,
          encoding: "utf8",
          timeout: 60_000,
          env: {
            PATH: process.env.PATH ?? "",
            HOME: agentDir,
            PI_CODING_AGENT_DIR: agentDir,
            PI_OFFLINE: "1",
          },
        }
      );

      assert.equal(result.error, undefined);
      assert.equal(result.stderr, "", `pi wrote to stderr:\n${result.stderr}`);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /"command":"get_commands","success":true/);
    } finally {
      rmSync(agentDir, { recursive: true, force: true });
    }
  });
}

function listStarters(): string[] {
  try {
    return readdirSync(startersDir).filter((file) => file.endsWith(".ts"));
  } catch {
    return [];
  }
}

function piCli(): string {
  const piPkgDir = join(root, "node_modules", "@earendil-works", "pi-coding-agent");
  const piPkg = JSON.parse(readFileSync(join(piPkgDir, "package.json"), "utf8")) as {
    bin: string | { pi: string };
  };
  return join(piPkgDir, typeof piPkg.bin === "string" ? piPkg.bin : piPkg.bin.pi);
}
