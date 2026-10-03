import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { ThingsDatabase, ThingsUnavailableError } from "./things-db.js";
import {
  ThingsWriteError,
  addTodoUrl,
  addProjectUrl,
  updateTodoUrl,
  updateProjectUrl,
  batchUpdateUrl,
  createArea,
  updateArea,
  showUrl,
  openUrl,
} from "./things-write.js";

const UI_URI = "ui://things/workspace.html";

/**
 * Monochrome 20x20 sidebar icon using currentColor, per the MCP extensions
 * entrypoint icon guidance.
 */
const SIDEBAR_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 5.5l1.5 1.5 2.5-3'/%3E%3Cpath d='M3.5 12.5l1.5 1.5 2.5-3'/%3E%3Cpath d='M10.5 6h6M10.5 13h6'/%3E%3C/svg%3E";

const MODEL_AND_APP = { ui: { visibility: ["model", "app"] } };
const APP_ONLY = { ui: { visibility: ["app"] } };

let database = null;

function db() {
  if (!database) database = new ThingsDatabase();
  return database;
}

function resetDatabase() {
  if (database) {
    try {
      database.close();
    } catch {
      // The connection is already gone; a new one is opened below.
    }
  }
  database = null;
}

/** Normalize any thrown error into a structured tool failure. */
function failure(error) {
  if (error instanceof ThingsUnavailableError || error instanceof ThingsWriteError) {
    return {
      isError: true,
      content: [{ type: "text", text: error.message }],
      structuredContent: { error: { code: error.code ?? error.name, message: error.message } },
    };
  }
  return {
    isError: true,
    content: [{ type: "text", text: `Things request failed: ${error.message}` }],
    structuredContent: { error: { code: "internal_error", message: error.message } },
  };
}

function listResult(items, extra = {}) {
  return {
    content: [
      {
        type: "text",
        text: items.length
          ? items.map(formatTaskLine).join("\n")
          : "No items.",
      },
    ],
    structuredContent: { items, count: items.length, ...extra },
  };
}

function formatTaskLine(task) {
  const parts = [task.status === "completed" ? "[x]" : "[ ]", task.title];
  if (task.project) parts.push(`(${task.project})`);
  if (task.deadline) parts.push(`deadline ${task.deadline}`);
  else if (task.startDate) parts.push(`start ${task.startDate}`);
  if (task.tags?.length) parts.push(task.tags.map((tag) => `#${tag}`).join(" "));
  return parts.join(" ");
}

const viewEnum = z.enum(["inbox", "today", "upcoming", "anytime", "someday", "logbook", "trash"]);

function readView(view) {
  switch (view) {
    case "inbox":
      return db().inbox();
    case "today":
      return db().today();
    case "upcoming":
      return db().upcoming();
    case "anytime":
      return db().anytime();
    case "someday":
      return db().someday();
    case "logbook":
      return db().logbook();
    case "trash":
      return db().trashed();
    default:
      throw new ThingsWriteError(`Unknown view: ${view}`, { code: "unknown_view" });
  }
}

/**
 * Run a write, then read the row back so a command that Things never applied
 * cannot be reported as success.
 */
async function writeAndVerify(url, { id, expect }) {
  await openUrl(url);
  const task = await waitForTask(id, expect);
  return task;
}

async function waitForTask(id, expect, { attempts = 12, delayMs = 120 } = {}) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    resetDatabase();
    last = db().getTask(id);
    if (last && expect(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new ThingsWriteError(
    "Things did not apply the change. Open Things and try again.",
    {
      code: "write_unconfirmed",
      detail: last ? `Current title: ${last.title}` : "Item not found after the write.",
    },
  );
}

export function createServer() {
  const server = new McpServer(
    {
      name: "things",
      version: "1.0.0",
      icons: [{ src: SIDEBAR_ICON, mimeType: "image/svg+xml", sizes: ["20x20"] }],
    },
    {
      instructions:
        "Use the Things tools to read and update the user's Things 3 data. Prefer open_workspace when the user wants to browse or manage tasks. Dates are ISO (YYYY-MM-DD); a reminder is YYYY-MM-DD@HH:MM. Every write is verified by reading the item back, so never claim a change that a tool did not confirm.",
    },
  );

  registerAppResource(
    server,
    "Things workspace",
    UI_URI,
    { description: "Interactive Things 3 workspace" },
    async () => ({
      contents: [
        {
          uri: UI_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: readFileSync(new URL("../ui/workspace.html", import.meta.url), "utf8"),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { connectDomains: [], resourceDomains: [] },
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "open_workspace",
    {
      title: "Things",
      description:
        "Open the Things 3 workspace: lists, projects, areas, tags, task details, quick add, and search.",
      inputSchema: {
        view: viewEnum.optional().describe("Optional view to focus when the workspace opens."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: {
        ui: {
          resourceUri: UI_URI,
          visibility: ["model"],
        },
        "openai/ui": { entrypoints: [{ type: "thread" }, { type: "global" }] },
        "openai/toolInvocation/invoking": "Opening Things\u2026",
        "openai/toolInvocation/invoked": "Things ready",
      },
    },
    async ({ view }) => ({
      structuredContent: { view: view ?? "today" },
      content: [{ type: "text", text: "Opening the Things workspace." }],
    }),
  );

  registerAppTool(
    server,
    "get_tasks",
    {
      title: "Get tasks",
      description:
        "Read one Things view: inbox, today, upcoming, anytime, someday, logbook, or trash.",
      inputSchema: {
        view: viewEnum.describe("Things view to read."),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: MODEL_AND_APP,
    },
    async ({ view, limit }) => {
      try {
        const items = db().withTags(readView(view));
        const page = limit ? items.slice(0, limit) : items;
        return listResult(page, { total: items.length, view });
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "get_sidebar",
    {
      title: "Get sidebar",
      description: "Read counts, projects, areas, and tags for the workspace sidebar.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: APP_ONLY,
    },
    async () => {
      try {
        return {
          content: [{ type: "text", text: "Sidebar data." }],
          structuredContent: {
            counts: db().counts(),
            projects: db().projects(),
            areas: db().areas(),
            tags: db().tags(),
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "get_project",
    {
      title: "Get project",
      description: "Read a project with its headings and to-dos.",
      inputSchema: { id: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: APP_ONLY,
    },
    async ({ id }) => {
      try {
        const task = db().getTask(id);
        if (!task) {
          return {
            isError: true,
            content: [{ type: "text", text: "Project not found." }],
            structuredContent: { error: { code: "not_found", message: "Project not found." } },
          };
        }
        return {
          content: [{ type: "text", text: `${task.title}: ${task.items.todos.length} to-dos` }],
          structuredContent: { task, todos: task.items.todos, headings: task.items.headings },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "get_task",
    {
      title: "Get task",
      description: "Read one task with notes, tags, and checklist items.",
      inputSchema: { id: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: MODEL_AND_APP,
    },
    async ({ id }) => {
      try {
        const task = db().getTask(id);
        if (!task) {
          return {
            isError: true,
            content: [{ type: "text", text: "Task not found." }],
            structuredContent: { error: { code: "not_found", message: "Task not found." } },
          };
        }
        return {
          content: [{ type: "text", text: formatTaskLine(task) }],
          structuredContent: { task },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "get_tagged",
    {
      title: "Get tagged tasks",
      description: "Read open tasks that carry a tag.",
      inputSchema: { tag: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: APP_ONLY,
    },
    async ({ tag }) => {
      try {
        const items = db()
          .queryTasks({ extra: ["TASK.uuid IN (SELECT tasks FROM TMTaskTag JOIN TMTag ON TMTag.uuid = TMTaskTag.tags WHERE TMTag.title = ?)"], params: [tag] });
        return listResult(db().withTags(items), { tag });
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "search_things",
    {
      title: "Search Things",
      description: "Search to-dos and projects by title and notes.",
      inputSchema: {
        query: z.string().min(1),
        includeCompleted: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: MODEL_AND_APP,
    },
    async ({ query, includeCompleted, limit }) => {
      try {
        const items = db().withTags(db().search(query, { includeCompleted }));
        const page = limit ? items.slice(0, limit) : items;
        return listResult(page, { total: items.length, query });
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "add_todo",
    {
      title: "Add to-do",
      description: "Create a to-do in Things.",
      inputSchema: {
        title: z.string().min(1),
        notes: z.string().optional(),
        when: z.string().optional().describe("today, tomorrow, evening, anytime, someday, YYYY-MM-DD, or YYYY-MM-DD@HH:MM."),
        deadline: z.string().optional(),
        tags: z.array(z.string()).optional(),
        checklist: z.array(z.string()).optional(),
        listId: z.string().optional().describe("Project or area id."),
        list: z.string().optional().describe("Project or area title."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: MODEL_AND_APP,
    },
    async (input) => {
      try {
        const before = new Set(db().queryTasks({ status: null }).map((task) => task.id));
        const url = addTodoUrl(input);
        await openUrl(url);
        const created = await waitForNewTask(before, input.title);
        return {
          content: [{ type: "text", text: `Created "${created.title}" (${created.id}).` }],
          structuredContent: { task: created },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "update_todo",
    {
      title: "Update to-do",
      description: "Update a to-do's title, notes, dates, tags, or checklist.",
      inputSchema: {
        id: z.string().min(1),
        title: z.string().optional(),
        notes: z.string().optional(),
        when: z.string().optional(),
        deadline: z.string().optional(),
        tags: z.array(z.string()).optional(),
        addTags: z.array(z.string()).optional(),
        checklist: z.array(z.string()).optional(),
        appendChecklist: z.array(z.string()).optional(),
        listId: z.string().optional(),
        list: z.string().optional(),
        completed: z.boolean().optional(),
        canceled: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: MODEL_AND_APP,
    },
    async (input) => {
      try {
        const url = updateTodoUrl(input, db().authToken());
        await openUrl(url);
        const expected = (task) =>
          (input.title === undefined || task.title === input.title) &&
          (input.completed === undefined || (task.status === "completed") === input.completed);
        const task = await waitForTask(input.id, expected);
        return {
          content: [{ type: "text", text: `Updated "${task.title}".` }],
          structuredContent: { task },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "complete_todo",
    {
      title: "Complete to-do",
      description: "Mark a to-do complete or reopen it.",
      inputSchema: {
        id: z.string().min(1),
        completed: z.boolean().optional().describe("Defaults to true."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
      _meta: MODEL_AND_APP,
    },
    async ({ id, completed = true }) => {
      try {
        const url = updateTodoUrl({ id, completed }, db().authToken());
        await openUrl(url);
        const task = await waitForTask(id, (item) => (item.status === "completed") === completed);
        return {
          content: [{ type: "text", text: completed ? `Completed "${task.title}".` : `Reopened "${task.title}".` }],
          structuredContent: { task },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "add_project",
    {
      title: "Add project",
      description: "Create a project in Things.",
      inputSchema: {
        title: z.string().min(1),
        notes: z.string().optional(),
        when: z.string().optional(),
        deadline: z.string().optional(),
        tags: z.array(z.string()).optional(),
        areaId: z.string().optional(),
        area: z.string().optional(),
        todos: z.array(z.string()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: MODEL_AND_APP,
    },
    async (input) => {
      try {
        const before = new Set(db().queryTasks({ types: [1], status: null }).map((task) => task.id));
        await openUrl(addProjectUrl(input));
        const created = await waitForNewTask(before, input.title, { types: [1] });
        return {
          content: [{ type: "text", text: `Created project "${created.title}".` }],
          structuredContent: { task: created },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "update_project",
    {
      title: "Update project",
      description: "Update a project's title, notes, dates, or tags.",
      inputSchema: {
        id: z.string().min(1),
        title: z.string().optional(),
        notes: z.string().optional(),
        when: z.string().optional(),
        deadline: z.string().optional(),
        tags: z.array(z.string()).optional(),
        completed: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: MODEL_AND_APP,
    },
    async (input) => {
      try {
        await openUrl(updateProjectUrl(input, db().authToken()));
        const task = await waitForTask(input.id, (item) => input.title === undefined || item.title === input.title);
        return {
          content: [{ type: "text", text: `Updated project "${task.title}".` }],
          structuredContent: { task },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "move_todos",
    {
      title: "Move to-dos",
      description: "Move many to-dos into one project or area in a single batch.",
      inputSchema: {
        ids: z.array(z.string().min(1)).min(1).max(50),
        listId: z.string().min(1),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: MODEL_AND_APP,
    },
    async ({ ids, listId }) => {
      try {
        const operations = ids.map((id) => ({
          type: "to-do",
          operation: "update",
          id,
          attributes: { "list-id": listId },
        }));
        await openUrl(batchUpdateUrl(operations, db().authToken()));
        const moved = await waitForProjectMove(ids, listId);
        return {
          content: [{ type: "text", text: `Moved ${moved.length} to-dos.` }],
          structuredContent: { items: moved, count: moved.length },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "create_area",
    {
      title: "Create area",
      description: "Create an area in Things. Uses AppleScript, so macOS may ask for automation permission the first time.",
      inputSchema: { title: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: MODEL_AND_APP,
    },
    async ({ title }) => {
      try {
        const id = await createArea(title);
        await new Promise((resolve) => setTimeout(resolve, 300));
        resetDatabase();
        const area = db().areas().find((item) => item.id === id);
        if (!area) {
          throw new ThingsWriteError("Area creation could not be confirmed.", {
            code: "write_unconfirmed",
          });
        }
        return {
          content: [{ type: "text", text: `Created area "${area.title}".` }],
          structuredContent: { area },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "update_area",
    {
      title: "Update area",
      description: "Rename an area or replace its tags. Uses AppleScript.",
      inputSchema: {
        id: z.string().min(1),
        title: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: MODEL_AND_APP,
    },
    async (input) => {
      try {
        await updateArea(input);
        await new Promise((resolve) => setTimeout(resolve, 300));
        resetDatabase();
        const area = db().areas().find((item) => item.id === input.id);
        if (!area) {
          throw new ThingsWriteError("Area update could not be confirmed.", {
            code: "write_unconfirmed",
          });
        }
        return {
          content: [{ type: "text", text: `Updated area "${area.title}".` }],
          structuredContent: { area },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  registerAppTool(
    server,
    "show_in_things",
    {
      title: "Show in Things",
      description: "Bring Things to the front showing one item.",
      inputSchema: { id: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: APP_ONLY,
    },
    async ({ id }) => {
      try {
        await openUrl(showUrl(id));
        return { content: [{ type: "text", text: "Opened in Things." }], structuredContent: { id } };
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

async function waitForNewTask(before, title, { types = [0, 1], attempts = 15, delayMs = 150 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    resetDatabase();
    const match = db()
      .queryTasks({ types, status: null })
      .find((task) => task.title === title && !before.has(task.id));
    if (match) return db().getTask(match.id);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new ThingsWriteError("The new item did not appear in Things.", {
    code: "write_unconfirmed",
  });
}

async function waitForProjectMove(ids, listId, { attempts = 15, delayMs = 150 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    resetDatabase();
    const tasks = ids.map((id) => db().getTask(id)).filter(Boolean);
    if (tasks.length === ids.length && tasks.every((task) => task.projectId === listId || task.areaId === listId)) {
      return tasks;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new ThingsWriteError("The move could not be confirmed.", { code: "write_unconfirmed" });
}

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("Things server failed:", error);
  process.exit(1);
});

export { db, resetDatabase };
