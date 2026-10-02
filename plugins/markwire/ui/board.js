/**
 * MarkWire board engine.
 *
 * One implementation shared by the editor UI and the server: the UI inlines this
 * file, and the server imports it. Keeping a single copy is what lets the editor
 * and the server agree on exactly how a shape becomes characters.
 *
 * The board stores geometry (boxes, strokes, labels) and derives the character
 * grid on demand. Storing geometry rather than merged glyphs keeps the output
 * independent of drawing order, so a divider drawn before or after the box edge
 * it meets produces the same picture.
 */

export const GLYPH = {
  horizontal: "─",
  vertical: "│",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  teeDown: "┬",
  teeUp: "┴",
  teeRight: "├",
  teeLeft: "┤",
  cross: "┼",
};

/** Renders an arm set. A cell with no arms falls back to a stroke on its own axis. */
export function glyphFor(arms, fallbackAxis) {
  const { up, down, left, right } = arms;
  if (up && down && left && right) return GLYPH.cross;
  if (up && down && right) return GLYPH.teeRight;
  if (up && down && left) return GLYPH.teeLeft;
  if (left && right && down) return GLYPH.teeDown;
  if (left && right && up) return GLYPH.teeUp;
  if (down && right) return GLYPH.topLeft;
  if (down && left) return GLYPH.topRight;
  if (up && right) return GLYPH.bottomLeft;
  if (up && left) return GLYPH.bottomRight;
  if (left && right) return GLYPH.horizontal;
  if (up && down) return GLYPH.vertical;
  if (fallbackAxis === "v") return GLYPH.vertical;
  if (fallbackAxis === "h") return GLYPH.horizontal;
  return " ";
}

export class Board {
  constructor(rows, cols) {
    this.rows = Math.max(1, Math.floor(rows));
    this.cols = Math.max(1, Math.floor(cols));
    this.shapes = [];
  }

  inBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  clone() {
    return Board.fromShapes(this.rows, this.cols, this.shapes);
  }

  static createShapeId() {
    Board.nextId = (Board.nextId ?? 0) + 1;
    return `shape-${Board.nextId}`;
  }

  /** Adds a shape and assigns the identity used by selection and layers. */
  add(shape) {
    const next = { id: shape.id ?? Board.createShapeId(), ...shape };
    this.shapes.push(next);
    return next;
  }

  /** Applies a human-readable role to every shape created by one component gesture. */
  labelSince(index, role) {
    for (const shape of this.shapes.slice(index)) shape.role = role;
  }

  select(id) {
    return this.shapes.find((shape) => shape.id === id);
  }

  remove(id) {
    const before = this.shapes.length;
    this.shapes = this.shapes.filter((shape) => shape.id !== id);
    return this.shapes.length !== before;
  }

  /** Moves a shape by row and column deltas. */
  move(id, dRow, dCol) {
    const shape = this.select(id);
    if (!shape) return false;
    if (shape.kind === "cells") {
      const rows = shape.cells.map((cell) => cell.row);
      const cols = shape.cells.map((cell) => cell.col);
      const minRow = Math.min(...rows);
      const maxRow = Math.max(...rows);
      const minCol = Math.min(...cols);
      const maxCol = Math.max(...cols);
      const rowDelta = Math.max(-minRow, Math.min(this.rows - 1 - maxRow, dRow));
      const colDelta = Math.max(-minCol, Math.min(this.cols - 1 - maxCol, dCol));
      shape.cells = shape.cells.map((cell) => ({
        ...cell,
        row: cell.row + rowDelta,
        col: cell.col + colDelta,
      }));
      return true;
    }
    shape.row = Math.max(0, Math.min(this.rows - 1, shape.row + dRow));
    shape.col = Math.max(0, Math.min(this.cols - 1, shape.col + dCol));
    return true;
  }

  /** Resizes a box-like shape by changing its width and height. */
  resize(id, width, height) {
    const shape = this.select(id);
    if (!shape) return false;
    if (shape.kind === "box") {
      shape.width = Math.max(2, Math.min(this.cols - shape.col, width));
      shape.height = Math.max(2, Math.min(this.rows - shape.row, height));
      return true;
    }
    if (shape.kind === "h") {
      shape.length = Math.max(1, Math.min(this.cols - shape.col, width));
      return true;
    }
    if (shape.kind === "v") {
      shape.length = Math.max(1, Math.min(this.rows - shape.row, height));
      return true;
    }
    return false;
  }

  /** Applies a steady drag gesture to one shape. */
  moveByGesture(id, dRow, dCol) {
    return this.move(id, dRow, dCol);
  }

  /** Resizes by the distance between opposite corners of a drag. */
  resizeByGesture(id, dRow, dCol) {
    const shape = this.select(id);
    if (!shape) return false;
    if (shape.kind === "box") {
      return this.resize(id, dCol, dRow);
    }
    if (shape.kind === "h") {
      return this.resize(id, dCol, shape.length);
    }
    if (shape.kind === "v") {
      return this.resize(id, shape.length, dRow);
    }
    return false;
  }

  /** Moves one shape to the end of the paint order. */
  bringToFront(id) {
    const index = this.shapes.findIndex((shape) => shape.id === id);
    if (index < 0 || index === this.shapes.length - 1) return false;
    const [shape] = this.shapes.splice(index, 1);
    this.shapes.push(shape);
    return true;
  }

  /** Moves one shape to the start of the paint order. */
  sendToBack(id) {
    const index = this.shapes.findIndex((shape) => shape.id === id);
    if (index <= 0) return false;
    const [shape] = this.shapes.splice(index, 1);
    this.shapes.unshift(shape);
    return true;
  }

  /** Reorders by one position in the paint order. */
  reorder(id, delta) {
    const index = this.shapes.findIndex((shape) => shape.id === id);
    if (index < 0) return false;
    const target = Math.max(0, Math.min(this.shapes.length - 1, index + delta));
    if (target === index) return false;
    const [shape] = this.shapes.splice(index, 1);
    this.shapes.splice(target, 0, shape);
    return true;
  }

  /** Rectangle outline. */
  box(row, col, height, width) {
    if (height < 2 || width < 2) return;
    const bottom = row + height - 1;
    const right = col + width - 1;
    this.add({ kind: "box", row, col, height, width });
  }

  hline(row, col, length) {
    if (length < 1) return;
    this.add({ kind: "h", row, col, length });
  }

  vline(row, col, length) {
    if (length < 1) return;
    this.add({ kind: "v", row, col, length });
  }

  /** Multi-line label. Labels paint over strokes. */
  text(row, col, text) {
    this.add({ kind: "text", row, col, text });
  }

  /** Adds a single character stroke, preserving painted order. */
  stroke(row, col, char) {
    if (!this.inBounds(row, col) || char === " ") return;
    this.add({ kind: "stroke", row, col, char });
  }

  /**
   * Imports a plain-text region as a single stroke shape.
   *
   * Pasting is the inverse of export: every non-space character becomes a
   * painted cell, so pasted artwork keeps its exact column alignment.
   */
  pasteText(text, row = 0, col = 0) {
    const lines = text.replace(/\t/g, "    ").replace(/\r/g, "").split("\n");
    const cells = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      for (let charIndex = 0; charIndex < lines[lineIndex].length; charIndex++) {
        const char = lines[lineIndex][charIndex];
        if (char === " ") continue;
        const targetRow = row + lineIndex;
        const targetCol = col + charIndex;
        if (!this.inBounds(targetRow, targetCol)) continue;
        cells.push({ row: targetRow, col: targetCol, char });
      }
    }
    if (cells.length === 0) return null;
    return this.add({ kind: "cells", cells });
  }

  /** Converts a rectangle tool into a dashed or plain horizontal run. */
  line(row, col, length) {
    this.hline(row, col, length);
  }

  /** Draws an arrow along the major axis. */
  arrow(row, col, dRow, dCol) {
    const vertical = Math.abs(dRow) >= Math.abs(dCol);
    if (vertical) {
      const start = Math.min(row, row + dRow);
      const length = Math.abs(dRow) + 1;
      this.vline(start, col, length);
      const tip = dRow >= 0 ? row + dRow : row;
      const prev = dRow >= 0 ? tip - 1 : tip + 1;
      if (this.inBounds(prev, col)) {
        const axis = dRow >= 0 ? "↓" : "↑";
        this.add({ kind: "stroke", row: tip, col, char: axis });
      }
      return;
    }
    const start = Math.min(col, col + dCol);
    const length = Math.abs(dCol) + 1;
    this.hline(row, start, length);
    const tip = dCol >= 0 ? col + dCol : col;
    if (this.inBounds(row, tip)) {
      this.add({ kind: "stroke", row, col: tip, char: dCol >= 0 ? "→" : "←" });
    }
  }

  /**
   * Removes strokes inside a rectangle.
   *
   * Shapes are axis-aligned runs, so erasing trims or splits each run that
   * overlaps the region instead of tracking pixels. Labels are dropped whole when
   * their first cell falls inside the region.
   */
  erase(row, col, height, width) {
    const top = row;
    const bottom = row + height - 1;
    const left = col;
    const right = col + width - 1;
    const kept = [];

    for (const shape of this.shapes) {
      if (shape.kind === "cells") {
        const cells = shape.cells.filter((cell) => !(
          cell.row >= top && cell.row <= bottom && cell.col >= left && cell.col <= right
        ));
        if (cells.length > 0) kept.push({ ...shape, cells });
        continue;
      }

      if (shape.kind === "text" || shape.kind === "stroke") {
        if (shape.row >= top && shape.row <= bottom && shape.col >= left && shape.col <= right) continue;
        kept.push(shape);
        continue;
      }

      if (shape.kind === "box") {
        const shapeBottom = shape.row + shape.height - 1;
        const shapeRight = shape.col + shape.width - 1;
        if (
          shape.row < top ||
          shape.col < left ||
          shapeBottom > bottom ||
          shapeRight > right
        ) {
          kept.push(shape);
          continue;
        }
        continue;
      }

      if (shape.kind === "h") {
        if (shape.row < top || shape.row > bottom) {
          kept.push(shape);
          continue;
        }
        const start = shape.col;
        const end = shape.col + shape.length - 1;
        if (end < left || start > right) {
          kept.push(shape);
          continue;
        }
        if (start < left) kept.push({ ...shape, length: left - start });
        if (end > right) {
          kept.push({ ...shape, col: right + 1, length: end - right });
        }
        continue;
      }

      if (shape.kind === "v") {
        if (shape.col < left || shape.col > right) {
          kept.push(shape);
          continue;
        }
        const start = shape.row;
        const end = shape.row + shape.length - 1;
        if (end < top || start > bottom) {
          kept.push(shape);
          continue;
        }
        if (start < top) kept.push({ ...shape, length: top - start });
        if (end > bottom) {
          kept.push({ ...shape, row: bottom + 1, length: end - bottom });
        }
      }
    }

    this.shapes = kept;
  }

  clear() {
    this.shapes = [];
  }

  undo() {
    return this.shapes.pop() !== undefined;
  }

  /** Strokes covering this cell, with the arms each run reaches within its own cells. */
  cellAt(row, col) {
    const cell = { up: false, down: false, left: false, right: false, hasH: false, hasV: false };
    for (const shape of this.shapes) {
      if (shape.kind === "box") {
        const bottom = shape.row + shape.height - 1;
        const right = shape.col + shape.width - 1;
        if (row === shape.row || row === bottom) {
          if (col >= shape.col && col <= right) {
            cell.hasH = true;
            if (col > shape.col) cell.left = true;
            if (col < right) cell.right = true;
          }
        }
        if (col === shape.col || col === right) {
          if (row >= shape.row && row <= bottom) {
            cell.hasV = true;
            if (row > shape.row) cell.up = true;
            if (row < bottom) cell.down = true;
          }
        }
      } else if (shape.kind === "h" && shape.row === row) {
        if (col >= shape.col && col < shape.col + shape.length) {
          cell.hasH = true;
          // A run reaches past an edge only when another cell of the same run sits there.
          if (col > shape.col) cell.left = true;
          if (col < shape.col + shape.length - 1) cell.right = true;
        }
      } else if (shape.kind === "v" && shape.col === col) {
        if (row >= shape.row && row < shape.row + shape.length) {
          cell.hasV = true;
          if (row > shape.row) cell.up = true;
          if (row < shape.row + shape.length - 1) cell.down = true;
        }
      }
    }
    return cell;
  }

  /** Arms for the final glyph, including joins where a perpendicular stroke crosses. */
  armsAt(row, col) {
    const cell = this.cellAt(row, col);
    const arms = { up: cell.up, down: cell.down, left: cell.left, right: cell.right };

    const above = this.inBounds(row - 1, col) ? this.cellAt(row - 1, col) : undefined;
    const below = this.inBounds(row + 1, col) ? this.cellAt(row + 1, col) : undefined;
    const prior = this.inBounds(row, col - 1) ? this.cellAt(row, col - 1) : undefined;
    const next = this.inBounds(row, col + 1) ? this.cellAt(row, col + 1) : undefined;

    if (cell.hasH) {
      if (above?.hasV) arms.up = true;
      if (below?.hasV) arms.down = true;
    }
    if (cell.hasV) {
      if (prior?.hasH) arms.left = true;
      if (next?.hasH) arms.right = true;
    }
    return arms;
  }

  /** Resolves one cell to its final character. */
  at(row, col) {
    if (!this.inBounds(row, col)) return " ";

    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const shape = this.shapes[i];
      if (shape.kind === "stroke") {
        if (shape.row === row && shape.col === col) return shape.char;
        continue;
      }
      if (shape.kind === "cells") {
        const cell = shape.cells.find((item) => item.row === row && item.col === col);
        if (cell) return cell.char;
        continue;
      }
      if (shape.kind !== "text") continue;
      const lines = shape.text.split("\n");
      const lineIndex = row - shape.row;
      if (lineIndex < 0 || lineIndex >= lines.length) continue;
      const line = lines[lineIndex];
      const charIndex = col - shape.col;
      if (charIndex < 0 || charIndex >= line.length) continue;
      return line[charIndex];
    }

    const cell = this.cellAt(row, col);
    const axis = cell.hasH ? "h" : cell.hasV ? "v" : undefined;
    return glyphFor(this.armsAt(row, col), axis);
  }

  /** Board as text: trailing spaces trimmed, trailing blank rows dropped. */
  toText() {
    const lines = [];
    for (let row = 0; row < this.rows; row++) {
      let line = "";
      for (let col = 0; col < this.cols; col++) line += this.at(row, col);
      lines.push(line.replace(/\s+$/, ""));
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }

  /** Board wrapped in a fenced block, ready to paste into a prompt. */
  toMarkdown() {
    const text = this.toText();
    if (text === "") return "";
    const runs = text.match(/`+/g) ?? [];
    const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
    const fence = "`".repeat(Math.max(3, longest + 1));
    return `${fence}\n${text}\n${fence}\n`;
  }

  /** Serializes the shape list so a draft can round-trip through the client. */
  toShapeList() {
    return this.shapes.map((shape, index) => ({ id: `shape-${index + 1}`, ...shape }));
  }

  /** Rebuilds a board from a previously serialized shape list. */
  static fromShapes(rows, cols, shapes) {
    const board = new Board(rows, cols);
    for (const shape of shapes ?? []) board.add(shape);
    return board;
  }
}
