const WebSocket = require("ws");

const TENANT = "x2bsmja3t4khq5z.us.qlikcloud.com";
const APP_ID = "f22efcef-19e1-4d0e-9cf3-70b740eeec80";
const API_KEY = process.env.QLIK_API_KEY;

// ─── Qlik Load Script ───────────────────────────────────────────────

const qlikScript = `
SET ThousandSep=' ';
SET DecimalSep='.';
SET MoneyThousandSep=' ';
SET MoneyDecimalSep='.';
SET MoneyFormat='# ##0.00';
SET DateFormat='YYYY-MM-DD';
SET TimestampFormat='YYYY-MM-DD hh:mm:ss';

// ════════════════════ DIMENSIONS ════════════════════

dim_country:
LOAD * INLINE [
CountryCode, CountryName
RU, Russia
KZ, Kazakhstan
UAE, UAE
UZ, Uzbekistan
CN, China
PT, Portugal
];

dim_channel:
LOAD * INLINE [
ChannelID, ChannelName, ChannelType
1, Retail, Offline
2, ECOM RU, Online
3, Lamoda, Marketplace
4, Ounass, Marketplace
5, Shopify, Online
];

dim_store:
LOAD * INLINE [
StoreID, StoreName, City, Territory, StoreGrade, CountryCode, ChannelID
1, Metropolis, Moscow, Moscow, F, RU, 1
2, Aviapark, Moscow, Moscow, F, RU, 1
3, Afimall, Moscow, Moscow, A+, RU, 1
4, Mega Khimki, Moscow, Moscow Region, A, RU, 1
5, Atrium, Moscow, Moscow, A, RU, 1
6, Oceania, Moscow, Moscow, A, RU, 1
7, Khorosho, Moscow, Moscow, B, RU, 1
8, Outlet Arkhangelskoye, Moscow, Moscow Region, Outlet, RU, 1
9, Galeria, SPB, SPB, A+, RU, 1
10, Nevsky, SPB, SPB, A, RU, 1
11, Outlet SPB, SPB, SPB, Outlet, RU, 1
12, Gorizont, Rostov, South, B, RU, 1
13, Mega Rostov, Rostov, South, B, RU, 1
14, Mega Ekaterinburg, Ekaterinburg, Ural, A, RU, 1
15, Mega Novosibirsk, Novosibirsk, Siberia, B, RU, 1
16, Mega Kazan, Kazan, Volga, B, RU, 1
17, Krasnoyarsk Plaza, Krasnoyarsk, Siberia, B, RU, 1
18, Dostyk Plaza, Almaty, Kazakhstan, A, KZ, 1
19, Esentai Mall, Almaty, Kazakhstan, A, KZ, 1
20, Dubai Mall, Dubai, UAE, A+, UAE, 1
21, Mall of Emirates, Dubai, UAE, A, UAE, 1
22, Tashkent City Mall, Tashkent, Uzbekistan, A, UZ, 1
23, Samarkand City, Samarkand, Uzbekistan, B, UZ, 1
24, ECOM RU, Online, Online, ECOM, RU, 2
25, Lamoda, Online, Online, ECOM, RU, 3
26, Ounass, Online, Online, ECOM, UAE, 4
27, Shopify Global, Online, Online, ECOM, UAE, 5
];

dim_warehouse:
LOAD * INLINE [
WarehouseID, WarehouseName, WarehouseType, CountryCode
1, Main Moscow, Central, RU
2, SPB Warehouse, Regional, RU
3, Ekaterinburg WH, Regional, RU
4, Novosibirsk WH, Regional, RU
5, Almaty WH, Regional, KZ
6, Dubai WH, Regional, UAE
7, Tashkent WH, Regional, UZ
8, Transit Hub, Transit, RU
];

// ─── dim_product: 300 SKUs generated ───

dim_product:
LOAD
  RowNo() as ProductID,
  Pick(Mod(RowNo()-1, 15)+1, 'Coat','Trench','Bomber','Blazer','Dress','Skirt','Trousers','Jeans','Sweater','T-Shirt','Shirt','Bag','Shoes','Scarf','Accessories') as ProductCategory,
  Pick(Mod(RowNo()-1, 15)+1, 'Outerwear','Outerwear','Outerwear','Outerwear','Dresses','Bottoms','Bottoms','Bottoms','Knitwear','Basics','Basics','Accessories','Shoes','Accessories','Accessories') as StrategicCategory,
  Pick(Mod(Floor((RowNo()-1)/15), 5)+1, 'Cashmere','Wool','Cotton','Leather','Silk') as Material,
  Pick(Mod(Floor((RowNo()-1)/75), 4)+1, 'SS24','AW24','SS25','AW25') as Season,
  Pick(Mod(Floor((RowNo()-1)/75), 4)+1, 'Spring-Summer 2024','Autumn-Winter 2024','Spring-Summer 2025','Autumn-Winter 2025') as SeasonFull,
  If(Mod(RowNo(), 4) = 0, 'DP', 'FP') as PriceType,
  Round(5000 + Rand() * 75000) as BasePrice,
  Round((5000 + Rand() * 75000) * (0.22 + Rand() * 0.08)) as ProductUnitCost,
  'SKU-' & Text(RowNo()) as SKU
Autogenerate(300);

// ─── dim_stylist: 16 stylists ───

dim_stylist:
LOAD * INLINE [
StylistID, StylistName
1, Evseeva Ekaterina
2, Petrova Anna
3, Ivanova Maria
4, Sidorova Olga
5, Kuznetsova Elena
6, Morozova Daria
7, Volkova Natalia
8, Pavlova Yulia
9, Lebedeva Irina
10, Sokolova Ksenia
11, Fedorova Alina
12, Egorova Victoria
13, Kozlova Anastasia
14, Makarova Polina
15, Novikova Svetlana
16, Zaitseva Tatiana
];

// ─── dim_client: 5000 clients ───

dim_client:
LOAD
  RowNo() as ClientID,
  Pick(
    If(Rand() < 0.02, 1,
      If(Rand() < 0.12, 2,
        If(Rand() < 0.35, 3,
          If(Rand() < 0.72, 4, 5)
        )
      )
    ),
    'F&F', 'Loyal', 'Growing', 'Young', 'Unrecognized'
  ) as ClientSegment,
  If(Rand() < 0.65, 'Female', 'Male') as Gender,
  Date(MakeDate(2020,1,1) + Floor(Rand() * 1800), 'YYYY-MM-DD') as FirstPurchaseDate,
  // F&F clients: ~70% assigned to stylist (2449/3429)
  If(Rand() < 0.02,
    If(Rand() < 0.71, Ceil(Rand() * 16), Null()),
    Null()
  ) as StylistID
Autogenerate(5000);

// ─── dim_date: 397 days (2024-01-01 to 2025-02-01) ───

dim_date:
LOAD
  Date(MakeDate(2024,1,1) + RowNo() - 1, 'YYYY-MM-DD') as Date,
  Year(MakeDate(2024,1,1) + RowNo() - 1) as Year,
  Month(MakeDate(2024,1,1) + RowNo() - 1) as MonthName,
  Num(Month(MakeDate(2024,1,1) + RowNo() - 1)) as MonthNum,
  Week(MakeDate(2024,1,1) + RowNo() - 1) as WeekNum,
  Weekday(MakeDate(2024,1,1) + RowNo() - 1) as DayOfWeek,
  'Q' & Ceil(Num(Month(MakeDate(2024,1,1) + RowNo() - 1))/3) as Quarter,
  If(Year(MakeDate(2024,1,1) + RowNo() - 1) = 2025, 'CY', 'LY') as YearType
Autogenerate(397);

// ════════════════════ FACTS ════════════════════

// ─── fact_sales: 1,700,000 rows ───
// Grain: 1 row = 1 line item in a transaction
// Uses preceding LOAD for consistent _day + seasonality + UnitCost tied to UnitPrice

LET vDays = 397;

fact_sales:
LOAD
  SaleLineID,
  Date(MakeDate(2024,1,1) + _day, 'YYYY-MM-DD') as Date,
  StoreID,
  // Season-weighted ProductID: 60% current season, 40% random
  If(_rSeason < 0.6,
    If(_day < 90, Ceil(_rProd * 75),
      If(_day < 180, Ceil(_rProd * 75),
        If(_day < 270, 75 + Ceil(_rProd * 75),
          If(_day < 365, 75 + Ceil(_rProd * 75),
            150 + Ceil(_rProd * 75)
          )
        )
      )
    ),
    Ceil(_rProd * 300)
  ) as ProductID,
  ClientID,
  Qty,
  UnitPrice,
  // UnitCost varies by season: SS25=21%, AW24=22%, SS24=27%, AW25=20% (target GM% 73-80%)
  Round(UnitPrice * (
    If(_day < 90, 0.27 + _rCost * 0.06,
      If(_day < 180, 0.25 + _rCost * 0.06,
        If(_day < 270, 0.22 + _rCost * 0.06,
          If(_day < 365, 0.22 + _rCost * 0.06,
            0.20 + _rCost * 0.06
          )
        )
      )
    )
  )) as UnitCost,
  DiscountPct,
  IsReturn,
  // TransactionID: ~680K distinct transactions (~2.5 items each)
  Floor(_rTx * 680000) as TransactionID,
  Round(UnitPrice * Qty * (1 - DiscountPct/100) * If(IsReturn = 1, -1, 1)) as NetAmount,
  Round(UnitPrice * Qty * If(IsReturn = 1, -1, 1)) as GrossAmount
;
LOAD
  RecNo() as SaleLineID,
  Floor(Rand() * $(vDays)) as _day,
  Rand() as _rSeason,
  Rand() as _rProd,
  Rand() as _rCost,
  Rand() as _rTx,

  // Store: 70% retail (1-23), 20% ECOM RU (24), 5% Lamoda (25), 3% Ounass (26), 2% Shopify (27)
  If(Rand() < 0.70, Ceil(Rand() * 23),
    If(Rand() < 0.67, 24,
      If(Rand() < 0.80, 25,
        If(Rand() < 0.75, 26, 27)
      )
    )
  ) as StoreID,

  // Client: 85% identified, 15% unrecognized (walk-in)
  If(Rand() < 0.85, Ceil(Rand() * 5000), Null()) as ClientID,

  // Quantity: mostly 1-2 items
  Ceil(Rand() * If(Rand() < 0.8, 2, 5)) as Qty,

  // Unit price: 3000-80000 range
  Round(3000 + Rand() * 77000) as UnitPrice,

  // Discount: 25% of sales are discounted
  If(Rand() < 0.75, 0,
    Pick(Ceil(Rand() * 5), 10, 20, 30, 40, 50)
  ) as DiscountPct,

  // Return flag: ~12% returns
  If(Rand() < 0.12, 1, 0) as IsReturn,

  // Transaction ID: group ~2.5 items per transaction
  Ceil(RowNo() / 2.5) as TransactionID

Autogenerate(1700000);

// ─── fact_stock: 250,000 rows ───
// Grain: weekly snapshot × warehouse × product subset

fact_stock:
LOAD
  RowNo() as StockRowID,
  Date(MakeDate(2024,1,1) + (Mod(Floor((RowNo()-1) / 2400), 57) * 7), 'YYYY-MM-DD') as Date,
  Mod(Floor((RowNo()-1) / 300), 8) + 1 as WarehouseID,
  Mod(RowNo()-1, 300) + 1 as ProductID,
  Round(Rand() * 200) as QtyAvailable,
  Round(Rand() * 50) as QtyNotAvailable,
  Round(Rand() * 30) as QtyTransit,
  Round(Rand() * 20) as QtyReserve,
  Round(Rand() * 5) as QtyDefect,
  Round((Rand() * 200) * (3000 + Rand() * 77000)) as StockValueRRP
Autogenerate(250000);

// ─── fact_csi: 2,600 rows ───
// Grain: weekly × region × score type

fact_csi:
LOAD
  RowNo() as CSIID,
  Date(MakeDate(2024,1,1) + (Mod(Floor((RowNo()-1) / 45), 57) * 7), 'YYYY-MM-DD') as Date,
  Pick(Mod(Floor((RowNo()-1) / 9), 5) + 1, 'Moscow', 'SPB', 'Regions RU', 'KZ', 'UAE') as CSIRegion,
  Pick(Mod(RowNo()-1, 9) + 1, 'Product Quality', 'Product Fit', 'Product Design', 'Retail Service', 'Delivery Speed', 'Delivery Quality', 'App UX', 'Returns Process', 'Overall') as CSIType,
  Round(60 + Rand() * 40, 1) as CSIScore,
  Ceil(Rand() * 500) as ResponseCount
Autogenerate(2600);

// ─── fact_cashflow: 312 rows ───
// Grain: weekly × country

fact_cashflow:
LOAD
  RowNo() as CashflowID,
  Date(MakeDate(2024,1,1) + (Mod(Floor((RowNo()-1) / 6), 57) * 7), 'YYYY-MM-DD') as Date,
  Pick(Mod(RowNo()-1, 6) + 1, 'RU', 'KZ', 'UAE', 'UZ', 'CN', 'PT') as CountryCode,
  Round(50 + Rand() * 500, 1) as CashBalance,
  Round(Rand() * 200, 1) as Deposits,
  Round(1000 + Rand() * 2000, 1) as Debt,
  Round(500 + Rand() * 1500, 1) as AccountsReceivable,
  Round(400 + Rand() * 1200, 1) as AccountsPayable,
  Round(800 + Rand() * 2000, 1) as InventoryValue
Autogenerate(342);

// ─── fact_marketing: 2,600 rows ───
// Grain: weekly × channel (organic/paid/PR/CRM/influencer) × territory

fact_marketing:
LOAD
  RowNo() as MarketingID,
  Date(MakeDate(2024,1,1) + (Mod(Floor((RowNo()-1) / 50), 57) * 7), 'YYYY-MM-DD') as Date,
  Pick(Mod(Floor((RowNo()-1) / 10), 5) + 1, 'Organic Social', 'Paid Media', 'PR', 'CRM', 'Influencer') as MarketingChannel,
  Pick(Mod(RowNo()-1, 10) + 1, 'Instagram', 'Telegram', 'VK', 'YouTube', 'Email', 'SMS', 'Push', 'Google Ads', 'Yandex Direct', 'TikTok') as MarketingPlatform,
  Round(Rand() * 5000000) as Reach,
  Round(Rand() * 500000) as GoldenReach,
  Round(Rand() * 100000) as Engagements,
  Round(Rand() * 50000) as Clicks,
  Round(Rand() * 2000000) as Spend,
  Round(30 + Rand() * 10, 1) as PositiveSentimentPct,
  Round(0.5 + Rand() * 2, 2) as NegativeSentimentPct,
  // Granular ER metrics
  Ceil(Rand() * 10000000) as Views,
  Ceil(Rand() * 50000) as Reactions,
  Ceil(50000 + Rand() * 2000000) as Followers,
  Ceil(Rand() * 5000) as Comments,
  Ceil(Rand() * 20000) as Likes
Autogenerate(2600);

// ─── fact_hr: 10,000 rows ───
// Grain: weekly × store

fact_hr:
LOAD
  RowNo() as HRID,
  Date(MakeDate(2024,1,1) + (Mod(Floor((RowNo()-1) / 23), 57) * 7), 'YYYY-MM-DD') as Date,
  Mod(RowNo()-1, 23) + 1 as StoreID,
  Ceil(5 + Rand() * 15) as HeadcountPlan,
  Ceil(4 + Rand() * 15) as HeadcountActual,
  Round(85 + Rand() * 15, 1) as StaffingPct,
  Round(Rand() * 10, 1) as TurnoverPct,
  Round(70 + Rand() * 30, 1) as MysteryShopperScore,
  // VERME: coverage ~57%, occupation ~86%
  Ceil(8 + Rand() * 12) as Demand,
  Ceil(3 + Rand() * 10) as PlannedShifts,
  Ceil(Rand() * 3) as Overcoverage
Autogenerate(10000);

// ─── fact_supply_chain: 3,200 rows ───

fact_supply_chain:
LOAD
  RowNo() as SCID,
  Date(MakeDate(2024,1,1) + (Mod(Floor((RowNo()-1) / 8), 57) * 7), 'YYYY-MM-DD') as Date,
  Mod(RowNo()-1, 8) + 1 as WarehouseID,
  Round(80 + Rand() * 20, 1) as OTIFPct,
  Round(85 + Rand() * 15, 1) as OnTimePct,
  Round(1 + Rand() * 7, 1) as LeadTimeDays,
  Ceil(Rand() * 5000) as ShipmentsCount,
  Ceil(Rand() * 200) as DamagedCount
Autogenerate(3200);

// ─── fact_traffic: ~50,000 rows ───
// Grain: daily × store (retail stores + ecom channels)
// Retail: 50-500 visitors/day, ECOM: 5000-50000 sessions/day

fact_traffic:
LOAD
  RowNo() as TrafficID,
  Date(MakeDate(2024,1,1) + Mod(RowNo()-1, 397), 'YYYY-MM-DD') as Date,
  If(Mod(Floor((RowNo()-1) / 397), 27) + 1 <= 23,
    Mod(Floor((RowNo()-1) / 397), 27) + 1,
    Mod(Floor((RowNo()-1) / 397), 27) + 1
  ) as StoreID,
  If(Mod(Floor((RowNo()-1) / 397), 27) + 1 <= 23,
    Ceil(50 + Rand() * 450),
    Ceil(5000 + Rand() * 45000)
  ) as Visitors,
  If(Mod(Floor((RowNo()-1) / 397), 27) + 1 <= 23,
    Ceil((50 + Rand() * 450) * (1 + Rand() * 0.1)),
    Ceil((5000 + Rand() * 45000) * (1.2 + Rand() * 0.2))
  ) as Sessions
Autogenerate(10719);

// ─── fact_gift_cert: ~5,000 rows ───
// Grain: daily transactions for gift certificates

fact_gift_cert:
LOAD
  RowNo() as GiftCertID,
  Date(MakeDate(2024,1,1) + Floor(Rand() * 397), 'YYYY-MM-DD') as Date,
  // 68% ECOM, 32% retail
  If(Rand() < 0.68,
    Pick(Ceil(Rand() * 4), 24, 25, 26, 27),
    Ceil(Rand() * 23)
  ) as StoreID,
  Pick(Ceil(Rand() * 5), 3000, 5000, 10000, 15000, 25000) as CertValue,
  If(Rand() < 0.65, 1, 0) as IsRedeemed,
  If(Rand() < 0.65,
    Date(MakeDate(2024,1,1) + Floor(Rand() * 397), 'YYYY-MM-DD'),
    Null()
  ) as RedeemedDate
Autogenerate(5000);

// ─── fact_budget: ~570 rows ───
// Grain: weekly × metric × target value (57 weeks × 10 metrics)

fact_budget:
LOAD
  RowNo() as BudgetID,
  Date(MakeDate(2024,1,1) + (Mod(Floor((RowNo()-1) / 10), 57) * 7), 'YYYY-MM-DD') as Date,
  Pick(Mod(RowNo()-1, 10) + 1,
    'Net Sales', 'GM%', 'CR%', 'UPT', 'AUP', 'Returns%', 'VERME Coverage%', 'CSI', 'F&F Engagement%', 'DRR%'
  ) as BudgetMetric,
  Pick(Mod(RowNo()-1, 10) + 1,
    3500000000, 0.74, 0.05, 2.3, 38000, 0.086, 0.85, 85, 0.30, 0.025
  ) as BudgetTarget
Autogenerate(570);
`;

// ─── WebSocket helpers ───────────────────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("Connecting to Qlik Engine...");

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

  console.log("Connected. Opening app...");
  const doc = await send(-1, "OpenDoc", [APP_ID]);
  const h = doc.qReturn.qHandle;
  console.log("App opened (handle:", h, ")");

  console.log("Setting load script...");
  await send(h, "SetScript", [qlikScript]);
  console.log("Script set. Starting reload (~2M rows, may take 1-2 min)...");

  const start = Date.now();
  const reloadResult = await send(h, "DoReload", [0, false, false]);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Reload complete in ${elapsed}s. Success:`, reloadResult);

  console.log("Saving app...");
  await send(h, "DoSave", []);
  console.log("Saved.");

  // Get table info to verify
  const layout = await send(h, "GetTablesAndKeys", [{}, {}]);
  if (layout.qtr) {
    console.log("\n=== Tables ===");
    let totalRows = 0;
    for (const t of layout.qtr) {
      console.log(`  ${t.qName}: ${t.qNoOfRows.toLocaleString()} rows, ${t.qFields.length} fields`);
      totalRows += t.qNoOfRows;
    }
    console.log(`\n  TOTAL: ${totalRows.toLocaleString()} rows`);
  }

  ws.close();
  console.log("\nDone!");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
