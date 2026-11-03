// Agent Plugins carry their version in plugin.json; the package.json next to it
// versions the build tooling. Keep the two in step.
// Usage: node script/version-packages.mjs <plugin> <version>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [plugin, version] = process.argv.slice(2);

if (!plugin || !version) {
  console.error("usage: node script/version-packages.mjs <plugin> <version>");
  process.exit(1);
}
if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
  console.error("version must be X.Y.Z, got: " + version);
  process.exit(1);
}

const dir = join(root, "plugins", plugin);
const pkgPath = join(dir, "package.json");
if (!existsSync(pkgPath)) {
  console.error("no package.json in plugins/" + plugin);
  process.exit(1);
}

const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const write = (name, value) =>
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + "\n");

const pkg = read("package.json");
pkg.version = version;
write("package.json", pkg);

if (existsSync(join(dir, "plugin.json"))) {
  const manifest = read("plugin.json");
  manifest.version = version;
  write("plugin.json", manifest);
}

execFileSync(
  "npm",
  ["install", "--package-lock-only", "--workspaces=false", "--ignore-scripts", "--no-audit", "--no-fund"],
  { cwd: dir, stdio: "inherit" },
);

console.log(plugin + " -> " + version);
