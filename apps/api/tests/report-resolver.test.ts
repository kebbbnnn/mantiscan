import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveReportUrl, getStrategyRuns, extractRunData } from '../../../scripts/post-results.js';

describe('Lighthouse Report Resolver & Ingestion Logic', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantiscan-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('resolveReportUrl', () => {
    it('returns exact matching report URL from links.json', () => {
      const targetUrl = 'https://example.com';
      const expectedReportUrl = 'https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/123.report.html';
      
      fs.writeFileSync(
        path.join(tempDir, 'links.json'),
        JSON.stringify({
          [targetUrl]: expectedReportUrl,
        })
      );

      const resolved = resolveReportUrl(tempDir, targetUrl, 'https://github.com/fallback');
      expect(resolved).toBe(expectedReportUrl);
    });

    it('handles trailing slash normalization matches', () => {
      const targetUrl = 'https://example.com/';
      const storedUrl = 'https://example.com';
      const expectedReportUrl = 'https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/456.report.html';

      fs.writeFileSync(
        path.join(tempDir, 'links.json'),
        JSON.stringify({
          [storedUrl]: expectedReportUrl,
        })
      );

      const resolved = resolveReportUrl(tempDir, targetUrl, 'https://github.com/fallback');
      expect(resolved).toBe(expectedReportUrl);
    });

    it('falls back to first available URL when target redirected to a new destination', () => {
      const targetUrl = 'https://example.com';
      const redirectedReportUrl = 'https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/redirected.report.html';

      fs.writeFileSync(
        path.join(tempDir, 'links.json'),
        JSON.stringify({
          'https://www.example.com/en/home': redirectedReportUrl,
        })
      );

      const resolved = resolveReportUrl(tempDir, targetUrl, 'https://github.com/fallback');
      expect(resolved).toBe(redirectedReportUrl);
    });

    it('returns fallbackUrl when links.json does not exist', () => {
      const fallback = 'https://github.com/owner/repo/actions/runs/999';
      const resolved = resolveReportUrl(tempDir, 'https://example.com', fallback);
      expect(resolved).toBe(fallback);
    });

    it('returns fallbackUrl when links.json contains invalid JSON', () => {
      const fallback = 'https://github.com/owner/repo/actions/runs/999';
      fs.writeFileSync(path.join(tempDir, 'links.json'), '{ invalid json ');

      const resolved = resolveReportUrl(tempDir, 'https://example.com', fallback);
      expect(resolved).toBe(fallback);
    });

    it('returns null when neither links.json nor fallbackUrl is present', () => {
      const resolved = resolveReportUrl(tempDir, 'https://example.com', null);
      expect(resolved).toBeNull();
    });
  });

  describe('getStrategyRuns', () => {
    it('reads runs from strategy-isolated directory (.lighthouseci-mobile)', () => {
      const mobileDir = path.join(tempDir, '.lighthouseci-mobile');
      fs.mkdirSync(mobileDir, { recursive: true });

      const mockLhr = {
        finalUrl: 'https://example.com',
        configSettings: { emulatedFormFactor: 'mobile' },
        categories: {
          performance: { score: 0.95 },
          accessibility: { score: 0.98 },
          'best-practices': { score: 0.92 },
          seo: { score: 1.0 },
        },
        audits: {
          'largest-contentful-paint': { numericValue: 1200 },
          'cumulative-layout-shift': { numericValue: 0.02 },
          'interaction-to-next-paint': { numericValue: 80 },
        },
      };

      fs.writeFileSync(path.join(mobileDir, 'lhr-1.json'), JSON.stringify(mockLhr));

      const { dir, runs } = getStrategyRuns('mobile', tempDir);
      expect(dir).toBe(mobileDir);
      expect(runs).toHaveLength(1);
      expect(runs[0].scores.performance).toBe(95);
      expect(runs[0].metrics.lcpMs).toBe(1200);
    });

    it('falls back to root .lighthouseci and filters by formFactor when isolated dir does not exist', () => {
      const legacyDir = path.join(tempDir, '.lighthouseci');
      fs.mkdirSync(legacyDir, { recursive: true });

      const mobileLhr = {
        configSettings: { formFactor: 'mobile' },
        categories: { performance: { score: 0.88 } },
      };
      const desktopLhr = {
        configSettings: { formFactor: 'desktop' },
        categories: { performance: { score: 0.99 } },
      };

      fs.writeFileSync(path.join(legacyDir, 'lhr-mobile.json'), JSON.stringify(mobileLhr));
      fs.writeFileSync(path.join(legacyDir, 'lhr-desktop.json'), JSON.stringify(desktopLhr));

      const mobileResult = getStrategyRuns('mobile', tempDir);
      expect(mobileResult.dir).toBe(legacyDir);
      expect(mobileResult.runs).toHaveLength(1);
      expect(mobileResult.runs[0].scores.performance).toBe(88);

      const desktopResult = getStrategyRuns('desktop', tempDir);
      expect(desktopResult.dir).toBe(legacyDir);
      expect(desktopResult.runs).toHaveLength(1);
      expect(desktopResult.runs[0].scores.performance).toBe(99);
    });
  });

  describe('extractRunData', () => {
    it('parses category scores and round Core Web Vitals metrics', () => {
      const filePath = path.join(tempDir, 'test-lhr.json');
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          requestedUrl: 'https://mysite.com',
          configSettings: { emulatedFormFactor: 'desktop' },
          categories: {
            performance: { score: 0.854 },
            accessibility: { score: 0.92 },
            'best-practices': { score: 0.96 },
            seo: { score: 0.9 },
          },
          audits: {
            'largest-contentful-paint': { numericValue: 2450.6 },
            'cumulative-layout-shift': { numericValue: 0.0456 },
            'first-contentful-paint': { numericValue: 1100.2 },
            'server-response-time': { numericValue: 145.1 },
            'interaction-to-next-paint': { numericValue: 120.3 },
          },
        })
      );

      const extracted = extractRunData(filePath);
      expect(extracted).not.toBeNull();
      expect(extracted?.formFactor).toBe('desktop');
      expect(extracted?.scores.performance).toBe(85);
      expect(extracted?.scores.accessibility).toBe(92);
      expect(extracted?.metrics.lcpMs).toBe(2451);
      expect(extracted?.metrics.cls).toBe(0.046);
      expect(extracted?.metrics.inpMs).toBe(120);
      expect(extracted?.metrics.fcpMs).toBe(1100);
      expect(extracted?.metrics.ttfbMs).toBe(145);
    });
  });
});
