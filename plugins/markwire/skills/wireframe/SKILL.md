---
name: wireframe
description: Draw ASCII wireframes, UI layout sketches, and terminal-style diagrams. Use when a visual structure is clearer as an editable character grid or when the user asks for a wireframe, mockup, layout, box diagram, or ASCII diagram.
---

# Wireframe with MarkWire

Call `open_wireframe` when the user wants a wireframe, layout, terminal diagram, or box-and-line sketch. The tool is a drawing surface with one output: Markdown. It returns a self-contained editor in supported hosts and Markdown in every client.

The editor ships with the plugin and runs locally through the bundled stdio MCP server. No remote service or API key is required.

## Shape input

Pass `shapes` when the layout is known. Coordinates start at row `0`, column `0`; rows grow downward and columns grow right.

| Shape | Fields |
| --- | --- |
| Rectangle | `kind: "box"`, `row`, `col`, `height`, `width` |
| Horizontal line | `kind: "h"`, `row`, `col`, `length` |
| Vertical line | `kind: "v"`, `row`, `col`, `length` |
| Label | `kind: "text"`, `row`, `col`, `text` |
| Painted character | `kind: "stroke"`, `row`, `col`, `char` |
| Pasted cell block | `kind: "cells"`, `cells: [{ row, col, char }]` |

Boxes are expanded to lines, so a box can share a divider with another box. Labels paint over strokes and keep their exact position.

## Working rules

- Call the tool first when a visual would make the answer clearer. Do not describe an ASCII layout the tool can render.
- Start around `40x80` for a full layout and use a smaller grid for a focused component.
- Keep labels short. Long labels consume columns and may cover neighboring structure.
- Treat the returned Markdown as the canonical output. Quote it verbatim and do not redraw it by hand.
- The result is already the finished drawing. Do not re-render it with another visualization tool or a second diagram.
- The local editor is interactive in UIs that render MCP Apps resources. In clients without UI rendering, use the returned Markdown.
