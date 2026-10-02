/**
 * MarkWire component library.
 *
 * Every UI element in the sidebar draws through this module so the shape of each
 * component is defined once and can be unit tested without a browser.
 */

export function drawComponent(target, kind, top, left, height, width) {
  switch (kind) {
    case "button": {
      const size = Math.max(3, height);
      const inner = Math.max(8, width - 2);
      const label = "OK";
      const labelLeft = Math.max(0, Math.floor((inner - label.length) / 2));
      const labelRow = Math.floor((size - 1) / 2);
      target.text(top, left, `[${" ".repeat(inner)}]`);
      for (let row = 1; row < size; row++) {
        const text = row === labelRow
          ? `[${" ".repeat(labelLeft)}${label}${" ".repeat(Math.max(0, inner - labelLeft - label.length))}]`
          : `[${" ".repeat(inner)}]`;
        target.text(top + row, left, text);
      }
      break;
    }
    case "input":
      target.text(top, left, `[${"_".repeat(Math.max(8, width - 2))}]`);
      break;
    case "card": {
      const w = Math.max(16, width);
      const h = Math.max(6, height);
      target.box(top, left, h, w);
      target.text(top + 1, left + 2, "Title");
      target.hline(top + 3, left, w);
      break;
    }
    case "table": {
      const h = Math.max(5, height);
      const columns = 4;
      const w = Math.max(columns * 8 + columns + 1, width);
      const cellWidth = Math.max(7, Math.floor((w - columns - 1) / columns));
      const tableWidth = cellWidth * columns + columns + 1;
      const frame = Array.from({ length: columns }, (_, index) => {
        const label = `Col ${String.fromCharCode(65 + index)}`;
        return ` ${label.padEnd(cellWidth - 1)}`;
      }).join("│");
      target.box(top, left, h, tableWidth);
      target.hline(top + 2, left, tableWidth);
      for (let index = 1; index < columns; index++) {
        target.vline(top, left + index * (cellWidth + 1), h);
      }
      target.text(top + 1, left, `│${frame}│`.slice(0, tableWidth));
      break;
    }
    case "modal":
      {
        const w = Math.max(24, width);
        const h = Math.max(7, height);
        const actions = "[ Cancel ] [ OK ]";
        target.box(top, left, h, w);
        target.text(top + 1, left + 2, "Dialog");
        target.stroke(top + 1, left + w - 3, "×");
        target.hline(top + 3, left, w);
        target.text(top + h - 3, left + w - actions.length - 2, actions);
      }
      break;
    case "checkbox":
      target.text(top, left, "[ ]");
      target.text(top, left + 4, "Checkbox");
      break;
    case "radio":
      target.text(top, left, "( )");
      target.text(top, left + 4, "Radio");
      break;
    case "dropdown":
      target.box(top, left, 3, Math.max(12, width));
      target.text(top + 1, left + 2, "Select");
      target.stroke(top + 1, left + Math.max(12, width) - 3, "▾");
      break;
    case "toggle":
      target.text(top, left, "[● ] Toggle");
      break;
    case "tabs":
      target.text(top, left, "[ Tab 1 ]  Tab 2  Tab 3");
      break;
    case "search":
      target.box(top, left, 3, Math.max(14, width));
      target.text(top + 1, left + 2, "⌕ Search");
      break;
    case "progress":
      target.text(top, left, "▰▰▰▰▰▱▱▱▱▱");
      break;
    case "breadcrumb":
      target.text(top, left, "Home > Section > Detail");
      break;
    case "pagination":
      target.text(top, left, "‹  1  2  3  ›");
      break;
    case "nav":
      target.text(top, left, "Logo      Link   Link   Link      [ Action ]");
      target.hline(top + 1, left, Math.max(32, width));
      break;
    case "list":
      target.text(top, left, "• Item one\n• Item two\n• Item three");
      break;
    case "placeholder":
      target.box(top, left, Math.max(5, height), Math.max(16, width));
      target.text(top + 1, left + 2, "Image");
      break;
    case "hsplit":
      target.box(top, left, Math.max(6, height), Math.max(16, width));
      target.vline(top, left + Math.floor(Math.max(16, width) / 2), Math.max(6, height));
      break;
    case "image":
      target.box(top, left, Math.max(5, height), Math.max(16, width));
      target.text(top + 2, left + Math.floor(Math.max(16, width) / 2) - 1, "IMG");
      break;
  }
}

/** Every component id the sidebar exposes, including the "more" section. */
export const COMPONENT_IDS = [
  "button", "input", "card", "table", "modal",
  "checkbox", "radio", "dropdown", "toggle", "tabs",
  "search", "progress", "breadcrumb", "pagination", "nav",
  "list", "placeholder", "hsplit", "image",
];
