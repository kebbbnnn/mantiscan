import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

/**
 * Parses and extracts Lighthouse category scores and Core Web Vitals telemetry
 * from a raw Lighthouse JSON result file (lhr-*.json).
 */
export function extractRunData(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    const formFactor =
      data.configSettings?.formFactor ||
      data.configSettings?.emulatedFormFactor ||
      'mobile';

    const scores = {
      performance: Math.round((data.categories?.performance?.score ?? 0) * 100),
      accessibility: Math.round((data.categories?.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((data.categories?.['best-practices']?.score ?? 0) * 100),
      seo: Math.round((data.categories?.seo?.score ?? 0) * 100),
    };

    const audits = data.audits || {};
    const metrics = {
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

    return {
      formFactor: formFactor.toLowerCase() === 'desktop' ? 'desktop' : 'mobile',
      finalUrl: data.finalUrl || data.requestedUrl || null,
      scores,
      metrics,
    };
  } catch (err) {
    console.error(`Error reading report ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Resolves the public interactive Lighthouse report URL from links.json.
 * Gracefully handles exact URL matches, redirect/final URLs, and falls back to fallbackUrl.
 */
export function resolveReportUrl(strategyDir, targetUrl, fallbackUrl = null) {
  if (!strategyDir || !fs.existsSync(strategyDir)) {
    return fallbackUrl;
  }

  const linksPath = path.join(strategyDir, 'links.json');
  if (!fs.existsSync(linksPath)) {
    return fallbackUrl;
  }

  try {
    const raw = fs.readFileSync(linksPath, 'utf8');
    const links = JSON.parse(raw);

    if (typeof links !== 'object' || links === null) {
      return fallbackUrl;
    }

    // 1. Direct exact match
    if (targetUrl && links[targetUrl]) {
      return links[targetUrl];
    }

    // 2. Trailing slash normalization match
    if (targetUrl) {
      const stripped = targetUrl.replace(/\/$/, '');
      const slashed = `${stripped}/`;
      if (links[stripped]) return links[stripped];
      if (links[slashed]) return links[slashed];
    }

    // 3. First available report link in links.json (handles redirect destinations)
    const availableLinks = Object.values(links).filter(
      (link) => typeof link === 'string' && link.startsWith('http')
    );
    if (availableLinks.length > 0) {
      return availableLinks[0];
    }
  } catch (err) {
    console.warn(`Warning: Could not parse links.json in ${strategyDir}:`, err.message);
  }

  return fallbackUrl;
}

/**
 * Loads and groups parsed Lighthouse runs for a given strategy.
 * Inspects strategy-isolated folder (.lighthouseci-[strategy]) first,
 * falling back to root .lighthouseci for downward compatibility.
 */
export function getStrategyRuns(strategy, baseDir = process.cwd()) {
  const isolatedDir = path.join(baseDir, `.lighthouseci-${strategy}`);
  const legacyDir = path.join(baseDir, '.lighthouseci');

  const dirToUse = fs.existsSync(isolatedDir) ? isolatedDir : legacyDir;
  if (!fs.existsSync(dirToUse)) {
    return { dir: null, runs: [] };
  }

  const files = fs
    .readdirSync(dirToUse)
    .filter((f) => f.startsWith('lhr-') && f.endsWith('.json'));

  const runs = [];
  for (const file of files) {
    const parsed = extractRunData(path.join(dirToUse, file));
    if (parsed) {
      // In isolated folders, all runs belong to this strategy; in legacy folder, filter by formFactor
      if (dirToUse === isolatedDir || parsed.formFactor === strategy) {
        runs.push(parsed);
      }
    }
  }

  return { dir: dirToUse, runs };
}

export async function postResults() {
  const SITE_ID = process.env.SITE_ID;
  const TARGET_URL = process.env.TARGET_URL;
  const CALLBACK_URL = process.env.CALLBACK_URL;
  const INGEST_SECRET = process.env.INGEST_SECRET;
  const RUN_ID = process.env.RUN_ID;
  const GITHUB_REPO = process.env.GITHUB_REPO;

  console.log('--- Mantiscan Result Ingestion ---');
  console.log('SITE_ID:', SITE_ID);
  console.log('TARGET_URL:', TARGET_URL);
  console.log('CALLBACK_URL:', CALLBACK_URL);
  console.log('RUN_ID:', RUN_ID);

  if (!SITE_ID || !CALLBACK_URL || !INGEST_SECRET) {
    console.error('Missing required environment variables: SITE_ID, CALLBACK_URL, INGEST_SECRET');
    process.exit(1);
  }

  const fallbackReportUrl = GITHUB_REPO && RUN_ID
    ? `https://github.com/${GITHUB_REPO}/actions/runs/${RUN_ID}`
    : null;

  const strategies = ['mobile', 'desktop'];
  let totalSuccessfulPosts = 0;

  for (const strategy of strategies) {
    const { dir, runs } = getStrategyRuns(strategy);

    if (runs.length === 0) {
      console.warn(`No runs found for strategy: ${strategy} in ${dir || 'any known directory'}`);
      continue;
    }

    // Sort by performance score and pick the median run
    runs.sort((a, b) => a.scores.performance - b.scores.performance);
    const medianIndex = Math.floor(runs.length / 2);
    const selectedRun = runs[medianIndex];

    // Resolve report URL (Google temporary-public-storage or fallback to GHA run)
    const reportUrl = resolveReportUrl(dir, TARGET_URL || selectedRun.finalUrl, fallbackReportUrl);

    const payload = {
      siteId: SITE_ID,
      strategy,
      triggeredBy: 'manual',
      scores: selectedRun.scores,
      metrics: selectedRun.metrics,
      reportUrl,
    };

    console.log(`\nPosting median ${strategy.toUpperCase()} scores to API:`, JSON.stringify(payload.scores));
    console.log(`Report URL for ${strategy.toUpperCase()}:`, reportUrl || '(none)');

    try {
      const res = await fetch(CALLBACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ingest-Secret': INGEST_SECRET,
        },
        body: JSON.stringify(payload),
      });

      const responseText = await res.text();
      console.log(`API response [${res.status}]:`, responseText);

      if (res.ok) {
        totalSuccessfulPosts++;
      } else {
        console.error(`Failed to post ${strategy} results. Status: ${res.status}`);
      }
    } catch (err) {
      console.error(`Network error posting ${strategy} results:`, err.message);
    }
  }

  if (totalSuccessfulPosts === 0) {
    console.error('No strategy results were successfully posted to API. Notifying API of failure...');
    try {
      await fetch(CALLBACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ingest-Secret': INGEST_SECRET,
        },
        body: JSON.stringify({
          siteId: SITE_ID,
          status: 'failed',
          error: 'No Lighthouse runs could be ingested by runner',
        }),
      });
    } catch (e) {
      console.error('Failed to notify API of failure:', e.message);
    }
    process.exit(1);
  }

  console.log('\n--- Ingestion Complete ---');
}

// Auto-run if executed directly as a script
const isDirectRun =
  process.argv[1] &&
  (process.argv[1] === url.fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('post-results.js'));

if (isDirectRun) {
  postResults();
}
