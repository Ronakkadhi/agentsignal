import { Hono } from "hono";
import { nanoid } from "nanoid";
import { db } from "../store/sqlite.js";

const follow = new Hono();

const MAX_FOLLOWS_PER_IP = 10;
const MAX_FOLLOWS_TOTAL = 1000;

interface FollowRow {
  id: string;
  topics: string;
  sources: string | null;
  types: string | null;
  min_score: number;
  ip: string;
  created_at: string;
}

/** POST /follow — Create a topic subscription */
follow.post("/", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  // Check per-IP limit
  const ipCount = db
    .prepare("SELECT COUNT(*) as count FROM follows WHERE ip = ?")
    .get(ip) as { count: number };
  if (ipCount.count >= MAX_FOLLOWS_PER_IP) {
    return c.json(
      {
        ok: false,
        error: `Max ${MAX_FOLLOWS_PER_IP} follows per IP. Delete one first.`,
      },
      429
    );
  }

  // Global limit
  const totalCount = db
    .prepare("SELECT COUNT(*) as count FROM follows")
    .get() as { count: number };
  if (totalCount.count >= MAX_FOLLOWS_TOTAL) {
    return c.json(
      { ok: false, error: "Follow limit reached. Try again later." },
      503
    );
  }

  // Parse body
  let body: {
    topics?: string[];
    sources?: string[];
    types?: string[];
    min_score?: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        ok: false,
        error:
          'Invalid JSON. Expected: {"topics": ["ai", "crypto"], "min_score": 50}',
      },
      400
    );
  }

  if (!body.topics || !Array.isArray(body.topics) || body.topics.length === 0) {
    return c.json(
      { ok: false, error: '"topics" array is required. e.g. ["ai", "crypto"]' },
      400
    );
  }

  if (body.topics.length > 10) {
    return c.json(
      { ok: false, error: "Max 10 topics per follow." },
      400
    );
  }

  const followId = `f_${nanoid(10)}`;
  const topics = body.topics.map((t) => t.toLowerCase().trim());
  const sources = body.sources?.map((s) => s.toLowerCase().trim());
  const types = body.types?.map((t) => t.toLowerCase().trim());
  const minScore = body.min_score ?? 0;

  db.prepare(
    "INSERT INTO follows (id, topics, sources, types, min_score, ip) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    followId,
    JSON.stringify(topics),
    sources ? JSON.stringify(sources) : null,
    types ? JSON.stringify(types) : null,
    minScore,
    ip
  );

  return c.json({
    ok: true,
    follow_id: followId,
    topics,
    min_score: minScore,
    feed_url: `/feed?follow=${followId}`,
    delete_url: `/follow/${followId}`,
    message: `Follow created. Poll /feed?follow=${followId} to get your filtered feed.`,
  });
});

/** GET /follow/:id — Get follow details */
follow.get("/:id", (c) => {
  const id = c.req.param("id");
  const row = db.prepare("SELECT * FROM follows WHERE id = ?").get(id) as
    | FollowRow
    | undefined;

  if (!row) {
    return c.json({ ok: false, error: "Follow not found." }, 404);
  }

  return c.json({
    ok: true,
    follow: {
      id: row.id,
      topics: JSON.parse(row.topics),
      sources: row.sources ? JSON.parse(row.sources) : undefined,
      types: row.types ? JSON.parse(row.types) : undefined,
      min_score: row.min_score,
      created_at: row.created_at,
      feed_url: `/feed?follow=${row.id}`,
    },
  });
});

/** DELETE /follow/:id — Remove a follow */
follow.delete("/:id", (c) => {
  const id = c.req.param("id");
  const result = db.prepare("DELETE FROM follows WHERE id = ?").run(id);

  if (result.changes === 0) {
    return c.json({ ok: false, error: "Follow not found." }, 404);
  }

  return c.json({ ok: true, message: "Follow deleted." });
});

/** GET /follow — List all follows for the caller's IP */
follow.get("/", (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  const rows = db
    .prepare("SELECT * FROM follows WHERE ip = ?")
    .all(ip) as FollowRow[];

  const myFollows = rows.map((row) => ({
    id: row.id,
    topics: JSON.parse(row.topics),
    min_score: row.min_score,
    feed_url: `/feed?follow=${row.id}`,
    created_at: row.created_at,
  }));

  return c.json({ ok: true, count: myFollows.length, follows: myFollows });
});

/** Resolve a follow ID into query filters (used by /feed) */
export function resolveFollow(followId: string) {
  const row = db
    .prepare("SELECT * FROM follows WHERE id = ?")
    .get(followId) as FollowRow | undefined;

  if (!row) return null;

  return {
    id: row.id,
    topics: JSON.parse(row.topics) as string[],
    sources: row.sources
      ? (JSON.parse(row.sources) as string[])
      : undefined,
    types: row.types ? (JSON.parse(row.types) as string[]) : undefined,
    minScore: row.min_score,
    createdAt: row.created_at,
    ip: row.ip,
  };
}

export { follow };
