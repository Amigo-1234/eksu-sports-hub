# Admin dashboard (`/admin`)

Real, Supabase-backed administration for EKSU Sports Hub. Sign in at
`/admin/login`. Only accounts with the **ADMIN** role (and not deactivated)
can use it; everyone else sees `/admin/unauthorized`.

## Access control — three layers

| Layer | Where | What it does |
| --- | --- | --- |
| Session | `src/proxy.ts` | Refreshes the Supabase cookie for `/admin`, `/op`, `/auth`; signed-out visitors go to `/admin/login?next=…`. |
| Server | `src/lib/admin/permissions.ts` | `requireAdmin()` runs in the layout, **every page and every data loader** (layouts are not re-rendered on client navigation). `assertAdmin()` runs at the start of **every server action** (they are reachable by direct POST). Roles are read from Postgres for the JWT-verified user — never from the client. |
| Database | migration `20260929000800_admin.sql` | RLS write policies on reference tables require `private.has_role('ADMIN')`; every `admin_*` RPC calls `private.require_admin()` (SECURITY DEFINER, `search_path = ''`). Deactivated staff fail `has_role` for every role. |

## Routes

| Route | Purpose |
| --- | --- |
| `/admin` | Dashboard: live / today / upcoming / completed counts, active competitions, teams, operators, fixtures without a primary operator, LIVE NOW, warnings (kick-off within 3 h without a primary operator, unfinished competition setup, entered teams without a squad) |
| `/admin/live` | Live monitor (score, minute, period, venue, operator in control, last event, last activity; auto-refresh 15 s) |
| `/admin/matches` · `/new` · `/[id]` | Fixture list with filters (date, competition, status, team, venue, operator assignment); create; match management & inspection |
| `/admin/assignments` | Fast PRIMARY/BACKUP assignment for upcoming and live fixtures, operator load |
| `/admin/standings` | Read-only tables per competition / group, recompute button |
| `/admin/competitions` · `/new` · `/[id]` | Competitions, status (draft/active/archived), rules, stages, groups, entries |
| `/admin/teams` · `/new` · `/[id]` | Teams (search, slug, colours, faculty/department, activate/deactivate) and squads |
| `/admin/players` | Team → season → squad (shirt, position, captain) |
| `/admin/seasons`, `/admin/faculties`, `/admin/venues` | Reference data |
| `/admin/staff` · `/[id]` | Staff accounts, roles, activation, invite / password links, assignments |
| `/admin/audit` | Read-only audit viewer with filters and before/after diffs |
| `/admin/settings` | Current season and system status (only settings that exist) |
| `/auth/confirm`, `/auth/set-password` | One-time invite / reset link landing and password choice |

## Architecture

```
UI (src/app/admin, src/components/admin)
  → src/lib/admin/data/*      server-only reads (requireAdmin + RLS)
  → src/lib/admin/actions/*   "use server" mutations (assertAdmin + validation → RLS writes or admin_* RPCs)
  → Supabase (Postgres RLS, SECURITY DEFINER RPCs, audit triggers)
src/lib/admin/authAdmin.ts    the only code that reads SUPABASE_SECRET_KEY (server-only)
src/lib/admin/permissions.ts  requireAdmin / assertAdmin
src/lib/admin/types.ts, errors.ts, time.ts, clock.ts
```

* Reference data (seasons, faculties, departments, venues, competitions,
  stages, groups, entries, teams, players, squads) is written with plain
  inserts/updates **allowed by ADMIN-only RLS policies** and audited by the
  `audit_admin_change` trigger (`ADMIN_INSERT/UPDATE/DELETE`).
* Anything touching match state goes through RPCs: `admin_create_match`,
  `admin_update_fixture` (scheduled only; never score/clock/seq),
  `admin_set_match_outcome` (POSTPONED / CANCELLED / ABANDONED with reason),
  `admin_reschedule_match`, `admin_assign_operators`, `admin_clear_assignments`,
  `admin_void_event`, `admin_add_event`, plus `admin_grant_role`,
  `admin_revoke_role`, `admin_set_staff_active`, `admin_list_staff`,
  `admin_match_detail`, `admin_live_matches`, `admin_set_current_season`.
* Corrections are event-based: the score is always re-derived from events;
  a correction after full-time recomputes standings.
* Deletion is only offered where nothing cascades away with the row, and a
  trigger refuses it while dependencies exist. Seasons and competitions are
  archived, teams deactivated — never deleted.
* Times are entered and shown in campus time (WAT, UTC+1); stored as `timestamptz`.

## Staff accounts (no passwords handled by admins)

"Add staff member" calls Supabase Auth `admin.generateLink({ type: "invite" })`
on the server, grants the role through `admin_grant_role` (as the signed-in
admin, so it is re-checked and audited) and shows a **one-time link** to pass
on privately. The person opens it, presses *Continue* (the token is verified
on POST, so link scanners cannot consume it) and chooses their own password.
Password resets work the same way (`type: "recovery"`). Nothing secret is
stored in our tables; the link is not stored or shown again.

Deactivating staff sets `profiles.deactivated_at` (every role stops working at
once, and they are removed from control of live matches) and bans sign-in at
the auth service.

Requires the server-only env var `SUPABASE_SECRET_KEY`. Without it the rest of
the dashboard works and the invite form explains what is missing.

## First administrator

There is no sign-up. The very first ADMIN has to be bootstrapped once, by the
project owner, without sharing any password:

0. The hosted database needs its reference rows first: run
   `supabase/reference.sql` (roles, football, event types; idempotent).
1. Supabase Dashboard → Authentication → Users → **Invite user** (their email).
2. SQL editor: grant the role (replace the email):
   ```sql
   insert into public.user_roles (user_id, role_id)
   select u.id, r.id from auth.users u, public.roles r
   where u.email = 'first.admin@example.com' and r.code = 'ADMIN';
   ```
3. They accept the invite email and set a password (Site URL must point at the
   deployment), then sign in at `/admin/login`.

Everyone after that is invited from `/admin/staff`.

## Not built (by design)

Crest upload (no Storage bucket is provisioned yet), extra time / penalty
shoot-out recording (the flags are stored as competition rules only), public
realtime, notifications, public accounts.

## Tests

* `npx supabase test db` — `supabase/tests/03_admin.test.sql` (88 checks: access
  denial for anon/operators/non-staff, seasons, delete guards, teams/slugs,
  squads, fixture validation, assignments and the one-primary constraint,
  void/add corrections with score + standings recompute, outcomes, abandon,
  roles, deactivation, audit immutability).
* `npm run test:backend` — API-level refusal for anon/operators, admin RPCs.
* `npm run test:admin` — WAT conversion and error mapping.
