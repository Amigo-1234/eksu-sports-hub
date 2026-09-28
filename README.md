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

## Architecture

```
src/
  app/                 routes, loading / error / not-found states
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
