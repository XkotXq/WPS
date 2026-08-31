// Stock export xlsx, styled to match a real reference export
// (20260804FRP & FILLER STOCK.xlsx) byte-for-byte: navy #002060 fill,
// bold 16pt white header/title text, 18pt data text, thin borders on
// every cell — confirmed against that file's own styles.xml, not
// eyeballed. Sheet names/column sets below mirror that file's MMC_FRP /
// "FRP " / "COATED FRP" / FILLER sheets exactly (including the trailing
// space in "FRP " and the hidden, always-empty AREA/POLE column on
// MMC_FRP and COATED FRP).
const NAVY = "002060";
const THIN = { style: "thin", color: { rgb: "000000" } };
const BORDER_ALL = { top: THIN, bottom: THIN, left: THIN, right: THIN };

const HEADER_STYLE = {
	fill: { fgColor: { rgb: NAVY } },
	font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
	alignment: { horizontal: "center", vertical: "center", wrapText: true },
	border: BORDER_ALL,
};

const DATA_STYLE = {
	font: { sz: 18, color: { rgb: "000000" } },
	border: BORDER_ALL,
};

function metersToKm(raw) {
	const meters = Number(raw);
	if (!Number.isFinite(meters)) return raw ?? "";
	return Number((meters / 1000).toFixed(3));
}

// sheet = { sheetName, title (optional — omit for no merged title row,
// matching "FRP "), headers: string[], rows: any[][], hiddenCols?: number[] }
async function buildWorkbook(sheets) {
	const XLSX = (await import("xlsx-js-style")).default;
	const workbook = XLSX.utils.book_new();

	for (const { sheetName, title, headers, rows, hiddenCols = [] } of sheets) {
		const headerRowIndex = title ? 1 : 0;
		const aoa = title ? [[title, ...Array(headers.length - 1).fill("")], headers, ...rows] : [headers, ...rows];
		const sheet = XLSX.utils.aoa_to_sheet(aoa);

		if (title) {
			sheet["!merges"] = [{ s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: 0 } }];
			headers.forEach((_, c) => {
				const ref = XLSX.utils.encode_cell({ r: 0, c });
				if (sheet[ref]) sheet[ref].s = HEADER_STYLE;
			});
		}
		headers.forEach((_, c) => {
			const ref = XLSX.utils.encode_cell({ r: headerRowIndex, c });
			if (sheet[ref]) sheet[ref].s = HEADER_STYLE;
		});
		rows.forEach((_, r) =>
			headers.forEach((__, c) => {
				const ref = XLSX.utils.encode_cell({ r: headerRowIndex + 1 + r, c });
				if (sheet[ref]) sheet[ref].s = DATA_STYLE;
			})
		);

		sheet["!cols"] = headers.map((header, c) => ({
			wch: Math.max(String(header).length, 12),
			hidden: hiddenCols.includes(c),
		}));

		XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
	}

	return { XLSX, workbook };
}

export async function downloadStockXlsx({ fileName, sheets }) {
	const { XLSX, workbook } = await buildWorkbook(sheets);
	const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
	const byteChars = atob(base64);
	const bytes = new Uint8Array(byteChars.length);
	for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
	const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// items = mapFrpItem/mapCoatedFrpItem/mapFillerItem output (materials-data.js)
// — frp/coatedFrp already carry length in km there; filler doesn't, so it's
// converted here.
export function buildStockExportSheets({ selected, frpItems, coatedFrpItems, fillerItems }) {
	const sheets = [];

	if (selected.frp) {
		const mmcItems = frpItems.filter((i) => i.mmc);
		const plainItems = frpItems.filter((i) => !i.mmc);

		sheets.push({
			sheetName: "MMC_FRP",
			title: "MMC FRP STOCK ",
			headers: [
				"AREA / POLE",
				"NO./ NR",
				"ITEM",
				"DIAMETER / ŚREDNICA",
				"LENGTH / DŁUGOŚĆ [KM]",
				"DRUM NUMBER / NR SZPULI",
				"LOCALIZATION / LOKALIZACJA",
				"REMARKS/ UWAGI",
			],
			hiddenCols: [0],
			rows: mmcItems.map((item, index) => [
				"",
				index + 1,
				item.item,
				item.diameter,
				item.length,
				item.spoolNumber,
				item.location,
				item.note,
			]),
		});

		sheets.push({
			sheetName: "FRP ",
			headers: [
				"ITEM",
				"DIAMETER / ŚREDNICA",
				"LENGTH / DŁUGOŚĆ [KM]",
				"DRUM NUMBER / NR SZPULI",
				"XB/Z",
				"LOCALIZATION / LOKALIZACJA",
				"REMARKS/ UWAGI",
			],
			rows: plainItems.map((item) => [item.item, item.diameter, item.length, item.spoolNumber, item.xbz, item.location, item.note]),
		});
	}

	if (selected.coatedFrp) {
		sheets.push({
			sheetName: "COATED FRP",
			title: "COATED FRP STOCK ",
			headers: [
				"AREA / POLE",
				"NO./ NR",
				"DIAMETER / ŚREDNICA",
				"LENGTH / DŁUGOŚĆ [KM]",
				"DRUM NUMBER / NR SZPULI",
				"XB/Z",
				"LOCALIZATION / LOKALIZACJA",
				"REMARKS/ UWAGI",
			],
			hiddenCols: [0],
			rows: coatedFrpItems.map((item, index) => [
				"",
				index + 1,
				item.diameter,
				item.length,
				item.spoolNumber,
				item.xbz,
				item.location,
				item.note,
			]),
		});
	}

	if (selected.filler) {
		sheets.push({
			sheetName: "FILLER",
			title: "FILLER",
			headers: [
				"NO./ NR",
				"COLOUR/ KOLOR",
				"DIAMETER / ŚREDNICA",
				"LENGTH / DŁUGOŚĆ [KM]",
				"DRUM NUMBER / NR SZPULI",
				"NIEPALNY / ZWYKLY",
				"PRZED/ZA FILLEREM",
				"REMARKS/ UWAGI",
			],
			rows: fillerItems.map((item, index) => [
				index + 1,
				item.color,
				item.diameter,
				metersToKm(item.length),
				item.spoolNumber,
				item.flameRetardant ? "NIEPALNY" : "ZWYKŁY",
				item.location,
				item.note,
			]),
		});
	}

	return sheets;
}
