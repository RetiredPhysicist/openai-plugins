import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const root = fileURLToPath(new URL("../", import.meta.url));

function serve(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/**
 * Plays the MCP Apps host: answers `ui/initialize` and the tools the workspace
 * calls, and records every call. The workspace loads from the same origin, the
 * way a host serves an app resource.
 */
function hostFixture(workspaceUrl) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>host</title></head>
<body>
<div id="host"></div>
<script>
window.__calls = [];

const sidebar = {
  counts: { inbox: 2, today: 3, upcoming: 3, anytime: 9, someday: 4, logbook: 12 },
  projects: [{ id: "p1", title: "Launch", openCount: 3 }],
  areas: [{ id: "a1", title: "Dev", openCount: 0 }],
  tags: [{ id: "t1", title: "Work", usage: 4 }, { id: "t2", title: "Errand", usage: 2 }],
};
const tasks = { items: [
  { id: "todo-1", type: "todo", status: "open", title: "Ship the Things workspace",
    notes: "Wire the sidebar.", project: "Launch", projectId: "p1", area: "Dev",
    startDate: "2026-10-03", reminderTime: "14:30", tags: ["Work"] },
  { id: "todo-2", type: "todo", status: "open", title: "Buy groceries",
    notes: "", project: null, area: null, deadline: "2026-10-04", tags: ["Errand"] },
  { id: "todo-3", type: "todo", status: "completed", title: "Write release notes",
    notes: "", project: "Launch", tags: ["Work"] },
], count: 3, total: 3, view: "today" };
const detail = { task: { ...tasks.items[0],
  checklist: [{ id: "c1", title: "Sidebar", completed: true }, { id: "c2", title: "Inspector", completed: false }] } };

// Register before creating the iframe: the workspace sends ui/initialize as
// soon as it mounts, so a listener attached later can miss the first message.
window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.jsonrpc !== "2.0") return;
  if (message.method === "ui/initialize") {
    event.source.postMessage({ jsonrpc: "2.0", id: message.id,
      result: { protocolVersion: "2026-01-26", hostContext: { theme: "light" } } }, "*");
    return;
  }
  if (message.method !== "tools/call") return;
  const name = message.params?.name;
  window.__calls.push({ name, arguments: message.params?.arguments ?? {} });
  const payload =
    name === "get_sidebar" ? sidebar :
    name === "get_tasks" ? tasks :
    name === "get_task" ? detail :
    name === "complete_todo" ? { task: tasks.items[0] } : null;
  if (payload) {
    event.source.postMessage({ jsonrpc: "2.0", id: message.id, result: { structuredContent: payload } }, "*");
    return;
  }
  event.source.postMessage({ jsonrpc: "2.0", id: message.id, result: {
    isError: true,
    content: [{ type: "text", text: "unexpected tool " + name }],
    structuredContent: { error: { code: "unexpected_tool", message: "unexpected tool " + name } },
  } }, "*");
});

const frame = document.createElement("iframe");
frame.id = "app";
frame.style.cssText = "border:0;width:1100px;height:720px";
frame.src = ${JSON.stringify(workspaceUrl)};
document.getElementById("host").appendChild(frame);
</script>
</body></html>`;
}

test("workspace renders tasks and fills the inspector", async () => {
  const workspaceHtml = readFileSync(`${root}/ui/workspace.html`, "utf8");
  const server = await serve((request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (path !== "/host" && path !== "/workspace.html") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", connection: "close" });
    response.end(
      path === "/workspace.html"
        ? workspaceHtml
        : hostFixture(`http://127.0.0.1:${port}/workspace.html`),
    );
  });
  const { port } = server.address();

  try {
    const result = await runBrowserChecks(`http://127.0.0.1:${port}/host`);
    // Tasks group by project, so the two "Launch" rows come before the
    // project-less one.
    assert.deepEqual(result.titles, [
      "Ship the Things workspace",
      "Write release notes",
      "Buy groceries",
    ]);
    assert.ok(result.groupCount >= 2, `expected project groups, saw ${result.groupCount}`);
    // 6 view rows + 1 project + 1 area. Tag rows stay collapsed.
    assert.equal(result.sidebarRows, 8);
    assert.equal(result.tagRows, 0);
    assert.equal(result.tagsOpen, false);
    assert.match(result.firstMeta, /2026-10-03 14:30/);
    assert.match(result.gridColumns, /^208px/);
    assert.equal(result.detailTitle, "Ship the Things workspace");
    assert.match(result.detailChecklist, /Sidebar/);
    const names = result.calls.map((call) => call.name);
    assert.ok(names.includes("get_sidebar"));
    assert.ok(names.includes("get_tasks"));
    assert.ok(names.includes("get_task"));
  } finally {
    server.close();
  }
});

test("workspace contains no network references", () => {
  const html = readFileSync(`${root}/ui/workspace.html`, "utf8");
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /mountThings/);
  assert.match(html, /createHostBridge/);
});

async function runBrowserChecks(url) {
  const child = spawn("ego-browser", ["nodejs", "-e", script(url)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { output += chunk; });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(code, 0, output);
  const line = output.split("\n").find((item) => item.includes("\"titles\""));
  assert.ok(line, `ego-browser produced no JSON result:\n${output}`);
  return JSON.parse(line);
}

function script(url) {
  return `
const task = await taskSpace("verify Things workspace");
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1100, height: 720, deviceScaleFactor: 1, mobile: false });
await page.goto(${JSON.stringify(url)}, { waitUntil: "load" });
await page.waitForFunction(() => window.__calls.some((c) => c.name === "get_tasks"), undefined, { timeout: 8000 });
await page.waitForTimeout(300);

const result = await page.evaluate(() => {
  const doc = document.getElementById("app").contentDocument;
  const titles = [...doc.querySelectorAll(".tw-row-title")].map((el) => el.textContent);
  const firstMeta = doc.querySelector(".tw-row-meta")?.textContent ?? "";
  const gridColumns = getComputedStyle(doc.querySelector(".tw-app")).gridTemplateColumns;
  const sidebarRows = doc.querySelectorAll(".tw-side-row").length;
  const groupCount = doc.querySelectorAll(".tw-group").length;
  const tagRows = doc.querySelectorAll("[data-tag]").length;
  const tagsOpen = doc.querySelector(".tw-side-heading")?.classList.contains("is-open") ?? false;
  doc.querySelector(".tw-row").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return { titles, firstMeta, gridColumns, sidebarRows, groupCount, tagRows, tagsOpen };
});

await page.waitForFunction(() => window.__calls.some((c) => c.name === "get_task"), undefined, { timeout: 5000 });
await page.waitForTimeout(200);
const detail = await page.evaluate(() => {
  const doc = document.getElementById("app").contentDocument;
  return {
    detailTitle: doc.querySelector(".tw-detail-title")?.textContent ?? "",
    detailChecklist: doc.querySelector(".tw-checklist")?.textContent ?? "",
    calls: window.__calls.slice(),
  };
});

console.log(JSON.stringify({ ...result, ...detail }));
await task.finish({ keep: [] });
`;
}
