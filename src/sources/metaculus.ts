import { Signal, SourceProvider } from "../types.js";

interface MetaculusQuestion {
  id: number;
  title: string;
  url: string;
  created_time: string;
  community_prediction: {
    full: { q2: number };
  } | null;
  number_of_predictions: number;
  comment_count: number;
}

interface MetaculusResponse {
  results: MetaculusQuestion[];
}

export const metaculus: SourceProvider = {
  name: "metaculus",
  type: "events",
  intervalMs: 300_000,

  async fetch(): Promise<Signal[]> {
    try {
      const token = process.env.METACULUS_API_TOKEN;
      if (!token) {
        console.warn("[metaculus] METACULUS_API_TOKEN not set, skipping");
        return [];
      }

      const res = await fetch(
        "https://www.metaculus.com/api/questions/?order_by=-activity&limit=20&type=forecast",
        { headers: { Authorization: `Token ${token}` } }
      );
      if (!res.ok) {
        console.error(`[metaculus] API returned ${res.status}`);
        return [];
      }
      const data: MetaculusResponse = await res.json();

      return data.results.map((q) => {
        const prediction = q.community_prediction?.full?.q2;
        const predictionStr =
          prediction != null
            ? `Community prediction: ${(prediction * 100).toFixed(0)}%`
            : "No prediction yet";

        return {
          id: `sig_meta_${q.id}`,
          timestamp: new Date(q.created_time).toISOString(),
          type: "events" as const,
          source: "metaculus",
          title: q.title,
          summary: `${predictionStr} | ${q.number_of_predictions} forecasters`,
          url: q.url || `https://www.metaculus.com/questions/${q.id}/`,
          topics: ["predictions", "forecasting"],
          score: 0,
          metadata: {
            prediction: prediction ?? null,
            forecasters: q.number_of_predictions,
            comments: q.comment_count,
          },
        };
      });
    } catch (err) {
      console.error("metaculus fetch failed:", err);
      return [];
    }
  },
};
