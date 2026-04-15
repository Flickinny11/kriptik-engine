/**
 * SQLite-backed trail store implementing ITrailStore.
 *
 * Uses better-sqlite3 for synchronous, single-connection access to the
 * trail database. Synchronous operation is intentional — ESAA event
 * processing happens inline and benefits from not needing async coordination.
 *
 * Schema design:
 * - trails table: one row per ITrailEntry with JSON arrays for multi-value fields
 * - Indexes on taskType, trailType, buildId, recordedAt for efficient queries
 * - IDs are UUIDs generated at insert time
 *
 * Spec Section 6.3 — "Trails are stored in SQLite (structured data)."
 */

import { randomUUID } from "node:crypto";
import type {
  ITrailStore,
  ITrailEntry,
  ITrailQuery,
  TrailType,
  TrailOutcome,
} from "@kriptik/shared-interfaces";

/** SQLite row shape (JSON-serialized array fields, ISO date strings). */
interface TrailRow {
  id: string;
  trailType: string;
  taskType: string;
  decision: string;
  reasoning: string;
  outcome: string;
  evaluatorScore: number | null;
  filesAffected: string; // JSON array
  dependenciesUsed: string; // JSON array
  gotchasEncountered: string; // JSON array
  resolution: string | null;
  buildId: string;
  agentId: string;
  recordedAt: string; // ISO 8601
  lastValidatedAt: string | null; // ISO 8601
}

/**
 * The SQL interface we need from better-sqlite3.
 *
 * Typed minimally to avoid requiring better-sqlite3 as a compile-time
 * dependency in shared-interfaces. The actual better-sqlite3 Database
 * is passed in at construction.
 */
export interface SQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
  close(): void;
}

export interface SQLiteStatement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/**
 * SQLite trail store for structured trail persistence.
 *
 * Expects a better-sqlite3 Database instance passed to the constructor.
 * This keeps the dependency injection clean — the caller controls where
 * the database file lives and how it's opened.
 */
export class TrailStore implements ITrailStore {
  constructor(private readonly _db: SQLiteDatabase) {}

  async initialize(): Promise<void> {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS trails (
        id TEXT PRIMARY KEY,
        trailType TEXT NOT NULL,
        taskType TEXT NOT NULL,
        decision TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        outcome TEXT NOT NULL,
        evaluatorScore REAL,
        filesAffected TEXT NOT NULL DEFAULT '[]',
        dependenciesUsed TEXT NOT NULL DEFAULT '[]',
        gotchasEncountered TEXT NOT NULL DEFAULT '[]',
        resolution TEXT,
        buildId TEXT NOT NULL,
        agentId TEXT NOT NULL,
        recordedAt TEXT NOT NULL,
        lastValidatedAt TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_trails_taskType ON trails(taskType);
      CREATE INDEX IF NOT EXISTS idx_trails_trailType ON trails(trailType);
      CREATE INDEX IF NOT EXISTS idx_trails_buildId ON trails(buildId);
      CREATE INDEX IF NOT EXISTS idx_trails_recordedAt ON trails(recordedAt);
      CREATE INDEX IF NOT EXISTS idx_trails_outcome ON trails(outcome);
    `);
  }

  async insert(trail: Omit<ITrailEntry, "id">): Promise<ITrailEntry> {
    const id = randomUUID();

    const stmt = this._db.prepare(`
      INSERT INTO trails (
        id, trailType, taskType, decision, reasoning, outcome,
        evaluatorScore, filesAffected, dependenciesUsed, gotchasEncountered,
        resolution, buildId, agentId, recordedAt, lastValidatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      trail.trailType,
      trail.taskType,
      trail.decision,
      trail.reasoning,
      trail.outcome,
      trail.evaluatorScore,
      JSON.stringify(trail.filesAffected),
      JSON.stringify(trail.dependenciesUsed),
      JSON.stringify(trail.gotchasEncountered),
      trail.resolution,
      trail.buildId,
      trail.agentId,
      trail.recordedAt.toISOString(),
      trail.lastValidatedAt?.toISOString() ?? null,
    );

    return { id, ...trail };
  }

  async getById(id: string): Promise<ITrailEntry | null> {
    const stmt = this._db.prepare("SELECT * FROM trails WHERE id = ?");
    const row = stmt.get(id) as TrailRow | undefined;
    if (!row) return null;
    return rowToTrail(row);
  }

  async query(params: ITrailQuery): Promise<readonly ITrailEntry[]> {
    const { sql, values } = buildQuery(params);
    const stmt = this._db.prepare(sql);
    const rows = stmt.all(...values) as TrailRow[];
    return rows.map(rowToTrail);
  }

  async markValidated(trailId: string, validatedAt: Date): Promise<void> {
    const stmt = this._db.prepare(
      "UPDATE trails SET lastValidatedAt = ? WHERE id = ?",
    );
    stmt.run(validatedAt.toISOString(), trailId);
  }

  async count(params: ITrailQuery): Promise<number> {
    const { sql, values } = buildQuery(params, true);
    const stmt = this._db.prepare(sql);
    const result = stmt.get(...values) as { count: number } | undefined;
    return result?.count ?? 0;
  }

  async getTaskTypeCoverage(): Promise<ReadonlyMap<string, number>> {
    const stmt = this._db.prepare(
      "SELECT taskType, COUNT(*) as count FROM trails GROUP BY taskType",
    );
    const rows = stmt.all() as Array<{ taskType: string; count: number }>;
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.taskType, row.count);
    }
    return map;
  }

  async close(): Promise<void> {
    this._db.close();
  }
}

/** Convert a SQLite row to an ITrailEntry. */
function rowToTrail(row: TrailRow): ITrailEntry {
  return {
    id: row.id,
    trailType: row.trailType as TrailType,
    taskType: row.taskType,
    decision: row.decision,
    reasoning: row.reasoning,
    outcome: row.outcome as TrailOutcome,
    evaluatorScore: row.evaluatorScore,
    filesAffected: JSON.parse(row.filesAffected) as string[],
    dependenciesUsed: JSON.parse(row.dependenciesUsed) as string[],
    gotchasEncountered: JSON.parse(row.gotchasEncountered) as string[],
    resolution: row.resolution,
    buildId: row.buildId,
    agentId: row.agentId,
    recordedAt: new Date(row.recordedAt),
    lastValidatedAt: row.lastValidatedAt
      ? new Date(row.lastValidatedAt)
      : null,
  };
}

/** Build a SELECT query from ITrailQuery parameters. */
function buildQuery(
  params: ITrailQuery,
  countOnly = false,
): { sql: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.buildId) {
    conditions.push("buildId = ?");
    values.push(params.buildId);
  }
  if (params.agentId) {
    conditions.push("agentId = ?");
    values.push(params.agentId);
  }
  if (params.taskType) {
    conditions.push("taskType = ?");
    values.push(params.taskType);
  }
  if (params.trailType) {
    conditions.push("trailType = ?");
    values.push(params.trailType);
  }
  if (params.outcome) {
    conditions.push("outcome = ?");
    values.push(params.outcome);
  }
  if (params.recordedAfter) {
    conditions.push("recordedAt > ?");
    values.push(params.recordedAfter.toISOString());
  }

  const select = countOnly
    ? "SELECT COUNT(*) as count FROM trails"
    : "SELECT * FROM trails";

  const where =
    conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

  let orderClause = "";
  if (!countOnly) {
    const orderBy = params.orderBy ?? "recordedAt";
    const direction = params.orderDirection ?? "desc";
    orderClause = ` ORDER BY ${orderBy} ${direction}`;
  }

  let limitClause = "";
  if (!countOnly && params.limit) {
    limitClause = ` LIMIT ?`;
    values.push(params.limit);
  }

  return {
    sql: `${select}${where}${orderClause}${limitClause}`,
    values,
  };
}
