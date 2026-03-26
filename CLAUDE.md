# Qlik Test Integration — Project Context

## What This Is
PoC/demo of AI + BI integration for 12 STOREEZ (fashion retail, RU). Simulates their weekly MCR (Management Council Report, 71-slide PPTX) in Qlik Cloud trial via custom MCP server + programmatic dashboards.

## Qlik Cloud Trial
- Tenant: https://x2bsmja3t4khq5z.us.qlikcloud.com
- App: `f22efcef-19e1-4d0e-9cf3-70b740eeec80` ("Sales Demo")
- 30-day trial (registered 2026-03-24), Premium tier
- Official MCP server NOT available on trial — built custom MCP instead

## Custom MCP Server
- `src/` — TypeScript MCP server, 57 tools (REST + QIX WebSocket)
- Configured in `.mcp.json`, env vars: QLIK_TENANT_URL, QLIK_API_KEY
- Visualization types that work on trial: `kpi`, `barchart`, `sn-table`
- NOT available: `sn-bar-chart`, `sn-pie-chart`, `piechart` — use `barchart` with chart properties instead

## Data Model (2M rows, 18 tables)
- 8 dims: date (397d), product (300 SKU), store (27), channel (5), client (5000), country (6), warehouse (8), stylist (16)
- 10 facts: sales (1.7M), stock (250K), traffic (10.7K), csi (2.6K), cashflow (342), marketing (2.6K), hr (10K), supply_chain (3.2K), gift_cert (5K), budget (570)
- Generated via `scripts/generate-data.js` (Autogenerate in Qlik load script)
- fact_sales has UnitCost (= UnitPrice × 22-30%) for COGS/GM% — tied to sale, not product
- Season-weighted ProductID: 60% current season, 40% random
- fact_budget: 10 metrics × 57 weeks with target values

## Dashboards (12 sheets, 52 visualizations)
Created via `scripts/create-dashboards.js`, fixed via `scripts/fix-objects.js`
- 74 master measures, 26 master dimensions
- Number formatting applied: % as %, money with separators, integers
- WoW% columns added to key tables
- Sheets: Executive Summary, Product by Strategic Category, Product by Seasons, KPIs Retail, KPIs ECOM, Client Segments RU, KPIs CSI, Finance Cash Flow, Supply Chain & HR, Brand Marketing, F&F & Stylists, Gift Certificates

## AI Synthesis Pipeline
- `scripts/generate-synthesis.js` — reads all KPIs via QIX Engine, outputs MCR-style text report
- Sections: Executive Summary, Sales by Channel, Strategic Categories, Season Mix, Client Segments, Alerts
- Alerts auto-detect: VERME < 85%, Returns > 8.6%, GM% < 74%, CSI < 85, F&F Engagement < 30%

## 12 STOREEZ Real Business Context
- 45 stores (39 regular + 6 outlets): Moscow, SPB, Regions RU, KZ, UAE, UZ
- F&F (VIC) program: 3,429 clients, 16 stylists, +28% sales uplift
- Key problem areas (W04 Jan 2025): VERME coverage 57% (target 85%), F&F engagement 15% (target 30%), returns 8.6%, marketing ER below targets
- Gift certificates: +263% YoY, 68% ECOM

## Client (Lika) Preferences
- Uses Claude personally, prefers it over GPT for numbers
- Skeptical of vendor buzzwords — wants accuracy and human collaboration
- Only she and Ivan use AI among directors

## Gaps vs Real MCR
- VERME Coverage/Occupation: ✅ implemented (PlannedShifts, Overcoverage, Demand in fact_hr)
- F&F Engagement%: ✅ implemented (StylistID linkage, engagement formula)
- Gift Certificates: ✅ implemented (fact_gift_cert table)
- Marketing ER granular: ✅ implemented (Views, Reactions, Followers, Comments, Likes)
- F&F Stylist Performance: ✅ implemented (dim_stylist, StylistName dimension)
- Budget/Targets: ✅ implemented (fact_budget, 10 metrics)
