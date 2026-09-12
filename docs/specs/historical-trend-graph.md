# Mantiscan — Historical Multi-Scan Trend Graph Specification
**Interactive Performance Progression & SLA Threshold Analysis**

---

## 1. Executive Summary & Purpose

This specification details the architecture, UX, and verification model for the **Historical Multi-Scan Trend Graph** in **Mantiscan**.
When a website is scanned multiple times (via scheduled cron audits or on-demand manual triggers), users need immediate visibility into performance trends:
1. **Trend & Regression Detection:** Visually identify whether site scores are climbing, degrading, or fluctuating across deployments.
2. **Threshold Red-Line Comparison:** Directly contrast historical scores against user-configured SLA thresholds (e.g. `perfThreshold: 90`).
3. **Deep-Dive Telemetry:** Provide high-level 0–100 category scores by default with on-demand toggling to raw Core Web Vitals metrics (LCP, CLS, INP).

---

## 2. Understanding Summary & Key Constraints

* **Zero External Dependencies:** Implemented as a pure, native SVG component (`SiteTrendChart.tsx`) in `apps/web`. Adds 0KB to the client bundle and avoids library incompatibilities or canvas/flexbox resize bugs.
* **Closed-Loop Data Integration:** Fully utilizes the existing `GET /api/sites/:id` endpoint which already supplies up to 50 audit runs with complete category scores and Core Web Vitals telemetry. No API or database schema migrations required.
* **Sequential Run Axis:** X-axis plots audits chronologically using equidistant run indices (left = older, right = newest) rather than a continuous calendar timeline. This prevents dot-clustering when multiple on-demand manual scans occur in rapid succession.
* **Strategy Alignment:** Automatically tracks the active `mobile` vs. `desktop` strategy selected in `SiteDetailModal`.
* **Dark Glassmorphism Aesthetic:** Leverages Mantiscan's design system tokens (`var(--accent-mantis)`, `var(--border-subtle)`, `var(--text-primary)`).
* **Non-Goals:**
  * No heavy canvas zoom/pan or brush interactions.
  * No multi-line clutter on dashboard overview cards (remains exclusive to the analytical deep-dive modal).

---

## 3. Decision Log

| ID | Decision | Alternatives Considered | Rationale |
|---|---|---|---|
| **D1** | **Metric & Scope** | Category Scores default + CWV toggle in `SiteDetailModal` | High-level Category Scores only; CWV only | Category scores provide instant SLA visibility, while CWV toggle offers engineering root-cause diagnostics. |
| **D2** | **X-Axis Strategy** | Sequential run-based axis (equally spaced points with date/trigger badges) | Strict calendar timeline; Date-aggregated daily medians | Calendar timeline clusters rapid on-demand scans into single points; sequential run axis keeps every audit individually inspectable. |
| **D3** | **Rendering Engine** | Zero-dependency native SVG component | Recharts (~150KB bundle); Chart.js (Canvas context) | Preserves $0 operational budget and 0KB bundle addition, guarantees theme harmony, and eliminates modal resize glitches. |
| **D4** | **Component Placement** | Dedicated `<SiteTrendChart />` in `SiteDetailModal` | Mini sparklines in metric cards; Dedicated standalone analytics route | Centralizes site telemetry in the modal without fragmenting navigation or cluttering high-level overview cards. |
| **D5** | **Series Toggle** | Category chips with Performance active by default | All 4 series always visible | Prevents visual noise while allowing users to inspect any combination of Performance, A11y, Best Practices, and SEO. |
| **D6** | **CWV Presentation** | Specific metric selector (LCP / CLS / INP) with Google benchmark line | Multi-axis normalized graph | Different units (seconds vs unitless vs milliseconds) distort multi-line charts; dedicated views provide crisp scale calibration. |
| **D7** | **Interactive Tooltip** | Score + Trigger Badge + Delta Indicator | Basic title attribute; Static legend | Gives immediate context on whether changes stemmed from scheduled runs or manual deploys, plus exact delta. |
| **D8** | **Single-Run State** | Single plotted point + helpful prompt | Hide chart until $\ge 2$ runs; Empty box | Informs the user that history tracking is active and prompts subsequent scans without layout jumps. |
| **D9** | **Verification Mode** | Closed-loop local build + fixture testing | Manual browser checking only | Satisfies Carmack principles: autonomous build validation, edge-case coverage, and zero user burden. |

---

## 4. Component Architecture & Data Flow

### A. Component Location & Interface
* **File:** [`apps/web/src/components/SiteTrendChart.tsx`](file:///Users/kebbbnnn/Projects/Studies/mantiscan/apps/web/src/components/SiteTrendChart.tsx)
* **Parent:** [`apps/web/src/components/SiteDetailModal.tsx`](file:///Users/kebbbnnn/Projects/Studies/mantiscan/apps/web/src/components/SiteDetailModal.tsx)

```typescript
interface SiteTrendChartProps {
  runs: AuditRun[];
  site: Site;
  strategy: DeviceStrategy;
}
```

### B. Coordinate System & SVG Dimensions
* **ViewBox:** `0 0 640 220` with `preserveAspectRatio="xMidYMid meet"` and responsive `width: 100%`.
* **Margins:**
  * Left: `40px` (Y-axis numerical labels: `100`, `75`, `50`, `25`, `0`)
  * Right: `20px` (Padding for the latest run dot)
  * Top: `24px` (Padding for high scores and labels)
  * Bottom: `32px` (X-axis audit date labels)
  * Plotting area: `580px × 164px`.

### C. Metric Mapping & Mathematical Normalization
1. **Category Scores (0–100 Scale):**
   * $Y_{\text{coord}} = Y_{\text{bottom}} - \left(\frac{\text{score}}{100} \times H_{\text{plot}}\right)$
   * $X_{\text{coord}} = X_{\text{left}} + \left(\frac{i}{N - 1} \times W_{\text{plot}}\right)$ (for $N > 1$)
2. **Threshold Red-Line:**
   * Horizontal dashed line rendered at $Y(site.perfThreshold)$ with label: `Threshold: ${site.perfThreshold}`.
3. **Core Web Vitals Metric Bands:**
   * **LCP:** 0s to 5.0s (Google Good Benchmark: $\le 2.5\text{s}$).
   * **CLS:** 0 to 0.5 (Google Good Benchmark: $\le 0.1$).
   * **INP:** 0ms to 500ms (Google Good Benchmark: $\le 200\text{ms}$).

### D. Hover Crosshair & Glassmorphic Tooltip
* Tracks mouse X position relative to SVG bounding box:
  * Snaps to nearest run index: $i = \operatorname{round}\left(\frac{X_{\text{rel}} - X_{\text{left}}}{W_{\text{plot}}} \times (N - 1)\right)$.
* Highlights:
  * Vertical dashed crosshair line at $X_i$.
  * Enlarged halo circle at active coordinates.
  * Floating card positioned above the coordinate with timestamp, trigger badge (`cron` vs `manual`), exact values, and run delta.

---

## 5. Edge Cases & Resiliency

1. **0 Runs:** Returns `null` (modal displays existing "No audits recorded yet" state).
2. **1 Run:** Plotted at center ($X = X_{\text{left}} + W_{\text{plot}} / 2$) with baseline grid and helper text:  
   *ℹ️ "1 scan recorded — run additional audits to plot trend lines."*
3. **Missing / Legacy Telemetry:** Incomplete metrics (e.g. `inpMs: null`) are skipped safely without generating `NaN` SVG path commands.
4. **Window Resizing:** Pure vector SVG scales fluidly from 320px mobile screens to 4K displays with zero layout thrashing.

---

## 6. Closed-Loop Verification Plan (Carmack Principles)

1. **Autonomous Compilation:**
   * Run `npm run build` in `apps/web` to verify strict TypeScript typing and Vite compilation.
2. **Mock & Edge Case Testing:**
   * Test with 0 runs, 1 run, and 10+ runs across Mobile and Desktop strategies.
   * Verify category chip toggles and CWV metric switching.
3. **UI / Visual Inspection:**
   * Run local dev server (`npm run dev`) and verify responsive SVG rendering, crosshair snapping, and tooltip accuracy.
