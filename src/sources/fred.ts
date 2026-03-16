import { Signal, SourceProvider } from "../types.js";

const SERIES = [
  { id: "DFF", name: "Federal Funds Rate", topic: "interest-rates" },
  { id: "CPIAUCSL", name: "CPI (Consumer Price Index)", topic: "inflation" },
  { id: "UNRATE", name: "Unemployment Rate", topic: "employment" },
  { id: "GDP", name: "GDP", topic: "gdp" },
  { id: "T10Y2Y", name: "10Y-2Y Treasury Spread", topic: "bonds" },
];

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

export const fred: SourceProvider = {
  name: "fred",
  type: "market",
  intervalMs: 3_600_000,

  async fetch(): Promise<Signal[]> {
    try {
      const apiKey = process.env.FRED_API_KEY;
      if (!apiKey) {
        console.warn("[fred] FRED_API_KEY not set, skipping");
        return [];
      }

      const results = await Promise.all(
        SERIES.map(async (series) => {
          try {
            const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.id}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
            const res = await fetch(url);
            if (!res.ok) return null;

            const data: FredResponse = await res.json();
            const observation = data?.observations?.[0];
            if (!observation || observation.value === ".") return null;

            const signal: Signal = {
              id: `sig_fred_${series.id.toLowerCase()}`,
              timestamp: new Date().toISOString(),
              type: "market",
              source: "fred",
              title: `${series.name}: ${observation.value}`,
              summary: `Latest value: ${observation.value} as of ${observation.date}`,
              url: `https://fred.stlouisfed.org/series/${series.id}`,
              topics: ["economics", "macro", series.topic],
              score: 0,
              metadata: {
                value: parseFloat(observation.value),
                date: observation.date,
                seriesId: series.id,
              },
            };

            return signal;
          } catch {
            return null;
          }
        })
      );

      return results.filter((s): s is Signal => s !== null);
    } catch (err) {
      console.error("[fred] fetch failed:", err);
      return [];
    }
  },
};
