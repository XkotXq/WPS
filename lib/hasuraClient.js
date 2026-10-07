"use client";

import { createClient } from "graphql-ws";

// Live queries/subscriptions straight against Postgres, via Hasura sitting
// on top of the same database wpsApi uses (see dockerPostgresql's own
// docker-compose.yml, and wpsApi's AGENTS.md roadmap step 2 - sm_items/
// sm_units/sm_operations are tracked there so far). No auth header: Hasura's
// HASURA_GRAPHQL_UNAUTHORIZED_ROLE is set to a read-only "user" role with
// SELECT on the tables that are tracked - same low-friction, shared-access
// model the rest of this app family's backend already uses (see wpsApi's
// AGENTS.md, "Auth" - one shared bearer token, no per-user keys). Hasura's
// own mutations are never used from here - every write still goes through
// wpsApi, so CIP-sync validation and catalog-name enforcement can't be
// bypassed by writing straight to a table.
const WS_URL = process.env.NEXT_PUBLIC_HASURA_WS_URL || "ws://localhost:8080/v1/graphql";

// One shared socket for the whole tab, opened lazily on the first
// subscription rather than at module load (SSR-safe: this file is only
// ever imported by "use client" components, but the client itself should
// still only exist in the browser, not during a server render pass of the
// same module graph).
let client = null;
function getClient() {
  client ??= createClient({
    url: WS_URL,
    // Warehouse Wi-Fi and a dev server that restarts: a dropped socket is
    // routine, so keep reconnecting instead of giving up after the default
    // five attempts and leaving the page silently stale. graphql-ws
    // re-sends every active subscription on reconnect, so a caller does not
    // have to do anything.
    retryAttempts: Infinity,
    // Backoff, capped - without this a server that is down gets hammered
    // once a second by every open tab.
    retryWait: async (attempt) =>
      new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 15000))),
    // A live query can sit idle for hours; this notices a half-open socket
    // (laptop asleep, AP handover) instead of waiting for a push that never
    // comes.
    keepAlive: 10000,
    on: {
      closed: (event) => {
        // Only interesting when it was not us closing it on purpose.
        if (event?.code && event.code !== 1000 && event.code !== 1001) {
          console.warn(`[hasura] socket closed: ${describeWsError(event)}`);
        }
      },
    },
  });
  return client;
}

// graphql-ws hands `error` three different shapes, and two of them print as
// "{}" through console.error: a CloseEvent keeps its fields on the
// prototype, so JSON.stringify and the console's own object view both show
// nothing. That is what made the first report of this unreadable - "cóż to
// za błąd" - so pull the parts out by hand.
function describeWsError(err) {
  if (Array.isArray(err)) {
    // GraphQL errors: a bad query, or a table/column the anonymous "user"
    // role cannot select (the usual cause after Hasura metadata is reset -
    // see deploy/README.md).
    return err.map((e) => e?.message ?? JSON.stringify(e)).join("; ");
  }
  if (err && typeof err === "object" && "code" in err) {
    // CloseEvent. 1006 is the common one: the socket died without a close
    // frame, i.e. the server went away or the network did - not a rejected
    // subscription.
    const parts = [`kod ${err.code}`];
    if (err.reason) parts.push(err.reason);
    if (err.wasClean === false) parts.push("połączenie przerwane");
    return parts.join(", ");
  }
  // A bare Event, type "error": the socket itself failed - refused,
  // unreachable, or closed before it ever opened. The browser withholds the
  // reason on purpose (it would leak what is reachable from this machine),
  // so there is nothing to unpack and the only useful thing to print is
  // where we were trying to reach.
  if (typeof Event !== "undefined" && err instanceof Event) {
    return `nie udało się połączyć z ${WS_URL}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// Shared by every subscribeXChanged below - each asks for only a couple of
// columns (never the full row shape wpsApi's own REST responses have, e.g.
// no `units`), so callers still go through a REST fetch for the actual data
// - but, unlike a plain "something changed, refetch everything" signal,
// `onChange` gets the rows GraphQL actually sent, so a caller that wants to
// can tell *which* row(s) changed and fetch just those instead of the whole
// table (see SmMaterialsPanel.js's own subscription for that). Returns an
// unsubscribe function - call it on unmount.
function operationName(query) {
  return query.match(/subscription\s+(\w+)/)?.[1] ?? "(bez nazwy)";
}

function subscribeChangeSignal(query, onChange) {
  return getClient().subscribe(
    { query },
    {
      next: (msg) => onChange(msg.data),
      // Name the subscription, not the whole query text: the operation name
      // is enough to find it and the full document made the line unreadable.
      error: (err) =>
        console.error(
          `[hasura] subscription ${operationName(query)} failed: ${describeWsError(err)}`,
          err
        ),
      complete: () => {},
    }
  );
}

// Fires on any insert/update/delete on sm_items (Hasura re-evaluates the
// live query and pushes again whenever the result would differ), with
// `{ sm_items: [{ item_no, updated_at }, ...] }` for every row currently in
// the table - small enough to ask for all of them every tick (this table is
// naturally bounded, one row per known material, currently a few hundred).
// `onChange` gets this list itself so a caller can diff it against what it
// last saw and fetch only the row(s) that actually changed - see
// SmMaterialsPanel.js.
export function subscribeSmItemsChanged(onChange) {
  return subscribeChangeSignal("subscription SmItemsChanged { sm_items { item_no updated_at } }", onChange);
}

// Fires on any insert into sm_operations (append-only - see wpsApi's
// AGENTS.md - so only ever inserts, never updates/deletes). Unlike
// sm_items, this table only ever grows, so the query asks for just the
// single newest row (`order_by`/`limit: 1`) instead of the whole table -
// its own `id` changing between ticks is signal enough that something new
// was logged, without the payload growing with history size. Asks for
// every displayable column, not just `id` - a fresh insert is immutable
// (nothing about a past operation ever changes), so SmMaterialsHistoryTable.js
// can show this one row straight away instead of re-fetching a whole page
// for it (see that file's own `mapGraphqlOperationRow` - a small,
// deliberate duplicate of wpsApi's own `rowToApi` in src/smOperations.js;
// keep the two in sync if that ever changes).
export function subscribeSmOperationsChanged(onChange) {
  return subscribeChangeSignal(
    `subscription SmOperationsChanged {
      sm_operations(order_by: {performed_at: desc}, limit: 1) {
        id
        operation
        item_no
        item_name
        unit_id
        quantity
        location_code
        product_batch
        performed_by
        performed_at
      }
    }`,
    onChange
  );
}
