import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Legal Pages Configuration & Content Verification', () => {
  const rootDir = path.resolve(__dirname, '../../../');
  const webDir = path.join(rootDir, 'apps/web');

  it('verifies Cloudflare Pages _redirects includes both API proxy and SPA fallback', () => {
    const redirectsPath = path.join(webDir, 'public/_redirects');
    expect(fs.existsSync(redirectsPath)).toBe(true);

    const content = fs.readFileSync(redirectsPath, 'utf-8');
    expect(content).toContain('/api/*');
    expect(content).toContain('/* /index.html 200');
  });

  it('verifies Privacy Policy includes essential disclosures', () => {
    const privacyPagePath = path.join(webDir, 'src/pages/PrivacyPage.tsx');
    expect(fs.existsSync(privacyPagePath)).toBe(true);

    const content = fs.readFileSync(privacyPagePath, 'utf-8');
    // Must declare zero tracking & no ad cookies
    expect(content).toContain('Zero-Tracking Guarantee');
    expect(content).toContain('advertising trackers');
    // Must accurately declare data collected
    expect(content).toContain('Target Website URLs');
    expect(content).toContain('Lighthouse scores');
    expect(content).toContain('Standard Edge Server Logs');
    // Must declare third party sub-processors
    expect(content).toContain('Cloudflare');
    expect(content).toContain('GitHub Actions');
    // Must declare deletion & retention
    expect(content).toContain('Data Retention &amp; Erasure');
  });

  it('verifies Terms of Service includes AUP and liability disclaimers', () => {
    const termsPagePath = path.join(webDir, 'src/pages/TermsPage.tsx');
    expect(fs.existsSync(termsPagePath)).toBe(true);

    const content = fs.readFileSync(termsPagePath, 'utf-8');
    // AUP requirements
    expect(content).toContain('Acceptable Use Policy (AUP)');
    expect(content).toContain('explicit written authorization');
    // SSRF & private IP prohibitions
    expect(content).toContain('No Private or Internal IP Scanning');
    expect(content).toContain('169.254.169.254');
    expect(content).toContain('No Denial of Service');
    // Disclaimer of warranties and limitation of liability
    expect(content).toContain('Disclaimer of Warranties');
    expect(content).toContain('Limitation of Liability');
    expect(content).toContain('AS-IS');
  });

  it('verifies AddSiteModal includes user consent notice with legal links', () => {
    const modalPath = path.join(webDir, 'src/components/AddSiteModal.tsx');
    expect(fs.existsSync(modalPath)).toBe(true);

    const content = fs.readFileSync(modalPath, 'utf-8');
    expect(content).toContain('Terms of Service');
    expect(content).toContain('Privacy Policy');
    expect(content).toContain('authorization to audit this domain');
  });
});
