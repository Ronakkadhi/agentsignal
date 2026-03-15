import Anthropic from "@anthropic-ai/sdk";
import { store, db } from "../store/sqlite.js";
import { Signal } from "../types.js";

const BATCH_SIZE = 10;
const MAX_ENRICHMENTS_PER_CYCLE = 50;
const MIN_SCORE_FOR_ENRICHMENT = 60;

interface EnrichmentResult {
  signalId: string;
  entities: {
    people: string[];
    companies: string[];
    tickers: string[];
  };
  oneLiner: string;
  category: string;
}

const saveEnrichment = db.prepare(`
  INSERT OR REPLACE INTO enrichments (signal_id, entities, summary, category)
  VALUES (?, ?, ?, ?)
`);

const markSignalEnriched = db.prepare(`
  UPDATE signals SET enriched = 1, entities = ? WHERE id = ?
`);

const saveEnrichmentBatch = db.transaction(
  (results: EnrichmentResult[]) => {
    for (const r of results) {
      const entitiesJson = JSON.stringify(r.entities);
      saveEnrichment.run(r.signalId, entitiesJson, r.oneLiner, r.category);
      markSignalEnriched.run(entitiesJson, r.signalId);
    }
  }
);

/**
 * Enrich top signals with Claude Haiku.
 * Extracts entities, generates 1-line summaries, categorizes.
 * Only enriches signals with score >= 60 that haven't been enriched yet.
 */
export async function enrichTopSignals(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  // Get unenriched signals above threshold
  const signals = store.getUnenriched(
    MIN_SCORE_FOR_ENRICHMENT,
    MAX_ENRICHMENTS_PER_CYCLE
  );

  if (signals.length === 0) return;

  const client = new Anthropic({ apiKey });

  // Process in batches
  for (let i = 0; i < signals.length; i += BATCH_SIZE) {
    const batch = signals.slice(i, i + BATCH_SIZE);

    try {
      const results = await enrichBatch(client, batch);
      if (results.length > 0) {
        saveEnrichmentBatch(results);
        console.log(
          `[enrich] Enriched ${results.length} signals (batch ${Math.floor(i / BATCH_SIZE) + 1})`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[enrich] Batch error: ${msg}`);
      // Don't mark as enriched on failure — will retry next cycle
    }
  }
}

async function enrichBatch(
  client: Anthropic,
  signals: Signal[]
): Promise<EnrichmentResult[]> {
  const signalList = signals
    .map(
      (s, i) =>
        `${i + 1}. [${s.source}] "${s.title}" — ${s.summary}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-20250414",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `For each signal below, extract structured data. Return ONLY a JSON array.

Signals:
${signalList}

For each signal, return:
{
  "index": <1-based index>,
  "entities": {
    "people": ["Name1", "Name2"],
    "companies": ["Company1"],
    "tickers": ["$BTC", "$AAPL"]
  },
  "oneLiner": "One sentence summary of why this matters",
  "category": "one of: AI, Crypto, Markets, Geopolitics, Science, Tech, Security, Climate, Sports, Economy, Other"
}

Return ONLY the JSON array. No markdown, no explanation.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Parse the JSON response — handle potential markdown wrapping
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Array<{
      index: number;
      entities: { people: string[]; companies: string[]; tickers: string[] };
      oneLiner: string;
      category: string;
    }>;

    return parsed
      .filter((item) => item.index >= 1 && item.index <= signals.length)
      .map((item) => ({
        signalId: signals[item.index - 1].id,
        entities: {
          people: item.entities?.people || [],
          companies: item.entities?.companies || [],
          tickers: item.entities?.tickers || [],
        },
        oneLiner: item.oneLiner || "",
        category: item.category || "Other",
      }));
  } catch {
    console.error("[enrich] Failed to parse Haiku response");
    return [];
  }
}
