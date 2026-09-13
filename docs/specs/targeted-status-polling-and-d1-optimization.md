# Mantiscan — Targeted Status Polling & D1 Read Optimization Specification
**Eliminating Runaway Database Row Reads During Audits and Dashboard Hydration**

---

## 1. Executive Summary & Purpose

During on-demand audits (triggered when a user clicks "Scan Now"), Mantiscan previously polled the comprehensive site list endpoint (`GET /api/sites`) every 3 seconds until completion. Because GitHub Actions Lighthouse CI audits take 60–120 seconds, this resulted in 20–40 heavy API requests per scan. Furthermore, `GET /api/sites` suffered from an N+1 query problem (`1 + 3N` queries) and scanned unindexed `audit_runs` historical rows, driving Cloudflare D1 row reads into tens of thousands per scan and risking rapid exhaustion of Cloudflare free-tier quotas (5M reads/month).

This specification defines the architectural solution:
1. A lean, dedicated status endpoint (`GET /api/sites/:id/status`) that queries only 5 scalar columns and reads exactly 1 row in D1 per poll.
2. A targeted frontend polling state machine in `apps/web/src/App.tsx` that polls *only* active scanning sites at a 6-second cadence, enforcing a 10-minute self-healing timeout and hydrating the full dashboard only once upon completion.
3. Backend query batching in `GET /api/sites` that reduces database operations to 3 constant queries across all sites, paired with a composite index on `audit_runs (site_id, strategy, created_at)`.

---

## 2. Understanding Summary & Key Constraints

* **Problem Root Cause**:
  * Frontend polling loop in `App.tsx` polled `GET /api/sites` every 3 seconds whenever `sites.some(s => s.lastRunStatus === 'running')`.
  * If a runner crashed without dispatching the webhook, `lastRunStatus` stayed `'running'` indefinitely, causing perpetual polling every 3 seconds.
  * Backend `GET /api/sites` made sequential queries per site for channels and runs (`1 + 3N`), compounded by missing `strategy` in `idx_audit_runs_site_id`.
* **Serverless & Edge Constraints**:
  * Cloudflare Workers and D1 operate on a serverless free tier. Cross-isolate real-time streaming (SSE / WebSockets) requires paid Cloudflare Durable Objects or external pub/sub infrastructure.
  * Targeted HTTP polling with minimal row reads (<15 rows total per scan) is simple, stateless, reliable, and completely within free-tier limits.
* **Non-Goals**:
  * Not implementing WebSockets, Server-Sent Events, or external pub/sub brokers (e.g. Pusher, Upstash).
  * Not modifying GitHub Actions runner execution or the `/api/webhooks/audit-result` payload.

---

## 3. Decision Log

| ID | Decision | Alternatives Considered | Rationale |
|---|---|---|---|
| **D1** | **Targeted HTTP Polling over Push/SSE** | Server-Sent Events (SSE), WebSockets | Avoids requiring paid Cloudflare Durable Objects or external pub/sub brokers in a serverless edge architecture. |
| **D2** | **Dedicated `GET /api/sites/:id/status` Endpoint** | Reuse `GET /api/sites/:id`, ETag 304 polling | Limits each poll to reading exactly 1 row in D1; avoids repeatedly loading 50 historical runs and channels. |
| **D3** | **Batched Queries in `GET /api/sites` + Composite Index** | Keeping N+1 sequential queries per site | Reduces database queries from $1 + 3N$ to 3 constant queries and eliminates unindexed table scans. |
| **D4** | **Targeted 6s Cadence + Single Hydration** | Fixed 3s full `fetchSites()` polling | 6s matches GitHub Actions runner lifecycle; eliminates re-render thrashing and targets only active site(s). |
| **D5** | **Status Endpoint Self-Healing on Timeout** | Passive client-side ignore | Permanently cleans up orphaned `'running'` records in D1 if a runner silently crashes. |

---

## 4. Architecture & Technical Design

### A. Endpoint Specification: `GET /api/sites/:id/status`

* **Route**: `/api/sites/:id/status`
* **Response**: `200 OK`
  ```json
  {
    "id": "site_12345678",
    "status": "healthy",
    "lastRunStatus": "running",
    "lastAuditedAt": 1726200000,
    "lastScanRequestedAt": 1726200030
  }
  ```
* **Implementation Logic**:
  1. Primary key lookup:
     ```ts
     const site = await db
       .select({
         id: sites.id,
         status: sites.status,
         lastRunStatus: sites.lastRunStatus,
         lastAuditedAt: sites.lastAuditedAt,
         lastScanRequestedAt: sites.lastScanRequestedAt,
       })
       .from(sites)
       .where(eq(sites.id, siteId))
       .get();
     ```
  2. If not found: return `404 Not Found`.
  3. **Self-Healing Check**:
     If `site.lastRunStatus === 'running'` and `now - (site.lastScanRequestedAt ?? 0) >= AUDIT_RUNNING_TIMEOUT_SECONDS` (600s):
     * Update D1: `lastRunStatus = 'failed'`.
     * Return `lastRunStatus: 'failed'`.

### B. D1 Query Batching in `GET /api/sites`

Replace the `allSites.map(async (site) => ...)` loop with constant 3 queries:
1. **Fetch Sites**:
   ```ts
   const allSites = await db.select().from(sites).all();
   ```
2. **Batch Alert Channels**:
   ```ts
   const allChannels = await db.select().from(alertChannels).all();
   // Group by siteId in JavaScript Map
   ```
3. **Batch Latest Runs**:
   Fetch latest runs using SQL window partitioning or targeted query filtering by active site IDs:
   ```sql
   SELECT * FROM (
     SELECT *, ROW_NUMBER() OVER (PARTITION BY site_id, strategy ORDER BY created_at DESC) as rn
     FROM audit_runs
   ) WHERE rn = 1;
   ```
   Or execute 2 batched queries for mobile and desktop runs across all site IDs.

### C. Composite Index Definition (`apps/api/src/db/schema.ts`)

Update `auditRuns` table indexes:
```ts
export const auditRuns = sqliteTable(
  'audit_runs',
  { /* columns */ },
  (table) => ({
    siteRunsIdx: index('idx_audit_runs_site_id').on(table.siteId, table.createdAt),
    siteStrategyRunsIdx: index('idx_audit_runs_lookup').on(table.siteId, table.strategy, table.createdAt),
  })
);
```

### D. Frontend State Machine (`apps/web/src/App.tsx`)

1. **Targeted Poller**:
   * Identify actively running sites:
     ```ts
     const activelyRunningSiteIds = sites
       .filter((s) => s.lastRunStatus === 'running' && getAuditCooldownStatus(s).reason === 'running')
       .map((s) => s.id);
     ```
   * Set 6-second timer to fetch `/api/sites/${id}/status` for each running ID.
2. **Completion Trigger**:
   * If status response returns `lastRunStatus !== 'running'`:
     * Execute a **single** `fetchSites()` call to load newly created audit run and scores.
     * Show toast notification.
     * Drop `id` from active polling.
3. **Safety Timeout**:
   * Stop polling automatically if cooldown reason is no longer `'running'` or elapsed > 600s.

---

## 5. Verification Plan

### Automated Backend Tests
* Add `apps/api/tests/site-status.test.ts`:
  1. `GET /api/sites/:id/status` returns correct schema and 200 OK.
  2. `GET /api/sites/:id/status` returns 404 for invalid ID.
  3. Stale running audit (>600s) triggers self-healing to `'failed'`.
  4. Batched `GET /api/sites` produces correct channel arrays and `latestRuns` without N+1 queries.

### Typecheck & Build
* Run `npm run check` or `tsc --noEmit` across all workspaces.
* Run `npm run build` in `apps/web`.
