import { Signal, SourceProvider } from "../types.js";

interface LobstersItem {
  short_id: string;
  title: string;
  url: string;
  score: number;
  comment_count: number;
  tags: string[];
  created_at: string;
  submitter_user: { username: string };
  comments_url: string;
}

export const lobsters: SourceProvider = {
  name: "lobsters",
  type: "social",
  intervalMs: 120_000,

  async fetch(): Promise<Signal[]> {
    try {
      const res = await fetch("https://lobste.rs/hottest.json");
      const items: LobstersItem[] = await res.json();

      return items.slice(0, 25).map((item) => ({
        id: `sig_lob_${item.short_id}`,
        timestamp: new Date(item.created_at).toISOString(),
        type: "social" as const,
        source: "lobsters",
        title: item.title,
        summary: `${item.score} points | ${item.comment_count} comments | tags: ${item.tags.join(", ")}`,
        url: item.url || item.comments_url,
        topics: item.tags,
        score: 0,
        metadata: {
          score: item.score,
          comments: item.comment_count,
          tags: item.tags,
          author: item.submitter_user.username,
        },
      }));
    } catch (err) {
      console.error("lobsters fetch failed:", err);
      return [];
    }
  },
};
