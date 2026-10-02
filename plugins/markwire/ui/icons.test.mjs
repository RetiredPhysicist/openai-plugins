import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ICON_NAMES, icon } from "./icons.js";

const editor = readFileSync(new URL("./editor.js", import.meta.url), "utf8");

/** Every tool id the sidebar registers, including the collapsed "more" rows. */
function toolIds() {
  return [...editor.matchAll(/\["([a-z]+)", "[^"]+"\],/g)].map((match) => match[1]);
}

test("every sidebar tool has an icon", () => {
  for (const id of toolIds()) {
    assert.ok(ICON_NAMES.includes(id), `no icon for tool ${id}`);
  }
});

test("every toolbar action has an icon", () => {
  for (const name of ["undo", "redo", "clear", "grid", "theme"]) {
    assert.ok(ICON_NAMES.includes(name), `no icon for action ${name}`);
  }
});

test("icons render as inline svg that inherits color", () => {
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.match(svg, /^<svg /, `${name} is not an svg`);
    assert.match(svg, /viewBox="0 0 256 256"/, `${name} has no viewBox`);
    assert.match(svg, /fill="currentColor"/, `${name} does not inherit color`);
    assert.match(svg, /<path d="M/, `${name} has no path data`);
  }
});

test("unknown icon names render nothing rather than crashing", () => {
  assert.equal(icon("does-not-exist"), "");
});

test("icons are inlined, not fetched", () => {
  for (const name of ICON_NAMES) {
    assert.doesNotMatch(icon(name), /https?:|url\(/, `${name} references a remote asset`);
  }
});
