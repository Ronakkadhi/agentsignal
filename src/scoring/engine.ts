import { Signal } from "../types.js";

/**
 * Signal Scoring Engine
 *
 * Scores each signal 0-100 based on:
 * - Engagement (30%): upvotes, comments, volume — normalized per source
 * - Recency (25%): exponential decay from publish time
 * - Magnitude (20%): price change %, earthquake magnitude, odds shift
 * - Cross-source (15%): same story across multiple sources
 * - Source authority (10%): wire services > blogs
 */

const SOURCE_AUTHORITY: Record<string, number> = {
  // Wire services / major outlets (high authority)
  "google-news": 85,
  reuters: 90,
  bbc: 90,
  "ars-technica": 75,
  "the-verge": 70,
  techcrunch: 75,

  // Structured data sources (high reliability)
  coingecko: 80,
  polymarket: 75,
  "usgs-earthquakes": 95,
  arxiv: 80,

  // Community/social (variable)
  hackernews: 65,
  reddit: 55,
  "rss-feeds": 70,
};

export function scoreSignals(signals: Signal[]): Signal[] {
  const now = Date.now();

  // Build cross-source map: normalize titles for matching
  const titleMap = new Map<string, string[]>();
  for (const s of signals) {
    const key = normalizeTitle(s.title);
    if (!titleMap.has(key)) titleMap.set(key, []);
    titleMap.get(key)!.push(s.source);
  }

  return signals.map((signal) => {
    const engagement = scoreEngagement(signal);
    const recency = scoreRecency(signal, now);
    const magnitude = scoreMagnitude(signal);
    const crossSource = scoreCrossSource(signal, titleMap);
    const authority = scoreAuthority(signal);

    const score = Math.round(
      engagement * 0.3 +
        recency * 0.25 +
        magnitude * 0.2 +
        crossSource * 0.15 +
        authority * 0.1
    );

    return { ...signal, score: Math.min(100, Math.max(0, score)) };
  });
}

function scoreEngagement(signal: Signal): number {
  const meta = signal.metadata || {};

  // HN: score based on points
  if (signal.source === "hackernews") {
    const points = (meta.score as number) || 0;
    if (points >= 500) return 100;
    if (points >= 200) return 80;
    if (points >= 100) return 60;
    if (points >= 50) return 40;
    return 20;
  }

  // Reddit: score based on upvotes
  if (signal.source === "reddit") {
    const score = (meta.score as number) || 0;
    if (score >= 5000) return 100;
    if (score >= 1000) return 80;
    if (score >= 500) return 60;
    if (score >= 100) return 40;
    return 20;
  }

  // CoinGecko: score based on 24h volume
  if (signal.source === "coingecko") {
    const volume = (meta.volume24h as number) || 0;
    if (volume >= 1e10) return 100; // $10B+
    if (volume >= 1e9) return 80;
    if (volume >= 1e8) return 60;
    if (volume >= 1e7) return 40;
    return 20;
  }

  // Polymarket: score based on volume
  if (signal.source === "polymarket") {
    const volume = (meta.volume as number) || 0;
    if (volume >= 1e7) return 100;
    if (volume >= 1e6) return 80;
    if (volume >= 1e5) return 60;
    if (volume >= 1e4) return 40;
    return 20;
  }

  // USGS: score based on USGS significance
  if (signal.source === "usgs-earthquakes") {
    const sig = (meta.significance as number) || 0;
    if (sig >= 600) return 100;
    if (sig >= 400) return 80;
    if (sig >= 200) return 60;
    if (sig >= 100) return 40;
    return 20;
  }

  // Default: moderate engagement for news sources
  return 50;
}

function scoreRecency(signal: Signal, now: number): number {
  const ageMs = now - new Date(signal.timestamp).getTime();
  const ageMinutes = ageMs / 60_000;

  // Exponential decay: 100 at 0min, ~50 at 30min, ~25 at 1hr, ~5 at 2hr
  if (ageMinutes <= 5) return 100;
  if (ageMinutes <= 15) return 90;
  if (ageMinutes <= 30) return 75;
  if (ageMinutes <= 60) return 55;
  if (ageMinutes <= 120) return 35;
  if (ageMinutes <= 360) return 20;
  return 10;
}

function scoreMagnitude(signal: Signal): number {
  const meta = signal.metadata || {};

  // Crypto: price change magnitude
  if (signal.source === "coingecko" && meta.change24h !== undefined) {
    const absChange = Math.abs(meta.change24h as number);
    if (absChange >= 20) return 100;
    if (absChange >= 10) return 85;
    if (absChange >= 5) return 65;
    if (absChange >= 2) return 40;
    return 20;
  }

  // Earthquakes: magnitude
  if (signal.source === "usgs-earthquakes") {
    const mag = (meta.magnitude as number) || 0;
    if (mag >= 7) return 100;
    if (mag >= 6) return 85;
    if (mag >= 5) return 65;
    if (mag >= 4) return 40;
    return 20;
  }

  // Polymarket: check if odds are extreme (very likely/unlikely = interesting)
  if (signal.source === "polymarket") {
    const odds = meta.odds as Record<string, number> | undefined;
    if (odds) {
      const values = Object.values(odds);
      const maxOdds = Math.max(...values);
      // Very decisive markets (>90% or <10%) are more noteworthy
      if (maxOdds >= 0.9 || maxOdds <= 0.1) return 70;
      // Close races are interesting too
      if (Math.abs(maxOdds - 0.5) < 0.1) return 60;
    }
    return 40;
  }

  // Default magnitude
  return 50;
}

function scoreCrossSource(
  signal: Signal,
  titleMap: Map<string, string[]>
): number {
  const key = normalizeTitle(signal.title);
  const sources = titleMap.get(key) || [];
  const uniqueSources = new Set(sources).size;

  if (uniqueSources >= 4) return 100;
  if (uniqueSources >= 3) return 80;
  if (uniqueSources >= 2) return 50;
  return 10;
}

function scoreAuthority(signal: Signal): number {
  return SOURCE_AUTHORITY[signal.source] ?? 50;
}

/** Normalize title for cross-source matching */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6) // First 6 words for fuzzy matching
    .join(" ");
}
