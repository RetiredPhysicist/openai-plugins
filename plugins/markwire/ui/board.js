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
    this.#cache = null;
  }

  #cache;

  /** Drops the derived grid cache; every mutation calls this. */
  #invalidate() {
    this.#cache = null;
  }

  /**
   * Drops the derived grid after a caller mutated a shape in place.
   * The editor's inspector writes shape fields directly, which cannot be
   * intercepted, so it has to tell the board its cache is stale.
   */
  invalidate() {
    this.#invalidate();
  }

  /**
   * One derived grid shared by toText/cellAt/armsAt. Entry layout:
   * [overlayChar, hasH, hasV, up, down, left, right]. overlayChar is the
   * topmost stroke/text/cells character at this cell, or null for pure lines.
   * Building is O(rows*cols + total shape cells), turning every read O(1).
   */
  #grid() {
    if (this.#cache) return this.#cache;
    const { rows, cols } = this;
    const grid = new Array(rows * cols).fill(null);
    for (const shape of this.shapes) {
      if (shape.kind === "box") {
        const bottom = shape.row + shape.height - 1;
        const right = shape.col + shape.width - 1;
        for (let col = shape.col; col <= right; col++) {
          this.#markLine(grid, shape.row, col, true, col > shape.col, col < right);
          this.#markLine(grid, bottom, col, true, col > shape.col, col < right);
        }
        for (let row = shape.row; row <= bottom; row++) {
          this.#markLine(grid, row, shape.col, false, row > shape.row, row < bottom);
          this.#markLine(grid, row, right, false, row > shape.row, row < bottom);
        }
      } else if (shape.kind === "h") {
        for (let col = shape.col; col < shape.col + shape.length; col++) {
          this.#markLine(grid, shape.row, col, true, col > shape.col, col < shape.col + shape.length - 1);
        }
      } else if (shape.kind === "v") {
        for (let row = shape.row; row < shape.row + shape.length; row++) {
          this.#markLine(grid, row, shape.col, false, row > shape.row, row < shape.row + shape.length - 1);
        }
      } else if (shape.kind === "stroke") {
        const entry = this.#entry(grid, shape.row, shape.col);
        entry[0] = shape.char;
      } else if (shape.kind === "cells") {
        for (const cell of shape.cells) {
          const entry = this.#entry(grid, cell.row, cell.col);
          entry[0] = cell.char;
        }
      } else if (shape.kind === "text") {
        const lines = shape.text.split("\n");
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex];
          for (let charIndex = 0; charIndex < line.length; charIndex++) {
            const entry = this.#entry(grid, shape.row + lineIndex, shape.col + charIndex);
            if (entry) entry[0] = line[charIndex];
          }
        }
      }
    }
    this.#cache = grid;
    return grid;
  }

  #entry(grid, row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    const index = row * this.cols + col;
    if (!grid[index]) grid[index] = [null, false, false, false, false, false, false];
    return grid[index];
  }

  #markLine(grid, row, col, hasH, left, right) {
    const entry = this.#entry(grid, row, col);
    if (!entry) return;
    if (hasH) {
      entry[1] = true;
      if (left) entry[5] = true;
      if (right) entry[6] = true;
    } else {
      entry[2] = true;
      if (left) entry[3] = true;
      if (right) entry[4] = true;
    }
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
    this.#invalidate();
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
    const changed = this.shapes.length !== before;
    if (changed) this.#invalidate();
    return changed;
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
      this.#invalidate();
      return true;
    }
    shape.row = Math.max(0, Math.min(this.rows - 1, shape.row + dRow));
    shape.col = Math.max(0, Math.min(this.cols - 1, shape.col + dCol));
    this.#invalidate();
    return true;
  }

  /** Resizes a box-like shape by changing its width and height. */
  resize(id, width, height) {
    const shape = this.select(id);
    if (!shape) return false;
    if (shape.kind === "box") {
      shape.width = Math.max(2, Math.min(this.cols - shape.col, width));
      shape.height = Math.max(2, Math.min(this.rows - shape.row, height));
      this.#invalidate();
      return true;
    }
    if (shape.kind === "h") {
      shape.length = Math.max(1, Math.min(this.cols - shape.col, width));
      this.#invalidate();
      return true;
    }
    if (shape.kind === "v") {
      shape.length = Math.max(1, Math.min(this.rows - shape.row, height));
      this.#invalidate();
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
   * overlaps the region instead of tracking pixels. A rectangle only disappears
   * when it is fully covered; a partial overlap is broken into its four runs
   * first, which renders identically (the corners come from the run ends) and
   * lets the eraser trim one border. Labels lose the characters inside the
   * region; the row stays so the remaining text keeps its position.
   */
  erase(row, col, height, width) {
    const top = row;
    const bottom = row + height - 1;
    const left = col;
    const right = col + width - 1;
    const kept = Board.#withoutOverlap(this.shapes, top, bottom, left, right);

    this.shapes = kept;
    this.#invalidate();
  }

  /** Applies one erase rectangle to a shape list, returning what survives. */
  static #withoutOverlap(shapes, top, bottom, left, right) {
    const kept = [];

    for (const shape of shapes) {
      if (shape.kind === "cells") {
        const cells = shape.cells.filter((cell) => !(
          cell.row >= top && cell.row <= bottom && cell.col >= left && cell.col <= right
        ));
        if (cells.length > 0) kept.push({ ...shape, cells });
        continue;
      }

      if (shape.kind === "text") {
        const lines = shape.text.split("\n");
        let changed = false;
        const nextLines = lines.map((line, lineIndex) => {
          const row = shape.row + lineIndex;
          if (row < top || row > bottom) return line;
          const chars = [...line];
          for (let index = 0; index < chars.length; index++) {
            if (chars[index] === " ") continue;
            const col = shape.col + index;
            if (col < left || col > right) continue;
            // Blank the cell instead of removing it: the remaining characters
            // keep their columns, and a space paints over any line beneath.
            chars[index] = " ";
            changed = true;
          }
          return chars.join("");
        });
        if (!changed) kept.push(shape);
        else if (nextLines.some((line) => line.trim().length > 0)) {
          kept.push({ ...shape, text: nextLines.join("\n") });
        }
        continue;
      }

      if (shape.kind === "stroke") {
        if (shape.row >= top && shape.row <= bottom && shape.col >= left && shape.col <= right) continue;
        kept.push(shape);
        continue;
      }

      if (shape.kind === "box") {
        const edges = Board.#boxEdges(shape);
        const surviving = Board.#withoutOverlap(edges, top, bottom, left, right);
        // Only rebuild the rectangle when an edge was actually trimmed;
        // otherwise the original stays as one selectable/resizable shape.
        // Identity, not count: trimming one edge while splitting another keeps
        // the count at four but still changes the outline.
        const untouched = surviving.length === edges.length
          && surviving.every((run, index) => run === edges[index]);
        if (untouched) kept.push(shape);
        // Each surviving run needs its own identity: selection, layers and
        // inspector edits all key off id and the originals would collide.
        // The component role carries over so the layers panel still names it.
        else for (const run of surviving) {
          kept.push({ ...run, id: Board.createShapeId(), role: shape.role });
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
        if (start < left) kept.push({ ...shape, id: Board.createShapeId(), length: left - start });
        if (end > right) {
          kept.push({ ...shape, id: Board.createShapeId(), col: right + 1, length: end - right });
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
        if (start < top) kept.push({ ...shape, id: Board.createShapeId(), length: top - start });
        if (end > bottom) {
          kept.push({ ...shape, id: Board.createShapeId(), row: bottom + 1, length: end - bottom });
        }
      }
    }

    return kept;
  }

  /**
   * The four runs of a rectangle outline, in the same paint order the box
   * renderer uses. Corner arms come from run ends, so a split box still draws
   * ┌ ┐ └ ┘ exactly where the single box shape did.
   */
  static #boxEdges(shape) {
    const bottom = shape.row + shape.height - 1;
    const right = shape.col + shape.width - 1;
    return [
      { kind: "h", row: shape.row, col: shape.col, length: shape.width },
      { kind: "h", row: bottom, col: shape.col, length: shape.width },
      { kind: "v", row: shape.row, col: shape.col, length: shape.height },
      { kind: "v", row: shape.row, col: right, length: shape.height },
    ];
  }

  clear() {
    if (this.shapes.length === 0) return;
    this.shapes = [];
    this.#invalidate();
  }

  undo() {
    const changed = this.shapes.pop() !== undefined;
    if (changed) this.#invalidate();
    return changed;
  }

  /** Strokes covering this cell, with the arms each run reaches within its own cells. */
  cellAt(row, col) {
    const entry = this.#grid()[row * this.cols + col] ?? null;
    return {
      up: entry?.[3] ?? false,
      down: entry?.[4] ?? false,
      left: entry?.[5] ?? false,
      right: entry?.[6] ?? false,
      hasH: entry?.[1] ?? false,
      hasV: entry?.[2] ?? false,
    };
  }

  /** Arms for the final glyph, including joins where a perpendicular stroke crosses. */
  armsAt(row, col) {
    const grid = this.#grid();
    const read = (r, c) => grid[r * this.cols + c] ?? null;
    const cell = read(row, col);
    const arms = {
      up: cell?.[3] ?? false,
      down: cell?.[4] ?? false,
      left: cell?.[5] ?? false,
      right: cell?.[6] ?? false,
    };
    const hasH = cell?.[1] ?? false;
    const hasV = cell?.[2] ?? false;

    const above = row > 0 ? read(row - 1, col) : null;
    const below = row < this.rows - 1 ? read(row + 1, col) : null;
    const prior = col > 0 ? read(row, col - 1) : null;
    const next = col < this.cols - 1 ? read(row, col + 1) : null;

    if (hasH) {
      if (above?.[2]) arms.up = true;
      if (below?.[2]) arms.down = true;
    }
    if (hasV) {
      if (prior?.[1]) arms.left = true;
      if (next?.[1]) arms.right = true;
    }
    return arms;
  }

  /** Resolves one cell to its final character. */
  at(row, col) {
    if (!this.inBounds(row, col)) return " ";
    const entry = this.#grid()[row * this.cols + col];
    if (entry && entry[0] !== null) return entry[0];
    const axis = entry?.[1] ? "h" : entry?.[2] ? "v" : undefined;
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
