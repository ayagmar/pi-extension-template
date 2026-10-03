import assert from "node:assert/strict";
import test from "node:test";
import { buildHelpText, parseSubcommand } from "../src/commands.js";
import { EXTENSION_COMMAND } from "../src/constants.js";

void test("parseSubcommand splits name and rest", () => {
  assert.deepEqual(parseSubcommand("set-label shipping-ready"), {
    name: "set-label",
    rest: "shipping-ready",
  });
});

void test("parseSubcommand handles single word", () => {
  assert.deepEqual(parseSubcommand("status"), { name: "status", rest: "" });
});

void test("parseSubcommand handles empty input", () => {
  assert.deepEqual(parseSubcommand(""), { name: "", rest: "" });
  assert.deepEqual(parseSubcommand("  "), { name: "", rest: "" });
});

void test("parseSubcommand lowercases name", () => {
  assert.deepEqual(parseSubcommand("STATUS"), { name: "status", rest: "" });
  assert.deepEqual(parseSubcommand("Set-Label Hello"), { name: "set-label", rest: "Hello" });
});

void test("parseSubcommand splits on any whitespace and keeps the rest intact", () => {
  assert.deepEqual(parseSubcommand("set-label\tfoo"), { name: "set-label", rest: "foo" });
  assert.deepEqual(parseSubcommand("set-label\n  multi\nline  "), {
    name: "set-label",
    rest: "multi\nline",
  });
  assert.deepEqual(parseSubcommand("set-label   a  b"), { name: "set-label", rest: "a  b" });
});

void test("buildHelpText includes command name", () => {
  const help = buildHelpText();
  assert.match(help, new RegExp(`/${EXTENSION_COMMAND} status`));
  assert.match(help, new RegExp(`/${EXTENSION_COMMAND} set-label <text>`));
});
