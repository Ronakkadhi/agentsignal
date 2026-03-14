export type SignalType = "news" | "market" | "social" | "events" | "science" | "geo";

export interface Signal {
  id: string;
  timestamp: string;
  type: SignalType;
  source: string;
  title: string;
  summary: string;
  url: string;
  topics: string[];
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SourceProvider {
  name: string;
  type: SignalType;
  intervalMs: number;
  fetch(): Promise<Signal[]>;
}

export interface SourceStatus {
  name: string;
  type: SignalType;
  status: "active" | "error" | "pending";
  lastFetched: string | null;
  lastError: string | null;
  signalCount: number;
}

export type OutputFormat = "json" | "markdown";
