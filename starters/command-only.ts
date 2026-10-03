import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function commandOnlyExtension(pi: ExtensionAPI) {
  let enabled = true;

  pi.registerCommand("myext", {
    description: "Toggle and inspect extension state",
    getArgumentCompletions: (prefix) => {
      const options = ["status", "enable", "disable", "mode"];
      const safePrefix = prefix.toLowerCase();
      const matches = options.filter((option) => option.startsWith(safePrefix));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      switch (args.trim().toLowerCase()) {
        case "enable":
          enabled = true;
          notify(ctx, "Extension enabled");
          return;

        case "disable":
          enabled = false;
          notify(ctx, "Extension disabled");
          return;

        case "status":
          notify(ctx, `Enabled: ${enabled}`);
          return;

        case "mode": {
          // Dialogs work in the TUI and over RPC; JSON/print modes have no UI.
          if (!ctx.hasUI) {
            notify(ctx, "Mode picker needs a UI (interactive or RPC mode)");
            return;
          }
          const nextMode = await ctx.ui.select("Choose mode", ["enabled", "disabled"]);
          if (!nextMode) return;
          enabled = nextMode === "enabled";
          notify(ctx, `Mode set to: ${nextMode}`);
          return;
        }

        default:
          notify(ctx, "/myext status | enable | disable | mode");
      }
    },
  });

  pi.registerShortcut("ctrl+shift+m", {
    description: "Show command-only starter status",
    handler: (ctx) => {
      notify(ctx, `Command-only starter active (enabled=${enabled})`);
      return Promise.resolve();
    },
  });
}

/** Notify through the UI when there is one; JSON/print modes reserve stdout, so use stderr. */
function notify(ctx: Pick<ExtensionContext, "hasUI" | "ui">, message: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, "info");
  } else {
    console.error(message);
  }
}
