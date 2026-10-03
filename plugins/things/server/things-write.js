/**
 * Write path for Things.
 *
 * Things exposes no write API, so every mutation goes through the Things URL
 * scheme, with AppleScript only for the two operations the URL scheme lacks
 * (areas). This module constructs commands and never reports success on its
 * own: callers must verify with a read-back.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export class ThingsWriteError extends Error {
  constructor(message, { code = "write_failed", detail = null } = {}) {
    super(message);
    this.name = "ThingsWriteError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Build a `things:///` URL. Values are fully percent-encoded, so a slash or
 * ampersand inside a title can never be read as syntax.
 */
export function buildUrl(command, params = {}) {
  const query = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    const encoded = Array.isArray(value) ? value.join(",") : String(value);
    query.push(`${encodeURIComponent(key)}=${encodeURIComponent(encoded)}`);
  }
  const suffix = query.length ? `?${query.join("&")}` : "";
  return `things:///${command}${suffix}`;
}

/**
 * Normalize the `when` argument into the shape Things accepts.
 *
 * Accepts the app keywords, ISO dates, and a `@HH:MM` reminder suffix. An
 * unknown string is rejected instead of silently becoming an invalid command.
 */
export function normalizeWhen(when) {
  if (when === undefined || when === null || when === "") return null;
  const value = String(when).trim();
  const keywords = new Set([
    "today",
    "tomorrow",
    "evening",
    "anytime",
    "someday",
  ]);
  if (keywords.has(value.toLowerCase())) return value.toLowerCase();

  const [datePart, timePart] = value.split("@");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    throw new ThingsWriteError(`Invalid date for "when": ${when}`, {
      code: "invalid_when",
    });
  }
  if (timePart !== undefined && !/^\d{1,2}:\d{2}$/.test(timePart)) {
    throw new ThingsWriteError(`Invalid reminder time: ${when}`, {
      code: "invalid_when",
    });
  }
  return timePart === undefined ? datePart : `${datePart}@${timePart}`;
}

function requireTitle(title) {
  const value = String(title ?? "").trim();
  if (!value) throw new ThingsWriteError("title is required", { code: "invalid_title" });
  return value;
}

/**
 * Execute a Things URL without stealing focus. `open -g` keeps Things in the
 * background; the AppleScript shell wrapper lets us detect a launch failure.
 */
export async function openUrl(url, { exec = run } = {}) {
  try {
    await exec("/usr/bin/open", ["-g", url]);
  } catch (error) {
    throw new ThingsWriteError("Could not send the command to Things.", {
      code: "things_unavailable",
      detail: error?.message ?? String(error),
    });
  }
  return true;
}

/** Escape a value for inclusion in an AppleScript string literal. */
export function escapeAppleScript(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function runAppleScript(source, { exec = run } = {}) {
  try {
    const { stdout } = await exec("/usr/bin/osascript", ["-e", source]);
    return stdout.trim();
  } catch (error) {
    throw new ThingsWriteError("Things AppleScript command failed.", {
      code: "applescript_failed",
      detail: error?.stderr?.trim() || error?.message || String(error),
    });
  }
}

/** Build an `add` command for a to-do or project. */
export function addTodoUrl(input) {
  const params = {
    title: requireTitle(input.title),
    notes: input.notes,
    when: normalizeWhen(input.when),
    deadline: input.deadline,
    tags: input.tags,
    "checklist-items": input.checklist?.length ? input.checklist.join("\n") : null,
    "list-id": input.listId,
    list: input.listId ? null : input.list,
    heading: input.headingId ? null : input.heading,
    "heading-id": input.headingId,
  };
  return buildUrl("add", params);
}

export function addProjectUrl(input) {
  const params = {
    title: requireTitle(input.title),
    notes: input.notes,
    when: normalizeWhen(input.when),
    deadline: input.deadline,
    tags: input.tags,
    "area-id": input.areaId,
    area: input.areaId ? null : input.area,
    "to-dos": input.todos?.length ? input.todos.join("\n") : null,
  };
  return buildUrl("add-project", params);
}

/**
 * Build an `update` command. `auth-token` is required by Things for every
 * update, so callers pass the token read from the database.
 */
export function updateTodoUrl(input, token) {
  if (!token) {
    throw new ThingsWriteError(
      "Things URL authentication is required for updates. Enable it in Things → Settings → General → Enable Things URLs → Manage.",
      { code: "auth_token_missing" },
    );
  }
  const params = {
    id: input.id,
    "auth-token": token,
    title: input.title,
    notes: input.notes,
    when: normalizeWhen(input.when),
    deadline: input.deadline,
    completed: input.completed,
    canceled: input.canceled,
    tags: input.tags,
    "add-tags": input.addTags,
    "checklist-items": input.checklist?.length ? input.checklist.join("\n") : null,
    "prepend-checklist-items": input.prependChecklist?.length
      ? input.prependChecklist.join("\n")
      : null,
    "append-checklist-items": input.appendChecklist?.length
      ? input.appendChecklist.join("\n")
      : null,
    "list-id": input.listId,
    list: input.listId ? null : input.list,
    heading: input.headingId ? null : input.heading,
    "heading-id": input.headingId,
  };
  return buildUrl("update", params);
}

export function updateProjectUrl(input, token) {
  if (!token) {
    throw new ThingsWriteError(
      "Things URL authentication is required for updates. Enable it in Things → Settings → General → Enable Things URLs → Manage.",
      { code: "auth_token_missing" },
    );
  }
  const params = {
    id: input.id,
    "auth-token": token,
    title: input.title,
    notes: input.notes,
    when: normalizeWhen(input.when),
    deadline: input.deadline,
    completed: input.completed,
    canceled: input.canceled,
    tags: input.tags,
    "area-id": input.areaId,
    area: input.areaId ? null : input.area,
  };
  return buildUrl("update-project", params);
}

/**
 * Batch updates through the `json` endpoint. One round-trip for many items,
 * which is what makes bulk moves usable.
 */
export function batchUpdateUrl(operations, token) {
  if (!token) {
    throw new ThingsWriteError(
      "Things URL authentication is required for batch updates.",
      { code: "auth_token_missing" },
    );
  }
  const data = JSON.stringify(operations);
  return `things:///json?data=${encodeURIComponent(data)}&auth-token=${encodeURIComponent(token)}`;
}

export function showUrl(id) {
  return buildUrl("show", { id });
}

export function searchUrl(query) {
  return buildUrl("search", { query });
}

/** Area creation has no URL command, so it uses AppleScript. */
export async function createArea(title, { exec = run } = {}) {
  const name = requireTitle(title);
  const script = [
    'tell application "Things3"',
    `  set newArea to make new area with properties {name:"${escapeAppleScript(name)}"}`,
    "  return id of newArea",
    "end tell",
  ].join("\n");
  const id = await runAppleScript(script, { exec });
  if (!id) {
    throw new ThingsWriteError("Things returned no id for the new area.", {
      code: "area_create_unconfirmed",
    });
  }
  return id;
}

export async function updateArea({ id, title, tags }, { exec = run } = {}) {
  if (!id) throw new ThingsWriteError("Area id is required.", { code: "invalid_area" });
  const statements = [];
  if (title !== undefined) {
    statements.push(`set name of theArea to "${escapeAppleScript(title)}"`);
  }
  if (tags !== undefined) {
    statements.push(
      `set tag names of theArea to "${escapeAppleScript(tags.join(","))}"`,
    );
  }
  if (!statements.length) {
    throw new ThingsWriteError("Nothing to update.", { code: "empty_update" });
  }
  const script = [
    'tell application "Things3"',
    `  set theArea to area id "${escapeAppleScript(id)}"`,
    ...statements.map((line) => `  ${line}`),
    "end tell",
  ].join("\n");
  await runAppleScript(script, { exec });
  return true;
}
