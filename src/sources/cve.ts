import { Signal, SourceProvider } from "../types.js";

interface CvssMetric {
  cvssData: {
    baseScore: number;
    baseSeverity: string;
  };
}

interface CveItem {
  cve: {
    id: string;
    descriptions: { lang: string; value: string }[];
    published: string;
    metrics?: {
      cvssMetricV31?: CvssMetric[];
      cvssMetricV2?: CvssMetric[];
    };
  };
}

interface NvdResponse {
  vulnerabilities: CveItem[];
}

export const cve: SourceProvider = {
  name: "cve",
  type: "news",
  intervalMs: 300_000,

  async fetch(): Promise<Signal[]> {
    try {
      const res = await fetch(
        "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=15"
      );
      const data: NvdResponse = await res.json();

      return data.vulnerabilities.map((vuln) => {
        const cveData = vuln.cve;
        const description =
          cveData.descriptions.find((d) => d.lang === "en")?.value || "No description available";
        const metric =
          cveData.metrics?.cvssMetricV31?.[0] ??
          cveData.metrics?.cvssMetricV2?.[0];
        const baseScore = metric?.cvssData?.baseScore ?? null;
        const baseSeverity = metric?.cvssData?.baseSeverity ?? "UNKNOWN";

        return {
          id: `sig_cve_${cveData.id}`,
          timestamp: new Date(cveData.published).toISOString(),
          type: "news" as const,
          source: "cve",
          title: `${cveData.id}: ${description.slice(0, 100)}`,
          summary: `Severity: ${baseSeverity} (${baseScore ?? "N/A"}/10) | ${description.slice(0, 200)}`,
          url: `https://nvd.nist.gov/vuln/detail/${cveData.id}`,
          topics: ["security", "vulnerabilities"],
          score: 0,
          metadata: {
            cvss: baseScore,
            severity: baseSeverity,
          },
        };
      });
    } catch (err) {
      console.error("cve fetch failed:", err);
      return [];
    }
  },
};
