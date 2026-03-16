import Parser from "rss-parser";
import { nanoid } from "nanoid";
import { Signal, SourceProvider } from "../types.js";

const parser = new Parser();

const FEED_URL = "https://news.crunchbase.com/feed/";

export const crunchbase: SourceProvider = {
  name: "crunchbase",
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
            .slice(0, 200) || "Startup and funding news via Crunchbase";

        signals.push({
          id: `sig_cb_${nanoid(8)}`,
          timestamp: pubDate,
          type: "news",
          source: "crunchbase",
          title: item.title.replace(/\s+/g, " ").trim(),
          summary,
          url: item.link,
          topics: ["startups", "funding", "acquisitions"],
          score: 0,
          metadata: {
            categories: item.categories || undefined,
          },
        });
      }

      return signals;
    } catch (err) {
      console.error("[crunchbase] Failed to fetch feed:", err);
      return [];
    }
  },
};
