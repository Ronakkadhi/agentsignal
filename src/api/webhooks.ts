import { Hono } from "hono";
import { nanoid } from "nanoid";
import { db } from "../store/sqlite.js";

const webhooks = new Hono();

const MAX_WEBHOOKS_PER_IP = 5;
const MAX_WEBHOOKS_TOTAL = 100;

// Private IP ranges to block (SSRF prevention)
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /localhost/i,
];

function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Must be HTTPS
    if (parsed.protocol !== "https:") return true;
    // Check against private IP patterns
    return PRIVATE_IP_PATTERNS.some((p) => p.test(parsed.hostname));
  } catch {
    return true;
  }
}

interface WebhookRow {
  id: string;
  url: string;
  topics: string | null;
  min_score: number;
  created_at: string;
  consecutive_failures: number;
  last_failure: string | null;
  dead: number;
  ip: string;
}

/** POST /webhooks — Register a webhook */
webhooks.post("/", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  // Per-IP limit
  const ipCount = db
    .prepare("SELECT COUNT(*) as count FROM webhooks WHERE ip = ?")
    .get(ip) as { count: number };
  if (ipCount.count >= MAX_WEBHOOKS_PER_IP) {
    return c.json(
      { ok: false, error: `Max ${MAX_WEBHOOKS_PER_IP} webhooks per IP.` },
      429
    );
  }

  // Global limit
  const totalCount = db
    .prepare("SELECT COUNT(*) as count FROM webhooks")
    .get() as { count: number };
  if (totalCount.count >= MAX_WEBHOOKS_TOTAL) {
    return c.json(
      { ok: false, error: "Webhook limit reached." },
      503
    );
  }

  // Parse body
  let body: { url?: string; topics?: string[]; min_score?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { ok: false, error: 'Invalid JSON. Expected: {"url": "https://...", "topics": ["ai"]}' },
      400
    );
  }

  if (!body.url || typeof body.url !== "string") {
    return c.json({ ok: false, error: '"url" is required.' }, 400);
  }

  // Security: validate URL
  if (isPrivateUrl(body.url)) {
    return c.json(
      { ok: false, error: "Webhook URL must be HTTPS and not a private/local address." },
      400
    );
  }

  if (body.topics && body.topics.length > 10) {
    return c.json({ ok: false, error: "Max 10 topics per webhook." }, 400);
  }

  const webhookId = `wh_${nanoid(10)}`;
  const topics = body.topics?.map((t) => t.toLowerCase().trim());
  const minScore = body.min_score ?? 0;

  db.prepare(
    "INSERT INTO webhooks (id, url, topics, min_score, ip) VALUES (?, ?, ?, ?, ?)"
  ).run(
    webhookId,
    body.url,
    topics ? JSON.stringify(topics) : null,
    minScore,
    ip
  );

  return c.json({
    ok: true,
    webhook_id: webhookId,
    url: body.url,
    topics: topics || "all",
    min_score: minScore,
    message: "Webhook registered. You'll receive POST requests when matching signals arrive.",
  });
});

/** GET /webhooks — List registered webhooks for caller's IP */
webhooks.get("/", (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  const rows = db
    .prepare("SELECT * FROM webhooks WHERE ip = ?")
    .all(ip) as WebhookRow[];

  const result = rows.map((row) => ({
    id: row.id,
    url: row.url,
    topics: row.topics ? JSON.parse(row.topics) : "all",
    min_score: row.min_score,
    status: row.dead ? "dead" : "active",
    consecutive_failures: row.consecutive_failures,
    last_failure: row.last_failure,
    created_at: row.created_at,
  }));

  return c.json({ ok: true, count: result.length, webhooks: result });
});

/** DELETE /webhooks/:id — Remove a webhook */
webhooks.delete("/:id", (c) => {
  const id = c.req.param("id");
  const result = db.prepare("DELETE FROM webhooks WHERE id = ?").run(id);

  if (result.changes === 0) {
    return c.json({ ok: false, error: "Webhook not found." }, 404);
  }

  return c.json({ ok: true, message: "Webhook deleted." });
});

export { webhooks };
