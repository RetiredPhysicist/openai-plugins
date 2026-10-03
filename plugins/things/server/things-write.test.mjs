import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTodoUrl,
  addProjectUrl,
  updateTodoUrl,
  batchUpdateUrl,
  buildUrl,
  escapeAppleScript,
  normalizeWhen,
} from "./things-write.js";

test("percent-encodes a slash so it cannot truncate a title", () => {
  const url = addTodoUrl({ title: "Example 2/13" });
  assert.match(url, /Example%202%2F13/);
  assert.doesNotMatch(url, /2\/13/);
});

test("percent-encodes ampersands and question marks in values", () => {
  const url = addTodoUrl({ title: "A&B?C" });
  assert.match(url, /A%26B%3FC/);
});

test("omits empty optional parameters", () => {
  const url = addTodoUrl({ title: "Only title", notes: null, when: "" });
  assert.equal(url, "things:///add?title=Only%20title");
});

test("joins checklist items with newlines", () => {
  const url = addTodoUrl({ title: "Trip", checklist: ["passport", "charger"] });
  assert.match(url, /checklist-items=passport%0Acharger/);
});

test("accepts each supported when keyword", () => {
  for (const keyword of ["today", "tomorrow", "evening", "anytime", "someday"]) {
    assert.equal(normalizeWhen(keyword), keyword);
    assert.equal(normalizeWhen(keyword.toUpperCase()), keyword);
  }
});

test("accepts an ISO date and a reminder time", () => {
  assert.equal(normalizeWhen("2026-10-03"), "2026-10-03");
  assert.equal(normalizeWhen("2026-10-03@14:30"), "2026-10-03@14:30");
});

test("rejects free-form dates instead of passing them to Things", () => {
  assert.throws(() => normalizeWhen("next Tuesday"), /Invalid date/);
  assert.throws(() => normalizeWhen("2026-10-03@2:30PM"), /Invalid reminder time/);
});

test("requires a title", () => {
  assert.throws(() => addTodoUrl({ title: "   " }), /title is required/);
  assert.throws(() => addProjectUrl({ title: "" }), /title is required/);
});

test("builds an add-project URL with a newline-joined todo list", () => {
  const url = addProjectUrl({ title: "Launch", todos: ["draft", "ship"] });
  assert.match(url, /to-dos=draft%0Aship/);
});

test("update requires an auth token", () => {
  assert.throws(() => updateTodoUrl({ id: "x" }, null), /authentication is required/);
});

test("update carries the auth token and id", () => {
  const url = updateTodoUrl({ id: "abc", title: "New" }, "tok");
  assert.match(url, /^things:\/\/\/update\?/);
  assert.match(url, /id=abc/);
  assert.match(url, /auth-token=tok/);
});

test("update encodes a completion flag as a lowercase boolean", () => {
  const url = updateTodoUrl({ id: "abc", completed: true }, "tok");
  assert.match(url, /completed=true/);
});

test("batch update encodes JSON data and the token", () => {
  const url = batchUpdateUrl(
    [{ type: "to-do", operation: "update", id: "a", attributes: { "list-id": "p" } }],
    "tok",
  );
  assert.match(url, /^things:\/\/\/json\?data=/);
  assert.match(url, /auth-token=tok/);
  const data = decodeURIComponent(url.match(/data=([^&]+)/)[1]);
  assert.deepEqual(JSON.parse(data)[0].attributes, { "list-id": "p" });
});

test("batch update requires a token", () => {
  assert.throws(() => batchUpdateUrl([], null), /authentication is required/);
});

test("escapes double quotes and backslashes for AppleScript", () => {
  assert.equal(escapeAppleScript('He said "hi"'), 'He said \\"hi\\"');
  assert.equal(escapeAppleScript("C:\\tmp"), "C:\\\\tmp");
});

test("buildUrl skips null but keeps false", () => {
  const url = buildUrl("add", { title: "x", completed: false, notes: null });
  assert.match(url, /completed=false/);
  assert.doesNotMatch(url, /notes/);
});
