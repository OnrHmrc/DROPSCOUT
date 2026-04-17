# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DropScout TR is an AI-powered product discovery and decision support platform for Turkish dropshipping. The UI is entirely in Turkish. It helps users evaluate products by scoring them (DropScore), tracking trends, analyzing competitors, checking legal compliance, and finding suppliers.

## Commands

```bash
npm run dev      # Start Vite dev server (opens dropscout.html)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

Deploy to Firebase Hosting (project: `dropscoutapp`):
```bash
npm run build && firebase deploy
```

## Architecture

**Multi-page app (MPA)** built with Vite. Each page is a standalone HTML file with its own inline `<style>` and `<script>` blocks. Vite bundles all pages listed in `vite.config.js` `rollupOptions.input`.

### Pages (all top-level HTML files)
- `dropscout.html` — Main dashboard shell (also acts as SPA shell via injected router)
- `trend-radar.html` — Trend analysis
- `gap-radar.html` — Market gap detection
- `net-kar.html` — Net profit calculator
- `rakip-analizi.html` — Competitor analysis
- `takip-listem.html` — Watchlist
- `yasal-kontrol.html` — Legal compliance checker
- `tedarikci-bul.html` — Supplier finder
- `raporlar.html` — Reports
- `trendyol.html` — Trendyol store API connection & commission/KDV data
- `hepsiburada.html` — Hepsiburada store API connection & commission/KDV data
- `amazon-tr.html` — Amazon TR SP-API connection & referral fee data
- `n11.html` — N11 store API connection & commission/KDV data

### Shared modules (`src/`)
- `src/js/main.js` — Entry point loaded by every page via `<script type="module">`. Initializes theme and sidebar.
- `src/js/theme.js` — Dark/light/system theme toggle. Persists to `localStorage` key `dropscout-theme-preference`.
- `src/js/sidebar.js` — Mobile-responsive sidebar open/close logic.
- `src/css/` — Shared CSS split into `variables.css`, `sidebar.css`, `theme-toggle.css`, `topbar.css`, `components.css`, `responsive.css`, aggregated by `main.css`.

### Data layer
- `data/products.json` — Product catalog (mock data). Each product has: `id`, `name`, `score`, `trend7d`, `margin`, `status`, `note`, `trendDaily[]`, `docTime`, `competitors`.
- `data/email-settings.json` — Notification settings (mock).
- `app.js` — Dashboard logic for `dropscout.html`: fetches JSON data, renders product table, watchlist, KPIs, alerts, email settings form. Falls back to hardcoded `fallbackProducts` if fetch fails.

### Platform integration
Each platform page (`trendyol.html`, `hepsiburada.html`, `amazon-tr.html`, `n11.html`) follows the same pattern:
- API credentials form with platform-specific fields (Supplier ID, Merchant ID, SP-API tokens, etc.)
- Connection state persisted to `localStorage` key `dropscout-platform-{platform}`
- Mock store data with category-based commission rates and KDV values
- Sync history log and KPI dashboard

### Product status values
`Serbest` (free to sell), `Belge Gerekli` (document required), `Yasak` (prohibited), `Belirsiz` (uncertain).

### Build scripts (Node, not part of the app)
- `inject_router.js` — Injects SPA client-side router into `dropscout.html` before `</body>`. The router intercepts sidebar nav clicks and loads page content via `fetch` + `DOMParser`, pushing to `history`.
- `inject_js.js` — Injects link analysis slot-machine effect and LED glow CSS into `dropscout.html`.

These are one-shot scripts (`node inject_router.js`), not part of the Vite build pipeline.

## Key Conventions

- No framework — vanilla JS with direct DOM manipulation.
- Page-specific styles and scripts are inline within each HTML file, not in external files.
- Shared functionality (theme, sidebar, CSS variables) lives in `src/` and is imported as ES modules.
- The app uses CSS custom properties (`--bg`, `--ink`, `--panel`, etc.) for theming; dark mode is applied via `[data-theme="dark"]` selectors.
- Font: Inter / Poppins / Geist Mono loaded from Google Fonts CDN.
