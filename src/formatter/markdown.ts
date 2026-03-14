import { Signal } from "../types.js";

export function formatMarkdown(signals: Signal[]): string {
  const now = new Date();
  const dateStr = now.toUTCString().replace("GMT", "UTC");

  const high = signals.filter((s) => s.score >= 80);
  const notable = signals.filter((s) => s.score >= 40 && s.score < 80);
  const background = signals.filter((s) => s.score < 40);

  let md = `# AgentSignal — ${dateStr}\n`;
  md += `> ${signals.length} signals from agentsignal.co\n\n`;

  if (high.length > 0) {
    md += `## 🔴 High Signal\n`;
    for (const s of high) {
      md += formatSignalLine(s, now);
    }
    md += "\n";
  }

  if (notable.length > 0) {
    md += `## 🟡 Notable\n`;
    for (const s of notable) {
      md += formatSignalLine(s, now);
    }
    md += "\n";
  }

  if (background.length > 0) {
    md += `## 🟢 Background\n`;
    for (const s of background) {
      md += formatSignalLine(s, now);
    }
    md += "\n";
  }

  if (signals.length === 0) {
    md += `_No signals matching your filters._\n`;
  }

  md += `---\n`;
  md += `_Powered by [AgentSignal](https://agentsignal.co) — open source signal feed for AI agents_\n`;

  return md;
}

function formatSignalLine(signal: Signal, now: Date): string {
  const age = formatAge(now.getTime() - new Date(signal.timestamp).getTime());
  const source = signal.source;

  // Special formatting for different signal types
  let detail = "";

  if (signal.source === "coingecko" && signal.metadata?.symbol) {
    detail = ` — ${signal.metadata.symbol}`;
  } else if (signal.source === "polymarket") {
    detail = ` — ${signal.summary}`;
    return `- [${signal.score}] **${signal.title}**${detail} — Polymarket — ${age} — [link](${signal.url})\n`;
  } else if (signal.source === "usgs-earthquakes") {
    detail = ` — ${signal.summary}`;
    return `- [${signal.score}] **${signal.title}**${detail} — USGS — ${age} — [link](${signal.url})\n`;
  } else if (signal.source === "hackernews" && signal.metadata?.score) {
    detail = ` — ${signal.metadata.score}pts, ${signal.metadata.comments} comments`;
  } else if (signal.source === "reddit" && signal.metadata?.score) {
    detail = ` — ${signal.metadata.score} upvotes`;
  }

  return `- [${signal.score}] **${signal.title}**${detail} — ${source} — ${age} — [link](${signal.url})\n`;
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
