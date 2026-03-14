# ◈ AgentSignal

**One API. Every signal. Built for agents.**

Open-source ranked feed of real-time news, markets, crypto, social chatter, predictions, research papers, and world events. Markdown-first output optimized for AI agents. No signup. One curl command.

```bash
curl agentsignal.co/feed
```

## Why

AI agents need real-world awareness — news, prices, social chatter, prediction markets. Today every agent wires up 5-10 data sources individually. AgentSignal gives them one endpoint with everything, ranked and normalized.

- **Markdown default** — agents read 300 tokens instead of 5000
- **Scored & ranked** — high-signal items float to the top (0-100 scoring)
- **8 sources** — news, crypto, social, predictions, science, earthquakes
- **Zero setup** — no API key, no signup, no SDK needed
- **Open source** — add a source in 15 minutes

## Quick Start

```bash
# Get the full ranked feed (markdown)
curl agentsignal.co/feed

# Get JSON format
curl agentsignal.co/feed?format=json

# Filter by topic
curl agentsignal.co/feed?topic=ai

# Only high-signal items
curl agentsignal.co/feed?min_score=70

# Filter by source type
curl agentsignal.co/feed?type=market,news

# Delta updates (only new signals since timestamp)
curl agentsignal.co/feed?after=2026-03-14T10:00:00Z

# List active sources
curl agentsignal.co/sources

# Ask a question (grounded in real-time signals)
curl -X POST agentsignal.co/ask \
  -H "Content-Type: application/json" \
  -d '{"q": "What happened to crypto today?"}'

# Create a topic watch
curl -X POST agentsignal.co/watch \
  -d '{"topics": ["ai", "regulation"], "min_score": 60}'

# Poll your personalized feed
curl agentsignal.co/feed?watch=YOUR_WATCH_ID
```

## API

### Pull — Get Signals

| Endpoint | Description |
|---|---|
| `GET /feed` | Ranked signal feed (markdown default) |
| `GET /feed?format=json` | Same data, structured JSON |
| `GET /feed?watch=<id>` | Personalized watch feed |
| `GET /sources` | List all active sources + status |
| `GET /health` | Health check |

### Push — Ask Questions

| Endpoint | Description |
|---|---|
| `POST /ask` | Ask a question, get signal-grounded answer |

Body: `{"q": "your question", "lookback": "6h"}`
Returns plain text answer (or `?format=json`).

### Watch — Topic Subscriptions

| Endpoint | Description |
|---|---|
| `POST /watch` | Create a watch — `{"topics": ["ai"], "min_score": 50}` |
| `GET /watch` | List your watches |
| `GET /watch/:id` | Get watch details |
| `DELETE /watch/:id` | Delete a watch |

### Query Parameters

| Param | Example | Description |
|---|---|---|
| `topic` | `?topic=ai` | Keyword filter (title, summary, topics) |
| `source` | `?source=hackernews,coingecko` | Filter by source name |
| `type` | `?type=news,market` | Filter by signal type |
| `min_score` | `?min_score=70` | Minimum signal score (0-100) |
| `limit` | `?limit=50` | Results count (default 30, max 100) |
| `after` | `?after=<ISO timestamp>` | Only signals after this time |
| `format` | `?format=json` | Output format (markdown or json) |

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
    "comments": 89
  }
}
```

## Signal Types

| Type | Sources | What |
|---|---|---|
| `news` | Google News, BBC, TechCrunch, Reuters, Ars Technica, The Verge | Headlines and articles |
| `market` | CoinGecko | Crypto prices, trending coins, market cap |
| `social` | Hacker News, Reddit | Community discussions, trending posts |
| `events` | Polymarket | Prediction market odds |
| `science` | ArXiv | AI/ML/CS research papers |
| `geo` | USGS Earthquakes | Real-time seismic activity |

## Scoring

Every signal gets a score from 0-100:

| Factor | Weight | What |
|---|---|---|
| Engagement | 30% | Upvotes, comments, trading volume |
| Recency | 25% | How fresh the signal is |
| Magnitude | 20% | Price change %, earthquake magnitude |
| Cross-source | 15% | Same story across multiple sources |
| Authority | 10% | Source reliability |

## Self-Host

```bash
git clone https://github.com/agentsignal/agentsignal.git
cd agentsignal
npm install
npm run dev
# Running on http://localhost:3000
```

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

## Architecture

```
[Free Sources] → [Poll every 60-300s] → [Cache + Score + Dedup] → [Serve as Markdown/JSON]
```

- **No database** — in-memory store, last 1000 signals
- **No auth** — rate limited by IP (100 req/hr)
- **No cost** — all free APIs, runs on a $5/mo server
- Users hit our cache, not upstream sources

## Roadmap

- [x] Ranked markdown feed
- [x] 8 real-time sources
- [x] Signal scoring engine
- [x] `/ask` endpoint — ask questions, get signal-grounded answers
- [x] `/watch` — topic subscriptions for agents
- [ ] More sources (Yahoo Finance, GitHub Trending, DeFi Llama, CVEs)
- [ ] MCP server integration
- [ ] SSE streaming
- [ ] Webhook notifications for watches

## License

MIT
