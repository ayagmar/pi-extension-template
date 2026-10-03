import assert from "node:assert/strict";
import test from "node:test";
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_LABEL,
  EXTENSION_COMMAND,
  EXTENSION_NAME,
  STATE_ENTRY_TYPE,
  TOOL_NAME,
} from "../src/constants.js";
import extensionTemplate from "../src/index.js";

type Handler = (event: unknown, ctx: unknown) => unknown;

interface RegisteredCommand {
  handler: (args: string, ctx: unknown) => Promise<void>;
}

interface RegisteredTool {
  name: string;
  promptSnippet?: string;
  execute: (...args: unknown[]) => Promise<{
    content: { type: string; text: string }[];
    details: unknown;
  }>;
}

interface Harness {
  pi: ExtensionAPI;
  handlers: Map<string, Handler[]>;
  commands: Map<string, RegisteredCommand>;
  tools: Map<string, RegisteredTool>;
  appended: { customType: string; data: unknown }[];
}

void test("extension registers command and tool", () => {
  const harness = createHarness();
  extensionTemplate(harness.pi);

  assert.ok(harness.commands.has(EXTENSION_COMMAND));
  assert.match(harness.tools.get(TOOL_NAME)?.promptSnippet ?? "", /echo text back/i);
  assert.ok(harness.handlers.has("session_start"));
  assert.ok(harness.handlers.has("session_tree"));
});

void test("session_start restores the latest label from the branch, skipping other entries", async () => {
  const harness = createHarness();
  extensionTemplate(harness.pi);

  // pi 1.0 branches also hold system messages, usage and context_edit entries.
  const ctx = createContext({
    branch: [
      { type: "custom", id: "1", customType: STATE_ENTRY_TYPE, data: { label: "older" } },
      { type: "message", id: "2", message: { role: "system", content: "prompt" } },
      { type: "custom", id: "3", customType: STATE_ENTRY_TYPE, data: { label: "newest" } },
      { type: "custom", id: "4", customType: "other:state", data: { label: "foreign" } },
      { type: "usage", id: "5" },
      { type: "context_edit", id: "6" },
      { type: "custom", id: "7", customType: STATE_ENTRY_TYPE, data: { label: 42 } },
    ],
  });

  await emit(harness, "session_start", { type: "session_start", reason: "startup" }, ctx);
  assert.equal(ctx.statuses.get(EXTENSION_COMMAND), `${EXTENSION_NAME}: newest`);

  await harness.commands.get(EXTENSION_COMMAND)?.handler("status", ctx);
  assert.deepEqual(ctx.notifications, ["Label: newest"]);
});

void test("session_start falls back to the default label on an empty branch", async () => {
  const harness = createHarness();
  extensionTemplate(harness.pi);

  const ctx = createContext({ branch: [] });
  await emit(harness, "session_start", { type: "session_start", reason: "new" }, ctx);

  assert.equal(ctx.statuses.get(EXTENSION_COMMAND), `${EXTENSION_NAME}: ${DEFAULT_LABEL}`);
});

void test("set-label persists state and session_tree resyncs from the branch", async () => {
  const harness = createHarness();
  extensionTemplate(harness.pi);
  const command = harness.commands.get(EXTENSION_COMMAND);

  const ctx = createContext({ branch: [] });
  await command?.handler("set-label shipping  ready", ctx);

  assert.deepEqual(harness.appended, [
    { customType: STATE_ENTRY_TYPE, data: { label: "shipping  ready" } },
  ]);
  assert.equal(ctx.statuses.get(EXTENSION_COMMAND), `${EXTENSION_NAME}: shipping  ready`);

  // Navigating the tree to a branch without the entry restores the default label.
  await emit(harness, "session_tree", { type: "session_tree" }, ctx);
  await command?.handler("status", ctx);
  assert.equal(ctx.notifications.at(-1), `Label: ${DEFAULT_LABEL}`);
});

void test("commands without a UI write to stderr, never stdout", async (t) => {
  const harness = createHarness();
  extensionTemplate(harness.pi);

  const log = t.mock.method(console, "log", () => undefined);
  const error = t.mock.method(console, "error", () => undefined);

  const ctx = createContext({ branch: [], mode: "print", hasUI: false });
  await harness.commands.get(EXTENSION_COMMAND)?.handler("status", ctx);

  assert.equal(log.mock.callCount(), 0);
  assert.deepEqual(error.mock.calls[0]?.arguments, [`Label: ${DEFAULT_LABEL}`]);
  assert.deepEqual(ctx.notifications, []);
});

void test("echo tool returns JSON-compatible details", async () => {
  const harness = createHarness();
  extensionTemplate(harness.pi);

  const result = await harness.tools.get(TOOL_NAME)?.execute("call-1", {
    message: "  hello  ",
    uppercase: true,
  });

  assert.deepEqual(result, { content: [{ type: "text", text: "HELLO" }], details: { length: 5 } });
});

function createHarness(): Harness {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, RegisteredCommand>();
  const tools = new Map<string, RegisteredTool>();
  const appended: Harness["appended"] = [];

  const pi = {
    on: (eventName: string, handler: Handler) => {
      handlers.set(eventName, [...(handlers.get(eventName) ?? []), handler]);
      return () => undefined;
    },
    registerCommand: (name: string, command: RegisteredCommand) => {
      commands.set(name, command);
    },
    registerTool: (tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    },
    appendEntry: (customType: string, data: unknown) => {
      appended.push({ customType, data });
    },
  } as unknown as ExtensionAPI;

  return { pi, handlers, commands, tools, appended };
}

async function emit(harness: Harness, eventName: string, event: unknown, ctx: unknown) {
  for (const handler of harness.handlers.get(eventName) ?? []) {
    await handler(event, ctx);
  }
}

function createContext(options: {
  branch: unknown[];
  mode?: ExtensionContext["mode"];
  hasUI?: boolean;
}) {
  const notifications: string[] = [];
  const statuses = new Map<string, string | undefined>();

  return {
    mode: options.mode ?? "tui",
    hasUI: options.hasUI ?? true,
    cwd: process.cwd(),
    isProjectTrusted: () => true,
    notifications,
    statuses,
    sessionManager: { getBranch: () => options.branch },
    ui: {
      notify: (message: string) => {
        notifications.push(message);
      },
      setStatus: (key: string, text: string | undefined) => {
        statuses.set(key, text);
      },
    },
  };
}
