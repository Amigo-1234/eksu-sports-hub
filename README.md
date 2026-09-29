# EKSU Sports Hub

Live scores, fixtures, results and tables for Ekiti State University sport.
Public frontend built with Next.js (App Router), TypeScript and Tailwind CSS v4.

> **Status:** the public site, match operator console (`/op`) and admin
> dashboard (`/admin`) all run on **Supabase** (auth, RLS, RPC write path,
> realtime live scores) — see [docs/BACKEND.md](docs/BACKEND.md). Demo data is
> only used when explicitly selected (`PUBLIC_DATA_SOURCE=mock`, dev/testing).

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
npm run typecheck
npm run test:operator   # operator engine + reconciliation tests
npm run test:db         # pgTAP database tests (needs `npx supabase start`)
npm run test:backend    # API tests against local Supabase
```

Backend setup (local Supabase, dev accounts, hosted project): **[docs/BACKEND.md](docs/BACKEND.md)**.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Home — live now, today, upcoming, recent results, table preview |
| `/live` | Matches in progress only |
| `/fixtures` | Upcoming matches by date (`?competition=` filter) |
| `/results` | Completed matches by date (`?competition=` filter) |
| `/table` | League tables (`?competition=` switcher) |
| `/competitions` | Competition directory |
| `/competitions/[id]` | Overview, `/fixtures`, `/results`, `/table` |
| `/matches/[id]` | Match centre — Summary, Line-ups, Stats, H2H |
| `/teams/[id]` | Team — position, form, next fixture, results |

## Public data & realtime

Public pages read real Supabase data (`src/lib/data/supabase`); Home, `/live`
and match pages update scores, clocks and events live via Supabase Realtime
hints + canonical refetch (`src/lib/realtime`, `src/components/realtime`). See
docs/BACKEND.md → "Public data + realtime".

## Admin dashboard (`/admin`)

Supabase-backed administration for ADMIN accounts: competitions, teams,
squads, fixtures, operator assignments, live monitoring, event-based
corrections, standings, staff and a read-only audit log. Sign in at
`/admin/login`. See **docs/ADMIN.md** for routes, security model and the
first-administrator bootstrap.

## Match Operator Console (`/op`)

A separate, utilitarian app for the staff member controlling a live match.
Not linked from the public site and marked `noindex`. Backed by Supabase when
`NEXT_PUBLIC_OPERATOR_BACKEND=supabase` (sign-in at `/op/login`); the
original in-browser demo remains available with `=mock`.

| Route | Purpose |
| --- | --- |
| `/op` | My matches — Today (live first) / Upcoming / Completed |
| `/op/matches` | All assignments |
| `/op/matches/[id]` | Match prep — checklist, connection, hold-to-start |
| `/op/matches/[id]/live` | Live console — score, clock, Goal/Card/Sub, undo, stoppage, pause, periods |

Unassigned match IDs return "Not assigned to you" (404).

```
src/lib/operator/
  types.ts       operator domain (OpMatchState, OpEvent, Assignment…)
  clock.ts       timestamp-derived clock (periodStartedAt, offset, pauses, stoppage)
  machine.ts     state machine: commands, allowed phases, guards, RPC names, roles
  engine.ts      pure command application; score recomputed from non-voided events
  seed.ts        published match → operator starting state
  queue.ts       intent model + IntentStore seam (memory now, IndexedDB later)
  canonical.ts   server (RPC) state → operator state
  backends/      mockOperatorBackend | supabaseOperatorBackend (RPC delivery)
  transport.ts   ordered delivery, retry, discard
  store.ts       cache + optimistic layer; reconcile() = server state + pending replay
  actions.ts     OperatorActions API: startMatch, recordEvent, voidEvent, …
  time.ts        time source; server offset measured via server_time()
  data/          mockOperatorDataSource | supabaseOperatorDataSource (server reads)
src/components/operator/   console UI (sheets, flows, hold-to-confirm, timeline)
tests/operator-engine.test.ts
```

**Persistence:** with the Supabase backend, Postgres is the source of truth;
the browser keeps only a cache and the queue of not-yet-sent actions
(`localStorage`, IndexedDB later). With the mock backend, state lives only in
the browser.

## Architecture

```
src/
  app/(public)/        public routes, loading / error / not-found states
  app/op/              match operator console (separate chrome)
  components/
    layout/            app header, desktop nav, mobile bottom nav
    match/             match row, live card, hero, timeline, tabs, panels
    standings/         responsive standings table
    team/              crest placeholder, form guide
    competition/       competition list + badge
    ui/                icons, empty state, skeletons, chips, tabs
  lib/
    types.ts           domain model (Sport, Competition, Team, Match, MatchEvent, Standing…)
    status.ts          MatchStatus helpers + backend phase mapping (PRE/1H/HT/2H/FT)
    standings.ts       league table calculation from completed matches
    format.ts          campus-time (WAT) formatting
    data/
      source.ts        SportsDataSource interface — the only contract the UI uses
      index.ts         server-only accessors; swap the source here
      mock/            DEMO DATA ONLY (reference data + relative-time fixture list)
```

### Data sources

`SportsDataSource` has two implementations: `src/lib/data/supabase` (real data,
the default) and `src/lib/data/mock` (demo data, only with
`PUBLIC_DATA_SOURCE=mock` outside production). Selection lives in
`src/lib/data/config.ts`; pages and components never import either directly.
The "Preview build" notice only appears on demo data.

### Match status

The UI understands `SCHEDULED`, `LIVE_FIRST_HALF`, `HALF_TIME`,
`LIVE_SECOND_HALF`, `FULL_TIME`, `POSTPONED`, `CANCELLED`, `ABANDONED`.
`toMatchStatus(phase, disposition)` maps a backend clock state machine
(`PRE → 1H → HT → 2H → FT`, plus postponed/cancelled/abandoned) onto it.
The running minute is derived from `periodStartedAt`.

### Demo scenarios

Copy `.env.example` to `.env.local` and set `MOCK_SCENARIO` to
`no-live`, `empty` or `error` to preview those states, or `MOCK_LATENCY_MS`
to see loading skeletons.
