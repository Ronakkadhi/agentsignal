import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { store } from "../store/memory.js";
import { Signal } from "../types.js";

const ask = new Hono();

// Simple response cache: question hash → { answer, timestamp }
const cache = new Map<string, { answer: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limit for /ask: 20 per hour per IP
const askRateLimit = new Map<string, { count: number; resetAt: number }>();
const ASK_RATE_LIMIT = 20;
const ASK_RATE_WINDOW = 60 * 60 * 1000;

ask.post("/", async (c) => {
  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json(
      {
        ok: false,
        error:
          "ANTHROPIC_API_KEY not configured. Set it in your environment to enable /ask.",
      },
      503
    );
  }

  // Rate limit
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const entry = askRateLimit.get(ip);

  if (!entry || now > entry.resetAt) {
    askRateLimit.set(ip, { count: 1, resetAt: now + ASK_RATE_WINDOW });
  } else {
    entry.count++;
    if (entry.count > ASK_RATE_LIMIT) {
      return c.json(
        {
          ok: false,
          error: "Rate limit exceeded. Max 20 questions/hour.",
          retryAfter: 3600,
        },
        429
      );
    }
  }

  // Parse request
  let body: { q?: string; lookback?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON. Expected: {"q": "your question"}' }, 400);
  }

  const question = body.q?.trim();
  if (!question) {
    return c.json({ ok: false, error: 'Missing "q" field. Send: {"q": "your question"}' }, 400);
  }

  if (question.length > 500) {
    return c.json({ ok: false, error: "Question too long. Max 500 characters." }, 400);
  }

  // Check cache
  const cacheKey = question.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    const format = c.req.query("format");
    if (format === "json") {
      return c.json({ ok: true, answer: cached.answer, cached: true });
    }
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.body(cached.answer);
  }

  // Get relevant signals
  const lookbackMs = parseLookback(body.lookback || "6h");
  const afterTime = new Date(now - lookbackMs).toISOString();

  // Search for signals relevant to the question
  const allRecent = store.query({ after: afterTime, limit: 100 });
  const relevant = rankByRelevance(allRecent, question).slice(0, 25);

  if (relevant.length === 0) {
    const answer = "No relevant signals found in the requested time window.";
    return c.json({ ok: true, answer, signalsUsed: 0 });
  }

  // Build context for LLM
  const signalContext = relevant
    .map(
      (s) =>
        `[${s.source}] [${s.type}] [score:${s.score}] ${s.title} — ${s.summary} (${s.timestamp})`
    )
    .join("\n");

  // Call Claude
  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-20250414",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are AgentSignal, a real-time signal intelligence service. Based on the following real-time signals, answer the question concisely and directly. Ground your answer in the data — cite specific numbers, sources, and times. If the signals don't contain enough info to answer fully, say so.

SIGNALS:
${signalContext}

QUESTION: ${question}

Answer in 2-4 sentences. Be direct, factual, and specific.`,
        },
      ],
    });

    const answer =
      response.content[0].type === "text"
        ? response.content[0].text
        : "Unable to generate answer.";

    // Cache the response
    cache.set(cacheKey, { answer, timestamp: now });

    // Clean old cache entries
    for (const [key, val] of cache) {
      if (now - val.timestamp > CACHE_TTL) cache.delete(key);
    }

    const format = c.req.query("format");
    if (format === "json") {
      return c.json({
        ok: true,
        answer,
        signalsUsed: relevant.length,
        cached: false,
      });
    }

    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.body(answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM call failed";
    console.error(`[ask] Error: ${message}`);
    return c.json({ ok: false, error: "Failed to generate answer. Try again." }, 500);
  }
});

/** Rank signals by relevance to a question using keyword overlap */
function rankByRelevance(signals: Signal[], question: string): Signal[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2); // skip tiny words

  return signals
    .map((signal) => {
      const text =
        `${signal.title} ${signal.summary} ${signal.topics.join(" ")}`.toLowerCase();
      let relevance = 0;
      for (const word of words) {
        if (text.includes(word)) relevance++;
      }
      // Boost by signal score
      relevance += signal.score / 100;
      return { signal, relevance };
    })
    .filter((r) => r.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .map((r) => r.signal);
}

/** Parse lookback string like "2h", "30m", "1d" to milliseconds */
function parseLookback(str: string): number {
  const match = str.match(/^(\d+)(m|h|d)$/);
  if (!match) return 6 * 60 * 60 * 1000; // default 6h

  const num = parseInt(match[1]);
  switch (match[2]) {
    case "m":
      return num * 60 * 1000;
    case "h":
      return num * 60 * 60 * 1000;
    case "d":
      return num * 24 * 60 * 60 * 1000;
    default:
      return 6 * 60 * 60 * 1000;
  }
}

export { ask };
