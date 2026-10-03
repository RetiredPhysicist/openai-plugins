/**
 * Read-only access to the Things 3 SQLite database.
 *
 * Things stores scheduled dates as packed integers, so every date that leaves
 * this module is already an ISO string. Callers never see the packed format.
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const GROUP_CONTAINER = join(
  homedir(),
  "Library",
  "Group Containers",
  "JLMPQHK86H.com.culturedcode.ThingsMac",
);

const TYPE = { TODO: 0, PROJECT: 1, HEADING: 2 };
const STATUS = { INCOMPLETE: 0, CANCELED: 2, COMPLETED: 3 };
const START = { INBOX: 0, ANYTIME: 1, SOMEDAY: 2 };

export class ThingsUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "ThingsUnavailableError";
  }
}

/**
 * Resolve the live database. Things moved the file under a versioned
 * `ThingsData-*` directory in 3.15.16, so both layouts are searched.
 */
export function resolveDatabasePath() {
  const versioned = join(GROUP_CONTAINER, "Things Database.thingsdatabase", "main.sqlite");
  if (existsSync(versioned)) return versioned;

  const legacy = join(GROUP_CONTAINER, "Things Database.thingsdatabase", "main.sqlite");
  if (existsSync(legacy)) return legacy;

  let entries;
  try {
    entries = readdirSync(GROUP_CONTAINER);
  } catch {
    throw new ThingsUnavailableError(
      "Things 3 is not installed, or its database has never been created.",
    );
  }
  const dataDir = entries.find((name) => name.startsWith("ThingsData-"));
  if (!dataDir) {
    throw new ThingsUnavailableError(
      "Things 3 data directory was not found. Open Things once and try again.",
    );
  }
  const nested = join(GROUP_CONTAINER, dataDir, "Things Database.thingsdatabase", "main.sqlite");
  if (existsSync(nested)) return nested;
  throw new ThingsUnavailableError("Things 3 database file was not found.");
}

/** Decode the packed `YYYYYYYYYYYMMMMDDDDD0000000` calendar date. */
export function decodeThingsDate(value) {
  if (!value) return null;
  const year = (value & 0b111111111110000000000000000) >>> 16;
  const month = (value & 0b000000000001111000000000000) >>> 12;
  const day = (value & 0b000000000000000111110000000) >>> 7;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Decode the packed `hhhhmmmmmm00000000000000000000` clock time. */
export function decodeThingsTime(value) {
  if (!value) return null;
  const hour = value >>> 26;
  const minute = (value >>> 20) & 0b111111;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Encode an ISO date into the packed Things calendar format. */
export function encodeThingsDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid date: ${iso}`);
  const [, year, month, day] = match.map(Number);
  return (year << 16) | (month << 12) | (day << 7);
}

function unixToIso(value) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function todayParts(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso, packed: encodeThingsDate(iso) };
}

const TASK_COLUMNS = `
  TASK.uuid            AS uuid,
  TASK.type            AS type,
  TASK.status          AS status,
  TASK.start           AS start,
  TASK.title           AS title,
  TASK.notes           AS notes,
  TASK."index"         AS sortIndex,
  TASK.todayIndex      AS todayIndex,
  TASK.startDate       AS startDatePacked,
  TASK.deadline        AS deadlinePacked,
  TASK.reminderTime    AS reminderTimePacked,
  TASK.deadlineSuppressionDate AS deadlineSuppressedAt,
  TASK.rt1_recurrenceRule      AS recurrenceRule,
  TASK.project         AS projectId,
  PROJECT.title        AS projectTitle,
  TASK.heading         AS headingId,
  HEADING.title        AS headingTitle,
  COALESCE(TASK.area, PROJECT.area) AS areaId,
  AREA.title           AS areaTitle,
  TASK.stopDate        AS stopDateUnix,
  TASK.creationDate    AS creationDateUnix,
  TASK.userModificationDate AS modificationDateUnix,
  TASK.trashed         AS trashed
`;

const TASK_JOINS = `
  FROM TMTask AS TASK
  LEFT JOIN TMTask AS PROJECT ON PROJECT.uuid = TASK.project
  LEFT JOIN TMTask AS HEADING ON HEADING.uuid = TASK.heading
  LEFT JOIN TMTask AS PROJECT_OF_HEADING ON PROJECT_OF_HEADING.uuid = HEADING.project
  LEFT JOIN TMArea AS AREA ON AREA.uuid = COALESCE(TASK.area, PROJECT.area)
`;

function mapTask(row) {
  if (!row) return null;
  const startDate = decodeThingsDate(row.startDatePacked);
  const reminderTime = decodeThingsTime(row.reminderTimePacked);
  return {
    id: row.uuid,
    type: row.type === TYPE.PROJECT ? "project" : row.type === TYPE.HEADING ? "heading" : "todo",
    status:
      row.status === STATUS.COMPLETED
        ? "completed"
        : row.status === STATUS.CANCELED
          ? "canceled"
          : "open",
    title: row.title ?? "",
    notes: row.notes ?? "",
    list: row.start === START.INBOX ? "Inbox" : row.start === START.ANYTIME ? "Anytime" : "Someday",
    todayIndex: row.todayIndex ?? 0,
    sortIndex: row.sortIndex ?? 0,
    startDate,
    deadline: decodeThingsDate(row.deadlinePacked),
    reminder: startDate && reminderTime ? `${startDate}T${reminderTime}` : null,
    reminderTime,
    projectId: row.projectId ?? null,
    project: row.projectTitle ?? null,
    headingId: row.headingId ?? null,
    heading: row.headingTitle ?? null,
    areaId: row.areaId ?? null,
    area: row.areaTitle ?? null,
    // A suppression date means the user pushed this overdue deadline out of
    // Today. It is not the Reminders "urgent" flag, so it gets its own name.
    deadlineSuppressed: row.deadlineSuppressedAt !== null && row.deadlineSuppressedAt !== 0,
    repeating: Boolean(row.recurrenceRule),
    completedAt: unixToIso(row.stopDateUnix),
    createdAt: unixToIso(row.creationDateUnix),
    modifiedAt: unixToIso(row.modificationDateUnix),
  };
}

export class ThingsDatabase {
  constructor(path = resolveDatabasePath()) {
    if (!existsSync(path)) {
      throw new ThingsUnavailableError(`Things database not found at ${path}`);
    }
    this.path = path;
    this.db = new DatabaseSync(path, { readOnly: true });
  }

  close() {
    this.db.close();
  }

  all(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  get(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

  /** Tags for a batch of task ids, returned as a Map of id -> string[]. */
  tagsFor(taskIds) {
    const map = new Map();
    if (!taskIds.length) return map;
    const placeholders = taskIds.map(() => "?").join(",");
    const rows = this.all(
      `SELECT TASK_TAG.tasks AS taskId, TAG.title AS title
       FROM TMTaskTag AS TASK_TAG
       JOIN TMTag AS TAG ON TAG.uuid = TASK_TAG.tags
       WHERE TASK_TAG.tasks IN (${placeholders})
       ORDER BY TAG."index"`,
      taskIds,
    );
    for (const row of rows) {
      if (!map.has(row.taskId)) map.set(row.taskId, []);
      map.get(row.taskId).push(row.title);
    }
    return map;
  }

  /** Checklist items for one task, ordered the way Things shows them. */
  checklistFor(taskId) {
    return this.all(
      `SELECT uuid AS id, title, status, stopDate AS stopDateUnix
       FROM TMChecklistItem
       WHERE task = ?
       ORDER BY "index"`,
      [taskId],
    ).map((row) => ({
      id: row.id,
      title: row.title ?? "",
      completed: row.status === STATUS.COMPLETED,
      completedAt: unixToIso(row.stopDateUnix),
    }));
  }

  /** Attach tags to a list of mapped tasks. */
  withTags(tasks, options = {}) {
    if (!tasks.length) return tasks;
    const tags = this.tagsFor(tasks.map((task) => task.id));
    return tasks.map((task) => {
      const enriched = { ...task, tags: tags.get(task.id) ?? [] };
      if (options.checklist && task.type === "todo") {
        enriched.checklist = this.checklistFor(task.id);
      }
      return enriched;
    });
  }

  /**
   * Base task query. Filters mirror the semantics of things-py so views agree
   * with the Things app rather than with a naive `status = 0` read.
   */
  queryTasks({
    types = null,
    status = STATUS.INCOMPLETE,
    start,
    contextTrashed = false,
    extra = [],
    order = 'TASK."index"',
    params = [],
  } = {}) {
    const clauses = [];
    const values = [];

    if (types?.length) {
      clauses.push(`TASK.type IN (${types.map(() => "?").join(",")})`);
      values.push(...types);
    }
    if (status !== null) {
      clauses.push("TASK.status = ?");
      values.push(status);
    }
    if (start !== undefined && start !== null) {
      clauses.push("TASK.start = ?");
      values.push(start);
    }
    clauses.push("TASK.trashed = 0");
    clauses.push("TASK.rt1_recurrenceRule IS NULL");
    // A task inside a trashed project or heading is not visible in any view.
    if (contextTrashed === false) {
      clauses.push("NOT IFNULL(PROJECT.trashed, 0)");
      clauses.push("NOT IFNULL(PROJECT_OF_HEADING.trashed, 0)");
    }
    clauses.push(...extra);
    values.push(...params);

    const rows = this.all(
      `SELECT ${TASK_COLUMNS} ${TASK_JOINS}
       WHERE ${clauses.join(" AND ")}
       ORDER BY ${order}`,
      values,
    );
    return rows.map(mapTask);
  }

  /** Inbox: open to-dos with no project and no scheduled date. */
  inbox() {
    return this.queryTasks({
      start: START.INBOX,
    });
  }

  /**
   * Today, predicted the way things-py does: scheduled today or earlier from
   * Anytime and Someday, plus unscheduled tasks with an overdue deadline.
   */
  today(now = new Date()) {
    const { packed } = todayParts(now);
    const regular = this.queryTasks({
      start: START.ANYTIME,
      extra: ["TASK.startDate IS NOT NULL"],
      order: "TASK.todayIndex",
    });
    const unconfirmedScheduled = this.queryTasks({
      start: START.SOMEDAY,
      extra: ["TASK.startDate IS NOT NULL", "TASK.startDate <= ?"],
      order: "TASK.todayIndex",
      params: [packed],
    });
    const overdue = this.queryTasks({
      start: null,
      extra: [
        "TASK.startDate IS NULL",
        "TASK.deadline IS NOT NULL",
        "TASK.deadline <= ?",
        "(TASK.deadlineSuppressionDate IS NULL OR TASK.deadlineSuppressionDate = 0)",
      ],
      order: "TASK.deadline",
      params: [packed],
    });

    const seen = new Set();
    return [...regular, ...unconfirmedScheduled, ...overdue]
      .filter((task) => {
        if (seen.has(task.id)) return false;
        seen.add(task.id);
        return true;
      })
      .sort((a, b) => {
        const index = (a.todayIndex ?? 0) - (b.todayIndex ?? 0);
        if (index !== 0) return index;
        return String(a.startDate ?? "").localeCompare(String(b.startDate ?? ""));
      });
  }

  /** Scheduled after today. */
  upcoming(now = new Date()) {
    const { packed } = todayParts(now);
    return this.queryTasks({
      extra: ["TASK.startDate IS NOT NULL", "TASK.startDate > ?"],
      order: "TASK.startDate, TASK.todayIndex",
      params: [packed],
    });
  }

  anytime() {
    return this.queryTasks({ start: START.ANYTIME });
  }

  someday() {
    return this.queryTasks({
      start: START.SOMEDAY,
      extra: ["TASK.startDate IS NULL"],
    });
  }

  logbook(now = new Date()) {
    return this.queryTasks({
      status: null,
      extra: ["TASK.status IN (2, 3)", "TASK.stopDate IS NOT NULL"],
      order: "TASK.stopDate DESC",
    });
  }

  trashed() {
    const rows = this.all(
      `SELECT ${TASK_COLUMNS} ${TASK_JOINS}
       WHERE TASK.trashed = 1 AND TASK.rt1_recurrenceRule IS NULL
       ORDER BY TASK.userModificationDate DESC`,
    );
    return rows.map(mapTask);
  }

  /** Todos in a project, with headings and standalone todos in app order. */
  projectItems(projectId) {
    const todos = this.queryTasks({
      extra: ["(TASK.project = ? OR PROJECT.uuid = ?)", "TASK.type = 0"],
      order: 'TASK."index"',
      params: [projectId, projectId],
    });
    const headings = this.queryTasks({
      types: [TYPE.HEADING],
      extra: ["TASK.project = ?"],
      order: 'TASK."index"',
      params: [projectId],
    });
    return { todos, headings };
  }

  getTask(id) {
    const row = this.get(
      `SELECT ${TASK_COLUMNS} ${TASK_JOINS} WHERE TASK.uuid = ?`,
      [id],
    );
    if (!row) return null;
    const task = mapTask(row);
    task.tags = this.tagsFor([id]).get(id) ?? [];
    if (task.type === "todo") task.checklist = this.checklistFor(id);
    if (task.type === "project") task.items = this.projectItems(id);
    return task;
  }

  projects() {
    const rows = this.queryTasks({ types: [TYPE.PROJECT], order: 'TASK."index"' });
    const counts = new Map(
      this.all(
        `SELECT project AS id, COUNT(*) AS open
         FROM TMTask
         WHERE type = 0 AND status = 0 AND trashed = 0 AND project IS NOT NULL
         GROUP BY project`,
      ).map((row) => [row.id, row.open]),
    );
    return this.withTags(rows).map((project) => ({
      ...project,
      openCount: counts.get(project.id) ?? 0,
    }));
  }

  areas() {
    const rows = this.all(
      `SELECT uuid AS id, title, "index" AS sortIndex FROM TMArea ORDER BY "index"`,
    );
    const counts = new Map(
      this.all(
        `SELECT PROJECT.area AS id, COUNT(*) AS open
         FROM TMTask AS TASK
         JOIN TMTask AS PROJECT ON PROJECT.uuid = TASK.project
         WHERE TASK.type = 0 AND TASK.status = 0 AND TASK.trashed = 0 AND PROJECT.area IS NOT NULL
         GROUP BY PROJECT.area`,
      ).map((row) => [row.id, row.open]),
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title ?? "",
      openCount: counts.get(row.id) ?? 0,
    }));
  }

  tags() {
    return this.all(
      `SELECT TAG.uuid AS id, TAG.title, TAG.parent AS parentId, TAG."index" AS sortIndex,
              (SELECT COUNT(*) FROM TMTaskTag WHERE tags = TAG.uuid) AS usage
       FROM TMTag AS TAG
       ORDER BY TAG."index"`,
    ).map((row) => ({
      id: row.id,
      title: row.title ?? "",
      parentId: row.parentId ?? null,
      usage: row.usage,
    }));
  }

  search(query, { includeCompleted = false } = {}) {
    const like = `%${query.replace(/[%_]/g, (char) => `\\${char}`)}%`;
    const statusClause = includeCompleted ? "" : "AND TASK.status = 0";
    const rows = this.all(
      `SELECT ${TASK_COLUMNS} ${TASK_JOINS}
       WHERE TASK.type IN (0, 1)
         AND TASK.trashed = 0
         AND TASK.rt1_recurrenceRule IS NULL
         AND (TASK.title LIKE ? ESCAPE '\\' OR TASK.notes LIKE ? ESCAPE '\\')
         ${statusClause}
       ORDER BY TASK.userModificationDate DESC`,
      [like, like],
    );
    return rows.map(mapTask);
  }

  /** The auth token Things puts in the URL scheme. Never log or persist it. */
  authToken() {
    const row = this.get(
      `SELECT uriSchemeAuthenticationToken AS token FROM TMSettings LIMIT 1`,
    );
    return row?.token ?? null;
  }

  /**
   * Counts come from the same functions that produce the views, so the counter
   * and the list can never disagree.
   */
  counts() {
    return {
      inbox: this.inbox().length,
      today: this.today().length,
      upcoming: this.upcoming().length,
      anytime: this.anytime().length,
      someday: this.someday().length,
      projects: this.projects().length,
      areas: this.areas().length,
      tags: this.tags().length,
    };
  }
}
