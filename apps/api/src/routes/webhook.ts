import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { sites, auditRuns, alertChannels, alertLogs } from '../db/schema.js';
import { evaluateAuditState, dispatchAlert } from '../services/alert.js';
import type { AuditResultPayload } from '@mantiscan/shared';

type Bindings = {
  DB: D1Database;
  INGEST_SECRET: string;
};

export const webhookRouter = new Hono<{ Bindings: Bindings }>();

webhookRouter.post('/audit-result', async (c) => {
  const secretHeader = c.req.header('X-Ingest-Secret');
  const expectedSecret = c.env.INGEST_SECRET || 'mantiscan-dev-secret-token';

  if (!secretHeader || secretHeader !== expectedSecret) {
    return c.json({ error: 'Unauthorized: Invalid ingestion secret' }, 401);
  }

  const payload = await c.req.json<AuditResultPayload>();
  if (!payload.siteId || !payload.scores || !payload.strategy) {
    return c.json({ error: 'Missing required fields: siteId, scores, and strategy are mandatory' }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  // 1. Fetch the target site
  const site = await db.select().from(sites).where(eq(sites.id, payload.siteId)).get();
  if (!site) {
    return c.json({ error: `Site with id ${payload.siteId} not found` }, 404);
  }

  // 2. Fetch the previous run for this site and strategy
  const previousRun = await db
    .select()
    .from(auditRuns)
    .where(and(eq(auditRuns.siteId, payload.siteId), eq(auditRuns.strategy, payload.strategy)))
    .orderBy(desc(auditRuns.createdAt))
    .limit(1)
    .get();

  // 3. Evaluate state change and alerts
  const evalResult = evaluateAuditState(site, payload.scores, payload.strategy, previousRun);

  // 4. Save new audit run
  const runId = `run_${crypto.randomUUID().slice(0, 8)}`;
  await db
    .insert(auditRuns)
    .values({
      id: runId,
      siteId: site.id,
      triggeredBy: payload.triggeredBy || 'manual',
      strategy: payload.strategy,
      performanceScore: payload.scores.performance,
      accessibilityScore: payload.scores.accessibility,
      bestPracticesScore: payload.scores.bestPractices,
      seoScore: payload.scores.seo,
      lcpMs: payload.metrics?.lcpMs ?? null,
      cls: payload.metrics?.cls ?? null,
      inpMs: payload.metrics?.inpMs ?? null,
      reportUrl: payload.reportUrl ?? null,
      createdAt: now,
    })
    .run();

  // 5. Update site status
  await db
    .update(sites)
    .set({
      status: evalResult.newStatus,
      lastAuditedAt: now,
      lastRunStatus: 'success',
    })
    .where(eq(sites.id, site.id))
    .run();

  // 6. Dispatch notifications if action needed
  let alertsSent = 0;
  if (evalResult.action !== 'none') {
    const channels = await db
      .select()
      .from(alertChannels)
      .where(and(eq(alertChannels.siteId, site.id), eq(alertChannels.isActive, true)))
      .all();

    for (const channel of channels) {
      const dispatchResult = await dispatchAlert(
        channel,
        site,
        payload.scores,
        payload.metrics || {},
        payload.strategy,
        evalResult,
        payload.reportUrl
      );

      // Log alert history
      await db
        .insert(alertLogs)
        .values({
          id: `log_${crypto.randomUUID().slice(0, 8)}`,
          siteId: site.id,
          runId,
          alertType: evalResult.action,
          payloadSummary: JSON.stringify({
            channelType: channel.type,
            success: dispatchResult.success,
            error: dispatchResult.error,
          }),
          dispatchedAt: now,
        })
        .run();

      if (dispatchResult.success) {
        alertsSent++;
      }
    }
  }

  return c.json({
    success: true,
    runId,
    newStatus: evalResult.newStatus,
    alertAction: evalResult.action,
    alertsSent,
  });
});
