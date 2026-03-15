import { db } from "../store/sqlite.js";
import { Signal } from "../types.js";

interface WebhookRow {
  id: string;
  url: string;
  topics: string | null;
  min_score: number;
  consecutive_failures: number;
  dead: number;
}

const MAX_RETRIES = 3;
const TIMEOUT_MS = 5000;

/**
 * Dispatch new signals to registered webhooks.
 * Called from scheduler after new signals are added.
 */
export async function dispatchWebhooks(newSignals: Signal[]): Promise<void> {
  if (newSignals.length === 0) return;

  // Get all active (non-dead) webhooks
  const webhooks = db
    .prepare("SELECT * FROM webhooks WHERE dead = 0")
    .all() as WebhookRow[];

  if (webhooks.length === 0) return;

  // Process each webhook in parallel
  await Promise.allSettled(
    webhooks.map((webhook) => deliverToWebhook(webhook, newSignals))
  );
}

async function deliverToWebhook(
  webhook: WebhookRow,
  signals: Signal[]
): Promise<void> {
  // Filter signals matching this webhook's criteria
  const topics = webhook.topics ? (JSON.parse(webhook.topics) as string[]) : null;

  const matching = signals.filter((s) => {
    // Score filter
    if (s.score < webhook.min_score) return false;

    // Topic filter (if configured)
    if (topics && topics.length > 0) {
      const text = `${s.title} ${s.summary} ${s.topics.join(" ")}`.toLowerCase();
      const matches = topics.some((t) => text.includes(t));
      if (!matches) return false;
    }

    return true;
  });

  if (matching.length === 0) return;

  // Build payload
  const payload = {
    event: "new_signals",
    timestamp: new Date().toISOString(),
    webhook_id: webhook.id,
    signals: matching.map((s) => ({
      id: s.id,
      title: s.title,
      score: s.score,
      source: s.source,
      type: s.type,
      url: s.url,
      timestamp: s.timestamp,
      summary: s.summary,
    })),
  };

  // Send with retry
  const success = await sendWithRetry(webhook.url, payload);

  if (success) {
    // Reset failure counter on success
    db.prepare(
      "UPDATE webhooks SET consecutive_failures = 0 WHERE id = ?"
    ).run(webhook.id);
  } else {
    // Increment failure counter
    const newFailures = webhook.consecutive_failures + 1;
    const dead = newFailures >= 10 ? 1 : 0;

    db.prepare(
      "UPDATE webhooks SET consecutive_failures = ?, last_failure = ?, dead = ? WHERE id = ?"
    ).run(newFailures, new Date().toISOString(), dead, webhook.id);

    if (dead) {
      console.log(
        `[webhooks] Marked webhook ${webhook.id} as dead after ${newFailures} consecutive failures`
      );
    }
  }
}

async function sendWithRetry(
  url: string,
  payload: object,
  attempt = 1
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AgentSignal/0.1",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return res.ok;
  } catch {
    if (attempt < MAX_RETRIES) {
      // Exponential backoff: 1s, 4s, 16s
      const delay = Math.pow(4, attempt - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));
      return sendWithRetry(url, payload, attempt + 1);
    }
    return false;
  }
}
