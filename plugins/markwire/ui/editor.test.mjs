import { test } from "node:test";
import assert from "node:assert/strict";
import { stripCodeFence } from "./editor.js";

test("stripCodeFence removes a three-backtick fence", () => {
  assert.equal(stripCodeFence("```\n┌─┐\n```"), "┌─┐");
});

test("stripCodeFence removes a longer fence without truncating the art", () => {
  assert.equal(stripCodeFence("````\n```\n````"), "```");
});

test("stripCodeFence leaves unfenced text untouched", () => {
  assert.equal(stripCodeFence("plain\ntext"), "plain\ntext");
});

test("stripCodeFence requires matching fence lengths", () => {
  assert.equal(stripCodeFence("````\ncontent\n```"), "````\ncontent\n```");
});
