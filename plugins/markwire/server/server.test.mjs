import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./server.mjs", import.meta.url));

class StdioClient {
  constructor(child) {
    this.child = child;
    this.buffer = "";
    this.nextId = 1;
    this.pending = new Map();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.onData(chunk));
  }

  onData(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (typeof message.id !== "number") continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    }
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${body}\n`);
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }
}

async function withClient(run) {
  const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "inherit"] });
  const client = new StdioClient(child);
  try {
    const initialized = await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "markwire-test", version: "1.0.0" },
    });
    client.notify("notifications/initialized");
    await run(client, initialized);
  } finally {
    child.stdin.end();
    await once(child, "exit").catch(() => {});
  }
}

test("initialize reports tools and resources", async () => {
  await withClient(async (client, initialized) => {
    assert.equal(initialized.serverInfo.name, "markwire");
    assert.ok(initialized.capabilities.tools);
    assert.ok(initialized.capabilities.resources);
  });
});

test("tools/list exposes the app resource", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/list");
    const tool = result.tools.find((item) => item.name === "open_wireframe");
    assert.ok(tool);
    assert.equal(tool.title, "MarkWire");
    assert.equal(tool._meta.ui.resourceUri, "ui://markwire/editor.html");
    assert.equal(tool.annotations.readOnlyHint, true);
  });
});

test("open_wireframe declares thread and global entrypoints", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/list");
    const tool = result.tools.find((item) => item.name === "open_wireframe");
    const types = tool._meta["openai/ui"].entrypoints.map((entry) => entry.type);
    assert.deepEqual(types.sort(), ["global", "thread"]);
  });
});

test("open_wireframe accepts empty arguments for entrypoint launch", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "open_wireframe",
      arguments: {},
    });
    assert.ok(!result.isError);
    assert.equal(result.structuredContent.rows, 40);
    assert.equal(result.structuredContent.cols, 80);
  });
});

test("resources/read returns the self-contained editor", async () => {
  await withClient(async (client) => {
    const result = await client.request("resources/read", { uri: "ui://markwire/editor.html" });
    const resource = result.contents[0];
    assert.equal(resource.mimeType, "text/html;profile=mcp-app");
    assert.match(resource.text, /mountMarkWire/);
    assert.match(resource.text, /mw-grid/);
    assert.doesNotMatch(resource.text, /REFERO MCP/);
  });
});

test("editor bundle contains every advertised work surface", async () => {
  await withClient(async (client) => {
    const result = await client.request("resources/read", { uri: "ui://markwire/editor.html" });
    const html = result.contents[0].text;
    for (const surface of [
      "mw-side",
      "mw-toolbar",
      "mw-grid",
      "mw-statusbar",
      "mw-layers",
      "mw-inspect",
      "mw-mobile-tools",
      "mountMarkWire",
    ]) {
      assert.match(html, new RegExp(surface));
    }
  });
});

test("open_wireframe renders boxes", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "open_wireframe",
      arguments: {
        rows: 4,
        cols: 6,
        shapes: [{ kind: "box", row: 0, col: 0, height: 3, width: 5 }],
      },
    });
    assert.equal(result.structuredContent.markdown, "```\n┌───┐\n│   │\n└───┘\n```\n");
  });
});

test("open_wireframe overlays text on strokes", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "open_wireframe",
      arguments: {
        rows: 3,
        cols: 9,
        shapes: [
          { kind: "box", row: 0, col: 0, height: 3, width: 9 },
          { kind: "text", row: 1, col: 1, text: "Hello" },
        ],
      },
    });
    assert.match(result.structuredContent.markdown, /│Hello  │/);
  });
});

test("open_wireframe accepts painted stroke characters", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "open_wireframe",
      arguments: {
        rows: 4,
        cols: 8,
        shapes: [
          { kind: "box", row: 0, col: 0, height: 4, width: 8 },
          { kind: "stroke", row: 2, col: 3, char: "█" },
        ],
      },
    });
    assert.match(result.structuredContent.markdown, /█/);
    assert.equal(result.structuredContent.shapes.at(-1).kind, "stroke");
  });
});

test("open_wireframe keeps shape identity stable in its result", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "open_wireframe",
      arguments: {
        rows: 5,
        cols: 12,
        shapes: [
          { kind: "box", row: 0, col: 0, height: 3, width: 6 },
          { kind: "text", row: 1, col: 7, text: "A" },
        ],
      },
    });
    const ids = result.structuredContent.shapes.map((shape) => shape.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
  });
});

test("open_wireframe accepts pasted cell shapes", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "open_wireframe",
      arguments: {
        rows: 3,
        cols: 5,
        shapes: [
          {
            kind: "cells",
            cells: [
              { row: 0, col: 0, char: "x" },
              { row: 2, col: 4, char: "y" },
            ],
          },
        ],
      },
    });
    assert.match(result.structuredContent.markdown, /x/);
    assert.match(result.structuredContent.markdown, /y/);
    assert.equal(result.structuredContent.shapes[0].kind, "cells");
  });
});

test("open_wireframe preserves component roles through a round trip", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "open_wireframe",
      arguments: {
        rows: 5,
        cols: 12,
        shapes: [{ kind: "box", role: "Button", row: 0, col: 0, height: 3, width: 10 }],
      },
    });
    assert.equal(result.structuredContent.shapes[0].role, "Button");
  });
});

test("open_wireframe accepts a dense painted canvas", async () => {
  await withClient(async (client) => {
    const cells = [];
    for (let row = 0; row < 60; row++) {
      for (let col = 0; col < 80; col++) cells.push({ row, col, char: "█" });
    }
    const result = await client.request("tools/call", {
      name: "open_wireframe",
      arguments: { rows: 60, cols: 80, shapes: [{ kind: "cells", cells }] },
    });
    assert.equal(result.structuredContent.shapes.length, 1);
    assert.ok(result.structuredContent.markdown.includes("█"));
  });
});

test("open_wireframe rejects out-of-bounds coordinates", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "open_wireframe",
      arguments: {
        rows: 10,
        cols: 10,
        shapes: [{ kind: "stroke", row: 80, col: 0, char: "x" }],
      },
    });
    assert.equal(result.isError, true);
  });
});
