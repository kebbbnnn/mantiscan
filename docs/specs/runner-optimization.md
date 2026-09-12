# Mantiscan — Audit Runner Performance Optimization Specification
**Cutting GitHub Actions Runner Execution Time from 4+ Minutes to ~100 Seconds**

**Specification Document:** `docs/specs/runner-optimization.md`  
**Status:** Approved  
**Author:** AI Pair Programmer & Project Maintainer  
**Date:** 2026-09-12  

---

## 1. Executive Summary & Purpose

Mantiscan uses a headless browser audit runner hosted on GitHub Actions (`.github/workflows/audit.yml`) to execute Google Lighthouse CI across **Mobile** and **Desktop** viewports, computing 3-run medians to eliminate cloud CPU throttling jitter.

Currently, audits take **3.5 to 4.5 minutes** per run. This creates noticeable latency for users triggering on-demand scans from the web dashboard and unnecessarily burns GitHub Actions free-tier runner minutes.

This specification documents the architecture and implementation design to reduce total runner execution time to **~100–115 seconds** (a ~60% reduction) while strictly maintaining the single-job sequential execution model and 3-run median scoring accuracy.

---

## 2. Understanding Summary

* **What is being built:** A streamlined GitHub Actions workflow (`.github/workflows/audit.yml`) and fail-fast post-results processor (`scripts/post-results.js`) engineered for minimum execution overhead.
* **Why it exists:** Accelerate user feedback loops in the web dashboard, conserve GitHub Actions runner minutes (2,000 mins/mo free-tier quota), and eliminate wasteful setup operations in CI.
* **Who it is for:** Mantiscan dashboard users and the automated hourly cron dispatcher.
* **Key constraints:**
  * **Single-job sequential runner:** Both Mobile and Desktop audits run within a single GitHub Actions job to avoid saturating organization-level concurrent runner limits.
  * **Preserve 3-run medians:** 3 runs per viewport (6 total) are retained to guarantee statistical stability against cloud CPU throttling.
  * **$0 infrastructure cost:** Operates entirely within standard GitHub-hosted runner free allowances.
* **Explicit non-goals:**
  * Multi-job matrix parallelization (rejected to conserve concurrent CI slots).
  * Reducing run count below 3 (rejected to prevent score jitter).
  * Hosting persistent external runner infrastructure.

---

## 3. Assumptions

1. GitHub-hosted `ubuntu-latest` virtual environments come with Google Chrome Stable pre-installed at `/usr/bin/google-chrome`.
2. The audit workflow only requires `@lhci/cli` and Node.js standard runtime modules (`node:fs`, `node:path`, global `fetch`); no monorepo frontend/backend dependencies (`apps/web`, `apps/api`) need to be installed.
3. Pruning the unneeded Lighthouse `pwa` category via `--settings.onlyCategories=performance,accessibility,best-practices,seo` reduces runtime across all runs without impacting Mantiscan's tracked metrics.
4. When a target website blocks headless Chrome or fails DNS resolution, the runner should detect 0 successful runs and dispatch an explicit `status: 'failed'` payload to the Cloudflare API within 30 seconds rather than leaving the UI in an indefinite polling state.

---

## 4. Root Cause Breakdown & Time Savings

| Overhead Source | Current Behavior | Optimized Behavior | Estimated Time Saved |
| :--- | :--- | :--- | :--- |
| **Dependency Install** | `npm ci || npm install` installs full monorepo (Vite, React, Wrangler, Vitest, etc.) | `npm install -g @lhci/cli@0.14.0 --no-audit --no-fund` (installs only LHCI CLI) | **~40–50 seconds** |
| **Chrome Setup** | 10-line `apt-get update && apt-get install google-chrome-stable` script | `google-chrome --version` sanity check (uses preinstalled binary) | **~30–45 seconds** |
| **Lighthouse Categories** | Runs all categories including PWA (service worker, offline checks, manifest) | Skips PWA via `--settings.onlyCategories=performance,accessibility,best-practices,seo` | **~20–30 seconds** (across 6 runs) |
| **Headless Engine & Network** | Default headless flags without background throttling controls | `--headless=new --disable-extensions --disable-background-networking --settings.maxWaitForLoad=30000` | **~10–15 seconds** |
| **Total Net Reduction** | **~210–270 seconds (3.5–4.5 min)** | **~105–115 seconds (~1.8 min)** | **~110–140 seconds saved** |

---

## 5. Technical Design

### 5.1 Workflow Configuration (`.github/workflows/audit.yml`)

1. **Global CLI Installation:**
   Replace the monorepo `Install Dependencies` step with:
   ```yaml
   - name: Install Lighthouse CI CLI
     run: npm install -g @lhci/cli@0.14.0 --no-audit --no-fund
   ```

2. **Native Chrome Verification:**
   Replace the `Ensure Google Chrome Stable` apt-get block with:
   ```yaml
   - name: Verify Google Chrome Stable
     run: google-chrome --version || { echo "Google Chrome binary missing!"; exit 1; }
   ```

3. **Lighthouse Mobile & Desktop Tuning:**
   Directly invoke `lhci collect` with category pruning, load caps, and modern Chrome flags:
   ```yaml
   - name: Run Lighthouse CI (Mobile - 3 Runs)
     continue-on-error: true
     run: |
       lhci collect --url="${{ inputs.url }}" --numberOfRuns=3 \
         --settings.onlyCategories=performance,accessibility,best-practices,seo \
         --settings.maxWaitForLoad=30000 \
         --settings.chromeFlags="--headless=new --no-sandbox --disable-dev-shm-usage --disable-blink-features=AutomationControlled --disable-extensions --disable-background-networking" \
         --settings.emulatedFormFactor=mobile --additive

   - name: Run Lighthouse CI (Desktop - 3 Runs)
     continue-on-error: true
     run: |
       lhci collect --url="${{ inputs.url }}" --numberOfRuns=3 \
         --settings.onlyCategories=performance,accessibility,best-practices,seo \
         --settings.maxWaitForLoad=30000 \
         --settings.chromeFlags="--headless=new --no-sandbox --disable-dev-shm-usage --disable-blink-features=AutomationControlled --disable-extensions --disable-background-networking" \
         --settings.preset=desktop --additive
   ```

4. **Artifact Retention:**
   Set artifact retention to 14 days (down from 30) to reduce storage footprint while preserving diagnostic reports for debugging.

### 5.2 Fail-Fast Result Ingestion (`scripts/post-results.js`)

Add a guard before the strategy loop. If `.lighthouseci/` contains no parsed runs across both Mobile and Desktop (e.g. site is unreachable or bot-blocked), immediately dispatch a failure payload to the Cloudflare API:

```javascript
const totalRuns = runsByStrategy.mobile.length + runsByStrategy.desktop.length;
if (totalRuns === 0) {
  console.warn('No successful Lighthouse runs found. Dispatching failure notice to API...');
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
        error: 'All Lighthouse audit runs failed (target site unreachable, timed out, or blocked headless Chrome).',
      }),
    });
  } catch (err) {
    console.error('Failed to dispatch failure notice:', err.message);
  }
  process.exit(0);
}
```

---

## 6. Decision Log

| Decision | Chosen Option | Alternatives Considered | Rationale |
| :--- | :--- | :--- | :--- |
| **Execution Topology** | Single-runner sequential | Parallel matrix (separate mobile/desktop jobs) | Conserves GitHub Actions runner concurrency slots within organization pool. |
| **Median Run Count** | 3 runs per strategy (6 total) | 1–2 runs or asymmetric runs | Prevents score variance caused by cloud CPU throttling jitter. |
| **Dependency Strategy** | `npm install -g @lhci/cli` | Monorepo `npm ci` or `actions/cache` | Isolates runner, eliminates monorepo overhead, saves ~45s with zero cache fragility. |
| **Chrome Provisioning** | Verification check (`google-chrome --version`) | `sudo apt-get update && apt-get install` | `ubuntu-latest` already has Google Chrome Stable preinstalled. Saves 30–60s. |
| **Audit Categories** | Performance, A11y, Best Practices, SEO | All categories including PWA | Mantiscan does not track PWA; skipping it saves ~20–30s across 6 runs. |
| **Zero-Run Behavior** | Dispatch `status: 'failed'` webhook | Silent GHA exit | Prevents UI from hanging in `running` status if target site is down. |

---

## 7. Verification Plan (Closed-Loop)

1. **Syntax & Workflow Validation:**
   * Validate YAML structure and linting using `actionlint` or strict schema checks.
2. **Local Simulation & Ingestion Check:**
   * Run `node scripts/post-results.js` with simulated empty `.lighthouseci/` directory and verify that the failure callback payload is constructed and dispatched properly.
   * Run `node scripts/post-results.js` with valid fixtures and verify median calculation remains exact.
3. **CI Run Verification:**
   * Trigger workflow via `workflow_dispatch` on a test URL and measure end-to-end duration from GitHub Actions step timers, confirming runtime falls within ~100–115 seconds.
