import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { feed } from "./api/feed.js";
import { sourcesApi } from "./api/sources.js";
import { ask } from "./api/ask.js";
import { follow } from "./api/follow.js";
import { webhooks } from "./api/webhooks.js";
import { startScheduler } from "./scheduler/cron.js";

const app = new Hono();

// CORS — agents call from anywhere
app.use("*", cors());

// Rate limiting (simple in-memory)
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function rateLimitMiddleware(path: string) {
  return async (c: any, next: any) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "unknown";
    const now = Date.now();
    const entry = rateLimit.get(ip);

    if (!entry || now > entry.resetAt) {
      rateLimit.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    } else {
      entry.count++;
      if (entry.count > RATE_LIMIT) {
        c.header("Retry-After", "3600");
        return c.json(
          {
            ok: false,
            error: "Rate limit exceeded. Max 100 requests/hour.",
            retryAfter: 3600,
          },
          429
        );
      }
    }

    await next();
  };
}

app.use("/feed/*", rateLimitMiddleware("/feed"));
app.use("/sources/*", rateLimitMiddleware("/sources"));
app.use("/follow/*", rateLimitMiddleware("/follow"));
app.use("/webhooks/*", rateLimitMiddleware("/webhooks"));
// /ask has its own stricter rate limit (20/hr) built in

// Clean up rate limit map every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimit) {
    if (now > entry.resetAt) rateLimit.delete(key);
  }
}, 10 * 60 * 1000);

// API routes
app.route("/feed", feed);
app.route("/sources", sourcesApi);
app.route("/ask", ask);
app.route("/follow", follow);
app.route("/webhooks", webhooks);

// Health check
app.get("/health", (c) => {
  return c.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    askEnabled: !!process.env.ANTHROPIC_API_KEY,
  });
});

// Docs page
app.get("/docs", (c) => {
  return c.redirect("/docs.html");
});

// Use cases page
app.get("/use-cases", (c) => {
  return c.redirect("/use-cases.html");
});

// Serve landing page static files
app.use("/*", serveStatic({ root: "./web" }));

// Start server
const port = parseInt(process.env.PORT || "3000");

console.log(`
   ___                    __  ____  _                   __
  / _ | ___ _ ___  ___  / /_/ __/ (_) ___ _ ___  ___ _ / /
 / __ |/ _ '// -_)/ _ \\/ __/\\ \\  / / / _ '// _ \\/ _ '// /
/_/ |_|\\_, / \\__//_//_/\\__/___/ /_/  \\_, / /_//_/\\_,_//_/
      /___/                         /___/

  One API. Every signal. Built for agents.

  Server running on http://localhost:${port}
  Endpoints:
    GET  /feed              → Ranked markdown feed
    GET  /feed?format=json  → JSON format
    POST /ask               → Ask questions (LLM-powered)
    POST /follow            → Create topic subscription
    GET  /feed?follow=<id>  → Filtered follow feed
    POST /webhooks           → Register webhook
    GET  /webhooks           → List webhooks
    GET  /sources           → Active sources
    GET  /health            → Health check

  /ask enabled: ${process.env.ANTHROPIC_API_KEY ? "yes" : "no (set ANTHROPIC_API_KEY)"}
`);

// Start polling sources
startScheduler();

serve({ fetch: app.fetch, port });
