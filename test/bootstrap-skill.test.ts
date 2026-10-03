// Template-only: covers the .agents/skills/create-extension-repo helper with a fake `gh`.
// cleanup-generated-repo.mjs deletes this file together with the skill in generated repos.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, ".agents/skills/create-extension-repo/scripts/create-from-template.sh");

// Records its arguments; `repo create <target> …` makes an empty clone holding a bootstrap skill.
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo create" ]]; then
  dir="\${3##*/}"
  mkdir -p "$dir/.agents/skills/create-extension-repo"
  git -C "$dir" init -q
fi
`;

for (const origin of [
  "git@github.com:me/pi-tpl.git",
  "https://github.com/me/pi-tpl.git",
  "https://github.com/me/pi-tpl",
  "ssh://git@github.com/me/pi-tpl.git",
]) {
  void test(`create-from-template uses ${origin} as the template and removes the bootstrap skill`, {
    skip: !existsSync(script) || process.platform === "win32",
  }, async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-template-skill-"));
    try {
      const bin = join(dir, "bin");
      const log = join(dir, "gh.log");
      await mkdir(bin);
      await writeFile(join(bin, "gh"), FAKE_GH);
      await chmod(join(bin, "gh"), 0o755);
      spawnSync("git", ["init", "-q"], { cwd: dir });
      spawnSync("git", ["remote", "add", "origin", origin], { cwd: dir });

      const result = spawnSync("bash", [script, "pi-new", "--private"], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, GH_LOG: log, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        await readFile(log, "utf8"),
        /^repo create pi-new --private --template me\/pi-tpl --clone$/m
      );
      assert.equal(existsSync(join(dir, "pi-new/.agents")), false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
