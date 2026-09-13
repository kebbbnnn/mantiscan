# 🛡️ Mantiscan

**Automated Lighthouse CI Auditing & Alerting SaaS ($0 Budget)**

Mantiscan monitors client and production websites, running weekly automated Google Lighthouse CI audits across **Mobile** and **Desktop** viewports using headless Chrome in **GitHub Actions**, and dispatching rich alerts to **Slack** and **Discord** whenever scores fall below configured thresholds or suffer regressions.

---

## 🌟 Architecture Highlights

* **Web Dashboard (`apps/web`):** Modern React + Vite SPA on Cloudflare Pages featuring dark mode, glassmorphism, animated SVG radial score dials, and Core Web Vitals breakdowns.
* **API Backend (`apps/api`):** Ultra-fast Hono TypeScript service on Cloudflare Workers bound to serverless SQLite (Cloudflare D1).
* **Headless Browser Runner (`.github/workflows/audit.yml`):** Runs official Google Lighthouse CI (`@lhci/cli`) on GitHub Actions with multi-run median scores (3 runs per URL) to eliminate cloud CPU jitter.
* **1-Click Interactive Reports:** Viewport-isolated median HTML reports hosted on Google Cloud Storage (`@lhci/cli upload --target=temporary-public-storage`) for zero credit cards, zero extra infrastructure, and instant 1-click diagnostics from Slack, Discord, and dashboard.
* **Smart Alerting Engine:** State-transition notifications (`Healthy ➔ Degraded`, `Degraded ➔ Healthy`) plus regression delta drop detection ($\ge 10$ points). Suppresses repetitive failure spam.
* **$0 Operational Cost:** Engineered entirely within high-capacity, permanent free tiers (Cloudflare Pages/Workers/D1, GitHub Actions, Slack/Discord webhooks, Google temporary public storage).

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

### 4. Configure Local Secrets
Copy the template and add your secrets to `apps/api/.dev.vars` (this file is gitignored):
```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

### 5. Start the Application Locally
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

## 🔐 Secrets & Environment Configuration

Mantiscan enforces strict security boundaries between public configuration and private credentials:

### 1. Local Secrets (`apps/api/.dev.vars`)
During local development (`npm run dev:api`), Cloudflare Wrangler automatically loads secrets from `apps/api/.dev.vars`. **This file is strictly gitignored and must never be committed to Git.**

Create `apps/api/.dev.vars`:
```bash
# GitHub PAT with "Actions: Read & Write" permission (used by "Scan Now" button)
GITHUB_TOKEN="ghp_your_personal_access_token"

# Shared secret used to authenticate the callback from GitHub Actions
INGEST_SECRET="your_secure_random_token_here"
```

### 2. Public Variables (`apps/api/wrangler.toml`)
Non-sensitive configuration is kept in `wrangler.toml` and safely committed to Git:
```toml
[vars]
APP_ENV = "development"
GITHUB_OWNER = "kebbbnnn"     # Your GitHub username or organization
GITHUB_REPO = "mantiscan"      # Your repository name
```

### 3. GitHub Repository Secrets
When GitHub Actions finishes auditing a site, it posts the scores back to your Mantiscan API. It needs to authenticate with `INGEST_SECRET`:
1. In your GitHub repository, go to **Settings ➔ Secrets and variables ➔ Actions ➔ New repository secret**.
2. **Name:** `INGEST_SECRET`
3. **Secret:** Same value as `INGEST_SECRET` in your `.dev.vars` / Cloudflare Worker.

### 4. Generating the GitHub Personal Access Token (PAT)
To enable the **"Scan Now"** button on the dashboard to trigger GitHub Actions:
1. Go to GitHub: **Settings ➔ Developer Settings ➔ Personal access tokens ➔ Fine-grained tokens** (or Tokens Classic).
2. Set repository access to **`kebbbnnn/mantiscan`**.
3. Under **Repository permissions**, select:
   * **Actions:** `Read and write`
4. Copy the generated token into `apps/api/.dev.vars` as `GITHUB_TOKEN`.

### 5. Production Cloudflare Workers Secrets (When Deploying)
When you deploy to Cloudflare (`npx wrangler deploy`), upload your secrets encrypted directly to Cloudflare:
```bash
npx wrangler secret put INGEST_SECRET
npx wrangler secret put GITHUB_TOKEN
```

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

## ⚙️ GitHub Actions Workflow Triggers

* **Weekly Cron:** Runs automatically every Monday at 00:00 UTC.
* **On-Demand UI:** Click **Actions ➔ Lighthouse Audit Runner ➔ Run workflow** in the GitHub web interface.
* **Dashboard API Dispatch:** Triggered programmatically by clicking **"Scan Now"** on any site in the Mantiscan dashboard.

---

## 📂 Project Structure

```
mantiscan/
├── .github/
│   └── workflows/
│       └── audit.yml          # GitHub Actions headless Chrome runner
├── apps/
│   ├── api/                   # Cloudflare Worker (Hono REST API & Cron)
│   │   ├── migrations/        # D1 SQLite schema migrations
│   │   ├── src/
│   │   │   ├── db/            # Drizzle ORM schema (sites, audit_runs, channels)
│   │   │   ├── routes/        # /api/sites, /api/webhooks/audit-result
│   │   │   └── services/      # Alert state engine, Slack/Discord dispatchers
│   │   ├── .dev.vars.example  # Template for local secrets
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
├── DESIGN.md                  # Complete system architecture specification
└── README.md                  # Setup guide and operations documentation
```
