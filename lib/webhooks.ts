import { eq, sql } from "drizzle-orm";
import type { Job } from "pg-boss";

import { db } from "@/lib/db";
import { webhooks } from "@/lib/db/schema";
import { reportError } from "@/lib/error-reporter";
import { signWebhookBody } from "@/lib/webhook-signature";

export { signWebhookBody } from "@/lib/webhook-signature";

export const WEBHOOK_DELIVERY_QUEUE = "webhook-deliver";

export type WebhookEvent = {
  type: string;
  taskContent: string;
  projectId: string | null;
  projectName: string;
  occurredAt: string;
};

export type WebhookDelivery = {
  webhookId: string;
  event: WebhookEvent;
};

async function deliverWebhook({ data }: Job<WebhookDelivery>) {
  const [webhook] = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      secret: webhooks.secret,
      isActive: webhooks.isActive,
    })
    .from(webhooks)
    .where(eq(webhooks.id, data.webhookId));

  if (!webhook || !webhook.isActive) return;

  const body = JSON.stringify(data.event);
  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signWebhookBody(webhook.secret, body),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Webhook responded ${response.status}`);

    await db
      .update(webhooks)
      .set({ failureCount: 0 })
      .where(eq(webhooks.id, webhook.id));
  } catch (error) {
    reportError(error, { source: "webhooks", webhookId: webhook.id });
    const [updated] = await db
      .update(webhooks)
      .set({ failureCount: sql`${webhooks.failureCount} + 1` })
      .where(eq(webhooks.id, webhook.id))
      .returning({ failureCount: webhooks.failureCount });

    // Twenty consecutive failures is the ceiling before an endpoint is disabled.
    if (updated && updated.failureCount >= 20) {
      await db
        .update(webhooks)
        .set({ isActive: false })
        .where(eq(webhooks.id, webhook.id));
    }
    throw error;
  }
}

export async function deliverWebhooks(jobs: Job<WebhookDelivery>[]) {
  for (const job of jobs) await deliverWebhook(job);
}
