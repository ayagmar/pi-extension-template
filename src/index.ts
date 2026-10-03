import {
  type ExtensionAPI,
  type ExtensionContext,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { buildHelpText, parseSubcommand } from "./commands.js";
import {
  DEFAULT_LABEL,
  EXTENSION_COMMAND,
  EXTENSION_NAME,
  STATE_ENTRY_TYPE,
  TOOL_NAME,
} from "./constants.js";
import { buildEchoText, echoParameters } from "./tool.js";
import { type ExtensionState } from "./types.js";

export default function extensionTemplate(pi: ExtensionAPI) {
  let state: ExtensionState = { label: DEFAULT_LABEL };

  function syncState(ctx: Pick<ExtensionContext, "sessionManager" | "hasUI" | "ui">): void {
    state = restoreFromContext(ctx);
    if (ctx.hasUI) {
      ctx.ui.setStatus(EXTENSION_COMMAND, `${EXTENSION_NAME}: ${state.label}`);
    }
  }

  pi.on("session_start", (_event, ctx) => syncState(ctx));
  pi.on("session_tree", (_event, ctx) => syncState(ctx));

  pi.registerCommand(EXTENSION_COMMAND, {
    description: "Starter command for your extension",
    getArgumentCompletions: (prefix) => {
      const options = ["status", "set-label", "help"];
      const safePrefix = prefix.toLowerCase();
      const matches = options.filter((option) => option.startsWith(safePrefix));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: (args, ctx): Promise<void> => {
      const { name, rest } = parseSubcommand(args);

      switch (name) {
        case "status":
          notify(ctx, `Label: ${state.label}`);
          return Promise.resolve();

        case "set-label": {
          if (!rest) {
            notify(ctx, buildHelpText());
            return Promise.resolve();
          }
          state = { label: rest };
          pi.appendEntry(STATE_ENTRY_TYPE, state);
          if (ctx.hasUI) {
            ctx.ui.setStatus(EXTENSION_COMMAND, `${EXTENSION_NAME}: ${state.label}`);
          }
          notify(ctx, `Label updated to: ${state.label}`);
          return Promise.resolve();
        }

        default:
          notify(ctx, buildHelpText());
          return Promise.resolve();
      }
    },
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "Echo",
    description: "Echo text back to the model. Safe default tool for template projects.",
    promptSnippet: "Echo text back to the user, optionally uppercased.",
    parameters: echoParameters,
    execute(_toolCallId, params) {
      const text = buildEchoText(params);
      return Promise.resolve({
        content: [{ type: "text", text }],
        details: { length: text.length },
      });
    },
  });
}

/**
 * Notify through the UI when there is one (interactive TUI or an RPC client). JSON and print
 * modes have no UI and pi reserves stdout for their protocol output, so fall back to stderr.
 */
function notify(ctx: Pick<ExtensionContext, "hasUI" | "ui">, message: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, "info");
  } else {
    console.error(message);
  }
}

function restoreFromContext(ctx: Pick<ExtensionContext, "sessionManager">): ExtensionState {
  return restoreState(ctx.sessionManager.getBranch()) ?? { label: DEFAULT_LABEL };
}

/** Latest state entry on the current branch; other entry types (messages, usage, …) are skipped. */
function restoreState(entries: readonly SessionEntry[]): ExtensionState | undefined {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE) continue;
    if (isExtensionState(entry.data)) return entry.data;
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
