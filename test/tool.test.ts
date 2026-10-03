import assert from "node:assert/strict";
import test from "node:test";
import { MAX_MESSAGE_LENGTH } from "../src/constants.js";
import { buildEchoText, sanitizeMessage } from "../src/tool.js";

void test("buildEchoText returns plain message", () => {
  assert.equal(buildEchoText({ message: "hello" }), "hello");
});

void test("buildEchoText can uppercase", () => {
  assert.equal(buildEchoText({ message: "hello", uppercase: true }), "HELLO");
});

void test("sanitizeMessage truncates long input", () => {
  const longMessage = "x".repeat(MAX_MESSAGE_LENGTH + 10);
  const sanitized = sanitizeMessage(longMessage);
  assert.equal(sanitized.length, MAX_MESSAGE_LENGTH);
  assert.match(sanitized, /…$/);
});

void test("sanitizeMessage never splits a surrogate pair", () => {
  const emoji = "😀";
  const sanitized = sanitizeMessage(emoji.repeat(MAX_MESSAGE_LENGTH + 1));

  assert.equal(Array.from(sanitized).length, MAX_MESSAGE_LENGTH);
  assert.equal(sanitized, `${emoji.repeat(MAX_MESSAGE_LENGTH - 1)}…`);
  assert.doesNotMatch(sanitized, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

void test("sanitizeMessage keeps messages at the limit unchanged", () => {
  const message = "😀".repeat(MAX_MESSAGE_LENGTH);
  assert.equal(sanitizeMessage(message), message);
});
