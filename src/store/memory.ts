import { Signal, SignalType, SourceStatus } from "../types.js";

const MAX_SIGNALS = 1000;

class SignalStore {
  private signals: Signal[] = [];
  private seen = new Set<string>();
  private sourceStatus = new Map<string, SourceStatus>();

  add(signals: Signal[]): number {
    let added = 0;
    for (const signal of signals) {
      const key = signal.url || signal.id;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.signals.push(signal);
      added++;
    }

    // Sort by score (highest first), then by recency
    this.signals.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Trim to max capacity
    if (this.signals.length > MAX_SIGNALS) {
      const removed = this.signals.splice(MAX_SIGNALS);
      for (const s of removed) {
        this.seen.delete(s.url || s.id);
      }
    }

    return added;
  }

  query(filters: {
    type?: string[];
    source?: string[];
    topic?: string;
    minScore?: number;
    limit?: number;
    after?: string;
  }): Signal[] {
    let results = this.signals;

    if (filters.type?.length) {
      results = results.filter((s) => filters.type!.includes(s.type));
    }

    if (filters.source?.length) {
      results = results.filter((s) => filters.source!.includes(s.source));
    }

    if (filters.topic) {
      const topic = filters.topic.toLowerCase();
      results = results.filter(
        (s) =>
          s.title.toLowerCase().includes(topic) ||
          s.summary.toLowerCase().includes(topic) ||
          s.topics.some((t) => t.toLowerCase().includes(topic))
      );
    }

    if (filters.minScore !== undefined) {
      results = results.filter((s) => s.score >= filters.minScore!);
    }

    if (filters.after) {
      const afterTime = new Date(filters.after).getTime();
      results = results.filter(
        (s) => new Date(s.timestamp).getTime() > afterTime
      );
    }

    const limit = Math.min(filters.limit || 30, 100);
    return results.slice(0, limit);
  }

  /** Get all signals for scoring engine to rescore */
  getAll(): Signal[] {
    return this.signals;
  }

  updateSourceStatus(
    name: string,
    type: SignalType,
    status: "active" | "error",
    error?: string,
    count?: number
  ) {
    this.sourceStatus.set(name, {
      name,
      type,
      status,
      lastFetched:
        status === "active"
          ? new Date().toISOString()
          : (this.sourceStatus.get(name)?.lastFetched ?? null),
      lastError: error || null,
      signalCount: count ?? (this.sourceStatus.get(name)?.signalCount ?? 0),
    });
  }

  getSources(): SourceStatus[] {
    return Array.from(this.sourceStatus.values());
  }

  getStats() {
    return {
      totalSignals: this.signals.length,
      sources: this.sourceStatus.size,
    };
  }
}

export const store = new SignalStore();
