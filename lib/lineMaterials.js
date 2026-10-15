/**
 * The materials a position needs **on the line it is pasted against**.
 *
 * A position carries the whole cable's bill of materials whichever line it is
 * on - CIP has no other shape for it - but a line only puts in what its own
 * stage puts in: FRP is paid off a roll when the cable is laid up (ST and SC
 * lines), the compound is extruded when it is sheathed (SH and FC). So an SH
 * line listing FRP was asking somebody to fetch a roll for a machine that
 * cannot use one (reported 2026-10-12).
 *
 * Which kinds those are is **the API's answer** (`lineMaterialKeys` on every
 * row): it is a rule about the plant, and it cannot be read off the BOM's own
 * process codes - CIP files FRP's rows under "SC" while the ST line running
 * them is stage "SZ". See wpsApi's `STAGE_MATERIAL_GROUPS`.
 *
 * A row from an older reply, or a line whose name says nothing about its
 * stage, keeps everything: too much beats hiding what has to be fetched.
 *
 * Here rather than in either caller because the screen's plain view and the
 * Excel export must not disagree about what a line is sent.
 */
export function lineMaterials(row) {
  const keys = row?.lineMaterialKeys;
  if (!keys || !row?.materials) return row?.materials;
  return Object.fromEntries(Object.entries(row.materials).filter(([key]) => keys.includes(key)));
}
