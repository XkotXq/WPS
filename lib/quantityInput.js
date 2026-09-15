// Keeps only digits and a single decimal separator, normalizing "," to "."
// - shared by every quantity input across Materiały SM (single-receipt
// form, spool-assignment panel, and the order-receipt grid) so a comma
// typed anywhere never silently truncates the value: parseFloat("146,4")
// is 146, not 146.4, since JS stops parsing at the first non-numeric
// character - this must run before any parseFloat sees the string.
export function sanitizeQuantityInput(value) {
  const cleaned = value.replace(",", ".").replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}
