# openai-plugins

Agent Plugins for ChatGPT / Codex. Plugin dirs live under `plugins/`. Only
`markwire` and `things` currently have a `package.json` (private build tooling
for committed bundles).

## Release / version a package

For packages with `package.json`, `script/version-packages.mjs` writes the
same version into `package.json`, `plugin.json`, and the package lock:

```bash
node script/version-packages.mjs markwire 1.0.1   # or things
```

Commit that and push. Those packages stay private — no npm publish.
Distribution is the Codex / ChatGPT marketplace.

`all-search` / `dejavu-memory`: bump `plugin.json` by hand until they gain a
package.json.

## Checks

```bash
cd plugins/markwire   # or plugins/things
npm ci
npm test
npm run build         # committed bundle must stay in sync
```

CI also validates every `plugin.json` via `scripts/validate-plugins.mjs`.
