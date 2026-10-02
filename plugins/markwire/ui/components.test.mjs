import { test } from "node:test";
import assert from "node:assert/strict";
import { Board } from "./board.js";
import { COMPONENT_IDS, drawComponent } from "./components.js";

function render(kind, height = 8, width = 30) {
  const board = new Board(20, 60);
  drawComponent(board, kind, 2, 2, height, width);
  return board.toText();
}

test("every advertised component draws something", () => {
  for (const kind of COMPONENT_IDS) {
    const text = render(kind);
    assert.ok(text.trim().length > 0, `${kind} produced no output`);
  }
});

test("no component throws on a minimal footprint", () => {
  for (const kind of COMPONENT_IDS) {
    assert.doesNotThrow(() => render(kind, 1, 1), `${kind} threw on 1x1`);
  }
});

test("no component writes outside the canvas", () => {
  for (const kind of COMPONENT_IDS) {
    const text = render(kind, 20, 60);
    for (const [index, line] of text.split("\n").entries()) {
      assert.ok(line.length <= 60, `${kind} line ${index} is ${line.length} wide`);
    }
    assert.ok(text.split("\n").length <= 20, `${kind} drew too many rows`);
  }
});

test("components do not overlap when stacked vertically", () => {
  for (const kind of COMPONENT_IDS) {
    const board = new Board(30, 70);
    drawComponent(board, kind, 0, 0, 5, 20);
    drawComponent(board, kind, 20, 0, 5, 20);
    const lines = board.toText().split("\n");
    for (let row = 10; row < 20; row++) {
      assert.equal(lines[row]?.trim() ?? "", "", `${kind} bled into the gap at row ${row}`);
    }
  }
});

test("button renders a bordered label", () => {
  const text = render("button", 5, 12);
  assert.match(text, /\[/);
  assert.match(text, /OK/);
  assert.match(text, /\]/);
});

test("input renders an underlined field", () => {
  assert.match(render("input"), /\[_{8,}\]/);
});

test("card renders a frame, title, and divider", () => {
  const text = render("card", 8, 24);
  assert.match(text, /┌/);
  assert.match(text, /Title/);
  assert.match(text, /├/);
});

test("table renders a header, divider, and column separators", () => {
  const text = render("table", 8, 40);
  assert.match(text, /Col A/);
  assert.match(text, /┬/);
  assert.match(text, /├/);
  assert.match(text, /┴/);
});

test("modal renders a dialog, close mark, and actions", () => {
  const text = render("modal", 10, 36);
  assert.match(text, /Dialog/);
  assert.match(text, /×/);
  assert.match(text, /Cancel/);
  assert.match(text, /OK/);
});

test("checkbox and radio render their markers", () => {
  assert.match(render("checkbox"), /\[ \]/);
  assert.match(render("checkbox"), /Checkbox/);
  assert.match(render("radio"), /\( \)/);
  assert.match(render("radio"), /Radio/);
});

test("dropdown renders a caret inside a box", () => {
  const text = render("dropdown", 5, 18);
  assert.match(text, /Select/);
  assert.match(text, /▾/);
  assert.match(text, /┌/);
});

test("toggle, tabs, and search render their labels", () => {
  assert.match(render("toggle"), /Toggle/);
  assert.match(render("tabs"), /Tab 1/);
  assert.match(render("search"), /Search/);
});

test("progress renders filled and empty segments", () => {
  const text = render("progress");
  assert.match(text, /▰/);
  assert.match(text, /▱/);
});

test("breadcrumb and pagination render navigation", () => {
  assert.match(render("breadcrumb"), />/);
  assert.match(render("pagination"), /‹/);
  assert.match(render("pagination"), /›/);
});

test("nav renders a logo, links, and an action", () => {
  const text = render("nav", 6, 44);
  assert.match(text, /Logo/);
  assert.match(text, /Link/);
  assert.match(text, /Action/);
});

test("list renders multiple bullet rows", () => {
  const lines = render("list").split("\n").filter((line) => line.includes("•"));
  assert.equal(lines.length, 3);
});

test("placeholder, hsplit, and image render frames", () => {
  for (const kind of ["placeholder", "hsplit", "image"]) {
    const text = render(kind, 8, 24);
    assert.match(text, /┌/, `${kind} has no top-left corner`);
    assert.match(text, /┘/, `${kind} has no bottom-right corner`);
  }
});

test("image places its IMG caption inside the frame", () => {
  assert.match(render("image", 8, 24), /IMG/);
});

test("framed components close on every side", () => {
  for (const kind of ["card", "table", "modal", "dropdown", "search", "placeholder", "hsplit", "image"]) {
    const text = render(kind, 10, 30);
    assert.match(text, /┌/, `${kind} missing top-left`);
    assert.match(text, /┐/, `${kind} missing top-right`);
    assert.match(text, /└/, `${kind} missing bottom-left`);
    assert.match(text, /┘/, `${kind} missing bottom-right`);
  }
});

test("table cells are padded so borders never touch labels", () => {
  const text = render("table", 10, 40);
  assert.match(text, /│ Col A /);
  assert.doesNotMatch(text, /Col A│/);
});

test("modal actions stay inside the frame", () => {
  const lines = render("modal", 10, 32).split("\n").filter((line) => line.includes("Cancel"));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\s*│.*\[ Cancel \] \[ OK \].*│\s*$/);
});

test("framed components never clip their right border", () => {
  for (const kind of ["card", "table", "modal"]) {
    for (const width of [24, 32, 48]) {
      const text = render(kind, 10, width);
      for (const line of text.split("\n")) {
        const trimmed = line.trimEnd();
        if (!trimmed.startsWith("┌") && !trimmed.startsWith("│") && !trimmed.startsWith("├") && !trimmed.startsWith("└")) continue;
        assert.ok(
          trimmed.endsWith("┐") || trimmed.endsWith("│") || trimmed.endsWith("┤") || trimmed.endsWith("┘"),
          `${kind}@${width} has an open row: ${JSON.stringify(trimmed)}`,
        );
      }
    }
  }
});
