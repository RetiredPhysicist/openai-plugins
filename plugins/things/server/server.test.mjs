import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./things.mjs", import.meta.url));

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
  const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "ignore"] });
  const client = new StdioClient(child);
  try {
    const initialized = await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "things-test", version: "1.0.0" },
    });
    client.notify("notifications/initialized");
    await run(client, initialized);
  } finally {
    child.stdin.end();
    await once(child, "exit").catch(() => {});
  }
}

test("initialize reports the Things server", async () => {
  await withClient(async (client, initialized) => {
    assert.equal(initialized.serverInfo.name, "things");
    assert.ok(initialized.capabilities.tools);
    assert.ok(initialized.capabilities.resources);
  });
});

test("open_workspace declares both entrypoints and a UI resource", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/list");
    const tool = result.tools.find((item) => item.name === "open_workspace");
    assert.ok(tool);
    assert.equal(tool.title, "Things");
    assert.equal(tool._meta.ui.resourceUri, "ui://things/workspace.html");
    const types = tool._meta["openai/ui"].entrypoints.map((entry) => entry.type);
    assert.deepEqual(types.sort(), ["global", "thread"]);
  });
});

test("workspace-only tools are hidden from the model", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/list");
    const byName = new Map(result.tools.map((tool) => [tool.name, tool]));
    assert.deepEqual(byName.get("open_workspace")._meta.ui.visibility, ["model"]);
    assert.deepEqual(byName.get("get_tasks")._meta.ui.visibility, ["model", "app"]);
    assert.deepEqual(byName.get("add_todo")._meta.ui.visibility, ["model", "app"]);
    assert.deepEqual(byName.get("complete_todo")._meta.ui.visibility, ["model", "app"]);
    // Sidebar aggregation and the "open in Things" action exist only for the UI.
    assert.deepEqual(byName.get("get_sidebar")._meta.ui.visibility, ["app"]);
    assert.deepEqual(byName.get("show_in_things")._meta.ui.visibility, ["app"]);
  });
});

test("resources/read returns the self-contained workspace", async () => {
  await withClient(async (client) => {
    const result = await client.request("resources/read", {
      uri: "ui://things/workspace.html",
    });
    const resource = result.contents[0];
    assert.equal(resource.mimeType, "text/html;profile=mcp-app");
    assert.match(resource.text, /mountThings/);
    assert.match(resource.text, /createHostBridge/);
    assert.doesNotMatch(resource.text, /https?:\/\//);
  });
});

test("get_tasks returns typed structured content", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "get_tasks",
      arguments: { view: "today", limit: 3 },
    });
    assert.ok(!result.isError);
    const data = result.structuredContent;
    assert.equal(data.view, "today");
    assert.ok(Array.isArray(data.items));
    assert.ok(data.items.length <= 3);
    assert.equal(typeof data.total, "number");
  });
});

test("get_sidebar returns counts, projects, areas, and tags", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "get_sidebar",
      arguments: {},
    });
    assert.ok(!result.isError);
    const data = result.structuredContent;
    assert.equal(typeof data.counts.today, "number");
    assert.ok(Array.isArray(data.projects));
    assert.ok(Array.isArray(data.areas));
    assert.ok(Array.isArray(data.tags));
  });
});

test("an unknown view is rejected as a structured error", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "get_tasks",
      arguments: { view: "nonsense" },
    });
    // Schema validation rejects the invalid enum before the handler runs.
    assert.ok(result.isError);
  });
});

test("search returns only matching tasks", async () => {
  await withClient(async (client) => {
    const result = await client.request("tools/call", {
      name: "search_things",
      arguments: { query: "zzzz-no-such-task-zzzz" },
    });
    assert.ok(!result.isError);
    assert.equal(result.structuredContent.count, 0);
  });
});
