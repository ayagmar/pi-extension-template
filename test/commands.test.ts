import test from "node:test";
import assert from "node:assert/strict";
import { buildHelpText, parseCommandArgs } from "../src/commands.js";

void test("parseCommandArgs parses status", () => {
  assert.deepEqual(parseCommandArgs("status"), { action: "status" });
});

void test("parseCommandArgs parses set-label", () => {
  assert.deepEqual(parseCommandArgs("set-label shipping-ready"), {
    action: "set-label",
    value: "shipping-ready",
  });
});

void test("parseCommandArgs falls back to help", () => {
  assert.deepEqual(parseCommandArgs(""), { action: "help" });
  assert.deepEqual(parseCommandArgs("unknown"), { action: "help" });
  assert.deepEqual(parseCommandArgs("set-label"), { action: "help" });
});

void test("buildHelpText includes command name", () => {
  const help = buildHelpText("myext");
  assert.match(help, /\/myext status/);
  assert.match(help, /\/myext set-label <text>/);
});
