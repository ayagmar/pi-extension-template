import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Removes the template-only bootstrap skill from a freshly generated repo. The skill is never
// listed in package.json "files", so package.json needs no changes.
export function cleanupGeneratedRepo(repoDir) {
  const repoPath = resolve(repoDir);
  const agentsPath = join(repoPath, ".agents");

  rmSync(join(agentsPath, "skills"), { recursive: true, force: true });

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
