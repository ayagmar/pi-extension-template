// Test fixture, not a starter: proves the load checks catch a session_start handler that throws.
// pi does not treat handler errors as fatal; over RPC it reports them as `extension_error` lines.
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function throwingSessionStart(pi: ExtensionAPI) {
  pi.on("session_start", () => {
    throw new Error("boom");
  });
}
