import { Signal, SourceProvider } from "../types.js";
import { nanoid } from "nanoid";

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

interface GdeltResponse {
  articles: GdeltArticle[];
}

function parseGdeltDate(d: string): string {
  // Format: 20260314T103000Z
  const match = d.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
  if (!match) return new Date().toISOString();
  return new Date(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`
  ).toISOString();
}

export const gdelt: SourceProvider = {
  name: "gdelt",
  type: "news",
  intervalMs: 600_000, // 10 min — GDELT rate limits aggressively

  async fetch(): Promise<Signal[]> {
    try {
      const url =
        "https://api.gdeltproject.org/api/v2/doc/doc?query=%28technology%20OR%20AI%20OR%20markets%29&mode=artlist&maxrecords=20&format=json&sourcelang=english&sort=DateDesc";
      const res = await fetch(url);

      if (!res.ok) return [];

      const text = await res.text();
      let data: GdeltResponse;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("[gdelt] Non-JSON response:", text.slice(0, 100));
        return [];
      }
      const articles = data?.articles ?? [];

      return articles.slice(0, 20).map((item) => ({
        id: `sig_gdelt_${nanoid(8)}`,
        timestamp: parseGdeltDate(item.seendate),
        type: "news" as const,
        source: "gdelt",
        title: item.title,
        summary: `via ${item.domain} | ${item.sourcecountry}`,
        url: item.url,
        topics: [],
        score: 0,
        metadata: {
          domain: item.domain,
          country: item.sourcecountry,
        },
      }));
    } catch (err) {
      console.error("[gdelt] fetch failed:", err);
      return [];
    }
  },
};
