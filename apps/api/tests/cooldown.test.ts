import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { app } from '../src/index.js';
import worker from '../src/index.js';
import { getAuditCooldownStatus, AUDIT_COOLDOWN_SECONDS, AUDIT_RUNNING_TIMEOUT_SECONDS } from '@mantiscan/shared';

describe('Audit Rate-Limiting & GHA Cooldown System', () => {
  describe('Unit: getAuditCooldownStatus pure helper', () => {
    const NOW = 1700000000;

    it('allows scan immediately for brand new site (never scanned)', () => {
      const status = getAuditCooldownStatus(
        { lastScanRequestedAt: null, lastRunStatus: null },
        NOW
      );
      expect(status).toEqual({
        canScan: true,
        remainingSeconds: 0,
        reason: 'none',
      });
    });

    it('blocks scan and returns remaining time during 5-minute cooldown', () => {
      // Scanned 60 seconds ago
      const status = getAuditCooldownStatus(
        { lastScanRequestedAt: NOW - 60, lastRunStatus: 'success' },
        NOW
      );
      expect(status).toEqual({
        canScan: false,
        remainingSeconds: 240,
        reason: 'cooldown',
      });
    });

    it('blocks scan at boundary of 299 seconds elapsed', () => {
      const status = getAuditCooldownStatus(
        { lastScanRequestedAt: NOW - 299, lastRunStatus: 'success' },
        NOW
      );
      expect(status).toEqual({
        canScan: false,
        remainingSeconds: 1,
        reason: 'cooldown',
      });
    });

    it('allows scan immediately once 300 seconds (5m) have elapsed', () => {
      const status = getAuditCooldownStatus(
        { lastScanRequestedAt: NOW - 300, lastRunStatus: 'success' },
        NOW
      );
      expect(status).toEqual({
        canScan: true,
        remainingSeconds: 0,
        reason: 'none',
      });
    });

    it('allows scan when more than 300 seconds have elapsed', () => {
      const status = getAuditCooldownStatus(
        { lastScanRequestedAt: NOW - 600, lastRunStatus: 'success' },
        NOW
      );
      expect(status).toEqual({
        canScan: true,
        remainingSeconds: 0,
        reason: 'none',
      });
    });

    it('blocks scan with reason running if actively executing within 10m TTL', () => {
      // Running for 90s (< 10m TTL)
      const status = getAuditCooldownStatus(
        { lastScanRequestedAt: NOW - 90, lastRunStatus: 'running' },
        NOW
      );
      expect(status).toEqual({
        canScan: false,
        remainingSeconds: 210,
        reason: 'running',
      });
    });

    it('self-heals stuck runs exceeding 10m TTL (> 600s)', () => {
      // Running for 650s (> 600s TTL)
      const status = getAuditCooldownStatus(
        { lastScanRequestedAt: NOW - 650, lastRunStatus: 'running' },
        NOW
      );
      expect(status).toEqual({
        canScan: true,
        remainingSeconds: 0,
        reason: 'none',
      });
    });

    it('safely handles future clock skew without negative elapsed times', () => {
      const status = getAuditCooldownStatus(
        { lastScanRequestedAt: NOW + 30, lastRunStatus: 'success' },
        NOW
      );
      expect(status).toEqual({
        canScan: false,
        remainingSeconds: 300,
        reason: 'cooldown',
      });
    });

    it('self-heals legacy running site with null lastScanRequestedAt', () => {
      const status = getAuditCooldownStatus(
        { lastScanRequestedAt: null, lastRunStatus: 'running' },
        NOW
      );
      expect(status).toEqual({
        canScan: true,
        remainingSeconds: 0,
        reason: 'none',
      });
    });
  });

  describe('Integration: D1 & API Cooldown Enforcement', () => {
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

      // Apply migrations
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
      await d1.prepare('DELETE FROM audit_runs;').run();
      await d1.prepare('DELETE FROM alert_channels;').run();
      await d1.prepare('DELETE FROM sites;').run();
    });

    it('allows initial scan dispatch and records last_scan_requested_at in D1', async () => {
      const siteId = 'site_test_initial_scan';
      const now = Math.floor(Date.now() / 1000);

      await d1
        .prepare(
          `INSERT INTO sites (id, name, url, perf_threshold, a11y_threshold, best_practices_threshold, seo_threshold, status, next_audit_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(siteId, 'Initial Scan Site', 'https://example.com', 90, 90, 85, 90, 'healthy', now + 10000, now)
        .run();

      const res = await app.fetch(
        new Request(`http://localhost/api/sites/${siteId}/scan`, { method: 'POST' }),
        { DB: d1, INGEST_SECRET: 'test-secret' }
      );

      expect(res.status).toBe(200);
      const data = await res.json() as { siteId: string; lastScanRequestedAt: number };
      expect(data.siteId).toBe(siteId);
      expect(data.lastScanRequestedAt).toBeGreaterThanOrEqual(now);

      // Verify D1 record updated
      const row = await d1
        .prepare('SELECT last_run_status, last_scan_requested_at FROM sites WHERE id = ?')
        .bind(siteId)
        .first<{ last_run_status: string; last_scan_requested_at: number }>();

      expect(row?.last_run_status).toBe('running');
      expect(row?.last_scan_requested_at).toBe(data.lastScanRequestedAt);
    });

    it('rejects immediate second scan with HTTP 429 Too Many Requests and Retry-After header', async () => {
      const siteId = 'site_test_rate_limit';
      const now = Math.floor(Date.now() / 1000);

      // Seed site scanned 30 seconds ago
      await d1
        .prepare(
          `INSERT INTO sites (id, name, url, perf_threshold, a11y_threshold, best_practices_threshold, seo_threshold, status, next_audit_at, last_scan_requested_at, last_run_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(siteId, 'Rate Limit Site', 'https://example.com', 90, 90, 85, 90, 'healthy', now + 10000, now - 30, 'running', now)
        .run();

      const res = await app.fetch(
        new Request(`http://localhost/api/sites/${siteId}/scan`, { method: 'POST' }),
        { DB: d1, INGEST_SECRET: 'test-secret' }
      );

      expect(res.status).toBe(429);
      expect(res.headers.has('Retry-After')).toBe(true);

      const retryAfter = Number(res.headers.get('Retry-After'));
      expect(retryAfter).toBeGreaterThanOrEqual(268);
      expect(retryAfter).toBeLessThanOrEqual(271);

      const data = await res.json() as { error: string; retryAfter: number; reason: string };
      expect(data.reason).toBe('running');
      expect(data.retryAfter).toBe(retryAfter);
      expect(data.error).toContain('Audit currently in progress');
    });

    it('self-heals stuck running sites exceeding 10m TTL and permits a new scan', async () => {
      const siteId = 'site_test_stuck_heal';
      const now = Math.floor(Date.now() / 1000);

      // Seed site marked 'running' 700 seconds ago (> 10m TTL)
      await d1
        .prepare(
          `INSERT INTO sites (id, name, url, perf_threshold, a11y_threshold, best_practices_threshold, seo_threshold, status, next_audit_at, last_scan_requested_at, last_run_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(siteId, 'Stuck Site', 'https://stuck.example.com', 90, 90, 85, 90, 'healthy', now + 10000, now - 700, 'running', now - 1000)
        .run();

      const res = await app.fetch(
        new Request(`http://localhost/api/sites/${siteId}/scan`, { method: 'POST' }),
        { DB: d1, INGEST_SECRET: 'test-secret' }
      );

      expect(res.status).toBe(200);
      const data = await res.json() as { siteId: string; lastScanRequestedAt: number };
      expect(data.siteId).toBe(siteId);

      const updatedRow = await d1
        .prepare('SELECT last_run_status, last_scan_requested_at FROM sites WHERE id = ?')
        .bind(siteId)
        .first<{ last_run_status: string; last_scan_requested_at: number }>();

      expect(updatedRow?.last_run_status).toBe('running');
      expect(updatedRow?.last_scan_requested_at).toBeGreaterThanOrEqual(now);
    });

    it('skips scheduled cron execution if due site is actively running or on cooldown', async () => {
      const siteId = 'site_cron_cooldown';
      const now = Math.floor(Date.now() / 1000);

      // Site due for audit (next_audit_at <= now), but scanned 120s ago
      const nextAuditAtPast = now - 10;
      const lastScanRecent = now - 120;

      await d1
        .prepare(
          `INSERT INTO sites (id, name, url, perf_threshold, a11y_threshold, best_practices_threshold, seo_threshold, status, audit_interval_days, audit_hour_utc, next_audit_at, last_scan_requested_at, last_run_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(siteId, 'Cron Cooldown Site', 'https://cron.example.com', 90, 90, 85, 90, 'healthy', 7, 0, nextAuditAtPast, lastScanRecent, 'running', now - 1000)
        .run();

      const dummyCtx = {
        waitUntil: (promise: Promise<unknown>) => promise,
        passThroughOnException: () => {},
      } as unknown as ExecutionContext;

      await worker.scheduled(
        { scheduledTime: now * 1000, cron: '0 * * * *' } as ScheduledEvent,
        { DB: d1, INGEST_SECRET: 'test-secret' },
        dummyCtx
      );

      // Verify site was skipped: last_scan_requested_at was NOT modified, but next_audit_at was advanced
      const row = await d1
        .prepare('SELECT next_audit_at, last_scan_requested_at FROM sites WHERE id = ?')
        .bind(siteId)
        .first<{ next_audit_at: number; last_scan_requested_at: number }>();

      expect(row?.last_scan_requested_at).toBe(lastScanRecent);
      expect(row?.next_audit_at).toBeGreaterThan(now);
    });
  });
});
