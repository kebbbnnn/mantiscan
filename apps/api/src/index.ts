import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { lte, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { sitesRouter } from './routes/sites.js';
import { webhookRouter } from './routes/webhook.js';
import { sites } from './db/schema.js';
import { triggerAuditWorkflow } from './services/github.js';
import { calculateNextAuditAt } from './services/schedule.js';
import { getAuditCooldownStatus } from '@mantiscan/shared';

type Bindings = {
  DB: D1Database;
  INGEST_SECRET: string;
  APP_ENV?: string;
  APP_URL?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
};

export const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow localhost dev servers and cloudflare pages previews
      if (!origin || origin.includes('localhost') || origin.endsWith('.pages.dev')) {
        return origin || '*';
      }
      return origin;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Ingest-Secret'],
  })
);

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'mantiscan-api',
    time: new Date().toISOString(),
  });
});

// Mount routers
app.route('/api/sites', sitesRouter);
app.route('/api/webhooks', webhookRouter);

// Export worker with both fetch handler and scheduled cron handler
export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    const db = drizzle(env.DB);
    const now = Math.floor(Date.now() / 1000);

    // Find sites due for weekly audit (nextAuditAt <= now)
    const dueSites = await db
      .select()
      .from(sites)
      .where(lte(sites.nextAuditAt, now))
      .limit(10)
      .all();

    if (dueSites.length === 0) {
      return;
    }

    const appUrl = env.APP_URL || 'http://localhost:8787';
    const callbackUrl = `${appUrl}/api/webhooks/audit-result`;

    // Process each due site
    for (const site of dueSites) {
      ctx.waitUntil(
        (async () => {
          // Calculate next recurrence
          const nextAuditAt = calculateNextAuditAt(
            site.auditIntervalDays,
            site.auditHourUtc,
            new Date()
          );

          const cooldown = getAuditCooldownStatus(site, now);
          if (!cooldown.canScan) {
            // Advance nextAuditAt to prevent hourly retry storm, but skip duplicate runner dispatch
            await db
              .update(sites)
              .set({ nextAuditAt })
              .where(eq(sites.id, site.id))
              .run();
            return;
          }

          // Advance nextAuditAt immediately and record lastScanRequestedAt to avoid duplicate runs
          await db
            .update(sites)
            .set({
              nextAuditAt,
              lastRunStatus: 'running',
              lastScanRequestedAt: now,
            })
            .where(eq(sites.id, site.id))
            .run();

          // Trigger GitHub Actions audit workflow
          await triggerAuditWorkflow({
            siteId: site.id,
            url: site.url,
            name: site.name,
            callbackUrl,
            ingestSecret: env.INGEST_SECRET || 'mantiscan-dev-secret-token',
            githubOwner: env.GITHUB_OWNER,
            githubRepo: env.GITHUB_REPO,
            githubToken: env.GITHUB_TOKEN,
          });
        })()
      );
    }
  },
};
