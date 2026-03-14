import { Signal, SourceProvider } from "../types.js";

const POLYMARKET_URL = "https://gamma-api.polymarket.com/markets?limit=20&active=true&order=volume&ascending=false";

interface PolymarketEvent {
  id: string;
  question: string;
  description: string;
  outcomePrices: string;
  volume: string;
  liquidity: string;
  endDate: string;
  image: string;
  slug: string;
  outcomes: string;
  active: boolean;
}

export const polymarket: SourceProvider = {
  name: "polymarket",
  type: "events",
  intervalMs: 300_000,

  async fetch(): Promise<Signal[]> {
    const res = await fetch(POLYMARKET_URL);
    if (!res.ok) return [];

    const markets: PolymarketEvent[] = await res.json();

    return markets
      .filter((m) => m.active && m.question)
      .map((market) => {
        let prices: number[] = [];
        try {
          prices = JSON.parse(market.outcomePrices || "[]");
        } catch {}

        let outcomes: string[] = [];
        try {
          outcomes = JSON.parse(market.outcomes || "[]");
        } catch {}

        const oddsStr = outcomes
          .map((o, i) => `${o}: ${((prices[i] ?? 0) * 100).toFixed(0)}%`)
          .join(" | ");

        const volume = parseFloat(market.volume || "0");

        return {
          id: `sig_poly_${market.id}`,
          timestamp: new Date().toISOString(),
          type: "events" as const,
          source: "polymarket",
          title: market.question,
          summary: oddsStr || "No odds available",
          url: `https://polymarket.com/event/${market.slug}`,
          topics: inferEventTopics(market.question),
          score: 0,
          metadata: {
            odds: Object.fromEntries(outcomes.map((o, i) => [o, prices[i] ?? 0])),
            volume: volume,
            liquidity: parseFloat(market.liquidity || "0"),
            endDate: market.endDate,
          },
        };
      });
  },
};

function inferEventTopics(question: string): string[] {
  const topics: string[] = ["predictions"];
  const lower = question.toLowerCase();
  const keywords: Record<string, string> = {
    trump: "politics",
    biden: "politics",
    election: "politics",
    president: "politics",
    bitcoin: "crypto",
    ethereum: "crypto",
    crypto: "crypto",
    "fed ": "finance",
    "interest rate": "finance",
    "stock market": "finance",
    war: "geopolitics",
    ukraine: "geopolitics",
    china: "geopolitics",
    ai: "ai",
    openai: "ai",
    "super bowl": "sports",
    nba: "sports",
    nfl: "sports",
  };

  for (const [keyword, topic] of Object.entries(keywords)) {
    if (lower.includes(keyword) && !topics.includes(topic)) {
      topics.push(topic);
    }
  }

  return topics;
}
