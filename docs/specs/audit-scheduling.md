# Mantiscan — Automated Audit Scheduling Specification
**Per-Site Cadence & Preferred Time-of-Day Execution**

---

## 1. Executive Summary & Purpose

This specification defines the architecture, data model, and user experience for configurable per-site automated audit schedules in **Mantiscan**.
Users can define:
1. **Recurrence Interval / Cadence:** How frequently audits run (presets: Daily, Every 7 days [default], Every 14 days, Monthly / 30 days).
2. **Preferred Time-of-Day:** The target hour (e.g. 02:00 AM local time) during off-peak hours for consistent, low-traffic performance audits.

---

## 2. Understanding Summary & Key Constraints

* **Control Plane vs. Execution Plane:**
  * **Control Plane (Cloudflare Workers + D1):** Manages site schedules, performs hourly cron checks (`0 * * * *`), and triggers GitHub Actions via REST API.
  * **Execution Plane (GitHub Actions):** Remains an on-demand runner triggered by `workflow_dispatch`. Native GHA cron is rejected due to static YAML constraints, high queue latency jitter, and runner minute waste.
* **Hour-Level Resolution:** Aligns with Cloudflare Workers' hourly cron trigger.
* **$0 Operational Cost:** Zero additional infrastructure cost; runs within free Cloudflare Workers and GitHub Actions runner quotas.
* **Timezone Transparency:** UI detects local browser timezone; users configure local hours, and the system normalizes and stores UTC on the server.
* **Immediate Baseline:** Adding a new site triggers an immediate initial baseline scan, while scheduling subsequent recurring runs based on the configured cadence and hour.
* **Non-Goals:** Minute-level execution precision (e.g. 02:17) and dynamic GitHub Actions YAML modification are out of scope.

---

## 3. Decision Log

| ID | Decision | Alternatives Considered | Rationale |
|---|---|---|---|
| **D1** | Schedule orchestration in Cloudflare Workers + D1 | GitHub Actions native `schedule:` cron | GHA cron is static in git, suffers up to 60m latency jitter, and burns runner minutes on polling. Cloudflare Workers cron is free, dynamic, and runs hourly. |
| **D2** | Curated Presets (Daily, 7d, 14d, 30d) + Hour Picker | Free-form day input; Raw cron expressions | Optimizes UX clarity and eliminates invalid cron expressions or edge-case date errors. |
| **D3** | Automatic local browser timezone detection with UTC storage | Explicit UTC-only UI; Manual timezone dropdown | Minimizes user friction while keeping database records cleanly normalized in UTC. |
| **D4** | Immediate baseline audit on creation | Defer first audit to future scheduled date | Gives users immediate performance feedback upon adding a site instead of waiting days. |
| **D5** | Manual scans preserve recurring schedule | Reset schedule on manual run | Manual scans are one-off diagnostic checks and should not alter predictable calendar cadences. |
| **D6** | Schema default: 7-day interval, 00:00 UTC | Prompt user for existing sites | Ensures seamless, backward-compatible migration for existing D1 database rows. |

---

## 4. Architecture & Component Design

### A. Data Model (`apps/api/src/db/schema.ts`)
```sql
ALTER TABLE sites ADD COLUMN audit_interval_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE sites ADD COLUMN audit_hour_utc INTEGER NOT NULL DEFAULT 0;
```
* `audit_interval_days`: Integer representing days between scans (`1`, `7`, `14`, `30`).
* `audit_hour_utc`: Integer between `0` and `23` representing the scheduled UTC hour.
* `next_audit_at`: Unix timestamp in seconds, indexed via `idx_sites_next_audit(next_audit_at, status)`.

### B. Scheduling Math (`apps/api/src/services/schedule.ts`)
Pure, deterministic helper function:
```typescript
export function calculateNextAuditAt(
  intervalDays: number,
  targetHourUtc: number,
  now: Date = new Date()
): number {
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    targetHourUtc, 0, 0, 0
  ));

  // If candidate target is already in the past or now, advance by intervalDays
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + intervalDays);
  }

  return Math.floor(target.getTime() / 1000);
}
```

### C. Backend API & Cloudflare Worker Cron Flow
1. **Creation (`POST /api/sites`):**
   * Accepts `auditIntervalDays` (default: 7) and `auditHourUtc` (default: 0).
   * Calculates initial `nextAuditAt = calculateNextAuditAt(auditIntervalDays, auditHourUtc, new Date())`.
   * Dispatches immediate baseline scan via `ctx.waitUntil(triggerAuditWorkflow(...))`.
2. **Update (`PUT /api/sites/:id`):**
   * Recalculates `nextAuditAt` if `auditIntervalDays` or `auditHourUtc` changes.
3. **Hourly Cron (`apps/api/src/index.ts`):**
   * Runs hourly (`0 * * * *`).
   * Queries: `SELECT * FROM sites WHERE next_audit_at <= :now LIMIT 10`.
   * For each due site:
     * Advances `nextAuditAt = calculateNextAuditAt(site.auditIntervalDays, site.auditHourUtc, new Date())`.
     * Atomically sets `nextAuditAt` and `lastRunStatus = 'running'` in D1.
     * Dispatches `triggerAuditWorkflow(...)` with `triggeredBy: 'cron'`.
4. **Manual Scan (`POST /api/sites/:id/scan`):**
   * Sets `lastRunStatus = 'running'`.
   * Dispatches `triggerAuditWorkflow(...)` with `triggeredBy: 'manual'`.
   * Leaves `nextAuditAt` unchanged.

### D. Frontend UI & Timezone UX
1. **Timezone Detection:**
   * Uses `Intl.DateTimeFormat().resolvedOptions().timeZone`.
   * Automatically converts user's selected local hour to UTC before submitting to API.
   * Converts UTC hour back to local time when rendering site details.
2. **Modals (`AddSiteModal.tsx` & `SiteDetailModal.tsx`):**
   * Segmented pill selector: `Daily (1d)`, `Weekly (7d)`, `Bi-weekly (14d)`, `Monthly (30d)`.
   * Time selector: Hour + AM/PM dropdown.
   * Live preview caption: *"Repeats every 7 days at 2:00 AM (your local time • 18:00 UTC)"*.
3. **Site Cards (`SiteCard.tsx`):**
   * Schedule badge: `🗓️ Weekly @ 2:00 AM`.
   * Next run countdown tooltip / subtitle: `Next scan: Mon, Sep 15 (in 3 days)`.

---

## 5. Edge Cases & Resilience

* **Daylight Saving Time (DST):** UTC storage guarantees that server triggers never experience double-runs or skipped hours.
* **Month Roll-overs & Leap Years:** Standard UTC date operations natively handle 28/30/31-day months and leap years.
* **Failure Loop Protection:** D1 updates `nextAuditAt` before/concurrently with GHA dispatch to ensure temporary GitHub outages do not trigger runaway hourly retries.
* **GHA Concurrency:** Cloudflare processes sites in batches of 10 per hour; GitHub Actions natively queues concurrent jobs.

---

## 6. Closed-Loop Verification Plan (Carmack Principles)

1. **Automated Unit Tests:**
   * Test `calculateNextAuditAt` across all intervals (1, 7, 14, 30 days).
   * Test month and leap year boundaries.
   * Test past vs. future time on the current day.
2. **Local Worker & D1 Verification:**
   * Insert test site with `nextAuditAt = now - 10`.
   * Simulate cron trigger via local endpoint `/__scheduled`.
   * Assert D1 record has updated `nextAuditAt` and `lastRunStatus = 'running'`.
3. **Frontend E2E Verification:**
   * Verify schedule presets and time picker correctly map local time to UTC.
   * Verify site card and detail modal display accurate local schedule times and next-run countdowns.
