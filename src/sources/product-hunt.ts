import Parser from "rss-parser";
import { nanoid } from "nanoid";
import { Signal, SourceProvider } from "../types.js";

const parser = new Parser();

const FEED_URL = "https://www.producthunt.com/feed";

export const productHunt: SourceProvider = {
  name: "product-hunt",
  type: "social",
  intervalMs: 300_000,

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
            .slice(0, 200) || "New product on Product Hunt";

        signals.push({
          id: `sig_ph_${nanoid(8)}`,
          timestamp: pubDate,
          type: "social",
          source: "product-hunt",
          title: item.title.replace(/\s+/g, " ").trim(),
          summary,
          url: item.link,
          topics: ["startups", "products"],
          score: 0,
          metadata: {
            creator: item.creator || item.author || undefined,
          },
        });
      }

      return signals;
    } catch (err) {
      console.error("[product-hunt] Failed to fetch feed:", err);
      return [];
    }
  },
};
