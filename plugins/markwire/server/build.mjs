import { readFileSync, writeFileSync } from "node:fs";

const esbuildPath = process.env.MARKWIRE_ESBUILD ?? "esbuild";
const { build } = await import(esbuildPath);
const nodePaths = process.env.MARKWIRE_NODE_MODULES ? [process.env.MARKWIRE_NODE_MODULES] : [];

const root = new URL("../", import.meta.url);

function inline(source) {
  return source.replace(/^export\s+(?=(class|function|const|let|var)\b)/gm, "");
}

const style = readFileSync(new URL("ui/editor.css", root), "utf8");
const script = [
  readFileSync(new URL("ui/board.js", root), "utf8"),
  readFileSync(new URL("ui/components.js", root), "utf8"),
  readFileSync(new URL("ui/icons.js", root), "utf8"),
  readFileSync(new URL("ui/editor.js", root), "utf8"),
]
  .map(inline)
  .map((source) => source.replace(/^import\s+\{[^}]*\}\s+from\s+"\.\/(components|icons)\.js";\s*$/gm, ""))
  .join("\n");

const template = readFileSync(new URL("ui/editor.template.html", root), "utf8");
writeFileSync(new URL("ui/editor.html", root), template
  .replace("__STYLE__", style)
  .replace("__SCRIPT__", script));

const result = await build({
  entryPoints: [new URL("server/src.mjs", root).pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: new URL("server/server.mjs", root).pathname,
  legalComments: "none",
  minifyWhitespace: true,
  nodePaths,
  banner: { js: "#!/usr/bin/env node" },
  write: false,
  absWorkingDir: "/",
});
writeFileSync(
  new URL("server/server.mjs", root),
  result.outputFiles[0].text,
  { mode: 0o755 },
);
