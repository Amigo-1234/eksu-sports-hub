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
| `npm run test:db:safeupdate` | The same pgTAP files with `pg_safeupdate` loaded, as in PostgREST sessions (UPDATE/DELETE without a WHERE clause fail there but not in plain psql). Local only |
| `npm run test:backend` | API over HTTP with real sign-ins: parallel duplicate retries, 20 concurrent events from two sessions, direct REST writes rejected, persistence from a fresh session |
| `npm run test:operator` | Frontend engine + canonical reconciliation |
| `npm run test:audience` | Audience request validation (clients can only say start / still here / gone) |
| `npm run test:notifications` | Alert preferences, iOS/iPadOS/unsupported detection, push-result classification, feature flag, service worker (push / click / subscription rotation in a sandbox) |

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

### Public data + realtime (migration 20260930000900)
The public site reads real data through `src/lib/data/supabase` (anonymous,
cookie-less, publishable key). Source selection is explicit
(`src/lib/data/config.ts`): `PUBLIC_DATA_SOURCE=supabase|mock`, defaulting to
Supabase whenever it is configured; mock is refused on a Vercel production
deployment and an unconfigured production build shows an error, never demo data.

Public read surface (RLS): draft competitions and everything under them are
hidden; event `payload`/`void_reason`, operator ids, profiles, squads, roles and
the audit log are not readable by `anon`. Two public RPCs return exactly what the
UI renders: `public_match_feed(match, after_seq)` (canonical match row + events
after a seq, with shirt numbers, + all voided ids + server time) and
`public_live_scores()` (live matches + last event + server time).

Realtime: `private.after_match_change` (called by every operator/admin match
RPC) sends a small hint `{match_id, seq, kind, status}` with `realtime.send` to
private channels `match:{id}` and `scores:live` (published competitions only).
RLS on `realtime.messages` lets anon/authenticated **listen** to those topics and
nobody publish. Clients treat hints as "changed at seq N": duplicates (seq ≤
known) are ignored, otherwise they fetch `public_match_feed` after the known seq
(which also fills gaps), and they resync on (re)subscribe, tab resume, network
return and a 30 s safety poll. The minute is derived from the server clock fields
plus a server-time offset. Caching: reference data 300 s, fixture/result lists
and standings 30 s (tag `public-data`, invalidated by admin mutations); live,
today and match detail are always fresh.

### Screening, squads and line-ups (migration 20261001001000)

`PLAYER REGISTERED → SCREENING → ELIGIBILITY → SQUAD → MATCHDAY LINE-UP → OPERATOR CONFIRMATION → PUBLIC LINE-UP`

- **Identity**: `player_identities` (student / matric number) is a separate
  ADMIN-only table with a unique normalised key (case/space-insensitive).
  Operators can read player names, never identities. Audit rows keep the
  number masked. Verification documents can later reference `player_id`.
- **Screening**: `player_screenings` holds the current decision per player +
  team + season (+ optional competition); `player_screening_decisions` is the
  append-only history. Eligibility (`private.screening_status`) is CLEARED only
  when the season screening is CLEARED and a competition screening, if any, is
  CLEARED too (competition scope only adds restrictions). REJECT/SUSPEND need a
  reason; CLEAR needs a student number on file. Only ADMIN decides (no scoped
  MANAGER model exists yet).
- **Squads** stay team + season: one squad per team per season serves every
  competition the team is entered in (`competition_entries`), so squads carry no
  competition column and nothing is duplicated. Memberships are deactivated
  (`active`, `left_at`, `left_reason`), never deleted; shirt/captain uniqueness
  applies to active members. A trigger requires a CLEARED screening for the
  squad's team + season.
- **Competition-aware representation**: a player may be active in several teams'
  squads in one season (e.g. Mechanical Engineering in the inter-departmental
  cup and Faculty of Engineering in the inter-faculty league). What is refused
  is representing two teams entered in the SAME competition, unless that
  competition sets `allow_multi_team_players`. Enforced from every side:
  squad membership (`private.team_conflict`), entering a team, switching the
  competition rule off (`private.competition_conflict`), and line-up
  eligibility (`CONFLICT`, defence in depth).
- **Line-ups**: `match_lineups` (DRAFT → CONFIRMED; confirmed = public) and
  `lineup_players` (player id, shirt snapshot, STARTER/SUBSTITUTE, position,
  slot, pitch x/y 0–100, captain, goalkeeper). `formations` are data. Rules
  (`private.lineup_rules`): 7–11 starters, ≤ 12 substitutes, exactly one
  starting goalkeeper, captain must start, every player CLEARED + active squad
  member. Writes only via `save_lineup` / `confirm_lineup` / `reopen_lineup`
  before kick-off and `admin_correct_lineup`
  (after kick-off, reason required). A trigger locks line-ups once the match
  leaves SCHEDULED. A screening change / squad removal that invalidates a
  confirmed line-up of an upcoming match reopens it (audited, unpublished).
- **Who edits before kick-off**: ADMIN always; among assigned operators only
  the one in control — `matches.active_operator_id` (the existing match-control
  model), or the active PRIMARY while nobody has taken control. A BACKUP sees
  line-ups read-only (`viewer_role: VIEWER`) until an audited `take_over_match`;
  the PRIMARY is then read-only until it takes control back. No second control
  mechanism exists. After kick-off only `admin_correct_lineup` changes line-ups.
- **Who starts the match**: the same rule. `start_match` refuses (EK403, "Take
  control to start this match") anyone but the operator in control, or the
  active PRIMARY while nobody has taken control; a BACKUP takes over first
  (audited). An ADMIN assigned to the match may always start it, and an admin
  reassigning operators returns control to the current PRIMARY.
- **Kick-off**: `start_match` requires both line-ups CONFIRMED and still valid,
  unless `admin_set_lineup_override` recorded a reason (audited).
- **Events**: with a confirmed line-up, `record_event` / `admin_add_event`
  require players from it; scorers and the player going off must be on the
  pitch; the player coming on must be an unused, undismissed substitute. On-field
  state (`private.lineup_player_states`) = line-up + non-voided events, so voiding
  a substitution restores it; the confirmed XI is never rewritten.
- **Public**: `public_match_feed` returns `lineups` (confirmed only; display name,
  shirt, position, captain, goalkeeper, on-field/sub/card state — no ids,
  identities or screening data). Confirm/reopen/correct bump `seq` and send the
  usual `match_changed` hint, so the public page reconciles through the existing
  realtime resync.

### DEMO SHOWCASE matches (migration `20261002001100`)

Demonstration matches for presenting the platform (named events, line-ups and
stats) without touching the official eligibility pipeline.

- `admin_mark_demo_match(match, reason)` (ADMIN, audited `DEMO_MATCH_MARKED`)
  flags `matches.is_demo`. Only allowed when the competition name **and** the
  round label contain "DEMO" and the competition holds no official matches.
  Triggers keep it that way: the flag can never be cleared, the DEMO labels
  cannot be removed, and a demo competition cannot receive official matches, so
  official standings are never affected.
- Demo participants live in `demo_match_lineups` / `demo_lineup_players`
  (one demo match, name snapshot + shirt/position/pitch spot). Screening,
  squads, official line-ups and `match_eligibility()` never read them: a demo
  appearance cannot make anyone CLEARED, a squad member or eligible.
- Demo events are `match_events` rows with `player_id` NULL and
  `demo_player_id` → a participant of the same demo match and team
  (trigger-enforced; never allowed on an official match). Written only by
  `admin_demo_add_event` (audited `DEMO_EVENT_ADDED`, payload `demo: true`);
  the score is still derived from non-voided goal events.
- `admin_demo_set_lineup` / `admin_demo_set_stats` (audited `DEMO_LINEUP_SET`,
  `DEMO_STATS_SET`). Demo stats exist only for demo matches; cards are derived
  from the events.
- The demo tables are FORCE RLS with no client grants; `demo_player_id` is not in
  the `match_events` column grants. `public_match_feed` returns `match.is_demo`,
  demo line-ups (flagged `demo: true`, same public-safe shape) and `stats`
  (labelled demonstration data) for demo matches only.
- **Live systems tests (migration `20261004001300`)**: a demo/test match may be
  labelled TEST (or DEMO). Its demo line-ups may use *synthetic* participants
  (`player_id` NULL, name must contain TEST/DEMO) that exist only in the demo
  layer: no player, identity, screening or squad row. `operator_match_state`
  serves the test line-ups to `/op`, `record_event` on a demo/test match takes
  those participant ids (stored as `demo_player_id`), and kick-off requires both
  test line-ups. Official line-ups can never be created for a demo/test match;
  official matches use the unchanged path. `20261003001200` made the demo guard
  triggers `SECURITY DEFINER` (admin competition saves had failed).

### Registration intake (migration `20261005001400`)
A registration is a **request, never eligibility**:
`SUBMITTED → (UNDER_REVIEW / NEEDS_CORRECTION) → ACCEPTED_FOR_SCREENING → PENDING screening → CLEARED/REJECTED/SUSPENDED (admin_decide_screening) → squad → line-up`.
No online payments of any kind.

- Tables (FORCE RLS, **no client grants at all**): `registration_windows`
  (one per competition intake; DRAFT/OPEN/CLOSED/ARCHIVED, only OPEN inside
  its dates accepts entries), `registrations` (public reference
  `EKSU-{code}-{6 chars}` from a 31-symbol alphabet without 0/O/1/I, random
  bytes; UUID internally; own status — `player_screenings.status` is untouched),
  `registration_players` (`matric_key` = same normalisation as
  `player_identities.student_id_key`; partial unique index on
  `(competition_id, matric_key)` for SUBMITTED/ACCEPTED entries),
  `registration_events` (append-only history), `private.rate_limits`.
  `correction_token_hash/expires_at` are reserved for a later "fix your
  registration" link (v1: NEEDS_CORRECTION + reason; the directorate contacts
  the applicant).
- Anonymous: `public_registration_windows()` / `public_registration_window(slug)`
  only. Submitting (`service_submit_registration`), the status lookup
  (`service_registration_status`: reference + a phone on the registration →
  safe fields only) and rate limiting are `service_role`-only and called by the
  Next.js server (`src/lib/registration/server.ts`, server-only
  `SUPABASE_SECRET_KEY`).
- Documents: private bucket `registration-documents` (4 MB, JPG/PNG/WebP/PDF),
  paths `{registration uuid}/{person uuid}/{photo|id}.{ext}`. Uploads go
  through `POST /api/register/upload` (HMAC draft token, rate limit, size +
  MIME + extension + magic-byte check) with the secret key; there is **no**
  client write policy. ADMIN reads via a storage SELECT policy and sees
  10-minute signed URLs. Documents of drafts never submitted are swept after
  24 h (`service_orphan_documents`).
- Duplicates: same matric in the roster or a live entry for the same
  competition → refused ("This student number may already have a
  registration. Please contact the Sports Directorate."). An existing official
  identity is *flagged* to the admin (not refused) and linked on accept.
- `admin_accept_registration` (atomic): re-validates team/competition/season and
  faculty→department, links the official player by matric key or creates
  player + identity, links the existing season screening for that team or opens
  a PENDING one (`private.open_screening`), marks entries ACCEPTED, audits
  (`PLAYER_CREATED_FROM_REGISTRATION` / `PLAYER_LINKED_FROM_REGISTRATION`,
  `REGISTRATION_ACCEPTED_FOR_SCREENING`). Never clears, never adds to a squad.
- Admin UI: `/admin/registrations` (inbox), `/admin/registrations/[id]`,
  `/admin/registrations/windows[/id]`. Public: `/register`,
  `/register/[slug]{,/player,/team}`, `/register/status`.

#### Public switch and admin-led registration (migration `20261006001500`)
- `PUBLIC_REGISTRATION_ENABLED` (server-only env var, default **off**). Off:
  `/register` and every `/register/...` link show "Coming soon" (never 404),
  and the draft/submit server actions and `POST /api/register/upload` refuse
  requests (403). `/register/status` keeps working. On: the original public
  flow returns unchanged (also open a window in `/admin/registrations/windows`).
- Admins register on someone's behalf at `/admin/registrations/new`
  (`admin_create_registration`), through the same `private.intake_registration`
  as the public path: same validation, duplicate checks, references, inbox,
  history and Accept for screening. Admin entries are `source = 'ADMIN'`
  (with `created_by`), may use a closed (not archived) window, and documents
  are optional for admins (the public form requires a passport photo); student
  ID evidence is optional everywhere — attach either later on the registration page
  (`POST /admin/api/registration-document`, ADMIN session, same file checks,
  recorded by `admin_attach_registration_document`).
- Corrections before screening: `admin_update_registration_player` /
  `admin_update_registration_contact` — each adds an `EDITED` history event
  naming the changed fields and a `REGISTRATION_EDITED` audit row (matric
  numbers and phones masked). Accepted/rejected entries can no longer be edited.

### Match alerts — Web Push, no accounts (migration `20261007001600`)
Anonymous, per-device notifications for followed matches and teams.

- **Device identity.** `service_notify_register` (service_role only) mints a
  256-bit random token; the browser gets it only as the httpOnly, Secure,
  SameSite=Lax cookie `eksu_alerts`, and Postgres stores only its SHA-256.
  No names, emails, phones or accounts. Every read/write goes through the
  Next.js server (`src/app/(public)/notifications/actions.ts`) into
  `service_notify_*` functions with that token; all notification tables have
  forced RLS and no grants, so no browser (anon, signed-in, or admin) can
  enumerate devices, endpoints, keys or anyone else's follows.
- **Preferences.** `match_notification_preferences` (enabled=false = muted)
  and `team_notification_preferences`, with event keys REMINDER, KICKOFF, GOAL,
  YELLOW_CARD, RED_CARD, HALF_TIME, SECOND_HALF, FULL_TIME, STATUS. A match
  setting decides alone for that match (including mute); otherwise the union
  of the followed teams applies. Only public matches/active teams can be
  followed; limits 200 matches / 50 teams per device.
- **Transactional outbox.** Deferred constraint triggers on `match_events`
  (insert/void) and `matches` (status, kick-off time) write
  `notification_outbox` rows in the same transaction as the match change —
  never more than once (`event_key` unique: `EVT:<event>`, `KO:`/`HT:`/`2H:`/
  `FT:<match>`, `ST:<status>:<match>:<kick-off>`, `REM:<match>:<kick-off>`).
  The trigger body can never fail a match write (exceptions → warning).
  Content is built in Postgres from canonical data (`notification_content`);
  clients cannot submit notification text. Unknown scorers are omitted.
  Only live-match events (1H/HT/2H) push. DEMO/TEST matches reach match
  followers only and are prefixed "TEST · "/"DEMO · ".
- **Voids.** A goal voided before sending is cancelled. If it was sent, a
  `SCORE_CORRECTION` goes to exactly the devices that received it, with the
  same tag so it replaces the goal notification; the goal is never re-sent.
  Voided cards are silently dropped.
- **Reminders.** `enqueue_due_reminders` (run by every dispatch) queues one
  reminder ~15 min before kick-off per kick-off time; a moved, postponed,
  cancelled or started match drops queued reminders.
- **Fan-out and delivery.** `service_notification_claim` fans intents out to
  one `notification_deliveries` row per device (`unique (outbox_id,
  device_id)` — following both teams + the match still yields one push),
  leases due deliveries for 2 min and returns endpoints/keys to the
  dispatcher only. `POST /api/notifications/dispatch` (Bearer
  `NOTIFICATIONS_DISPATCH_SECRET`) sends with `web-push` (VAPID, aes128gcm)
  and reports back: 2xx SENT; 404/410 GONE (subscription invalidated);
  408/429/5xx/network RETRY with backoff 30s·2ⁿ, FAILED after 5 attempts;
  other 4xx FAILED. Intents older than 30 min expire; old rows are purged
  after 14 days. Nothing in the dispatcher touches match state.
- **Triggering the dispatcher.** After an outbox insert, `notification_kick()`
  calls the route through `pg_net` when installed, configured
  (`private.notification_config.dispatch_url`) and the Vault secret
  `notifications_dispatch_secret` exists; `pg_cron` calls it every minute as
  the safety net (and for reminders).
- **Browser.** `public/sw.js` only shows pushes, routes taps (focus the match
  tab, else reuse a window, else open one; same-origin paths only) and
  re-registers rotated subscriptions (`POST /api/notifications/subscription`,
  same-origin, cookie device only). No caching. The provider repairs a lost
  subscription once a day. iPhone/iPad in a browser tab get the "Add to Home
  Screen" guide instead of a permission prompt; permission is only requested
  from the confirm button.
- **VAPID keys (migration `20261009001800`).** The pair lives in Supabase
  Vault (`notifications_vapid_public_key`, `notifications_vapid_private_key`),
  generated and validated server-side in one operation, so the halves can
  never come from different generations and nobody copies keys by hand.
  `service_vapid_*` functions are service_role only. The dispatcher loads
  both halves (cached 5 min per runtime); browsers fetch only the public half
  from `GET /api/notifications/vapid-key` (`{ publicKey }`, validated as a
  65-byte uncompressed P-256 point). `POST /api/notifications/dispatch?check=vapid`
  (dispatcher secret) runs a booleans-only self-test: pair validation, JWT
  signing with the private key, and verification with the served public key.
  Vault refuses to overwrite an existing pair; rotating means deleting both
  Vault entries deliberately and re-initialising, after which browsers
  re-subscribe automatically (the client replaces a subscription made for a
  different key).
- **Switch.** `PUSH_NOTIFICATIONS_ENABLED=true` plus server-only
  `VAPID_SUBJECT` and `NOTIFICATIONS_DISPATCH_SECRET`. Off (default): no alert
  UI, no service worker, actions refuse, dispatcher skips.

### Private audience analytics (migration `20261008001700`)
Per-match audience figures for staff only. **Never public**: no public UI,
no public payload (`public_match_feed`, page HTML/RSC) and no anon-readable
table or function carries them.

- **Identity.** The Notifications V1 anonymous device (httpOnly `eksu_alerts`
  cookie, server-issued token, SHA-256 stored). A viewer without one gets one
  from `service_audience_register` (per-network budget 2000/10 min). No IPs
  (only a server-side hash for rate limiting), fingerprints or personal data.
- **Flow.** The public match page (`AudienceTracker`) posts to
  `POST /api/audience`: `start` (visible page → new visit, returns an opaque
  session id), `beat` every 20 s while visible, `end` via `sendBeacon` on
  close. The route calls `service_audience_*` (service_role) with the cookie
  token; Postgres derives every number. Hidden tabs stop beating (out of
  "watching now" within 50 s); returning within 10 min resumes the visit.
  Responses never contain figures; all failures are swallowed.
- **Definitions.** *Watching now*: distinct devices with an open session and a
  heartbeat in the last 50 s. *Peak viewers*: the highest watching-now ever
  observed for the match, across its whole page life (pre-match, live, after
  FT) — it only rises. *Unique viewers*: distinct devices that started a visit.
  *Total visits*: sessions started (each tab/page view; a resumed tab is not
  a new visit).
- **Storage.** `match_view_sessions` (raw, deleted 2 days after the last
  heartbeat), `match_audience_viewers` (match × device, deleted after 180
  days), `match_audience` (counters, kept for good — basis for future
  most-viewed / competition / team audience reports; DEMO/TEST matches are
  separate rows and can be excluded via `matches.is_demo`). Analytics-only
  devices idle for 400 days are removed. Housekeeping runs on 2% of visit
  starts and can be scheduled: `select private.audience_housekeeping()`.
- **Abuse limits.** Validated match ids (public matches only), tokens must be
  app-issued, ≤ 60 visits/10 min and ≤ 10 open tabs per device per match,
  beats closer than 10 s write nothing, same-origin POSTs only.
- **Readers.** `op_match_audience` — active staff with an active assignment
  (same rule as `operator_match_state`); shown as a small "Viewers · N live ·
  Peak M" line under the /op live scoreboard (polls 15 s).
  `admin_match_audience` — ADMIN; on /admin/live cards (15 s auto-refresh) and
  the admin match page (live-polling panel; figures kept after FT).

### Competition engine V2 (migrations `20261010001900`, `20261010002000`)
- **Formats.** `LEAGUE`, `GROUPS`, `KNOCKOUT`, `GROUPS_KNOCKOUT`. Competition
  lifecycle `DRAFT → REGISTRATION → SCHEDULED → ACTIVE → COMPLETED → ARCHIVED`;
  `kind` (`OFFICIAL`/`FRIENDLY`/`TEST`/`DEMO`) — only official, non-demo matches feed
  standings, stats, discipline and honours.
- **Stages** (`stage_type` GROUP/LEAGUE/ROUND_OF_16/QUARTER_FINAL/SEMI_FINAL/
  THIRD_PLACE/FINAL…, `legs` = 1, ET/pens flags, `qualification` jsonb). A stage
  locks at its first kick-off (`locked_at`); structural edits after that need an
  audited override (`private.begin_override(reason)` → `LOCK_OVERRIDE`).
- **Fixtures.** Circle-method round robin (single/double), balanced home/away
  (≤ 2 consecutive), deterministic for the same input. `admin_preview_fixtures`
  returns a hash; `admin_confirm_fixtures` re-derives and refuses a stale hash,
  is idempotent, and only replaces a generation whose matches never started.
  Kick-off changes append to `fixture_schedule_history` (original kept on
  `matches.original_scheduled_at`).
- **Standings.** Per stage/group; points and an ordered tie-breaker list
  (points, GD, GF, head-to-head, fair play, wins…). Teams still level are
  flagged `tied` and kept alphabetical — never random. Qualification
  (`QUALIFIED`/`ELIMINATED`/`PENDING`) is derived once a group is complete; level
  teams across the cut stay `PENDING` until `admin_set_qualification_decision`.
- **Knockout.** `knockout_ties` with sources TEAM / GROUP_RANK / LEAGUE_RANK /
  BEST_RANKED / WINNER / LOSER and placeholder labels; cross-group or seeded
  pairing with same-group avoidance; preview → confirm. A tie's match is created
  once both teams are known and a kick-off is set. Winners advance
  automatically (idempotent); a corrected result flags `needs_reconciliation`
  and `admin_reconcile_tie` repairs unstarted downstream ties.
- **Extra time / penalties.** Match statuses `ET1`, `ET_BREAK`, `ET2`, `PENS`.
  Scores kept separately: regulation (`*_score_90`), final incl. ET
  (`*_score`), shoot-out (`*_pens`) from `match_shootout_attempts` (never
  goals). Best of five, then sudden death; teams alternate. `winner_team_id` +
  `decided_by` (`REGULATION`/`EXTRA_TIME`/`PENALTIES`; ties also `ADMIN`).
  Goals and cards in ET1/ET2 notify through the normal pipeline (same
  `EVT:`/`VOID:` idempotency keys, minutes like 105+1' or 118'); shoot-out kicks
  never alert as goals; the full-time alert of a knockout states "X win 4–2 on
  penalties" or "After extra time".
- **Discipline.** `competition_discipline_rules` (straight red, second yellow,
  every-N-yellows); `player_suspensions` derived from cards and served by the
  team's next completed official fixtures; manual add/cancel keep history.
  `match_eligibility` reports `SUSPENDED`; players stay in squads.
- **Read models.** `public_competition` (anon: stages, groups, ties, scorers,
  clean sheets, cards, suspensions, honours), `admin_competition_overview`,
  `admin_fixture_history`. Engine refresh runs in a deferred constraint
  trigger at commit (`competition_refresh`).

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
| Migrations applied | `20260928000100` … `20261002001100` (history versions aligned with this repo; 0900 applied 2026-09-29, 1000 and 1100 applied 2026-09-30) |
| Realtime partitions | `realtime.messages` daily partitions are created by Supabase when the first Realtime client connects (and maintained while clients keep connecting). Until then `realtime.send` logs a warning and match writes still succeed; clients resync on subscribe. |
| Reference data | `supabase/reference.sql` applied 2026-09-29: roles ADMIN/MANAGER/OPERATOR, football, 8 event types (idempotent) |
| Seed | **not** run (no development data on the hosted project) |
| Auth users | 2 ADMIN accounts (created by the owner through Supabase Auth) |

After 000800 an 88-check admin/security verification passed (privilege hygiene,
anon/operator/non-staff refusal, every admin RPC, fixture validation, one-primary
constraint, operator RPCs, void/add corrections, standings recompute, outcomes,
roles/deactivation, delete guards, audit immutability), also rolled back.
After 000900 an 80-check public/realtime verification ran (rolled back): 73 passed; the 7
realtime-delivery checks first failed only because no Realtime client had connected yet (no
`realtime.messages` partitions). After the first client connected (partitions created) they
were re-run and all passed (hint per change on `match:{id}` + `scores:live`, private channels,
seq = canonical seq, anon/authenticated listen-only, database resync). Note: hosted
`realtime.send` adds the message's own `id` to each payload.
The earlier hosted verification (47 checks after 000600; 55 checks after 000700, adding
private-helper denial and RLS-helper behaviour: RLS per role, every RPC, idempotency,
voids, discipline rules, clock/periods, takeover, FT lock, audit immutability,
standings) ran inside a transaction that was rolled back, so nothing persisted.

After 1000 the full pgTAP suite (01–05, 388 assertions) was run on hosted against an
in-transaction fixture (no seed; rolled back): all passed, and the schema fingerprint
(functions, columns, constraints, indexes, triggers, policies, grants) matched local.
After 1100 the fingerprint again matched local exactly; the DEMO SHOWCASE match was then
populated through the audited demo RPCs (all players stay PENDING; see the DEMO SHOWCASE
section above).

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
