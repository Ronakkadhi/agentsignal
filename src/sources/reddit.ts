import { Signal, SourceProvider } from "../types.js";

const SUBREDDITS = [
  { name: "technology", topics: ["tech"] },
  { name: "worldnews", topics: ["world"] },
  { name: "artificial", topics: ["ai"] },
  { name: "MachineLearning", topics: ["ai", "ml"] },
  { name: "stocks", topics: ["finance", "stocks"] },
  { name: "cryptocurrency", topics: ["crypto"] },
];

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    subreddit: string;
    score: number;
    num_comments: number;
    created_utc: number;
    author: string;
  };
}

export const reddit: SourceProvider = {
  name: "reddit",
  type: "social",
  intervalMs: 120_000,

  async fetch(): Promise<Signal[]> {
    const allSignals: Signal[] = [];

    for (const sub of SUBREDDITS) {
      try {
        const res = await fetch(
          `https://www.reddit.com/r/${sub.name}/hot.json?limit=10`,
          {
            headers: {
              "User-Agent": "AgentSignal/0.1 (agentsignal.co)",
            },
          }
        );

        if (!res.ok) continue;

        const data = await res.json();
        const posts: RedditPost[] = data?.data?.children ?? [];

        for (const post of posts) {
          const p = post.data;
          if (!p.title) continue;

          allSignals.push({
            id: `sig_reddit_${p.id}`,
            timestamp: new Date(p.created_utc * 1000).toISOString(),
            type: "social",
            source: "reddit",
            title: p.title,
            summary: `r/${p.subreddit} | ${p.score} upvotes | ${p.num_comments} comments`,
            url: `https://reddit.com${p.permalink}`,
            topics: [...sub.topics],
            score: 0,
            metadata: {
              subreddit: p.subreddit,
              score: p.score,
              comments: p.num_comments,
              author: p.author,
            },
          });
        }
      } catch {
        // Skip failed subreddits silently
      }
    }

    return allSignals;
  },
};
