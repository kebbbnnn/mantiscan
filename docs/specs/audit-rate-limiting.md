# Mantiscan — Audit Rate-Limiting & GHA Cooldown Specification
**Defensive Cooldown, Concurrency Control, and Self-Healing Runner Architecture**

---

## 1. Executive Summary & Purpose

Mantiscan monitors client and production websites using GitHub Actions runners to execute headless Chrome Google Lighthouse CI audits. Because GitHub Actions provides 2,000 free runner minutes per month, unprotected on-demand triggers (`POST /api/sites/:id/scan`) expose the infrastructure to rapid quota exhaustion if a user or automated agent clicks "Scan Now" repeatedly.

This specification details the end-to-end design and implementation of:
1. **Per-Site Cooldown Guard (D1 & API):** Enforces a 5-minute debounce lock on on-demand scans, returning standard HTTP 429 (`Retry-After`).
2. **Self-Healing Stuck-Run TTL (10 Minutes):** Automatically expires orphaned `running` states caused by crashed runners or network drops so sites never deadlock.
3. **CI Concurrency Grouping (GitHub Actions):** Scopes workflow dispatch execution per-site to prevent parallel duplicate runners at the CI plane.
4. **Real-Time Client Countdown UX:** Displays an active ticking timer (`⏳ Cooldown 3m 42s`) on the disabled scan button in `SiteCard.tsx`.
5. **Scheduled Cron Integration:** Prevents the hourly cron worker from triggering redundant runs if a site is already running or on cooldown.

---

## 2. Understanding Summary & Key Constraints

* **What is being built:** A dual-layer rate-limiting and cooldown defense system:
  * **Data & API Layer:** Cloudflare D1 column `last_scan_requested_at`, pure helper `getAuditCooldownStatus`, API route protection returning HTTP 429 with `Retry-After`.
  * **GHA Runner Layer:** Workflow concurrency group `audit-${{ inputs.site_id || 'scheduled' }}` with `cancel-in-progress: false`.
  * **Dashboard UI Layer:** Real-time ticking countdown button on `SiteCard.tsx` with smooth transition back to `Scan Now`.
  * **Cron Layer:** Automatic cooldown check in hourly cron worker to skip redundant dispatches.
* **Why it exists:** Protects the 2,000 monthly GitHub Actions free minutes from button mashing and multi-click spam, while preventing orphaned runner jobs from permanently locking a site.
* **Who it is for:** Mantiscan operators maintaining a high-reliability monitoring SaaS on a permanent $0 operational budget.
* **Key Constraints:**
  * **$0 Infrastructure Cost:** Runs completely within Cloudflare Workers + D1 and GitHub Actions free tiers without external Redis or paid key-value stores.
  * **Zero Orphan Lock-outs:** Self-healing 10-minute TTL guarantees that cancelled or failed runners automatically unlock without manual intervention.
  * **Consistent Time Semantics:** Evaluation is performed using pure timestamp math against Unix seconds.
* **Explicit Non-Goals:**
  * User authentication or per-user API rate-limiting tokens (deferred to future multi-tenant auth phase).
  * Global Cloudflare WAF rate-limiting rules (kept self-contained within the application layer).
  * Altering the Lighthouse CLI execution pipeline itself.

---

## 3. Assumptions & Non-Functional Requirements

* **Performance:** Sub-millisecond evaluation in Cloudflare Workers using indexed SQLite timestamps. Frontend countdown is driven by a localized 1-second interval calculating remaining time against the current clock, avoiding layout thrashing or polling storms.
* **Scale:** Accommodates hundreds of monitored sites within D1 free tier allowances.
* **Reliability:** 10-minute stuck-run TTL prevents deadlocks. `cancel-in-progress: false` ensures active runs complete cleanly and produce reports.
* **Security & Resilience:** Rejects rapid re-triggers with HTTP 429 Too Many Requests and `Retry-After` header.
* **Maintainability:** Shared timing constants (`AUDIT_COOLDOWN_SECONDS`, `AUDIT_RUNNING_TIMEOUT_SECONDS`) and logic centralized in `@mantiscan/shared`.

---

## 4. Decision Log

* **Decision 1: Protection Scope**
  * *Decided:* Enforce a per-site cooldown with stuck-run TTL at the D1/API layer paired with GitHub Actions concurrency grouping at the runner plane.
  * *Alternatives Considered:* Per-site cooldown alone, or full IP/global rate limiting.
  * *Rationale:* Provides complete protection against both accidental UI double-clicking and CI queue flooding without requiring complex IP-tracking state.
* **Decision 2: Timing Policy**
  * *Decided:* 5-minute cooldown (`300s`) from scan trigger time, with a 10-minute (`600s`) stuck-run self-healing TTL.
  * *Alternatives Considered:* 3m cooldown / 5m TTL; 10m cooldown / 15m TTL.
  * *Rationale:* 5 minutes prevents GitHub Actions free-minute depletion while leaving reasonable headroom after a ~100s audit for developers testing fixes.
* **Decision 3: Architectural Approach**
  * *Decided:* Dedicated `lastScanRequestedAt` column in D1 paired with shared evaluation logic in `@mantiscan/shared` (Approach 1).
  * *Alternatives Considered:* Overloading `lastAuditedAt` (Approach 2), Cloudflare Workers KV (Approach 3).
  * *Rationale:* Clean domain semantics, zero external KV dependencies, and strong SQLite transactional consistency.
* **Decision 4: UI Presentation**
  * *Decided:* Live ticking countdown on disabled button (`⏳ Cooldown 3m 42s`) with automatic re-enablement when timer expires.
  * *Alternatives Considered:* Static disabled button; clickable button with error toast.
  * *Rationale:* Provides instant, intuitive feedback without generating useless failing API requests.
* **Decision 5: Scheduled Cron Interaction**
  * *Decided:* Skip cron execution if site is currently running or within 5-minute cooldown, and advance `nextAuditAt` to the next interval.
  * *Alternatives Considered:* Defer cron by 15 minutes; ignore cooldown and force execution.
  * *Rationale:* Avoids duplicate runs and wasteful compute when a site was just audited minutes earlier.

---

## 5. Detailed Technical Design

### 5.1 Data Model & Schema Changes

#### D1 Migration (`apps/api/migrations/0003_add_scan_cooldown.sql`)
```sql
ALTER TABLE sites ADD COLUMN last_scan_requested_at INTEGER;
```

#### Drizzle ORM Schema (`apps/api/src/db/schema.ts`)
```ts
export const sites = sqliteTable('sites', {
  // ... existing columns
  lastScanRequestedAt: integer('last_scan_requested_at'), // unix seconds
  // ...
});
```

#### Shared Interface & Constants (`packages/shared/src/index.ts`)
```ts
export const AUDIT_COOLDOWN_SECONDS = 300; // 5 minutes
export const AUDIT_RUNNING_TIMEOUT_SECONDS = 600; // 10 minutes

export interface Site {
  // ... existing properties
  lastScanRequestedAt: number | null;
}

export interface CooldownStatus {
  canScan: boolean;
  remainingSeconds: number;
  reason: 'none' | 'cooldown' | 'running';
}

export function getAuditCooldownStatus(
  site: { lastScanRequestedAt?: number | null; lastRunStatus?: string | null },
  nowSeconds: number = Math.floor(Date.now() / 1000)
): CooldownStatus {
  const elapsed = site.lastScanRequestedAt ? nowSeconds - site.lastScanRequestedAt : Infinity;

  // Self-healing check: if marked running for >= 10 minutes, treat as expired
  const isActivelyRunning = site.lastRunStatus === 'running' && elapsed < AUDIT_RUNNING_TIMEOUT_SECONDS;
  if (isActivelyRunning) {
    const remaining = Math.max(1, AUDIT_COOLDOWN_SECONDS - elapsed);
    return { canScan: false, remainingSeconds: remaining, reason: 'running' };
  }

  // Cooldown check: must be at least 5 minutes since last request
  if (elapsed < AUDIT_COOLDOWN_SECONDS) {
    return { canScan: false, remainingSeconds: AUDIT_COOLDOWN_SECONDS - elapsed, reason: 'cooldown' };
  }

  return { canScan: true, remainingSeconds: 0, reason: 'none' };
}
```

---

### 5.2 API & Cron Engine Logic

#### 1. On-Demand Audit Endpoint (`POST /api/sites/:id/scan`)
* Located in `apps/api/src/routes/sites.ts`:
  1. Fetch site by `id`.
  2. Evaluate `getAuditCooldownStatus(site, now)`.
  3. If `!canScan`:
     * Set header `Retry-After: ${remainingSeconds}`.
     * Return HTTP `429 Too Many Requests` with:
       ```json
       {
         "error": "Cooldown active. Please wait 215s before scanning again.",
         "retryAfter": 215,
         "reason": "cooldown"
       }
       ```
  4. If `canScan`:
     * Update D1 atomically: `lastScanRequestedAt = now`, `lastRunStatus = 'running'`.
     * Trigger GitHub Actions workflow dispatch.
     * Return `200 OK`.

#### 2. Hourly Cron Handler (`apps/api/src/index.ts`)
* For each site in `dueSites`:
  * Evaluate `getAuditCooldownStatus(site, now)`.
  * If `!canScan`:
    * Advance `nextAuditAt = calculateNextAuditAt(...)`.
    * Skip dispatching GHA workflow.
  * If `canScan`:
    * Advance `nextAuditAt`, update `lastScanRequestedAt = now`, `lastRunStatus = 'running'`.
    * Dispatch GHA workflow via `ctx.waitUntil`.

#### 3. Baseline Audit on Creation (`POST /api/sites`)
* When inserting newly registered sites, populate `lastScanRequestedAt = now` and `lastRunStatus = 'running'` to initialize the 5-minute cooldown.

---

### 5.3 GitHub Actions Concurrency Control

In `.github/workflows/audit.yml`:
```yaml
name: Lighthouse Audit Runner

on:
  workflow_dispatch:
    inputs:
      site_id:
        description: 'Mantiscan Site ID'
        required: true
        type: string
      # ...

concurrency:
  group: audit-${{ inputs.site_id || 'scheduled' }}
  cancel-in-progress: false
```

* **Per-Site Isolation:** Audits for distinct sites run in parallel.
* **Non-Destructive:** Active runs are not killed, ensuring reports and metrics are ingested properly.

---

### 5.4 Frontend UI & Real-Time Countdown UX

#### In `apps/web/src/components/SiteCard.tsx`:
* Initialize countdown state with `getAuditCooldownStatus(site).remainingSeconds`.
* Run a local 1-second `setInterval` that updates `cooldownSeconds` by evaluating current time against `site.lastScanRequestedAt`.
* Render states:
  * **Running (`isScanning || (site.lastRunStatus === 'running' && cooldownSeconds > 0)`):**  
    `<button disabled>Scanning...</button>`
  * **In Cooldown (`!isRunning && cooldownSeconds > 0`):**  
    `<button disabled>⏳ Cooldown {formatCooldown(cooldownSeconds)}</button>`
  * **Ready:**  
    `<button onClick={() => onScan(site.id)}><Play size={13} /> Scan Now</button>`

#### In `apps/web/src/App.tsx`:
* Optimistically set `lastScanRequestedAt = Math.floor(Date.now() / 1000)` and `lastRunStatus = 'running'` on trigger.
* If a 429 is encountered, display a toast with the remaining cooldown time and synchronize the local site state.

---

## 6. Closed-Loop Verification Plan (Carmack Principles)

1. **Unit Testing (`packages/shared`):**
   * Cooldown logic for new sites, active cooldowns, running states, and expired TTL states.
2. **API Integration Tests (`apps/api/tests/cooldown.test.ts`):**
   * Initial trigger success (200).
   * Immediate second trigger rejection (429 with `Retry-After`).
   * Self-healing TTL recovery on stale running status (> 10m).
   * Cron skipping due sites in cooldown.
3. **Autonomous Workspace Builds:**
   * Verify all packages build cleanly: `npm run build` and all tests pass: `npm test`.
