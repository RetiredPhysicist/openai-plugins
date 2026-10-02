/**
 * MarkWire editor shell.
 *
 * The editor owns only interaction state. All characters come from the shared
 * Board engine so the tool result, the canvas, and Markdown export cannot drift.
 */

import { drawComponent } from "./components.js";
import { icon } from "./icons.js";

const GROUPS = [
  {
    title: "Basics",
    tools: [
      ["select", "Select"],
      ["text", "Text"],
      ["box", "Box"],
      ["line", "Line"],
      ["arrow", "Arrow"],
    ],
  },
  {
    title: "UI Elements",
    tools: [
      ["button", "Button"],
      ["input", "Input"],
      ["card", "Card"],
      ["table", "Table"],
      ["modal", "Modal"],
    ],
    more: [
      ["checkbox", "Checkbox"],
      ["radio", "Radio"],
      ["dropdown", "Dropdown"],
      ["toggle", "Toggle"],
      ["tabs", "Tabs"],
      ["search", "Search"],
      ["progress", "Progress"],
      ["breadcrumb", "Breadcrumb"],
      ["pagination", "Pagination"],
      ["nav", "Nav Bar"],
      ["list", "List"],
      ["placeholder", "Placeholder"],
      ["hsplit", "HSplit"],
      ["image", "Image"],
    ],
  },
  {
    title: "Draw",
    tools: [
      ["pencil", "Pencil"],
      ["eraser", "Eraser"],
    ],
    more: [
      ["brush", "Brush"],
      ["spray", "Spray"],
      ["shade", "Shade"],
      ["fill", "Fill"],
      ["smudge", "Smudge"],
      ["scatter", "Scatter"],
    ],
  },
];

const SIZES = [
  [60, 40, "Mobile"],
  [40, 20, "Small"],
  [80, 40, "Medium"],
  [120, 60, "Large"],
  [160, 40, "Wide"],
  [80, 80, "Tall"],
];

const PAINT_TOOLS = new Set(["pencil", "brush", "spray", "shade", "fill", "smudge", "scatter", "eraser"]);

export function mountMarkWire(root, options) {
  const { Board, rows, cols, shapes = [] } = options;
  let board = Board.fromShapes(rows, cols, shapes);
  let activeTool = "select";
  let dragStart = null;
  let dragPreview = null;
  let selectDrag = null;
  let selectedId = null;
  let pendingTextCell = null;
  let editingTextId = null;
  let lastLayerSignature = "";
  const preferenceKey = "markwire.preferences";
  const preferences = readPreferences();
  let gridLines = preferences.gridLines ?? true;
  let theme = preferences.theme ?? "light";
  let eraserSize = preferences.eraserSize ?? 1;
  let undoStack = [];
  let redoStack = [];

  root.innerHTML = `
    <div class="mw-app">
      <aside class="mw-side" id="mw-tools"></aside>
      <main class="mw-center">
        <div class="mw-toolbar">
          <button data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon("undo")}</button>
          <button data-act="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon("redo")}</button>
          <button data-act="clear" title="Clear Canvas" aria-label="Clear canvas">${icon("clear")}</button>
          <button data-act="grid" title="Toggle grid lines" aria-label="Toggle grid" aria-pressed="${gridLines}">${icon("grid")}</button>
          <button data-act="theme" title="Dark mode" aria-label="Toggle theme">${icon("theme")}</button>
          <label class="mw-eraser-size" hidden>
            <span class="mw-icon" aria-hidden="true">${icon("eraser")}</span>
            <input type="range" min="1" max="9" step="1" value="${eraserSize}"
              aria-label="Eraser size">
            <output>${eraserSize}</output>
          </label>
          <button class="mw-primary" data-act="copy">Copy Markdown</button>
        </div>
        <div class="mw-canvas">
          <div class="mw-grid-wrap">
            <div class="mw-grid" role="grid" aria-label="ASCII wireframe canvas"></div>
            <div class="mw-eraser-preview" hidden></div>
          </div>
        </div>
        <div class="mw-statusbar">
          <span class="mw-status">Ready</span>
          <span class="mw-grow"></span>
          <span class="mw-cursor">Ln 1, Col 1</span>
          <select class="mw-size-select" aria-label="Canvas size"></select>
        </div>
      </main>
      <aside class="mw-inspector">
        <section class="mw-section">
          <h3>Layers</h3>
          <div class="mw-layers"></div>
        </section>
        <section class="mw-section">
          <h3>Inspect</h3>
          <div class="mw-inspect"></div>
        </section>
      </aside>
      <nav class="mw-mobile-tools" aria-label="Tools"></nav>
      <input class="mw-text-input" placeholder="Label text" aria-label="Label text" hidden>
      <textarea class="mw-output" readonly aria-label="Markdown output" hidden></textarea>
    </div>`;

  const toolsEl = root.querySelector("#mw-tools");
  const mobileEl = root.querySelector(".mw-mobile-tools");
  const gridEl = root.querySelector(".mw-grid");
  const statusEl = root.querySelector(".mw-status");
  const cursorEl = root.querySelector(".mw-cursor");
  const layersEl = root.querySelector(".mw-layers");
  const inspectEl = root.querySelector(".mw-inspect");
  const sizeEl = root.querySelector(".mw-size-select");
  const textInputEl = root.querySelector(".mw-text-input");
  const outputEl = root.querySelector(".mw-output");
  const eraserSizeEl = root.querySelector(".mw-eraser-size");
  const eraserRangeEl = root.querySelector(".mw-eraser-size input");
  const eraserOutputEl = root.querySelector(".mw-eraser-size output");
  const eraserPreviewEl = root.querySelector(".mw-eraser-preview");
  const gridWrapEl = root.querySelector(".mw-grid-wrap");
  gridEl.classList.toggle("is-gridless", !gridLines);
  applyTheme(theme);

  for (const group of GROUPS) {
    const section = document.createElement("section");
    section.className = "mw-group";
    section.innerHTML = `<h2>${group.title}</h2>`;
    for (const tool of group.tools) section.append(toolButton(tool));
    if (group.more?.length) {
      const more = document.createElement("button");
      more.className = "mw-more";
      more.type = "button";
      more.textContent = "more ▾";
      const secondary = document.createElement("div");
      secondary.className = "mw-secondary";
      for (const tool of group.more) secondary.append(toolButton(tool));
      more.addEventListener("click", () => {
        const open = secondary.classList.toggle("is-open");
        more.textContent = open ? "more ▴" : "more ▾";
      });
      section.append(more, secondary);
    }
    toolsEl.append(section);
  }

  const mobileTools = GROUPS.flatMap((group) => [
    ...group.tools,
    ...(group.more ?? []),
  ]);
  for (const tool of mobileTools) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tool = tool[0];
    button.innerHTML = `<span class="mw-icon">${icon(tool[0])}</span><span>${tool[1]}</span>`;
    button.setAttribute("aria-label", tool[1]);
    button.addEventListener("click", () => setTool(tool[0]));
    mobileEl.append(button);
  }

  for (const [colsValue, rowsValue, label] of SIZES) {
    const option = document.createElement("option");
    option.value = `${rowsValue}x${colsValue}`;
    option.textContent = `${label} (${colsValue}×${rowsValue})`;
    option.selected = rowsValue === board.rows && colsValue === board.cols;
    sizeEl.append(option);
  }

  function toolButton([id, label]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mw-tool";
    button.dataset.tool = id;
    button.innerHTML = `<span class="mw-icon">${icon(id)}</span><span>${label}</span>`;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => setTool(id));
    return button;
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function readPreferences() {
    try {
      return JSON.parse(root.ownerDocument.defaultView?.localStorage?.getItem(preferenceKey) ?? "{}");
    } catch {
      return {};
    }
  }

  function savePreferences() {
    try {
      root.ownerDocument.defaultView?.localStorage?.setItem(
        preferenceKey,
        JSON.stringify({ theme, gridLines, eraserSize }),
      );
    } catch {}
  }

  function snapshot() {
    return Board.fromShapes(board.rows, board.cols, board.shapes);
  }

  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    syncHistoryButtons();
  }

  function restore(next) {
    board = next;
    selectedId = null;
    render();
  }

  function undo() {
    const previous = undoStack.pop();
    if (!previous) return false;
    redoStack.push(snapshot());
    restore(previous);
    syncHistoryButtons();
    return true;
  }

  function redo() {
    const next = redoStack.pop();
    if (!next) return false;
    undoStack.push(snapshot());
    restore(next);
    syncHistoryButtons();
    return true;
  }

  function syncHistoryButtons() {
    const undoButton = root.querySelector("[data-act=undo]");
    const redoButton = root.querySelector("[data-act=redo]");
    if (undoButton) undoButton.disabled = undoStack.length === 0;
    if (redoButton) redoButton.disabled = redoStack.length === 0;
  }

  function setTool(tool) {
    activeTool = tool;
    dragStart = null;
    dragPreview = null;
    selectDrag = null;
    eraserSizeEl.hidden = tool !== "eraser";
    eraserPreviewEl.hidden = tool !== "eraser";
    for (const button of root.querySelectorAll("[data-tool]")) {
      button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
    }
    setStatus(`${tool} tool`);
    render();
  }

  eraserRangeEl.addEventListener("input", () => {
    eraserSize = Number(eraserRangeEl.value);
    eraserOutputEl.textContent = String(eraserSize);
    savePreferences();
  });

  function currentBoard() {
    if (!dragPreview) return board;
    const preview = snapshot();
    applyGesture(preview, dragPreview, true);
    return preview;
  }

  function applyGesture(target, kind, isPreview = false) {
    if (!dragStart) return;
    const start = dragStart;
    const end = start.end;
    const top = Math.min(start.row, end.row);
    const left = Math.min(start.col, end.col);
    const height = Math.abs(end.row - start.row) + 1;
    const width = Math.abs(end.col - start.col) + 1;

    switch (kind) {
      case "box": target.box(top, left, height, width); break;
      case "line":
        if (Math.abs(end.row - start.row) >= Math.abs(end.col - start.col)) {
          target.vline(top, start.col, height);
        } else {
          target.hline(start.row, left, width);
        }
        break;
      case "arrow": target.arrow(start.row, start.col, end.row - start.row, end.col - start.col); break;
      case "pencil": target.stroke(start.row, start.col, "█"); break;
      case "eraser": target.erase(top, left, height, width); break;
      default:
        if (!isPreview) component(target, kind, top, left, height, width);
    }
  }

  /** Paints every cell between two pointer samples so fast strokes stay connected. */
  function paintLine(target, kind, row, col, endRow, endCol) {
    let currentRow = row;
    let currentCol = col;
    const dRow = Math.abs(endRow - row);
    const dCol = Math.abs(endCol - col);
    const stepRow = row < endRow ? 1 : -1;
    const stepCol = col < endCol ? 1 : -1;
    let error = dCol - dRow;
    for (;;) {
      paintCell(target, kind, currentRow, currentCol);
      if (currentRow === endRow && currentCol === endCol) break;
      const doubled = error * 2;
      if (doubled > -dRow) {
        error -= dRow;
        currentCol += stepCol;
      }
      if (doubled < dCol) {
        error += dCol;
        currentRow += stepRow;
      }
    }
  }

  /** Applies one tool's character at a cell. */
  function paintCell(target, kind, row, col) {
    if (kind === "eraser") {
      const offset = Math.floor((eraserSize - 1) / 2);
      target.erase(row - offset, col - offset, eraserSize, eraserSize);
      return;
    }
    const char = {
      pencil: "█",
      brush: "▓",
      spray: "░",
      shade: "▒",
      fill: "█",
      smudge: "▒",
      scatter: ".",
    }[kind] ?? "█";
    target.stroke(row, col, char);
  }

  function component(target, kind, top, left, height, width) {
    const start = target.shapes.length;
    const role = kind[0].toUpperCase() + kind.slice(1);
    drawComponent(target, kind, top, left, height, width);
    target.labelSince(start, role);
  }

  function render(dirty) {
    renderCells(dirty);
    const layerSignature = JSON.stringify({
      selectedId,
      shapes: board.shapes.map((shape) => [shape.id, shape.role, shape.row, shape.col, shape.width, shape.height, shape.length, shape.text]),
    });
    if (layerSignature !== lastLayerSignature) {
      lastLayerSignature = layerSignature;
      renderLayers();
      renderInspector();
    }
    syncSizeSelect();
  }

  /** Keeps the canvas-size control in step with the board after undo or tool results. */
  function syncSizeSelect() {
    const value = `${board.rows}x${board.cols}`;
    for (const option of [...sizeEl.options]) {
      if (option.dataset.custom === "true") option.remove();
    }
    if (![...sizeEl.options].some((option) => option.value === value)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = `Custom (${board.cols}×${board.rows})`;
      option.dataset.custom = "true";
      sizeEl.append(option);
    }
    sizeEl.value = value;
  }

  function renderCells(dirty) {
    const view = currentBoard();
    const text = view.toText().split("\n");
    const selected = selectedId ? view.select(selectedId) : null;
    const expected = board.rows * board.cols;
    if (gridEl.childElementCount !== expected) {
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < expected; index++) {
        const cell = document.createElement("div");
        cell.className = "mw-cell";
        fragment.append(cell);
      }
      gridEl.replaceChildren(fragment);
    }
    gridEl.style.gridTemplateColumns = `repeat(${board.cols}, var(--mw-cell))`;
    const startRow = dirty ? Math.max(0, Math.min(dirty.top, dirty.bottom)) : 0;
    const endRow = dirty ? Math.min(board.rows - 1, Math.max(dirty.top, dirty.bottom)) : board.rows - 1;
    const startCol = dirty ? Math.max(0, Math.min(dirty.left, dirty.right)) : 0;
    const endCol = dirty ? Math.min(board.cols - 1, Math.max(dirty.left, dirty.right)) : board.cols - 1;
    for (let row = startRow; row <= endRow; row++) {
      const line = text[row] ?? "";
      for (let col = startCol; col <= endCol; col++) {
        const node = gridEl.children[row * board.cols + col];
        const char = line[col] ?? " ";
        if (node.textContent !== char) node.textContent = char;
        const isSelected = Boolean(selected && shapeContains(selected, row, col));
        if (node.classList.contains("is-selected") !== isSelected) {
          node.classList.toggle("is-selected", isSelected);
        }
      }
    }
  }

  function shapeContains(shape, row, col) {
    if (shape.kind === "cells") {
      return shape.cells.some((cell) => cell.row === row && cell.col === col);
    }
    if (shape.kind === "box") {
      return row >= shape.row && row < shape.row + shape.height && col >= shape.col && col < shape.col + shape.width;
    }
    if (shape.kind === "h") return row === shape.row && col >= shape.col && col < shape.col + shape.length;
    if (shape.kind === "v") return col === shape.col && row >= shape.row && row < shape.row + shape.length;
    if (shape.kind === "text") {
      const lines = shape.text.split("\n");
      const lineIndex = row - shape.row;
      if (lineIndex < 0 || lineIndex >= lines.length) return false;
      return col >= shape.col && col < shape.col + lines[lineIndex].length;
    }
    return shape.row === row && shape.col === col;
  }

  function shapeBottom(shape) {
    if (shape.kind === "cells") return Math.max(...shape.cells.map((cell) => cell.row));
    if (shape.kind === "box") return shape.row + shape.height - 1;
    if (shape.kind === "v") return shape.row + shape.length - 1;
    if (shape.kind === "text") return shape.row + shape.text.split("\n").length - 1;
    return shape.row;
  }

  function shapeRight(shape) {
    if (shape.kind === "cells") return Math.max(...shape.cells.map((cell) => cell.col));
    if (shape.kind === "box") return shape.col + shape.width - 1;
    if (shape.kind === "h") return shape.col + shape.length - 1;
    if (shape.kind === "text") {
      const lines = shape.text.split("\n");
      return shape.col + Math.max(...lines.map((line) => line.length)) - 1;
    }
    return shape.col;
  }

  function renderLayers() {
    if (board.shapes.length === 0) {
      layersEl.innerHTML = `<div class="mw-empty">Draw something to see layers.</div>`;
      return;
    }
    layersEl.innerHTML = board.shapes
      .map((shape, index) => `<button class="mw-layer" type="button" data-layer="${index}" aria-selected="${shape.id === selectedId}"><span>${index + 1}. ${escapeHtml(shape.role ?? shape.kind)}</span></button>`)
      .join("");
  }

  function renderInspector() {
    const shape = selectedId ? board.select(selectedId) : null;
    if (!shape) {
      inspectEl.innerHTML = `<div class="mw-empty">Select a layer to edit its properties.</div>`;
      return;
    }
    const fields = [
      ["Role", "role", shape.role ?? shape.kind],
      ["Row", "row", shape.kind === "cells" ? Math.min(...shape.cells.map((cell) => cell.row)) : shape.row],
      ["Col", "col", shape.kind === "cells" ? Math.min(...shape.cells.map((cell) => cell.col)) : shape.col],
    ];
    if (shape.kind === "box") fields.push(["Width", "width", shape.width], ["Height", "height", shape.height]);
    if (shape.kind === "h") fields.push(["Length", "length", shape.length]);
    if (shape.kind === "v") fields.push(["Length", "length", shape.length]);
    if (shape.kind === "text") fields.push(["Text", "text", shape.text]);
    inspectEl.innerHTML = fields
      .map(([label, key, value]) => `<div class="mw-field"><label>${label}<input data-prop="${key}" value="${escapeAttr(value)}"></label></div>`)
      .join("");
  }

  function applyProperty(key, raw) {
    const shape = selectedId ? board.select(selectedId) : null;
    if (!shape) return;
    const textKeys = new Set(["text", "role"]);
    const numeric = !textKeys.has(key);
    let value = numeric ? Number.parseInt(raw, 10) : raw;
    if (numeric && !Number.isFinite(value)) return;
    if (numeric) {
      const max = key === "row" ? board.rows - 1
        : key === "col" ? board.cols - 1
        : key === "height" ? board.rows - shape.row
        : board.cols - shape.col;
      value = clamp(value, key === "height" || key === "width" || key === "length" ? 1 : 0, max);
    }
    if (shape.kind === "cells" && (key === "row" || key === "col")) {
      const current = key === "row"
        ? Math.min(...shape.cells.map((cell) => cell.row))
        : Math.min(...shape.cells.map((cell) => cell.col));
      if (value === current) return;
      pushUndo();
      board.move(shape.id, key === "row" ? value - current : 0, key === "col" ? value - current : 0);
      render();
      return;
    }
    if (shape[key] === value) return;
    pushUndo();
    shape[key] = value;
    render();
  }

  function toCell(event) {
    const rect = gridEl.getBoundingClientRect();
    const cellWidth = rect.width / board.cols;
    const cellHeight = rect.height / board.rows;
    return {
      row: clamp(Math.floor((event.clientY - rect.top) / cellHeight), 0, board.rows - 1),
      col: clamp(Math.floor((event.clientX - rect.left) / cellWidth), 0, board.cols - 1),
    };
  }

  gridEl.addEventListener("pointerdown", (event) => {
    const cell = toCell(event);
    cursorEl.textContent = `Ln ${cell.row + 1}, Col ${cell.col + 1}`;
    if (activeTool === "select") {
      const hit = [...board.shapes].reverse().find((shape) => shapeContains(shape, cell.row, cell.col));
      selectedId = hit?.id ?? null;
      if (selectedId) {
        const selected = board.select(selectedId);
        const resizable = selected && ["box", "h", "v"].includes(selected.kind);
        const corner = resizable && cell.row === shapeBottom(selected) && cell.col === shapeRight(selected);
        selectDrag = { id: selectedId, start: cell, mode: corner ? "resize" : "move", changed: false };
        gridEl.setPointerCapture(event.pointerId);
      }
      render();
      return;
    }
    if (activeTool === "text") {
      pendingTextCell = cell;
      textInputEl.hidden = false;
      textInputEl.focus();
      textInputEl.select();
      setStatus("Type a label, then press Enter");
      return;
    }
    dragStart = { ...cell, end: cell, changed: false };
    dragPreview = activeTool;
    gridEl.setPointerCapture(event.pointerId);
    if (PAINT_TOOLS.has(activeTool)) {
      pushUndo();
      dragStart.changed = true;
      paintCell(board, activeTool, cell.row, cell.col);
    }
    render();
  });

  gridEl.addEventListener("pointermove", (event) => {
    const cell = toCell(event);
    cursorEl.textContent = `Ln ${cell.row + 1}, Col ${cell.col + 1}`;
    if (activeTool === "eraser") updateEraserPreview(cell);
    if (selectDrag) {
      const dRow = cell.row - selectDrag.start.row;
      const dCol = cell.col - selectDrag.start.col;
      if ((dRow || dCol) && !selectDrag.changed) {
        pushUndo();
        selectDrag.changed = true;
      }
      if (selectDrag.mode === "resize") board.resizeByGesture(selectDrag.id, dRow, dCol);
      else board.moveByGesture(selectDrag.id, dRow, dCol);
      selectDrag.start = cell;
      render();
      return;
    }
    if (!dragStart) return;
    if (cell.row !== dragStart.row || cell.col !== dragStart.col) {
      if (!dragStart.changed) {
        pushUndo();
        dragStart.changed = true;
      }
    }
    dragStart.end = cell;
    if (PAINT_TOOLS.has(activeTool)) {
      paintLine(board, activeTool, dragStart.row, dragStart.col, cell.row, cell.col);
      const dirty = {
        top: Math.min(dragStart.row, cell.row) - 1,
        bottom: Math.max(dragStart.row, cell.row) + 1,
        left: Math.min(dragStart.col, cell.col) - 1,
        right: Math.max(dragStart.col, cell.col) + 1,
      };
      dragStart.row = cell.row;
      dragStart.col = cell.col;
      render(dirty);
      return;
    }
    render();
  });

  gridEl.addEventListener("pointerleave", () => {
    eraserPreviewEl.hidden = true;
  });

  /** Draws the square eraser footprint under the pointer. */
  function updateEraserPreview(cell) {
    const cellWidth = gridEl.getBoundingClientRect().width / board.cols;
    const cellHeight = gridEl.getBoundingClientRect().height / board.rows;
    const offset = Math.floor((eraserSize - 1) / 2);
    const top = clamp(cell.row - offset, 0, board.rows - 1);
    const left = clamp(cell.col - offset, 0, board.cols - 1);
    const height = Math.min(eraserSize, board.rows - top);
    const width = Math.min(eraserSize, board.cols - left);
    eraserPreviewEl.hidden = false;
    eraserPreviewEl.style.left = `${gridEl.offsetLeft + left * cellWidth}px`;
    eraserPreviewEl.style.top = `${gridEl.offsetTop + top * cellHeight}px`;
    eraserPreviewEl.style.width = `${width * cellWidth}px`;
    eraserPreviewEl.style.height = `${height * cellHeight}px`;
  }

  gridEl.addEventListener("pointerup", (event) => {
    if (selectDrag) {
      selectDrag = null;
      render();
      return;
    }
    if (!dragStart) return;
    const cell = toCell(event);
    if (cell.row !== dragStart.row || cell.col !== dragStart.col) {
      if (!dragStart.changed) {
        pushUndo();
        dragStart.changed = true;
      }
    }
    dragStart.end = cell;
    const before = board.shapes.length;
    if (!dragStart.changed) {
      dragStart = null;
      dragPreview = null;
      render();
      return;
    }
    applyGesture(board, dragPreview);
    if (board.shapes.length > before) selectedId = board.shapes[board.shapes.length - 1].id;
    dragStart = null;
    dragPreview = null;
    render();
  });

  gridEl.addEventListener("dblclick", (event) => {
    const cell = toCell(event);
    const hit = [...board.shapes].reverse().find((shape) => shapeContains(shape, cell.row, cell.col));
    if (!hit || hit.kind !== "text") return;
    selectedId = hit.id;
    pendingTextCell = { row: hit.row, col: hit.col };
    editingTextId = hit.id;
    textInputEl.value = hit.text;
    textInputEl.hidden = false;
    textInputEl.focus();
    textInputEl.select();
    setStatus("Edit label, then press Enter");
  });

  root.addEventListener("click", (event) => {
    const layer = event.target.closest("[data-layer]");
    if (layer) {
      selectedId = board.shapes[Number(layer.dataset.layer)]?.id ?? null;
      render();
      return;
    }
    const button = event.target.closest("[data-act]");
    if (!button) return;
    handleAction(button.dataset.act, button);
  });

  inspectEl.addEventListener("change", (event) => {
    const input = event.target.closest("[data-prop]");
    if (input) applyProperty(input.dataset.prop, input.value);
  });

  textInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      pendingTextCell = null;
      editingTextId = null;
      textInputEl.value = "";
      textInputEl.hidden = true;
      setStatus("Text cancelled");
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = textInputEl.value.trim();
    if (!value || !pendingTextCell) {
      setStatus("Enter text first");
      return;
    }
    pushUndo();
    const existing = editingTextId ? board.select(editingTextId) : null;
    const shape = existing ?? board.add({
      kind: "text",
      row: pendingTextCell.row,
      col: pendingTextCell.col,
      text: value,
    });
    if (existing) existing.text = value;
    selectedId = shape.id;
    pendingTextCell = null;
    editingTextId = null;
    textInputEl.value = "";
    textInputEl.hidden = true;
    render();
    setStatus(existing ? "Text updated" : "Text added");
  });

  root.ownerDocument.addEventListener("paste", (event) => {
    const target = event.target;
    if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
    const raw = event.clipboardData?.getData("text/plain") ?? "";
    if (!raw.trim()) return;
    event.preventDefault();
    let text = raw.replace(/\r/g, "").replace(/\t/g, "    ");
    text = stripCodeFence(text);
    pushUndo();
    const shape = board.pasteText(text);
    if (!shape) {
      undo();
      setStatus("Nothing to paste");
      return;
    }
    selectedId = shape.id;
    render();
    setStatus("Pasted");
  });

  sizeEl.addEventListener("change", () => {
    const [rowsValue, colsValue] = sizeEl.value.split("x").map(Number);
    if (rowsValue === board.rows && colsValue === board.cols) return;
    pushUndo();
    const next = Board.fromShapes(rowsValue, colsValue, board.shapes);
    restore(next);
    const hidden = next.shapes.some((shape) => !shapeFits(shape, next));
    setStatus(hidden ? "Canvas resized · some content is outside the view" : "Canvas resized");
  });

  /** Reports whether a shape is fully inside the current canvas. */
  function shapeFits(shape, target) {
    if (shape.kind === "cells") {
      return shape.cells.every((cell) => cell.row < target.rows && cell.col < target.cols);
    }
    if (shape.kind === "box") {
      return shape.row + shape.height <= target.rows && shape.col + shape.width <= target.cols;
    }
    if (shape.kind === "h") return shape.row < target.rows && shape.col + shape.length <= target.cols;
    if (shape.kind === "v") return shape.col < target.cols && shape.row + shape.length <= target.rows;
    if (shape.kind === "text") {
      const lines = shape.text.split("\n");
      const width = Math.max(...lines.map((line) => line.length));
      return shape.row + lines.length <= target.rows && shape.col + width <= target.cols;
    }
    return shape.row < target.rows && shape.col < target.cols;
  }

  root.ownerDocument.addEventListener("keydown", (event) => {
    const target = event.target;
    const inField = target?.tagName === "INPUT"
      || target?.tagName === "TEXTAREA"
      || target?.isContentEditable;
    const mod = event.metaKey || event.ctrlKey;
    if (inField) return;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      setStatus(event.shiftKey ? (redo() ? "Redone" : "Nothing to redo") : (undo() ? "Undone" : "Nothing to undo"));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      selectedId = null;
      dragStart = null;
      dragPreview = null;
      selectDrag = null;
      outputEl.hidden = true;
      render();
      return;
    }
    if (mod && event.key === "[") {
      if (!selectedId) return;
      event.preventDefault();
      pushUndo();
      if (!board.reorder(selectedId, -1)) {
        undo();
        return;
      }
      render();
      return;
    }
    if (mod && event.key === "]") {
      if (!selectedId) return;
      event.preventDefault();
      pushUndo();
      if (!board.reorder(selectedId, 1)) {
        undo();
        return;
      }
      render();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (!selectedId) return;
      event.preventDefault();
      pushUndo();
      if (!board.remove(selectedId)) {
        undo();
        return;
      }
      selectedId = null;
      render();
      return;
    }
    if (selectedId && event.key.startsWith("Arrow")) {
      const delta = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }[event.key];
      if (!delta) return;
      event.preventDefault();
      pushUndo();
      board.move(selectedId, delta[0], delta[1]);
      render();
    }
  });

  function handleAction(action, button) {
    if (action === "undo") return setStatus(undo() ? "Undone" : "Nothing to undo");
    if (action === "redo") return setStatus(redo() ? "Redone" : "Nothing to redo");
    if (action === "clear") {
      if (board.shapes.length === 0) return setStatus("Nothing to clear");
      pushUndo();
      board.clear();
      selectedId = null;
      render();
      return setStatus("Cleared");
    }
    if (action === "grid") {
      gridLines = !gridLines;
      gridEl.classList.toggle("is-gridless", !gridLines);
      button.setAttribute("aria-pressed", String(gridLines));
      savePreferences();
      return;
    }
    if (action === "theme") {
      applyTheme(theme === "light" ? "dark" : "light");
      savePreferences();
      return;
    }
    if (action === "copy") return copyMarkdown();
  }

  /** Applies one theme to the document and the toolbar control. */
  function applyTheme(next) {
    theme = next;
    root.ownerDocument.documentElement.dataset.theme = theme;
    const button = root.querySelector("[data-act=theme]");
    if (!button) return;
    button.title = theme === "light" ? "Dark mode" : "Light mode";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(theme === "dark"));
  }

  async function copyMarkdown() {
    const markdown = board.toMarkdown();
    if (!markdown) return setStatus("Nothing to copy");
    try {
      const clipboard = root.ownerDocument.defaultView.navigator.clipboard;
      if (!clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await clipboard.writeText(markdown);
      outputEl.hidden = true;
      setStatus("Copied");
    } catch {
      const textarea = root.ownerDocument.createElement("textarea");
      textarea.value = markdown;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      root.ownerDocument.body.append(textarea);
      textarea.select();
      const copied = root.ownerDocument.execCommand("copy");
      textarea.remove();
      if (copied) {
        setStatus("Copied");
        return;
      }
      outputEl.value = markdown;
      outputEl.hidden = false;
      setStatus("Copy unavailable · Markdown shown below");
    }
  }

  const bridge = createHostBridge();
  bridge.onHostContext = (context) => {
    if (context?.theme === "dark" || context?.theme === "light") {
      applyTheme(context.theme);
    }
  };
  bridge.onToolInput = (params) => {
    const args = params?.arguments ?? params;
    if (!args || typeof args !== "object") return;
    if (!Array.isArray(args.shapes) && !args.rows && !args.cols) return;
    applyLayout(args);
    setStatus("Loading layout…");
  };
  bridge.onToolResult = (result) => {
    const data = result?.structuredContent;
    if (!data) return;
    applyLayout(data);
    setStatus("Ready");
  };

  /** Replaces the board from a tool payload and resets per-document state. */
  function applyLayout(data) {
    undoStack = [];
    redoStack = [];
    board = Board.fromShapes(data.rows ?? board.rows, data.cols ?? board.cols, data.shapes ?? []);
    selectedId = null;
    pendingTextCell = null;
    editingTextId = null;
    selectDrag = null;
    outputEl.hidden = true;
    syncHistoryButtons();
    render();
  }
  bridge.start();

  setTool("select");
  syncHistoryButtons();
  render();

  return {
    get board() { return board; },
    render,
    undo,
    redo,
    setTool,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Removes one surrounding Markdown code fence, including longer fences. */
export function stripCodeFence(text) {
  const lines = text.split("\n");
  const openFence = lines[0]?.match(/^`{3,}$/);
  const closeFence = lines.at(-1)?.match(/^`{3,}$/);
  if (openFence && closeFence && openFence[0].length === closeFence[0].length) {
    return lines.slice(1, -1).join("\n");
  }
  return text;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

/** Minimal MCP Apps host bridge for the standard handshake and host events. */
function createHostBridge() {
  let nextId = 1;
  const pending = new Map();
  const api = { onToolResult: undefined, onToolInput: undefined, onHostContext: undefined, start };

  function post(message) {
    if (typeof window === "undefined" || window.parent === window) return;
    window.parent.postMessage(message, "*");
  }

  function request(method, params, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || window.parent === window) {
        reject(new Error("MCP Apps host unavailable"));
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      post({ jsonrpc: "2.0", id, method, params });
    });
  }

  function onMessage(event) {
    if (typeof window === "undefined" || event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (typeof message.id === "number") {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message ?? "MCP Apps request failed"));
      else item.resolve(message.result);
      return;
    }
    if (message.method === "ui/notifications/tool-result") api.onToolResult?.(message.params);
    if (message.method === "ui/notifications/tool-input") api.onToolInput?.(message.params);
    if (message.method === "ui/notifications/host-context-changed") api.onHostContext?.(message.params);
  }

  async function start() {
    if (typeof window === "undefined" || window.parent === window) return;
    window.addEventListener("message", onMessage, { passive: true });
    try {
      await request("ui/initialize", {
        appInfo: { name: "markwire", version: "1.0.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26",
      });
      post({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });
    } catch {}
  }

  return api;
}
