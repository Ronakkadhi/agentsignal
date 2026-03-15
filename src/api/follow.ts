import { Hono } from "hono";
import { nanoid } from "nanoid";
import { store } from "../store/memory.js";
import { formatMarkdown } from "../formatter/markdown.js";

const follow = new Hono();

// In-memory follow store
interface Follow {
  id: string;
  topics: string[];
  sources?: string[];
  types?: string[];
  minScore: number;
  createdAt: string;
  ip: string;
}

const follows = new Map<string, Follow>();
const MAX_FOLLOWS_PER_IP = 10;
const MAX_FOLLOWS_TOTAL = 1000;

/** POST /follow — Create a topic subscription */
follow.post("/", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  // Check per-IP limit
  const ipFollows = Array.from(follows.values()).filter((f) => f.ip === ip);
  if (ipFollows.length >= MAX_FOLLOWS_PER_IP) {
    return c.json(
      {
        ok: false,
        error: `Max ${MAX_FOLLOWS_PER_IP} follows per IP. Delete one first.`,
      },
      429
    );
  }

  // Global limit
  if (follows.size >= MAX_FOLLOWS_TOTAL) {
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
  const followObj: Follow = {
    id: followId,
    topics: body.topics.map((t) => t.toLowerCase().trim()),
    sources: body.sources?.map((s) => s.toLowerCase().trim()),
    types: body.types?.map((t) => t.toLowerCase().trim()),
    minScore: body.min_score ?? 0,
    createdAt: new Date().toISOString(),
    ip,
  };

  follows.set(followId, followObj);

  return c.json({
    ok: true,
    follow_id: followId,
    topics: followObj.topics,
    min_score: followObj.minScore,
    feed_url: `/feed?follow=${followId}`,
    delete_url: `/follow/${followId}`,
    message: `Follow created. Poll /feed?follow=${followId} to get your filtered feed.`,
  });
});

/** GET /follow/:id — Get follow details */
follow.get("/:id", (c) => {
  const id = c.req.param("id");
  const f = follows.get(id);

  if (!f) {
    return c.json({ ok: false, error: "Follow not found." }, 404);
  }

  return c.json({
    ok: true,
    follow: {
      id: f.id,
      topics: f.topics,
      sources: f.sources,
      types: f.types,
      min_score: f.minScore,
      created_at: f.createdAt,
      feed_url: `/feed?follow=${f.id}`,
    },
  });
});

/** DELETE /follow/:id — Remove a follow */
follow.delete("/:id", (c) => {
  const id = c.req.param("id");
  if (!follows.has(id)) {
    return c.json({ ok: false, error: "Follow not found." }, 404);
  }

  follows.delete(id);
  return c.json({ ok: true, message: "Follow deleted." });
});

/** GET /follow — List all follows for the caller's IP */
follow.get("/", (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  const myFollows = Array.from(follows.values())
    .filter((f) => f.ip === ip)
    .map((f) => ({
      id: f.id,
      topics: f.topics,
      min_score: f.minScore,
      feed_url: `/feed?follow=${f.id}`,
      created_at: f.createdAt,
    }));

  return c.json({ ok: true, count: myFollows.length, follows: myFollows });
});

/** Resolve a follow ID into query filters (used by /feed) */
export function resolveFollow(followId: string) {
  return follows.get(followId) || null;
}

export { follow };
