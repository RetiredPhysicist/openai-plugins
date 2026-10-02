import { test } from "node:test";
import assert from "node:assert/strict";
import { Board, GLYPH, glyphFor } from "./board.js";

test("new shapes carry a stable identity", () => {
  const board = new Board(4, 6);
  const shape = board.add({ kind: "h", row: 0, col: 0, length: 3 });
  assert.match(shape.id, /^shape-/);
  assert.equal(board.select(shape.id), shape);
});

test("boxes resize without changing their type", () => {
  const board = new Board(8, 12);
  const shape = board.add({ kind: "box", row: 1, col: 1, width: 4, height: 3 });
  board.resize(shape.id, 8, 6);
  assert.equal(shape.width, 8);
  assert.equal(shape.height, 6);
});

test("a box draws corners and edges", () => {
  const board = new Board(4, 6);
  board.box(0, 0, 3, 5);
  assert.equal(board.toText(), ["┌───┐", "│   │", "└───┘"].join("\n"));
});

test("a divider meeting a box edge makes a tee, not a cross", () => {
  const board = new Board(6, 8);
  board.box(0, 0, 6, 8);
  board.vline(1, 3, 4);
  const lines = board.toText().split("\n");
  assert.equal(lines[0], "┌──┬───┐");
  assert.equal(lines[5], "└──┴───┘");
});

test("drawing order does not change the result", () => {
  const dividerFirst = new Board(6, 8);
  dividerFirst.vline(1, 3, 4);
  dividerFirst.box(0, 0, 6, 8);

  const boxFirst = new Board(6, 8);
  boxFirst.box(0, 0, 6, 8);
  boxFirst.vline(1, 3, 4);

  assert.equal(dividerFirst.toText(), boxFirst.toText());
  assert.equal(boxFirst.toText().split("\n")[0], "┌──┬───┐");
});

test("two crossing strokes make a plus", () => {
  const board = new Board(3, 3);
  board.hline(1, 0, 3);
  board.vline(0, 1, 3);
  const lines = board.toText().split("\n");
  assert.equal(lines[1], "─┼─");
  // Trailing spaces are trimmed by default, and toText trims each row.
  assert.equal(lines[0], " │");
});

test("parallel strokes never fuse", () => {
  const board = new Board(2, 4);
  board.hline(0, 0, 4);
  board.hline(1, 0, 4);
  const lines = board.toText().split("\n");
  assert.equal(lines[0], "────");
  assert.equal(lines[1], "────");
});

test("text paints over strokes", () => {
  const board = new Board(3, 9);
  board.box(0, 0, 3, 9);
  board.text(1, 1, "Hello");
  assert.equal(board.toText().split("\n")[1], "│Hello  │");
});

test("markdown export fences the board", () => {
  const board = new Board(2, 4);
  board.box(0, 0, 2, 4);
  assert.equal(board.toMarkdown(), "```\n┌──┐\n└──┘\n```\n");
});

test("markdown export widens the fence when the art contains backticks", () => {
  const board = new Board(2, 4);
  board.text(0, 0, "```");
  assert.equal(board.toMarkdown(), "````\n```\n````\n");
});

test("an empty board exports as an empty string", () => {
  assert.equal(new Board(4, 4).toMarkdown(), "");
});

test("trailing spaces and blank rows are dropped", () => {
  const board = new Board(5, 5);
  board.text(0, 0, "x");
  assert.equal(board.toText(), "x");
});

test("undo removes the last shape", () => {
  const board = new Board(3, 3);
  board.hline(0, 0, 3);
  assert.equal(board.toText(), "───");
  assert.equal(board.undo(), true);
  assert.equal(board.toText(), "");
  assert.equal(board.undo(), false);
});

test("clear empties the board", () => {
  const board = new Board(3, 3);
  board.box(0, 0, 3, 3);
  board.clear();
  assert.equal(board.toText(), "");
});

test("a single-cell stroke still renders", () => {
  const board = new Board(3, 3);
  board.hline(1, 1, 1);
  // Leading indentation is preserved so positions stay aligned.
  assert.equal(board.toText(), ["", " ─"].join("\n"));
});

test("out of bounds reads are blank", () => {
  const board = new Board(2, 2);
  assert.equal(board.at(-1, 0), " ");
  assert.equal(board.at(99, 99), " ");
});

test("box plus divider plus shelf composes", () => {
  const board = new Board(7, 12);
  board.box(0, 0, 7, 12);
  board.vline(1, 5, 5);
  // A shelf spanning columns 1-4 meets the left edge and the divider.
  board.hline(3, 1, 4);
  assert.equal(board.toText().split("\n")[3], "├────┤     │");
});

test("shapes round-trip through serialization", () => {
  const board = new Board(4, 6);
  board.box(0, 0, 3, 5);
  board.text(1, 1, "hi");
  const restored = Board.fromShapes(4, 6, board.toShapeList());
  assert.equal(restored.toText(), board.toText());
});

test("erase splits a horizontal run into two", () => {
  const board = new Board(3, 10);
  board.hline(1, 0, 10);
  board.erase(1, 4, 1, 2);
  assert.equal(board.toText().split("\n")[1], "────  ────");
});

test("erase trims a vertical run end", () => {
  const board = new Board(6, 3);
  board.vline(0, 1, 6);
  board.erase(4, 0, 2, 3);
  const lines = board.toText().split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[3], " │");
});

test("erase removes a whole label inside the region", () => {
  const board = new Board(3, 8);
  board.text(1, 1, "hello");
  board.erase(0, 0, 3, 8);
  assert.equal(board.toText(), "");
});

test("erase leaves shapes that do not overlap", () => {
  const board = new Board(4, 6);
  board.hline(0, 0, 4);
  board.erase(2, 0, 1, 6);
  assert.equal(board.toText(), "────");
});

test("glyphFor picks the expected junctions", () => {
  assert.equal(glyphFor({ up: true, down: true, left: true, right: true }), GLYPH.cross);
  assert.equal(glyphFor({ up: true, down: true, left: false, right: true }), GLYPH.teeRight);
  assert.equal(glyphFor({ up: false, down: false, left: true, right: true }), GLYPH.horizontal);
  assert.equal(glyphFor({ up: false, down: false, left: false, right: false }, "v"), GLYPH.vertical);
  assert.equal(glyphFor({ up: false, down: false, left: false, right: false }), " ");
});

test("pasteText keeps column alignment and skips spaces", () => {
  const board = new Board(4, 8);
  const shape = board.pasteText("┌─┐\n│ │\n└─┘");
  assert.ok(shape);
  assert.equal(board.toText(), ["┌─┐", "│ │", "└─┘"].join("\n"));
});

test("pasteText respects an explicit origin", () => {
  const board = new Board(4, 8);
  board.pasteText("ab", 1, 2);
  assert.equal(board.toText(), ["", "  ab"].join("\n"));
});

test("painted strokes keep their own characters", () => {
  const board = new Board(2, 4);
  board.stroke(0, 0, "▓");
  board.stroke(0, 1, "░");
  board.stroke(0, 2, "▒");
  board.stroke(0, 3, ".");
  assert.equal(board.toText(), "▓░▒.");
});

test("pasted cell blocks move as one shape", () => {
  const board = new Board(5, 6);
  const shape = board.pasteText("ab\ncd", 1, 1);
  board.move(shape.id, 2, 1);
  assert.equal(board.toText(), ["", "", "", "  ab", "  cd"].join("\n"));
  assert.equal(board.shapes.length, 1);
});

test("non-resizable shapes reject resize without corrupting state", () => {
  const board = new Board(5, 6);
  const shape = board.pasteText("ab", 0, 0);
  assert.equal(board.resize(shape.id, 4, 4), false);
  assert.equal(board.toText(), "ab");
});

test("pasted cell blocks clamp as a whole at the canvas edge", () => {
  const board = new Board(4, 4);
  const shape = board.pasteText("ab\ncd", 0, 0);
  board.move(shape.id, 99, 99);
  assert.equal(board.toText(), ["", "", "  ab", "  cd"].join("\n"));
  const cells = board.select(shape.id).cells;
  assert.deepEqual(cells.map((cell) => [cell.row, cell.col]), [[2, 2], [2, 3], [3, 2], [3, 3]]);
});
