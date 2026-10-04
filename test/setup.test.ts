import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIPPED = new Set(["node_modules", ".git"]);

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  description: string;
  keywords: string[];
  repository: { type: string; url: string };
  homepage: string;
  bugs: { url: string };
  pi: { image?: string };
}

async function withTemplateCopy(run: (dir: string) => Promise<void>) {
  const parent = await mkdtemp(join(tmpdir(), "pi-template-setup-"));
  const dir = join(parent, "repo");

  try {
    await cp(root, dir, { recursive: true, filter: (source) => !SKIPPED.has(basename(source)) });
    await run(dir);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function runSetup(dir: string, answers: string[]) {
  return spawnSync(process.execPath, ["scripts/setup.mjs"], {
    cwd: dir,
    input: `${answers.join("\n")}\n`,
    encoding: "utf8",
    // Keep git from discovering an enclosing repository's origin.
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) },
  });
}

// Like runSetup, but keeps stdin open (as Git Bash, IDE consoles and agent shells do) and only
// sends the answers once the first prompt has been printed.
function runSetupWithOpenStdin(dir: string, answers: string[]) {
  return new Promise<{ code: number | null; promptedBeforeInput: boolean; stdout: string }>(
    (resolvePromise, reject) => {
      const child = spawn(process.execPath, ["scripts/setup.mjs"], {
        cwd: dir,
        env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let promptedBeforeInput = false;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`setup printed no prompt while stdin was open:\n${stdout}${stderr}`));
      }, 10_000);

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (!promptedBeforeInput && stdout.includes("Extension name [")) {
          promptedBeforeInput = true;
          child.stdin.end(`${answers.join("\n")}\n`);
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolvePromise({ code, promptedBeforeInput, stdout: `${stdout}${stderr}` });
      });
    }
  );
}

async function readExtensionName(constantsPath: string): Promise<string> {
  const { EXTENSION_NAME } = (await import(
    `${pathToFileURL(constantsPath).href}?t=${Date.now()}`
  )) as {
    EXTENSION_NAME: string;
  };
  return EXTENSION_NAME;
}

function assertBiomeFormatted(dir: string, file: string) {
  const biome = join(root, "node_modules", "@biomejs", "biome", "bin", "biome");
  const result = spawnSync(process.execPath, [biome, "format", "--vcs-enabled=false", file], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${file} is not Biome-formatted:\n${result.stdout}${result.stderr}`
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readPackage(dir: string): Promise<PackageJson> {
  return JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as PackageJson;
}

void test("template is private so it can never be published as-is", async () => {
  const pkg = await readPackage(root);
  assert.equal(pkg.private, true);
  assert.equal(pkg.name, "my-pi-extension");
});

void test("setup-template turns the template into a publishable scoped package", async () => {
  await withTemplateCopy(async (dir) => {
    await writeFile(join(dir, "CHANGELOG.md"), "# Changelog\n\n## 0.1.0\n\n- template history\n");

    const result = runSetup(dir, ["pi-foo", "@ayagmar/pi-foo", "Foo things", "foo", "", "", ""]);
    assert.equal(result.status, 0, result.stderr);

    const pkg = await readPackage(dir);
    assert.equal(pkg.name, "@ayagmar/pi-foo");
    assert.equal(pkg.version, "0.0.0");
    assert.equal(pkg.private, undefined);
    assert.equal(pkg.description, "Foo things");
    assert.ok(!pkg.keywords.includes("template"));
    assert.ok(pkg.keywords.includes("pi-package"));
    assert.deepEqual(pkg.repository, {
      type: "git",
      url: "git+https://github.com/ayagmar/pi-foo.git",
    });
    assert.equal(pkg.homepage, "https://github.com/ayagmar/pi-foo#readme");
    assert.deepEqual(pkg.bugs, { url: "https://github.com/ayagmar/pi-foo/issues" });
    assert.equal(pkg.pi.image, "https://placehold.co/1200x630/png?text=pi-foo");

    assert.equal(await readFile(join(dir, "CHANGELOG.md"), "utf8"), "# Changelog\n");

    const constants = await readFile(join(dir, "src/constants.ts"), "utf8");
    assert.match(constants, /EXTENSION_NAME = "pi-foo"/);
    assert.match(constants, /EXTENSION_COMMAND = "foo"/);
    assert.match(constants, /TOOL_NAME = "foo_echo"/);
    assert.match(constants, /STATE_ENTRY_TYPE = "foo:state"/);

    const readme = await readFile(join(dir, "README.md"), "utf8");
    assert.match(readme, /pi install npm:@ayagmar\/pi-foo/);
    assert.match(readme, /pi install git:github\.com\/ayagmar\/pi-foo/);
    assert.doesNotMatch(readme, /npm:my-pi-extension/);

    const starter = await readFile(join(dir, "starters/tool-only.ts"), "utf8");
    assert.match(starter, /"foo_echo"/);

    // This file only makes sense in the template itself.
    await assert.rejects(access(join(dir, "test/setup.test.ts")));
  });
});

void test("setup-template re-run keeps release history and normalizes repo URLs", async () => {
  await withTemplateCopy(async (dir) => {
    const { private: _private, ...released } = await readPackage(dir);
    await writeFile(
      join(dir, "package.json"),
      `${JSON.stringify({ ...released, version: "1.2.3" }, null, 2)}\n`
    );
    const changelog = "# Changelog\n\n## 1.2.3\n\n- shipped\n";
    await writeFile(join(dir, "CHANGELOG.md"), changelog);

    const result = runSetup(dir, [
      "",
      "pi-bar",
      "",
      "",
      "",
      "",
      "https://github.com/me/pi-bar.git",
    ]);
    assert.equal(result.status, 0, result.stderr);

    const pkg = await readPackage(dir);
    assert.equal(pkg.name, "pi-bar");
    assert.equal(pkg.version, "1.2.3");
    assert.equal(pkg.private, undefined);
    assert.equal(pkg.repository.url, "git+https://github.com/me/pi-bar.git");
    assert.equal(await readFile(join(dir, "CHANGELOG.md"), "utf8"), changelog);
    await access(join(dir, "test/setup.test.ts"));
  });
});

void test("setup-template rewrites the starters that are left after unused ones are deleted", async () => {
  await withTemplateCopy(async (dir) => {
    for (const unused of ["event-only.ts", "hybrid.ts", "ui-only.ts", "command-only.ts"]) {
      await rm(join(dir, "starters", unused));
    }
    await rm(join(dir, "test/starters.test.ts"));

    const result = runSetup(dir, ["pi-baz", "pi-baz", "", "baz", "", "", ""]);
    assert.equal(result.status, 0, result.stderr);

    assert.match(await readFile(join(dir, "starters/tool-only.ts"), "utf8"), /"baz_echo"/);
    assert.match(await readFile(join(dir, "src/constants.ts"), "utf8"), /TOOL_NAME = "baz_echo"/);
  });
});

void test("setup-template re-run only rewrites the command and tool name sites", async () => {
  await withTemplateCopy(async (dir) => {
    // Command and tool named after a subcommand the starters already use.
    const first = runSetup(dir, ["pi-st", "pi-st", "", "status", "status", "", ""]);
    assert.equal(first.status, 0, first.stderr);
    const rerun = runSetup(dir, ["", "", "", "foo", "bar", "", ""]);
    assert.equal(rerun.status, 0, rerun.stderr);

    const commandOnly = await readFile(join(dir, "starters/command-only.ts"), "utf8");
    assert.match(commandOnly, /registerCommand\("foo"/);
    assert.match(commandOnly, /case "status":/);
    assert.match(commandOnly, /\["status", "enable", "disable", "mode"\]/);
    assert.match(commandOnly, /"\/foo status \| enable/);

    const hybrid = await readFile(join(dir, "starters/hybrid.ts"), "utf8");
    assert.match(hybrid, /registerCommand\("foo"/);
    assert.match(hybrid, /name: "bar"/);
    assert.match(hybrid, /Usage: \/foo toggle/);

    const tests = await readFile(join(dir, "test/starters.test.ts"), "utf8");
    assert.match(tests, /command\.handler\("status", ctx\)/);
    assert.match(tests, /commands\.get\("foo"\)/);
    assert.match(tests, /tools\.get\("bar"\)/);
    assert.doesNotMatch(tests, /commands\.get\("status"\)|tools\.get\("status"\)/);
  });
});

void test("setup-template writes Biome-formatted constants that survive a re-run", async () => {
  await withTemplateCopy(async (dir) => {
    // Quotes and `$&` used to corrupt src/constants.ts (and get lost on the next run); a long
    // value used to leave a line Biome reformats, failing `pnpm run check`.
    const quoted = `Tom's "quoted" $& \\ ext`;
    const doubleQuoted = `Say "hi" $1`;
    const long = `pi ${"very ".repeat(16)}long extension`;
    const constantsPath = join(dir, "src/constants.ts");

    for (const name of [quoted, doubleQuoted, long]) {
      const first = runSetup(dir, [name, "pi-quote", "", "quote", "", "", ""]);
      assert.equal(first.status, 0, first.stderr);
      assert.equal(await readExtensionName(constantsPath), name);
      assertBiomeFormatted(dir, "src/constants.ts");

      // A re-run offers the stored name as the default and keeps it.
      const rerun = runSetup(dir, ["", "", "", "", "", "", ""]);
      assert.equal(rerun.status, 0, rerun.stderr);
      assert.match(rerun.stdout, new RegExp(`Extension name \\[${escapeRegExp(name)}\\]`));
      assert.equal(await readExtensionName(constantsPath), name);
    }
  });
});

void test("setup-template rejects invalid package names without touching files", async () => {
  await withTemplateCopy(async (dir) => {
    const before = await readFile(join(dir, "package.json"), "utf8");

    const result = runSetup(dir, ["", "Not A Valid Name"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not a valid npm package name/);
    assert.equal(await readFile(join(dir, "package.json"), "utf8"), before);
  });
});

void test("setup-template refuses to keep the placeholder package name", async () => {
  await withTemplateCopy(async (dir) => {
    const files = ["package.json", "CHANGELOG.md", "src/constants.ts", "test/setup.test.ts"];
    const read = () => Promise.all(files.map((file) => readFile(join(dir, file), "utf8")));
    const before = await read();

    // Accepting every default, closing stdin right away, or typing the placeholder must all fail
    // before anything is written: otherwise the template becomes a publishable my-pi-extension.
    for (const answers of [["", "", "", "", "", "", ""], [], ["", "my-pi-extension"]]) {
      const result = spawnSync(process.execPath, ["scripts/setup.mjs"], {
        cwd: dir,
        input: answers.length > 0 ? `${answers.join("\n")}\n` : "",
        encoding: "utf8",
        env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) },
      });
      assert.notEqual(result.status, 0, JSON.stringify(answers));
      assert.match(result.stderr, /choose your own npm package name/);
    }

    assert.deepEqual(await read(), before);
    const pkg = await readPackage(dir);
    assert.equal(pkg.private, true);
    assert.equal(pkg.name, "my-pi-extension");
  });
});

void test("setup-template rejects tool names that LLM providers refuse", async () => {
  await withTemplateCopy(async (dir) => {
    const before = await readFile(join(dir, "src/constants.ts"), "utf8");

    for (const toolName of ["my tool", "foo.echo", "x".repeat(65)]) {
      const result = runSetup(dir, ["", "pi-tool", "", "", toolName]);
      assert.notEqual(result.status, 0, toolName);
      assert.match(result.stderr, /not a valid tool name/);
    }
    assert.equal(await readFile(join(dir, "src/constants.ts"), "utf8"), before);

    const result = runSetup(dir, ["", "pi-tool", "", "", "My-Tool_2", "", ""]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(join(dir, "src/constants.ts"), "utf8"), /TOOL_NAME = "My-Tool_2"/);
  });
});

void test("setup-template prompts right away when stdin is not a TTY but stays open", async () => {
  await withTemplateCopy(async (dir) => {
    const result = await runSetupWithOpenStdin(dir, ["pi-qux", "pi-qux", "", "qux", "", "", ""]);
    assert.ok(result.promptedBeforeInput);
    assert.equal(result.code, 0, result.stdout);
    assert.equal((await readPackage(dir)).name, "pi-qux");
    assert.match(
      await readFile(join(dir, "src/constants.ts"), "utf8"),
      /EXTENSION_COMMAND = "qux"/
    );
  });
});
