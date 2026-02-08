import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function hybridExtension(pi: ExtensionAPI) {
  let active = true;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus("myext", "hybrid starter loaded");
    }
  });

  pi.registerCommand("myext", {
    description: "Show starter status or toggle active mode",
    handler: async (args, ctx) => {
      const subcommand = args.trim().toLowerCase();

      if (subcommand === "toggle") {
        active = !active;
        notify(ctx, `Hybrid active: ${active}`);
        return;
      }

      if (subcommand === "reset") {
        if (!ctx.hasUI) {
          active = true;
          notify(ctx, "Hybrid state reset");
          return;
        }

        const ok = await ctx.ui.confirm("Reset state", "Set active mode back to true?");
        if (!ok) {
          return;
        }

        active = true;
        notify(ctx, "Hybrid state reset");
        return;
      }

      notify(ctx, "Usage: /myext toggle | reset");
    },
  });

  pi.registerTool({
    name: "myext_echo",
    label: "Echo",
    description: "Echo text back to the model.",
    parameters: Type.Object({
      message: Type.String(),
    }),
    execute(_toolCallId, params) {
      const suffix = active ? "" : " (extension inactive)";
      return Promise.resolve({
        content: [{ type: "text", text: `${params.message}${suffix}` }],
        details: { active },
      });
    },
  });

  pi.registerShortcut("ctrl+shift+m", {
    description: "Show hybrid starter status",
    handler: (ctx) => {
      notify(ctx, `Hybrid starter active=${active}`);
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
