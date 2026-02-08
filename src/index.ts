import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_LABEL,
  EXTENSION_COMMAND,
  EXTENSION_NAME,
  STATE_ENTRY_TYPE,
  TOOL_NAME,
} from "./constants.js";
import { buildHelpText, parseCommandArgs } from "./commands.js";
import { buildEchoText } from "./tool.js";
import type { ExtensionState } from "./types.js";

export default function extensionTemplate(pi: ExtensionAPI) {
  let state: ExtensionState = { label: DEFAULT_LABEL };

  pi.on("session_start", (_event, ctx) => {
    state = restoreFromContext(ctx);
    if (ctx.hasUI) {
      ctx.ui.setStatus(EXTENSION_COMMAND, `${EXTENSION_NAME}: ${state.label}`);
    }
  });

  pi.on("session_tree", (_event, ctx) => {
    state = restoreFromContext(ctx);
    if (ctx.hasUI) {
      ctx.ui.setStatus(EXTENSION_COMMAND, `${EXTENSION_NAME}: ${state.label}`);
    }
  });

  pi.on("session_fork", (_event, ctx) => {
    state = restoreFromContext(ctx);
    if (ctx.hasUI) {
      ctx.ui.setStatus(EXTENSION_COMMAND, `${EXTENSION_NAME}: ${state.label}`);
    }
  });

  pi.registerCommand(EXTENSION_COMMAND, {
    description: "Starter command for your extension",
    getArgumentCompletions: (prefix) => {
      const options = ["status", "set-label", "help"];
      const safePrefix = prefix.toLowerCase();
      const matches = options.filter((option) => option.startsWith(safePrefix));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: (args, ctx) => {
      const command = parseCommandArgs(args);

      if (command.action === "help") {
        emitInfo(ctx, buildHelpText(EXTENSION_COMMAND));
        return Promise.resolve();
      }

      if (command.action === "status") {
        emitInfo(ctx, `Label: ${state.label}`);
        return Promise.resolve();
      }

      state = { label: command.value };
      pi.appendEntry(STATE_ENTRY_TYPE, state);
      if (ctx.hasUI) {
        ctx.ui.setStatus(EXTENSION_COMMAND, `${EXTENSION_NAME}: ${state.label}`);
      }
      emitInfo(ctx, `Label updated to: ${state.label}`);
      return Promise.resolve();
    },
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "Echo",
    description: "Echo text back to the model. Safe default tool for template projects.",
    parameters: Type.Object({
      message: Type.String({ description: "Text to echo back" }),
      uppercase: Type.Optional(Type.Boolean({ description: "Return the message in upper case" })),
    }),
    execute(_toolCallId, params) {
      const text = buildEchoText(params);
      return Promise.resolve({
        content: [{ type: "text", text }],
        details: {
          length: text.length,
        },
      });
    },
  });
}

function emitInfo(
  ctx: { hasUI: boolean; ui: { notify: (message: string, level: "info") => void } },
  message: string
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, "info");
    return;
  }
  console.log(message);
}

function restoreFromContext(ctx: Pick<ExtensionContext, "sessionManager">): ExtensionState {
  return restoreState(ctx.sessionManager.getEntries()) ?? { label: DEFAULT_LABEL };
}

function restoreState(
  entries: { type?: string; customType?: string; data?: unknown }[]
): ExtensionState | undefined {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type !== "custom") {
      continue;
    }
    if (entry.customType !== STATE_ENTRY_TYPE) {
      continue;
    }
    if (isExtensionState(entry.data)) {
      return entry.data;
    }
  }
  return undefined;
}

function isExtensionState(value: unknown): value is ExtensionState {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { label?: unknown }).label === "string"
  );
}
