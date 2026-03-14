import { Signal, SourceProvider } from "../types.js";

const MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h";
const TRENDING_URL = "https://api.coingecko.com/api/v3/search/trending";

interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h: number;
  total_volume: number;
  image: string;
}

interface TrendingCoin {
  item: {
    id: string;
    name: string;
    symbol: string;
    market_cap_rank: number;
    score: number;
  };
}

export const coingecko: SourceProvider = {
  name: "coingecko",
  type: "market",
  intervalMs: 60_000,

  async fetch(): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Fetch top coins by market cap
    try {
      const res = await fetch(MARKETS_URL);
      if (res.ok) {
        const coins: CoinMarket[] = await res.json();

        for (const coin of coins) {
          const change = coin.price_change_percentage_24h ?? 0;
          const direction = change >= 0 ? "+" : "";

          signals.push({
            id: `sig_cg_${coin.id}`,
            timestamp: new Date().toISOString(),
            type: "market",
            source: "coingecko",
            title: `${coin.name} (${coin.symbol.toUpperCase()}): $${formatPrice(coin.current_price)} (${direction}${change.toFixed(1)}%)`,
            summary: `Market cap: $${formatLargeNumber(coin.market_cap)} | 24h vol: $${formatLargeNumber(coin.total_volume)}`,
            url: `https://www.coingecko.com/en/coins/${coin.id}`,
            topics: ["crypto", coin.symbol.toLowerCase()],
            score: 0,
            metadata: {
              price: coin.current_price,
              change24h: change,
              marketCap: coin.market_cap,
              volume24h: coin.total_volume,
              symbol: coin.symbol.toUpperCase(),
            },
          });
        }
      }
    } catch {
      // Skip on error
    }

    // Fetch trending coins
    try {
      const res = await fetch(TRENDING_URL);
      if (res.ok) {
        const data = await res.json();
        const trending: TrendingCoin[] = data?.coins ?? [];

        for (const { item } of trending.slice(0, 7)) {
          signals.push({
            id: `sig_cg_trend_${item.id}`,
            timestamp: new Date().toISOString(),
            type: "market",
            source: "coingecko",
            title: `Trending: ${item.name} (${item.symbol.toUpperCase()})`,
            summary: `Rank #${item.market_cap_rank ?? "N/A"} | Trending score: ${item.score + 1}`,
            url: `https://www.coingecko.com/en/coins/${item.id}`,
            topics: ["crypto", "trending", item.symbol.toLowerCase()],
            score: 0,
            metadata: {
              trendingRank: item.score + 1,
              marketCapRank: item.market_cap_rank,
              symbol: item.symbol.toUpperCase(),
            },
          });
        }
      }
    } catch {
      // Skip on error
    }

    return signals;
  },
};

function formatPrice(price: number): string {
  if (price >= 1) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toPrecision(4);
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}
