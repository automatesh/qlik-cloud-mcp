const WebSocket = require("ws");

const TENANT = "x2bsmja3t4khq5z.us.qlikcloud.com";
const APP_ID = "f22efcef-19e1-4d0e-9cf3-70b740eeec80";
const API_KEY = process.env.QLIK_API_KEY;

let ws;
let reqId = 0;
const pending = new Map();

function send(handle, method, params = []) {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params }));
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function createMeasure(h, label, expr, desc = "") {
  try {
    const r = await send(h, "CreateMeasure", [{
      qInfo: { qType: "measure" },
      qMeasure: { qLabel: label, qDef: expr, qLabelExpression: "" },
      qMetaDef: { title: label, description: desc },
    }]);
    console.log(`  [measure] ${label}`);
    return r.qReturn?.qGenericId;
  } catch (e) {
    console.log(`  [measure SKIP] ${label}: ${e.message || e}`);
  }
}

async function createDimension(h, label, fieldDefs, desc = "") {
  try {
    const r = await send(h, "CreateDimension", [{
      qInfo: { qType: "dimension" },
      qDim: { qFieldDefs: fieldDefs, title: label, qGrouping: "N" },
      qMetaDef: { title: label, description: desc },
    }]);
    console.log(`  [dimension] ${label}`);
    return r.qReturn?.qGenericId;
  } catch (e) {
    console.log(`  [dimension SKIP] ${label}: ${e.message || e}`);
  }
}

async function createSheet(h, title, description = "", rank = 0) {
  const r = await send(h, "CreateObject", [{
    qInfo: { qType: "sheet" },
    qMetaDef: { title, description },
    cells: [],
    rank,
    columns: 24,
    rows: 12,
  }]);
  const sheetId = r.qReturn?.qGenericId;
  console.log(`  [sheet] ${title} → ${sheetId}`);
  return { id: sheetId, handle: r.qReturn?.qHandle };
}

async function addObject(h, sheetHandle, sheetId, type, title, dims, measures, cellPos) {
  // Create the vis object
  const qDimensions = dims.map(d => ({
    qDef: { qFieldDefs: Array.isArray(d) ? d : [d], qSortCriterias: [{ qSortByNumeric: -1 }] },
  }));
  const qMeasures = measures.map(m => ({
    qDef: { qDef: m.expr, qLabel: m.label || "" },
    qSortBy: { qSortByNumeric: -1 },
  }));

  const obj = await send(h, "CreateObject", [{
    qInfo: { qType: type },
    qHyperCubeDef: {
      qDimensions,
      qMeasures,
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: dims.length + measures.length, qHeight: 500 }],
      qSuppressZero: false,
      qSuppressMissing: false,
    },
    title,
    showTitles: true,
    visualization: type,
  }]);

  const objId = obj.qReturn?.qGenericId;

  // Get current sheet properties and add the cell
  const props = await send(sheetHandle, "GetProperties", []);
  const sheetProps = props.qProp;
  sheetProps.cells.push({
    name: objId,
    type,
    col: cellPos.col,
    row: cellPos.row,
    colspan: cellPos.colspan,
    rowspan: cellPos.rowspan,
  });
  await send(sheetHandle, "SetProperties", [sheetProps]);
  console.log(`    [${type}] ${title} → ${objId}`);
  return objId;
}

// ─── Set analysis shortcuts ──────────────────────────────────────────

const CW = `{<Date={">=$(=Date(Max(Date)-6,'YYYY-MM-DD'))<==$(=Date(Max(Date),'YYYY-MM-DD'))"}>}`;
const PW = `{<Date={">=$(=Date(Max(Date)-13,'YYYY-MM-DD'))<==$(=Date(Max(Date)-7,'YYYY-MM-DD'))"}>}`;
const SPLY = `{<Date={">=$(=Date(Max(Date)-371,'YYYY-MM-DD'))<==$(=Date(Max(Date)-365,'YYYY-MM-DD'))"}>}`;
const NO_RET = `{<IsReturn={0}>}`;
const CW_NR = `{<IsReturn={0},Date={">=$(=Date(Max(Date)-6,'YYYY-MM-DD'))<==$(=Date(Max(Date),'YYYY-MM-DD'))"}>}`;
const PW_NR = `{<IsReturn={0},Date={">=$(=Date(Max(Date)-13,'YYYY-MM-DD'))<==$(=Date(Max(Date)-7,'YYYY-MM-DD'))"}>}`;
const SPLY_NR = `{<IsReturn={0},Date={">=$(=Date(Max(Date)-371,'YYYY-MM-DD'))<==$(=Date(Max(Date)-365,'YYYY-MM-DD'))"}>}`;
const RETAIL = `StoreID={"<24"}`;
const ECOM = `StoreID={">=24"}`;

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("Connecting...");
  ws = new WebSocket(`wss://${TENANT}/app/${APP_ID}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`QIX ${msg.error.code}: ${msg.error.message}`));
      else p.resolve(msg.result);
    }
  });

  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });

  const doc = await send(-1, "OpenDoc", [APP_ID]);
  const h = doc.qReturn.qHandle;
  console.log("App opened.\n");

  // ════════════════════ MASTER MEASURES ════════════════════
  console.log("Creating master measures...");

  // Core sales
  await createMeasure(h, "Net Sales", `Sum(${NO_RET} NetAmount)`, "Net sales excluding returns");
  await createMeasure(h, "Net Sales CW", `Sum(${CW_NR} NetAmount)`, "Net sales current week");
  await createMeasure(h, "Net Sales PW", `Sum(${PW_NR} NetAmount)`, "Net sales previous week");
  await createMeasure(h, "Net Sales SPLY", `Sum(${SPLY_NR} NetAmount)`, "Net sales same period last year");
  await createMeasure(h, "Net Sales WoW%", `(Sum(${CW_NR} NetAmount) / Sum(${PW_NR} NetAmount)) - 1`, "Week-over-week change");
  await createMeasure(h, "Net Sales YoY%", `(Sum(${CW_NR} NetAmount) / Sum(${SPLY_NR} NetAmount)) - 1`, "Year-over-year change");
  await createMeasure(h, "Gross Sales", `Sum(${NO_RET} GrossAmount)`, "Gross sales before discount");
  await createMeasure(h, "Returns", `Sum({<IsReturn={1}>} NetAmount) * -1`, "Returns value");
  await createMeasure(h, "Discount Amount", `Sum(${NO_RET} GrossAmount) - Sum(${NO_RET} NetAmount)`, "Total discount given");
  await createMeasure(h, "Avg Discount%", `1 - Sum(${NO_RET} NetAmount) / Sum(${NO_RET} GrossAmount)`, "Average discount rate");

  // Margin
  await createMeasure(h, "COGS", `Sum(${NO_RET} Qty * UnitCost)`, "Cost of goods sold");
  await createMeasure(h, "Gross Margin", `Sum(${NO_RET} NetAmount) - Sum(${NO_RET} Qty * UnitCost)`, "Gross margin");
  await createMeasure(h, "GM%", `1 - Sum(${NO_RET} Qty * UnitCost) / Sum(${NO_RET} NetAmount)`, "Gross margin percentage");

  // Units / Transactions
  await createMeasure(h, "Units Sold", `Sum(${NO_RET} Qty)`, "Total units sold");
  await createMeasure(h, "Transactions", `Count(DISTINCT ${NO_RET} TransactionID)`, "Number of transactions");
  await createMeasure(h, "AUP", `Sum(${NO_RET} NetAmount) / Sum(${NO_RET} Qty)`, "Average unit price");
  await createMeasure(h, "UPT", `Sum(${NO_RET} Qty) / Count(DISTINCT ${NO_RET} TransactionID)`, "Units per transaction");
  await createMeasure(h, "AOV", `Sum(${NO_RET} NetAmount) / Count(DISTINCT ${NO_RET} TransactionID)`, "Average order value");

  // Traffic & Conversion
  await createMeasure(h, "Traffic", `Sum(Visitors)`, "Total visitors");
  await createMeasure(h, "Sessions", `Sum(Sessions)`, "Total sessions");
  await createMeasure(h, "CR%", `Count(DISTINCT ${NO_RET} TransactionID) / Sum(Visitors)`, "Conversion rate");

  // Client metrics
  await createMeasure(h, "Unique Clients", `Count(DISTINCT ${NO_RET} ClientID)`, "Unique buying clients");
  await createMeasure(h, "New Clients", `Count(DISTINCT {<IsReturn={0}>} If(FirstPurchaseDate >= Date(Max(Date)-6), ClientID))`, "New clients this week");
  await createMeasure(h, "Client Balance", `Count(DISTINCT {<IsReturn={0}>} If(FirstPurchaseDate >= Date(Max(Date)-6), ClientID))`, "Simplified client balance");

  // Stock
  await createMeasure(h, "Stock Qty Available", `Sum(QtyAvailable)`, "Available stock in units");
  await createMeasure(h, "Stock Qty Not Available", `Sum(QtyNotAvailable)`, "Not available stock in units");
  await createMeasure(h, "Stock RRP Value", `Sum(StockValueRRP)`, "Stock value at RRP");
  await createMeasure(h, "Stock Transit", `Sum(QtyTransit)`, "Stock in transit");
  await createMeasure(h, "Stock Reserve", `Sum(QtyReserve)`, "Stock in reserve");
  await createMeasure(h, "STR%", `Sum(${NO_RET} Qty) / (Sum(QtyAvailable) + Sum(${NO_RET} Qty))`, "Sell-through rate");

  // Finance
  await createMeasure(h, "Cash Balance", `Sum(CashBalance)`, "Cash and equivalents");
  await createMeasure(h, "Total Debt", `Sum(Debt)`, "Total debt incl. shareholder loans");
  await createMeasure(h, "AR", `Sum(AccountsReceivable)`, "Accounts receivable");
  await createMeasure(h, "AP", `Sum(AccountsPayable)`, "Accounts payable");
  await createMeasure(h, "Inventory Value", `Sum(InventoryValue)`, "Inventory at cost");
  await createMeasure(h, "NWC", `Sum(AccountsReceivable) + Sum(InventoryValue) - Sum(AccountsPayable)`, "Net working capital");

  // CSI
  await createMeasure(h, "CSI Score", `Avg(CSIScore)`, "Average CSI score");
  await createMeasure(h, "CSI Responses", `Sum(ResponseCount)`, "Total CSI responses");

  // Marketing
  await createMeasure(h, "Total Reach", `Sum(Reach)`, "Marketing reach");
  await createMeasure(h, "Golden Reach", `Sum(GoldenReach)`, "Golden reach (premium audience)");
  await createMeasure(h, "Marketing Spend", `Sum(Spend)`, "Total marketing spend");
  await createMeasure(h, "DRR%", `Sum(Spend) / Sum(${NO_RET} NetAmount)`, "Direct revenue ratio");

  // HR
  await createMeasure(h, "Staffing%", `Avg(StaffingPct)`, "Average staffing level");
  await createMeasure(h, "Mystery Shopper", `Avg(MysteryShopperScore)`, "Average mystery shopper score");

  // Supply Chain
  await createMeasure(h, "OTIF%", `Avg(OTIFPct)`, "On-time in-full percentage");
  await createMeasure(h, "OnTime%", `Avg(OnTimePct)`, "On-time delivery percentage");

  // LFL (stores open > 12 months = StoreID 1-17, excluding newer stores)
  await createMeasure(h, "Net Sales LFL", `Sum({<IsReturn={0},StoreID={"<=17"}>} NetAmount)`, "LFL Net Sales (RU stores open >12mo)");

  // ECOM specific
  await createMeasure(h, "ECOM Revenue Created", `Sum({<IsReturn={0},StoreID={">=24"}>} NetAmount)`, "ECOM revenue created");
  await createMeasure(h, "ECOM Orders", `Count(DISTINCT {<IsReturn={0},StoreID={">=24"}>} TransactionID)`, "ECOM orders count");
  await createMeasure(h, "ECOM CR%", `Count(DISTINCT {<IsReturn={0},StoreID={">=24"}>} TransactionID) / Sum({<StoreID={">=24"}>} Sessions)`, "ECOM conversion rate");

  // ════════════════════ MASTER DIMENSIONS ════════════════════
  console.log("\nCreating master dimensions...");

  await createDimension(h, "Date", ["Date"]);
  await createDimension(h, "Week", ["WeekNum"]);
  await createDimension(h, "Month", ["MonthName"]);
  await createDimension(h, "Quarter", ["Quarter"]);
  await createDimension(h, "Year", ["Year"]);
  await createDimension(h, "Territory", ["Territory"]);
  await createDimension(h, "City", ["City"]);
  await createDimension(h, "Store", ["StoreName"]);
  await createDimension(h, "Store Grade", ["StoreGrade"]);
  await createDimension(h, "Channel", ["ChannelName"]);
  await createDimension(h, "Channel Type", ["ChannelType"]);
  await createDimension(h, "Strategic Category", ["StrategicCategory"]);
  await createDimension(h, "Product Category", ["ProductCategory"]);
  await createDimension(h, "Season", ["Season"]);
  await createDimension(h, "Season Full", ["SeasonFull"]);
  await createDimension(h, "Material", ["Material"]);
  await createDimension(h, "Price Type", ["PriceType"]);
  await createDimension(h, "Client Segment", ["ClientSegment"]);
  await createDimension(h, "Country", ["CountryName"]);
  await createDimension(h, "CSI Region", ["CSIRegion"]);
  await createDimension(h, "CSI Type", ["CSIType"]);
  await createDimension(h, "Warehouse", ["WarehouseName"]);
  await createDimension(h, "Marketing Channel", ["MarketingChannel"]);
  await createDimension(h, "Marketing Platform", ["MarketingPlatform"]);

  // ════════════════════ SHEETS ════════════════════
  console.log("\nCreating sheets...");

  // ── Sheet 1: Executive Summary ──
  const s1 = await createSheet(h, "Executive Summary", "Key KPIs: Net Sales, GM%, Stock, Clients, CSI", 0);
  await addObject(h, s1.handle, s1.id, "kpi", "Net Sales (CW)", [], [
    { expr: `Sum(${CW_NR} NetAmount)`, label: "Net Sales CW" },
  ], { col: 0, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s1.handle, s1.id, "kpi", "WoW%", [], [
    { expr: `(Sum(${CW_NR} NetAmount) / Sum(${PW_NR} NetAmount)) - 1`, label: "WoW" },
  ], { col: 4, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s1.handle, s1.id, "kpi", "YoY%", [], [
    { expr: `(Sum(${CW_NR} NetAmount) / Sum(${SPLY_NR} NetAmount)) - 1`, label: "YoY" },
  ], { col: 8, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s1.handle, s1.id, "kpi", "GM%", [], [
    { expr: `1 - Sum(${NO_RET} Qty * UnitCost) / Sum(${NO_RET} NetAmount)`, label: "Gross Margin %" },
  ], { col: 12, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s1.handle, s1.id, "kpi", "Stock RRP", [], [
    { expr: `Sum(StockValueRRP)`, label: "Stock Total RRP" },
  ], { col: 16, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s1.handle, s1.id, "kpi", "CSI", [], [
    { expr: `Avg(CSIScore)`, label: "CSI Score" },
  ], { col: 20, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s1.handle, s1.id, "barchart", "Net Sales by Week", ["WeekNum"], [
    { expr: `Sum(${NO_RET} NetAmount)`, label: "Net Sales" },
    { expr: `Sum(${NO_RET} Qty * UnitCost)`, label: "COGS" },
  ], { col: 0, row: 3, colspan: 16, rowspan: 9 });
  await addObject(h, s1.handle, s1.id, "table", "Sales Summary by Channel", ["ChannelName"], [
    { expr: `Sum(${NO_RET} NetAmount)`, label: "Net Sales" },
    { expr: `1 - Sum(${NO_RET} Qty*UnitCost)/Sum(${NO_RET} NetAmount)`, label: "GM%" },
    { expr: `Count(DISTINCT ${NO_RET} TransactionID)`, label: "Transactions" },
    { expr: `Sum(${NO_RET} NetAmount)/Count(DISTINCT ${NO_RET} TransactionID)`, label: "AOV" },
  ], { col: 16, row: 3, colspan: 8, rowspan: 9 });

  // ── Sheet 2: Product by Strategic Category ──
  const s2 = await createSheet(h, "Product by Strategic Category", "Net Sales, Stock, GM%, STR by category", 1);
  await addObject(h, s2.handle, s2.id, "table", "Strategic Categories", ["StrategicCategory"], [
    { expr: `Sum(${NO_RET} NetAmount)`, label: "Net Sales" },
    { expr: `Sum(${NO_RET} Qty)`, label: "Units" },
    { expr: `Sum(${NO_RET} NetAmount)/Sum(${NO_RET} Qty)`, label: "AUP" },
    { expr: `1 - Sum(${NO_RET} Qty*UnitCost)/Sum(${NO_RET} NetAmount)`, label: "GM%" },
    { expr: `Sum(StockValueRRP)`, label: "Stock RRP" },
    { expr: `Sum(QtyAvailable)`, label: "Stock Qty" },
    { expr: `Sum(QtyNotAvailable)`, label: "Not Available" },
    { expr: `Sum(${NO_RET} Qty)/(Sum(QtyAvailable)+Sum(${NO_RET} Qty))`, label: "STR%" },
  ], { col: 0, row: 0, colspan: 24, rowspan: 6 });
  await addObject(h, s2.handle, s2.id, "barchart", "Net Sales by Strategic Category", ["StrategicCategory"], [
    { expr: `Sum(${NO_RET} NetAmount)`, label: "Net Sales" },
  ], { col: 0, row: 6, colspan: 12, rowspan: 6 });
  await addObject(h, s2.handle, s2.id, "barchart", "GM% by Strategic Category", ["StrategicCategory"], [
    { expr: `1 - Sum(${NO_RET} Qty*UnitCost)/Sum(${NO_RET} NetAmount)`, label: "GM%" },
  ], { col: 12, row: 6, colspan: 12, rowspan: 6 });

  // ── Sheet 3: Product by Seasons ──
  const s3 = await createSheet(h, "Product by Seasons", "Season breakdown: sales share, stock share, margin", 2);
  await addObject(h, s3.handle, s3.id, "table", "Season Breakdown", ["Season"], [
    { expr: `Sum(${NO_RET} NetAmount)`, label: "Net Sales" },
    { expr: `Sum(${NO_RET} NetAmount)/Sum(TOTAL ${NO_RET} NetAmount)`, label: "Sales Share%" },
    { expr: `Sum(${NO_RET} Qty)`, label: "Units" },
    { expr: `Sum(${NO_RET} NetAmount)/Sum(${NO_RET} Qty)`, label: "AUP" },
    { expr: `1 - Sum(${NO_RET} Qty*UnitCost)/Sum(${NO_RET} NetAmount)`, label: "GM%" },
    { expr: `Sum(StockValueRRP)`, label: "Stock RRP" },
    { expr: `Sum(StockValueRRP)/Sum(TOTAL StockValueRRP)`, label: "Stock Share%" },
  ], { col: 0, row: 0, colspan: 24, rowspan: 5 });
  await addObject(h, s3.handle, s3.id, "piechart", "Sales by Season", ["Season"], [
    { expr: `Sum(${NO_RET} NetAmount)`, label: "Net Sales" },
  ], { col: 0, row: 5, colspan: 8, rowspan: 7 });
  await addObject(h, s3.handle, s3.id, "piechart", "Stock by Season", ["Season"], [
    { expr: `Sum(StockValueRRP)`, label: "Stock RRP" },
  ], { col: 8, row: 5, colspan: 8, rowspan: 7 });
  await addObject(h, s3.handle, s3.id, "barchart", "GM% by Season", ["Season"], [
    { expr: `1 - Sum(${NO_RET} Qty*UnitCost)/Sum(${NO_RET} NetAmount)`, label: "GM%" },
  ], { col: 16, row: 5, colspan: 8, rowspan: 7 });

  // ── Sheet 4: KPIs Retail ──
  const s4 = await createSheet(h, "KPIs Retail", "Traffic, CR, UPT, AUP, AOV, Net Sales for retail stores", 3);
  await addObject(h, s4.handle, s4.id, "kpi", "Retail Traffic", [], [
    { expr: `Sum({<${RETAIL}>} Visitors)`, label: "Traffic" },
  ], { col: 0, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s4.handle, s4.id, "kpi", "Retail CR%", [], [
    { expr: `Count(DISTINCT {<IsReturn={0},${RETAIL}>} TransactionID)/Sum({<${RETAIL}>} Visitors)`, label: "CR%" },
  ], { col: 4, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s4.handle, s4.id, "kpi", "Retail UPT", [], [
    { expr: `Sum({<IsReturn={0},${RETAIL}>} Qty)/Count(DISTINCT {<IsReturn={0},${RETAIL}>} TransactionID)`, label: "UPT" },
  ], { col: 8, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s4.handle, s4.id, "kpi", "Retail AUP", [], [
    { expr: `Sum({<IsReturn={0},${RETAIL}>} NetAmount)/Sum({<IsReturn={0},${RETAIL}>} Qty)`, label: "AUP" },
  ], { col: 12, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s4.handle, s4.id, "kpi", "Retail AOV", [], [
    { expr: `Sum({<IsReturn={0},${RETAIL}>} NetAmount)/Count(DISTINCT {<IsReturn={0},${RETAIL}>} TransactionID)`, label: "AOV" },
  ], { col: 16, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s4.handle, s4.id, "kpi", "Retail Net Sales", [], [
    { expr: `Sum({<IsReturn={0},${RETAIL}>} NetAmount)`, label: "Net Sales" },
  ], { col: 20, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s4.handle, s4.id, "table", "Retail by Territory", ["Territory"], [
    { expr: `Sum({<IsReturn={0},${RETAIL}>} NetAmount)`, label: "Net Sales" },
    { expr: `Sum({<${RETAIL}>} Visitors)`, label: "Traffic" },
    { expr: `Count(DISTINCT {<IsReturn={0},${RETAIL}>} TransactionID)/Sum({<${RETAIL}>} Visitors)`, label: "CR%" },
    { expr: `Sum({<IsReturn={0},${RETAIL}>} Qty)/Count(DISTINCT {<IsReturn={0},${RETAIL}>} TransactionID)`, label: "UPT" },
    { expr: `Sum({<IsReturn={0},${RETAIL}>} NetAmount)/Count(DISTINCT {<IsReturn={0},${RETAIL}>} TransactionID)`, label: "AOV" },
    { expr: `Avg({<${RETAIL}>} MysteryShopperScore)`, label: "Mystery Shopper" },
  ], { col: 0, row: 3, colspan: 24, rowspan: 9 });

  // ── Sheet 5: KPIs ECOM ──
  const s5 = await createSheet(h, "KPIs ECOM", "ECOM metrics by channel: traffic, CR, AOV, revenue, DRR", 4);
  await addObject(h, s5.handle, s5.id, "kpi", "ECOM Traffic", [], [
    { expr: `Sum({<${ECOM}>} Sessions)`, label: "Sessions" },
  ], { col: 0, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s5.handle, s5.id, "kpi", "ECOM CR%", [], [
    { expr: `Count(DISTINCT {<IsReturn={0},${ECOM}>} TransactionID)/Sum({<${ECOM}>} Sessions)`, label: "CR%" },
  ], { col: 4, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s5.handle, s5.id, "kpi", "ECOM AOV", [], [
    { expr: `Sum({<IsReturn={0},${ECOM}>} NetAmount)/Count(DISTINCT {<IsReturn={0},${ECOM}>} TransactionID)`, label: "AOV" },
  ], { col: 8, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s5.handle, s5.id, "kpi", "ECOM Revenue", [], [
    { expr: `Sum({<IsReturn={0},${ECOM}>} NetAmount)`, label: "Revenue" },
  ], { col: 12, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s5.handle, s5.id, "kpi", "ECOM Orders", [], [
    { expr: `Count(DISTINCT {<IsReturn={0},${ECOM}>} TransactionID)`, label: "Orders" },
  ], { col: 16, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s5.handle, s5.id, "kpi", "DRR%", [], [
    { expr: `Sum(Spend)/Sum({<IsReturn={0},${ECOM}>} NetAmount)`, label: "DRR%" },
  ], { col: 20, row: 0, colspan: 4, rowspan: 3 });
  await addObject(h, s5.handle, s5.id, "table", "ECOM by Channel", ["StoreName"], [
    { expr: `Sum({<IsReturn={0},${ECOM}>} NetAmount)`, label: "Revenue" },
    { expr: `Count(DISTINCT {<IsReturn={0},${ECOM}>} TransactionID)`, label: "Orders" },
    { expr: `Sum({<${ECOM}>} Sessions)`, label: "Sessions" },
    { expr: `Count(DISTINCT {<IsReturn={0},${ECOM}>} TransactionID)/Sum({<${ECOM}>} Sessions)`, label: "CR%" },
    { expr: `Sum({<IsReturn={0},${ECOM}>} NetAmount)/Count(DISTINCT {<IsReturn={0},${ECOM}>} TransactionID)`, label: "AOV" },
    { expr: `Sum({<IsReturn={0},${ECOM}>} NetAmount)/Sum({<IsReturn={0},${ECOM}>} Qty)`, label: "AUP" },
  ], { col: 0, row: 3, colspan: 24, rowspan: 9 });

  // ── Sheet 6: Client Segments ──
  const s6 = await createSheet(h, "Client Segments RU", "Net Sales, Clients, Churn by segment", 5);
  await addObject(h, s6.handle, s6.id, "table", "Segments Overview", ["ClientSegment"], [
    { expr: `Sum(${NO_RET} NetAmount)`, label: "Net Sales" },
    { expr: `Sum(${NO_RET} NetAmount)/Sum(TOTAL ${NO_RET} NetAmount)`, label: "Share%" },
    { expr: `Count(DISTINCT ${NO_RET} ClientID)`, label: "Clients" },
    { expr: `Sum(${NO_RET} NetAmount)/Count(DISTINCT ${NO_RET} ClientID)`, label: "Sales/Client" },
    { expr: `Count(DISTINCT ${NO_RET} TransactionID)/Count(DISTINCT ${NO_RET} ClientID)`, label: "Freq" },
    { expr: `Sum(${NO_RET} NetAmount)/Count(DISTINCT ${NO_RET} TransactionID)`, label: "AOV" },
  ], { col: 0, row: 0, colspan: 24, rowspan: 5 });
  await addObject(h, s6.handle, s6.id, "barchart", "Net Sales by Segment", ["ClientSegment"], [
    { expr: `Sum(${NO_RET} NetAmount)`, label: "Net Sales" },
  ], { col: 0, row: 5, colspan: 12, rowspan: 7 });
  await addObject(h, s6.handle, s6.id, "barchart", "Clients by Segment", ["ClientSegment"], [
    { expr: `Count(DISTINCT ${NO_RET} ClientID)`, label: "Clients" },
  ], { col: 12, row: 5, colspan: 12, rowspan: 7 });

  // ── Sheet 7: CSI ──
  const s7 = await createSheet(h, "KPIs CSI", "Customer Satisfaction Index by region and type", 6);
  await addObject(h, s7.handle, s7.id, "table", "CSI by Region × Type", ["CSIRegion", "CSIType"], [
    { expr: `Avg(CSIScore)`, label: "CSI Score" },
    { expr: `Sum(ResponseCount)`, label: "Responses" },
  ], { col: 0, row: 0, colspan: 16, rowspan: 12 });
  await addObject(h, s7.handle, s7.id, "barchart", "CSI by Region", ["CSIRegion"], [
    { expr: `Avg(CSIScore)`, label: "CSI Score" },
  ], { col: 16, row: 0, colspan: 8, rowspan: 6 });
  await addObject(h, s7.handle, s7.id, "barchart", "CSI by Type", ["CSIType"], [
    { expr: `Avg(CSIScore)`, label: "CSI Score" },
  ], { col: 16, row: 6, colspan: 8, rowspan: 6 });

  // ── Sheet 8: Cash Flow ──
  const s8 = await createSheet(h, "Finance Cash Flow", "Cash balance, Debt, NWC by country", 7);
  await addObject(h, s8.handle, s8.id, "table", "Cash Flow by Country", ["CountryName"], [
    { expr: `Sum(CashBalance)`, label: "Cash" },
    { expr: `Sum(Deposits)`, label: "Deposits" },
    { expr: `Sum(Debt)`, label: "Debt" },
    { expr: `Sum(AccountsReceivable)`, label: "AR" },
    { expr: `Sum(AccountsPayable)`, label: "AP" },
    { expr: `Sum(InventoryValue)`, label: "Inventory" },
    { expr: `Sum(AccountsReceivable)+Sum(InventoryValue)-Sum(AccountsPayable)`, label: "NWC" },
  ], { col: 0, row: 0, colspan: 24, rowspan: 6 });
  await addObject(h, s8.handle, s8.id, "barchart", "Cash Balance Trend", ["WeekNum"], [
    { expr: `Sum(CashBalance)`, label: "Cash" },
    { expr: `Sum(Debt)`, label: "Debt" },
  ], { col: 0, row: 6, colspan: 24, rowspan: 6 });

  // ── Sheet 9: Supply Chain & HR ──
  const s9 = await createSheet(h, "Supply Chain & HR", "OTIF, OnTime, Staffing, Mystery Shopper", 8);
  await addObject(h, s9.handle, s9.id, "table", "Supply Chain by Warehouse", ["WarehouseName"], [
    { expr: `Avg(OTIFPct)`, label: "OTIF%" },
    { expr: `Avg(OnTimePct)`, label: "OnTime%" },
    { expr: `Avg(LeadTimeDays)`, label: "Lead Time (days)" },
    { expr: `Sum(ShipmentsCount)`, label: "Shipments" },
    { expr: `Sum(DamagedCount)`, label: "Damaged" },
  ], { col: 0, row: 0, colspan: 24, rowspan: 6 });
  await addObject(h, s9.handle, s9.id, "table", "HR by Store", ["StoreName"], [
    { expr: `Avg(HeadcountPlan)`, label: "Plan" },
    { expr: `Avg(HeadcountActual)`, label: "Actual" },
    { expr: `Avg(StaffingPct)`, label: "Staffing%" },
    { expr: `Avg(TurnoverPct)`, label: "Turnover%" },
    { expr: `Avg(MysteryShopperScore)`, label: "Mystery Shopper" },
  ], { col: 0, row: 6, colspan: 24, rowspan: 6 });

  // ── Sheet 10: Marketing ──
  const s10 = await createSheet(h, "Brand Marketing", "Reach, Engagement, Spend, Sentiment", 9);
  await addObject(h, s10.handle, s10.id, "table", "Marketing by Channel", ["MarketingChannel"], [
    { expr: `Sum(Reach)`, label: "Reach" },
    { expr: `Sum(GoldenReach)`, label: "Golden Reach" },
    { expr: `Sum(Engagements)`, label: "Engagements" },
    { expr: `Sum(Clicks)`, label: "Clicks" },
    { expr: `Sum(Spend)`, label: "Spend" },
    { expr: `Avg(PositiveSentimentPct)`, label: "Positive%" },
    { expr: `Avg(NegativeSentimentPct)`, label: "Negative%" },
  ], { col: 0, row: 0, colspan: 24, rowspan: 6 });
  await addObject(h, s10.handle, s10.id, "barchart", "Reach by Platform", ["MarketingPlatform"], [
    { expr: `Sum(Reach)`, label: "Total Reach" },
    { expr: `Sum(GoldenReach)`, label: "Golden Reach" },
  ], { col: 0, row: 6, colspan: 12, rowspan: 6 });
  await addObject(h, s10.handle, s10.id, "barchart", "Spend by Channel", ["MarketingChannel"], [
    { expr: `Sum(Spend)`, label: "Spend" },
  ], { col: 12, row: 6, colspan: 12, rowspan: 6 });

  // ── Save ──
  console.log("\nSaving app...");
  await send(h, "DoSave", []);
  console.log("Done! 10 sheets created with all visualizations.");

  ws.close();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
