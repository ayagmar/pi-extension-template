import { StringEnum } from "@earendil-works/pi-ai";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const MAX_RESULT_CHARS = 200;

/** Tool result details must stay plain JSON (pi 1.0 types them as JsonValue). */
interface EchoDetails {
  length: number;
  style: string;
  truncated?: boolean;
}

export default function toolOnlyExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "myext_echo",
    label: "Echo",
    description: "Echo text back to the model.",
    promptSnippet: "Echo text back, optionally uppercased or formatted.",
    parameters: Type.Object({
      message: Type.String({ description: "Text to echo" }),
      uppercase: Type.Optional(Type.Boolean({ description: "Uppercase output" })),
      // Use StringEnum for string enums — required for Google compatibility.
      // Type.Union / Type.Literal won't work with Google's API.
      style: Type.Optional(
        StringEnum(["plain", "quoted", "bracketed"] as const, {
          description: "Output style",
        })
      ),
    }),

    execute(_toolCallId, params) {
      let text = params.uppercase ? params.message.toUpperCase() : params.message;

      if (params.style === "quoted") {
        text = `"${text}"`;
      } else if (params.style === "bracketed") {
        text = `[${text}]`;
      }

      const details: EchoDetails = { length: text.length, style: params.style ?? "plain" };
      return Promise.resolve({ content: [{ type: "text", text }], details });
    },

    // Custom rendering — controls how the tool appears in the TUI.
    // Return a Text component with (0, 0) padding; the outer Box handles padding.
    renderCall(args, theme) {
      let line = theme.fg("toolTitle", theme.bold("Echo "));
      line += theme.fg("muted", args.message ?? "");
      if (args.uppercase) {
        line += theme.fg("dim", " (uppercase)");
      }
      if (args.style && args.style !== "plain") {
        line += theme.fg("dim", ` [${args.style}]`);
      }
      return new Text(line, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
      let line = theme.fg("success", "✓ ") + text;

      if (expanded && result.details) {
        const { length, style, truncated } = result.details;
        line += `\n${theme.fg("dim", `  length=${length} style=${style}`)}`;
        if (truncated) line += theme.fg("warning", " (truncated)");
      }

      return new Text(line, 0, 0);
    },
  });

  // Post-process results before the model sees them. Keep large outputs small: they cost context
  // and can trigger compaction mid-run.
  pi.on("tool_result", (event) => {
    if (event.toolName !== "myext_echo") {
      return;
    }

    const joined = event.content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
    // Count code points, not UTF-16 units, so an emoji is never split in half.
    const codePoints = Array.from(joined);
    if (codePoints.length <= MAX_RESULT_CHARS) {
      return;
    }

    // A returned `details` replaces the original, so spread it to keep what renderResult reads.
    const details: EchoDetails = { ...(event.details as EchoDetails), truncated: true };
    return {
      content: [{ type: "text", text: `${codePoints.slice(0, MAX_RESULT_CHARS - 1).join("")}…` }],
      details,
    };
  });
}
