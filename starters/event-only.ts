import {
  type ExtensionAPI,
  type ExtensionContext,
  isBashToolResult,
  isPowerShellToolResult,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "myext";
// `rm -rf` / `sudo rm` for bash, `Remove-Item … -Recurse` for PowerShell.
const DANGEROUS_COMMAND = /rm -rf|sudo rm|\bRemove-Item\b.*-Recurse/i;
const SECRET = /API_KEY=\S+/g;

export default function eventOnlyExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) {
      return;
    }
    ctx.ui.setStatus(STATUS_KEY, "event-only extension loaded");
  });

  // Guard both shell tools: pi 1.0 can run `powershell` instead of (or next to) `bash`.
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event) && !isToolCallEventType("powershell", event)) {
      return;
    }

    const command = event.input.command;
    if (!DANGEROUS_COMMAND.test(command)) {
      return;
    }

    // Dialogs work in the TUI and over RPC (ctx.hasUI); JSON/print modes cannot ask.
    if (!ctx.hasUI) {
      return { block: true, reason: "Blocked by starter safety policy" };
    }

    const approved = await ctx.ui.confirm("Dangerous command", `Allow:\n${command}`);
    if (!approved) {
      return { block: true, reason: "Rejected by user" };
    }

    return;
  });

  pi.on("tool_result", (event) => {
    if (!isBashToolResult(event) && !isPowerShellToolResult(event)) {
      return;
    }

    const content = event.content.map((part) =>
      part.type === "text" ? { ...part, text: redact(part.text) } : part
    );
    const structuredContent = redactJson(event.structuredContent);
    const unchanged =
      JSON.stringify([content, structuredContent]) ===
      JSON.stringify([event.content, event.structuredContent]);
    if (unchanged) {
      return;
    }

    // Replacing `content` drops the shell's structuredContent (what codemode scripts receive)
    // unless it is returned too, so hand back a redacted copy of it.
    return structuredContent === undefined ? { content } : { content, structuredContent };
  });

  pi.registerShortcut("ctrl+shift+m", {
    description: "Show event-only starter status",
    handler: (ctx) => {
      notify(ctx, "Event-only starter active");
      return Promise.resolve();
    },
  });
}

function redact(text: string): string {
  return text.replace(SECRET, "API_KEY=***");
}

/** Redact every string inside a JSON value (the shell tools return `{ output, exit_code, … }`). */
function redactJson<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => redactJson(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactJson(item)])
    ) as T;
  }
  return value;
}

/** Notify through the UI when there is one; JSON/print modes reserve stdout, so use stderr. */
function notify(ctx: Pick<ExtensionContext, "hasUI" | "ui">, message: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, "info");
  } else {
    console.error(message);
  }
}
