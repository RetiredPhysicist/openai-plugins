# openai-plugins

Agent Plugins for ChatGPT / Codex. Plugin dirs live under `plugins/`. Only
`markwire` and `things` currently have a `package.json` (private build tooling
for committed bundles).

## Release / version a package

Preferred for packages with `package.json`: Changesets from the repo root
(`npm ci --workspaces=false`, then `npx changeset`). Merging to `main` lets
`.github/workflows/release.yml` open a Version Packages PR (also syncs
`plugin.json`). Those packages stay private — no npm publish. Distribution is
the Codex / ChatGPT marketplace.

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
