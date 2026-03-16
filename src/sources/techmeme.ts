import Parser from "rss-parser";
import { nanoid } from "nanoid";
import { Signal, SourceProvider } from "../types.js";

const parser = new Parser();

const FEED_URL = "https://www.techmeme.com/feed.xml";

export const techmeme: SourceProvider = {
  name: "techmeme",
  type: "news",
  intervalMs: 120_000,

  async fetch(): Promise<Signal[]> {
    try {
      const parsed = await parser.parseURL(FEED_URL);
      const signals: Signal[] = [];

      for (const item of (parsed.items || []).slice(0, 15)) {
        if (!item.title || !item.link) continue;

        const pubDate = item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString();

        const summary =
          (item.contentSnippet || item.content?.replace(/<[^>]*>/g, ""))
            ?.replace(/\s+/g, " ")
            .trim()
            .slice(0, 200) || "Tech news via Techmeme";

        signals.push({
          id: `sig_tm_${nanoid(8)}`,
          timestamp: pubDate,
          type: "news",
          source: "techmeme",
          title: item.title.replace(/\s+/g, " ").trim(),
          summary,
          url: item.link,
          topics: ["tech"],
          score: 0,
          metadata: {
            curated: true,
          },
        });
      }

      return signals;
    } catch (err) {
      console.error("[techmeme] Failed to fetch feed:", err);
      return [];
    }
  },
};
