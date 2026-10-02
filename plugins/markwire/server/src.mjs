import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Board } from "../ui/board.js";

const UI_URI = "ui://markwire/editor.html";
const MAX_ROWS = 80;
const MAX_COLS = 160;

/**
 * Monochrome 20x20 sidebar icon using currentColor, per the MCP extensions
 * entrypoint icon guidance.
 */
const SIDEBAR_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='currentColor' stroke-width='1.33' stroke-linejoin='round'%3E%3Cpath d='M3.5 4.5h13v11h-13z'/%3E%3Cpath d='M3.5 10h13M10 4.5v11'/%3E%3C/svg%3E";

const boxShape = z.object({
  kind: z.literal("box"),
  role: z.string().min(1).max(40).optional(),
  row: z.number().int().min(0).max(MAX_ROWS - 1),
  col: z.number().int().min(0).max(MAX_COLS - 1),
  height: z.number().int().min(2).max(MAX_ROWS),
  width: z.number().int().min(2).max(MAX_COLS),
});

const horizontalShape = z.object({
  kind: z.literal("h"),
  role: z.string().min(1).max(40).optional(),
  row: z.number().int().min(0).max(MAX_ROWS - 1),
  col: z.number().int().min(0).max(MAX_COLS - 1),
  length: z.number().int().min(1).max(MAX_COLS),
});

const verticalShape = z.object({
  kind: z.literal("v"),
  role: z.string().min(1).max(40).optional(),
  row: z.number().int().min(0).max(MAX_ROWS - 1),
  col: z.number().int().min(0).max(MAX_COLS - 1),
  length: z.number().int().min(1).max(MAX_ROWS),
});

const textShape = z.object({
  kind: z.literal("text"),
  role: z.string().min(1).max(40).optional(),
  row: z.number().int().min(0).max(MAX_ROWS - 1),
  col: z.number().int().min(0).max(MAX_COLS - 1),
  text: z.string().min(1).max(240),
});

const strokeShape = z.object({
  kind: z.literal("stroke"),
  role: z.string().min(1).max(40).optional(),
  row: z.number().int().min(0).max(MAX_ROWS - 1),
  col: z.number().int().min(0).max(MAX_COLS - 1),
  char: z.string().min(1).max(2),
});

const cellsShape = z.object({
  kind: z.literal("cells"),
  role: z.string().min(1).max(40).optional(),
  cells: z
    .array(
      z.object({
        row: z.number().int().min(0).max(MAX_ROWS - 1),
        col: z.number().int().min(0).max(MAX_COLS - 1),
        char: z.string().min(1).max(2),
      }),
    )
    .min(1)
    .max(MAX_ROWS * MAX_COLS),
});

const wireframeInput = z.object({
  rows: z.number().int().min(2).max(MAX_ROWS).optional(),
  cols: z.number().int().min(2).max(MAX_COLS).optional(),
  shapes: z
    .array(z.discriminatedUnion("kind", [boxShape, horizontalShape, verticalShape, textShape, strokeShape, cellsShape]))
    .max(8000)
    .optional(),
});

const wireframeOutput = z.object({
  rows: z.number().int(),
  cols: z.number().int(),
  shapes: z.array(z.record(z.string(), z.unknown())),
  markdown: z.string(),
});

function renderWireframe(args = {}) {
  const rows = args.rows ?? 40;
  const cols = args.cols ?? 80;
  const shapes = args.shapes ?? [];
  const board = Board.fromShapes(rows, cols, shapes);
  return {
    rows,
    cols,
    shapes: board.toShapeList(),
    markdown: board.toMarkdown(),
  };
}

function reply(args, message) {
  const data = renderWireframe(args);
  return {
    structuredContent: data,
    content: [
      {
        type: "text",
        text: data.markdown ? `${message}\n\n${data.markdown}` : message,
      },
    ],
  };
}

function editorHtml() {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const html = readFileSync(new URL("../ui/editor.html", import.meta.url), "utf8");
  return html;
}

export function createServer() {
  const server = new McpServer(
    {
      name: "markwire",
      version: "1.0.0",
      icons: [{ src: SIDEBAR_ICON, mimeType: "image/svg+xml", sizes: ["20x20"] }],
    },
    {
      instructions:
        "Use open_wireframe for ASCII wireframes, boxes, layout sketches, and quick UI diagrams. Pass shapes when the layout is known. The result includes Markdown that can be quoted directly and is already the finished drawing; do not re-render it.",
    },
  );

  registerAppResource(
    server,
    "MarkWire editor",
    UI_URI,
    { description: "Interactive ASCII wireframe editor" },
    async () => ({
      contents: [
        {
          uri: UI_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: editorHtml(),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "open_wireframe",
    {
      title: "MarkWire",
      description:
        "Open an interactive ASCII wireframe editor or render a wireframe from shapes. Use for UI layouts, architecture boxes, flows, and quick terminal-style diagrams.",
      inputSchema: wireframeInput,
      outputSchema: wireframeOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        ui: { resourceUri: UI_URI },
        "openai/ui": {
          entrypoints: [{ type: "thread" }, { type: "global" }],
        },
        "openai/toolInvocation/invoking": "Opening wireframe…",
        "openai/toolInvocation/invoked": "Wireframe ready",
      },
    },
    async (args) => reply(args, "Wireframe ready."),
  );

  return server;
}

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("MarkWire server failed:", error);
  process.exit(1);
});
