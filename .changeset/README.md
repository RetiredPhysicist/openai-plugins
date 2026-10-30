# Changesets

This folder stores [Changesets](https://github.com/changesets/changesets) entries for this monorepo.

## Preferred version path

1. In a feature PR, run `npx changeset` (from the repo root) and commit the generated markdown under `.changeset/`.
2. After merge to `main`, `.github/workflows/release.yml` opens a **Version Packages** PR (version bumps + changelogs; also syncs each package's `plugin.json` when present).
3. Merge that PR. Packages under `plugins/markwire` and `plugins/things` are `private` build tooling — `changeset publish` skips them. Distribution remains the Codex / ChatGPT plugin marketplace, not npm.

Only workspaces with a `package.json` are discovered today (`markwire`, `things`). `all-search` and `dejavu-memory` version only via `plugin.json` until they gain a package.json.

Do not add secrets here. See the root README **Release** section.
