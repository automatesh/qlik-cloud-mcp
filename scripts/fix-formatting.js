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

// Number format presets
const FMT = {
  money: { qType: "I", qnDec: 0, qUseThou: 1, qFmt: "# ##0", qDec: ".", qThou: " " },
  pct: { qType: "F", qnDec: 1, qUseThou: 0, qFmt: "0.0%", qDec: "." },
  pct2: { qType: "F", qnDec: 2, qUseThou: 0, qFmt: "0.00%", qDec: "." },
  decimal1: { qType: "F", qnDec: 1, qUseThou: 0, qFmt: "0.0", qDec: "." },
  decimal2: { qType: "F", qnDec: 2, qUseThou: 0, qFmt: "0.00", qDec: "." },
  int: { qType: "I", qnDec: 0, qUseThou: 1, qFmt: "# ##0", qDec: ".", qThou: " " },
};

// Map measure labels to formats
const LABEL_FORMATS = {
  // Percentages
  "GM%": FMT.pct, "Gross Margin %": FMT.pct, "CR%": FMT.pct, "Returns%": FMT.pct,
  "Share%": FMT.pct, "Sales Share%": FMT.pct, "Stock Share%": FMT.pct, "STR%": FMT.pct,
  "Staffing%": FMT.pct, "VERME Coverage%": FMT.pct, "VERME Occupation%": FMT.pct,
  "WoW": FMT.pct, "YoY": FMT.pct, "Engagement%": FMT.pct, "Assignment%": FMT.pct,
  "F&F Share in Total": FMT.pct, "DRR%": FMT.pct2, "Redemption Rate%": FMT.pct,
  "ECOM Share%": FMT.pct, "Redemption%": FMT.pct, "Positive%": FMT.pct, "Negative%": FMT.pct2,
  "Turnover%": FMT.pct, "ER IG%": FMT.pct2, "ER TG%": FMT.pct2,
  // Money
  "Net Sales": FMT.money, "Net Sales Total": FMT.money, "Revenue": FMT.money,
  "Gross Sales": FMT.money, "COGS": FMT.money, "AOV": FMT.money, "AUP": FMT.money,
  "Net Sales per Store": FMT.money, "F&F Net Sales": FMT.money, "Sales/Client": FMT.money,
  "Stock Total RRP": FMT.money, "Stock RRP": FMT.money, "Sold Value": FMT.money,
  "Redeemed Value": FMT.money, "Unredeemed": FMT.money, "Spend": FMT.money,
  "Cash": FMT.money, "Deposits": FMT.money, "Debt": FMT.money,
  "AR": FMT.money, "AP": FMT.money, "Inventory": FMT.money, "NWC": FMT.money,
  // Decimals
  "UPT": FMT.decimal2, "CSI Score": FMT.decimal1, "Freq": FMT.decimal2,
  "Lead Time (days)": FMT.decimal1, "OTIF%": FMT.pct, "OnTime%": FMT.pct,
  "Mystery Shopper": FMT.decimal1,
  // Integers
  "Traffic": FMT.int, "Sessions": FMT.int, "Transactions": FMT.int,
  "Units": FMT.int, "Stock Qty": FMT.int, "Not Available": FMT.int,
  "Clients": FMT.int, "Total F&F": FMT.int, "Assigned": FMT.int, "Orders": FMT.int,
  "Sold Count": FMT.int, "Sold": FMT.int, "Redeemed": FMT.int,
  "Shipments": FMT.int, "Damaged": FMT.int, "Plan": FMT.int, "Actual": FMT.int,
  "Reach": FMT.int, "Golden Reach": FMT.int, "Total Reach": FMT.int,
  "Engagements": FMT.int, "Clicks": FMT.int, "Views": FMT.int,
  "Followers": FMT.int, "Responses": FMT.int,
};

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
  console.log("App opened.\n");

  // ═══ FIX MASTER MEASURE FORMATS ═══
  console.log("Fixing master measure formats...");
  const measList = await send(h, "CreateSessionObject", [{
    qInfo: { qType: "MeasureList" },
    qMeasureListDef: { qType: "measure" },
  }]);
  const measLayout = await send(measList.qReturn.qHandle, "GetLayout", []);
  const measures = measLayout.qLayout.qMeasureList.qItems;

  let fixedMeas = 0;
  for (const m of measures) {
    const fmt = LABEL_FORMATS[m.qData?.title || m.qMeta?.title];
    if (!fmt) continue;
    try {
      const obj = await send(h, "GetObject", [m.qInfo.qId]);
      const oh = obj.qReturn.qHandle;
      const props = (await send(oh, "GetProperties", [])).qProp;
      props.qMeasure.qNumFormat = fmt;
      await send(oh, "SetProperties", [props]);
      fixedMeas++;
    } catch (e) { /* skip */ }
  }
  console.log(`  Fixed ${fixedMeas} master measures.\n`);

  // ═══ FIX OBJECT MEASURE FORMATS ═══
  console.log("Fixing object measure formats...");
  const listObj = await send(h, "CreateSessionObject", [{
    qInfo: { qType: "SheetList" },
    qAppObjectListDef: { qType: "sheet", qData: { cells: "/cells" } },
  }]);
  const listLayout = await send(listObj.qReturn.qHandle, "GetLayout", []);

  let fixedObj = 0;
  for (const sheet of listLayout.qLayout.qAppObjectList.qItems) {
    const sheetObj = await send(h, "GetObject", [sheet.qInfo.qId]);
    const sheetLayout = await send(sheetObj.qReturn.qHandle, "GetLayout", []);

    for (const cell of sheetLayout.qLayout.cells) {
      try {
        const obj = await send(h, "GetObject", [cell.name]);
        const oh = obj.qReturn.qHandle;
        const props = (await send(oh, "GetProperties", [])).qProp;
        const measures = props.qHyperCubeDef?.qMeasures || [];
        let changed = false;

        for (const meas of measures) {
          const label = meas.qDef?.qLabel;
          const fmt = LABEL_FORMATS[label];
          if (fmt && JSON.stringify(meas.qDef.qNumFormat) !== JSON.stringify(fmt)) {
            meas.qDef.qNumFormat = fmt;
            changed = true;
          }
        }

        if (changed) {
          await send(oh, "SetProperties", [props]);
          fixedObj++;
        }
      } catch (e) { /* skip */ }
    }
  }
  console.log(`  Fixed formats in ${fixedObj} objects.\n`);

  // ═══ ADD WoW/YoY COLUMNS TO KEY TABLES ═══
  console.log("Adding WoW/YoY columns to tables...");

  // Helper: find object by title in a sheet
  async function findObject(sheetId, title) {
    const sheetObj = await send(h, "GetObject", [sheetId]);
    const layout = await send(sheetObj.qReturn.qHandle, "GetLayout", []);
    for (const cell of layout.qLayout.cells) {
      try {
        const obj = await send(h, "GetObject", [cell.name]);
        const oh = obj.qReturn.qHandle;
        const ol = await send(oh, "GetLayout", []);
        if (ol.qLayout.title === title) return { handle: oh, id: cell.name };
      } catch (e) { }
    }
    return null;
  }

  // Find sheets by title
  const sheets = {};
  for (const s of listLayout.qLayout.qAppObjectList.qItems) {
    sheets[s.qMeta.title] = s.qInfo.qId;
  }

  // Add WoW% to Sales Summary by Channel
  const salesTable = await findObject(sheets["Executive Summary"], "Sales Summary by Channel");
  if (salesTable) {
    const props = (await send(salesTable.handle, "GetProperties", [])).qProp;
    const hasWoW = props.qHyperCubeDef.qMeasures.some(m => m.qDef?.qLabel === "WoW%");
    if (!hasWoW) {
      props.qHyperCubeDef.qMeasures.push(
        {
          qDef: {
            qDef: "(Sum({<IsReturn={0},Date={\">=$(=Date(Max(Date)-6,'YYYY-MM-DD'))<==$(=Date(Max(Date),'YYYY-MM-DD'))\"}> } NetAmount) / Sum({<IsReturn={0},Date={\">=$(=Date(Max(Date)-13,'YYYY-MM-DD'))<==$(=Date(Max(Date)-7,'YYYY-MM-DD'))\"}> } NetAmount)) - 1",
            qLabel: "WoW%",
            qNumFormat: FMT.pct,
          },
          qSortBy: { qSortByNumeric: -1 },
        },
      );
      await send(salesTable.handle, "SetProperties", [props]);
      console.log("  Added WoW% to Sales Summary by Channel");
    }
  }

  // Add WoW% to Retail by Territory
  const retailTable = await findObject(sheets["KPIs Retail"], "Retail by Territory");
  if (retailTable) {
    const props = (await send(retailTable.handle, "GetProperties", [])).qProp;
    const hasWoW = props.qHyperCubeDef.qMeasures.some(m => m.qDef?.qLabel === "Sales WoW%");
    if (!hasWoW) {
      props.qHyperCubeDef.qMeasures.push(
        {
          qDef: {
            qDef: "(Sum({<IsReturn={0},StoreID={\"<24\"},Date={\">=$(=Date(Max(Date)-6,'YYYY-MM-DD'))<==$(=Date(Max(Date),'YYYY-MM-DD'))\"}> } NetAmount) / Sum({<IsReturn={0},StoreID={\"<24\"},Date={\">=$(=Date(Max(Date)-13,'YYYY-MM-DD'))<==$(=Date(Max(Date)-7,'YYYY-MM-DD'))\"}> } NetAmount)) - 1",
            qLabel: "Sales WoW%",
            qNumFormat: FMT.pct,
          },
          qSortBy: { qSortByNumeric: -1 },
        },
      );
      await send(retailTable.handle, "SetProperties", [props]);
      console.log("  Added Sales WoW% to Retail by Territory");
    }
  }

  // Add vs Budget to Strategic Categories
  const stratTable = await findObject(sheets["Product by Strategic Category"], "Strategic Categories");
  if (stratTable) {
    const props = (await send(stratTable.handle, "GetProperties", [])).qProp;
    const hasBudget = props.qHyperCubeDef.qMeasures.some(m => m.qDef?.qLabel === "GM% vs Target");
    if (!hasBudget) {
      props.qHyperCubeDef.qMeasures.push(
        {
          qDef: {
            qDef: "(1 - Sum({<IsReturn={0}>} Qty*UnitCost)/Sum({<IsReturn={0}>} NetAmount)) - 0.74",
            qLabel: "GM% vs Target",
            qNumFormat: FMT.pct,
          },
          qSortBy: { qSortByNumeric: -1 },
        },
      );
      await send(stratTable.handle, "SetProperties", [props]);
      console.log("  Added GM% vs Target to Strategic Categories");
    }
  }

  // Add ECOM WoW% to ECOM by Channel
  const ecomTable = await findObject(sheets["KPIs ECOM"], "ECOM by Channel");
  if (ecomTable) {
    const props = (await send(ecomTable.handle, "GetProperties", [])).qProp;
    const hasWoW = props.qHyperCubeDef.qMeasures.some(m => m.qDef?.qLabel === "Rev WoW%");
    if (!hasWoW) {
      props.qHyperCubeDef.qMeasures.push(
        {
          qDef: {
            qDef: "(Sum({<IsReturn={0},StoreID={\">=24\"},Date={\">=$(=Date(Max(Date)-6,'YYYY-MM-DD'))<==$(=Date(Max(Date),'YYYY-MM-DD'))\"}> } NetAmount) / Sum({<IsReturn={0},StoreID={\">=24\"},Date={\">=$(=Date(Max(Date)-13,'YYYY-MM-DD'))<==$(=Date(Max(Date)-7,'YYYY-MM-DD'))\"}> } NetAmount)) - 1",
            qLabel: "Rev WoW%",
            qNumFormat: FMT.pct,
          },
          qSortBy: { qSortByNumeric: -1 },
        },
      );
      await send(ecomTable.handle, "SetProperties", [props]);
      console.log("  Added Rev WoW% to ECOM by Channel");
    }
  }

  // ═══ SAVE ═══
  await send(h, "DoSave", []);
  console.log("\nDone! All formatting fixes saved.");
  ws.close();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
