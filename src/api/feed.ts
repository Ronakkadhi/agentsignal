import { Hono } from "hono";
import { store } from "../store/memory.js";
import { formatMarkdown } from "../formatter/markdown.js";
import { resolveWatch } from "./watch.js";

const feed = new Hono();

feed.get("/", (c) => {
  // Check for watch-based filtering
  const watchId = c.req.query("watch");
  let watchTopics: string[] | undefined;
  let watchSources: string[] | undefined;
  let watchTypes: string[] | undefined;
  let watchMinScore: number | undefined;

  if (watchId) {
    const w = resolveWatch(watchId);
    if (!w) {
      return c.json({ ok: false, error: "Watch not found. Create one via POST /watch." }, 404);
    }
    // Watch filters get merged with (and overridden by) explicit query params
    watchTopics = w.topics;
    watchSources = w.sources;
    watchTypes = w.types;
    watchMinScore = w.minScore;
  }

  // Parse query params (explicit params override watch defaults)
  const type = c.req.query("type")?.split(",").filter(Boolean) || watchTypes;
  const source = c.req.query("source")?.split(",").filter(Boolean) || watchSources;
  const minScore = c.req.query("min_score")
    ? parseInt(c.req.query("min_score")!)
    : watchMinScore;
  const limit = c.req.query("limit")
    ? parseInt(c.req.query("limit")!)
    : undefined;
  const after = c.req.query("after");
  const format = c.req.query("format") || "markdown";

  // For watch-based queries, we do multi-topic OR matching
  // For regular queries, single topic keyword search
  const topic = c.req.query("topic");

  let signals;
  if (watchTopics && !topic) {
    // Watch mode: get all signals, then filter by any matching topic
    const allSignals = store.query({ type, source, minScore, limit: 100, after });
    signals = allSignals.filter((s) => {
      const text = `${s.title} ${s.summary} ${s.topics.join(" ")}`.toLowerCase();
      return watchTopics!.some((t) => text.includes(t));
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
  if (watchId) c.header("X-Watch-Id", watchId);

  // Return in requested format
  if (format === "json") {
    return c.json({
      ok: true,
      count: signals.length,
      timestamp: new Date().toISOString(),
      ...(watchId && { watch_id: watchId }),
      signals,
    });
  }

  // Default: markdown
  const md = formatMarkdown(signals);
  c.header("Content-Type", "text/markdown; charset=utf-8");
  return c.body(md);
});

export { feed };
