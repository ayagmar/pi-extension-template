import { type Static, Type } from "typebox";
import { MAX_MESSAGE_LENGTH } from "./constants.js";

export const echoParameters = Type.Object({
  message: Type.String({ description: "Text to echo back" }),
  uppercase: Type.Optional(Type.Boolean({ description: "Return the message in upper case" })),
});

/** The validated tool arguments, derived from the schema so the two never drift apart. */
export type EchoInput = Static<typeof echoParameters>;

/** Cap the echoed text, counting code points so an emoji is never split into a lone surrogate. */
export function sanitizeMessage(message: string): string {
  const codePoints = Array.from(message);
  if (codePoints.length <= MAX_MESSAGE_LENGTH) {
    return message;
  }

  return `${codePoints.slice(0, MAX_MESSAGE_LENGTH - 1).join("")}…`;
}

export function buildEchoText(input: EchoInput): string {
  const message = input.message.trim();
  // Upper-case before capping: toUpperCase can grow the text ("ß" becomes "SS").
  return sanitizeMessage(input.uppercase ? message.toUpperCase() : message);
}
