import Database, { type Database as DatabaseType } from "better-sqlite3";
import { Signal, SignalType, SourceStatus } from "../types.js";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env.DB_PATH || "./data/agentsignal.db";

// Ensure directory exists
const dir = dirname(DB_PATH);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    url TEXT NOT NULL,
    topics TEXT NOT NULL DEFAULT '[]',
    score INTEGER NOT NULL DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    enriched INTEGER NOT NULL DEFAULT 0,
    entities TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
  CREATE INDEX IF NOT EXISTS idx_signals_score ON signals(score DESC);
  CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source);
  CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_url ON signals(url) WHERE url != '';

  CREATE TABLE IF NOT EXISTS follows (
    id TEXT PRIMARY KEY,
    topics TEXT NOT NULL DEFAULT '[]',
    sources TEXT,
    types TEXT,
    min_score INTEGER NOT NULL DEFAULT 0,
    ip TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS source_status (
    name TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    last_fetched TEXT,
    last_error TEXT,
    signal_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    topics TEXT,
    min_score INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_failure TEXT,
    dead INTEGER NOT NULL DEFAULT 0,
    ip TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS enrichments (
    signal_id TEXT PRIMARY KEY,
    entities TEXT NOT NULL,
    summary TEXT NOT NULL,
    category TEXT NOT NULL,
    enriched_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (signal_id) REFERENCES signals(id)
  );
`);

// Prepared statements for performance
const insertSignal = db.prepare(`
  INSERT OR IGNORE INTO signals (id, timestamp, type, source, title, summary, url, topics, score, metadata, created_at)
  VALUES (@id, @timestamp, @type, @source, @title, @summary, @url, @topics, @score, @metadata, @createdAt)
`);

const insertManySignals = db.transaction((signals: any[]) => {
  let added = 0;
  for (const s of signals) {
    const result = insertSignal.run(s);
    if (result.changes > 0) added++;
  }
  return added;
});

class SignalStore {
  add(signals: Signal[]): number {
    if (signals.length === 0) return 0;

    const rows = signals.map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      type: s.type,
      source: s.source,
      title: s.title,
      summary: s.summary,
      url: s.url,
      topics: JSON.stringify(s.topics),
      score: s.score,
      metadata: JSON.stringify(s.metadata || {}),
      createdAt: new Date().toISOString(),
    }));

    return insertManySignals(rows);
  }

  query(filters: {
    type?: string[];
    source?: string[];
    topic?: string;
    minScore?: number;
    limit?: number;
    after?: string;
    from?: string;
    to?: string;
    sinceId?: string;
  }): Signal[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.type?.length) {
      conditions.push(
        `type IN (${filters.type.map(() => "?").join(",")})`
      );
      params.push(...filters.type);
    }

    if (filters.source?.length) {
      conditions.push(
        `source IN (${filters.source.map(() => "?").join(",")})`
      );
      params.push(...filters.source);
    }

    if (filters.topic) {
      const topic = filters.topic.toLowerCase();
      conditions.push(
        "(LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(topics) LIKE ?)"
      );
      params.push(`%${topic}%`, `%${topic}%`, `%${topic}%`);
    }

    if (filters.minScore !== undefined) {
      conditions.push("score >= ?");
      params.push(filters.minScore);
    }

    // Handle time range: from/to take precedence over after
    if (filters.from) {
      conditions.push("timestamp >= ?");
      params.push(filters.from);
      if (filters.to) {
        conditions.push("timestamp <= ?");
        params.push(filters.to);
      }
    } else if (filters.after) {
      conditions.push("timestamp > ?");
      params.push(filters.after);
    }

    // since_id: find the signal and get only newer ones
    if (filters.sinceId) {
      const ref = db
        .prepare("SELECT timestamp FROM signals WHERE id = ?")
        .get(filters.sinceId) as { timestamp: string } | undefined;
      if (ref) {
        conditions.push("timestamp > ?");
        params.push(ref.timestamp);
      }
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(filters.limit || 30, 500);

    const rows = db
      .prepare(
        `SELECT * FROM signals ${where} ORDER BY score DESC, timestamp DESC LIMIT ?`
      )
      .all(...params, limit) as any[];

    return rows.map(rowToSignal);
  }

  getAll(): Signal[] {
    const rows = db
      .prepare(
        "SELECT * FROM signals ORDER BY score DESC, timestamp DESC LIMIT 1000"
      )
      .all() as any[];
    return rows.map(rowToSignal);
  }

  updateSourceStatus(
    name: string,
    type: SignalType,
    status: "active" | "error",
    error?: string,
    count?: number
  ) {
    db.prepare(
      `INSERT INTO source_status (name, type, status, last_fetched, last_error, signal_count)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         type = excluded.type,
         status = excluded.status,
         last_fetched = CASE WHEN excluded.status = 'active' THEN excluded.last_fetched ELSE source_status.last_fetched END,
         last_error = excluded.last_error,
         signal_count = CASE WHEN excluded.signal_count > 0 THEN excluded.signal_count ELSE source_status.signal_count END`
    ).run(
      name,
      type,
      status,
      status === "active" ? new Date().toISOString() : null,
      error || null,
      count ?? 0
    );
  }

  getSources(): SourceStatus[] {
    const rows = db.prepare("SELECT * FROM source_status").all() as any[];
    return rows.map((r) => ({
      name: r.name,
      type: r.type as SignalType,
      status: r.status as "active" | "error" | "pending",
      lastFetched: r.last_fetched,
      lastError: r.last_error,
      signalCount: r.signal_count,
    }));
  }

  getStats() {
    const signalCount = db
      .prepare("SELECT COUNT(*) as count FROM signals")
      .get() as { count: number };
    const sourceCount = db
      .prepare("SELECT COUNT(*) as count FROM source_status")
      .get() as { count: number };
    return {
      totalSignals: signalCount.count,
      sources: sourceCount.count,
    };
  }

  /** Get a signal by ID (for delta support) */
  getById(id: string): Signal | null {
    const row = db.prepare("SELECT * FROM signals WHERE id = ?").get(id) as any;
    return row ? rowToSignal(row) : null;
  }

  /** Get unenriched signals above a score threshold */
  getUnenriched(minScore: number, limit: number): Signal[] {
    const rows = db
      .prepare(
        "SELECT * FROM signals WHERE enriched = 0 AND score >= ? ORDER BY score DESC LIMIT ?"
      )
      .all(minScore, limit) as any[];
    return rows.map(rowToSignal);
  }

  /** Mark a signal as enriched */
  markEnriched(signalId: string, entities: string): void {
    db.prepare(
      "UPDATE signals SET enriched = 1, entities = ? WHERE id = ?"
    ).run(entities, signalId);
  }

  /** Cleanup old signals (older than days) */
  cleanup(days: number): number {
    const cutoff = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000
    ).toISOString();
    const result = db
      .prepare("DELETE FROM signals WHERE created_at < ?")
      .run(cutoff);
    return result.changes;
  }
}

function rowToSignal(row: any): Signal {
  return {
    id: row.id,
    timestamp: row.timestamp,
    type: row.type as SignalType,
    source: row.source,
    title: row.title,
    summary: row.summary,
    url: row.url,
    topics: JSON.parse(row.topics || "[]"),
    score: row.score,
    metadata: JSON.parse(row.metadata || "{}"),
  };
}

export const store = new SignalStore();

// Export db for follow.ts and webhooks.ts to use directly
export { db };

// Daily cleanup: delete signals older than 7 days
setInterval(
  () => {
    const deleted = store.cleanup(7);
    if (deleted > 0) {
      console.log(`[store] Cleaned up ${deleted} signals older than 7 days`);
    }
  },
  24 * 60 * 60 * 1000
); // Run every 24 hours
