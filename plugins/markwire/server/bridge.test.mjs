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

test("editor handshake uses the MCP Apps bridge", async () => {
  const server = await serve((request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    const file = path === "/" ? "/bridge-host.html" : path;
    if (file !== "/bridge-host.html" && file !== "/editor.html") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      connection: "close",
    });
    const source = file === "/editor.html"
      ? readFileSync(`${root}/ui/editor.html`, "utf8")
      : readFileSync(`${root}/server/bridge-host.html`, "utf8")
          .replace("__EDITOR_URL__", `http://127.0.0.1:${port}/editor.html`);
    response.end(source);
  });

  const { port } = server.address();

  const hostServer = await serve((request, response) => {
    if (new URL(request.url, "http://127.0.0.1").pathname !== "/host") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      connection: "close",
    });
    response.end(readFileSync(`${root}/server/bridge-host.html`, "utf8")
      .replace("__EDITOR_URL__", `http://127.0.0.1:${port}/editor.html`));
  });
  const { port: hostPort } = hostServer.address();

  try {
    const result = await runBrowserChecks(`http://127.0.0.1:${hostPort}/host`);
    const messages = result.messages;
    assert.equal(messages[0].method, "ui/initialize");
    assert.equal(messages[0].params.appInfo.name, "markwire");
    assert.equal(messages[1].method, "ui/notifications/initialized");
  } finally {
    hostServer.close();
    server.close();
  }
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
  const line = output.split("\n").find((item) => item.includes("\"messages\""));
  assert.ok(line, `ego-browser produced no JSON result:\n${output}`);
  return JSON.parse(line);
}

function script(url) {
  return `
const task = await taskSpace("verify MarkWire bridge");
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
await page.goto(${JSON.stringify(url)}, { waitUntil: "load" });
await page.waitForFunction(() => window.__messages.length >= 2, undefined, { timeout: 5000 });
await page.evaluate(() => {
  document.querySelector("iframe").contentWindow.postMessage({
    jsonrpc: "2.0",
    method: "ui/notifications/tool-result",
    params: { structuredContent: { rows: 4, cols: 6, shapes: [{ kind: "box", row: 0, col: 0, height: 3, width: 5 }] } },
  }, "*");
});
await page.waitForTimeout(150);
const result = await page.evaluate(() => ({ messages: window.__messages }));
console.log(JSON.stringify(result));
await task.finish({ keep: [] });
`;
}
