import { Signal } from "../types.js";

/**
 * Pre-filter layer: removes obvious noise before scoring.
 * Runs before entity extraction and scoring to save compute.
 */

export function prefilterSignals(signals: Signal[]): Signal[] {
  const seenUrls = new Set<string>();

  return signals.filter((signal) => {
    // Kill duplicate URLs within same batch
    if (signal.url) {
      if (seenUrls.has(signal.url)) return false;
      seenUrls.add(signal.url);
    }

    // Skip garbage titles (too short = API artifact)
    if (signal.title.trim().length < 10) return false;

    // Skip signals where title and summary are identical (API noise)
    if (
      signal.title.trim().toLowerCase() ===
      signal.summary.trim().toLowerCase()
    ) {
      return false;
    }

    // Skip empty/placeholder signals
    if (!signal.title || signal.title === "undefined" || signal.title === "null")
      return false;

    return true;
  });
}
