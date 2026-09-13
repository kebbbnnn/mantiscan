import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { app } from '../src/index.js';

describe('Site Status Endpoint & Query Batching', () => {
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

    // Apply all migrations
    const migrationFiles = [
      resolve(__dirname, '../migrations/0001_initial.sql'),
      resolve(__dirname, '../migrations/0002_add_audit_schedule.sql'),
      resolve(__dirname, '../migrations/0003_add_cwv_thresholds.sql'),
      resolve(__dirname, '../migrations/0004_add_scan_cooldown.sql'),
      resolve(__dirname, '../migrations/0005_add_audit_runs_strategy_index.sql'),
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
    await d1.prepare('DELETE FROM alert_logs;').run();
    await d1.prepare('DELETE FROM alert_channels;').run();
    await d1.prepare('DELETE FROM audit_runs;').run();
    await d1.prepare('DELETE FROM sites;').run();
  });

  it('should return 404 for unknown site id on /api/sites/:id/status', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/sites/non_existent_site/status'),
      { DB: d1, INGEST_SECRET: 'test' }
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Site not found');
  });

  it('should return current status for an actively running site within timeout', async () => {
    const now = Math.floor(Date.now() / 1000);
    const siteId = 'site_running_active';

    await d1
      .prepare(`
        INSERT INTO sites (id, name, url, next_audit_at, last_run_status, last_scan_requested_at, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(siteId, 'Running Site', 'https://example.com', now + 3600, 'running', now - 45, now - 100, 'healthy')
      .run();

    const res = await app.fetch(
      new Request(`http://localhost/api/sites/${siteId}/status`),
      { DB: d1, INGEST_SECRET: 'test' }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: siteId,
      status: 'healthy',
      lastRunStatus: 'running',
      lastAuditedAt: null,
      lastScanRequestedAt: now - 45,
    });
  });

  it('should self-heal a stuck running audit older than 10 minutes to failed in D1', async () => {
    const now = Math.floor(Date.now() / 1000);
    const siteId = 'site_stuck_running';

    // 650 seconds ago (> AUDIT_RUNNING_TIMEOUT_SECONDS of 600s)
    await d1
      .prepare(`
        INSERT INTO sites (id, name, url, next_audit_at, last_run_status, last_scan_requested_at, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(siteId, 'Stuck Site', 'https://stuck.com', now + 3600, 'running', now - 650, now - 1000, 'unknown')
      .run();

    const res = await app.fetch(
      new Request(`http://localhost/api/sites/${siteId}/status`),
      { DB: d1, INGEST_SECRET: 'test' }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastRunStatus).toBe('failed');

    // Verify D1 was updated to 'failed'
    const updated = await d1
      .prepare('SELECT last_run_status FROM sites WHERE id = ?')
      .bind(siteId)
      .first<{ last_run_status: string }>();

    expect(updated?.last_run_status).toBe('failed');
  });

  it('should batch query GET /api/sites correctly with channels and latestRuns for multiple sites', async () => {
    const now = Math.floor(Date.now() / 1000);
    const site1 = 'site_1';
    const site2 = 'site_2';

    // Insert 2 sites
    await d1
      .prepare(`
        INSERT INTO sites (id, name, url, next_audit_at, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        site1, 'Site 1', 'https://site1.com', now + 3600, now, 'healthy',
        site2, 'Site 2', 'https://site2.com', now + 3600, now, 'degraded'
      )
      .run();

    // Insert channels for site 1
    await d1
      .prepare(`
        INSERT INTO alert_channels (id, site_id, type, webhook_url, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind('chan_1', site1, 'slack', 'https://slack.com/hook', 1, now)
      .run();

    // Insert historical and recent runs for site 1 (mobile & desktop)
    await d1
      .prepare(`
        INSERT INTO audit_runs (id, site_id, triggered_by, strategy, performance_score, accessibility_score, best_practices_score, seo_score, created_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        'run_old_mobile', site1, 'manual', 'mobile', 70, 70, 70, 70, now - 200,
        'run_new_mobile', site1, 'manual', 'mobile', 95, 95, 95, 95, now - 10,
        'run_new_desktop', site1, 'manual', 'desktop', 99, 99, 99, 99, now - 5
      )
      .run();

    const res = await app.fetch(
      new Request('http://localhost/api/sites'),
      { DB: d1, INGEST_SECRET: 'test' }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sites).toHaveLength(2);

    const s1 = data.sites.find((s: any) => s.id === site1);
    expect(s1).toBeDefined();
    expect(s1.channels).toHaveLength(1);
    expect(s1.channels[0].id).toBe('chan_1');
    expect(s1.latestRuns).toHaveLength(2);

    // mobile should be first, desktop second
    expect(s1.latestRuns[0].strategy).toBe('mobile');
    expect(s1.latestRuns[0].id).toBe('run_new_mobile');
    expect(s1.latestRuns[0].performanceScore).toBe(95);

    expect(s1.latestRuns[1].strategy).toBe('desktop');
    expect(s1.latestRuns[1].id).toBe('run_new_desktop');
    expect(s1.latestRuns[1].performanceScore).toBe(99);

    const s2 = data.sites.find((s: any) => s.id === site2);
    expect(s2).toBeDefined();
    expect(s2.channels).toHaveLength(0);
    expect(s2.latestRuns).toHaveLength(0);
  });
});
