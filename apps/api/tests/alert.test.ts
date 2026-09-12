import { describe, it, expect } from 'vitest';
import { evaluateAuditState, buildSlackPayload, buildDiscordPayload } from '../src/services/alert.js';
import type { SiteRow, AuditRunRow } from '../src/db/schema.js';

const mockSite: SiteRow = {
  id: 'site_test',
  name: 'Acme Test Corp',
  url: 'https://acme.example.com',
  perfThreshold: 90,
  a11yThreshold: 90,
  bestPracticesThreshold: 85,
  seoThreshold: 90,
  lcpThresholdMs: 2500,
  clsThreshold: 0.1,
  inpThresholdMs: 200,
  status: 'healthy',
  auditIntervalDays: 7,
  auditHourUtc: 0,
  nextAuditAt: 1700000000,
  lastAuditedAt: null,
  lastRunStatus: null,
  createdAt: 1700000000,
};

describe('Alert State Evaluation Engine', () => {
  it('should maintain healthy status and return none when scores and vitals meet thresholds', () => {
    const scores = { performance: 95, accessibility: 92, bestPractices: 90, seo: 95 };
    const metrics = { lcpMs: 1800, cls: 0.04, inpMs: 120 };
    const res = evaluateAuditState(mockSite, scores, 'mobile', metrics, null);

    expect(res.action).toBe('none');
    expect(res.newStatus).toBe('healthy');
  });

  it('should trigger degradation alert when category scores drop below threshold', () => {
    const scores = { performance: 75, accessibility: 92, bestPractices: 90, seo: 95 };
    const metrics = { lcpMs: 1800, cls: 0.04 };
    const res = evaluateAuditState(mockSite, scores, 'mobile', metrics, null);

    expect(res.action).toBe('degraded');
    expect(res.newStatus).toBe('degraded');
    expect(res.title).toContain('fell below thresholds');
    expect(res.summary).toContain('Perf 75 < 90');
  });

  it('should trigger degradation alert when LCP breaches threshold despite 100 category scores', () => {
    const perfectScores = { performance: 100, accessibility: 100, bestPractices: 100, seo: 100 };
    const failingLcp = { lcpMs: 3400, cls: 0.02, inpMs: 90 };
    const res = evaluateAuditState(mockSite, perfectScores, 'mobile', failingLcp, null);

    expect(res.action).toBe('degraded');
    expect(res.newStatus).toBe('degraded');
    expect(res.title).toContain('fell below thresholds');
    expect(res.summary).toContain('LCP 3.40s > 2.50s');
  });

  it('should trigger degradation alert when CLS breaches threshold', () => {
    const scores = { performance: 95, accessibility: 95, bestPractices: 95, seo: 95 };
    const failingCls = { lcpMs: 1900, cls: 0.25, inpMs: 80 };
    const res = evaluateAuditState(mockSite, scores, 'desktop', failingCls, null);

    expect(res.action).toBe('degraded');
    expect(res.newStatus).toBe('degraded');
    expect(res.summary).toContain('CLS 0.250 > 0.100');
  });

  it('should trigger degradation alert when INP breaches threshold', () => {
    const scores = { performance: 95, accessibility: 95, bestPractices: 95, seo: 95 };
    const failingInp = { lcpMs: 1900, cls: 0.02, inpMs: 380 };
    const res = evaluateAuditState(mockSite, scores, 'mobile', failingInp, null);

    expect(res.action).toBe('degraded');
    expect(res.newStatus).toBe('degraded');
    expect(res.summary).toContain('INP 380ms > 200ms');
  });

  it('should gracefully ignore null or undefined vitals (e.g. INP in synthetic CI)', () => {
    const scores = { performance: 95, accessibility: 92, bestPractices: 90, seo: 95 };
    const partialMetrics = { lcpMs: 2100, cls: 0.05, inpMs: null };
    const res = evaluateAuditState(mockSite, scores, 'mobile', partialMetrics, null);

    expect(res.action).toBe('none');
    expect(res.newStatus).toBe('healthy');
  });

  it('should suppress notifications on consecutive failures to prevent alert fatigue', () => {
    const degradedSite: SiteRow = { ...mockSite, status: 'degraded' };
    const prevRun: AuditRunRow = {
      id: 'run_prev',
      siteId: 'site_test',
      triggeredBy: 'manual',
      strategy: 'mobile',
      performanceScore: 75,
      accessibilityScore: 92,
      bestPracticesScore: 90,
      seoScore: 95,
      lcpMs: 2500,
      cls: 0.05,
      inpMs: 150,
      reportUrl: null,
      createdAt: 1700000000,
    };

    const currentScores = { performance: 74, accessibility: 92, bestPractices: 90, seo: 95 };
    const res = evaluateAuditState(degradedSite, currentScores, 'mobile', null, prevRun);

    expect(res.action).toBe('none');
    expect(res.newStatus).toBe('degraded');
  });

  it('should trigger regression warning when scores drop by >= 10 points', () => {
    const prevRun: AuditRunRow = {
      id: 'run_prev',
      siteId: 'site_test',
      triggeredBy: 'manual',
      strategy: 'mobile',
      performanceScore: 98,
      accessibilityScore: 98,
      bestPracticesScore: 95,
      seoScore: 95,
      lcpMs: 1200,
      cls: 0.01,
      inpMs: 80,
      reportUrl: null,
      createdAt: 1700000000,
    };

    // Performance dropped by 13 points (from 98 to 85, which is below 90 threshold as well)
    const currentScores = { performance: 85, accessibility: 98, bestPractices: 95, seo: 95 };
    const res = evaluateAuditState(mockSite, currentScores, 'mobile', null, prevRun);

    expect(res.action).toBe('degraded');
  });

  it('should trigger recovery alert when a degraded site improves above all thresholds', () => {
    const degradedSite: SiteRow = { ...mockSite, status: 'degraded' };
    const scores = { performance: 94, accessibility: 92, bestPractices: 90, seo: 95 };
    const metrics = { lcpMs: 2200, cls: 0.04, inpMs: 110 };
    const res = evaluateAuditState(degradedSite, scores, 'mobile', metrics, null);

    expect(res.action).toBe('recovered');
    expect(res.newStatus).toBe('healthy');
    expect(res.title).toContain('restored to healthy status');
  });
});

describe('Webhook Payload Formatters', () => {
  it('formats Slack Block Kit correctly with CWV targets and status icons', () => {
    const scores = { performance: 65, accessibility: 90, bestPractices: 85, seo: 90 };
    const metrics = { lcpMs: 3200, cls: 0.04, inpMs: null };
    const evalResult = {
      action: 'degraded' as const,
      newStatus: 'degraded' as const,
      title: 'Alert',
      summary: 'LCP failed',
    };

    const payload = buildSlackPayload(mockSite, scores, metrics, 'mobile', evalResult, 'https://report.html');
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].color).toBe('#E74C3C');
    const jsonStr = JSON.stringify(payload);
    expect(jsonStr).toContain('Acme Test Corp');
    expect(jsonStr).toContain('3.20s');
    expect(jsonStr).toContain('target: ≤2.50s');
    expect(jsonStr).toContain('🔴'); // LCP breached
    expect(jsonStr).toContain('🟢'); // CLS passing
    expect(jsonStr).toContain('https://report.html');
  });

  it('formats Discord Rich Embed correctly with CWV target comparisons', () => {
    const scores = { performance: 95, accessibility: 95, bestPractices: 95, seo: 95 };
    const metrics = { lcpMs: 1100, cls: 0.01, inpMs: 80 };
    const evalResult = {
      action: 'recovered' as const,
      newStatus: 'healthy' as const,
      title: 'Recovered',
      summary: 'All good',
    };

    const payload = buildDiscordPayload(mockSite, scores, metrics, 'desktop', evalResult);
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].color).toBe(0x2ecc71);
    const cwvField = payload.embeds[0].fields.find((f) => f.name === 'Core Web Vitals');
    expect(cwvField).toBeDefined();
    expect(cwvField?.value).toContain('1.10s (target ≤2.50s)');
    expect(cwvField?.value).toContain('0.010 (target ≤0.100)');
    expect(cwvField?.value).toContain('80ms (target ≤200ms)');
  });
});
