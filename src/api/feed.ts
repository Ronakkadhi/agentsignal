import { Hono } from "hono";
import { createHash } from "crypto";
import { store } from "../store/sqlite.js";
import { formatMarkdown } from "../formatter/markdown.js";
import { resolveFollow } from "./follow.js";

const feed = new Hono();

feed.get("/", (c) => {
  // Check for follow-based filtering
  const followId = c.req.query("follow");
  let followTopics: string[] | undefined;
  let followSources: string[] | undefined;
  let followTypes: string[] | undefined;
  let followMinScore: number | undefined;

  if (followId) {
    const f = resolveFollow(followId);
    if (!f) {
      return c.json({ ok: false, error: "Follow not found. Create one via POST /follow." }, 404);
    }
    followTopics = f.topics;
    followSources = f.sources;
    followTypes = f.types;
    followMinScore = f.minScore;
  }

  // Parse query params (explicit params override follow defaults)
  const type = c.req.query("type")?.split(",").filter(Boolean) || followTypes;
  const source = c.req.query("source")?.split(",").filter(Boolean) || followSources;
  const minScore = c.req.query("min_score")
    ? parseInt(c.req.query("min_score")!)
    : followMinScore;
  const limit = c.req.query("limit")
    ? parseInt(c.req.query("limit")!)
    : undefined;
  const after = c.req.query("after");
  const format = c.req.query("format") || "markdown";

  // Delta support: since_id cursor pagination
  const sinceId = c.req.query("since_id");

  // Historical replay: from/to time range
  const from = c.req.query("from");
  const to = c.req.query("to");

  // For follow-based queries, we do multi-topic OR matching
  const topic = c.req.query("topic");

  let signals;
  if (followTopics && !topic) {
    const allSignals = store.query({
      type, source, minScore, limit: 100, after,
      sinceId, from, to,
    });
    signals = allSignals.filter((s) => {
      const text = `${s.title} ${s.summary} ${s.topics.join(" ")}`.toLowerCase();
      return followTopics!.some((t) => text.includes(t));
    });
    if (limit) signals = signals.slice(0, Math.min(limit, 100));
    else signals = signals.slice(0, 30);
  } else {
    signals = store.query({
      type, source, topic, minScore, limit, after,
      sinceId, from, to,
    });
  }

  // Delta support: ETag + Last-Modified headers
  const etag = generateETag(signals);
  const latestTimestamp = signals.length > 0 ? signals[0].timestamp : null;
  const latestId = signals.length > 0 ? signals[0].id : null;

  // Conditional request: If-None-Match
  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return c.body(null, 304);
  }

  // Conditional request: If-Modified-Since
  const ifModifiedSince = c.req.header("if-modified-since");
  if (ifModifiedSince && latestTimestamp) {
    const sinceDate = new Date(ifModifiedSince).getTime();
    const latestDate = new Date(latestTimestamp).getTime();
    if (latestDate <= sinceDate) {
      return c.body(null, 304);
    }
  }

  // Set headers
  c.header("Cache-Control", "public, max-age=30");
  c.header("X-Next-Poll", "60");
  c.header("X-Signal-Count", signals.length.toString());
  c.header("ETag", etag);
  if (latestTimestamp) {
    c.header("Last-Modified", new Date(latestTimestamp).toUTCString());
  }
  if (latestId) {
    c.header("X-Latest-Id", latestId);
  }
  if (followId) c.header("X-Follow-Id", followId);

  // Historical replay: indicate if results were truncated
  if (from && signals.length >= (limit || 500)) {
    c.header("X-Truncated", "true");
  }

  // Return in requested format
  if (format === "json") {
    return c.json({
      ok: true,
      count: signals.length,
      timestamp: new Date().toISOString(),
      ...(latestId && { latest_id: latestId }),
      ...(followId && { follow_id: followId }),
      signals,
    });
  }

  // Default: markdown
  const md = formatMarkdown(signals);
  c.header("Content-Type", "text/markdown; charset=utf-8");
  return c.body(md);
});

/** Generate ETag from signal IDs */
function generateETag(signals: { id: string }[]): string {
  const hash = createHash("md5")
    .update(signals.map((s) => s.id).join(","))
    .digest("hex")
    .slice(0, 16);
  return `"${hash}"`;
}

export { feed };
