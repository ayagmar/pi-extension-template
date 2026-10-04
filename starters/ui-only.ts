import {
  type ExtensionAPI,
  type ExtensionContext,
  keyText,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { type Component, type KeybindingsManager, truncateToWidth } from "@earendil-works/pi-tui";

const STATUS_KEY = "myext";
// A configurable keybinding id (escape and ctrl+c by default) instead of a hard-coded key.
const CLOSE_KEYBINDING = "tui.select.cancel";

export default function uiOnlyExtension(pi: ExtensionAPI) {
  let turnCount = 0;

  // Status text and string-array widgets work in the TUI and over RPC (ctx.hasUI).
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(STATUS_KEY, "Ready");

    // Widget: a line above (or below) the editor
    ctx.ui.setWidget("myext-hint", ["Tip: use /myext to open the dashboard"]);
  });

  pi.on("turn_start", (_event, ctx) => {
    turnCount++;
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(STATUS_KEY, `Turn ${turnCount}…`);
  });

  pi.on("turn_end", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(STATUS_KEY, `Turn ${turnCount} ✓`);
  });

  // Command that opens a custom UI component via ctx.ui.custom().
  // custom() replaces the editor with your component until done() is called.
  pi.registerCommand("myext", {
    description: "Open a small dashboard",
    handler: async (_args, ctx) => {
      // custom() needs the terminal UI. ctx.hasUI is also true over RPC, where custom()
      // resolves immediately without showing anything, so check ctx.mode instead.
      if (ctx.mode !== "tui") {
        notify(ctx, `Turns: ${turnCount}`);
        return;
      }

      // ctx.ui.custom<T> resolves with the value passed to done(value).
      await ctx.ui.custom<void>((_tui, theme, keybindings, done) =>
        createDashboard(theme, keybindings, () => turnCount, done)
      );
    },
  });

  // Shortcut to quickly check turn count
  pi.registerShortcut("ctrl+shift+m", {
    description: "Show turn count",
    handler: (ctx) => {
      notify(ctx, `Turns: ${turnCount}`);
      return Promise.resolve();
    },
  });
}

/**
 * A component is any object with render(width), invalidate() and optionally handleInput().
 * Every rendered line must fit `width` (pi throws on wider lines), and themed strings are built
 * at render time so a light/dark theme switch never leaves stale colors behind.
 */
function createDashboard(
  theme: Theme,
  keybindings: KeybindingsManager,
  getTurns: () => number,
  done: () => void
): Component {
  return {
    render(width: number) {
      // keyText formats the keys bound to the id the way pi's own hints do (e.g. "escape/ctrl+c").
      const closeKeys = keyText(CLOSE_KEYBINDING);
      return [
        "",
        theme.fg("accent", theme.bold("  Extension Dashboard")),
        "",
        `  Turns completed: ${theme.fg("success", String(getTurns()))}`,
        "",
        theme.fg("dim", `  Press ${closeKeys} to close`),
        "",
      ].map((line) => truncateToWidth(line, width));
    },
    invalidate() {
      // nothing cached — every render rebuilds its lines
    },
    handleInput(data: string) {
      if (keybindings.matches(data, CLOSE_KEYBINDING)) done();
    },
  };
}

/** Notify through the UI when there is one; JSON/print modes reserve stdout, so use stderr. */
function notify(ctx: Pick<ExtensionContext, "hasUI" | "ui">, message: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, "info");
  } else {
    console.error(message);
  }
}
