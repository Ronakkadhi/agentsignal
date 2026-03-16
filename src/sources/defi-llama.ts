import { Signal, SourceProvider } from "../types.js";

interface DefiProtocol {
  name: string;
  tvl: number;
  change_1d: number;
  change_7d: number;
  chains: string[];
  category: string;
  symbol: string;
  url: string;
}

const formatNum = (n: number): string =>
  n >= 1e9
    ? (n / 1e9).toFixed(1) + "B"
    : n >= 1e6
      ? (n / 1e6).toFixed(1) + "M"
      : n.toLocaleString();

export const defiLlama: SourceProvider = {
  name: "defi-llama",
  type: "market",
  intervalMs: 120_000,

  async fetch(): Promise<Signal[]> {
    try {
      const res = await fetch("https://api.llama.fi/protocols");
      const protocols: DefiProtocol[] = await res.json();

      return protocols
        .filter((p) => p.tvl >= 1_000_000)
        .sort(
          (a, b) =>
            Math.abs(b.change_1d ?? 0) - Math.abs(a.change_1d ?? 0)
        )
        .slice(0, 20)
        .map((protocol) => ({
          id: `sig_defi_${protocol.name.toLowerCase().replace(/\s+/g, "-")}`,
          timestamp: new Date().toISOString(),
          type: "market" as const,
          source: "defi-llama",
          title: `${protocol.name} (${protocol.symbol})`,
          summary: `TVL: $${formatNum(protocol.tvl)} | 24h: ${protocol.change_1d > 0 ? "+" : ""}${protocol.change_1d?.toFixed(1)}% | 7d: ${protocol.change_7d?.toFixed(1)}%`,
          url: protocol.url || `https://defillama.com/protocol/${protocol.name.toLowerCase().replace(/\s+/g, "-")}`,
          topics: [
            "defi",
            "crypto",
            protocol.category?.toLowerCase(),
          ].filter(Boolean) as string[],
          score: 0,
          metadata: {
            tvl: protocol.tvl,
            change1d: protocol.change_1d,
            change7d: protocol.change_7d,
            chains: protocol.chains,
            category: protocol.category,
            symbol: protocol.symbol,
          },
        }));
    } catch (err) {
      console.error("defi-llama fetch failed:", err);
      return [];
    }
  },
};
