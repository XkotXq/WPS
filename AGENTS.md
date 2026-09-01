# Project context

This is the **WMS dashboard** ("wps") in a 3-app warehouse stock-tracking
system for FRP / coated-FRP / filler materials:

- `../api` (pushed to GitHub as `wpsapi`/`wpsApi`) — Express + Postgres
  backend. Owns all data: `frp_current` / `coated_frp_current` /
  `filler_current` tables (live inventory) plus historical stock-take
  snapshots. Generic CRUD (`listItems`/`createItem`/`updateItem`/
  `deleteItem`/`reorderItems`/`transferItem` in `src/items.js`) driven by
  per-material field config in `src/materials.js`.
- `./` (this app, "wps") — internal dashboard: reports, balances,
  materials catalog, current-list editing, CIP export. Server Components
  fetch from the API via `lib/api.js`; a shared bearer token
  (`API_TOKEN`, must match the API's `.env`) authenticates every request
  except `/api/health` and `/api/auth/*`.
- `../stock` (pushed to GitHub as `stock`, package name `frp`) — the
  original consumer-facing static export app warehouse staff use to do
  the actual stock check/count. Also API-backed for its item master
  list; check-session state (statusMap, selectedIds, etc.) stays
  localStorage-only by design.

Auth: both `wps` and `stock` log in against the company's legacy CIP
system (OAuth2 password grant) proxied server-side through
`POST /api/auth/login` (the API talks to CIP directly so the browser
never hits CIP's CORS wall). Both apps have a `SKIP_CIP_AUTH` /
`NEXT_PUBLIC_SKIP_CIP_AUTH` env escape hatch for when CIP itself is
unreachable — it is hard-disabled outside `NODE_ENV=production` builds
(see `lib/cipSession.js`), so it can never silently accept any
credentials in a real deployment. Do not remove that production guard.

Known gotchas worth knowing before editing:
- Next.js Server Components **cannot** pass functions as props to Client
  Components — table column configs use a serializable `type` flag
  (`"boolean"`, `"datetime"`) instead of a `render` callback for any
  column whose config crosses that boundary (see `MaterialsTable.js`).
- Large tables (~200+ rows) need memoized rows with a custom `React.memo`
  comparator that ignores callback-prop identity, or every click
  re-renders the whole table (see `stock/src/app/page.js`'s `MaterialRow`
  for the reference pattern this app should follow if a similar table
  grows).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
