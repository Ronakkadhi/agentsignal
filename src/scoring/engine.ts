import { Signal, ExtractedEntities } from "../types.js";

/**
 * Signal Scoring Engine v2
 *
 * Scores each signal 0-100 based on:
 * - Engagement (30%): upvotes, comments, volume — type-aware normalization
 * - Recency (25%): exponential decay, with developing story boost
 * - Magnitude (20%): price change %, earthquake magnitude, odds shift
 * - Cross-source (15%): entity-based matching across sources
 * - Source authority (10%): topic-dependent authority scores
 */

// Type-aware engagement multipliers
// News/science engagement is harder to get, so same raw score means more
const TYPE_ENGAGEMENT_MULTIPLIER: Record<string, number> = {
  news: 1.5,
  science: 2.0,
  geo: 1.0,
  market: 1.0,
  social: 1.0,
  events: 1.0,
};

// 2D authority: source → { signalType → score }
const SOURCE_AUTHORITY: Record<string, Record<string, number>> = {
  "google-news": { news: 85, default: 70 },
  "rss-feeds": { news: 75, default: 60 },
  coingecko: { market: 85, default: 40 },
  polymarket: { events: 80, market: 75, default: 50 },
  "usgs-earthquakes": { geo: 95, default: 30 },
  arxiv: { science: 90, default: 50 },
  hackernews: { social: 65, default: 55 },
  reddit: { social: 55, default: 45 },
};

// Entity cluster for developing story detection
interface EntityCluster {
  sources: Set<string>;
  timestamps: number[];
}

export function scoreSignals(signals: Signal[]): Signal[] {
  const now = Date.now();

  // Build entity map for cross-source matching
  const entitySourceMap = new Map<string, string[]>();
  // Build entity cluster map for developing story detection
  const entityClusters = new Map<string, EntityCluster>();

  for (const s of signals) {
    const entities = s.metadata?.entities as ExtractedEntities | undefined;
    const signalTime = new Date(s.timestamp).getTime();

    // Index by entities (companies, people, tickers)
    const entityKeys: string[] = [];
    if (entities) {
      entityKeys.push(...(entities.companies || []).map((c) => c.toLowerCase()));
      entityKeys.push(...(entities.people || []).map((p) => p.toLowerCase()));
      entityKeys.push(...(entities.tickers || []).map((t) => t.toLowerCase()));
    }

    for (const key of entityKeys) {
      // Cross-source map
      if (!entitySourceMap.has(key)) entitySourceMap.set(key, []);
      entitySourceMap.get(key)!.push(s.source);

      // Developing story clusters
      if (!entityClusters.has(key)) {
        entityClusters.set(key, { sources: new Set(), timestamps: [] });
      }
      const cluster = entityClusters.get(key)!;
      cluster.sources.add(s.source);
      cluster.timestamps.push(signalTime);
    }

    // Also index by normalized title (fallback for signals without extracted entities)
    const titleKey = normalizeTitle(s.title);
    if (!entitySourceMap.has(titleKey)) entitySourceMap.set(titleKey, []);
    entitySourceMap.get(titleKey)!.push(s.source);
  }

  return signals.map((signal) => {
    const engagement = scoreEngagement(signal);
    const recency = scoreRecency(signal, now, entityClusters);
    const magnitude = scoreMagnitude(signal);
    const crossSource = scoreCrossSource(signal, entitySourceMap);
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
  let raw = 0;

  // HN: score based on points
  if (signal.source === "hackernews") {
    const points = (meta.score as number) || 0;
    if (points >= 500) raw = 100;
    else if (points >= 200) raw = 80;
    else if (points >= 100) raw = 60;
    else if (points >= 50) raw = 40;
    else raw = 20;
  }
  // Reddit: score based on upvotes
  else if (signal.source === "reddit") {
    const score = (meta.score as number) || 0;
    if (score >= 5000) raw = 100;
    else if (score >= 1000) raw = 80;
    else if (score >= 500) raw = 60;
    else if (score >= 100) raw = 40;
    else raw = 20;
  }
  // CoinGecko: score based on 24h volume
  else if (signal.source === "coingecko") {
    const volume = (meta.volume24h as number) || 0;
    if (volume >= 1e10) raw = 100;
    else if (volume >= 1e9) raw = 80;
    else if (volume >= 1e8) raw = 60;
    else if (volume >= 1e7) raw = 40;
    else raw = 20;
  }
  // Polymarket: score based on volume
  else if (signal.source === "polymarket") {
    const volume = (meta.volume as number) || 0;
    if (volume >= 1e7) raw = 100;
    else if (volume >= 1e6) raw = 80;
    else if (volume >= 1e5) raw = 60;
    else if (volume >= 1e4) raw = 40;
    else raw = 20;
  }
  // USGS: score based on USGS significance
  else if (signal.source === "usgs-earthquakes") {
    const sig = (meta.significance as number) || 0;
    if (sig >= 600) raw = 100;
    else if (sig >= 400) raw = 80;
    else if (sig >= 200) raw = 60;
    else if (sig >= 100) raw = 40;
    else raw = 20;
  }
  // Default: moderate engagement for news sources
  else {
    raw = 50;
  }

  // Apply type-aware multiplier
  const multiplier = TYPE_ENGAGEMENT_MULTIPLIER[signal.type] ?? 1.0;
  return Math.min(100, Math.round(raw * multiplier));
}

function scoreRecency(
  signal: Signal,
  now: number,
  entityClusters: Map<string, EntityCluster>
): number {
  const ageMs = now - new Date(signal.timestamp).getTime();
  const ageMinutes = ageMs / 60_000;

  // Base recency score with exponential decay
  let base: number;
  if (ageMinutes <= 5) base = 100;
  else if (ageMinutes <= 15) base = 90;
  else if (ageMinutes <= 30) base = 75;
  else if (ageMinutes <= 60) base = 55;
  else if (ageMinutes <= 120) base = 35;
  else if (ageMinutes <= 360) base = 20;
  else base = 10;

  // Developing story boost: if same entity appears in 3+ signals
  // from different sources within 2 hours, boost instead of decay
  const entities = signal.metadata?.entities as ExtractedEntities | undefined;
  if (entities) {
    const allKeys = [
      ...(entities.companies || []),
      ...(entities.people || []),
      ...(entities.tickers || []),
    ].map((k) => k.toLowerCase());

    for (const key of allKeys) {
      const cluster = entityClusters.get(key);
      if (!cluster) continue;

      // Check if 3+ unique sources mention this entity within 2 hours
      const recentTimestamps = cluster.timestamps.filter(
        (t) => now - t < 2 * 60 * 60 * 1000
      );
      if (cluster.sources.size >= 3 && recentTimestamps.length >= 3) {
        // Developing story — boost by 15 points
        return Math.min(100, base + 15);
      }
    }
  }

  return base;
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

  // Polymarket: check if odds are extreme
  if (signal.source === "polymarket") {
    const odds = meta.odds as Record<string, number> | undefined;
    if (odds) {
      const values = Object.values(odds);
      const maxOdds = Math.max(...values);
      if (maxOdds >= 0.9 || maxOdds <= 0.1) return 70;
      if (Math.abs(maxOdds - 0.5) < 0.1) return 60;
    }
    return 40;
  }

  return 50;
}

function scoreCrossSource(
  signal: Signal,
  entitySourceMap: Map<string, string[]>
): number {
  let maxSourceOverlap = 1;

  // Entity-based matching (primary)
  const entities = signal.metadata?.entities as ExtractedEntities | undefined;
  if (entities) {
    const allKeys = [
      ...(entities.companies || []).map((c) => c.toLowerCase()),
      ...(entities.people || []).map((p) => p.toLowerCase()),
      ...(entities.tickers || []).map((t) => t.toLowerCase()),
    ];

    for (const key of allKeys) {
      const sources = entitySourceMap.get(key) || [];
      const uniqueCount = new Set(sources).size;
      maxSourceOverlap = Math.max(maxSourceOverlap, uniqueCount);
    }
  }

  // Fallback: title-based matching (for signals without extracted entities)
  if (maxSourceOverlap === 1) {
    const titleKey = normalizeTitle(signal.title);
    const sources = entitySourceMap.get(titleKey) || [];
    const uniqueCount = new Set(sources).size;
    maxSourceOverlap = Math.max(maxSourceOverlap, uniqueCount);
  }

  if (maxSourceOverlap >= 4) return 100;
  if (maxSourceOverlap >= 3) return 80;
  if (maxSourceOverlap >= 2) return 50;
  return 10;
}

function scoreAuthority(signal: Signal): number {
  const sourceMap = SOURCE_AUTHORITY[signal.source];
  if (!sourceMap) return 50;
  return sourceMap[signal.type] ?? sourceMap.default ?? 50;
}

/** Normalize title for fallback cross-source matching */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}
