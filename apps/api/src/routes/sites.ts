import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { sites, auditRuns, alertChannels } from '../db/schema.js';
import { triggerAuditWorkflow } from '../services/github.js';
import { calculateNextAuditAt } from '../services/schedule.js';
import { DEFAULT_THRESHOLDS } from '@mantiscan/shared';
import type { CreateSiteInput, UpdateSiteInput } from '@mantiscan/shared';

type Bindings = {
  DB: D1Database;
  INGEST_SECRET: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  APP_URL?: string;
};

export const sitesRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/sites - List all sites with latest run and channels
sitesRouter.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const allSites = await db.select().from(sites).all();

  // For each site, fetch alert channels and latest runs for each strategy
  const enrichedSites = await Promise.all(
    allSites.map(async (site) => {
      const [channels, latestMobile, latestDesktop] = await Promise.all([
        db
          .select()
          .from(alertChannels)
          .where(eq(alertChannels.siteId, site.id))
          .all(),
        db
          .select()
          .from(auditRuns)
          .where(and(eq(auditRuns.siteId, site.id), eq(auditRuns.strategy, 'mobile')))
          .orderBy(desc(auditRuns.createdAt))
          .limit(1)
          .get(),
        db
          .select()
          .from(auditRuns)
          .where(and(eq(auditRuns.siteId, site.id), eq(auditRuns.strategy, 'desktop')))
          .orderBy(desc(auditRuns.createdAt))
          .limit(1)
          .get(),
      ]);

      const latestRuns = [latestMobile, latestDesktop].filter(Boolean);

      return {
        ...site,
        channels,
        latestRuns,
      };
    })
  );

  return c.json({ sites: enrichedSites });
});

// POST /api/sites - Create a new monitored site
sitesRouter.post('/', async (c) => {
  const body = await c.req.json<CreateSiteInput>();
  if (!body.name || !body.url) {
    return c.json({ error: 'Name and URL are required' }, 400);
  }

  // Normalize URL
  let targetUrl = body.url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const siteId = `site_${crypto.randomUUID().slice(0, 8)}`;

  const intervalDays = body.auditIntervalDays ?? 7;
  const hourUtc = body.auditHourUtc ?? 0;
  const nextAuditAt = calculateNextAuditAt(intervalDays, hourUtc, new Date());

  const newSite = {
    id: siteId,
    name: body.name.trim(),
    url: targetUrl,
    perfThreshold: body.perfThreshold ?? DEFAULT_THRESHOLDS.performance,
    a11yThreshold: body.a11yThreshold ?? DEFAULT_THRESHOLDS.accessibility,
    bestPracticesThreshold: body.bestPracticesThreshold ?? DEFAULT_THRESHOLDS.bestPractices,
    seoThreshold: body.seoThreshold ?? DEFAULT_THRESHOLDS.seo,
    status: 'unknown' as const,
    auditIntervalDays: intervalDays,
    auditHourUtc: hourUtc,
    nextAuditAt,
    lastAuditedAt: null,
    lastRunStatus: 'running' as const,
    createdAt: now,
  };

  await db.insert(sites).values(newSite).run();

  // Insert initial Slack webhook if provided
  if (body.slackWebhookUrl?.trim()) {
    await db
      .insert(alertChannels)
      .values({
        id: `chan_${crypto.randomUUID().slice(0, 8)}`,
        siteId,
        type: 'slack',
        webhookUrl: body.slackWebhookUrl.trim(),
        isActive: true,
        createdAt: now,
      })
      .run();
  }

  // Insert initial Discord webhook if provided
  if (body.discordWebhookUrl?.trim()) {
    await db
      .insert(alertChannels)
      .values({
        id: `chan_${crypto.randomUUID().slice(0, 8)}`,
        siteId,
        type: 'discord',
        webhookUrl: body.discordWebhookUrl.trim(),
        isActive: true,
        createdAt: now,
      })
      .run();
  }

  // Trigger immediate baseline audit run
  const appUrl = c.env.APP_URL || new URL(c.req.url).origin;
  const callbackUrl = `${appUrl}/api/webhooks/audit-result`;

  const triggerPromise = triggerAuditWorkflow({
    siteId: newSite.id,
    url: newSite.url,
    name: newSite.name,
    callbackUrl,
    ingestSecret: c.env.INGEST_SECRET || 'mantiscan-dev-secret-token',
    githubOwner: c.env.GITHUB_OWNER,
    githubRepo: c.env.GITHUB_REPO,
    githubToken: c.env.GITHUB_TOKEN,
  });

  if (c.executionCtx?.waitUntil) {
    c.executionCtx.waitUntil(triggerPromise);
  } else {
    // If running in local node environment without executionCtx
    triggerPromise.catch((err) => console.error('Baseline audit trigger error:', err));
  }

  return c.json({ site: newSite }, 201);
});

// PUT /api/sites/:id - Update site settings, thresholds, and schedule
sitesRouter.put('/:id', async (c) => {
  const siteId = c.req.param('id');
  const body = await c.req.json<UpdateSiteInput>();
  const db = drizzle(c.env.DB);

  const existingSite = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!existingSite) {
    return c.json({ error: 'Site not found' }, 404);
  }

  const updates: Partial<typeof sites.$inferInsert> = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.url?.trim()) {
    let targetUrl = body.url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }
    updates.url = targetUrl;
  }
  if (body.perfThreshold !== undefined) updates.perfThreshold = body.perfThreshold;
  if (body.a11yThreshold !== undefined) updates.a11yThreshold = body.a11yThreshold;
  if (body.bestPracticesThreshold !== undefined) updates.bestPracticesThreshold = body.bestPracticesThreshold;
  if (body.seoThreshold !== undefined) updates.seoThreshold = body.seoThreshold;

  const intervalChanged = body.auditIntervalDays !== undefined && body.auditIntervalDays !== existingSite.auditIntervalDays;
  const hourChanged = body.auditHourUtc !== undefined && body.auditHourUtc !== existingSite.auditHourUtc;

  if (body.auditIntervalDays !== undefined) {
    updates.auditIntervalDays = body.auditIntervalDays;
  }
  if (body.auditHourUtc !== undefined) {
    updates.auditHourUtc = body.auditHourUtc;
  }

  // If schedule parameters changed, recompute nextAuditAt
  if (intervalChanged || hourChanged) {
    const newInterval = body.auditIntervalDays ?? existingSite.auditIntervalDays;
    const newHour = body.auditHourUtc ?? existingSite.auditHourUtc;
    updates.nextAuditAt = calculateNextAuditAt(newInterval, newHour, new Date());
  }

  if (Object.keys(updates).length > 0) {
    await db.update(sites).set(updates).where(eq(sites.id, siteId)).run();
  }

  const updatedSite = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  return c.json({ site: updatedSite });
});

// GET /api/sites/:id - Get site details and full audit history
sitesRouter.get('/:id', async (c) => {
  const siteId = c.req.param('id');
  const db = drizzle(c.env.DB);

  const site = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }

  const runs = await db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.siteId, siteId))
    .orderBy(desc(auditRuns.createdAt))
    .limit(50)
    .all();

  const channels = await db
    .select()
    .from(alertChannels)
    .where(eq(alertChannels.siteId, siteId))
    .all();

  return c.json({
    site,
    runs,
    channels,
  });
});

// DELETE /api/sites/:id - Delete site
sitesRouter.delete('/:id', async (c) => {
  const siteId = c.req.param('id');
  const db = drizzle(c.env.DB);

  const site = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }

  await db.delete(sites).where(eq(sites.id, siteId)).run();
  return c.json({ message: 'Site deleted successfully' });
});

// POST /api/sites/:id/scan - Trigger on-demand audit
sitesRouter.post('/:id/scan', async (c) => {
  const siteId = c.req.param('id');
  const db = drizzle(c.env.DB);

  const site = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }

  // Update site status to 'running'
  await db
    .update(sites)
    .set({ lastRunStatus: 'running' })
    .where(eq(sites.id, siteId))
    .run();

  const appUrl = c.env.APP_URL || new URL(c.req.url).origin;
  const callbackUrl = `${appUrl}/api/webhooks/audit-result`;

  const result = await triggerAuditWorkflow({
    siteId: site.id,
    url: site.url,
    name: site.name,
    callbackUrl,
    ingestSecret: c.env.INGEST_SECRET || 'mantiscan-dev-secret-token',
    githubOwner: c.env.GITHUB_OWNER,
    githubRepo: c.env.GITHUB_REPO,
    githubToken: c.env.GITHUB_TOKEN,
  });

  return c.json({
    message: result.message,
    mode: result.mode,
    siteId: site.id,
  });
});

// POST /api/sites/:id/channels - Add an alert channel
sitesRouter.post('/:id/channels', async (c) => {
  const siteId = c.req.param('id');
  const body = await c.req.json<{ type: 'slack' | 'discord'; webhookUrl: string }>();

  if (!body.type || !body.webhookUrl) {
    return c.json({ error: 'Channel type and webhookUrl are required' }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const channelId = `chan_${crypto.randomUUID().slice(0, 8)}`;

  await db
    .insert(alertChannels)
    .values({
      id: channelId,
      siteId,
      type: body.type,
      webhookUrl: body.webhookUrl.trim(),
      isActive: true,
      createdAt: now,
    })
    .run();

  return c.json({ channelId, message: 'Alert channel added' }, 201);
});

// DELETE /api/sites/:id/channels/:channelId - Remove alert channel
sitesRouter.delete('/:id/channels/:channelId', async (c) => {
  const channelId = c.req.param('channelId');
  const db = drizzle(c.env.DB);

  await db.delete(alertChannels).where(eq(alertChannels.id, channelId)).run();
  return c.json({ message: 'Alert channel removed' });
});
