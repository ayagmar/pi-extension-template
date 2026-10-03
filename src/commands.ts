import { EXTENSION_COMMAND } from "./constants.js";

export function buildHelpText(): string {
  return [
    `/${EXTENSION_COMMAND} status`,
    `/${EXTENSION_COMMAND} set-label <text>`,
    `/${EXTENSION_COMMAND} help`,
  ].join("\n");
}

/** Split `<name> <rest>` on the first run of any whitespace (tabs and pasted newlines too). */
export function parseSubcommand(raw: string): { name: string; rest: string } {
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(raw.trim());
  if (!match) return { name: "", rest: "" };
  return {
    name: (match[1] ?? "").toLowerCase(),
    rest: (match[2] ?? "").trim(),
  };
}
