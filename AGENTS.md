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
A dead session always ends at the login page, never at a dead screen.
Two halves: `proxy.js` (Next's middleware) turns away any `/dashboard`
navigation made without the `cip_session` cookie, and
`cipSessionOrLogin()` in `lib/cipSession.js` does the same from inside a
render or a Server Action — the gate only runs on navigations, so an
action that kills the cookie mid-screen (the forced refresh, after CIP
refuses a token whose refresh token is dead too) would otherwise leave
the operator on a page that cannot work until their next click. **Every
CIP caller goes through `cipSessionOrLogin()`, not
`ensureFreshCipSession()`** — that is what keeps a screen from inventing
its own "zaloguj się ponownie" message for a session nobody can recover,
and what means no caller has to handle `null`. `ensureFreshCipSession()`
stays for the one case that is not a CIP call: reading the session to
display who is logged in.
When that bypass session (`session.token === "local-bypass"`) is active,
`app/dashboard/materials-list-cip/page.js` swaps the real CIP inventory
fetch for a fixed `TEST_RECORDS` fixture instead of hitting CIP (which
is unreachable under the bypass anyway) - keep that in sync with
`CipMaterialsTable`'s row shape if that shape changes.

## No machine address in this app (`lib/browserApi.js`)
Server-side code reads `API_BASE_URL` as it always did (localhost in a dev
setup - that call is made by this app's own server). **The browser does
not**: `apiBaseUrl()` / `hasuraWsUrl()` build the address from the host the
page itself was loaded from, on :4000 and :8080. A phone opening
`http://<this machine>:3000` therefore calls the API at
`http://<this machine>:4000`, where before it called `localhost:4000` -
which on a phone is the phone ("nie udało się pobrać z API" on Materiały
SM, 2026-10-12).
- `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_HASURA_WS_URL` stay **empty**
  in `.env.local` on purpose. An explicit value still wins, and the
  deployed stack sets one, because there the page and the API really are
  different hosts (see `../deploy/README.md`).
- Resolve it **per call**, never into a module constant: these files are
  `"use client"` but still run during server rendering, where there is no
  `window`.
- `allowedDevOrigins` is every private range rather than this machine's own
  IP - that was one hardcoded address which stopped being true. See
  `next.config.mjs`; `../SETUP.md` is the whole new-machine path.

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
- **"Wydania WMS"** (`app/dashboard/orders/wms`,
  `components/WmsIssueListsTable.js`) is **a flat nav link, not a group**
  (2026-10-12, was an expandable group whose only child, "Listy wydań", was
  the group again): the section is one screen - the table of issue lists and
  the "Nowa lista" button that starts one - so the extra click opened
  nothing. Its `PAGE_REGISTRY` entry is keyed `ordersWms` and
  `pageGroupKey` returns `null` for it, like Uprawnienia, so a search hit
  is not labelled with a group it is the whole of.
  - **This screen has a second login, to WMS itself** (`components/WmsSignIn.js`,
    `lib/wmsAuthApi.js`, `lib/wmsSession.js`; added 2026-10-13). WMS is the
    plant's own warehouse system and **not CIP** - a different server with
    different accounts - and a list is a document in WMS, so creating one
    takes a WMS session on top of the CIP session this screen was reached
    with. The two sit side by side (`cip_session`, `wms_session`) and
    **neither ever logs the other in or out**: signing out of WMS must not
    throw anybody out of wps.
    - A chip says which it is and the button next to it does the one thing
      that applies - "Zaloguj do WMS" or "Wyloguj z WMS". **"Nowa lista"
      stays enabled**: with no WMS session it opens the same dialog and
      starts the list as soon as WMS accepts. A button that refused to work
      until somebody found the right thing to press first would be the same
      number of clicks and one guess worse.
    - **The token never reaches the browser.** `lib/wmsSession.js` is
      deliberately *not* a `"use server"` module, so nothing in it is
      callable from a client component; the page reads it during its own
      render and passes down `wmsSessionInfo()` - a name, a number and a
      timestamp. Don't copy `getCipSession`'s shape here: that one *is* a
      Server Action, so anything rendered in the browser can call it and
      read the CIP token back.
    - The password goes from the form into the Server Action and no further
      (`signInToWms`), is never put in a state that outlives the attempt,
      and is not remembered between sessions - no "remember me", nothing
      stored. Both inputs are `autoComplete="off"`, because the browser's
      saved **CIP** login is the wrong thing to offer for a WMS account.
    - The rules about what WMS's reply means are **wpsApi's**
      (`src/wms.js`): it answers HTTP 200 even for a wrong password, so
      nothing here may read a 200 as a success. This app only ever sees
      "signed in as X" or an error message.
  - **"Nowa lista" opens the document, not a row** (`WmsIssueListForm.js`,
    2026-10-14): WMS's own issue-note header - organization, source
    organization, document class, bill date, source and destination
    warehouse - and the positions under it. It takes the whole screen
    rather than a dialog, because a pasteable grid in a dialog is the thing
    "Przyjęcie zamówienia" has to work around.
    - **The positions are a grid** (`WmsIssueItemsGrid.js`), the third
      sibling of `BulkReceiveGrid` after `ProductionProgressGrid`: same
      glide-data-grid, same spare-row rule, same
      `installInsecureClipboardFallback()`, same two documented glide quirks.
      Five columns: item no., name, unit, location, quantity.
      **Location is typed** (added 2026-10-14) - it is the bin the material
      comes out of, a fact about the shelf and not about the item, so it is
      deliberately **not** in `LOOKUP_FIELDS`: WMS's item master does not
      know it, and a paste that only carries item numbers must not wipe it.
      **The specification column was dropped on 2026-10-15**: a name and a
      unit already say which material a row is, and it was the widest
      column on a screen whose job is a column of numbers and a column of
      quantities. wpsApi still answers with it, so putting it back is
      `COLUMN_FIELDS` + `LOOKUP_FIELDS` + a column + one write in the
      form's own resolve.
    - **The one real difference from BulkReceiveGrid is where a name comes
      from.** There the lookup is data already in the browser, so it is a
      plain synchronous function. Here the item master is **WMS's**, behind
      a network call, so the grid cannot fill a row itself: it says *which*
      item numbers need resolving (`onResolveItemNos`, on leaving an item-no
      cell and after a paste) and the form writes the answers back into
      `rows`. `itemStatus` comes back the other way, because whether a
      number is a real material is something only the form has heard about.
    - **WMS's answer overwrites the name, specification and unit**, pasted
      or typed - the item master names a material, exactly as `sm_catalog`
      does everywhere else in this app. A number WMS could not pin down
      leaves those three **blank**: a row must never show one material's
      number next to another's name. A paste that carries its own name
      column keeps it until the answer lands.
    - **Only a confirmed material may be saved.** Not-confirmed covers a
      number WMS refused *and* one nothing has asked about yet, both marked
      red in the grid and both blocking "Zapisz" - an item number typed and
      never left is not a material. Saving is disabled only while a lookup
      is in flight.
    - **Every header field but the remark is a select, fetched from WMS**
      (`lib/wmsReferenceApi.js` -> `POST /api/wms/organizations`,
      `/warehouses`, `/document-classes`, `/pick-rules`; the first three
      2026-10-14, the organizations 2026-10-15), loaded for the prefilled
      organization as the form opens rather than after somebody touches a
      field they had no reason to touch. These codes are WMS's own, and a
      typo in a typed one is a document WMS refuses at save time with
      nothing on screen saying which field was wrong.
      - One loader and one `ReferenceSelect` for both (`REFERENCE_LOADERS`
        maps the form field to its Server Action), because they differ only
        in which list they ask for: both answer `[{ code, name }]`, both are
        scoped by the organization, both have the same two empty states.
        The option reads `code - name` so somebody can tell 4601 from 4602;
        the **code** is what the document carries.
      - Changing the organization re-fetches both and **clears a choice the
        new organization does not have** - left in place it would look
        chosen while naming something nobody can put on this document.
      - The loading flags are per field and are **not** the item lookup's
        transition: the three wait on different calls, and the spinner by
        the title is about the positions.
      - A list that failed to load is not recorded as loaded, so the next
        blur or sign-in retries it; one failure must not leave a required
        select empty for as long as the form is open.
      - **Two pairs of fields read one list each**: both warehouses (the
        destination of an issue note is another of this organization's own
        warehouses, said so 2026-10-14) and both organizations (the source
        organization is another entry of the same `bmorg` list,
        2026-10-15). Each pair is two entries in `REFERENCE_LOADERS`
        pointing at one call, and `REFERENCE_GROUPS` groups the fields by
        that call so it runs **once**: two requests for one list would be
        two answers that have to agree.
      - **The organizations are the one list WMS does not scope by an
        organization** (`UNSCOPED_LOADERS`) - it is the list of them. So it
        is remembered under a constant key rather than under an
        organization, a blank organization does not empty it, and changing
        the organization re-fetches only what it scopes
        (`loadScopedReferences`).
      - **The organization itself is never cleared as stale**
        (`NEVER_CLEARED`), unlike every other field: it scopes every other
        list on the screen, so clearing it empties all of them at once, and
        that list's field spellings are not captured yet. A code read out
        of the wrong field must not be able to take the whole form down.
      - **Choosing the organization is the commit** now that it is a select
        - there is no half-typed value to wait for a blur on, which is what
        the old input needed. `resolveItemNos` therefore takes the
        organization as an argument: the select calls it with the value just
        picked, before the state behind it has been applied.
      - Still text: **remark** alone, which is a sentence rather than a
        code, so it sits on its own line under the grid of header fields at
        full width.
    - **The organization scopes every lookup** (WMS's `orgNo`, prefilled
      "460" - a blank one makes every row come back unknown). It commits on
      blur, the same rule the package-size inputs on Postęp produkcji
      follow, and re-asks every filled row: the answers on screen were
      answers to a different question.
    - **A session WMS drops mid-list is asked for from here**
      (`onSessionExpired` -> the same sign-in dialog, which is why that
      dialog renders in both branches of this component), and a fresh
      sign-in re-resolves every filled row (`resolveNonce`). Nothing typed
      is lost and nothing has to be tabbed through again. This matters
      because WMS reports a dead session as an ordinary empty result - see
      wpsApi's `wmsNotLoggedIn`; **never read "no rows" as "no such item"**.
    - Which header fields WMS itself insists on is still **not known**, so
      the five required here are the ones its own captured save fills in
      (organization, bill date, document class, both warehouses) and wpsApi
      refuses the same five - not a rule invented for the others. The
      picking rule is filled in that capture too and is deliberately not
      demanded: one document is not evidence that WMS insists on it.
    - **The field labels stay in English in both locales** (2026-10-14, on
      request): organization, source organization, document class, bill
      date, source and destination warehouse, and the grid's item no., name,
      specification, unit, quantity. They are **WMS's own field names**, and
      somebody filling this in has WMS's screen next to it - a translated
      label would have to be matched back to the English one on the other
      monitor. `pl.json` therefore holds the English strings here on purpose;
      a translation pass must not "fix" them. Everything that is wps's own -
      the title, Pozycje, the buttons, the validation - is Polish as usual.
  - **"Zapisz w WMS" creates the document in WMS** (`lib/wmsIssueApi.js` ->
    `POST /api/wms/issue-notes`, 2026-10-14). What it sends is **item
    numbers, quantities and cells only**: wpsApi resolves every item against
    WMS's own master again and sends WMS back its own item rows, so none of
    somebody else's schema is held in the browser and nothing sent can have
    drifted from what WMS has. See wpsApi's AGENTS.md for the payload and
    don't assemble any part of it here.
    - **A refusal is never shown as a save.** WMS's own message is what
      goes on screen, because that is what somebody checks the document
      against; a list believed saved when it was not is the one outcome
      nobody can recover from. A session lost at this point reopens the
      sign-in from here, exactly as a lookup does.
    - The button is disabled while a lookup is in flight **and while the
      document is going**, so one click cannot become two documents.
    - **The document class is required now**, read off that same capture
      (it carries `classifyType` as the document's own kind). The picking
      rule is filled in the capture too but is not demanded here - one
      document is not evidence that WMS insists on it, and WMS says so if
      it does.
  - **The table is WMS's own list of issue notes** (`lib/wmsIssueApi.js`'s
    `listWmsIssueNotes` -> `POST /api/wms/issue-notes/search`, 2026-10-15),
    read when there is a WMS session, re-read after a save and on
    "Odśwież". That is what makes it survive a reload, and it means a
    document raised on WMS's own screen is on it too: this app is one of
    two ways into the same documents, never the record of them.
    - **No local numbering any more.** A provisional `WD/YYYY-MM-DD/n` was
      drawn when the form opened, from a day counter this component kept;
      it was removed on request (2026-10-15). WMS names the document and
      every row carries that name - a second number for the same list is
      only a second thing to reconcile. Don't bring it back without a
      reason, and if one appears it belongs in wpsApi with every other
      document number: two clients each running their own sequence would
      hand out the same one twice.
    - **A failed read empties the table and says why.** Leaving the last
      answer on screen would show it as current, and an empty table is
      indistinguishable from a dead session - which is exactly what wpsApi
      tells apart for us. A `wms_session_expired` drops the session here,
      so the chip and the button go back to offering a sign-in.
    - The status cell holds **WMS's own status**, not a label of ours (the
      `statusDraft`/`statusSent` strings are gone with the local rows):
      these values are checked against WMS's screen, the same reason the
      header's field labels stay English here. The column's multiselect
      filter therefore lists whatever WMS said.
    - The timestamp is printed **as WMS wrote it**: the shape of that
      string is not captured, and reformatting a value we cannot parse is
      how a date becomes "Invalid Date". It still sorts, being year-first.
    - `ISSUE_NOTE_FIELDS` already carries the document class, the warehouse
      and the remark, so another column is a line in `columns` - see
      wpsApi's AGENTS.md for which spellings are evidence and which are
      still candidates.
    "Lista materiałów"'s row actions ("Edytuj"/"Wydaj" in
    `CipMaterialsTable.js`) are still placeholders - "Wydaj" validates
    quantity/note for real, but neither saves anywhere.
  - The table is `MaterialsTable` like every other one here, so its
    columns are headed from `stock.columns` (`wms*` keys) and it gets the
    filters, hiding, resizing and Excel export for free. The status cell
    holds the **already translated** label, not a code, so the column's own
    multiselect filter lists what is on screen.
- "Zamówienia CIP" is still a placeholder-only flat link pending real
  design.

<!-- BEGIN:nextjs-agent-rules -->

## Uprawnienia (`app/dashboard/permissions`, `EmployeeRolesTable.js`)
Which role each employee number has. Built around **who has actually
logged in** (`login_events` is the only record that a number belongs to a
real person), so the list is people the system has seen and giving
somebody a role is picking their row; a number that has never logged in
is added by hand in the field above the table.
- **Two choices right now: Wózkowy and no role** (2026-10-15, on request).
  The options come from **wpsApi's `EMPLOYEE_ROLES`**, never from a list
  in this app - see its AGENTS.md for which four roles were dropped and
  why the database's CHECK was left alone. No role is the absence of a
  row, so the empty option deletes the assignment rather than saving a
  role called "none".
- The select also offers **any role a person already has**, even one the
  API no longer hands out: a value with no matching option renders as a
  blank select, which reads as "bez roli" while the database says
  otherwise. The `role.*` labels for the dropped roles stay in the
  messages for exactly that reason - don't tidy them away.
- **Nothing here enforces anything yet.** There is one shared API token
  and no per-user check, so a role set here changes no behaviour today;
  it is the mapping that has to exist before the tokens can carry it
  (wpsApi's roadmap step 1).

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
  against the group name too, so "zadania" lists everything under it.
  Results show the group on the right, because "Raporty" exists under both
  Stan magazynowy and Zadania.
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
**Named "Zadania" on screen** (2026-10-12, was "Transporty"): the group
covers more than hauling now - water, spool and material requests, waste,
returns, a machine move - so every label an operator reads says
zadanie/task. Only the labels moved. The routes
(`/dashboard/orders/transport/...`), the `ordersTransport*` message keys,
the component names and wpsApi's own order `type` codes
(`goods_transport`, `machine_transport`, ...) are unchanged, so links and
stored rows keep working — expect the two vocabularies side by side and
do not "tidy" one into the other. The two type names that really are
about hauling ("Transport półproduktów", "Przewóz maszyny") still say so.

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

## Zamówienia → Postęp produkcji
`app/dashboard/orders/materials/production-progress/` +
`components/ProductionProgressTable.js`: the planners' list of what runs on
which production line is pasted in whole, and every position comes back with
the length of its run and how much is still to be made. Read-only, live
against CIP on every check, nothing stored.
- **The list is filled in a grid** (`ProductionProgressGrid.js`), two
  columns - line and number - so a shift's list goes in with one Ctrl+V out
  of Excel. It is the cut-down sibling of `BulkReceiveGrid` ("Przyjęcie
  zamówienia"): same glide-data-grid, same spare-row rule, same
  `installInsecureClipboardFallback()` (paste throws over plain HTTP without
  it) and the same two documented glide quirks (`editOnType` restarts the
  edit session per keystroke; the default `activateCell` binding of " "
  swallows spaces). No catalog lookups and no quantity sanitising here -
  there is nothing numeric to clean.
  - The number column takes **either** a job number or a bare order number;
    nothing here validates which, the API decides.
- **The paste is parsed by wpsApi, not here** (`POST
  /cip-orders/progress` - see its own AGENTS.md section for the format, and
  for why `layersFinishedLength` must never be read as "produced"). This
  screen deliberately has no idea what the format is, so the two cannot
  drift apart: the grid is serialised to the two-column tab-separated text
  that parser already handles (`progressRowsToText`) rather than growing a
  payload shape of its own.
- `lib/productionProgressApi.js` is a **Server Action** for the same reason
  `lib/cipOrdersApi.js` is one: the CIP bearer token lives in an httpOnly
  cookie and must never reach a `"use client"` file. It carries the same
  one-shot refresh-and-retry on `session_expired`.
- Each position also shows **which materials it needs** - one column per
  kind (FRP, PE), built from the API's own `materialKeys` exactly as the
  stage columns are, so a kind nothing in the paste needs is not a column
  and a new kind needs no change here (the header is the group's own code).
  Each cell gives the whole run's required amount and - when the run is part
  made - what is still to issue for the rest of it. Both numbers come from
  the API; don't re-derive them here.
  - **Each stage cell also carries the materials that stage consumes**
    (FRP, then the PBTP the tubes are extruded from, then the PE/LSZH
    jacket), each with what is still to issue in its own catalog unit - km
    for FRP, kg for a granulate or a compound. The amount is
    scaled by **that stage's** progress, not the run's, so the same
    material reads differently under SC and under SH. That is also why the
    full view has no standalone material columns: they would say the same
    thing twice with two different numbers. The plain view keeps them,
    having no stage columns to put them in.
  - The stage columns say **"nieskończone"** once in the header rather than
    in every cell, and "km" is printed after a figure only where the API own
    `inRunKm` says that stage really is counted in cable kilometres - SC is
    not.
  - Next to each order id sits **how many production lines that order runs
    on** across the whole result (names on hover), picked out in colour as
    soon as there is more than one: the same material then has to reach
    several places. The id itself keeps CIP own bracketed line number
    ("260010303024501(6)"); only a position CIP did not find falls back to
    the bare number, which is all the paste carried.
  - Which kind a material belongs to is decided **server-side**, and the
    kinds deliberately use different signals: FRP by catalog name, the
    compound and the granulate by catalog category (see wpsApi's
    `MATERIAL_GROUPS` for why each one is the only safe choice). Never
    re-derive either here from a name you see on screen.
- Above the table sits **what a day's run takes and how many packages that
  is**: one panel per group off the API's `packages` -
  `{ frp, tube, jacket }`. FRP comes in **rolls**, both bagged materials in
  **bigbags**. `tube` is the PBTP the loose tubes are extruded from (PBTB in
  the floor's spelling) and rides with the **SC** lines; `jacket` is PE and
  LSZH on the **SH / FC** lines. They were one group for a day
  (2026-10-12..13) and splitting them is what stopped the granulate being
  listed for the sheathing lines - the labels say "PBTP" and "PE / LSZH"
  rather than the keys' names. `PACKAGE_PANELS`
  is the whole difference here (the heading and the word for one), because
  the rule lives server-side - don't recompute it, and don't put a package
  size in this file. A group the API counted nothing for gets no panel.
  Each line group header also carries that line's own FRP total across its
  positions.
  - The headings say **"na dzień"** and carry the API's own `dailyKm`
    ("55 km na linię"): a day of one line's capacity is what the counts are
    for, so a 150 km order is counted for the day in front of it and counted
    again tomorrow. The figure is printed from the response, never written
    down here - it has already been 55, then 60 (2026-10-12), then 55 again
    (2026-10-14, as the average a line actually runs), and it will move
    again. The rule
    that a line's first position under 15 km gets no FRP is likewise the
    API's (see its AGENTS.md); this screen just shows the smaller number.
  - **Each material says on how many lines the day needs it**
    (`MaterialLines`, the API's own `lineCount`, 2026-10-14), names on
    hover and picked out in colour from two upwards - the same rule, and
    the same `onLines` string, as the count beside an order id. Two
    machines asking for one material is a different morning to plan than
    one asking for the same kilograms, and the per-line breakdown under it
    is small grey text somebody has to read through to work that out.
    - It is shown for **bigbags as well as rolls**, where the package count
      itself is not per line: a pooled bag is one count for the day and
      still has to be carried to every machine that asks. Don't take the
      count off `lines.length` here - a line whose share rounds away is
      excluded server-side, which is the only place that rule belongs.
  - **Per line or not, as the API says**: an item comes back with `pooled`,
    and the per-line breakdown shows each line's own count when it is false
    (a roll cannot leave its machine) and only each line's amount when it
    is true (one bigbag covers whatever asks for it). Don't sum the
    per-line counts to get the total - for a pooled item there are none.
  - **The package size is typed in here** (`PackageSizeInput`, sent as
    `packageSizes: { itemNo: size }`, remembered in `localStorage` under
    `wps.productionProgress.packageSizes`): bags and rolls differ per
    material and only the floor knows which is which. It commits on blur or
    Enter and **re-runs the whole check**, because the counting is the
    API's - a size nobody sees applied is a size nobody trusts. The API
    keeps the defaults and drops an unusable value, so nothing here
    validates beyond "a positive number".
  - **Each item also shows what one kilometre of cable takes of it** (the
    API's own `perKm` on the package item, added 2026-10-12): the day's
    amount is only this shift's, this is the figure you multiply by. It is
    **weighted by the cable it came from** server-side (`needed / cableKm`),
    because the same compound runs at a different rate under every cable, so
    an unweighted mean of the two rates would not reproduce `needed`.
  - **Both bigbag panels also take the weights of the bags on the floor**
    (`components/BigbagWeights.js` for the panel,
    `lib/bigbagWeights.js` for what the numbers mean; `localStorage` under
    `wps.productionProgress.bigbagWeights`, `{ itemNo: [1012, 987, ...] }`).
    A bigbag is weighed and no two come out the same, so "how many of the
    bags I have does today take" is not a division: `bigbagCoverage` takes
    them **heaviest first** (fewest to carry) and the panel's headline count
    becomes that number, with the API's nominal one beside it when they
    differ. Short of the day the nominal count leads again - nobody has
    weighed the bags still to come, so the weights cannot answer it.
    - **Nothing is sent and no check is re-run**, unlike a package size: the
      arithmetic is local, so it applies as it is typed. The weights never
      reach wpsApi, and the API's own count is never recomputed here.
    - Changes go through the parent as **a function of the list as it then
      is** (`setBigbagWeights(itemNo, change)`): blur fires before click, so
      typing a weight and clicking an X on a chip would otherwise write back
      a list that predates the weight just committed.
    - The maths lives in `lib/` and not in the component so the Excel export
      reads the same `bigbagCoverage`, and so it can be asserted on in plain
      node - this screen is behind a CIP login with a pasted production list,
      which is a poor place to find out the arithmetic is wrong.
- **Excel export: one sheet, three columns** (`lib/productionProgressExport.js`,
  2026-10-12): a banded row naming the production line, then that line's
  orders under it - the order, **what is left of that line's own work on it**
  (the API's `lineRemainingLength`, not the order's remainder - a position can
  be stranded and still have its whole jacket to go), and **what that line
  puts into it, in one cell** (`lineMaterials`, the same filter the plain view
  uses), item number first, FRP before the bagged materials, and every bagged
  material carrying its per-kilometre rate in brackets. The amounts in that
  cell are the line's stage too, scaled server-side - see wpsApi's
  `materialsForLineStage`; **don't re-scale anything here**.
 That cell is what somebody
  loading a trolley reads. The first version put each line on its own tab and
  each figure in its own column; it was asked to be one table the same day, so
  **don't spread this back out into tabs or columns**. A position CIP did not
  find keeps its row, with the reason where the materials would be. Every
  number is one the API already sent and the screen already shows - nothing is
  derived a second time, so the file and the screen cannot disagree.
  - `buildProgressSheets` is split from the download, and `buildWorkbook` is
    exported from `lib/xlsxExport.js`, so the whole file can be built and read
    back in plain node - `downloadStockXlsx` itself needs a Blob and a click.
  - `sectionRows` / `wrapCols` / `colWidths` on a sheet are **this export's**
    additions to that shared writer (banded line rows, one wide wrapping
    materials cell). Left out, a sheet is written exactly as the reference
    stock export always was - don't change `DATA_STYLE` or `HEADER_STYLE` for
    this screen's sake, they match a real file byte for byte.
- **Two views and per-column hiding, both off one column model**
  (`columnsFor`): a column is `{ id, label, identity?, numeric?,
  showsWhenMissing?, materialKey?, processKey? }`, and every row cell goes
  through `PositionCell`'s switch on it. That indirection is the point -
  hiding a column or swapping the view can never leave the header and the
  rows disagreeing, which a fixed run of `<TableCell>`s could not promise.
  - **Pełny**: grouped by line with per-line subtotals, every column.
  - **Prosty**: grouped by line exactly as the full view is - the line
    heads its own group, so it is not repeated in a column - carrying just
    the order number and a single stage column holding **the stage that
    line actually runs**
    (the API's `lineProcess`: ST strands, SC extrudes the tubes, SH and FC
    sheathe).

    Same cell content as the full view, so an ST line is never asked about
    sheathing and the other stages are not columns of blanks. A line whose
    name says nothing about its stage shows a dash, never another stage's
    figures. The group header summarises that one stage, since every row
    under it is on the same line and so runs the same one.
    **The materials are the kinds this line's stage consumes**
    (`lib/lineMaterials.js` filtering the position's own BOM by the API's
    `lineMaterialKeys`) - the one deliberate difference from the full view,
    and twice a fix, not a shortcut. Reading `figures.materials` (the BOM's
    own process) left the FRP off exactly the lines that run it, because CIP
    files FRP's rows under "SC" while an ST line's own stage is "SZ". Reading
    the **whole** position BOM instead then listed FRP on sheathing lines,
    which put no FRP in at all (reported 2026-10-12). `ProcessCell` takes a
    `materials` override for this, and keeps showing them even when CIP
    reports nothing on the stage - the second way the same materials used to
    disappear behind a dash.
    **Never re-derive which kinds a line takes from a stage code here**: it
    is a rule about the plant and it lives in wpsApi
    (`STAGE_MATERIAL_GROUPS`). A row without `lineMaterialKeys` keeps
    everything.
    Its material rows also carry **consumption per kilometre of cable**
    (the API's `perKm`) under the amount still needed - the figure you
    multiply by to plan, as against what is left right now. Only this view
    shows it; the full one is already dense with four stage columns.
  - Hidden columns are a `Set` of ids in state, toggled from the same
    `Columns3` + `DropdownMenuCheckboxItem` control `MaterialsTable` uses.
    The last visible column cannot be switched off. The per-line header row
    spans whichever `identity` columns are visible and summarises the rest,
    so hiding one never knocks it out of alignment.
- **One column per process stage, built from the API's own `processKeys`** -
  never a hardcoded list of stages. CIP has fifteen and a cable normally
  goes through about four, so the API sends only the ones something in the
  result reports on and this screen renders exactly those; a stage that
  stops being reported stops being a column on its own, with no change here.
  Every `colSpan` is therefore computed (`3 + processKeys.length`), not a
  literal.
  - Each cell is **what is left of that stage and what it is out of**, in
    that stage's own unit - so a stage column is read down its own length
    and never across to another. Stranding is the case that makes this
    matter: a 44 km run reports 264 there. The percentage (the bar, and the
    cell's `title`) is the stage against its own planned amount.
  - The run-level "Zostało/Zrobione/Postęp" columns were dropped when these
    went in: SH's column carries exactly those numbers, and the summary
    cards above the table still give the whole paste's kilometres.
  - Per-line subtotals sum each stage down its own column, for the same
    unit reason.
- Grouped by line with per-line subtotals, in the pasted order, because the
  question being asked is "what is left on ST03" and not "what is left on
  position 544069". The percentages are recomputed from summed kilometres,
  never averaged, so a 500 km run counts for more than a 10 km one.

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
