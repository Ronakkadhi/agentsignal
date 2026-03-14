import { Hono } from "hono";
import { store } from "../store/memory.js";

const sourcesApi = new Hono();

sourcesApi.get("/", (c) => {
  const sources = store.getSources();
  const stats = store.getStats();

  return c.json({
    ok: true,
    totalSignals: stats.totalSignals,
    sources: sources.map((s) => ({
      name: s.name,
      type: s.type,
      status: s.status,
      lastFetched: s.lastFetched,
      lastError: s.lastError,
      signalCount: s.signalCount,
    })),
  });
});

export { sourcesApi };
