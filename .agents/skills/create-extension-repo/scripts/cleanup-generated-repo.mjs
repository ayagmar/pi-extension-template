import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function cleanupGeneratedRepo(repoDir) {
  const repoPath = resolve(repoDir);
  const repoLocalSkillsPath = join(repoPath, ".agents", "skills");
  const agentsPath = join(repoPath, ".agents");
  const packageJsonPath = join(repoPath, "package.json");

  rmSync(repoLocalSkillsPath, { recursive: true, force: true });

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  if (Array.isArray(pkg.files)) {
    pkg.files = pkg.files.filter(
      (entry) =>
        ![".agents/skills", ".agents/skills/", "./.agents/skills", "./.agents/skills/"].includes(
          entry
        )
    );
  }

  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

  try {
    if (readdirSync(agentsPath).length === 0) {
      rmSync(agentsPath, { recursive: true, force: true });
    }
  } catch {
    // ignore missing .agents directory
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const repoDir = process.argv[2];

  if (!repoDir) {
    console.error("Usage: node cleanup-generated-repo.mjs <repo-dir>");
    process.exit(2);
  }

  cleanupGeneratedRepo(repoDir);
}
