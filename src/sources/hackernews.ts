import { Signal, SourceProvider } from "../types.js";

const HN_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item";

interface HNItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  time: number;
  descendants?: number;
  type: string;
}

async function fetchItem(id: number): Promise<HNItem | null> {
  try {
    const res = await fetch(`${HN_ITEM_URL}/${id}.json`);
    return res.json();
  } catch {
    return null;
  }
}

export const hackernews: SourceProvider = {
  name: "hackernews",
  type: "social",
  intervalMs: 60_000,

  async fetch(): Promise<Signal[]> {
    const res = await fetch(HN_TOP_URL);
    const ids: number[] = await res.json();
    const top30 = ids.slice(0, 30);

    const items = await Promise.all(top30.map(fetchItem));

    return items
      .filter((item): item is HNItem => item !== null && item.type === "story")
      .map((item) => ({
        id: `sig_hn_${item.id}`,
        timestamp: new Date(item.time * 1000).toISOString(),
        type: "social" as const,
        source: "hackernews",
        title: item.title,
        summary: `${item.score} points by ${item.by} | ${item.descendants ?? 0} comments`,
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        topics: [], // Populated by central extraction pipeline
        score: 0,
        metadata: {
          score: item.score,
          comments: item.descendants ?? 0,
          author: item.by,
        },
      }));
  },
};

// inferTopics removed — central extraction in src/extraction/topics.ts
