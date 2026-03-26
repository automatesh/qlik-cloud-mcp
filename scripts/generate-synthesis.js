/**
 * AI Synthesis Pipeline
 * Reads all dashboard KPIs via QIX Engine → outputs structured MCR-style text.
 * Designed to be called by Claude via MCP or standalone.
 */

const WebSocket = require("ws");

const TENANT = "x2bsmja3t4khq5z.us.qlikcloud.com";
const APP_ID = "f22efcef-19e1-4d0e-9cf3-70b740eeec80";
const API_KEY = process.env.QLIK_API_KEY;

let ws, reqId = 0;
const pending = new Map();
function send(h, m, p = []) {
  return new Promise((res, rej) => {
    const id = ++reqId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle: h, method: m, params: p }));
  });
}

async function evalExpr(h, expr) {
  const r = await send(h, "EvaluateEx", [expr]);
  return r.qValue;
}

async function queryHypercube(h, dims, measures, limit = 20) {
  const obj = await send(h, "CreateSessionObject", [{
    qInfo: { qType: "hc" },
    qHyperCubeDef: {
      qDimensions: dims.map(d => ({ qDef: { qFieldDefs: [d], qSortCriterias: [{ qSortByNumeric: -1 }] } })),
      qMeasures: measures.map(m => ({ qDef: { qDef: m.expr, qLabel: m.label } })),
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: dims.length + measures.length, qHeight: limit }],
    },
  }]);
  const layout = await send(obj.qReturn.qHandle, "GetLayout", []);
  const hc = layout.qLayout.qHyperCube;
  const rows = (hc.qDataPages[0]?.qMatrix || []).map(row =>
    row.map(cell => ({ text: cell.qText, num: cell.qNum }))
  );
  const totals = (hc.qGrandTotalRow || []).map(cell => ({ text: cell.qText, num: cell.qNum }));
  return { rows, totals, dimInfo: hc.qDimensionInfo, measInfo: hc.qMeasureInfo };
}

function fmtNum(n) { return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }); }
function fmtPct(n) { return (n * 100).toFixed(1) + "%"; }
function fmtMoney(n) {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toFixed(0);
}
function delta(curr, prev) {
  if (!prev || prev === 0) return "n/a";
  const d = (curr - prev) / Math.abs(prev);
  return (d >= 0 ? "+" : "") + fmtPct(d);
}

async function main() {
  ws = new WebSocket(`wss://${TENANT}/app/${APP_ID}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  ws.on("message", (d) => {
    const msg = JSON.parse(d.toString());
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); }
  });
  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
  const doc = await send(-1, "OpenDoc", [APP_ID]);
  const h = doc.qReturn.qHandle;

  const NR = "{<IsReturn={0}>}";
  const CW = `{<IsReturn={0},Date={">=$(=Date(Max(Date)-6,'YYYY-MM-DD'))<==$(=Date(Max(Date),'YYYY-MM-DD'))"}>}`;
  const PW = `{<IsReturn={0},Date={">=$(=Date(Max(Date)-13,'YYYY-MM-DD'))<==$(=Date(Max(Date)-7,'YYYY-MM-DD'))"}>}`;

  // ═══ SECTION 1: Executive Summary ═══
  const salesCW = (await evalExpr(h, `Sum(${CW} NetAmount)`)).qNumber;
  const salesPW = (await evalExpr(h, `Sum(${PW} NetAmount)`)).qNumber;
  const salesTotal = (await evalExpr(h, `Sum(${NR} NetAmount)`)).qNumber;
  const gm = (await evalExpr(h, `1 - Sum(${NR} Qty*UnitCost)/Sum(${NR} NetAmount)`)).qNumber;
  const csi = (await evalExpr(h, `Avg(CSIScore)`)).qNumber;
  const verme = (await evalExpr(h, `Sum(PlannedShifts - Overcoverage) / Sum(Demand)`)).qNumber;
  const returns = (await evalExpr(h, `Sum({<IsReturn={1}>} Qty)/Sum(Qty)`)).qNumber;
  const stockRRP = (await evalExpr(h, `Sum(StockValueRRP)`)).qNumber;

  console.log("═══════════════════════════════════════════════");
  console.log("  MCR SYNTHESIS — WEEK " + (await evalExpr(h, "Max(WeekNum)")).qText);
  console.log("═══════════════════════════════════════════════");
  console.log("");
  console.log("1. EXECUTIVE SUMMARY");
  console.log("─────────────────────");
  console.log(`  Net Sales CW:     ${fmtMoney(salesCW)}  (WoW: ${delta(salesCW, salesPW)})`);
  console.log(`  GM%:              ${fmtPct(gm)}  (target: 74.0%)`);
  console.log(`  CSI:              ${csi.toFixed(1)}  (target: 85.0)`);
  console.log(`  VERME Coverage:   ${fmtPct(verme)}  (target: 85.0%) ${verme < 0.85 ? "⚠ BELOW TARGET" : "✓"}`);
  console.log(`  Returns%:         ${fmtPct(returns)}  (budget: 8.6%) ${returns > 0.086 ? "⚠ ABOVE BUDGET" : "✓"}`);
  console.log(`  Stock RRP:        ${fmtMoney(stockRRP)}`);

  // ═══ SECTION 2: Channel Performance ═══
  const channels = await queryHypercube(h, ["ChannelName"], [
    { expr: `Sum(${NR} NetAmount)`, label: "Sales" },
    { expr: `1 - Sum(${NR} Qty*UnitCost)/Sum(${NR} NetAmount)`, label: "GM%" },
    { expr: `Count(DISTINCT ${NR} TransactionID)`, label: "Tx" },
  ]);

  console.log("\n2. SALES BY CHANNEL");
  console.log("─────────────────────");
  for (const row of channels.rows) {
    console.log(`  ${row[0].text.padEnd(12)} Sales: ${fmtMoney(row[1].num).padStart(8)}  GM%: ${fmtPct(row[2].num).padStart(6)}  Tx: ${fmtNum(row[3].num).padStart(8)}`);
  }

  // ═══ SECTION 3: Top/Bottom Categories ═══
  const cats = await queryHypercube(h, ["StrategicCategory"], [
    { expr: `Sum(${NR} NetAmount)`, label: "Sales" },
    { expr: `1 - Sum(${NR} Qty*UnitCost)/Sum(${NR} NetAmount)`, label: "GM%" },
  ]);
  const sorted = [...cats.rows].sort((a, b) => b[2].num - a[2].num);

  console.log("\n3. STRATEGIC CATEGORIES (by GM%)");
  console.log("─────────────────────");
  for (const row of sorted) {
    const tag = row[2].num >= 0.74 ? "✓" : row[2].num >= 0.70 ? "~" : "⚠";
    console.log(`  ${tag} ${row[0].text.padEnd(14)} Sales: ${fmtMoney(row[1].num).padStart(8)}  GM%: ${fmtPct(row[2].num)}`);
  }

  // ═══ SECTION 4: Season Mix ═══
  const seasons = await queryHypercube(h, ["Season"], [
    { expr: `Sum(${NR} NetAmount)/Sum(TOTAL ${NR} NetAmount)`, label: "SalesShare" },
    { expr: `Sum(StockValueRRP)/Sum(TOTAL StockValueRRP)`, label: "StockShare" },
  ]);

  console.log("\n4. SEASON MIX");
  console.log("─────────────────────");
  for (const row of seasons.rows) {
    const salesSh = row[1].num;
    const stockSh = row[2].num;
    const gap = salesSh - stockSh;
    console.log(`  ${row[0].text}  Sales: ${fmtPct(salesSh)}  Stock: ${fmtPct(stockSh)}  Gap: ${gap > 0 ? "+" : ""}${fmtPct(gap)}`);
  }

  // ═══ SECTION 5: Client Segments ═══
  const segs = await queryHypercube(h, ["ClientSegment"], [
    { expr: `Count(DISTINCT ${NR} ClientID)`, label: "Clients" },
    { expr: `Sum(${NR} NetAmount)`, label: "Sales" },
    { expr: `Sum(${NR} NetAmount)/Count(DISTINCT ${NR} ClientID)`, label: "SPC" },
  ]);

  console.log("\n5. CLIENT SEGMENTS");
  console.log("─────────────────────");
  for (const row of segs.rows) {
    if (row[0].text === "-") continue;
    console.log(`  ${row[0].text.padEnd(14)} Clients: ${fmtNum(row[1].num).padStart(6)}  Sales: ${fmtMoney(row[2].num).padStart(8)}  Sales/Client: ${fmtMoney(row[3].num)}`);
  }

  // ═══ SECTION 6: Alerts ═══
  console.log("\n6. ALERTS");
  console.log("─────────────────────");
  if (verme < 0.85) console.log(`  🔴 VERME Coverage ${fmtPct(verme)} — target 85%. ${Math.round((0.85 - verme) * 100)} п.п. gap.`);
  if (returns > 0.086) console.log(`  🔴 Returns ${fmtPct(returns)} — budget 8.6%. +${fmtPct(returns - 0.086)} above.`);
  if (gm < 0.74) console.log(`  🟡 GM% ${fmtPct(gm)} — target 74%. -${fmtPct(0.74 - gm)} below.`);
  if (csi < 85) console.log(`  🟡 CSI ${csi.toFixed(1)} — target 85. -${(85 - csi).toFixed(1)} below.`);

  const ffEng = (await evalExpr(h, `Count(DISTINCT {<IsReturn={0},ClientSegment={'F&F'}>} ClientID) / Count(DISTINCT {<ClientSegment={'F&F'}>} ClientID)`)).qNumber;
  if (ffEng < 0.30) console.log(`  🟡 F&F Engagement ${fmtPct(ffEng)} — target 30%. VIP base underperforming.`);

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Generated automatically via Qlik MCP + Claude");
  console.log("═══════════════════════════════════════════════");

  ws.close();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
