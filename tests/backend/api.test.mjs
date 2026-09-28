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

let primary, primary2, backup, other, anon, matchId, players;

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
  const sq = await primary.rpc("operator_match_state", { p_match_id: matchId });
  assert.ifError(sq.error);
  players = sq.data.squads;
});

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
