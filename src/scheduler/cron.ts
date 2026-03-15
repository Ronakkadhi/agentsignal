import { sources } from "../sources/index.js";
import { store } from "../store/sqlite.js";
import { scoreSignals } from "../scoring/engine.js";
import { prefilterSignals } from "../scoring/prefilter.js";
import { enrichSignalTopics } from "../extraction/topics.js";
import { enrichTopSignals } from "../enrichment/haiku.js";
import { dispatchWebhooks } from "../webhooks/dispatcher.js";

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

    // Pipeline: prefilter → extract entities/topics → score
    signals = prefilterSignals(signals);
    signals = enrichSignalTopics(signals);
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

      // Async enrichment: enrich top signals via Claude Haiku
      if (process.env.ANTHROPIC_API_KEY) {
        enrichTopSignals().catch((err) =>
          console.error(`[enrich] Error: ${err instanceof Error ? err.message : err}`)
        );
      }

      // Async webhook dispatch: push to registered webhooks
      dispatchWebhooks(signals.filter((s) => s.score >= 40)).catch((err) =>
        console.error(`[webhooks] Error: ${err instanceof Error ? err.message : err}`)
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    store.updateSourceStatus(source.name, source.type, "error", message);
    console.error(`[${source.name}] Error: ${message}`);
  }
}
