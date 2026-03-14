import { Signal, SourceProvider } from "../types.js";

const EARTHQUAKE_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.geojson";

interface EarthquakeFeature {
  id: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    url: string;
    title: string;
    tsunami: number;
    sig: number; // USGS significance score 0-1000+
    type: string;
    alert: string | null;
  };
  geometry: {
    coordinates: [number, number, number]; // lng, lat, depth
  };
}

interface EarthquakeResponse {
  features: EarthquakeFeature[];
  metadata: {
    generated: number;
    count: number;
    title: string;
  };
}

export const usgsEarthquakes: SourceProvider = {
  name: "usgs-earthquakes",
  type: "geo",
  intervalMs: 120_000,

  async fetch(): Promise<Signal[]> {
    const res = await fetch(EARTHQUAKE_URL);
    if (!res.ok) return [];

    const data: EarthquakeResponse = await res.json();

    return data.features
      .filter((f) => f.properties.type === "earthquake")
      .map((feature) => {
        const p = feature.properties;
        const [lng, lat, depth] = feature.geometry.coordinates;
        const mag = p.mag;

        let severity = "Minor";
        if (mag >= 7) severity = "Major";
        else if (mag >= 6) severity = "Strong";
        else if (mag >= 5) severity = "Moderate";
        else if (mag >= 4) severity = "Light";

        const topics = ["earthquake", "natural-disaster"];
        if (p.tsunami) topics.push("tsunami");
        if (mag >= 6) topics.push("breaking");

        return {
          id: `sig_usgs_${feature.id}`,
          timestamp: new Date(p.time).toISOString(),
          type: "geo" as const,
          source: "usgs-earthquakes",
          title: `${severity} earthquake: M${mag.toFixed(1)} — ${p.place}`,
          summary: `Depth: ${depth.toFixed(0)}km | Significance: ${p.sig}${p.tsunami ? " | Tsunami warning" : ""}${p.alert ? ` | Alert: ${p.alert}` : ""}`,
          url: p.url,
          topics,
          score: 0, // Will be scored by engine
          metadata: {
            magnitude: mag,
            depth,
            latitude: lat,
            longitude: lng,
            significance: p.sig,
            tsunami: p.tsunami === 1,
            alert: p.alert,
          },
        };
      });
  },
};
