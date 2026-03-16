# ◈ AgentSignal

**One API. Every signal. Built for agents.**

Open-source ranked feed of real-time news, markets, crypto, social chatter, predictions, research papers, and world events. Markdown-first output optimized for AI agents. Entity-aware scoring. Webhooks. Delta updates. No signup. One curl command.

```bash
curl agentsignal.dev/feed
```

## Why

AI agents need real-world awareness — news, prices, social chatter, prediction markets. Today every agent wires up 5-10 data sources individually. AgentSignal gives them one endpoint with everything, ranked and normalized.

- **Markdown default** — agents read 300 tokens instead of 5000
- **Entity-aware scoring** — cross-source matching on companies, people, tickers (not title similarity)
- **22 sources** — news, crypto, social, stocks, predictions, science, security, policy, DeFi
- **SQLite persistence** — signals survive restarts, historical replay up to 7 days
- **Webhooks** — real-time push to your agent, no polling needed
- **Delta support** — ETag, `since_id` cursor, `If-None-Match` → 304
- **Signal enrichment** — Claude Haiku extracts entities, categories, 1-line summaries
- **Zero setup** — no API key, no signup, no SDK needed
- **Open source** — add a source in 15 minutes

## Quick Start

```bash
# Get the full ranked feed (markdown)
curl agentsignal.dev/feed

# Get JSON format
curl agentsignal.dev/feed?format=json

# Filter by topic
curl agentsignal.dev/feed?topic=ai

# Only high-signal items
curl agentsignal.dev/feed?min_score=70

# Filter by source type
curl agentsignal.dev/feed?type=market,news

# Delta: only new signals since last poll
curl agentsignal.dev/feed?since_id=sig_hn_12345

# Historical replay: what happened yesterday?
curl "agentsignal.dev/feed?from=2026-03-13T00:00:00Z&to=2026-03-14T00:00:00Z&format=json"

# Ask a question (grounded in real-time signals)
curl -X POST agentsignal.dev/ask \
  -H "Content-Type: application/json" \
  -d '{"q": "What happened to crypto today?"}'

# Create a topic follow
curl -X POST agentsignal.dev/follow \
  -d '{"topics": ["ai", "regulation"], "min_score": 60}'

# Register a webhook for real-time push
curl -X POST agentsignal.dev/webhooks \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-agent.com/signals", "topics": ["ai"], "min_score": 50}'

# List active sources
curl agentsignal.dev/sources
```

## API

### Pull — Get Signals

| Endpoint | Description |
|---|---|
| `GET /feed` | Ranked signal feed (markdown default) |
| `GET /feed?format=json` | Same data, structured JSON with entities + enrichment |
| `GET /feed?since_id=<id>` | Delta — only signals newer than cursor |
| `GET /feed?from=<ts>&to=<ts>` | Historical replay (up to 7 days, max 500) |
| `GET /feed?follow=<id>` | Personalized follow feed |
| `GET /sources` | List all active sources + status |
| `GET /health` | Health check |

### Push — Ask Questions

| Endpoint | Description |
|---|---|
| `POST /ask` | Ask a question, get signal-grounded answer |

Body: `{"q": "your question", "lookback": "6h"}`
Returns plain text answer (or `?format=json`).

### Follow — Topic Subscriptions

| Endpoint | Description |
|---|---|
| `POST /follow` | Create a follow — `{"topics": ["ai"], "min_score": 50}` |
| `GET /follow` | List your follows |
| `GET /follow/:id` | Get follow details |
| `DELETE /follow/:id` | Delete a follow |

### Webhooks — Real-time Push

| Endpoint | Description |
|---|---|
| `POST /webhooks` | Register webhook — `{"url": "https://...", "topics": ["ai"], "min_score": 50}` |
| `GET /webhooks` | List your webhooks |
| `DELETE /webhooks/:id` | Delete a webhook |

Webhooks push matching signals to your URL in real time. 3x retry with exponential backoff (1s, 4s, 16s). Dead agent detection after 10 consecutive failures. HTTPS only, no private IPs.

### Query Parameters

| Param | Example | Description |
|---|---|---|
| `topic` | `?topic=ai` | Keyword filter (title, summary, topics) |
| `source` | `?source=hackernews,coingecko` | Filter by source name |
| `type` | `?type=news,market` | Filter by signal type |
| `min_score` | `?min_score=70` | Minimum signal score (0-100) |
| `limit` | `?limit=50` | Results count (default 30, max 100) |
| `after` | `?after=<ISO timestamp>` | Only signals after this time |
| `since_id` | `?since_id=sig_hn_123` | Cursor pagination — only newer signals |
| `from` | `?from=<ISO timestamp>` | Historical replay start |
| `to` | `?to=<ISO timestamp>` | Historical replay end |
| `format` | `?format=json` | Output format (markdown or json) |

### Response Headers

| Header | Description |
|---|---|
| `ETag` | Hash of signal IDs — use with `If-None-Match` for 304 |
| `Last-Modified` | Timestamp of most recent signal |
| `X-Latest-Id` | Cursor for `since_id` delta polling |
| `X-Signal-Count` | Number of signals returned |
| `X-Next-Poll` | Suggested seconds before next poll |
| `X-Truncated` | Present when replay results capped at 500 |

## Signal Schema

Every signal, regardless of source:

```json
{
  "id": "sig_hn_12345",
  "timestamp": "2026-03-14T10:30:00Z",
  "type": "social",
  "source": "hackernews",
  "title": "Show HN: I built a unified feed for AI agents",
  "summary": "342 points by user | 89 comments",
  "url": "https://...",
  "topics": ["ai", "agents", "show-hn"],
  "score": 78,
  "metadata": {
    "score": 342,
    "comments": 89,
    "entities": {
      "companies": ["OpenAI"],
      "tickers": [],
      "people": []
    }
  }
}
```

## Signal Types

| Type | Sources | What |
|---|---|---|
| `news` | Google News, 15 RSS Feeds, Techmeme, Crunchbase, SEC EDGAR, Congress.gov, CVE/NVD, GDELT | Headlines, filings, vulnerabilities, policy |
| `market` | CoinGecko, Yahoo Finance, DeFi Llama, FRED | Crypto, stocks, DeFi TVL, economic indicators |
| `social` | Hacker News, Reddit, Lobsters, GitHub Trending, Product Hunt | Community discussions, trending repos, launches |
| `events` | Polymarket, Kalshi, Metaculus | Prediction markets, event contracts, forecasts |
| `science` | ArXiv, Hugging Face | AI/ML papers, trending models |

## Scoring (v2)

Entity-aware, multi-factor scoring engine:

| Factor | Weight | What |
|---|---|---|
| Engagement | 30% | Upvotes, comments, volume — **type-aware** (science 2x, news 1.5x) |
| Recency | 25% | Exponential decay, ~6hr half-life |
| Magnitude | 20% | Price change %, earthquake magnitude, odds shift |
| Cross-source | 15% | **Entity-based** matching across sources (4+ = 100, 3 = 80, 2 = 50) |
| Authority | 10% | **Topic-dependent** (SEC EDGAR = 90 for news, CoinGecko = 85 for markets) |

**Developing story detection:** When the same entity appears across 3+ sources within 2 hours, all related signals get a +15 boost.

**Intelligence pipeline:**
```
Sources → Pre-filter → Entity Extraction → Score → SQLite → Enrich (Haiku) → Dispatch
```

## Architecture

```
[22 Free Sources] → [Poll 60-3600s] → [Pre-filter → Extract → Score → SQLite] → [Serve + Enrich + Dispatch]
```

- **SQLite persistence** — WAL mode, signals stored up to 7 days
- **Entity extraction** — regex tickers, hardcoded company/people maps, unified topic keywords
- **Claude Haiku enrichment** — entities, categories, 1-line summaries for signals scoring 60+
- **Webhooks** — real-time push with 3x retry and dead agent detection
- **No auth** — rate limited by IP (100 req/hr, 20/hr for /ask)
- **No cost** — all free APIs, runs on a $5/mo server
- Users hit our cache + SQLite, not upstream sources

## Self-Host

```bash
git clone https://github.com/Ronakkadhi/agentsignal.git
cd agentsignal
npm install
npm run dev
# Running on http://localhost:3000
# SQLite DB at ./data/agentsignal.db
```

Optional: Set `ANTHROPIC_API_KEY` to enable `/ask` endpoint and signal enrichment.

## Add a Source

Each source is one TypeScript file. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

```typescript
export const mySource: SourceProvider = {
  name: "my-source",
  type: "news",
  intervalMs: 120_000,
  async fetch(): Promise<Signal[]> {
    // Fetch, normalize, return
  },
};
```

## Roadmap

- [x] Ranked markdown feed
- [x] 22 real-time sources (HN, Reddit, Google News, CoinGecko, Yahoo Finance, DeFi Llama, Polymarket, Kalshi, Metaculus, ArXiv, Hugging Face, GitHub Trending, Product Hunt, Lobsters, Techmeme, Crunchbase, SEC EDGAR, Congress.gov, CVE/NVD, GDELT, FRED, 15 RSS feeds)
- [x] Signal scoring engine v2 (entity-aware, type-dependent)
- [x] `/ask` endpoint — ask questions, get signal-grounded answers
- [x] `/follow` — topic subscriptions for agents
- [x] SQLite persistence (replaces in-memory store)
- [x] Delta support (ETag, since_id, 304)
- [x] Historical replay (from/to time range queries)
- [x] Webhook notifications (real-time push + dead agent detection)
- [x] Signal enrichment via Claude Haiku
- [x] Entity extraction pipeline (tickers, companies, people)
- [x] Pre-filter layer (dedup, noise removal)
- [ ] More sources (Twitter/X, Bluesky, Telegram channels)
- [ ] MCP server integration
- [ ] SSE streaming

## License

MIT
