import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { sitesRouter } from './routes/sites.js';
import { webhookRouter } from './routes/webhook.js';
import { sites } from './db/schema.js';
import { triggerAuditWorkflow } from './services/github.js';

type Bindings = {
  DB: D1Database;
  INGEST_SECRET: string;
  APP_ENV?: string;
  APP_URL?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

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

          // Reschedule for 7 days later
          await db
            .update(sites)
            .set({
              nextAuditAt: now + 604800,
              lastRunStatus: 'running',
            })
            .where(lte(sites.id, site.id))
            .run();
        })()
      );
    }
  },
};
