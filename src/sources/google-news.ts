import Parser from "rss-parser";
import { nanoid } from "nanoid";
import { Signal, SourceProvider } from "../types.js";

const parser = new Parser();

const FEEDS = [
  {
    url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
    category: "general",
    topics: ["world"],
  },
  {
    url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
    category: "technology",
    topics: ["tech"],
  },
  {
    url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
    category: "business",
    topics: ["business", "finance"],
  },
];

export const googleNews: SourceProvider = {
  name: "google-news",
  type: "news",
  intervalMs: 120_000,

  async fetch(): Promise<Signal[]> {
    const allSignals: Signal[] = [];

    for (const feed of FEEDS) {
      try {
        const parsed = await parser.parseURL(feed.url);

        for (const item of (parsed.items || []).slice(0, 10)) {
          if (!item.title || !item.link) continue;

          const pubDate = item.pubDate
            ? new Date(item.pubDate).toISOString()
            : new Date().toISOString();

          // Extract source name from Google News title format: "Title - Source"
          const parts = item.title.split(" - ");
          const sourceName = parts.length > 1 ? parts.pop()!.trim() : "Unknown";
          const title = parts.join(" - ").trim();

          allSignals.push({
            id: `sig_gnews_${nanoid(8)}`,
            timestamp: pubDate,
            type: "news",
            source: "google-news",
            title,
            summary: `via ${sourceName} | ${feed.category}`,
            url: item.link,
            topics: [...feed.topics, feed.category],
            score: 0,
            metadata: {
              publisher: sourceName,
              category: feed.category,
            },
          });
        }
      } catch {
        // Skip failed feeds
      }
    }

    return allSignals;
  },
};
