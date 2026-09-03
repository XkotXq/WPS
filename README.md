# wps

Internal WMS dashboard for FRP / coated-FRP / filler warehouse
materials: stock lists, balances between stock rounds, per-item trend
reports, the shared FRP catalog, CIP-integrated materials management,
and operation history.

Part of a 3-app warehouse system:

- **wps** (this app) — the internal dashboard.
- [**stock**](../stock) — consumer-facing app warehouse staff use to do
  the physical stock check/count.
- [**wpsApi**](../wpsApi) — the shared Express/Postgres backend both
  apps talk to.

## Features

- **Lista stocków** / **Aktualna lista** — browse a stock round or the
  live current inventory, with per-column filtering, sorting, column
  visibility, resizable columns, and Excel export on every table.
- **Bilans** — compare drum-level state between any two stock rounds.
- **Raporty** — length/drum-count trends per material, and a per-item
  breakdown table comparing any two picked dates.
- **Baza FRP** — manage the shared FRP item catalog.
- **Materiały** — live inventory from the legacy CIP system
  (temporary-storage warehouse), operation history, and per-item
  quantity-over-time charts.
- **Zamówienia CIP** / **Wydania WMS** — placeholders for upcoming
  order/issue-tracking features.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables (`.env.local`)

| Variable | Purpose |
| --- | --- |
| `API_BASE_URL` | Base URL of the `wpsApi` backend (e.g. `http://localhost:4000`) |
| `API_TOKEN` | Shared bearer token, must match `API_TOKEN` in `wpsApi`'s `.env` |
| `SKIP_CIP_AUTH` | `true` to bypass the CIP login screen in development (ignored in production builds); also swaps live CIP materials data for a small test fixture |

### Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build and serve

## Tech stack

Next.js (App Router, Server Components) · React · Tailwind CSS ·
shadcn/`@base-ui` components · TanStack Table · Recharts · next-intl
(PL/EN) · `xlsx-js-style` (Excel export)

See [`AGENTS.md`](./AGENTS.md) for implementation details and gotchas.
