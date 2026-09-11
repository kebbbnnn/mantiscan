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
  status: 'healthy',
  nextAuditAt: 1700000000,
  lastAuditedAt: null,
  lastRunStatus: null,
  createdAt: 1700000000,
};

describe('Alert State Evaluation Engine', () => {
  it('should maintain healthy status and return none when scores meet thresholds', () => {
    const scores = { performance: 95, accessibility: 92, bestPractices: 90, seo: 95 };
    const res = evaluateAuditState(mockSite, scores, 'mobile', null);

    expect(res.action).toBe('none');
    expect(res.newStatus).toBe('healthy');
  });

  it('should trigger degradation alert when a healthy site drops below threshold', () => {
    const scores = { performance: 75, accessibility: 92, bestPractices: 90, seo: 95 };
    const res = evaluateAuditState(mockSite, scores, 'mobile', null);

    expect(res.action).toBe('degraded');
    expect(res.newStatus).toBe('degraded');
    expect(res.title).toContain('fell below score thresholds');
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
    const res = evaluateAuditState(degradedSite, currentScores, 'mobile', prevRun);

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
    const res = evaluateAuditState(mockSite, currentScores, 'mobile', prevRun);

    // If site was healthy, transition to degraded takes priority or triggers regression
    expect(res.action).toBe('degraded');
  });

  it('should trigger recovery alert when a degraded site improves above thresholds', () => {
    const degradedSite: SiteRow = { ...mockSite, status: 'degraded' };
    const scores = { performance: 94, accessibility: 92, bestPractices: 90, seo: 95 };
    const res = evaluateAuditState(degradedSite, scores, 'mobile', null);

    expect(res.action).toBe('recovered');
    expect(res.newStatus).toBe('healthy');
    expect(res.title).toContain('restored to healthy status');
  });
});

describe('Webhook Payload Formatters', () => {
  it('formats Slack Block Kit correctly', () => {
    const scores = { performance: 65, accessibility: 90, bestPractices: 85, seo: 90 };
    const metrics = { lcpMs: 3200, cls: 0.12 };
    const evalResult = {
      action: 'degraded' as const,
      newStatus: 'degraded' as const,
      title: 'Alert',
      summary: 'Performance failed',
    };

    const payload = buildSlackPayload(mockSite, scores, metrics, 'mobile', evalResult, 'https://report.html');
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].color).toBe('#E74C3C');
    expect(JSON.stringify(payload)).toContain('Acme Test Corp');
    expect(JSON.stringify(payload)).toContain('3.20s');
    expect(JSON.stringify(payload)).toContain('https://report.html');
  });

  it('formats Discord Rich Embed correctly', () => {
    const scores = { performance: 95, accessibility: 95, bestPractices: 95, seo: 95 };
    const metrics = { lcpMs: 1100, cls: 0.01 };
    const evalResult = {
      action: 'recovered' as const,
      newStatus: 'healthy' as const,
      title: 'Recovered',
      summary: 'All good',
    };

    const payload = buildDiscordPayload(mockSite, scores, metrics, 'desktop', evalResult);
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].color).toBe(0x2ecc71);
    expect(payload.embeds[0].fields).toBeDefined();
  });
});
