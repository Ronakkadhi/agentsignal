import { Signal } from "../types.js";

/**
 * Central entity & topic extraction pipeline.
 * Replaces per-source inferTopics() with a unified approach.
 * Regex-based — fast, no ML dependencies.
 */

export interface ExtractedEntities {
  topics: string[];
  tickers: string[];
  companies: string[];
  people: string[];
}

// Unified keyword → topic map (merged from HN, Polymarket, and general)
const TOPIC_KEYWORDS: Record<string, string> = {
  // AI / ML
  ai: "ai",
  "artificial intelligence": "ai",
  "machine learning": "ml",
  "deep learning": "ml",
  llm: "ai",
  gpt: "ai",
  claude: "ai",
  openai: "ai",
  anthropic: "ai",
  "stable diffusion": "ai",
  midjourney: "ai",
  "neural network": "ml",

  // Crypto
  crypto: "crypto",
  bitcoin: "crypto",
  ethereum: "crypto",
  solana: "crypto",
  defi: "crypto",
  nft: "crypto",
  blockchain: "crypto",

  // Finance
  "interest rate": "finance",
  "fed ": "finance",
  "stock market": "finance",
  inflation: "finance",
  recession: "finance",
  "wall street": "finance",
  earnings: "finance",
  ipo: "finance",

  // Tech
  rust: "rust",
  python: "python",
  javascript: "javascript",
  typescript: "javascript",
  react: "frontend",
  linux: "linux",
  android: "android",
  ios: "ios",
  startup: "startups",
  "show hn": "show-hn",
  "open source": "open-source",
  api: "dev",
  database: "dev",
  cloud: "cloud",
  kubernetes: "cloud",
  docker: "cloud",

  // Security
  security: "security",
  vulnerability: "security",
  hack: "security",
  breach: "security",
  ransomware: "security",
  cve: "security",

  // Politics / Geopolitics
  election: "politics",
  president: "politics",
  congress: "politics",
  senate: "politics",
  democrat: "politics",
  republican: "politics",
  war: "geopolitics",
  ukraine: "geopolitics",
  china: "geopolitics",
  russia: "geopolitics",
  nato: "geopolitics",
  regulation: "regulation",
  "eu ": "regulation",

  // Sports
  "super bowl": "sports",
  nba: "sports",
  nfl: "sports",
  "world cup": "sports",

  // Science
  climate: "climate",
  earthquake: "earthquake",
  "space ": "space",
  nasa: "space",
  spacex: "space",
};

// Company name variants → canonical name
const COMPANY_MAP: Record<string, string> = {
  openai: "OpenAI",
  "open ai": "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  alphabet: "Google",
  apple: "Apple",
  microsoft: "Microsoft",
  meta: "Meta",
  facebook: "Meta",
  amazon: "Amazon",
  aws: "Amazon",
  nvidia: "NVIDIA",
  tesla: "Tesla",
  netflix: "Netflix",
  twitter: "X",
  "x corp": "X",
  spacex: "SpaceX",
  stripe: "Stripe",
  coinbase: "Coinbase",
  binance: "Binance",
  samsung: "Samsung",
  intel: "Intel",
  amd: "AMD",
  oracle: "Oracle",
  salesforce: "Salesforce",
  uber: "Uber",
  airbnb: "Airbnb",
  shopify: "Shopify",
  cloudflare: "Cloudflare",
  databricks: "Databricks",
};

// Notable people lookup
const PEOPLE_MAP: Record<string, string> = {
  "sam altman": "Sam Altman",
  "elon musk": "Elon Musk",
  "mark zuckerberg": "Mark Zuckerberg",
  "jeff bezos": "Jeff Bezos",
  "tim cook": "Tim Cook",
  "satya nadella": "Satya Nadella",
  "sundar pichai": "Sundar Pichai",
  "jensen huang": "Jensen Huang",
  "dario amodei": "Dario Amodei",
  trump: "Donald Trump",
  biden: "Joe Biden",
  "janet yellen": "Janet Yellen",
  "jerome powell": "Jerome Powell",
  "warren buffett": "Warren Buffett",
  "bill gates": "Bill Gates",
  "jack dorsey": "Jack Dorsey",
  "vitalik buterin": "Vitalik Buterin",
  "brian armstrong": "Brian Armstrong",
  "changpeng zhao": "Changpeng Zhao",
};

// Regex for stock/crypto tickers: $BTC, $AAPL, etc.
const TICKER_REGEX = /\$([A-Z]{1,5})\b/g;

export function extractEntities(
  title: string,
  summary: string
): ExtractedEntities {
  const text = `${title} ${summary}`;
  const lower = text.toLowerCase();

  // Extract topics
  const topicSet = new Set<string>();
  for (const [keyword, topic] of Object.entries(TOPIC_KEYWORDS)) {
    if (lower.includes(keyword)) {
      topicSet.add(topic);
    }
  }

  // Extract tickers
  const tickers = new Set<string>();
  let match;
  while ((match = TICKER_REGEX.exec(text)) !== null) {
    tickers.add(`$${match[1]}`);
  }
  TICKER_REGEX.lastIndex = 0; // Reset regex state

  // Extract companies
  const companies = new Set<string>();
  for (const [variant, canonical] of Object.entries(COMPANY_MAP)) {
    // Use word boundary-ish matching to avoid "Apple" in "pineapple"
    const pattern = new RegExp(`\\b${variant}\\b`, "i");
    if (pattern.test(text)) {
      companies.add(canonical);
    }
  }

  // Extract people
  const people = new Set<string>();
  for (const [variant, canonical] of Object.entries(PEOPLE_MAP)) {
    if (lower.includes(variant)) {
      people.add(canonical);
    }
  }

  return {
    topics: Array.from(topicSet),
    tickers: Array.from(tickers),
    companies: Array.from(companies),
    people: Array.from(people),
  };
}

/**
 * Enrich signals with extracted entities.
 * Merges extracted topics with existing source-specific topics.
 */
export function enrichSignalTopics(signals: Signal[]): Signal[] {
  return signals.map((signal) => {
    const entities = extractEntities(signal.title, signal.summary);

    // Merge extracted topics with existing source-specific topics
    const mergedTopics = new Set([...signal.topics, ...entities.topics]);

    return {
      ...signal,
      topics: Array.from(mergedTopics),
      metadata: {
        ...signal.metadata,
        entities: {
          tickers: entities.tickers,
          companies: entities.companies,
          people: entities.people,
        },
      },
    };
  });
}
