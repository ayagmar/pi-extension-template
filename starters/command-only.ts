import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function commandOnlyExtension(pi: ExtensionAPI) {
  let enabled = true;

  pi.registerCommand("myext", {
    description: "Toggle and inspect extension state",
    getArgumentCompletions: (prefix) => {
      const options = ["status", "enable", "disable", "mode", "help"];
      const safePrefix = prefix.toLowerCase();
      const matches = options.filter((option) => option.startsWith(safePrefix));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const subcommand = args.trim().toLowerCase();

      if (subcommand === "enable") {
        enabled = true;
        notify(ctx, "Extension enabled");
        return;
      }

      if (subcommand === "disable") {
        enabled = false;
        notify(ctx, "Extension disabled");
        return;
      }

      if (subcommand === "status") {
        notify(ctx, `Enabled: ${enabled}`);
        return;
      }

      if (subcommand === "mode") {
        if (!ctx.hasUI) {
          notify(ctx, "Mode picker is only available in interactive mode");
          return;
        }

        const nextMode = await ctx.ui.select("Choose mode", ["enabled", "disabled"]);
        if (!nextMode) {
          return;
        }

        enabled = nextMode === "enabled";
        notify(ctx, `Mode set to: ${nextMode}`);
        return;
      }

      notify(ctx, "/myext status | enable | disable | mode");
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

function notify(
  ctx: { hasUI: boolean; ui: { notify: (message: string, level: "info") => void } },
  message: string
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, "info");
    return;
  }

  console.log(message);
}
