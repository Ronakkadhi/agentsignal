import Parser from "rss-parser";
import { nanoid } from "nanoid";
import { Signal, SourceProvider } from "../types.js";

const parser = new Parser();

const FEEDS = [
  {
    url: "https://rss.arxiv.org/rss/cs.AI",
    category: "artificial-intelligence",
    topics: ["ai"],
  },
  {
    url: "https://rss.arxiv.org/rss/cs.LG",
    category: "machine-learning",
    topics: ["ai", "ml"],
  },
  {
    url: "https://rss.arxiv.org/rss/cs.CL",
    category: "nlp",
    topics: ["ai", "nlp"],
  },
];

export const arxiv: SourceProvider = {
  name: "arxiv",
  type: "science",
  intervalMs: 300_000,

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

          // Clean up ArXiv titles (they often have newlines and extra whitespace)
          const title = item.title.replace(/\s+/g, " ").trim();

          const summary =
            item.contentSnippet
              ?.replace(/\s+/g, " ")
              .trim()
              .slice(0, 200) || `ArXiv ${feed.category} paper`;

          allSignals.push({
            id: `sig_arxiv_${nanoid(8)}`,
            timestamp: pubDate,
            type: "science",
            source: "arxiv",
            title,
            summary,
            url: item.link.replace("abs", "pdf"), // Direct PDF link
            topics: [...feed.topics, "research"],
            score: 0, // Will be scored by engine
            metadata: {
              category: feed.category,
              abstractUrl: item.link,
              authors: item.creator || item.author || undefined,
            },
          });
        }
      } catch (err) {
        console.error(`[arxiv] feed ${feed.url} failed:`, err);
      }
    }

    return allSignals;
  },
};
