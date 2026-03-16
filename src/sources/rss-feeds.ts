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
  {
    name: "venturebeat",
    url: "https://venturebeat.com/feed/",
    topics: ["tech", "ai"],
  },
  {
    name: "wired",
    url: "https://www.wired.com/feed/rss",
    topics: ["tech"],
  },
  {
    name: "politico",
    url: "https://rss.politico.com/politics-news.xml",
    topics: ["politics", "policy"],
  },
  {
    name: "axios",
    url: "https://api.axios.com/feed/",
    topics: ["tech", "policy"],
  },
  {
    name: "coindesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    topics: ["crypto"],
  },
  {
    name: "cointelegraph",
    url: "https://cointelegraph.com/rss",
    topics: ["crypto"],
  },
  {
    name: "aljazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    topics: ["world", "geopolitics"],
  },
  {
    name: "marketwatch",
    url: "https://www.marketwatch.com/rss/topstories",
    topics: ["finance", "stocks"],
  },
  {
    name: "mit-tech-review",
    url: "https://www.technologyreview.com/feed/",
    topics: ["tech", "science"],
  },
  {
    name: "devto",
    url: "https://dev.to/feed",
    topics: ["tech", "programming"],
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
