# EKSU Sports Hub — backend (phase 1: operator write path)

The operator console (`/op`) runs on Supabase: Postgres + Auth + RLS +
SECURITY DEFINER RPCs. The **public site still uses mock data** (see
"Boundary" below).

## Local setup

```bash
# Docker must be running. (In restricted networks where ECR is blocked, add
# SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io.)
npx supabase start -x studio,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta,realtime
cp .env.example .env.local        # paste URL + publishable + secret keys printed by `supabase start`
npx supabase db reset             # migrations + supabase/seed.sql from a clean database
npm run dev:users                 # dev accounts via the Auth admin API (local only by default)
npm run dev                       # sign in at http://localhost:3000/op/login
```

Development accounts (password = `DEV_USER_PASSWORD`):

| Email | Role | Assignment |
| --- | --- | --- |
| admin@dev.eksu.test | ADMIN | — |
| primary@dev.eksu.test | OPERATOR | PRIMARY on DEV Science v DEV Engineering (+ Matchday 2) |
| backup@dev.eksu.test | OPERATOR | BACKUP on DEV Science v DEV Engineering |
| other@dev.eksu.test | OPERATOR | PRIMARY on DEV Arts v DEV Education only |

## Tests

| Command | What |
| --- | --- |
| `npm run test:db` | pgTAP (105): RLS/privileges per role, state machine, scoring, idempotency, voids, discipline/squad rules, clock, takeover, audit immutability, standings |
| `npm run test:backend` | API over HTTP with real sign-ins: parallel duplicate retries, 20 concurrent events from two sessions, direct REST writes rejected, persistence from a fresh session |
| `npm run test:operator` | Frontend engine + canonical reconciliation |

## Architecture

```
supabase/migrations/
  …000100_foundation.sql        schemas, enums, profiles/roles/user_roles, role helpers
  …000200_sports_structure.sql  sports, seasons, faculties, departments, venues,
                                competitions (+stages/groups/entries), teams, players, squads
  …000300_matches.sql           matches (authoritative clock state), match_periods,
                                event_types, match_events, operator_assignments,
                                match_intents (idempotency ledger), standings, audit_log
  …000400_rls.sql               RLS on every table + explicit grants
  …000500_match_rpc.sql         the write path (RPCs) + canonical state
  …000600_standings.sql         standings recompute from competition config
supabase/seed.sql               development data only (no people)
supabase/tests/*.test.sql       pgTAP suites (helpers.inc is shared)
```

### Write path
Every match change goes through one RPC:
`start_match`, `record_event`, `void_event`, `end_period`, `start_period`,
`set_stoppage`, `pause_match`, `resume_match`, `finalise_match`,
`take_over_match` (plus `operator_match_state`, `update_assignment_prep`,
`server_time`, `admin_recompute_standings`).

Each one: `auth.uid()` → staff role → **active assignment** → `SELECT … FOR
UPDATE` on the match row → idempotency check → state-machine check → control
check (only `matches.active_operator_id` may make live changes) → validation
(teams in match, players in that team's squad for the season, discipline and
substitution rules, minute range) → mutation → score recompute → `seq + 1` →
idempotency ledger → audit row → change hook → canonical state returned.

- **Scores** are recomputed from non-voided events whose `event_types.scores_for`
  is set (GOAL/PENALTY_GOAL: SELF, OWN_GOAL: OPPONENT). No RPC takes a score;
  `finalise_match` only *confirms* the current one.
- **Idempotency**: `record_event` uses the client event id as the key; every
  other command takes a client `p_intent_id` recorded in `match_intents`. A
  retry returns the canonical state with `replayed: true`.
- **Concurrency**: the row lock serialises commands per match; `seq` is bumped
  inside the lock, so events can never share a sequence.
- **Clock**: `period_started_at`, `period_offset_seconds` (0 / 2700),
  `clock_running`, `paused_at`, `accumulated_pause_seconds`,
  `stoppage_seconds` (display only), `period_ended_at`; per-period history in
  `match_periods`. Clients derive the minute; `server_time()` gives the offset.
- **Audit**: `audit_log` is append-only via triggers that reject
  UPDATE/DELETE/TRUNCATE for every role, including the owner.
- **Standings**: `private.recompute_standings()` at FT, using
  `competitions.points_win/draw/loss` and `tiebreakers`
  (points, goal_difference, goals_for, wins). Ties share a rank.
- **Realtime prep**: all RPCs end in `private.after_match_change()` (pg_notify
  today). The next phase broadcasts `match:{id}` / `scores:live` from there.

### RLS summary
| Data | anon | signed-in (no role) | operator | admin |
| --- | --- | --- | --- | --- |
| sports, competitions, teams, venues, standings, event types | read | read | read | read |
| matches / match_events | read (no operator columns) | same | same | same |
| players, squads | — | — | read | read |
| profiles, user_roles | — | own | own | all |
| operator_assignments | — | — | own active | all (admin/manager) |
| audit_log | — | — | — | read |
| match_intents | — | — | — | — |
| any write to matches, events, standings, audit | — | — | via RPC only | via RPC only |

### Frontend
`OperatorActions` (unchanged UI API) → optimistic local apply → intent queue →
`backends/supabase.ts` (RPC) → canonical state → `store.reconcile()` (server
state + replay of still-pending intents). `NEXT_PUBLIC_OPERATOR_BACKEND`
selects `supabase` or `mock`; unset in production shows a configuration error.

### Boundary: public site vs operator backend
The public pages (`/`, `/live`, `/matches/[id]`, …) still read the mock data in
`src/lib/data/mock` and show a "Preview build" notice. Scores entered in `/op`
are authoritative in Postgres but **do not appear on the public site yet**;
connecting `SportsDataSource` to Supabase is the next phase.

## Authentication
Email + password through Supabase Auth (works without external services).
Public sign-up is disabled (`[auth] enable_signup = false`); accounts are
created by an administrator (Auth admin API / dashboard) and given roles.

**Phone OTP later** requires an SMS provider (Twilio, MessageBird, Vonage or
Textlocal) configured in Supabase → Authentication → Providers → Phone, and
replacing `LoginForm` with `signInWithOtp({ phone })` + `verifyOtp`. Nothing
else changes: authorisation depends only on `auth.uid()`.

## Hosted project (deployed 2026-09-29)

| | |
| --- | --- |
| Project | `eksu-sports-hub` · ref `lkvdoeomyhbtinpvvbfr` · eu-west-2 (London) · Free plan |
| API URL | `https://lkvdoeomyhbtinpvvbfr.supabase.co` |
| Migrations applied | `20260928000100` … `20260928000700` (history versions aligned with this repo) |
| Pending | `20260929000800_admin.sql` — admin dashboard support; **not yet applied** (awaiting approval) |
| Seed | **not** run (no development data on the hosted project) |
| Auth users | none yet |

The hosted verification (47 checks after 000600; 55 checks after 000700, adding
private-helper denial and RLS-helper behaviour: RLS per role, every RPC, idempotency,
voids, discipline rules, clock/periods, takeover, FT lock, audit immutability,
standings) ran inside a transaction that was rolled back, so nothing persisted.

## Connecting a hosted Supabase project
1. Create a project; note the project ref, URL, publishable and secret keys.
2. `npx supabase link --project-ref <ref>` then `npx supabase db push`
   (applies the migrations; do **not** run `seed.sql` on production).
3. Authentication → Providers: keep Email enabled; turn **off** "Allow new users to sign up".
   Set Site URL to your deployment URL.
4. Bootstrap the first administrator once (see docs/ADMIN.md → "First
   administrator"); every later account is created from `/admin/staff`.
5. Vercel: set `NEXT_PUBLIC_OPERATOR_BACKEND=supabase`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and —
   for staff invites from the admin dashboard — `SUPABASE_SECRET_KEY` as a
   **server-only, Sensitive** variable (never `NEXT_PUBLIC_…`). It is read only
   by `src/lib/admin/authAdmin.ts` (a `server-only` module).
