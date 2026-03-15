import { Hono } from "hono";
import { store } from "../store/memory.js";
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
    // Follow filters get merged with (and overridden by) explicit query params
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

  // For follow-based queries, we do multi-topic OR matching
  // For regular queries, single topic keyword search
  const topic = c.req.query("topic");

  let signals;
  if (followTopics && !topic) {
    // Follow mode: get all signals, then filter by any matching topic
    const allSignals = store.query({ type, source, minScore, limit: 100, after });
    signals = allSignals.filter((s) => {
      const text = `${s.title} ${s.summary} ${s.topics.join(" ")}`.toLowerCase();
      return followTopics!.some((t) => text.includes(t));
    });
    if (limit) signals = signals.slice(0, Math.min(limit, 100));
    else signals = signals.slice(0, 30);
  } else {
    signals = store.query({ type, source, topic, minScore, limit, after });
  }

  // Set caching + poll headers
  c.header("Cache-Control", "public, max-age=30");
  c.header("X-Next-Poll", "60");
  c.header("X-Signal-Count", signals.length.toString());
  if (followId) c.header("X-Follow-Id", followId);

  // Return in requested format
  if (format === "json") {
    return c.json({
      ok: true,
      count: signals.length,
      timestamp: new Date().toISOString(),
      ...(followId && { follow_id: followId }),
      signals,
    });
  }

  // Default: markdown
  const md = formatMarkdown(signals);
  c.header("Content-Type", "text/markdown; charset=utf-8");
  return c.body(md);
});

export { feed };
