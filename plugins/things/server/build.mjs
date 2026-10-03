import { readFileSync, writeFileSync } from "node:fs";

const esbuildPath = process.env.THINGS_ESBUILD ?? "esbuild";
const { build } = await import(esbuildPath);
const nodePaths = process.env.THINGS_NODE_MODULES ? [process.env.THINGS_NODE_MODULES] : [];

const root = new URL("../", import.meta.url);

/** Drop ESM export keywords so the modules can be concatenated for the browser. */
function inline(source) {
  return source.replace(/^export\s+(?=(class|function|const|let|var|async)\b)/gm, "");
}

const style = readFileSync(new URL("ui/workspace.css", root), "utf8");
const script = inline(readFileSync(new URL("ui/workspace.js", root), "utf8"));
const template = readFileSync(new URL("ui/workspace.template.html", root), "utf8");
writeFileSync(
  new URL("ui/workspace.html", root),
  template.replace("__STYLE__", style).replace("__SCRIPT__", script),
);

const result = await build({
  entryPoints: [new URL("server/src.mjs", root).pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: new URL("server/things.mjs", root).pathname,
  legalComments: "none",
  minifyWhitespace: true,
  nodePaths,
  banner: { js: "#!/usr/bin/env node" },
  write: false,
  absWorkingDir: "/",
});
writeFileSync(new URL("server/things.mjs", root), result.outputFiles[0].text, {
  mode: 0o755,
});
