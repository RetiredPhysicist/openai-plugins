---
name: things
description: Read and update the user's Things 3 to-dos. Use when the user asks about their inbox, today's tasks, upcoming work, projects, areas, tags, deadlines, or wants to add, edit, or complete a to-do in Things.
---

# Things 3

## What to do first

Call `open_workspace` when the user wants to browse or manage tasks visually.
Use the typed tools when the request is a single read or write.

## Views

`get_tasks` takes one of: `inbox`, `today`, `upcoming`, `anytime`, `someday`,
`logbook`, `trash`. Prefer `today` for "what's on my plate", `inbox` for
unsorted capture, and `upcoming` for planning ahead.

## Dates

Use ISO dates: `YYYY-MM-DD` for an all-day date, `YYYY-MM-DD@HH:MM` for a
reminder. Keywords `today`, `tomorrow`, `evening`, `anytime`, and `someday`
are also accepted. Never pass a natural-language date such as "next Tuesday".

## Writes

- `add_todo`, `update_todo`, `complete_todo`, `add_project`, `update_project`,
  `move_todos`, `create_area`, and `update_area` change Things.
- Every write is verified by reading the item back. If a tool reports
  `write_unconfirmed`, the change did not take effect; tell the user instead
  of retrying blindly.
- Updates need the Things URL authentication token. The server reads it from
  Things automatically. If it is missing, ask the user to enable
  **Settings → General → Enable Things URLs → Manage**.

## Things limits

- The Things automation surface cannot create repeat rules or standalone
  headings, and cannot delete items. Tell the user to do those in the app.
- `create_area` and `update_area` use AppleScript, so macOS asks for
  automation permission the first time. Reads and to-do writes do not.

## Safety

- Never invent an id. Read the task first when the user names it by title.
- Confirm before completing a large batch.
- Do not claim a write succeeded unless the tool returned the updated item.
