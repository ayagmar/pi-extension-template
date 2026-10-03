import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
