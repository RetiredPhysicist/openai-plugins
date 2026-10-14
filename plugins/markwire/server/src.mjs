import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";
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
  /** Token from a previous open_wireframe result; replays those shapes under new ones. */
  session: z.string().max(64).optional(),
});

/** One drawing per editor process; the token binds the model's next call to this canvas. */
let activeSession = null;

const wireframeOutput = z.object({
  rows: z.number().int(),
  cols: z.number().int(),
  session: z.string(),
  shapes: z.array(z.record(z.string(), z.unknown())),
  markdown: z.string(),
});

function renderWireframe(args = {}) {
  const baseShapes = args.session && activeSession?.id === args.session ? activeSession.shapes : [];
  const rows = args.rows ?? activeSession?.rows ?? 40;
  const cols = args.cols ?? activeSession?.cols ?? 80;
  const board = Board.fromShapes(rows, cols, [...baseShapes, ...(args.shapes ?? [])]);
  const sessionId = args.session && activeSession?.id === args.session
    ? args.session
    : `mw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  activeSession = { id: sessionId, rows, cols, shapes: board.toShapeList() };
  return {
    rows,
    cols,
    session: sessionId,
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

const defaultCanvas = { defaultRows: 40, defaultCols: 80 };

export function createServer() {
  const server = new McpServer(
    {
      name: "markwire",
      version: "1.0.0",
      icons: [{ src: SIDEBAR_ICON, mimeType: "image/svg+xml", sizes: ["20x20"] }],
    },
    {
      instructions:
        "Use open_wireframe for ASCII wireframes, boxes, layout sketches, and quick UI diagrams. Pass shapes when the layout is known. To edit the current drawing, pass its session token plus only the shapes that change. The result includes Markdown that can be quoted directly and is already the finished drawing; do not re-render it.",
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

  const openai = new OpenAIExtensions(server);
  openai.settings.register({
    fields: {
      defaultRows: {
        schema: z.number().int().min(2).max(MAX_ROWS),
        title: "Default rows",
      },
      defaultCols: {
        schema: z.number().int().min(2).max(MAX_COLS),
        title: "Default columns",
      },
    },
    layout: [
      {
        kind: "group",
        title: "Canvas",
        items: [
          { kind: "property", property: "defaultRows" },
          { kind: "property", property: "defaultCols" },
        ],
      },
    ],
    read: async () => ({ ...defaultCanvas }),
    update: async (set) => Object.assign(defaultCanvas, set),
  });

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
          entrypoints: [
            {
              type: "global",
              quickAction: {
                title: "New wireframe",
                icons: [{ src: SIDEBAR_ICON, mimeType: "image/svg+xml", sizes: ["20x20"] }],
                target: { type: "tool", name: "open_wireframe", arguments: {} },
              },
            },
            { type: "thread" },
          ],
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
  await serveStdio(() => createServer());
}

main().catch((error) => {
  console.error("MarkWire server failed:", error);
  process.exit(1);
});
