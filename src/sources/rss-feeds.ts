import Parser from "rss-parser";
import { nanoid } from "nanoid";
import { Signal, SourceProvider } from "../types.js";

const parser = new Parser();

const FEEDS = [
  {
    name: "bbc",
    url: "https://feeds.bbci.co.uk/news/rss.xml",
    topics: ["world"],
  },
  {
    name: "reuters",
    url: "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best",
    topics: ["world", "business"],
  },
  {
    name: "techcrunch",
    url: "https://techcrunch.com/feed/",
    topics: ["tech", "startups"],
  },
  {
    name: "ars-technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    topics: ["tech", "science"],
  },
  {
    name: "the-verge",
    url: "https://www.theverge.com/rss/index.xml",
    topics: ["tech"],
  },
];

export const rssFeeds: SourceProvider = {
  name: "rss-feeds",
  type: "news",
  intervalMs: 120_000,

  async fetch(): Promise<Signal[]> {
    const allSignals: Signal[] = [];

    for (const feed of FEEDS) {
      try {
        const parsed = await parser.parseURL(feed.url);

        for (const item of (parsed.items || []).slice(0, 8)) {
          if (!item.title || !item.link) continue;

          const pubDate = item.pubDate
            ? new Date(item.pubDate).toISOString()
            : new Date().toISOString();

          const summary =
            item.contentSnippet?.slice(0, 200) ||
            item.content?.replace(/<[^>]*>/g, "").slice(0, 200) ||
            `via ${feed.name}`;

          allSignals.push({
            id: `sig_rss_${feed.name}_${nanoid(8)}`,
            timestamp: pubDate,
            type: "news",
            source: feed.name,
            title: item.title,
            summary,
            url: item.link,
            topics: [...feed.topics],
            score: 0,
            metadata: {
              feed: feed.name,
              author: item.creator || item.author || undefined,
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
