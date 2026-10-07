// Every kind of transport, in the order wps's own "Nowe zamówienie" menu
// offers them. Mirrors wpsApi's `order_types` table (its schema.sql seeds
// exactly these); the labels live in messages/*.json under
// `ordersTransport.types`, keyed by the same codes.
//
// A separate module because two unrelated screens need the list now - the
// new-order form and "Wytyczne do transportów", which can scope a guideline
// to a kind of transport.
export const ORDER_TYPE_CODES = [
  "water_refill",
  "material_order",
  "spool_order",
  "goods_transport",
  "waste_removal",
  "warehouse_return",
  "machine_transport",
];
