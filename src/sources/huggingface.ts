import { Signal, SourceProvider } from "../types.js";

interface HFModel {
  modelId: string;
  downloads: number;
  likes: number;
  pipeline_tag: string;
  createdAt: string;
  tags: string[];
}

export const huggingface: SourceProvider = {
  name: "huggingface",
  type: "science",
  intervalMs: 300_000,

  async fetch(): Promise<Signal[]> {
    try {
      const res = await fetch(
        "https://huggingface.co/api/models?sort=likes&direction=-1&limit=20"
      );
      const data = await res.json();
      const models: HFModel[] = Array.isArray(data) ? data : [];

      return models.map((model) => ({
        id: `sig_hf_${model.modelId.replace("/", "_")}`,
        timestamp: model.createdAt ? new Date(model.createdAt).toISOString() : new Date().toISOString(),
        type: "science" as const,
        source: "huggingface",
        title: model.modelId,
        summary: `${model.pipeline_tag || "model"} | ${model.downloads?.toLocaleString() || 0} downloads | ${model.likes || 0} likes`,
        url: `https://huggingface.co/${model.modelId}`,
        topics: ["ai", "ml", "models", model.pipeline_tag?.toLowerCase()].filter(
          Boolean
        ) as string[],
        score: 0,
        metadata: {
          downloads: model.downloads,
          likes: model.likes,
          pipeline: model.pipeline_tag,
        },
      }));
    } catch (err) {
      console.error("huggingface fetch failed:", err);
      return [];
    }
  },
};
