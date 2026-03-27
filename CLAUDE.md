# Qlik Test Integration — Project Context

## What This Is
PoC/demo of AI + BI integration for 12 STOREEZ (fashion retail, RU). Simulates their weekly MCR (Management Council Report, 71-slide PPTX) in Qlik Cloud trial via custom MCP server + programmatic dashboards.

## Qlik Cloud Trial
- Tenant: https://x2bsmja3t4khq5z.us.qlikcloud.com
- App: `f22efcef-19e1-4d0e-9cf3-70b740eeec80` ("Sales Demo")
- 30-day trial (registered 2026-03-24), Premium tier
- Official MCP server NOT available on trial — built custom MCP instead

## Custom MCP Server
- `src/` — TypeScript MCP server, 60 tools (REST + QIX WebSocket)
- Configured in `.mcp.json`, env vars: QLIK_TENANT_URL, QLIK_API_KEY
- Visualization types that work on trial: `kpi`, `barchart`, `sn-table`
- NOT available: `sn-bar-chart`, `sn-pie-chart`, `piechart` — use `barchart` with chart properties instead

## How to Use MCP Tools (READ THIS FIRST)

### Setup
1. Copy `.mcp.json.example` → `.mcp.json`
2. Set `QLIK_TENANT_URL` and `QLIK_API_KEY` in `.mcp.json`
3. `npm install && npm run build`
4. Restart Claude Code — tools appear as `mcp__qlik-cloud__qlik_*`

### App ID
All tools that touch app data require `appId`. The demo app:
```
f22efcef-19e1-4d0e-9cf3-70b740eeec80
```

### Critical: Filtering Rules

**ALWAYS filter by `StoreID`, NEVER by `StoreName` or `ChannelName`.**

Qlik's associative model links dim_store to multiple fact tables via StoreID. Filtering by text fields (StoreName, ChannelName, ChannelType) causes fan-out through Date associations and returns wrong numbers. StoreID is the only reliable filter.

Store ID ranges:
- **Retail**: StoreID 1-23 → `{<StoreID={"<24"}>}`
- **ECOM RU**: StoreID 24 → `{<StoreID={24}>}`
- **Lamoda**: StoreID 25 → `{<StoreID={25}>}`
- **Ounass**: StoreID 26 → `{<StoreID={26}>}`
- **Shopify**: StoreID 27 → `{<StoreID={27}>}`
- **All ECOM**: StoreID 24-27 → `{<StoreID={">=24"}>}`

**ALWAYS exclude returns in sales metrics:**
```
{<IsReturn={0}>}
```
Combine with store filter: `{<IsReturn={0},StoreID={"<24"}>}`

### Key Formulas (Qlik Expression Language)

```
Net Sales     = Sum({<IsReturn={0}>} NetAmount)
GM%           = 1 - Sum({<IsReturn={0}>} Qty*UnitCost) / Sum({<IsReturn={0}>} NetAmount)
Transactions  = Count(DISTINCT {<IsReturn={0}>} TransactionID)
UPT           = Sum({<IsReturn={0}>} Qty) / Count(DISTINCT {<IsReturn={0}>} TransactionID)
AUP           = Sum({<IsReturn={0}>} NetAmount) / Sum({<IsReturn={0}>} Qty)
AOV           = Sum({<IsReturn={0}>} NetAmount) / Count(DISTINCT {<IsReturn={0}>} TransactionID)
CR% (retail)  = Count(DISTINCT {<IsReturn={0},StoreID={"<24"}>} TransactionID) / Sum({<StoreID={"<24"}>} Visitors)
CR% (ecom)    = Count(DISTINCT {<IsReturn={0},StoreID={">=24"}>} TransactionID) / Sum({<StoreID={">=24"}>} Sessions)
Returns%      = Sum({<IsReturn={1}>} Qty) / Sum(Qty)
VERME Cov%    = Sum(PlannedShifts - Overcoverage) / Sum(Demand)
NWC           = Sum(AccountsReceivable) + Sum(InventoryValue) - Sum(AccountsPayable)
```

### Which Tool to Use

| Task | Tool | Notes |
|------|------|-------|
| Single KPI value | `qlik_evaluate_expression` | Fastest. `expression: "Sum(NetAmount)"` |
| Table with dims + measures | `qlik_create_data_object` | For breakdowns. Pass `dimensions` + `measures` arrays |
| List of field values | `qlik_get_field_values` | e.g. all store names, all seasons |
| Filter data then query | `qlik_select_values` → `qlik_create_data_object` → `qlik_clear_selections` | Apply filter, query, clean up |
| List apps/sheets | `qlik_list_apps`, `qlik_list_sheets` | Discovery |
| Trigger data refresh | `qlik_trigger_reload` | Reloads app data from load script |

### Data Model Gotchas
- `Date` field links ALL fact tables — selecting a date filters everything. Use set analysis to isolate: `{<Date={">=2025-01-20<=2025-01-26"}>}`
- `TransactionID` is random-assigned (Floor(Rand()*680000)), not sequential — don't assume order
- `ClientID` is NULL for ~15% of sales (walk-in unidentified) — use `{<IsReturn={0}>}` not `{<ClientID={"*"}>}` to count sales
- `UnitCost` is in fact_sales (per-sale cost), `ProductUnitCost` is in dim_product (per-product average) — use fact_sales.UnitCost for GM%
- `CSIScore` is on 0-100 scale (synthetic), real 12 STOREEZ uses 1-5 scale
- Monetary values are synthetic (~400x larger than real). Structure and ratios are realistic, absolute numbers are not

## Data Model (2M rows, 18 tables)
- 8 dims: date (397d), product (300 SKU), store (27), channel (5), client (5000), country (6), warehouse (8), stylist (16)
- 10 facts: sales (1.7M), stock (250K), traffic (10.7K), csi (2.6K), cashflow (342), marketing (2.6K), hr (10K), supply_chain (3.2K), gift_cert (5K), budget (570)
- Generated via `scripts/generate-data.js` (Autogenerate in Qlik load script)
- fact_sales has UnitCost (= UnitPrice × 22-30%) for COGS/GM% — tied to sale, not product
- Season-weighted ProductID: 60% current season, 40% random
- fact_budget: 10 metrics × 57 weeks with target values

## Dashboards (6 sheets)
Created via `scripts/create-dashboards.js`, fixed via `scripts/fix-objects.js`
- 74 master measures, 26 master dimensions
- Number formatting applied: % as %, money with separators, integers
- WoW% columns added to key tables
- Sheets: Executive Summary, Product by Seasons, KPIs Retail, KPIs ECOM, Client Segments RU, Finance Cash Flow

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
