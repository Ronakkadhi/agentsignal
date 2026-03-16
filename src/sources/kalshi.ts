import { Signal, SourceProvider } from "../types.js";

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle: string;
  yes_price: number;
  volume: number;
  open_time: string;
  close_time: string;
  category: string;
}

interface KalshiResponse {
  markets: KalshiMarket[];
}

export const kalshi: SourceProvider = {
  name: "kalshi",
  type: "events",
  intervalMs: 300_000,

  async fetch(): Promise<Signal[]> {
    try {
      const res = await fetch(
        "https://api.elections.kalshi.com/trade-api/v2/markets?limit=50&status=open"
      );

      if (!res.ok) return [];

      const data: KalshiResponse = await res.json();
      const markets = data?.markets ?? [];
      const valid = markets.filter(
        (m) => (m.volume ?? 0) > 0 && m.title && !m.title.includes(",yes ")
      );
      if (valid.length === 0 && markets.length > 0) {
        console.warn("[kalshi] no markets with volume data (may need API auth)");
      }

      return valid
        .slice(0, 20)
        .map((market) => ({
          id: `sig_kalshi_${market.ticker}`,
          timestamp: new Date(market.open_time).toISOString(),
          type: "events" as const,
          source: "kalshi",
          title: market.title,
          summary: `Yes: ${(market.yes_price * 100).toFixed(0)}% | Vol: $${market.volume.toLocaleString()} | ${market.subtitle || ""}`,
          url: `https://kalshi.com/markets/${market.ticker}`,
          topics: ["predictions", market.category?.toLowerCase() || "events"],
          score: 0,
          metadata: {
            yes: market.yes_price,
            volume: market.volume,
            category: market.category,
          },
        }));
    } catch (err) {
      console.error("kalshi fetch failed:", err);
      return [];
    }
  },
};
