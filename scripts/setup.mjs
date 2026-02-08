import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });

try {
  const extensionName = await ask("Extension name", "my-pi-extension");
  const packageName = await ask("npm package name", "my-pi-extension");
  const description = await ask(
    "Description",
    "Starter template for building robust Pi extensions"
  );
  const command = normalizeCommand(await ask("Command name", "myext"));
  const toolName = await ask("Tool name", `${command}_echo`);
  const stateType = await ask("State entry type", `${command}:state`);

  await updateConstants({ extensionName, command, toolName, stateType });
  await updatePackage({ packageName, description, extensionName });
  await updateStarterNames(command, toolName);

  stdout.write("\nTemplate setup complete.\n");
  stdout.write("Run `pnpm run check` next.\n");
} finally {
  rl.close();
}

async function ask(label, fallback) {
  const value = await rl.question(`${label} [${fallback}]: `);
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeCommand(value) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  return cleaned.length > 0 ? cleaned : "myext";
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

async function updatePackage({ packageName, description, extensionName }) {
  const path = "package.json";
  const pkg = JSON.parse(await readFile(path, "utf8"));

  pkg.name = packageName;
  pkg.description = description;

  if (pkg.pi?.image && typeof pkg.pi.image === "string") {
    pkg.pi.image = `https://placehold.co/1200x630/png?text=${encodeURIComponent(extensionName)}`;
  }

  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

async function updateStarterNames(command, toolName) {
  const files = [
    "starters/event-only.ts",
    "starters/tool-only.ts",
    "starters/command-only.ts",
    "starters/hybrid.ts",
  ];

  for (const path of files) {
    let content = await readFile(path, "utf8");
    content = content.replace(/"myext_echo"/g, `"${toolName}"`);
    content = content.replace(/"myext"/g, `"${command}"`);
    content = content.replace(/\/myext/g, `/${command}`);
    await writeFile(path, content);
  }
}

function replaceConst(content, constName, value) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const pattern = new RegExp(`(export const ${constName} = )"[^"]*";`);
  return content.replace(pattern, `$1"${escaped}";`);
}
