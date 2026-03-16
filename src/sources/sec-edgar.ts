import Parser from "rss-parser";
import { nanoid } from "nanoid";
import { Signal, SourceProvider } from "../types.js";

const parser = new Parser({
  headers: {
    "User-Agent": "AgentSignal agentsignal.dev admin@agentsignal.dev",
  },
});

const FEED_URL =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=20&search_text=&action=getcurrent&output=atom";

export const secEdgar: SourceProvider = {
  name: "sec-edgar",
  type: "news",
  intervalMs: 600_000,

  async fetch(): Promise<Signal[]> {
    try {
      const parsed = await parser.parseURL(FEED_URL);
      const signals: Signal[] = [];

      for (const item of (parsed.items || []).slice(0, 15)) {
        if (!item.title || !item.link) continue;

        const pubDate = item.pubDate || item.isoDate
          ? new Date(item.pubDate || item.isoDate!).toISOString()
          : new Date().toISOString();

        const summary =
          (item.contentSnippet || item.content?.replace(/<[^>]*>/g, ""))
            ?.replace(/\s+/g, " ")
            .trim()
            .slice(0, 200) || "SEC 8-K filing";

        signals.push({
          id: `sig_sec_${nanoid(8)}`,
          timestamp: pubDate,
          type: "news",
          source: "sec-edgar",
          title: item.title.replace(/\s+/g, " ").trim(),
          summary,
          url: item.link,
          topics: ["finance", "sec", "filings"],
          score: 0,
          metadata: {
            formType: "8-K",
            author: item.author || undefined,
          },
        });
      }

      return signals;
    } catch (err) {
      console.error("[sec-edgar] Failed to fetch feed:", err);
      return [];
    }
  },
};
