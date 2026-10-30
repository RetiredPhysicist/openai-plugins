#!/usr/bin/env bash
# Run Changesets version, then keep plugin.json in sync when present.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
npx changeset version

for dir in "$root"/plugins/*/; do
  [ -f "$dir/package.json" ] || continue
  [ -f "$dir/plugin.json" ] || continue
  node - "$dir" <<'JS'
const fs = require("fs");
const path = require("path");
const dir = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
const pluginPath = path.join(dir, "plugin.json");
const plugin = JSON.parse(fs.readFileSync(pluginPath, "utf8"));
if (plugin.version !== pkg.version) {
  plugin.version = pkg.version;
  fs.writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + "\n");
  console.log("synced plugin.json →", pkg.version, "(" + path.basename(dir) + ")");
} else {
  console.log("already in sync:", path.basename(dir), pkg.version);
}
JS
done
