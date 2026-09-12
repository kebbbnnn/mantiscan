# Mantiscan — Database Cascade Deletion Integrity in D1 Specification
**Automated Verification and Relational Integrity for Site Deletions**

---

## 1. Executive Summary & Purpose

This specification defines the data integrity architecture, schema definitions, and automated verification suite for cascading deletions in **Mantiscan**.
When a user deletes a monitored site, the system must guarantee that:
1. All associated child records (`audit_runs`, `alert_channels`, and `alert_logs`) are atomically removed from Cloudflare D1.
2. No orphaned diagnostic logs, historical scores, or sensitive webhook endpoints remain in storage.
3. Automated integration tests continuously verify cascade integrity in CI under native Cloudflare D1 conditions without mocking.

---

## 2. Understanding Summary & Key Constraints

* **Engine-Level Foreign Key Enforcement:**
  * Unlike standalone SQLite (which defaults `foreign_keys = OFF`), Cloudflare D1 enforces foreign keys (`PRAGMA foreign_keys = ON`) across all transactions and migrations by default.
  * Mantiscan relies on declarative SQLite engine constraints (`ON DELETE CASCADE`) to achieve atomic, sub-millisecond deletion without multi-step procedural application code (`KISS`).
* **Relational Schema Typing:**
  * Drizzle ORM schema definitions in `apps/api/src/db/schema.ts` must completely mirror database foreign key relations, including linking `alert_logs.run_id` to `audit_runs.id` with `onDelete: 'set null'`.
* **Zero-Mock Verification:**
  * Integration tests must execute against real in-memory Cloudflare D1 instances provided by `miniflare` (already bundled in the project via Wrangler), validating end-to-end Hono HTTP requests and raw D1 storage state.
* **Non-Goals:**
  * We are **not** replacing D1's native SQLite cascade with custom application-level batch deletions (`db.batch`).
  * We are **not** implementing Cloudflare R2 object garbage collection in this database-focused task.

---

## 3. Decision Log

| ID | Decision | Alternatives Considered | Rationale |
|---|---|---|---|
| **D1** | **Rely on D1 Native Engine Cascade** | Procedural Batch Deletion (`db.batch`) | D1 natively enforces SQLite foreign keys. Native cascade is faster, atomic, and avoids code drift when new child tables are added. |
| **D2** | **Add `onDelete: 'set null'` to `alert_logs.runId` in Drizzle Schema** | Full table re-creation migration in SQLite | Retains alert history if an audit run is individually pruned, and formalizes relations in Drizzle without dangerous live table rebuilds in D1. |
| **D3** | **Single-Target Delete in `DELETE /api/sites/:id`** | Multi-table procedural delete loop | Keeps API routing logic clean and delegates relational consistency to the database engine. |
| **D4** | **Miniflare In-Memory D1 Integration Suite** | Mocking D1 / using external SQLite drivers | Validates real Cloudflare Worker + D1 runtime semantics with zero extra npm dependencies. |

---

## 4. Architecture & Schema Design

### A. Entity Relationship Hierarchy
```
               ┌────────────────┐
               │     sites      │
               └───────┬────────┘
                       │ 1:N (ON DELETE CASCADE)
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌──────────────┐┌──────────────┐┌──────────────┐
│  audit_runs  ││alert_channels││  alert_logs  │
└──────┬───────┘└──────────────┘└──────┬───────┘
       │ 1:N (ON DELETE SET NULL)      │
       └───────────────────────────────┘
```

### B. Schema Definitions (`apps/api/src/db/schema.ts`)
```typescript
export const sites = sqliteTable('sites', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  // ... thresholds and schedule columns
});

export const auditRuns = sqliteTable('audit_runs', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  // ... scores, metrics, strategy
});

export const alertChannels = sqliteTable('alert_channels', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  // ... type, webhookUrl, isActive
});

export const alertLogs = sqliteTable('alert_logs', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  runId: text('run_id').references(() => auditRuns.id, { onDelete: 'set null' }),
  alertType: text('alert_type').notNull(),
  payloadSummary: text('payload_summary'),
  dispatchedAt: integer('dispatched_at').notNull(),
});
```

### C. API Route Handler (`apps/api/src/routes/sites.ts`)
```typescript
sitesRouter.delete('/:id', async (c) => {
  const siteId = c.req.param('id');
  const db = drizzle(c.env.DB);

  const site = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) {
    return c.json({ error: 'Site not found' }, 404);
  }

  await db.delete(sites).where(eq(sites.id, siteId)).run();
  return c.json({ message: 'Site deleted successfully' });
});
```

---

## 5. Automated Verification & Testing Strategy

### Integration Test Suite (`apps/api/tests/db-cascade.test.ts`)
The test runs in Vitest using Miniflare's isolated D1 database:

1. **Setup (`beforeAll`)**:
   - Initialize Miniflare with D1 binding.
   - Execute migrations (`0001_initial.sql` and `0002_add_audit_schedule.sql`).
2. **Scenario 1: End-to-End Deletion Cascade**:
   - Insert parent site: `site_parent`.
   - Insert 3 `audit_runs`, 2 `alert_channels`, and 2 `alert_logs` for `site_parent`.
   - Issue `app.request('DELETE /api/sites/site_parent')`.
   - Assert response status is `200 OK`.
   - Direct query to D1 verifies `count(*) === 0` across all 4 tables for `site_parent`.
3. **Scenario 2: Cross-Site Isolation**:
   - Seed `site_1` and `site_2`, each with associated child runs.
   - Delete `site_1`.
   - Assert `site_1` and its child runs are removed; assert `site_2` and its child runs remain completely untouched.
4. **Scenario 3: Non-Existent ID**:
   - Issue `app.request('DELETE /api/sites/does_not_exist')`.
   - Assert response status is `404 Not Found`.
