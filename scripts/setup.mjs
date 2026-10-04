import { execFileSync } from "node:child_process";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

// Answers can be piped (one per line, blank = default) for non-interactive use:
//   printf 'my-ext\n@me/pi-my-ext\n' | pnpm run setup-template

const TEMPLATE_PACKAGE_NAME = "my-pi-extension";
const TEMPLATE_REPO = "ayagmar/pi-extension-template";
const DEFAULT_OWNER = "ayagmar";
const INITIAL_VERSION = "0.0.0";
const TEMPLATE_ONLY_TEST = "test/setup.test.ts";
const NPM_NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

// A double- or single-quoted string literal (Biome switches to single quotes when that needs
// fewer escapes), optionally on the next line when the declaration is too long for one.
const STRING_LITERAL = String.raw`("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')`;
const MAX_LINE_WIDTH = 100;

const prompt = createPrompt();

try {
  const current = await readCurrentTemplateValues();

  const extensionName = await ask("Extension name", current.extensionName);
  const packageName = await ask("npm package name", current.packageName, validatePackageName);
  const description = await ask("Description", current.description);
  const command = normalizeCommand(await ask("Command name", current.command));

  const defaultToolName =
    current.toolName === `${current.command}_echo` ? `${command}_echo` : current.toolName;
  const defaultStateType =
    current.stateType === `${current.command}:state` ? `${command}:state` : current.stateType;

  const toolName = await ask("Tool name", defaultToolName);
  const stateType = await ask("State entry type", defaultStateType);
  const repo = normalizeRepo(
    await ask(
      "GitHub repository (owner/name)",
      defaultRepo(current.repo, packageName),
      validateRepo
    )
  );

  await updateConstants({ extensionName, command, toolName, stateType });
  await updatePackage({
    packageName,
    description,
    extensionName,
    repo,
    isTemplate: current.isTemplate,
  });
  await updateReadme(current, { packageName, repo });
  await updateStarterNames(current, { command, toolName });
  await updateTestNames(current, { command, toolName });

  if (current.isTemplate) {
    await writeFile("CHANGELOG.md", "# Changelog\n");
    // Template-only tests (they assert the template's private/placeholder state).
    await rm(TEMPLATE_ONLY_TEST, { force: true });
  }

  stdout.write("\nTemplate setup complete.\n");
  stdout.write("Run `pnpm run check` next.\n");
} finally {
  prompt.close();
}

function createPrompt() {
  if (stdin.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    return { interactive: true, question: (text) => rl.question(text), close: () => rl.close() };
  }

  // Not a TTY: piped answers, but also Git Bash/mintty, IDE consoles or agent shells that keep
  // stdin open. Read line by line so every prompt shows up right away; lines that arrive early
  // are buffered by the iterator, and EOF means "use the defaults" for the remaining prompts.
  const rl = createInterface({ input: stdin, crlfDelay: Number.POSITIVE_INFINITY });
  const lines = rl[Symbol.asyncIterator]();

  return {
    interactive: false,
    question: async (text) => {
      stdout.write(text);
      const { value, done } = await lines.next();
      const answer = done ? "" : value;
      stdout.write(`${answer}\n`);
      return answer;
    },
    close: () => rl.close(),
  };
}

async function ask(label, fallback, validate) {
  for (;;) {
    const value = (await prompt.question(`${label} [${fallback}]: `)).trim();
    const answer = value.length > 0 ? value : fallback;
    const error = validate?.(answer);

    if (!error) return answer;
    if (!prompt.interactive) throw new Error(`${label}: ${error}`);
    stdout.write(`  ${error}\n`);
  }
}

function validatePackageName(value) {
  return NPM_NAME_PATTERN.test(value) && value.length <= 214
    ? undefined
    : `"${value}" is not a valid npm package name (lowercase, optional @scope/)`;
}

function validateRepo(value) {
  return GITHUB_REPO_PATTERN.test(normalizeRepo(value))
    ? undefined
    : `"${value}" is not a GitHub repository (expected owner/name)`;
}

function normalizeRepo(value) {
  return value
    .trim()
    .replace(/^(?:git\+)?(?:https?:\/\/|ssh:\/\/git@|git@)?github\.com[/:]/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

function normalizeCommand(value) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  return cleaned.length > 0 ? cleaned : "myext";
}

function unscopedName(packageName) {
  return packageName.replace(/^@[^/]+\//, "");
}

function defaultRepo(currentRepo, packageName) {
  const origin = readGitOriginRepo();
  if (origin && origin !== TEMPLATE_REPO) return origin;
  if (currentRepo && currentRepo !== TEMPLATE_REPO) return currentRepo;

  const owner = currentRepo?.split("/")[0] ?? DEFAULT_OWNER;
  return `${owner}/${unscopedName(packageName)}`;
}

function readGitOriginRepo() {
  try {
    const url = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const repo = normalizeRepo(url);
    return GITHUB_REPO_PATTERN.test(repo) ? repo : undefined;
  } catch {
    return undefined;
  }
}

async function readCurrentTemplateValues() {
  const constants = await readFile("src/constants.ts", "utf8");
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  const command = readConst(constants, "EXTENSION_COMMAND", "myext");
  const repositoryUrl = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  const repo = typeof repositoryUrl === "string" ? normalizeRepo(repositoryUrl) : undefined;

  return {
    extensionName: readConst(constants, "EXTENSION_NAME", TEMPLATE_PACKAGE_NAME),
    command,
    toolName: readConst(constants, "TOOL_NAME", `${command}_echo`),
    stateType: readConst(constants, "STATE_ENTRY_TYPE", `${command}:state`),
    packageName:
      typeof pkg.name === "string" && pkg.name.trim().length > 0 ? pkg.name : TEMPLATE_PACKAGE_NAME,
    description:
      typeof pkg.description === "string" && pkg.description.trim().length > 0
        ? pkg.description
        : "Starter template for building robust Pi extensions",
    repo: repo && GITHUB_REPO_PATTERN.test(repo) ? repo : undefined,
    // The template is marked private so it can never be published. Only a first setup run
    // (still private) resets the version and changelog; re-runs keep release history intact.
    isTemplate: pkg.private === true,
  };
}

function constPattern(constName) {
  return new RegExp(`export const ${constName} =\\s*${STRING_LITERAL};`);
}

function readConst(content, constName, fallback) {
  const literal = content.match(constPattern(constName))?.[1];
  if (literal === undefined) return fallback;

  // Rewrite the literal as a JSON string (\' needs no escape, " does) and let JSON decode it.
  const body = literal
    .slice(1, -1)
    .replace(/\\.|"/g, (token) => (token === "\\'" ? "'" : token === '"' ? '\\"' : token));
  try {
    return JSON.parse(`"${body}"`);
  } catch {
    return fallback;
  }
}

async function updateConstants({ extensionName, command, toolName, stateType }) {
  const path = "src/constants.ts";
  let content = await readFile(path, "utf8");

  content = replaceConst(content, "EXTENSION_NAME", extensionName);
  content = replaceConst(content, "EXTENSION_COMMAND", command);
  content = replaceConst(content, "TOOL_NAME", toolName);
  content = replaceConst(content, "STATE_ENTRY_TYPE", stateType);

  await writeFile(path, content);
}

async function updatePackage({ packageName, description, extensionName, repo, isTemplate }) {
  const path = "package.json";
  const { private: _private, ...pkg } = JSON.parse(await readFile(path, "utf8"));

  pkg.name = packageName;
  pkg.description = description;

  if (isTemplate) {
    pkg.version = INITIAL_VERSION;
  }

  if (Array.isArray(pkg.keywords)) {
    pkg.keywords = pkg.keywords.filter((keyword) => keyword !== "template");
  }

  pkg.repository = { type: "git", url: `git+https://github.com/${repo}.git` };
  pkg.homepage = `https://github.com/${repo}#readme`;
  pkg.bugs = { url: `https://github.com/${repo}/issues` };

  if (pkg.pi?.image && typeof pkg.pi.image === "string") {
    pkg.pi.image = `https://placehold.co/1200x630/png?text=${encodeURIComponent(extensionName)}`;
  }

  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

async function updateReadme(previous, next) {
  const path = "README.md";
  let content;

  try {
    content = await readFile(path, "utf8");
  } catch {
    return;
  }

  content = content.split(`npm:${previous.packageName}`).join(`npm:${next.packageName}`);

  const previousRepo = previous.repo ?? TEMPLATE_REPO;
  content = content.split(`github.com/${previousRepo}`).join(`github.com/${next.repo}`);

  await writeFile(path, content);
}

async function updateStarterNames(previous, next) {
  // Users delete the starters they do not need, so rewrite whichever ones are left.
  const files = await readdir("starters").catch(() => []);

  for (const file of files.filter((name) => name.endsWith(".ts"))) {
    await rewriteTemplateNames(`starters/${file}`, previous, next);
  }
}

async function rewriteTemplateNames(path, previous, next) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  await writeFile(path, replaceTemplateNames(content, previous, next));
}

function replaceTemplateNames(content, previous, next) {
  const toolCandidates = Array.from(new Set([previous.toolName, "myext_echo"]));
  const commandCandidates = Array.from(new Set([previous.command, "myext"]));

  let updated = content;

  for (const tool of toolCandidates) {
    if (tool === next.toolName) continue;
    updated = updated.split(`"${tool}"`).join(`"${next.toolName}"`);
  }

  for (const command of commandCandidates) {
    if (command === next.command) continue;
    updated = updated.split(`"${command}"`).join(`"${next.command}"`);
    updated = updated.split(`/${command}`).join(`/${next.command}`);
  }

  return updated;
}

function replaceConst(content, constName, value) {
  const declaration = `export const ${constName} =`;
  const literal = toStringLiteral(value);
  const oneLine = `${declaration} ${literal};`;
  // Lay the declaration out the way Biome formats it so `pnpm run check` passes right away.
  const formatted = oneLine.length <= MAX_LINE_WIDTH ? oneLine : `${declaration}\n  ${literal};`;
  // A replacer function, so `$&`, `$1`, … in the value are inserted literally.
  return content.replace(constPattern(constName), () => formatted);
}

/** Quote like Biome: double quotes, unless the value holds more double than single quotes. */
function toStringLiteral(value) {
  const doubles = value.split('"').length - 1;
  const singles = value.split("'").length - 1;
  const quote = doubles > singles ? "'" : '"';
  const escaped = value.replace(/\\/g, "\\\\").replaceAll(quote, `\\${quote}`);
  return `${quote}${escaped}${quote}`;
}

async function updateTestNames(previous, next) {
  await rewriteTemplateNames("test/starters.test.ts", previous, next);
}
