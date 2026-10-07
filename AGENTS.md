# Project context

This is the **WMS dashboard** ("wps") in a warehouse stock-tracking system
for FRP / coated-FRP / filler materials. Six directories, one backend;
besides the three described in detail below there are three Flutter apps,
each for a different person's job (each has its own AGENTS.md):
`../smpda` (warehouse operator's Honeywell PDA - scans and issues the real
stock), `../smVendor` (forklift operator - takes a transport order, marks it
delivered) and `../smOrder` (line foreman - places transport orders).
`../dockerPostgresql` runs the local Postgres, Hasura and MinIO.

The three web pieces:

- `../wpsApi` (pushed to GitHub as `wpsapi`/`wpsApi`) — Express +
  Postgres backend, developed and run directly from that directory on
  this machine (`npm run dev` there, real `.env` with live secrets
  there) - there's no separate `../api`. Owns all data: `frp_current` /
  `coated_frp_current` / `filler_current` tables (live inventory) plus
  historical stock-take snapshots. Generic CRUD
  (`listItems`/`createItem`/`updateItem`/`deleteItem`/`reorderItems`/
  `transferItem` in `src/items.js`) driven by per-material field config
  in `src/materials.js`.
- `./` (this app, "wps") — internal dashboard: reports, balances,
  materials catalog, current-list editing, CIP export/issue,
  operation-history browsing. Server Components fetch from the API via
  `lib/api.js`; a shared bearer token (`API_TOKEN`, must match the API's
  `.env`) authenticates every request except `/api/health` and
  `/api/auth/*`.
- `../stock` (pushed to GitHub as `stock`, package name `frp`) — the
  consumer-facing app warehouse staff use to do the actual stock
  check/count. Also API-backed for its item master list; check-session
  state (statusMap, selectedIds, etc.) stays localStorage-only by
  design. Now a dynamic app (not a static export) with its own
  additional unprotected route (`/frp-list`).

Nav's "Materiały" area is split into two sections now: "Materiały CIP"
(`materials-list-cip` - the real CIP-backed list, see next paragraph) and
"Materiały SM" (`materials-list-sm` - the unit-tracking concept, see
"Materiały SM (Stock Manager)" below). Don't confuse the two when editing
either - they look similar but one is real data, the other is a local-only
demo.

## Working rules for whoever edits this repo (agent or human)
- **Libraries**: reach for an existing, well-established library when it
  genuinely simplifies the work - this repo already depends on
  `@tanstack/react-table`, `@dnd-kit/*`, `date-fns`, `recharts`, etc.
  precisely so nobody has to hand-roll what they solve. Check
  `package.json` for what's already available before writing something
  from scratch.
- **Adding a new dependency**: never `npm install` a new package as a side
  effect of a task - propose it to the user and wait for a yes first, even
  when it would clearly be the "normal" choice. Example: `components/ui/dialog.jsx`
  and `components/ui/toast.jsx` are small local primitives built on the
  `@base-ui/react` dependency this repo already has, instead of pulling in
  something like `sonner` (a fine library - `../stock` already uses it for
  its own toasts - just not one to add here unasked).

Auth: both `wps` and `stock` log in against the company's legacy CIP
system (OAuth2 password grant) proxied server-side through
`POST /api/auth/login` (the API talks to CIP directly so the browser
never hits CIP's CORS wall). Both apps have a `SKIP_CIP_AUTH` /
`NEXT_PUBLIC_SKIP_CIP_AUTH` env escape hatch for when CIP itself is
unreachable — it is hard-disabled outside `NODE_ENV=production` builds
(see `lib/cipSession.js`), so it can never silently accept any
credentials in a real deployment. Do not remove that production guard.
When that bypass session (`session.token === "local-bypass"`) is active,
`app/dashboard/materials-list-cip/page.js` swaps the real CIP inventory
fetch for a fixed `TEST_RECORDS` fixture instead of hitting CIP (which
is unreachable under the bypass anyway) - keep that in sync with
`CipMaterialsTable`'s row shape if that shape changes.

## `MaterialsTable.js` - the shared table component
Every data table in this app (Lista stocków, Bilans, Raporty, Materiały,
Baza FRP, Historia operacji) goes through this one component, driven by
a `columns` config array (`{ key, headerKey, label?, filterFn, sortable,
type?, render?, className? }` per column - see existing callers for the
shape). Features, in one place so they apply everywhere at once:
- **Column filter/sort**: click a header to open `ColumnFilterHeader`'s
  popover (text/range/multiselect/boolean depending on `filterFn`/
  `type`), which also has a "Ukryj kolumnę" (hide column) action.
- **Right-click column header**: a separate native-feeling context menu
  (`components/ui/context-menu.jsx`, wraps `@base-ui/react/context-menu`)
  with the same "Ukryj kolumnę" action - independent of the left-click
  popover above.
- **Column labels**: `columnLabel(config)` prefers a literal `config.label`
  string over the `tColumns(config.headerKey)` translation - used e.g. by
  `MaterialBreakdownSection`'s compare columns, headed by whichever two
  dates are picked rather than a fixed "Poprzednio/Teraz" string.
- **Column resizing**: drag a header's right edge; double-click resets to
  auto width. Only columns the user actually touches get an inline
  `columnSizing[id]` width - everything else keeps its normal
  content-driven width, so resizing one column never changes how any
  other (untouched) table looks. The first drag seeds `columnSizing`
  with the header's *measured* on-screen width via `flushSync` before
  handing off to TanStack's resize handler (`startResize` in
  `MaterialsTable.js`) - skip that seed and the column jumps to
  TanStack's built-in 150px default the instant you grab the handle.
- **Sticky actions column**: when `renderRowActions`/`showOrderRailAction`
  is used, that column is `sticky right-0` (and the header additionally
  `sticky top-0`) so it survives horizontal scroll on wide tables. It
  needs its *own* opaque background per row state (base/selected/hover) -
  a sticky cell renders pinned above whatever scrolled out from
  underneath it, so it can't inherit the row's semi-transparent stripe
  classes without the old content bleeding through.
- **Excel export**: "Eksportuj do Excel" exports exactly what's on
  screen (visible columns/order, current filter+sort+showOnlySelected),
  reusing `lib/xlsxExport.js`'s `downloadStockXlsx` (the same styled
  writer "Eksportuj stock" uses) with a single generic sheet.

## `StockDatePicker.js` - two modes
Defaults to URL-param mode (`?<paramName>=YYYY-MM-DD` via
`router.replace`, for server-component-driven pages like Bilans). Pass
`onSelect` instead to run it fully client-side with no navigation/refetch
- used by `MaterialBreakdownSection`'s compare-dates pickers, which just
re-slice data already in memory.

## Reports page (`app/dashboard/stock/reports/page.js`)
`loadMaterialTrend()` groups trend rows by **calendar day**, not by
`stock_versions` row id - two check-ins for the same material on the
same day must merge into one point/column, otherwise `dateColumns` gets
two entries with the same key and React throws "two children with the
same key" when rendering the "wg itemu" breakdown table's compare
columns. The trend query itself is capped server-side at 150 rounds (see
wpsApi's `getMaterialTrend`).

## "Materiały SM" (Stock Manager) - the unit-tracking layer
`app/dashboard/materials-list-sm/` (component: `components/SmMaterialsPanel.js`)
is a real, wpsapi-backed section, separate from the real CIP-backed
"Materiały CIP" section (`materials-list-cip/`, `CipMaterialsTable.js`).
The problem it solves: CIP only ever stores an item's aggregate
quantity + location (e.g. "item 404, 48.800, MT") - it has no field for
*which physical unit* that quantity is on, so a spool's own drum number
or a single bigbag's individual weight has nowhere to live in CIP. This
page layers that missing per-unit detail on top, backed by wpsapi's
`sm_items`/`sm_units` tables (see `wpsapi/src/schema.sql`,
`wpsapi/src/smItems.js`, `wps/lib/smItemsApi.js`):

- **Data model**: each item is either `trackedIndividually: true` (has a
  `units` array - one entry per spool, each with its own `id`,
  `unitId` e.g. "SZP-2231", `quantity`, `note`, `productBatch`,
  `cipStatus`) or `trackedIndividually: false` (a single combined
  `totalQuantity` - e.g. thread sold by weight, a CIP-style aggregate
  with nothing to split into units). Only plain "FRP..." items are
  `trackedIndividually` (not "Coated FRP...", not filler/"PP...") -
  bigbags are always tracked in aggregate. This is decided by checking
  current stock first (an existing item's own `trackedIndividually`),
  then falling back to the catalog's `individualUnits` flag (`sm_catalog`'s
  `individually_tracked` column - see `receivePendingQuantity`,
  `resolveCatalogItemName`, `isIndividuallyTracked` in `SmMaterialsPanel.js`).
- **Row "kind" discriminator**: edit/issue panels take a row shaped
  `{ kind: "unit" | "item" | "aggregate", ... }` and branch on it (see
  `EditUnitPanel`, `IssueUnitPanel`) instead of needing three separate
  panel components.
- **Issuing**: a unit (spool) is always issued in full - there's
  no partial concept for a single physical object. An aggregate material
  *can* be issued partially (a quantity input caps at what's left;
  issuing less than the total just shrinks it instead of removing the
  row) - see `issueRow()`, the pure reducer shared by every issue path.
  Three entry points all funnel through it: `IssueUnitPanel` (one row),
  `IssueGroupPanel` (a whole item's checklist of units, opened from the
  group row's own "Wydaj"), and `BulkIssuePanel` (cross-item - any mix of
  checkboxes across the table, opened from the toolbar's "Wydaj
  zaznaczone", rendered as a table so every value gets its own column).
- **Persistence**: every reducer in this file stays a pure function
  operating on the in-memory `items` array, unchanged - a wrapped
  `setItems` (in `SmMaterialsPanel.js`) diffs `prev` vs `next` by object
  reference (relying on the convention that unchanged items keep the
  same reference) and PUTs/DELETEs only the item(s) that actually
  changed against `/api/sm-items`, sending each item's full row + its
  whole `units` array (the server replaces that item's units wholesale
  on every upsert - see `upsertSmItem` in `wpsapi/src/smItems.js`).
- **CIP sync**: a receipt or issue now *does* write to CIP - our stock
  stays the source of truth, but wpsapi checks the change against CIP
  first and refuses the whole save if CIP does (see wpsapi's AGENTS.md,
  "CIP sync"). `setItems` takes an optional second argument, `cipTasks`
  (`{ [itemNo]: { operation: "receipt" | "issue", quantity } }` - this
  batch's own delta per item, built by each call site's own
  `cipTasksByItemNo` helper from the same entries `logOperation` gets);
  an item listed there is `await`ed through the Server Action
  `lib/smItemsCipApi.js`'s `upsertSmItemViaCip` *before* being applied
  locally, and reverts to its previous state (not silently dropped) if
  CIP refuses - see `handleCreate`/`handleCreateAggregate`/
  `handleReceiveOrder`/`handleIssue`/`handleIssueUnits`/`handleBulkIssue`.
  Everything else routed through `setItems` (no `cipTasks` entry for that
  item - `handleSave`'s edits, `handleAssignUnits`'s labeling,
  `handleDeleteItem`) keeps the exact old fire-and-forget, errors-
  swallowed behavior, unchanged.
  The Server Action exists only because the CIP bearer token lives in an
  httpOnly cookie (`lib/cipSession.js`) and must never reach this
  "use client" file directly - `upsertSmItemViaCip` runs server-side,
  attaches the token there, and is the one path that sends it.
  `cipOperation`/`edit` (a location/note change with no quantity change)
  is not wired into anything here yet.
- **Catalog name enforcement**: everywhere an operator types both an
  item number and an item name (single receipt, bulk order-receipt
  paste), the typed name is checked against `sm_catalog` and silently
  replaced with the catalog's name on mismatch (`resolveCatalogItemName`)
  before it's saved or logged - keeps `sm_items`/`sm_operations` from
  accumulating operator typos/variants for the same item number. wpsapi now
  does the same server-side (`catalogItemName`, see its AGENTS.md), so this is
  a convenience for the typist, not the guarantee.
- **Catalog page** (`SmMaterialsCatalogTable.js`): per-item form, Excel import,
  "Numeracja szpul", and "Osobne jednostki kategorii" - a dialog that flips
  `individualUnits` for a whole category with one checkbox
  (`smCatalogApi.setCategoryIndividualUnits`; checked = all, dash = a mix, e.g.
  FRP also holds "Coated FRP" rows). `ReceiveUnitPanel` asks the API for the
  typed item on leaving the Nr itemu field (`resolveItemNo`); whether the
  Numer szpuli field appears is that entry's `individualUnits` flag alone
  (`catalogSaysIndividuallyTracked`).
- **History**: every receive/issue/labeling action also calls
  `logOperation`, which POSTs to `/api/sm-operations` (`wpsapi/src/smOperations.js`,
  table `sm_operations`) - shown on `materials-list-sm/history-sm`
  (`SmMaterialsHistoryTable.js`), which fetches that endpoint on mount.
  Not live/real-time - a second browser tab needs a reload to see
  another tab's changes, same as the rest of Materiały SM.
- Every create/issue action on this page ends with a bottom-right toast
  (`components/ui/toast.jsx`'s `useToastStack`/`ToastStack`) confirming
  what happened - keep that call site pattern (`pushToast(t("toast.xxx", {...}))`
  right after the state update) if this page grows more actions.

Known gotchas worth knowing before editing:
- Next.js Server Components **cannot** pass functions as props to Client
  Components — table column configs use a serializable `type` flag
  (`"boolean"`, `"datetime"`) instead of a `render` callback for any
  column whose config crosses that boundary (see `MaterialsTable.js`).
- Large tables (~200+ rows) need memoized rows with a custom `React.memo`
  comparator that ignores callback-prop identity, or every click
  re-renders the whole table (see `stock/src/components/MaterialRow.jsx`
  for the reference pattern this app should follow if a similar table
  grows).
- Nav has two placeholder-only sections pending real design: "Zamówienia
  CIP" (flat link) and "Wydania WMS" → "Listy wydań" (an expandable
  group with one child, mirroring how "Stock"/"Materiały" nest their own
  index page as the first child rather than a separate group-level page
  - see `stockChildren`/`materialsChildren` in `app/dashboard/layout.js`
  for that pattern). "Lista materiałów"'s row actions ("Edytuj"/"Wydaj"
  in `CipMaterialsTable.js`) are similarly UI-complete placeholders -
  "Wydaj" validates quantity/note for real, but neither persists
  anywhere yet; there's no backend endpoint for either.

<!-- BEGIN:nextjs-agent-rules -->

## The dashboard shell (`app/dashboard/layout.js`)
- **The sidebar is a slide-over drawer below `md` (768px) and a column above
  it** - phones get the drawer, tablets and desktops keep the panel with its
  collapse-to-icons toggle. The drawer closes on navigation, on Escape, on
  the backdrop and on its own X; the collapse toggle is hidden there,
  because there is nothing to collapse to.
  - `iconsOnly = collapsed && !isPhone`, with the phone detected by
    `matchMedia("(max-width: 767px)")`. It has to be a JS flag and not a
    CSS variant: `collapsed` is persisted state, so somebody who collapsed
    the sidebar on a desktop was getting an icons-only **drawer** on their
    phone.
  - The shell is `h-dvh`, not `h-screen`: on a phone `h-screen` is the
    largest viewport height, so the bottom of the layout hid behind the
    browser's own bar.
- **The sidebar search searches page titles** against `PAGE_REGISTRY` (the
  real page list, so it cannot drift from the nav), accent- and
  case-insensitively (`foldForSearch` - "zamowien" finds "zamówień") and
  against the group name too, so "transporty" lists everything under it.
  Results show the group on the right, because "Raporty" exists under both
  Stan magazynowy and Transporty.
- **Every suggestion dropdown takes the arrow keys**, through the shared
  `lib/useListKeyboard.js`: down/up move the highlight (no wrap-around),
  Enter picks it - or the first option when none is highlighted, so
  type-then-Enter works - and Escape closes. Used by the nav search, the
  place inputs (`LocationInput`), the guidelines material picker and the
  new-order item picker, whose two groups ("on this order" / everything
  else) are walked as one flat sequence. Add new dropdowns through that
  hook rather than re-implementing the index; some of these had no keyboard
  handling at all and could only be used with a mouse.
  - Attach `registerRow` to each option (`ref={(el) => keys.registerRow(i, el)}`):
    these lists are capped at `max-h-56` and scroll, so without it arrowing
    past the bottom moved an invisible highlight. `scrollIntoView({ block:
    "nearest" })` scrolls the least that works, so moving inside the visible
    part never jumps the view and the page behind the dropdown is untouched.

## Zamówienia (orders) - current state
**Real, backed by wpsApi** (`lib/ordersApi.js` -> its `orders`/`order_items`
tables; no longer the `lib/ordersCipSeed.js` demo). "Lista zamówień" is
`scope=active` (new + in_progress + problem + delivered), "Historia zamówień" is
`scope=history` (done + cancelled), both in
`components/OrdersCipListTable.js`, re-fetched on a 5 s poll (deliberately
plain REST, not a Hasura subscription - see wpsApi's AGENTS.md roadmap for
why). Two view modes: a table and cards.

This dashboard is **one of four clients of the same orders**, and which
person does what matters when changing any of it:
- `../smOrder` - the line foreman places orders and watches them.
- `../smpda` - the warehouse operator scans and issues the materials.
- `../smVendor` - the forklift operator takes an order and marks it
  delivered, or reports a problem.
- here - the supervisor's overview, **and the requester's close-out**:
  - a `delivered` row shows **"Zgadza się"** (`POST /orders/:id/accept`)
    and **"Zgłoś problem"** instead of the generic take/complete/cancel,
    which no longer apply to it. Doing nothing is also valid: wpsApi
    auto-accepts a delivered order after 10 minutes.
    **"Zgłoś problem" posts to `/problem`, not `/cancel`** (it did until
    2026-10-01): rejecting a delivery does not end the transport, it undoes
    the delivery and hands it back to the forklift operator to put right.
    A description is required.
  - **"Anuluj" is offered only on a `new` order.** Once somebody has taken
    it, the way out is the problem loop; wpsApi refuses to cancel a started
    order whoever asks. This is also the only app with an "Anuluj" at all -
    the phone apps have none.
  - a `problem` row stays on the active list and shows the reporter's own
    description in red, in both the table and the cards. The
    **"Problem rozwiązany"** button (`POST /orders/:id/problem/resolve`)
    appears only when `problemReportedFrom === "inProgress"` - the operator
    got stuck, so this is the requester's to answer. When it is
    `"delivered"` the problem is the operator's to answer in smVendor, and
    this screen says so instead of offering a button: the side that
    reported a problem must not be able to close its own report.

Reconstructing what happened is **`OrderEventLog`** in the expanded row,
and **this dashboard is the only client that shows it** - the phone apps
deliberately show what to do now, not the history:
`ordersApi.events(id)` -> `GET /orders/:id/events`, fetched per row on
expand (not with the list - it is detail nobody needs for every row). It is
the only place a resolved problem still exists, since the order row carries
just the current state. Distinct from `OrderStageTimeline`, which
compresses the *current* position into one line and so cannot show a step
that repeated. `actor === "auto"` means the 10-minute sweep closed it and
nobody actually confirmed - say so, don't flatten it to a confirmation.

Things in this component that are easy to get wrong:
- **"Zrealizował" is not whoever closed the order.** The API's
  `fulfilledBy` is `delivered_by || taken_by || completed_by` - the person
  who actually carried the transport out. Don't "fix" it to `completedBy`
  (which is also sent, raw). See wpsApi's AGENTS.md.
- **The "Wydano" line** is `issuedLineValue()`: `{issued} {unit}/{ordered} szt.`,
  and for FRP one segment per drum (`SZP-1(2.3km) + SZP-2(4.85km)/2 szt.`),
  because an FRP order is placed in pieces but issued in km. The separate
  ordered-quantity line was removed - this one carries both.
- **`OrderStageTimeline`** (the compact stage/timestamp strip) belongs in
  the expanded row next to the **CIP production order number**
  (`details.productionOrderNo`), not next to our own generated `orderNo`.
- **Material substitutions**: a BOM row's `itemCode`/`name` already are the
  changed-to item (wpsApi normalizes them) - don't re-derive the swap here,
  that is exactly how the "Zamówienie materiału" picker once ordered the
  stale pre-swap number.

New-order form: `ORDER_TYPES` in the same component drives which inputs each
of the six types gets (line pickers from the fixed codes; free-text
`LocationInput` with remembered suggestions for "Transport półproduktów";
clean water vs. mauser for dirty water; production order number, whose
typed fragment is resolved against CIP's own BOM to scope the material
picker). The optional photo for transport / waste / return is **still
browser-only here** (a blob URL, never uploaded) even though the upload path
now exists end-to-end - see wpsApi's "Photos" section; smOrder is the client
that actually attaches one.

"Wytyczne do zamówień" and "Raporty" are still placeholders. The data model
(six types, order numbers, shifts A/B/C, statuses, photos) is in
`../wpsApi/AGENTS.md` ("Transport orders").

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
