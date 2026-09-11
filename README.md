# 🛡️ Mantiscan

**Automated Lighthouse CI Auditing & Alerting SaaS ($0 Budget)**

Mantiscan monitors client and production websites, running weekly automated Google Lighthouse CI audits across **Mobile** and **Desktop** viewports using headless Chrome in **GitHub Actions**, and dispatching rich alerts to **Slack** and **Discord** whenever scores fall below configured thresholds or suffer regressions.

---

## 🌟 Architecture Highlights

* **Web Dashboard (`apps/web`):** Modern React + Vite SPA on Cloudflare Pages featuring dark mode, glassmorphism, animated SVG radial score dials, and Core Web Vitals breakdowns.
* **API Backend (`apps/api`):** Ultra-fast Hono TypeScript service on Cloudflare Workers bound to serverless SQLite (Cloudflare D1).
* **Headless Browser Runner (`.github/workflows/audit.yml`):** Runs official Google Lighthouse CI (`@lhci/cli`) on GitHub Actions with multi-run median scores (3 runs per URL) to eliminate cloud CPU jitter.
* **Smart Alerting Engine:** State-transition notifications (`Healthy ➔ Degraded`, `Degraded ➔ Healthy`) plus regression delta drop detection ($\ge 10$ points). Suppresses repetitive failure spam.
* **$0 Operational Cost:** Engineered entirely within high-capacity, permanent free tiers (Cloudflare Pages/Workers/D1, GitHub Actions, Slack/Discord webhooks).

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local SQLite Migrations
Initialize the local Cloudflare D1 database:
```bash
npm run db:migrate:local --workspace=apps/api
```

### 3. Run Automated Tests
Execute the Vitest suite:
```bash
npm test
```

### 4. Start the Application Locally
Run the Hono API:
```bash
npm run dev:api
```
In a second terminal, run the React web dashboard:
```bash
npm run dev:web
```
Open **`http://localhost:5173`** in your browser!

---

## 🧪 Carmack Closed-Loop Local Audit Simulation

You can test the entire audit ingestion and Slack/Discord alerting pipeline locally without waiting for GitHub Actions:

1. Add a website in the dashboard (e.g. at `http://localhost:5173`). Note its Site ID (e.g. `site_12345678`).
2. Run the local simulation script:
```bash
# Simulates a passing audit (e.g. Perf 95, A11y 95)
node scripts/run-audit-local.js --siteId=YOUR_SITE_ID --perf=95 --a11y=95

# Simulates a failing audit (e.g. Perf 65, triggers Slack alert)
node scripts/run-audit-local.js --siteId=YOUR_SITE_ID --perf=65 --a11y=80
```
Watch the dashboard update its status badges and score dials in real time!

---

## ⚙️ GitHub Actions Workflow Setup

When pushing this repository to GitHub:

### Required Secrets (in GitHub Repo Settings ➔ Secrets & Variables ➔ Actions)
* **`INGEST_SECRET`**: A shared secret token matching the `INGEST_SECRET` in your Cloudflare Worker `wrangler.toml` (used to authenticate callback payloads).

### Workflow Triggers
* **Weekly Cron:** Runs automatically every Monday at 00:00 UTC.
* **On-Demand:** Click **Actions ➔ Run workflow** in the GitHub UI, input the Site ID and URL, and run immediately.
* **API Dispatch:** Triggered programmatically by the Mantiscan dashboard "Scan Now" button.

---

## 📂 Project Structure

```
mantiscan/
├── .github/
│   └── workflows/
│       └── audit.yml          # GitHub Actions headless Chrome runner
├── apps/
│   ├── api/                   # Cloudflare Worker (Hono REST API & Cron)
│   │   ├── src/
│   │   │   ├── db/            # Drizzle ORM schema (sites, audit_runs, channels)
│   │   │   ├── routes/        # /api/sites, /api/webhooks/audit-result
│   │   │   └── services/      # Alert state engine, Slack/Discord dispatchers
│   │   └── wrangler.toml      # D1 bindings & Cron triggers
│   └── web/                   # Cloudflare Pages (React + Vite SPA)
│       ├── src/
│       │   ├── components/    # ScoreGauge, SiteCard, AddSiteModal, DetailModal
│       │   └── App.tsx        # Dashboard state & polling
│       └── vite.config.ts     # Proxy to API
├── packages/
│   └── shared/                # Shared TypeScript types, schemas & thresholds
├── scripts/
│   ├── post-results.js        # GHA callback script posting results to API
│   └── run-audit-local.js     # Closed-loop local test simulator
├── lighthouserc.mobile.js     # LHCI mobile configuration (throttled 4G)
├── lighthouserc.desktop.js    # LHCI desktop configuration
└── package.json               # Root npm workspaces
```
