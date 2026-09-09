# Project context

This is the **WMS dashboard** ("wps") in a 3-app warehouse stock-tracking
system for FRP / coated-FRP / filler materials:

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

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
