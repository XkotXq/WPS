// Reads the catalog spreadsheet (importKatalogu.xlsx: Category | Item number |
// Item name | Unit | Remark) into entries for POST /api/sm-catalog/import.
// Runs in the browser; xlsx-js-style is already a dependency (lib/xlsxExport.js).

// Header names accepted per field (lowercased, spaces/underscores/dots
// dropped) - the English ones are what importKatalogu.xlsx uses.
const HEADER_ALIASES = {
  category: ["category", "kategoria"],
  itemNo: ["itemnumber", "itemno", "itemnr", "nritemu", "numeritemu"],
  itemName: ["itemname", "name", "nazwa"],
  unit: ["unit", "jednostka", "jm"],
  remark: ["remark", "remarks", "uwagi", "uwaga"],
};
const FIELDS = ["category", "itemNo", "itemName", "unit", "remark"];

function normalizeHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_.\-]/g, "");
}

// field -> column index, from the first row when it's a header row. No
// recognizable header (first row is already data) -> the fixed column order
// above, with nothing skipped.
function mapColumns(firstRow) {
  const byField = {};
  firstRow.forEach((cell, index) => {
    const header = normalizeHeader(cell);
    for (const field of FIELDS) {
      if (byField[field] === undefined && HEADER_ALIASES[field].includes(header)) byField[field] = index;
    }
  });
  if (byField.itemNo !== undefined && byField.itemName !== undefined) return { columns: byField, hasHeader: true };
  return { columns: Object.fromEntries(FIELDS.map((field, index) => [field, index])), hasHeader: false };
}

// -> { entries, totalRows, duplicates, skipped }
//   entries    unique by item number (the last occurrence wins)
//   duplicates rows repeating an item number already seen
//   skipped    non-empty rows missing the item number or the name
export async function parseCatalogFile(file) {
  const XLSX = (await import("xlsx-js-style")).default;
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { entries: [], totalRows: 0, duplicates: 0, skipped: 0 };

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  if (!rows.length) return { entries: [], totalRows: 0, duplicates: 0, skipped: 0 };

  const { columns, hasHeader } = mapColumns(rows[0]);
  const dataRows = (hasHeader ? rows.slice(1) : rows).filter((row) => row.some((cell) => String(cell).trim()));

  const byItemNo = new Map();
  let duplicates = 0;
  let skipped = 0;
  for (const row of dataRows) {
    const cell = (field) => (columns[field] === undefined ? "" : String(row[columns[field]] ?? "").trim());
    const entry = Object.fromEntries(FIELDS.map((field) => [field, cell(field)]));
    if (!entry.itemNo || !entry.itemName) {
      skipped += 1;
      continue;
    }
    if (byItemNo.has(entry.itemNo)) duplicates += 1;
    byItemNo.set(entry.itemNo, entry);
  }
  return { entries: [...byItemNo.values()], totalRows: dataRows.length, duplicates, skipped };
}
