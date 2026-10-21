#!/usr/bin/env node
// Checks every plugin against the Agent Plugins 1.0.0 rules that a client
// treats as fatal (§5.2 closed manifest, §5.5 name constraints, §6.1 fixed
// component locations). Kept dependency-free so CI needs no install step.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const MANIFEST_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const ALLOWED_FIELDS = new Set([
  "$schema", "name", "version", "description", "author",
  "homepage", "repository", "license", "keywords", "extensions",
]);
const NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

const failures = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);

function readJson(path, where) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(where, `unreadable JSON (${error.message})`);
    return null;
  }
}

function checkManifest(dir, name) {
  const path = join(dir, "plugin.json");
  if (!existsSync(path)) {
    fail(name, "plugin.json is missing");
    return;
  }
  const manifest = readJson(path, `${name}/plugin.json`);
  if (!manifest) return;

  for (const field of Object.keys(manifest)) {
    if (!ALLOWED_FIELDS.has(field)) {
      fail(`${name}/plugin.json`, `unknown top-level field "${field}"`);
    }
  }
  if (manifest.$schema !== MANIFEST_SCHEMA) {
    fail(`${name}/plugin.json`, `$schema must be ${MANIFEST_SCHEMA}`);
  }
  if (typeof manifest.name !== "string" || !NAME_PATTERN.test(manifest.name)) {
    fail(`${name}/plugin.json`, `name "${manifest.name}" violates the 1-64 lowercase constraint`);
  }
  if (manifest.extensions !== undefined && typeof manifest.extensions !== "object") {
    fail(`${name}/plugin.json`, "extensions must be an object");
  }
}

function checkSkills(dir, name) {
  const skillsDir = join(dir, "skills");
  if (!existsSync(skillsDir)) return;
  if (!statSync(skillsDir).isDirectory()) {
    fail(`${name}/skills`, "must be a directory");
    return;
  }
  for (const entry of readdirSync(skillsDir)) {
    const skillDir = join(skillsDir, entry);
    if (!statSync(skillDir).isDirectory()) {
      fail(`${name}/skills/${entry}`, "skills/ may only contain directories");
      continue;
    }
    if (!existsSync(join(skillDir, "SKILL.md"))) {
      fail(`${name}/skills/${entry}`, "directory has no SKILL.md");
    }
  }
}

function checkMcp(dir, name) {
  const path = join(dir, "mcp.json");
  if (!existsSync(path)) return;
  const config = readJson(path, `${name}/mcp.json`);
  if (!config) return;
  for (const [server, entry] of Object.entries(config.mcpServers ?? {})) {
    if (!entry || typeof entry !== "object") {
      fail(`${name}/mcp.json`, `server "${server}" is not an object`);
    }
  }
}

const pluginsDir = join(ROOT, "plugins");
for (const name of readdirSync(pluginsDir)) {
  const dir = join(pluginsDir, name);
  if (!statSync(dir).isDirectory()) continue;
  checkManifest(dir, name);
  checkSkills(dir, name);
  checkMcp(dir, name);
}

const marketplace = readJson(join(ROOT, ".agents/plugins/marketplace.json"), "marketplace.json");
if (marketplace) {
  for (const entry of marketplace.plugins ?? []) {
    const target = join(ROOT, entry.source?.path ?? "");
    if (!existsSync(join(target, "plugin.json"))) {
      fail("marketplace.json", `"${entry.name}" points at ${entry.source?.path}, which has no plugin.json`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log("plugin manifests and component locations conform to Agent Plugins 1.0.0");
