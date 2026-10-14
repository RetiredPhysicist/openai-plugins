import { writeFileSync } from "node:fs";
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: [new URL("./src.mjs", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: new URL("./bridge.mjs", import.meta.url).pathname,
  legalComments: "none",
  minifyWhitespace: true,
  packages: "external",
  banner: { js: "" },
});
console.log("built server/bridge.mjs");
