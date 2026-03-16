import { Signal, SourceProvider } from "../types.js";

const SYMBOLS = [
  { sym: "^GSPC", name: "S&P 500" },
  { sym: "^DJI", name: "Dow Jones" },
  { sym: "^IXIC", name: "Nasdaq" },
  { sym: "^VIX", name: "VIX" },
  { sym: "AAPL", name: "Apple" },
  { sym: "MSFT", name: "Microsoft" },
  { sym: "GOOGL", name: "Alphabet" },
  { sym: "AMZN", name: "Amazon" },
  { sym: "NVDA", name: "Nvidia" },
  { sym: "TSLA", name: "Tesla" },
  { sym: "META", name: "Meta" },
];

interface SparkData {
  timestamp: number[];
  close: number[];
  chartPreviousClose: number;
  symbol: string;
}

export const yahooFinance: SourceProvider = {
  name: "yahoo-finance",
  type: "market",
  intervalMs: 120_000,

  async fetch(): Promise<Signal[]> {
    try {
      const syms = SYMBOLS.map((s) => s.sym).join(",");
      const url = `https://query2.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(syms)}&range=1d&interval=1d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentSignal/0.1)" },
      });

      if (!res.ok) return [];

      const data: Record<string, SparkData> = await res.json();

      return Object.entries(data)
        .filter(([, v]) => v.close?.length > 0 && v.chartPreviousClose)
        .map(([symbol, v]) => {
          const price = v.close[v.close.length - 1];
          const prevClose = v.chartPreviousClose;
          const changePercent = ((price - prevClose) / prevClose) * 100;
          const info = SYMBOLS.find((s) => s.sym === symbol);

          return {
            id: `sig_yf_${symbol.replace("^", "").toLowerCase()}`,
            timestamp: new Date().toISOString(),
            type: "market" as const,
            source: "yahoo-finance",
            title: `${info?.name || symbol}: $${price.toFixed(2)}`,
            summary: `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}% from prev close ($${prevClose.toFixed(2)})`,
            url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
            topics: ["stocks", "finance"],
            score: 0,
            metadata: {
              price,
              previousClose: prevClose,
              change: changePercent,
              symbol,
            },
          };
        });
    } catch (err) {
      console.error("[yahoo-finance] fetch failed:", err);
      return [];
    }
  },
};
