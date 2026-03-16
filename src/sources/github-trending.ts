import { Signal, SourceProvider } from "../types.js";

interface GHSearchItem {
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
}

interface GHSearchResponse {
  items: GHSearchItem[];
}

export const githubTrending: SourceProvider = {
  name: "github-trending",
  type: "social",
  intervalMs: 600_000, // 10 min — GitHub search API rate limits at 10 req/min unauthenticated

  async fetch(): Promise<Signal[]> {
    try {
      // Find high-star repos pushed in the last 24h
      const yesterday = new Date(Date.now() - 86400_000)
        .toISOString()
        .slice(0, 10);
      const url = `https://api.github.com/search/repositories?q=stars:>500+pushed:>${yesterday}&sort=stars&order=desc&per_page=20`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "AgentSignal/0.1",
        },
      });

      if (!res.ok) return [];

      const data: GHSearchResponse = await res.json();
      const items = data?.items ?? [];

      return items.map((item) => ({
        id: `sig_gh_${item.full_name.replace("/", "_")}`,
        timestamp: item.pushed_at,
        type: "social" as const,
        source: "github-trending",
        title: item.full_name,
        summary: `★ ${item.stargazers_count.toLocaleString()} | ${item.language || "unknown"} | ${item.description?.slice(0, 150) || ""}`,
        url: item.html_url,
        topics: ["open-source", item.language?.toLowerCase()].filter(
          Boolean
        ) as string[],
        score: 0,
        metadata: {
          stars: item.stargazers_count,
          language: item.language,
          forks: item.forks_count,
        },
      }));
    } catch (err) {
      console.error("[github-trending] fetch failed:", err);
      return [];
    }
  },
};
