export const stockAsOfDate = new Date("2026-08-25T06:00:00Z");

export const frpColumns = [
  { key: "item", headerKey: "item" },
  { key: "diameter", headerKey: "diameter" },
  { key: "length", headerKey: "length" },
  { key: "xbz", headerKey: "xbz" },
  { key: "spoolNumber", headerKey: "spoolNumber" },
  { key: "location", headerKey: "location" },
  { key: "note", headerKey: "note" },
];

export const coatedFrpColumns = [
  { key: "diameter", headerKey: "diameter" },
  { key: "length", headerKey: "length" },
  { key: "xbz", headerKey: "xbz" },
  { key: "spoolNumber", headerKey: "spoolNumber" },
  { key: "location", headerKey: "location" },
  { key: "note", headerKey: "note" },
];

export const fillerColumns = [
  { key: "color", headerKey: "color" },
  { key: "diameter", headerKey: "diameter" },
  { key: "length", headerKey: "lengthPlain" },
  { key: "spoolNumber", headerKey: "spoolNumber" },
  { key: "flameRetardant", headerKey: "flameRetardant", type: "boolean" },
  { key: "location", headerKey: "location" },
  { key: "note", headerKey: "note" },
];

export const frpMaterials = [
  { id: "frp-1", item: "993916000000346", diameter: 2.3, length: 20, xbz: "XB", spoolNumber: "Y232", location: "ST01", note: "-" },
  { id: "frp-2", item: "993916000000346", diameter: 2.3, length: 15, xbz: "XB", spoolNumber: "Y230", location: "ST02", note: "-" },
  { id: "frp-3", item: "993916000000346", diameter: 2.3, length: 15, xbz: "XB", spoolNumber: "Y184", location: "ST03", note: "-" },
  { id: "frp-4", item: "993916000000219", diameter: 1.8, length: 43.1, xbz: "XB", spoolNumber: "Y222", location: "ST 04", note: "-" },
  { id: "frp-5", item: "993916000000346", diameter: 2.3, length: 12.554, xbz: "XB", spoolNumber: "Y202", location: "ST 1-4", note: "-" },
  { id: "frp-6", item: "993916000000119", diameter: 1.6, length: 5.53, xbz: "Z", spoolNumber: "Y131", location: "ST 1-4", note: "-" },
  { id: "frp-7", item: "993916000000346", diameter: 2.3, length: 48.8, xbz: "XB", spoolNumber: "Y250", location: "ST 3/4", note: "-" },
  { id: "frp-8", item: "993916000000125", diameter: 2.4, length: 4.422, xbz: "Z", spoolNumber: "Y117", location: "ST 1-4", note: "-" },
  { id: "frp-9", item: "993916000000219", diameter: 1.8, length: 32.151, xbz: "XB", spoolNumber: "Y223", location: "ST 1-4", note: "-" },
];

export const coatedFrpMaterials = [
  { id: "cfrp-1", diameter: 2.9, length: 18.2, xbz: "XB", spoolNumber: "Y311", location: "ST05", note: "-" },
  { id: "cfrp-2", diameter: 2.9, length: 22.6, xbz: "XB", spoolNumber: "Y312", location: "ST05", note: "-" },
  { id: "cfrp-3", diameter: 2.6, length: 9.75, xbz: "Z", spoolNumber: "Y298", location: "ST 1-4", note: "-" },
  { id: "cfrp-4", diameter: 2.9, length: 37.4, xbz: "XB", spoolNumber: "Y320", location: "ST 2-3", note: "-" },
  { id: "cfrp-5", diameter: 3.1, length: 6.318, xbz: "Z", spoolNumber: "Y287", location: "ST06", note: "-" },
  { id: "cfrp-6", diameter: 2.6, length: 41.05, xbz: "XB", spoolNumber: "Y305", location: "ST 1-4", note: "-" },
  { id: "cfrp-7", diameter: 3.1, length: 14.9, xbz: "Z", spoolNumber: "Y290", location: "ST07", note: "-" },
];

export const fillerMaterials = [
  { id: "fil-1", color: "Czarny", diameter: 1.1, length: 25.4, spoolNumber: "F102", flameRetardant: true, location: "ST08", note: "-" },
  { id: "fil-2", color: "Naturalny", diameter: 1.1, length: 19.75, spoolNumber: "F108", flameRetardant: false, location: "ST08", note: "-" },
  { id: "fil-3", color: "Czarny", diameter: 0.9, length: 52.3, spoolNumber: "F095", flameRetardant: true, location: "ST 1-4", note: "-" },
  { id: "fil-4", color: "Żółty", diameter: 1.1, length: 8.612, spoolNumber: "F110", flameRetardant: false, location: "ST 3/4", note: "-" },
  { id: "fil-5", color: "Naturalny", diameter: 0.9, length: 30.05, spoolNumber: "F099", flameRetardant: false, location: "ST09", note: "-" },
  { id: "fil-6", color: "Czarny", diameter: 1.3, length: 11.847, spoolNumber: "F121", flameRetardant: true, location: "ST 1-4", note: "-" },
];
