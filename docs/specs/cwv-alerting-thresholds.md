# Core Web Vitals (CWV) Alerting Thresholds Specification

## 1. Executive Summary
Mantiscan currently evaluates site health and dispatches Slack/Discord alerts strictly based on high-level category scores (0–100: Performance, Accessibility, Best Practices, and SEO). However, real-world user experience and Google SEO rankings are predominantly governed by **Core Web Vitals (CWV)**:
* **Largest Contentful Paint (LCP)**: Loading performance (target: $\le 2.5\text{s}$)
* **Cumulative Layout Shift (CLS)**: Visual stability (target: $\le 0.10$)
* **Interaction to Next Paint (INP)**: Responsiveness (target: $\le 200\text{ms}$)

A website can achieve an 88–92 Performance score while delivering a disastrous 4.2-second LCP or jarring layout shifts. This specification formalizes per-site configurable Core Web Vitals thresholds across the database schema, ingestion alerting pipeline, Slack/Discord notification payloads, and the web management interface.

---

## 2. Understanding Summary & Scope
* **Target Audience**: Site administrators and DevOps engineers monitoring web performance SLAs.
* **Core Functionality**:
  * Store per-site CWV thresholds (`lcpThresholdMs`, `clsThreshold`, `inpThresholdMs`) in Cloudflare D1 with zero-downtime backward compatibility.
  * Evaluate inbound audit results against both category scores and CWV thresholds in `/api/audit-result`.
  * Trigger `degraded` health status and notify Slack/Discord channels whenever category scores OR Core Web Vitals breach their configured thresholds.
  * Upgrade webhook payloads to display actual values contrasted against target thresholds (with 🟢 / 🔴 indicators).
  * Expose threshold configuration and breach warnings in `AddSiteModal`, `SiteDetailModal`, `SiteCard`, and `SiteTrendChart`.
* **Explicit Non-Goals**:
  * Writing synthetic Puppeteer interaction scripts to force INP generation during headless CI runs.
  * Altering the GitHub Actions runner execution workflow itself (metrics are already collected and transmitted by `scripts/post-results.js`).

---

## 3. Assumptions & Non-Functional Requirements
1. **Google CWV Defaults**:
   * LCP: $\le 2500\text{ms}$ ($2.50\text{s}$)
   * CLS: $\le 0.10$
   * INP: $\le 200\text{ms}$
2. **Unified Health Status**: Any single threshold breach (score minimum or CWV maximum) marks the site as `degraded` and triggers alerts.
3. **Graceful Metric Omission**: If a metric is null or missing (common for INP in synthetic headless Lighthouse CI), it is skipped in evaluation and will never trigger a false breach.
4. **Zero Downtime**: Cloudflare D1 schema alterations utilize `NOT NULL DEFAULT` constraints, preserving existing records.
5. **Performance**: In-memory threshold evaluation during audit webhook ingestion with $< 1\text{ms}$ CPU overhead.

---

## 4. Decision Log

| # | Topic | Decision | Alternatives Considered | Rationale |
|---|---|---|---|---|
| **D1** | **Metric Scope** | LCP, CLS, and optional INP | LCP & CLS only; LCP, CLS & TBT | Covers all 3 official Google CWVs; accommodates headless CI runs by gracefully omitting INP when null. |
| **D2** | **Breach Severity** | Unified Hard Breach (`degraded` status) | Warning-only tier; purely visual SLA | Keeps alerting semantics clear: any SLA breach indicates the site is degraded. |
| **D3** | **Configurability** | Per-site configurable with Google defaults | Global static benchmarks; UI opt-in toggle | Grants flexibility for sites with distinct SLAs while offering sensible out-of-the-box defaults. |
| **D4** | **Null Metric Handling** | Graceful omission (no alert if null) | Strict alert; warning flag | Prevents false-positive alert storms caused by synthetic headless CI where INP is typically null. |
| **D5** | **Storage Model** | Dedicated typed columns in `sites` table | JSON config blob; normalized overrides table | Approach 1 selected. Cleanest, type-safe, and consistent with existing `perf_threshold` architecture. |
| **D6** | **CWV Payload Formatting** | Explicit Pass/Fail markers with targets (🟢/🔴 `value / target`) | Plain informational values; separate CWV-only notification | Gives instant visual confirmation in Slack/Discord of which specific vitals passed or breached. |
| **D7** | **UI Input Units** | Seconds for LCP, Milliseconds for INP, Decimal for CLS | Raw milliseconds for all; pure text inputs | Matches industry standard reporting (Google Search Console, PageSpeed Insights) and reduces human input errors. |
| **D8** | **Regression Scope** | Retain category drop ($\ge 10$ pts) for regression alerts; evaluate CWVs on absolute threshold breaches | Add CWV delta threshold (e.g. +500ms LCP) | CI runner CPU/network jitter can easily swing LCP by 200–300ms. Absolute threshold alerting prevents spam while catching real SLA failures. |

---

## 5. Architectural & Technical Specification

### 5.1 Shared Package (`packages/shared/src/index.ts`)
```ts
export const DEFAULT_THRESHOLDS = {
  performance: 90,
  accessibility: 90,
  bestPractices: 85,
  seo: 90,
  lcpMs: 2500,
  cls: 0.1,
  inpMs: 200,
} as const;

export interface Site {
  // ... existing fields
  perfThreshold: number;
  a11yThreshold: number;
  bestPracticesThreshold: number;
  seoThreshold: number;
  lcpThresholdMs: number;
  clsThreshold: number;
  inpThresholdMs: number;
  // ...
}

export interface CreateSiteInput {
  // ...
  lcpThresholdMs?: number;
  clsThreshold?: number;
  inpThresholdMs?: number;
}

export interface UpdateSiteInput {
  // ...
  lcpThresholdMs?: number;
  clsThreshold?: number;
  inpThresholdMs?: number;
}
```

### 5.2 Database Schema (`apps/api/src/db/schema.ts`)
```ts
export const sites = sqliteTable('sites', {
  // ...
  perfThreshold: integer('perf_threshold').notNull().default(90),
  a11yThreshold: integer('a11y_threshold').notNull().default(90),
  bestPracticesThreshold: integer('best_practices_threshold').notNull().default(85),
  seoThreshold: integer('seo_threshold').notNull().default(90),
  lcpThresholdMs: integer('lcp_threshold_ms').notNull().default(2500),
  clsThreshold: real('cls_threshold').notNull().default(0.1),
  inpThresholdMs: integer('inp_threshold_ms').notNull().default(200),
  // ...
});
```

Migration SQL:
```sql
ALTER TABLE sites ADD COLUMN lcp_threshold_ms INTEGER NOT NULL DEFAULT 2500;
ALTER TABLE sites ADD COLUMN cls_threshold REAL NOT NULL DEFAULT 0.1;
ALTER TABLE sites ADD COLUMN inp_threshold_ms INTEGER NOT NULL DEFAULT 200;
```

### 5.3 Alert Evaluation Engine (`apps/api/src/services/alert.ts`)
```ts
export function evaluateAuditState(
  site: SiteRow,
  currentScores: AuditScores,
  strategy: DeviceStrategy,
  metrics?: CoreWebVitals | null,
  previousRun?: AuditRunRow | null
): AlertEvaluationResult {
  const isScoresFailing =
    currentScores.performance < site.perfThreshold ||
    currentScores.accessibility < site.a11yThreshold ||
    currentScores.bestPractices < site.bestPracticesThreshold ||
    currentScores.seo < site.seoThreshold;

  const lcpBreach = metrics?.lcpMs != null && metrics.lcpMs > site.lcpThresholdMs;
  const clsBreach = metrics?.cls != null && metrics.cls > site.clsThreshold;
  const inpBreach = metrics?.inpMs != null && metrics.inpMs > site.inpThresholdMs;

  const isFailing = isScoresFailing || lcpBreach || clsBreach || inpBreach;
  const newStatus: 'healthy' | 'degraded' = isFailing ? 'degraded' : 'healthy';
  const prevStatus = site.status;

  // Build descriptive alert summary detailing exact failures
  const breaches: string[] = [];
  if (currentScores.performance < site.perfThreshold) breaches.push(`Perf ${currentScores.performance} < ${site.perfThreshold}`);
  if (currentScores.accessibility < site.a11yThreshold) breaches.push(`A11y ${currentScores.accessibility} < ${site.a11yThreshold}`);
  if (currentScores.bestPractices < site.bestPracticesThreshold) breaches.push(`BestPractices ${currentScores.bestPractices} < ${site.bestPracticesThreshold}`);
  if (currentScores.seo < site.seoThreshold) breaches.push(`SEO ${currentScores.seo} < ${site.seoThreshold}`);
  if (lcpBreach) breaches.push(`LCP ${(metrics!.lcpMs! / 1000).toFixed(2)}s > ${(site.lcpThresholdMs / 1000).toFixed(2)}s`);
  if (clsBreach) breaches.push(`CLS ${metrics!.cls!.toFixed(3)} > ${site.clsThreshold.toFixed(3)}`);
  if (inpBreach) breaches.push(`INP ${metrics!.inpMs!}ms > ${site.inpThresholdMs}ms`);

  // State transitions: healthy -> degraded, degraded -> healthy, or regression
  // ...
}
```

### 5.4 Slack & Discord Webhook Payloads
* Slack:
  ```ts
  const formatCwvMetric = (label: string, valueStr: string, isBreached: boolean, targetStr: string) => {
    const icon = isBreached ? '🔴' : '🟢';
    return `*${label}:* ${icon} *${valueStr}* (target: ${targetStr})`;
  };
  ```
* Discord:
  ```ts
  fields.push({
    name: 'Core Web Vitals',
    value: `LCP: ${lcpDisplay} (≤${(site.lcpThresholdMs / 1000).toFixed(2)}s) | CLS: ${clsDisplay} (≤${site.clsThreshold.toFixed(2)})`,
    inline: false,
  });
  ```

### 5.5 User Interface Components
1. **`AddSiteModal.tsx`**: Add inputs for LCP Max (s), CLS Max, INP Max (ms) alongside score thresholds.
2. **`SiteDetailModal.tsx`**: Add threshold editing form to allow updating CWV targets; badge current values with target SLA indicators.
3. **`SiteCard.tsx`**: Evaluate CWVs in breach banner; dynamic color-coding in quick vitals strip.
4. **`SiteTrendChart.tsx`**: Red-line threshold horizontal markers calibrate to `site.lcpThresholdMs / 1000`, `site.clsThreshold`, and `site.inpThresholdMs`.

---

## 6. Verification Plan
* **Unit Testing**: Vitest test cases in `apps/api/tests/alert.test.ts` covering all permutations (CWV breach alone, score breach alone, concurrent breaches, null INP handling, and recovery).
* **API Validation**: Automated tests in `apps/api/tests/sites.test.ts` ensuring bounds checking and persistence.
* **Workspace Verification**: Full monorepo type-checking and production build verification (`pnpm build`).
