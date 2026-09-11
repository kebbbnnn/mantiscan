import fs from 'node:fs';
import path from 'node:path';

const SITE_ID = process.env.SITE_ID;
const CALLBACK_URL = process.env.CALLBACK_URL;
const INGEST_SECRET = process.env.INGEST_SECRET;
const RUN_ID = process.env.RUN_ID;
const GITHUB_REPO = process.env.GITHUB_REPO;

if (!SITE_ID || !CALLBACK_URL || !INGEST_SECRET) {
  console.error('Missing mandatory environment variables: SITE_ID, CALLBACK_URL, INGEST_SECRET');
  process.exit(1);
}

function parseStrategyResults(strategyDir, strategyName) {
  const manifestPath = path.join(strategyDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.warn(`No manifest found at ${manifestPath}`);
    return null;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest) || manifest.length === 0) {
      console.warn(`Manifest at ${manifestPath} is empty`);
      return null;
    }

    // Pick the median run (or first representative run)
    const runEntry = manifest[0];
    const summary = runEntry.summary;

    const scores = {
      performance: Math.round((summary.performance ?? 0) * 100),
      accessibility: Math.round((summary.accessibility ?? 0) * 100),
      bestPractices: Math.round((summary['best-practices'] ?? 0) * 100),
      seo: Math.round((summary.seo ?? 0) * 100),
    };

    // Try reading the full json report file to extract Core Web Vitals
    let metrics = {};
    if (runEntry.jsonPath && fs.existsSync(runEntry.jsonPath)) {
      try {
        const fullReport = JSON.parse(fs.readFileSync(runEntry.jsonPath, 'utf8'));
        const audits = fullReport.audits || {};
        metrics = {
          lcpMs: audits['largest-contentful-paint']?.numericValue
            ? Math.round(audits['largest-contentful-paint'].numericValue)
            : null,
          cls: audits['cumulative-layout-shift']?.numericValue !== undefined
            ? Number(audits['cumulative-layout-shift'].numericValue.toFixed(3))
            : null,
          fcpMs: audits['first-contentful-paint']?.numericValue
            ? Math.round(audits['first-contentful-paint'].numericValue)
            : null,
          ttfbMs: audits['server-response-time']?.numericValue
            ? Math.round(audits['server-response-time'].numericValue)
            : null,
          inpMs: audits['interaction-to-next-paint']?.numericValue
            ? Math.round(audits['interaction-to-next-paint'].numericValue)
            : null,
        };
      } catch (e) {
        console.warn('Could not parse full report for detailed metrics:', e.message);
      }
    }

    const reportUrl = GITHUB_REPO && RUN_ID
      ? `https://github.com/${GITHUB_REPO}/actions/runs/${RUN_ID}`
      : null;

    return {
      siteId: SITE_ID,
      strategy: strategyName,
      triggeredBy: 'manual',
      scores,
      metrics,
      reportUrl,
    };
  } catch (err) {
    console.error(`Error parsing manifest for ${strategyName}:`, err);
    return null;
  }
}

async function sendResults() {
  const strategies = [
    { dir: '.lighthouseci/mobile', name: 'mobile' },
    { dir: '.lighthouseci/desktop', name: 'desktop' },
  ];

  for (const item of strategies) {
    const payload = parseStrategyResults(item.dir, item.name);
    if (!payload) {
      console.log(`Skipping ${item.name} - no results found.`);
      continue;
    }

    console.log(`Posting ${item.name} results to ${CALLBACK_URL}...`, JSON.stringify(payload.scores));
    try {
      const res = await fetch(CALLBACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ingest-Secret': INGEST_SECRET,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log(`Response for ${item.name}:`, data);
    } catch (err) {
      console.error(`Failed to post results for ${item.name}:`, err.message);
    }
  }
}

sendResults();
