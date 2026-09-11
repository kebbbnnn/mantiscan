import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    siteId: { type: 'string' },
    url: { type: 'string', default: 'https://example.com' },
    api: { type: 'string', default: 'http://localhost:8787' },
    secret: { type: 'string', default: 'mantiscan-dev-secret-token' },
    perf: { type: 'string', default: '92' },
    a11y: { type: 'string', default: '95' },
    bestPractices: { type: 'string', default: '90' },
    seo: { type: 'string', default: '96' },
  },
});

if (!values.siteId) {
  console.error('Usage: node scripts/run-audit-local.js --siteId=<id> [--perf=85] [--a11y=90]');
  process.exit(1);
}

async function simulateAudit() {
  const strategies = ['mobile', 'desktop'];

  for (const strategy of strategies) {
    const payload = {
      siteId: values.siteId,
      strategy,
      triggeredBy: 'manual',
      scores: {
        performance: parseInt(values.perf, 10),
        accessibility: parseInt(values.a11y, 10),
        bestPractices: parseInt(values.bestPractices, 10),
        seo: parseInt(values.seo, 10),
      },
      metrics: {
        lcpMs: 1650,
        cls: 0.012,
        inpMs: 95,
        fcpMs: 820,
        ttfbMs: 180,
      },
      reportUrl: `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(values.url)}`,
    };

    console.log(`\nSimulating local audit ingestion for [${strategy.toUpperCase()}]...`);
    try {
      const res = await fetch(`${values.api}/api/webhooks/audit-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ingest-Secret': values.secret,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log('Result:', JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to post local audit simulation:', err.message);
    }
  }
}

simulateAudit();
