import { SourceProvider } from "../types.js";
import { hackernews } from "./hackernews.js";
import { reddit } from "./reddit.js";
import { googleNews } from "./google-news.js";
import { coingecko } from "./coingecko.js";
import { polymarket } from "./polymarket.js";
import { rssFeeds } from "./rss-feeds.js";
import { arxiv } from "./arxiv.js";
import { productHunt } from "./product-hunt.js";
import { techmeme } from "./techmeme.js";
import { crunchbase } from "./crunchbase.js";
import { secEdgar } from "./sec-edgar.js";
import { congress } from "./congress.js";
import { lobsters } from "./lobsters.js";
import { kalshi } from "./kalshi.js";
import { metaculus } from "./metaculus.js";
import { defiLlama } from "./defi-llama.js";
import { huggingface } from "./huggingface.js";
import { cve } from "./cve.js";
import { yahooFinance } from "./yahoo-finance.js";
import { fred } from "./fred.js";
import { githubTrending } from "./github-trending.js";
import { gdelt } from "./gdelt.js";

export const sources: SourceProvider[] = [
  // Original sources
  hackernews,
  reddit,
  googleNews,
  coingecko,
  polymarket,
  rssFeeds,
  arxiv,
  // New RSS-based sources
  productHunt,
  techmeme,
  crunchbase,
  secEdgar,
  congress,
  // New JSON API sources
  lobsters,
  kalshi,
  metaculus,
  defiLlama,
  huggingface,
  cve,
  // Special sources
  yahooFinance,
  fred,
  githubTrending,
  gdelt,
];
