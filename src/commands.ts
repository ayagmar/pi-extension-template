import type { ParsedCommand } from "./types.js";

export function parseCommandArgs(rawArgs: string): ParsedCommand {
  const input = rawArgs.trim();
  if (input.length === 0 || input === "help") {
    return { action: "help" };
  }

  if (input === "status") {
    return { action: "status" };
  }

  if (input.startsWith("set-label")) {
    const value = input.slice("set-label".length).trim();
    if (!value) {
      return { action: "help" };
    }
    return { action: "set-label", value };
  }

  return { action: "help" };
}

export function buildHelpText(commandName: string): string {
  return [
    `/${commandName} status`,
    `/${commandName} set-label <text>`,
    `/${commandName} help`,
  ].join("\n");
}
