import assert from "node:assert/strict";
import test from "node:test";
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager, TUI_KEYBINDINGS, visibleWidth } from "@earendil-works/pi-tui";
import commandOnly from "../starters/command-only.js";
import eventOnly from "../starters/event-only.js";
import hybrid from "../starters/hybrid.js";
import toolOnly from "../starters/tool-only.js";
import uiOnly from "../starters/ui-only.js";

type Handler = (event: unknown, ctx: unknown) => unknown;

interface RegisteredCommand {
  handler: (args: string, ctx: unknown) => Promise<void>;
}

interface RenderedComponent {
  render: (width: number) => string[];
  handleInput?: (data: string) => void;
}

interface RegisteredTool {
  name: string;
  promptSnippet?: string;
  execute: (...args: unknown[]) => Promise<unknown>;
  renderResult?: (
    result: unknown,
    options: { expanded: boolean; isPartial: boolean },
    theme: unknown,
    context: unknown
  ) => RenderedComponent;
}

interface RegisteredShortcut {
  handler: (ctx: unknown) => Promise<void>;
}

interface Harness {
  pi: ExtensionAPI;
  eventHandlers: Map<string, Handler[]>;
  commands: Map<string, RegisteredCommand>;
  tools: Map<string, RegisteredTool>;
  shortcuts: Map<string, RegisteredShortcut>;
}

type CustomFactory = (
  tui: unknown,
  theme: unknown,
  keybindings: KeybindingsManager,
  done: (result: unknown) => void
) => RenderedComponent;

// A theme double that returns text unstyled, so assertions can read plain strings.
const plainTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

void test("event-only starter blocks dangerous bash and powershell commands without a UI", async () => {
  const harness = createHarness();
  eventOnly(harness.pi);
  const toolCall = handler(harness, "tool_call");
  const ctx = createContext({ mode: "print", hasUI: false });

  assert.deepEqual(
    await toolCall({ toolName: "bash", input: { command: "rm -rf /tmp/demo" } }, ctx),
    { block: true, reason: "Blocked by starter safety policy" }
  );
  assert.deepEqual(
    await toolCall(
      { toolName: "powershell", input: { command: "Remove-Item C:\\demo -Recurse -Force" } },
      ctx
    ),
    { block: true, reason: "Blocked by starter safety policy" }
  );
  assert.equal(await toolCall({ toolName: "bash", input: { command: "ls -la" } }, ctx), undefined);
  assert.equal(
    await toolCall({ toolName: "write", input: { path: "rm -rf", content: "" } }, ctx),
    undefined
  );
});

void test("event-only starter asks for confirmation when a UI (TUI or RPC) is available", async () => {
  const harness = createHarness();
  eventOnly(harness.pi);
  const toolCall = handler(harness, "tool_call");
  const event = { toolName: "bash", input: { command: "sudo rm /etc/demo" } };

  const rejected = createContext({ mode: "rpc", confirmValue: false });
  assert.deepEqual(await toolCall(event, rejected), { block: true, reason: "Rejected by user" });
  assert.equal(rejected.confirmations.length, 1);

  const approved = createContext({ mode: "tui", confirmValue: true });
  assert.equal(await toolCall(event, approved), undefined);
});

void test("event-only starter redacts content and structuredContent of shell results", () => {
  const harness = createHarness();
  eventOnly(harness.pi);
  const toolResult = handler(harness, "tool_result");
  const ctx = createContext({ mode: "print", hasUI: false });
  const image = { type: "image", data: "AAAA", mimeType: "image/png" };

  const redacted = toolResult(
    {
      toolName: "bash",
      input: { command: "env" },
      content: [{ type: "text", text: "API_KEY=supersecret\nHOME=/root" }, image],
      structuredContent: {
        output: "API_KEY=supersecret\nHOME=/root",
        truncated: false,
        exit_code: 0,
      },
      details: undefined,
      isError: false,
    },
    ctx
  );

  assert.deepEqual(redacted, {
    content: [{ type: "text", text: "API_KEY=***\nHOME=/root" }, image],
    structuredContent: { output: "API_KEY=***\nHOME=/root", truncated: false, exit_code: 0 },
  });

  // The secret can sit only in the (larger) structured output, e.g. when content was truncated.
  const structuredOnly = toolResult(
    {
      toolName: "powershell",
      input: { command: "Get-ChildItem env:" },
      content: [{ type: "text", text: "...tail" }],
      structuredContent: { output: "API_KEY=abc\n...tail", truncated: false, exit_code: 0 },
      details: undefined,
      isError: false,
    },
    ctx
  ) as { structuredContent: { output: string } };
  assert.equal(structuredOnly.structuredContent.output, "API_KEY=***\n...tail");

  const clean = {
    toolName: "bash",
    input: { command: "ls" },
    content: [{ type: "text", text: "README.md" }],
    details: undefined,
    isError: false,
  };
  assert.equal(toolResult(clean, ctx), undefined);
  assert.equal(
    toolResult({ ...clean, toolName: "read", content: [{ type: "text", text: "API_KEY=x" }] }, ctx),
    undefined
  );
});

void test("tool-only starter echoes and truncates long results without losing details", async () => {
  const harness = createHarness();
  toolOnly(harness.pi);

  const tool = harness.tools.get("myext_echo");
  const toolResult = handler(harness, "tool_result");
  assert.ok(tool);
  assert.match(tool.promptSnippet ?? "", /echo text back/i);

  const result = (await tool.execute("call-1", { message: "hello", uppercase: true })) as {
    content: { type: string; text: string }[];
    details: unknown;
  };
  assert.equal(result.content[0]?.text, "HELLO");
  assert.deepEqual(result.details, { length: 5, style: "plain" });

  const longText = "😀".repeat(300);
  const truncated = toolResult(
    {
      toolName: "myext_echo",
      input: {},
      content: [{ type: "text", text: longText }],
      details: { length: 600, style: "quoted" },
      isError: false,
    },
    createContext({})
  ) as { content: { type: string; text: string }[]; details: unknown };

  assert.deepEqual(truncated.details, { length: 600, style: "quoted", truncated: true });
  const text = truncated.content[0]?.text ?? "";
  assert.equal(Array.from(text).length, 200);
  assert.ok(text.endsWith("😀…"));

  const expanded = tool.renderResult?.(
    truncated,
    { expanded: true, isPartial: false },
    { ...plainTheme, fg: (_color: string, value: string) => value },
    {}
  );
  const rendered = expanded?.render(200).join("\n") ?? "";
  assert.match(rendered, /length=600 style=quoted/);
  assert.match(rendered, /\(truncated\)/);
  assert.doesNotMatch(rendered, /undefined/);

  assert.equal(
    toolResult(
      {
        toolName: "myext_echo",
        input: {},
        content: [{ type: "text", text: "short" }],
        details: { length: 5, style: "plain" },
        isError: false,
      },
      createContext({})
    ),
    undefined
  );
});

void test("command-only starter command updates status and supports UI mode picker", async () => {
  const harness = createHarness();
  commandOnly(harness.pi);

  const command = harness.commands.get("myext");
  assert.ok(command);

  const ctx = createContext({ selectValue: "enabled" });
  await command.handler("disable", ctx);
  await command.handler("status", ctx);
  await command.handler("mode", ctx);
  await command.handler("status", ctx);

  assert.ok(ctx.notifications.some((line) => line.includes("Extension disabled")));
  assert.ok(ctx.notifications.some((line) => line.includes("Enabled: false")));
  assert.ok(ctx.notifications.some((line) => line.includes("Mode set to: enabled")));
  assert.ok(ctx.notifications.some((line) => line.includes("Enabled: true")));
});

void test("command-only starter writes to stderr, not stdout, without a UI", async (t) => {
  const harness = createHarness();
  commandOnly(harness.pi);
  const log = t.mock.method(console, "log", () => undefined);
  const error = t.mock.method(console, "error", () => undefined);

  await harness.commands.get("myext")?.handler("mode", createContext({ hasUI: false }));

  assert.equal(log.mock.callCount(), 0);
  assert.match(String(error.mock.calls[0]?.arguments[0]), /needs a UI/);
});

void test("hybrid starter registers command/tool/shortcut and command affects tool output", async () => {
  const harness = createHarness();
  hybrid(harness.pi);

  const command = harness.commands.get("myext");
  const tool = harness.tools.get("myext_echo");
  const shortcut = harness.shortcuts.get("ctrl+shift+m");

  assert.ok(command);
  assert.ok(tool);
  assert.ok(shortcut);
  assert.match(tool.promptSnippet ?? "", /echo text back/i);

  const ctx = createContext({});
  await command.handler("toggle", ctx);
  const result = (await tool.execute("call-2", { message: "hello" })) as {
    content: { type: string; text: string }[];
  };

  assert.match(result.content[0]?.text ?? "", /extension inactive/);

  await shortcut.handler(ctx);
  assert.ok(ctx.notifications.some((line) => line.includes("Hybrid starter active=false")));
});

void test("ui-only starter sets status and widget and counts turns in every mode", async () => {
  const harness = createHarness();
  uiOnly(harness.pi);

  const ctx = createContext({});
  await handler(harness, "session_start")({ type: "session_start", reason: "startup" }, ctx);
  assert.equal(ctx.statuses.get("myext"), "Ready");
  assert.ok(ctx.widgets.has("myext-hint"));

  const printCtx = createContext({ mode: "print", hasUI: false });
  await handler(harness, "turn_start")({ type: "turn_start" }, printCtx);
  await handler(harness, "turn_start")({ type: "turn_start" }, ctx);
  await handler(harness, "turn_end")({ type: "turn_end" }, ctx);
  assert.equal(ctx.statuses.get("myext"), "Turn 2 ✓");
  assert.ok(harness.shortcuts.has("ctrl+shift+m"));
});

void test("ui-only starter falls back to a notification outside the TUI (RPC has no custom UI)", async () => {
  const harness = createHarness();
  uiOnly(harness.pi);

  const ctx = createContext({ mode: "rpc" });
  await harness.commands.get("myext")?.handler("", ctx);

  assert.equal(ctx.customFactories.length, 0);
  assert.deepEqual(ctx.notifications, ["Turns: 0"]);
});

void test("ui-only dashboard fits narrow terminals and closes on the cancel keybinding", async () => {
  const harness = createHarness();
  uiOnly(harness.pi);

  const ctx = createContext({ mode: "tui" });
  await harness.commands.get("myext")?.handler("", ctx);

  const factory = ctx.customFactories[0];
  assert.ok(factory);
  let closed = 0;
  const keybindings = new KeybindingsManager(TUI_KEYBINDINGS);
  const component = factory({}, plainTheme, keybindings, () => {
    closed += 1;
  });

  for (const width of [8, 20, 80]) {
    for (const line of component.render(width)) {
      assert.ok(visibleWidth(line) <= width, `line wider than ${width}: ${JSON.stringify(line)}`);
    }
  }
  assert.match(component.render(80).join("\n"), /Press escape\/ctrl\+c to close/);

  component.handleInput?.("x");
  assert.equal(closed, 0);
  component.handleInput?.("\x1b");
  assert.equal(closed, 1);
  component.handleInput?.("\x03");
  assert.equal(closed, 2);
});

function handler(harness: Harness, eventName: string): Handler {
  const registered = harness.eventHandlers.get(eventName)?.[0];
  assert.ok(registered, `no ${eventName} handler registered`);
  return registered;
}

function createHarness(): Harness {
  const eventHandlers = new Map<string, Handler[]>();
  const commands = new Map<string, RegisteredCommand>();
  const tools = new Map<string, RegisteredTool>();
  const shortcuts = new Map<string, RegisteredShortcut>();

  const pi = {
    on: (eventName: string, handler: Handler) => {
      eventHandlers.set(eventName, [...(eventHandlers.get(eventName) ?? []), handler]);
      return () => undefined;
    },
    registerCommand: (name: string, command: RegisteredCommand) => {
      commands.set(name, command);
    },
    registerTool: (tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    },
    registerShortcut: (name: string, shortcut: RegisteredShortcut) => {
      shortcuts.set(name, shortcut);
    },
  } as unknown as ExtensionAPI;

  return { pi, eventHandlers, commands, tools, shortcuts };
}

function createContext(options: {
  mode?: ExtensionContext["mode"];
  hasUI?: boolean;
  selectValue?: string;
  confirmValue?: boolean;
}) {
  const notifications: string[] = [];
  const confirmations: string[] = [];
  const statuses = new Map<string, string | undefined>();
  const widgets = new Map<string, unknown>();
  const customFactories: CustomFactory[] = [];

  return {
    // ctx.hasUI is true in the TUI and over RPC; ctx.mode tells them apart.
    mode: options.mode ?? "tui",
    hasUI: options.hasUI ?? true,
    cwd: process.cwd(),
    isProjectTrusted: () => true,
    notifications,
    confirmations,
    statuses,
    widgets,
    customFactories,
    ui: {
      notify: (message: string) => {
        notifications.push(message);
      },
      confirm: (title: string) => {
        confirmations.push(title);
        return Promise.resolve(options.confirmValue ?? false);
      },
      select: () => Promise.resolve(options.selectValue),
      setStatus: (key: string, text: string | undefined) => {
        statuses.set(key, text);
      },
      setWidget: (key: string, content: unknown) => {
        widgets.set(key, content);
      },
      custom: (factory: CustomFactory) => {
        customFactories.push(factory);
        return Promise.resolve(undefined);
      },
    },
  };
}
