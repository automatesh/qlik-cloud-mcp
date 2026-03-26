const WebSocket = require("ws");

const TENANT = "x2bsmja3t4khq5z.us.qlikcloud.com";
const APP_ID = "f22efcef-19e1-4d0e-9cf3-70b740eeec80";
const API_KEY = process.env.QLIK_API_KEY;

let ws, reqId = 0;
const pending = new Map();

function send(handle, method, params = []) {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params }));
  });
}

const TYPE_MAP = {
  barchart: "sn-bar-chart",
  table: "sn-table",
  piechart: "sn-pie-chart",
};

async function main() {
  ws = new WebSocket(`wss://${TENANT}/app/${APP_ID}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });

  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
  const doc = await send(-1, "OpenDoc", [APP_ID]);
  const h = doc.qReturn.qHandle;
  console.log("App opened.\n");

  // Get all sheets
  const listObj = await send(h, "CreateSessionObject", [{
    qInfo: { qType: "SheetList" },
    qAppObjectListDef: { qType: "sheet", qData: { cells: "/cells" } },
  }]);
  const listLayout = await send(listObj.qReturn.qHandle, "GetLayout", []);
  const sheets = listLayout.qLayout.qAppObjectList.qItems;

  let fixed = 0;

  for (const sheet of sheets) {
    const sheetObj = await send(h, "GetObject", [sheet.qInfo.qId]);
    const sheetHandle = sheetObj.qReturn.qHandle;
    const sheetLayout = await send(sheetHandle, "GetLayout", []);
    const cells = sheetLayout.qLayout.cells;

    const sheetProps = (await send(sheetHandle, "GetProperties", [])).qProp;
    let sheetChanged = false;

    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];

      // Find the object
      let objHandle, objProps;
      try {
        const obj = await send(h, "GetObject", [cell.name]);
        objHandle = obj.qReturn.qHandle;
        objProps = (await send(objHandle, "GetProperties", [])).qProp;
      } catch (e) {
        console.log(`  SKIP ${cell.name}: can't get object`);
        continue;
      }

      const actualType = objProps.qInfo.qType;
      const newType = TYPE_MAP[actualType];
      if (!newType) continue; // already correct or KPI

      console.log(`  ${sheet.qMeta.title} / ${objProps.title}: ${actualType} → ${newType}`);

      // Read the hypercube definition
      const hcDef = objProps.qHyperCubeDef;
      const title = objProps.title;
      const showTitles = objProps.showTitles;

      // Delete the old object
      await send(h, "DestroyObject", [cell.name]);

      // Create new object with correct type
      const newObj = await send(h, "CreateObject", [{
        qInfo: { qType: newType },
        qHyperCubeDef: hcDef,
        title,
        showTitles: showTitles !== false,
        visualization: newType,
      }]);

      const newId = newObj.qReturn.qGenericId;

      // Get the actual short ID assigned by engine
      const newObjHandle = newObj.qReturn.qHandle;
      const newLayout = await send(newObjHandle, "GetLayout", []);
      const shortId = newLayout.qLayout.qInfo.qId;

      // Update sheet cell
      sheetProps.cells[ci].name = shortId;
      sheetProps.cells[ci].type = newType;
      sheetChanged = true;
      fixed++;

      console.log(`    → new: ${shortId} (${newType})`);
    }

    if (sheetChanged) {
      await send(sheetHandle, "SetProperties", [sheetProps]);
      console.log(`  ✓ Sheet updated: ${sheet.qMeta.title}`);
    }
  }

  await send(h, "DoSave", []);
  console.log(`\nDone. Recreated ${fixed} objects. Saved.`);
  ws.close();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
