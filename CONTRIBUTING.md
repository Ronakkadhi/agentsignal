# Contributing to AgentSignal

The easiest way to contribute is **adding a new data source**. Each source is a single file — you can add one in 15 minutes.

## How to Add a Source

### 1. Create a new file

Create `src/sources/your-source.ts`:

```typescript
import { Signal, SourceProvider } from "../types.js";

export const yourSource: SourceProvider = {
  name: "your-source",           // lowercase, kebab-case
  type: "news",                  // "news" | "market" | "social" | "events" | "science" | "geo"
  intervalMs: 120_000,           // how often to poll (ms)

  async fetch(): Promise<Signal[]> {
    const res = await fetch("https://api.example.com/data");
    if (!res.ok) return [];

    const data = await res.json();

    return data.map((item: any) => ({
      id: `sig_yoursource_${item.id}`,
      timestamp: new Date(item.date).toISOString(),
      type: "news",
      source: "your-source",
      title: item.title,
      summary: item.description?.slice(0, 200) || "",
      url: item.url,
      topics: ["your", "topics"],
      score: 0,                  // scoring engine handles this
      metadata: {                // optional: source-specific data
        custom_field: item.custom,
      },
    }));
  },
};
```

### 2. Register it

Add your source to `src/sources/index.ts`:

```typescript
import { yourSource } from "./your-source.js";

export const sources: SourceProvider[] = [
  // ... existing sources
  yourSource,
];
```

### 3. Add scoring (optional)

If your source has engagement metrics, add scoring logic in `src/scoring/engine.ts`:

```typescript
// In scoreEngagement()
if (signal.source === "your-source") {
  const views = (meta.views as number) || 0;
  if (views >= 10000) return 100;
  if (views >= 1000) return 60;
  return 30;
}
```

### 4. Test it

```bash
npm run dev
curl http://localhost:3000/feed?source=your-source
```

### 5. Submit a PR

That's it! Open a PR with your new source file and the registration change.

## Source Guidelines

- **Free APIs only** — no paid API keys required
- **Respect rate limits** — set `intervalMs` conservatively
- **Normalize data** — every signal must match the `Signal` interface
- **Handle errors gracefully** — return `[]` on failure, don't throw
- **Keep it simple** — one file per source, no external dependencies if possible

## Source Ideas

Looking for inspiration? These are all free and available:

- GitHub Trending (social)
- Yahoo Finance (market)
- Product Hunt (social)
- Lobste.rs (social)
- Dev.to (social)
- DeFi Llama (market)
- Wikipedia Current Events (news)
- CISA Security Alerts (security)
- NWS Weather Alerts (geo)
- Federal Register (news)

## Other Contributions

- **Bug fixes** — always welcome
- **Scoring improvements** — better ranking = better product
- **Documentation** — help others understand the project
- **Performance** — faster polling, smarter caching

## Development Setup

```bash
git clone https://github.com/agentsignal/agentsignal.git
cd agentsignal
npm install
npm run dev
# Server runs on http://localhost:3000
```

## Code Style

- TypeScript, strict mode
- ESM imports (`.js` extensions)
- No semicolons are fine, but be consistent within a file
- Keep source files self-contained
