import Parser from "rss-parser";
import { nanoid } from "nanoid";
import { Signal, SourceProvider } from "../types.js";

const parser = new Parser();

const FEED_URL = "https://www.congress.gov/rss/most-viewed-bills.xml";

export const congress: SourceProvider = {
  name: "congress",
  type: "news",
  intervalMs: 600_000,

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
            .slice(0, 200) || "Congressional bill activity";

        signals.push({
          id: `sig_cong_${nanoid(8)}`,
          timestamp: pubDate,
          type: "news",
          source: "congress",
          title: item.title.replace(/\s+/g, " ").trim(),
          summary,
          url: item.link,
          topics: ["policy", "regulation", "government"],
          score: 0,
          metadata: {
            categories: item.categories || undefined,
          },
        });
      }

      return signals;
    } catch (err) {
      console.error("[congress] Failed to fetch feed:", err);
      return [];
    }
  },
};
