import { SourceProvider } from "../types.js";
import { hackernews } from "./hackernews.js";
import { reddit } from "./reddit.js";
import { googleNews } from "./google-news.js";
import { coingecko } from "./coingecko.js";
import { polymarket } from "./polymarket.js";
import { rssFeeds } from "./rss-feeds.js";
import { arxiv } from "./arxiv.js";
import { usgsEarthquakes } from "./usgs-earthquakes.js";

export const sources: SourceProvider[] = [
  hackernews,
  reddit,
  googleNews,
  coingecko,
  polymarket,
  rssFeeds,
  arxiv,
  usgsEarthquakes,
];
