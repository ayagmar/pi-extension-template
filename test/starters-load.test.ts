// Loads every starter in the real pi CLI (RPC mode, no model call), like scripts/smoke-test.mjs
// does for the package entry. A factory that throws, a host-dependency warning or any other
// startup diagnostic on stderr fails the test. So does an event handler that throws (e.g. in
// session_start): pi reports those as `extension_error` lines on stdout and still exits 0.
// Starters you delete are simply not checked.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface ExtensionError {
  type: "extension_error";
  extensionPath: string;
  event: string;
  error: string;
}

interface RpcRun {
  status: number | null;
  stdout: string;
  stderr: string;
  error: Error | undefined;
  extensionErrors: ExtensionError[];
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const startersDir = join(root, "starters");
const starters = listStarters();

for (const starter of starters) {
  void test(`pi loads starters/${starter} in RPC mode without diagnostics`, () => {
    const result = loadInPi(join(startersDir, starter));

    assert.equal(result.error, undefined);
    assert.equal(result.stderr, "", `pi wrote to stderr:\n${result.stderr}`);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /"command":"get_commands","success":true/);
    assert.deepEqual(
      result.extensionErrors,
      [],
      `pi reported extension errors:\n${formatErrors(result.extensionErrors)}`
    );
  });
}

void test("the load check catches a session_start handler that throws", () => {
  const result = loadInPi(join(root, "test", "fixtures", "throwing-session-start.ts"));

  // pi itself treats the error as non-fatal, so only the extension_error line reveals it.
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  assert.equal(result.status, 0);
  assert.equal(result.extensionErrors.length, 1, result.stdout);
  assert.equal(result.extensionErrors[0]?.event, "session_start");
  assert.equal(result.extensionErrors[0]?.error, "boom");
});

function loadInPi(extensionPath: string): RpcRun {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-starter-"));
  try {
    const result = spawnSync(
      process.execPath,
      [piCli(), "--mode", "rpc", "--no-extensions", "--extension", extensionPath, "--no-session"],
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
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
      extensionErrors: parseExtensionErrors(result.stdout),
    };
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
}

function parseExtensionErrors(stdout: string): ExtensionError[] {
  const errors: ExtensionError[] = [];
  for (const line of stdout.split("\n")) {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      continue; // not JSON
    }
    if (isExtensionError(message)) errors.push(message);
  }
  return errors;
}

function isExtensionError(message: unknown): message is ExtensionError {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "extension_error"
  );
}

function formatErrors(errors: ExtensionError[]): string {
  return errors
    .map(({ extensionPath, event, error }) => `${extensionPath}: ${event}: ${error}`)
    .join("\n");
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
