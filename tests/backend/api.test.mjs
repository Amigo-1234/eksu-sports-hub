/**
 * Backend API tests against a running Supabase stack (local by default).
 * Real sign-in → PostgREST → RPCs. Run: npm run test:backend
 * Requires `npx supabase start`, `npm run dev:users`, and .env.local.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const PW = process.env.DEV_USER_PASSWORD;
assert.ok(URL && PUB && SECRET && PW, "Missing env: see .env.example");

const HOME = "70000000-0000-4000-8000-000000000001";
const AWAY = "70000000-0000-4000-8000-000000000002";
const COMP = "60000000-0000-4000-8000-000000000001";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SECRET, opts);

async function signIn(email) {
  const c = createClient(URL, PUB, opts);
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  assert.ifError(error);
  return c;
}
const userId = async (c) => (await c.auth.getUser()).data.user.id;

let primary, primary2, backup, other, anon, adminUser, matchId, players;

before(async () => {
  [primary, primary2, backup, other] = await Promise.all(
    ["primary@dev.eksu.test", "primary@dev.eksu.test", "backup@dev.eksu.test", "other@dev.eksu.test"].map(signIn),
  );
  anon = createClient(URL, PUB, opts);
  // An isolated match for this run, assigned to the dev primary/backup.
  matchId = randomUUID();
  const ins = await admin.from("matches").insert({
    id: matchId, competition_id: COMP, round_label: "API test", home_team_id: HOME, away_team_id: AWAY,
    scheduled_at: new Date().toISOString(),
  });
  assert.ifError(ins.error);
  const a = await admin.from("operator_assignments").insert([
    { match_id: matchId, user_id: await userId(primary), role: "PRIMARY" },
    { match_id: matchId, user_id: await userId(backup), role: "BACKUP" },
  ]);
  assert.ifError(a.error);
  // Kick-off needs confirmed line-ups: prepared through the real RPCs by an admin.
  adminUser = await signIn("admin@dev.eksu.test");
  for (const team of [HOME, AWAY]) await confirmLineup(adminUser, matchId, team);
  const sq = await primary.rpc("operator_match_state", { p_match_id: matchId });
  assert.ifError(sq.error);
  players = sq.data.squads;
});

/** Shirts 1–11 start in a 4-4-2 (No. 10 captain), 12–18 on the bench. */
async function confirmLineup(client, match, team) {
  const st = await client.rpc("lineup_editor_state", { p_match_id: match, p_team_id: team });
  assert.ifError(st.error);
  const squad = st.data.squad.filter((p) => p.eligibility === "CLEARED" && p.shirt_number <= 18);
  const lineup = squad.map((p) => ({
    player_id: p.player_id,
    role: p.shirt_number <= 11 ? "STARTER" : "SUBSTITUTE",
    slot: p.shirt_number <= 11 ? p.shirt_number - 1 : null,
    captain: p.shirt_number === 10,
  }));
  const saved = await client.rpc("save_lineup", { p_match_id: match, p_team_id: team, p_formation: "4-4-2", p_players: lineup });
  assert.ifError(saved.error);
  const confirmed = await client.rpc("confirm_lineup", { p_match_id: match, p_team_id: team });
  assert.ifError(confirmed.error);
}

const rpc = async (c, fn, args) => {
  const { data, error } = await c.rpc(fn, args);
  return { data, error };
};
const pid = (side, shirt) => players[side].find((p) => p.shirt_number === shirt).player_id;
const goal = (id, side = "home", minute = 10) => ({
  p_match_id: matchId, p_event_id: id, p_type: "GOAL", p_team_id: side === "home" ? HOME : AWAY, p_minute: minute,
});

test("anonymous and unassigned users cannot operate", async () => {
  let r = await rpc(anon, "start_match", { p_match_id: matchId, p_intent_id: randomUUID() });
  assert.ok(r.error, "anon blocked");
  r = await rpc(other, "start_match", { p_match_id: matchId, p_intent_id: randomUUID() });
  assert.equal(r.error?.code, "EK403", "unassigned operator blocked");
  r = await rpc(other, "operator_match_state", { p_match_id: matchId });
  assert.equal(r.error?.code, "EK403");
  const list = await other.from("operator_assignments").select("match_id");
  assert.ok(!list.data.some((x) => x.match_id === matchId), "not visible to other operator");
});

test("direct REST writes to protected tables fail", async () => {
  const upd = await primary.from("matches").update({ status: "FT", home_score: 9 }).eq("id", matchId).select();
  assert.ok(upd.error || upd.data.length === 0, "cannot update matches");
  const ev = await primary.from("match_events").insert({
    id: randomUUID(), match_id: matchId, seq: 1, type: "GOAL", period: 1, minute: 1, team_id: HOME,
    recorded_by: await userId(primary),
  });
  assert.ok(ev.error, "cannot insert events");
  const au = await primary.from("audit_log").insert({ action: "X", entity_type: "match", entity_id: matchId });
  assert.ok(au.error, "cannot write audit");
  const st = await primary.from("standings").delete().eq("competition_id", COMP).select();
  assert.ok(st.error || st.data.length === 0, "cannot delete standings");
  const check = await admin.from("matches").select("status, home_score").eq("id", matchId).single();
  assert.deepEqual(check.data, { status: "SCHEDULED", home_score: 0 });
});

test("start, parallel duplicate retries, and concurrent events", async () => {
  const startIntent = randomUUID();
  // Same start intent sent 5x in parallel → one transition.
  const starts = await Promise.all(Array.from({ length: 5 }, () => rpc(primary, "start_match", { p_match_id: matchId, p_intent_id: startIntent })));
  starts.forEach((s) => assert.ifError(s.error));
  assert.equal(starts.filter((s) => !s.data.replayed).length, 1, "exactly one start applied");

  // Same goal id sent 10x in parallel → one event, one goal.
  const gid = randomUUID();
  const dups = await Promise.all(Array.from({ length: 10 }, () => rpc(primary, "record_event", goal(gid))));
  dups.forEach((d) => assert.ifError(d.error));
  let s = await rpc(primary, "operator_match_state", { p_match_id: matchId });
  assert.equal(s.data.events.filter((e) => e.id === gid).length, 1, "one event");
  assert.equal(s.data.match.home_score, 1, "one score increment");

  // 20 different events concurrently from two independent sessions (two devices).
  const n = 20;
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      rpc(i % 2 ? primary : primary2, "record_event", {
        p_match_id: matchId, p_event_id: randomUUID(), p_type: "PENALTY_MISS",
        p_team_id: i % 2 ? HOME : AWAY, p_minute: 20,
      }),
    ),
  );
  results.forEach((r) => assert.ifError(r.error));
  s = await rpc(primary, "operator_match_state", { p_match_id: matchId });
  const seqs = s.data.events.map((e) => e.seq);
  assert.equal(new Set(seqs).size, seqs.length, "all sequences unique");
  assert.deepEqual([...seqs].sort((a, b) => a - b), seqs, "returned in seq order");
  assert.equal(s.data.events.length, n + 1);
  assert.equal(s.data.match.home_score + s.data.match.away_score, 1, "penalty misses never score");
});

test("backup must take over; a fresh client sees the persisted state", async () => {
  const blocked = await rpc(backup, "set_stoppage", { p_match_id: matchId, p_intent_id: randomUUID(), p_minutes: 2 });
  assert.equal(blocked.error?.code, "EK403");
  const t = await rpc(backup, "take_over_match", { p_match_id: matchId, p_intent_id: randomUUID() });
  assert.ifError(t.error);
  const og = await rpc(backup, "record_event", {
    p_match_id: matchId, p_event_id: randomUUID(), p_type: "OWN_GOAL", p_team_id: HOME, p_minute: 30, p_player_id: pid("home", 5),
  });
  assert.ifError(og.error);
  assert.equal(og.data.match.away_score, 1, "own goal by home player credits away");

  // "Refresh": a brand-new session reads the same canonical state.
  const fresh = await signIn("primary@dev.eksu.test");
  const s = await rpc(fresh, "operator_match_state", { p_match_id: matchId });
  assert.equal(s.data.match.status, "1H");
  assert.deepEqual([s.data.match.home_score, s.data.match.away_score], [1, 1]);
  assert.equal(s.data.match.seq, og.data.match.seq);
  assert.equal(s.data.in_control, false, "primary is no longer in control");
  // Public (anon) read sees the score but not operational columns.
  const pub = await anon.from("matches").select("status, home_score, away_score").eq("id", matchId).single();
  assert.deepEqual(pub.data, { status: "1H", home_score: 1, away_score: 1 });
  const hidden = await anon.from("matches").select("active_operator_id").eq("id", matchId);
  assert.ok(hidden.error, "operational column hidden from anon");
});

test("server_time is available to clients", async () => {
  const { data, error } = await anon.rpc("server_time");
  assert.ifError(error);
  assert.ok(Math.abs(Date.parse(data) - Date.now()) < 60_000);
});

test("admin surface: anon and operators are refused by the API itself", async () => {
  const season = { name: `API ${randomUUID().slice(0, 6)}`, starts_on: "2030-09-01", ends_on: "2031-07-31" };
  for (const c of [anon, primary]) {
    const ins = await c.from("seasons").insert(season);
    assert.ok(ins.error, "reference-data insert must fail");
    const r = await rpc(c, "admin_create_match", {
      p_competition_id: COMP, p_stage_id: null, p_group_id: null, p_round_label: "", p_home_team_id: HOME,
      p_away_team_id: AWAY, p_venue_id: null, p_scheduled_at: new Date().toISOString(),
    });
    assert.ok(r.error, "admin RPC must fail");
    assert.ok(["42501", "EK403"].includes(r.error.code), `unexpected ${r.error.code}`);
  }
  const staff = await rpc(primary, "admin_list_staff", {});
  assert.equal(staff.error?.code, "EK403");
  const grant = await rpc(primary, "admin_grant_role", { p_user_id: await userId(primary), p_role: "ADMIN" });
  assert.equal(grant.error?.code, "EK403", "operator cannot self-promote");
  const score = await primary.from("matches").update({ home_score: 5 }).eq("id", matchId);
  assert.ok(score.error, "score columns are not writable");
});

test("admin surface: an ADMIN can use it, and same-team fixtures are rejected", async () => {
  const a = await signIn("admin@dev.eksu.test");
  const staff = await rpc(a, "admin_list_staff", {});
  assert.ifError(staff.error);
  assert.ok(staff.data.length >= 4);
  assert.ok(!JSON.stringify(staff.data).includes("encrypted_password"), "no credential columns exposed");
  const same = await rpc(a, "admin_create_match", {
    p_competition_id: COMP, p_stage_id: null, p_group_id: null, p_round_label: "", p_home_team_id: HOME,
    p_away_team_id: HOME, p_venue_id: null, p_scheduled_at: new Date().toISOString(),
  });
  assert.equal(same.error?.code, "EK422");
  const live = await rpc(a, "admin_live_matches", {});
  assert.ifError(live.error);
  assert.ok(Array.isArray(live.data));
});

// ── Screening, squads and line-ups ────────────────────────────────────────────
test("screening data and student numbers are private through the API", async () => {
  const idsAnon = await anon.from("player_identities").select("student_id");
  assert.ok(idsAnon.error, "anon cannot read student numbers");
  const idsOp = await primary.from("player_identities").select("student_id");
  assert.deepEqual(idsOp.data, [], "operator reads no student numbers (RLS)");
  const scrAnon = await anon.from("player_screenings").select("status");
  assert.ok(scrAnon.error, "anon cannot read screenings");
  const scrOp = await primary.from("player_screenings").select("status");
  assert.deepEqual(scrOp.data, [], "operator reads no screenings");
  const playersAnon = await anon.from("players").select("id");
  assert.ok(playersAnon.error, "anon cannot read the player register");
  const decide = await rpc(primary, "admin_decide_screening", { p_screening_id: randomUUID(), p_status: "CLEARED" });
  assert.equal(decide.error?.code, "EK403", "operator cannot screen players");
  const reg = await rpc(primary, "admin_register_player", {
    p_display_name: "X", p_student_id: "API/1", p_faculty_id: null, p_department_id: null, p_team_id: HOME,
    p_season_id: "30000000-0000-4000-8000-000000000001",
  });
  assert.equal(reg.error?.code, "EK403", "operator cannot register players");
});

test("line-up tables cannot be written directly; editor access follows assignments", async () => {
  const l = await primary.from("match_lineups").insert({ match_id: matchId, team_id: HOME });
  assert.ok(l.error, "no direct line-up writes");
  const lp = await primary.from("lineup_players").insert({ lineup_id: randomUUID(), player_id: randomUUID(), shirt_number: 5, role: "STARTER" });
  assert.ok(lp.error, "no direct line-up player writes");
  const sp = await primary.from("squad_players").insert({ squad_id: randomUUID(), player_id: randomUUID(), shirt_number: 5 });
  assert.ok(sp.error, "no direct squad writes");
  const anonLineups = await anon.from("match_lineups").select("id");
  assert.ok(anonLineups.error, "anon cannot read line-up tables (drafts stay private)");
  const mine = await rpc(primary, "lineup_editor_state", { p_match_id: matchId, p_team_id: HOME });
  assert.ifError(mine.error);
  assert.ok(!JSON.stringify(mine.data).toLowerCase().includes("student"), "operator editor carries no student numbers");
  assert.ok(mine.data.squad.every((p) => p.eligibility === "CLEARED"), "operator sees only eligible players");
  const notMine = await rpc(other, "lineup_editor_state", { p_match_id: matchId, p_team_id: HOME });
  assert.equal(notMine.error?.code, "EK403", "unassigned operator refused");
  const anonEditor = await rpc(anon, "lineup_editor_state", { p_match_id: matchId, p_team_id: HOME });
  assert.ok(anonEditor.error, "anon refused");
});

test("public feed: confirmed line-ups with on-field state, no internal fields", async () => {
  const { data, error } = await anon.rpc("public_match_feed", { p_match_id: matchId });
  assert.ifError(error);
  assert.equal(data.lineups.length, 2);
  const text = JSON.stringify(data.lineups);
  for (const k of ["player_id", "student", "eligibility", "screen"]) assert.ok(!text.includes(k), `no ${k} in public line-ups`);
  assert.equal(data.lineups[0].players.filter((p) => p.captain).length, 1);
});

test("substitutions follow the confirmed line-up and update the public on-field view", async () => {
  const s = await rpc(backup, "operator_match_state", { p_match_id: matchId });
  const inControl = s.data.in_control ? backup : primary;
  const bad = await rpc(inControl, "record_event", {
    p_match_id: matchId, p_event_id: randomUUID(), p_type: "SUBSTITUTION", p_team_id: AWAY, p_minute: 35,
    p_player_id: pid("away", 12), p_related_player_id: pid("away", 14),
  });
  assert.equal(bad.error?.code, "EK422", "player off must be on the pitch");
  const ok = await rpc(inControl, "record_event", {
    p_match_id: matchId, p_event_id: randomUUID(), p_type: "SUBSTITUTION", p_team_id: AWAY, p_minute: 35,
    p_player_id: pid("away", 7), p_related_player_id: pid("away", 14),
  });
  assert.ifError(ok.error);
  const { data } = await anon.rpc("public_match_feed", { p_match_id: matchId });
  const away = data.lineups.find((l) => l.team_id === AWAY).players;
  assert.equal(away.find((p) => p.shirt_number === 7).on_field, false);
  assert.equal(away.find((p) => p.shirt_number === 14).on_field, true);
  assert.equal(away.find((p) => p.shirt_number === 14).on_minute, 35);
});

test("pre-kick-off line-up control, and kick-off is blocked without confirmed line-ups unless an admin overrides", async () => {
  const m = await rpc(adminUser, "admin_create_match", {
    p_competition_id: COMP, p_stage_id: null, p_group_id: null, p_round_label: "API no line-ups", p_home_team_id: HOME,
    p_away_team_id: AWAY, p_venue_id: null, p_scheduled_at: new Date().toISOString(),
  });
  assert.ifError(m.error);
  assert.ifError((await rpc(adminUser, "admin_assign_operators", { p_match_id: m.data, p_primary: await userId(primary), p_backup: await userId(backup) })).error);
  // Pre-kick-off line-up control: PRIMARY edits; BACKUP views until an audited take-over.
  const view = await rpc(backup, "lineup_editor_state", { p_match_id: m.data, p_team_id: HOME });
  assert.ifError(view.error);
  assert.equal(view.data.viewer_role, "VIEWER");
  assert.equal(view.data.editable, false);
  const denied = await rpc(backup, "save_lineup", { p_match_id: m.data, p_team_id: HOME, p_formation: "4-4-2", p_players: [] });
  assert.equal(denied.error?.code, "EK403", "backup cannot edit before taking over");
  assert.ifError((await rpc(primary, "save_lineup", { p_match_id: m.data, p_team_id: HOME, p_formation: "4-4-2", p_players: [] })).error);
  assert.ifError((await rpc(backup, "take_over_match", { p_match_id: m.data, p_intent_id: randomUUID() })).error);
  assert.ifError((await rpc(backup, "save_lineup", { p_match_id: m.data, p_team_id: HOME, p_formation: "4-3-3", p_players: [] })).error);
  const primaryNow = await rpc(primary, "save_lineup", { p_match_id: m.data, p_team_id: HOME, p_formation: "4-4-2", p_players: [] });
  assert.equal(primaryNow.error?.code, "EK403", "primary is read-only while the backup is in control");
  // Kick-off follows the same control rule.
  const notInControl = await rpc(primary, "start_match", { p_match_id: m.data, p_intent_id: randomUUID() });
  assert.equal(notInControl.error?.code, "EK403", "primary cannot start while the backup is in control");
  assert.match(notInControl.error.message, /Take control to start this match/);
  assert.ifError((await rpc(primary, "take_over_match", { p_match_id: m.data, p_intent_id: randomUUID() })).error);
  const backupStart = await rpc(backup, "start_match", { p_match_id: m.data, p_intent_id: randomUUID() });
  assert.equal(backupStart.error?.code, "EK403", "backup cannot start without taking over");
  const blocked = await rpc(primary, "start_match", { p_match_id: m.data, p_intent_id: randomUUID() });
  assert.equal(blocked.error?.code, "EK409");
  const opOverride = await rpc(primary, "admin_set_lineup_override", { p_match_id: m.data, p_reason: "x" });
  assert.equal(opOverride.error?.code, "EK403", "operators cannot bypass line-ups");
  assert.ifError((await rpc(adminUser, "admin_set_lineup_override", { p_match_id: m.data, p_reason: "API test: sheets unavailable" })).error);
  const started = await rpc(primary, "start_match", { p_match_id: m.data, p_intent_id: randomUUID() });
  assert.ifError(started.error);
  assert.equal(started.data.match.status, "1H");
  // Leave no live test match behind for the admin monitor.
  assert.ifError((await rpc(adminUser, "admin_set_match_outcome", { p_match_id: m.data, p_status: "ABANDONED", p_reason: "API test cleanup" })).error);
});

