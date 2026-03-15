import { Signal, SourceProvider } from "../types.js";

const POLYMARKET_URL = "https://gamma-api.polymarket.com/markets?limit=40&active=true&order=volume&ascending=false";
const MIN_VOLUME = 10_000; // $10K minimum volume to filter noise

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
      .filter((m) => {
        if (!m.active || !m.question) return false;
        const vol = parseFloat(m.volume || "0");
        if (vol < MIN_VOLUME) return false;
        // Filter expired markets that slipped through the API
        if (m.endDate) {
          const end = new Date(m.endDate).getTime();
          if (end < Date.now()) return false;
        }
        return true;
      })
      .slice(0, 20) // Keep top 20 after filtering
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
          topics: ["predictions"], // Base topic; extraction pipeline adds more
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

// inferEventTopics removed — central extraction in src/extraction/topics.ts
