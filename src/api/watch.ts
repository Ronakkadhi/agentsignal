import { Hono } from "hono";
import { nanoid } from "nanoid";
import { store } from "../store/memory.js";
import { formatMarkdown } from "../formatter/markdown.js";

const watch = new Hono();

// In-memory watch store
interface Watch {
  id: string;
  topics: string[];
  sources?: string[];
  types?: string[];
  minScore: number;
  createdAt: string;
  ip: string;
}

const watches = new Map<string, Watch>();
const MAX_WATCHES_PER_IP = 10;
const MAX_WATCHES_TOTAL = 1000;

/** POST /watch — Create a topic subscription */
watch.post("/", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  // Check per-IP limit
  const ipWatches = Array.from(watches.values()).filter((w) => w.ip === ip);
  if (ipWatches.length >= MAX_WATCHES_PER_IP) {
    return c.json(
      {
        ok: false,
        error: `Max ${MAX_WATCHES_PER_IP} watches per IP. Delete one first.`,
      },
      429
    );
  }

  // Global limit
  if (watches.size >= MAX_WATCHES_TOTAL) {
    return c.json(
      { ok: false, error: "Watch limit reached. Try again later." },
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
      { ok: false, error: "Max 10 topics per watch." },
      400
    );
  }

  const watchId = `w_${nanoid(10)}`;
  const watchObj: Watch = {
    id: watchId,
    topics: body.topics.map((t) => t.toLowerCase().trim()),
    sources: body.sources?.map((s) => s.toLowerCase().trim()),
    types: body.types?.map((t) => t.toLowerCase().trim()),
    minScore: body.min_score ?? 0,
    createdAt: new Date().toISOString(),
    ip,
  };

  watches.set(watchId, watchObj);

  return c.json({
    ok: true,
    watch_id: watchId,
    topics: watchObj.topics,
    min_score: watchObj.minScore,
    feed_url: `/feed?watch=${watchId}`,
    delete_url: `/watch/${watchId}`,
    message: `Watch created. Poll /feed?watch=${watchId} to get your filtered feed.`,
  });
});

/** GET /watch/:id — Get watch details */
watch.get("/:id", (c) => {
  const id = c.req.param("id");
  const w = watches.get(id);

  if (!w) {
    return c.json({ ok: false, error: "Watch not found." }, 404);
  }

  return c.json({
    ok: true,
    watch: {
      id: w.id,
      topics: w.topics,
      sources: w.sources,
      types: w.types,
      min_score: w.minScore,
      created_at: w.createdAt,
      feed_url: `/feed?watch=${w.id}`,
    },
  });
});

/** DELETE /watch/:id — Remove a watch */
watch.delete("/:id", (c) => {
  const id = c.req.param("id");
  if (!watches.has(id)) {
    return c.json({ ok: false, error: "Watch not found." }, 404);
  }

  watches.delete(id);
  return c.json({ ok: true, message: "Watch deleted." });
});

/** GET /watch — List all watches for the caller's IP */
watch.get("/", (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  const myWatches = Array.from(watches.values())
    .filter((w) => w.ip === ip)
    .map((w) => ({
      id: w.id,
      topics: w.topics,
      min_score: w.minScore,
      feed_url: `/feed?watch=${w.id}`,
      created_at: w.createdAt,
    }));

  return c.json({ ok: true, count: myWatches.length, watches: myWatches });
});

/** Resolve a watch ID into query filters (used by /feed) */
export function resolveWatch(watchId: string) {
  return watches.get(watchId) || null;
}

export { watch };
