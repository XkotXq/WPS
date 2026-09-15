// Mock data for "Zamówienia" > "Lista zamówień" - a from-scratch concept
// page, same local-only status as Materiały SM (see AGENTS.md): this
// section has no backend endpoint yet, so this seed stands in for what a
// real order list pulled from CIP would look like until one exists.
//
// `line` uses the plant's real line codes (same series already seen as
// location/note values in lib/smMaterialsSeed.js, e.g. "SH01"/"SH02"/"ST01"):
// SH01-SH07, ST01-ST13, FC01-FC03, FL01 - not a made-up "Linia 1/2/3/4".
//
// `items` is each order's own line items - itemNo/itemName pulled from the
// same real FRP/filler catalog as smMaterialsSeed.js, quantity as the
// summed figure the real paper order list carries (see AGENTS.md's
// "Materiały SM" section: an order only ever states item + total quantity,
// spool numbers get assigned later - not modeled here since this is just
// the order list, not a receipt).
export const ORDERS_CIP_SEED = [
  {
    orderNo: "ZM/2026/0142",
    status: "new",
    line: "SH02",
    employeeNo: "4601260",
    createdAt: "2026-09-15T07:12:00",
    note: "-",
    items: [{ itemNo: "993916000000219", itemName: "FRP 1.8mm/VIP", quantity: "146.400", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0141",
    status: "inProgress",
    line: "ST05",
    employeeNo: "4602118",
    createdAt: "2026-09-15T06:48:00",
    note: "Pilne",
    items: [
      { itemNo: "993916000000304", itemName: "FRP 3.5mm/VIP", quantity: "97.600", note: "-" },
      { itemNo: "993916000000115", itemName: "FRP/Φ3.7mm", quantity: "12.300", note: "Na jutro rano" },
    ],
  },
  {
    orderNo: "ZM/2026/0140",
    status: "done",
    line: "SH01",
    employeeNo: "4601260",
    createdAt: "2026-09-14T14:05:00",
    note: "-",
    items: [{ itemNo: "993916000000404", itemName: "Coated FRP 1.8/1.9-/-M", quantity: "48.800", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0139",
    status: "done",
    line: "FC01",
    employeeNo: "4603092",
    createdAt: "2026-09-14T11:30:00",
    note: "-",
    items: [{ itemNo: "993902000000097", itemName: "2.2mm White Foamed Filler", quantity: "142", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0138",
    status: "cancelled",
    line: "ST11",
    employeeNo: "4602118",
    createdAt: "2026-09-14T09:15:00",
    note: "Zdublowane zamówienie",
    items: [{ itemNo: "993916000000239", itemName: "Coated FRP/1.3mm*1.4mm", quantity: "12.400", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0137",
    status: "done",
    line: "SH04",
    employeeNo: "4601934",
    createdAt: "2026-09-13T15:40:00",
    note: "-",
    items: [
      { itemNo: "993916000000129", itemName: "Coated FRP/1.8*1.9-/-M", quantity: "1.570", note: "-" },
      { itemNo: "993916000000128", itemName: "Coated FRP/1.6*1.7-/-M", quantity: "12.731", note: "-" },
    ],
  },
  {
    orderNo: "ZM/2026/0136",
    status: "done",
    line: "FL01",
    employeeNo: "4604417",
    createdAt: "2026-09-13T10:02:00",
    note: "-",
    items: [{ itemNo: "993902000000167", itemName: "PP/White (for filler) (made in China)", quantity: "3200", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0135",
    status: "inProgress",
    line: "FC02",
    employeeNo: "4603092",
    createdAt: "2026-09-12T16:20:00",
    note: "Czeka na FRP 1.8mm/VIP",
    items: [{ itemNo: "993916000000219", itemName: "FRP 1.8mm/VIP", quantity: "50.000", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0134",
    status: "done",
    line: "ST05",
    employeeNo: "4602118",
    createdAt: "2026-09-12T08:55:00",
    note: "-",
    items: [{ itemNo: "993916000000009", itemName: "FRP/Φ1.2mm", quantity: "6.850", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0133",
    status: "done",
    line: "SH07",
    employeeNo: "4601260",
    createdAt: "2026-09-11T13:18:00",
    note: "-",
    items: [{ itemNo: "993916000000310", itemName: "FRP 1.4mm/VIP", quantity: "18.160", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0132",
    status: "cancelled",
    line: "SH02",
    employeeNo: "4601934",
    createdAt: "2026-09-11T07:40:00",
    note: "Błędna lokalizacja",
    items: [{ itemNo: "993916000000254", itemName: "Coated FRP 1.6*1.7-H-M (High Module)", quantity: "3.205", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0131",
    status: "done",
    line: "FL01",
    employeeNo: "4604417",
    createdAt: "2026-09-10T12:00:00",
    note: "-",
    items: [
      { itemNo: "995402000010126", itemName: "Water Blocking Yarn/S1800", quantity: "5.100", note: "-" },
      { itemNo: "993908000000090", itemName: "Aramid yarn/220dtex/Imported", quantity: "39", note: "-" },
    ],
  },
  {
    orderNo: "ZM/2026/0130",
    status: "done",
    line: "ST13",
    employeeNo: "4603092",
    createdAt: "2026-09-10T09:25:00",
    note: "-",
    items: [{ itemNo: "993916000000307", itemName: "FRP 3.0mm/VIP", quantity: "5.610", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0129",
    status: "done",
    line: "ST09",
    employeeNo: "4602118",
    createdAt: "2026-09-09T15:52:00",
    note: "-",
    items: [{ itemNo: "993916000000059", itemName: "High-strength FRP/1.8mm (for top telecom contract)", quantity: "2.980", note: "-" }],
  },
  {
    orderNo: "ZM/2026/0128",
    status: "done",
    line: "FC03",
    employeeNo: "4601260",
    createdAt: "2026-09-09T08:10:00",
    note: "-",
    items: [{ itemNo: "993916000000468", itemName: "FRP with steel wire reinforced Φ0.45*3.0mm", quantity: "7.150", note: "-" }],
  },
].map((order) => ({ id: order.orderNo, ...order }));
