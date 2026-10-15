// The weights of the bigbags actually standing on the floor, and how many of
// them a day's work takes. Kept apart from the panel that edits them
// (components/BigbagWeights.js) because the export reads the same numbers,
// and because arithmetic this answer depends on should be runnable without a
// browser.
//
// Why this exists next to the package size the API counts with: that size is
// **one nominal figure** and every bag is assumed to hold it
// (`PACKAGE_RULES` in wpsApi). A bigbag is weighed, and no two come out the
// same, so "do the bags I have cover today, and how many of them do I carry"
// cannot be answered by a division. It is answered here, from the weights
// somebody typed off the labels.
//
// Deliberately **local to this browser**, the same as the package sizes: it
// is a note about what is on the floor right now, not a plant-wide fact, and
// the moment a bag is emptied the note is wrong.

const WEIGHTS_KEY = "wps.productionProgress.bigbagWeights";

const round2 = (n) => Math.round(n * 100) / 100;

// Every read and write is guarded, exactly as the package sizes are: a
// private window, blocked site data or a half-written value must cost the
// list, never the screen.
export function readStoredBigbagWeights() {
  try {
    const raw = window.localStorage.getItem(WEIGHTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([itemNo, list]) => [itemNo, sanitiseWeights(list)])
        .filter(([, list]) => list.length > 0)
    );
  } catch {
    return {};
  }
}

export function storeBigbagWeights(weights) {
  try {
    window.localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
  } catch {
    // Nothing worth saying: the weights still add up on this screen, they
    // just will not be here after a reload.
  }
}

export function sanitiseWeights(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(Number)
    .filter((weight) => Number.isFinite(weight) && weight > 0)
    .map(round2);
}

export function parseWeight(raw) {
  const weight = Number(String(raw ?? "").replace(",", ".").trim());
  return Number.isFinite(weight) && weight > 0 ? round2(weight) : null;
}

/**
 * What the weighed bags come to, and how many of them the day takes.
 *
 * `needed` is the amount the API worked out for the day, in the item's own
 * unit. `used` is the **fewest** of these bags that cover it, so they are
 * taken heaviest first - "how many do I have to carry" is the question being
 * asked, and the order they were typed in says nothing about the shelf.
 *
 * When they do not cover it, `used` is all of them and `short` is what is
 * still missing: how many *more* bags that is cannot be known from here,
 * since nobody has weighed them yet.
 */
export function bigbagCoverage(list, needed) {
  const bags = sanitiseWeights(list);
  const total = round2(bags.reduce((sum, weight) => sum + weight, 0));
  if (!Number.isFinite(Number(needed)) || Number(needed) <= 0) {
    return { total, enough: true, used: 0, surplus: total };
  }

  const target = Number(needed);
  let carried = 0;
  let used = 0;
  for (const weight of [...bags].sort((a, b) => b - a)) {
    if (carried >= target) break;
    carried += weight;
    used += 1;
  }
  return carried >= target
    ? { total, enough: true, used, surplus: round2(carried - target) }
    : { total, enough: false, used, short: round2(target - total) };
}
