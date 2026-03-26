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

async function createMeasure(h, label, expr) {
  try {
    await send(h, "CreateMeasure", [{
      qInfo: { qType: "measure" },
      qMeasure: { qLabel: label, qDef: expr },
      qMetaDef: { title: label },
    }]);
    console.log("  [measure] " + label);
  } catch (e) { console.log("  [measure SKIP] " + label); }
}

async function createDimension(h, label, fields) {
  try {
    await send(h, "CreateDimension", [{
      qInfo: { qType: "dimension" },
      qDim: { qFieldDefs: fields, title: label, qGrouping: "N" },
      qMetaDef: { title: label },
    }]);
    console.log("  [dim] " + label);
  } catch (e) { console.log("  [dim SKIP] " + label); }
}

async function addObjToSheet(h, sheetId, type, title, dims, measures, pos) {
  const sheetObj = await send(h, "GetObject", [sheetId]);
  const sh = sheetObj.qReturn.qHandle;

  const qDims = dims.map(d => ({ qDef: { qFieldDefs: [d], qSortCriterias: [{ qSortByNumeric: -1 }] } }));
  const qMeas = measures.map(m => ({ qDef: { qDef: m.expr, qLabel: m.label }, qSortBy: { qSortByNumeric: -1 } }));

  const props = {
    qInfo: { qType: type },
    qHyperCubeDef: {
      qDimensions: qDims,
      qMeasures: qMeas,
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: dims.length + measures.length, qHeight: 500 }],
      qSuppressZero: false, qSuppressMissing: false,
    },
    title, showTitles: true, visualization: type,
  };

  if (type === "barchart") {
    Object.assign(props, {
      barGrouping: { grouping: "auto" }, orientation: "auto",
      dataPoint: { showLabels: false }, gridLine: { auto: true, spacing: 2 },
      color: { auto: true }, legend: { show: true, dock: "auto" },
      dimensionAxis: { show: "all" }, measureAxis: { show: "all", dock: "near", spacing: 1 },
    });
  }

  const obj = await send(h, "CreateObject", [props]);
  const layout = await send(obj.qReturn.qHandle, "GetLayout", []);
  const newId = layout.qLayout.qInfo.qId;

  const sheetProps = (await send(sh, "GetProperties", [])).qProp;
  sheetProps.cells.push({ name: newId, type, ...pos });
  await send(sh, "SetProperties", [sheetProps]);
  console.log("  [" + type + "] " + title + " → " + newId);
}

async function createSheet(h, title, desc, rank) {
  const r = await send(h, "CreateObject", [{
    qInfo: { qType: "sheet" }, qMetaDef: { title, description: desc },
    cells: [], rank, columns: 24, rows: 12,
  }]);
  console.log("  [sheet] " + title + " → " + r.qReturn.qGenericId);
  return r.qReturn.qGenericId;
}

async function main() {
  ws = new WebSocket(`wss://${TENANT}/app/${APP_ID}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  ws.on("message", d => {
    const msg = JSON.parse(d.toString());
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); }
  });
  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
  const doc = await send(-1, "OpenDoc", [APP_ID]);
  const h = doc.qReturn.qHandle;
  console.log("App opened.\n");

  // ═══ NEW MASTER MEASURES ═══
  console.log("Adding new master measures...");

  // VERME
  await createMeasure(h, "VERME Coverage%", "Sum(PlannedShifts - Overcoverage) / Sum(Demand)");
  await createMeasure(h, "VERME Occupation%", "Sum(Demand - (Demand - PlannedShifts)) / Sum(PlannedShifts)");
  await createMeasure(h, "VERME Demand", "Sum(Demand)");
  await createMeasure(h, "VERME Planned Shifts", "Sum(PlannedShifts)");

  // Returns
  await createMeasure(h, "Returns%", "Sum({<IsReturn={1}>} Qty) / Sum(Qty)");
  await createMeasure(h, "Returns Value", "Sum({<IsReturn={1}>} NetAmount) * -1");

  // F&F specific
  await createMeasure(h, "F&F Clients Total", "Count(DISTINCT {<ClientSegment={'F&F'}>} ClientID)");
  await createMeasure(h, "F&F Clients Assigned", "Count(DISTINCT {<ClientSegment={'F&F'}>} If(Not IsNull(StylistID), ClientID))");
  await createMeasure(h, "F&F Assignment%", "Count(DISTINCT {<ClientSegment={'F&F'}>} If(Not IsNull(StylistID), ClientID)) / Count(DISTINCT {<ClientSegment={'F&F'}>} ClientID)");
  await createMeasure(h, "F&F Engagement%", "Count(DISTINCT {<IsReturn={0}, ClientSegment={'F&F'}>} ClientID) / Count(DISTINCT {<ClientSegment={'F&F'}>} ClientID)");
  await createMeasure(h, "F&F Net Sales", "Sum({<IsReturn={0}, ClientSegment={'F&F'}>} NetAmount)");
  await createMeasure(h, "Stylist Net Sales", "Sum({<IsReturn={0}>} If(Not IsNull(StylistID), NetAmount))");

  // Marketing ER
  await createMeasure(h, "ER% (Reactions/Views)", "Sum(Reactions) / Sum(Views)");
  await createMeasure(h, "ER% (Engagements/Reach)", "Sum(Engagements) / Sum(Reach)");
  await createMeasure(h, "ER Instagram", "Sum(If(MarketingPlatform='Instagram', Likes + Comments)) / Sum(If(MarketingPlatform='Instagram', Followers))");
  await createMeasure(h, "ER Telegram", "Sum(If(MarketingPlatform='Telegram', Reactions)) / Sum(If(MarketingPlatform='Telegram', Views))");
  await createMeasure(h, "Total Views", "Sum(Views)");
  await createMeasure(h, "Total Reactions", "Sum(Reactions)");
  await createMeasure(h, "Total Followers", "Sum(Followers)");

  // Gift certificates
  await createMeasure(h, "Certs Sold Count", "Count(GiftCertID)");
  await createMeasure(h, "Certs Sold Value", "Sum(CertValue)");
  await createMeasure(h, "Certs Redeemed Count", "Sum(IsRedeemed)");
  await createMeasure(h, "Certs Redeemed Value", "Sum(If(IsRedeemed=1, CertValue))");
  await createMeasure(h, "Certs Redemption Rate%", "Sum(IsRedeemed) / Count(GiftCertID)");
  await createMeasure(h, "Certs ECOM Share%", "Count(If(StoreID>=24, GiftCertID)) / Count(GiftCertID)");

  // ═══ NEW DIMENSIONS ═══
  console.log("\nAdding new dimensions...");
  await createDimension(h, "Stylist", ["StylistName"]);
  await createDimension(h, "Cert Value", ["CertValue"]);

  // ═══ UPDATE EXISTING SHEETS ═══
  console.log("\nUpdating existing sheets...");

  // Find sheets by title
  const listObj = await send(h, "CreateSessionObject", [{
    qInfo: { qType: "SheetList" },
    qAppObjectListDef: { qType: "sheet", qData: { cells: "/cells" } },
  }]);
  const listLayout = await send(listObj.qReturn.qHandle, "GetLayout", []);
  const sheets = {};
  for (const s of listLayout.qLayout.qAppObjectList.qItems) {
    sheets[s.qMeta.title] = s.qInfo.qId;
  }

  // Add Returns% KPI to Executive Summary
  console.log("\nUpdating Executive Summary...");
  // Sheet is full (24 cols used), add to bottom — extend grid
  // Actually, let's add the returns% as a KPI on the existing summary table area is taken
  // Instead, add new measures to existing objects where possible

  // Add VERME to KPIs Retail sheet
  console.log("\nUpdating KPIs Retail...");
  const retailId = sheets["KPIs Retail"];
  if (retailId) {
    await addObjToSheet(h, retailId, "kpi", "VERME Coverage%", [], [
      { expr: "Sum(PlannedShifts - Overcoverage) / Sum(Demand)", label: "VERME Coverage%" },
    ], { col: 0, row: 12, colspan: 6, rowspan: 3 });
    await addObjToSheet(h, retailId, "kpi", "VERME Occupation%", [], [
      { expr: "Sum(Demand - (Demand - PlannedShifts)) / Sum(PlannedShifts)", label: "VERME Occupation%" },
    ], { col: 6, row: 12, colspan: 6, rowspan: 3 });
    await addObjToSheet(h, retailId, "kpi", "Returns%", [], [
      { expr: "Sum({<IsReturn={1},StoreID={\"<24\"}>} Qty) / Sum({<StoreID={\"<24\"}>} Qty)", label: "Returns%" },
    ], { col: 12, row: 12, colspan: 6, rowspan: 3 });
    await addObjToSheet(h, retailId, "kpi", "Net Sales/Store", [], [
      { expr: "Sum({<IsReturn={0},StoreID={\"<24\"}>} NetAmount) / 23", label: "Net Sales per Store" },
    ], { col: 18, row: 12, colspan: 6, rowspan: 3 });
  }

  // ═══ NEW SHEET: F&F / Stylists ═══
  console.log("\nCreating F&F sheet...");
  const ffId = await createSheet(h, "F&F & Stylists", "F&F client metrics, stylist performance, engagement", 10);
  await addObjToSheet(h, ffId, "kpi", "F&F Clients", [], [
    { expr: "Count(DISTINCT {<ClientSegment={'F&F'}>} ClientID)", label: "Total F&F" },
  ], { col: 0, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, ffId, "kpi", "Assigned to Stylist", [], [
    { expr: "Count(DISTINCT {<ClientSegment={'F&F'}>} If(Not IsNull(StylistID), ClientID))", label: "Assigned" },
  ], { col: 4, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, ffId, "kpi", "F&F Engagement%", [], [
    { expr: "Count(DISTINCT {<IsReturn={0},ClientSegment={'F&F'}>} ClientID) / Count(DISTINCT {<ClientSegment={'F&F'}>} ClientID)", label: "Engagement%" },
  ], { col: 8, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, ffId, "kpi", "F&F Net Sales", [], [
    { expr: "Sum({<IsReturn={0},ClientSegment={'F&F'}>} NetAmount)", label: "F&F Net Sales" },
  ], { col: 12, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, ffId, "kpi", "F&F Share%", [], [
    { expr: "Sum({<IsReturn={0},ClientSegment={'F&F'}>} NetAmount) / Sum({<IsReturn={0}>} NetAmount)", label: "F&F Share in Total" },
  ], { col: 16, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, ffId, "kpi", "Assignment%", [], [
    { expr: "Count(DISTINCT {<ClientSegment={'F&F'}>} If(Not IsNull(StylistID), ClientID)) / Count(DISTINCT {<ClientSegment={'F&F'}>} ClientID)", label: "Assignment%" },
  ], { col: 20, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, ffId, "sn-table", "Stylist Performance", ["StylistName"], [
    { expr: "Count(DISTINCT {<IsReturn={0}>} ClientID)", label: "Clients" },
    { expr: "Sum({<IsReturn={0}>} NetAmount)", label: "Net Sales" },
    { expr: "Sum({<IsReturn={0}>} NetAmount) / Count(DISTINCT {<IsReturn={0}>} ClientID)", label: "Sales/Client" },
    { expr: "Count(DISTINCT {<IsReturn={0}>} TransactionID) / Count(DISTINCT {<IsReturn={0}>} ClientID)", label: "Freq" },
    { expr: "Sum({<IsReturn={0}>} NetAmount) / Count(DISTINCT {<IsReturn={0}>} TransactionID)", label: "AOV" },
  ], { col: 0, row: 3, colspan: 24, rowspan: 9 });

  // ═══ NEW SHEET: Gift Certificates ═══
  console.log("\nCreating Gift Certificates sheet...");
  const gcId = await createSheet(h, "Gift Certificates", "Gift certificate sales, redemption, ECOM share", 11);
  await addObjToSheet(h, gcId, "kpi", "Certs Sold", [], [
    { expr: "Count(GiftCertID)", label: "Sold Count" },
  ], { col: 0, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, gcId, "kpi", "Certs Sold Value", [], [
    { expr: "Sum(CertValue)", label: "Sold Value" },
  ], { col: 4, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, gcId, "kpi", "Redemption Rate", [], [
    { expr: "Sum(IsRedeemed) / Count(GiftCertID)", label: "Redemption Rate%" },
  ], { col: 8, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, gcId, "kpi", "Redeemed Value", [], [
    { expr: "Sum(If(IsRedeemed=1, CertValue))", label: "Redeemed Value" },
  ], { col: 12, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, gcId, "kpi", "ECOM Share%", [], [
    { expr: "Count(If(StoreID>=24, GiftCertID)) / Count(GiftCertID)", label: "ECOM Share%" },
  ], { col: 16, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, gcId, "kpi", "Unredeemed Value", [], [
    { expr: "Sum(If(IsRedeemed=0, CertValue))", label: "Unredeemed" },
  ], { col: 20, row: 0, colspan: 4, rowspan: 3 });
  await addObjToSheet(h, gcId, "barchart", "Certs Sold by Week", ["WeekNum"], [
    { expr: "Sum(CertValue)", label: "Sold Value" },
    { expr: "Sum(If(IsRedeemed=1, CertValue))", label: "Redeemed Value" },
  ], { col: 0, row: 3, colspan: 16, rowspan: 9 });
  await addObjToSheet(h, gcId, "sn-table", "Certs by Denomination", ["CertValue"], [
    { expr: "Count(GiftCertID)", label: "Sold" },
    { expr: "Sum(IsRedeemed)", label: "Redeemed" },
    { expr: "Sum(IsRedeemed)/Count(GiftCertID)", label: "Redemption%" },
    { expr: "Count(If(StoreID>=24, GiftCertID))/Count(GiftCertID)", label: "ECOM Share%" },
  ], { col: 16, row: 3, colspan: 8, rowspan: 9 });

  // ═══ UPDATE MARKETING SHEET with ER ═══
  console.log("\nUpdating Marketing sheet...");
  const mktId = sheets["Brand Marketing"];
  if (mktId) {
    await addObjToSheet(h, mktId, "kpi", "ER Instagram", [], [
      { expr: "Sum(If(MarketingPlatform='Instagram', Likes+Comments)) / Sum(If(MarketingPlatform='Instagram', Followers))", label: "ER IG%" },
    ], { col: 0, row: 12, colspan: 6, rowspan: 3 });
    await addObjToSheet(h, mktId, "kpi", "ER Telegram", [], [
      { expr: "Sum(If(MarketingPlatform='Telegram', Reactions)) / Sum(If(MarketingPlatform='Telegram', Views))", label: "ER TG%" },
    ], { col: 6, row: 12, colspan: 6, rowspan: 3 });
    await addObjToSheet(h, mktId, "kpi", "Total Views", [], [
      { expr: "Sum(Views)", label: "Views" },
    ], { col: 12, row: 12, colspan: 6, rowspan: 3 });
    await addObjToSheet(h, mktId, "kpi", "Total Followers", [], [
      { expr: "Sum(Followers)", label: "Followers" },
    ], { col: 18, row: 12, colspan: 6, rowspan: 3 });
  }

  // ═══ SAVE ═══
  await send(h, "DoSave", []);
  console.log("\nDone! All updates saved.");
  ws.close();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
