# EKSU Sports Hub

Live scores, fixtures, results and tables for Ekiti State University sport.
Public frontend built with Next.js (App Router), TypeScript and Tailwind CSS v4.

> **Status:** frontend preview running on **demo data**. There is no backend,
> authentication or realtime feed yet — scores change only when the page is
> reloaded.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
npm run typecheck
npm run test:operator   # operator engine journey test (Node test runner)
```

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

## Match Operator Console (`/op`)

A separate, utilitarian app for the staff member controlling a live match.
Not linked from the public site and marked `noindex`. **Demo only**: mock
signed-in operator, mock assignments, no backend, no auth, no realtime.

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
  transport.ts   MOCK delivery (online / offline / failing), strict ordering
  store.ts       client store, mirrored to localStorage (device-only demo)
  actions.ts     OperatorActions API: startMatch, recordEvent, voidEvent, …
  time.ts        time source with a server-offset hook
  data/          server-side mock operator + assignments
src/components/operator/   console UI (sheets, flows, hold-to-confirm, timeline)
tests/operator-engine.test.ts
```

**Persistence:** match state, prep checks and the intent queue are kept in
this browser's `localStorage` so a refresh keeps the demo; intents that were
mid-send return to the queue on reload. Nothing is sent to a server. Use
"Demo controls → Reset this match" (or clear site data) to start over.
Demo controls also simulate Online / Offline / Server failing.

**Backend phase replaces:** `operatorActions` (→ authenticated RPCs named in
`COMMANDS[…].rpc`), `transport.deliver` (→ Supabase RPC calls),
`createMemoryIntentStore` (→ IndexedDB), `lib/operator/data` (→ RLS-scoped
queries for the signed-in operator), `time.ts` server offset, and the mock
operator identity (→ real auth). The state machine guards are the checks each
RPC must enforce server-side.

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

### Replacing the mock data

Implement `SportsDataSource` (e.g. with Supabase) and assign it in
`src/lib/data/index.ts`. Pages and components never import mock data directly.
Flip `DATA_SOURCE_KIND` to `"live"` to remove the demo-data notice.

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
