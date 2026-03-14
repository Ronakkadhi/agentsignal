import { sources } from "../sources/index.js";
import { store } from "../store/memory.js";
import { scoreSignals } from "../scoring/engine.js";

export function startScheduler() {
  console.log(`[scheduler] Starting with ${sources.length} sources`);

  // Initial fetch for all sources
  for (const source of sources) {
    fetchSource(source.name);
  }

  // Schedule recurring fetches per source interval
  for (const source of sources) {
    setInterval(() => fetchSource(source.name), source.intervalMs);
  }
}

async function fetchSource(name: string) {
  const source = sources.find((s) => s.name === name);
  if (!source) return;

  try {
    let signals = await source.fetch();

    // Score all signals
    signals = scoreSignals(signals);

    const added = store.add(signals);
    store.updateSourceStatus(
      source.name,
      source.type,
      "active",
      undefined,
      signals.length
    );
    if (added > 0) {
      console.log(
        `[${source.name}] +${added} new signals (${signals.length} fetched)`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    store.updateSourceStatus(source.name, source.type, "error", message);
    console.error(`[${source.name}] Error: ${message}`);
  }
}
