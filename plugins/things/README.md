<p align="center">
  <img src="./assets/things-demo.webp" width="100%" alt="The Things workspace in Codex">
</p>

# things

Your Things 3 to-dos in a Codex workspace.

Things opens your Things 3 data in a Codex workspace: Inbox, Today, Upcoming, Anytime, Someday,
projects, areas, tags, search, task details, quick add, and completion. It runs entirely on your Mac —
no account, no cloud service, and no background helper.

**Reads** go straight to the local Things database in read-only mode. **Writes** go through Things
itself using its URL scheme, and every write is read back before the tool reports success.

## Install

```bash
codex plugin marketplace add RetiredPhysicist/openai-plugins
codex plugin add things@retiredphysicist
```

Then open **Things** in the Codex sidebar.

## Requirements

- macOS with Things 3 installed and opened at least once.
- Node.js 22.5 or later, because the plugin uses the built-in `node:sqlite` module.
- For updates, enable **Things → Settings → General → Enable Things URLs**, then **Manage** to turn on
  authentication. Adding and reading to-dos works without it; editing and completing need it.

Creating or renaming an area uses AppleScript, so macOS asks for automation permission the first time.
Reads and to-do writes never need that permission.

## Tools

| tool | what it does |
| --- | --- |
| `open_workspace` | open the interactive workspace (sidebar without a model call) |
| `get_tasks` | read one view: inbox, today, upcoming, anytime, someday, logbook, trash |
| `get_task` / `get_project` | read one item with notes, tags, checklist, headings |
| `get_sidebar` / `get_tagged` | sidebar counts, projects, areas, tags; open tasks for one tag |
| `search_things` | search to-dos and projects by title and notes |
| `add_todo` / `update_todo` / `complete_todo` | create, edit, complete, or reopen a to-do |
| `add_project` / `update_project` | create or edit a project |
| `move_todos` | move many to-dos into a project or area in one batch |
| `create_area` / `update_area` | create an area or rename it (AppleScript) |
| `show_in_things` | bring Things to the front showing one item |

## Limits

Things' automation surface cannot create repeat rules, cannot create standalone headings, and cannot
delete items. Use the Things app for those.

## License

MIT
