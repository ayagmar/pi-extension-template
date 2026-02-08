import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function toolOnlyExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "myext_echo",
    label: "Echo",
    description: "Echo text back to the model.",
    parameters: Type.Object({
      message: Type.String({ description: "Text to echo" }),
      uppercase: Type.Optional(Type.Boolean({ description: "Uppercase output" })),
    }),
    execute(_toolCallId, params) {
      const text = params.uppercase ? params.message.toUpperCase() : params.message;
      return Promise.resolve({
        content: [{ type: "text", text }],
        details: { length: text.length },
      });
    },
  });

  pi.on("tool_result", (event) => {
    if (event.toolName !== "myext_echo") {
      return;
    }

    const joined = event.content.map((part) => (part.type === "text" ? part.text : "")).join("\n");

    if (joined.length <= 200) {
      return;
    }

    return {
      content: [{ type: "text", text: `${joined.slice(0, 199)}…` }],
      details: {
        truncated: true,
      },
    };
  });
}
