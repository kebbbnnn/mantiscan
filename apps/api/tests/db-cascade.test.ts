import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { app } from '../src/index.js';

describe('Database Cascade Deletion Integrity in D1', () => {
  let mf: Miniflare;
  let d1: D1Database;

  function getStatements(sql: string): string[] {
    return sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: ['DB'],
    });

    d1 = await mf.getD1Database('DB');

    // Apply migrations statement by statement
    const migrationFiles = [
      resolve(__dirname, '../migrations/0001_initial.sql'),
      resolve(__dirname, '../migrations/0002_add_audit_schedule.sql'),
      resolve(__dirname, '../migrations/0003_add_cwv_thresholds.sql'),
      resolve(__dirname, '../migrations/0004_add_scan_cooldown.sql'),
    ];

    for (const file of migrationFiles) {
      const sql = readFileSync(file, 'utf-8');
      for (const stmt of getStatements(sql)) {
        await d1.prepare(stmt).run();
      }
    }
  });

  afterAll(async () => {
    if (mf) {
      await mf.dispose();
    }
  });

  beforeEach(async () => {
    // Clean up tables between test runs
    await d1.prepare('DELETE FROM alert_logs;').run();
    await d1.prepare('DELETE FROM alert_channels;').run();
    await d1.prepare('DELETE FROM audit_runs;').run();
    await d1.prepare('DELETE FROM sites;').run();
  });

  it('should cascade delete all audit_runs, alert_channels, and alert_logs when a site is deleted', async () => {
    const siteId = 'site_cascade_target';

    // 1. Seed site
    await d1
      .prepare(
        `INSERT INTO sites (id, name, url, perf_threshold, a11y_threshold, best_practices_threshold, seo_threshold, status, next_audit_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(siteId, 'Target Site', 'https://target.example.com', 90, 90, 85, 90, 'healthy', 1700000000, 1700000000)
      .run();

    // 2. Seed 2 audit runs
    await d1
      .prepare(
        `INSERT INTO audit_runs (id, site_id, triggered_by, strategy, performance_score, accessibility_score, best_practices_score, seo_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('run_1', siteId, 'manual', 'mobile', 95, 90, 85, 95, 1700000000)
      .run();

    await d1
      .prepare(
        `INSERT INTO audit_runs (id, site_id, triggered_by, strategy, performance_score, accessibility_score, best_practices_score, seo_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('run_2', siteId, 'cron', 'desktop', 92, 90, 85, 95, 1700001000)
      .run();

    // 3. Seed 1 alert channel
    await d1
      .prepare(
        `INSERT INTO alert_channels (id, site_id, type, webhook_url, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind('channel_1', siteId, 'slack', 'https://hooks.slack.com/services/T00/B00/X00', 1, 1700000000)
      .run();

    // 4. Seed 2 alert logs (one linked to run_1, one standalone)
    await d1
      .prepare(
        `INSERT INTO alert_logs (id, site_id, run_id, alert_type, payload_summary, dispatched_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind('log_1', siteId, 'run_1', 'degraded', '{"channel":"slack"}', 1700000000)
      .run();

    await d1
      .prepare(
        `INSERT INTO alert_logs (id, site_id, run_id, alert_type, payload_summary, dispatched_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind('log_2', siteId, null, 'recovered', '{"channel":"slack"}', 1700001000)
      .run();

    // Verify records exist before deletion
    const beforeSite = await d1.prepare('SELECT count(*) as cnt FROM sites WHERE id = ?').bind(siteId).first<{ cnt: number }>();
    const beforeRuns = await d1.prepare('SELECT count(*) as cnt FROM audit_runs WHERE site_id = ?').bind(siteId).first<{ cnt: number }>();
    const beforeChannels = await d1.prepare('SELECT count(*) as cnt FROM alert_channels WHERE site_id = ?').bind(siteId).first<{ cnt: number }>();
    const beforeLogs = await d1.prepare('SELECT count(*) as cnt FROM alert_logs WHERE site_id = ?').bind(siteId).first<{ cnt: number }>();

    expect(beforeSite?.cnt).toBe(1);
    expect(beforeRuns?.cnt).toBe(2);
    expect(beforeChannels?.cnt).toBe(1);
    expect(beforeLogs?.cnt).toBe(2);

    // Execute DELETE /api/sites/:id via Hono app
    const res = await app.request(
      `/api/sites/${siteId}`,
      { method: 'DELETE' },
      { DB: d1, INGEST_SECRET: 'test-secret' }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Site deleted successfully' });

    // Assert that the site is gone
    const afterSite = await d1.prepare('SELECT count(*) as cnt FROM sites WHERE id = ?').bind(siteId).first<{ cnt: number }>();
    expect(afterSite?.cnt).toBe(0);

    // Assert that all child records were deleted via SQLite ON DELETE CASCADE
    const afterRuns = await d1.prepare('SELECT count(*) as cnt FROM audit_runs WHERE site_id = ?').bind(siteId).first<{ cnt: number }>();
    const afterChannels = await d1.prepare('SELECT count(*) as cnt FROM alert_channels WHERE site_id = ?').bind(siteId).first<{ cnt: number }>();
    const afterLogs = await d1.prepare('SELECT count(*) as cnt FROM alert_logs WHERE site_id = ?').bind(siteId).first<{ cnt: number }>();

    expect(afterRuns?.cnt).toBe(0);
    expect(afterChannels?.cnt).toBe(0);
    expect(afterLogs?.cnt).toBe(0);
  });

  it('should maintain cross-site isolation: deleting one site does not affect others', async () => {
    const siteA = 'site_to_delete';
    const siteB = 'site_to_keep';

    // Seed site A and site B
    for (const s of [siteA, siteB]) {
      await d1
        .prepare(
          `INSERT INTO sites (id, name, url, perf_threshold, a11y_threshold, best_practices_threshold, seo_threshold, status, next_audit_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(s, `Site ${s}`, `https://${s}.example.com`, 90, 90, 85, 90, 'healthy', 1700000000, 1700000000)
        .run();

      await d1
        .prepare(
          `INSERT INTO audit_runs (id, site_id, triggered_by, strategy, performance_score, accessibility_score, best_practices_score, seo_score, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(`run_${s}`, s, 'manual', 'mobile', 90, 90, 90, 90, 1700000000)
        .run();

      await d1
        .prepare(
          `INSERT INTO alert_channels (id, site_id, type, webhook_url, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(`channel_${s}`, s, 'discord', 'https://discord.com/api/webhooks/xxx', 1, 1700000000)
        .run();
    }

    // Delete site A
    const res = await app.request(
      `/api/sites/${siteA}`,
      { method: 'DELETE' },
      { DB: d1, INGEST_SECRET: 'test-secret' }
    );
    expect(res.status).toBe(200);

    // Site A is gone along with its children
    const afterSiteA = await d1.prepare('SELECT count(*) as cnt FROM sites WHERE id = ?').bind(siteA).first<{ cnt: number }>();
    const afterRunsA = await d1.prepare('SELECT count(*) as cnt FROM audit_runs WHERE site_id = ?').bind(siteA).first<{ cnt: number }>();
    const afterChannelsA = await d1.prepare('SELECT count(*) as cnt FROM alert_channels WHERE site_id = ?').bind(siteA).first<{ cnt: number }>();
    expect(afterSiteA?.cnt).toBe(0);
    expect(afterRunsA?.cnt).toBe(0);
    expect(afterChannelsA?.cnt).toBe(0);

    // Site B and its children remain intact
    const afterSiteB = await d1.prepare('SELECT count(*) as cnt FROM sites WHERE id = ?').bind(siteB).first<{ cnt: number }>();
    const afterRunsB = await d1.prepare('SELECT count(*) as cnt FROM audit_runs WHERE site_id = ?').bind(siteB).first<{ cnt: number }>();
    const afterChannelsB = await d1.prepare('SELECT count(*) as cnt FROM alert_channels WHERE site_id = ?').bind(siteB).first<{ cnt: number }>();
    expect(afterSiteB?.cnt).toBe(1);
    expect(afterRunsB?.cnt).toBe(1);
    expect(afterChannelsB?.cnt).toBe(1);
  });

  it('should return 404 when attempting to delete a non-existent site', async () => {
    const res = await app.request(
      '/api/sites/site_that_does_not_exist',
      { method: 'DELETE' },
      { DB: d1, INGEST_SECRET: 'test-secret' }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Site not found' });
  });

  it('should persist custom Core Web Vitals thresholds on creation and support updates', async () => {
    // 1. Create a site with custom CWV thresholds
    const createRes = await app.request(
      '/api/sites',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Vitals Performance Target',
          url: 'https://vitals.example.com',
          perfThreshold: 85,
          lcpThresholdMs: 2000,
          clsThreshold: 0.08,
          inpThresholdMs: 150,
        }),
      },
      { DB: d1, INGEST_SECRET: 'test-secret' }
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json() as { site: { id: string; lcpThresholdMs: number; clsThreshold: number; inpThresholdMs: number } };
    const siteId = createBody.site.id;
    expect(createBody.site.lcpThresholdMs).toBe(2000);
    expect(createBody.site.clsThreshold).toBe(0.08);
    expect(createBody.site.inpThresholdMs).toBe(150);

    // 2. Fetch site from DB and verify columns
    const dbSite = await d1.prepare('SELECT lcp_threshold_ms, cls_threshold, inp_threshold_ms FROM sites WHERE id = ?').bind(siteId).first<{
      lcp_threshold_ms: number;
      cls_threshold: number;
      inp_threshold_ms: number;
    }>();
    expect(dbSite?.lcp_threshold_ms).toBe(2000);
    expect(dbSite?.cls_threshold).toBe(0.08);
    expect(dbSite?.inp_threshold_ms).toBe(150);

    // 3. Update thresholds via PUT
    const updateRes = await app.request(
      `/api/sites/${siteId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lcpThresholdMs: 1800,
          clsThreshold: 0.05,
          inpThresholdMs: 100,
        }),
      },
      { DB: d1, INGEST_SECRET: 'test-secret' }
    );
    expect(updateRes.status).toBe(200);

    const updatedDbSite = await d1.prepare('SELECT lcp_threshold_ms, cls_threshold, inp_threshold_ms FROM sites WHERE id = ?').bind(siteId).first<{
      lcp_threshold_ms: number;
      cls_threshold: number;
      inp_threshold_ms: number;
    }>();
    expect(updatedDbSite?.lcp_threshold_ms).toBe(1800);
    expect(updatedDbSite?.cls_threshold).toBe(0.05);
    expect(updatedDbSite?.inp_threshold_ms).toBe(100);
  });
});
