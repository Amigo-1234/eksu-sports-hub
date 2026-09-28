#!/usr/bin/env node
/**
 * DEVELOPMENT ONLY — create the development operator accounts.
 *
 * Creates (or updates) four email/password users through the Supabase Auth
 * admin API, grants roles, and assigns the seeded development matches:
 *
 *   admin@dev.eksu.test    ADMIN
 *   primary@dev.eksu.test  OPERATOR · PRIMARY on DEV Science v DEV Engineering (+ Matchday 2)
 *   backup@dev.eksu.test   OPERATOR · BACKUP  on DEV Science v DEV Engineering
 *   other@dev.eksu.test    OPERATOR · PRIMARY on DEV Arts v DEV Education only
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DEV_USER_PASSWORD.
 * Refuses to run against a non-local project unless ALLOW_REMOTE_DEV_USERS=1.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const password = process.env.DEV_USER_PASSWORD;

if (!url || !secret || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and DEV_USER_PASSWORD (see .env.example).");
  process.exit(1);
}
const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
if (!local && process.env.ALLOW_REMOTE_DEV_USERS !== "1") {
  console.error(`Refusing to create development users on ${url}. Set ALLOW_REMOTE_DEV_USERS=1 to override.`);
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const MATCH_SCI_ENG = "80000000-0000-4000-8000-000000000001";
const MATCH_ART_EDU = "80000000-0000-4000-8000-000000000002";
const MATCH_ENG_ART = "80000000-0000-4000-8000-000000000003";

const USERS = [
  { email: "admin@dev.eksu.test", name: "Dev Admin", roles: ["ADMIN"], assignments: [] },
  {
    email: "primary@dev.eksu.test", name: "Dev Primary", roles: ["OPERATOR"],
    assignments: [[MATCH_SCI_ENG, "PRIMARY"], [MATCH_ENG_ART, "PRIMARY"]],
  },
  { email: "backup@dev.eksu.test", name: "Dev Backup", roles: ["OPERATOR"], assignments: [[MATCH_SCI_ENG, "BACKUP"]] },
  { email: "other@dev.eksu.test", name: "Dev Other Operator", roles: ["OPERATOR"], assignments: [[MATCH_ART_EDU, "PRIMARY"]] },
];

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

const { users: existing } = must(await db.auth.admin.listUsers({ perPage: 1000 }), "list users");
const roles = must(await db.from("roles").select("id, code"), "load roles");

for (const u of USERS) {
  let user = existing.find((x) => x.email === u.email);
  if (user) {
    user = must(await db.auth.admin.updateUserById(user.id, { password, user_metadata: { display_name: u.name } }), "update user").user;
  } else {
    user = must(
      await db.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { display_name: u.name } }),
      "create user",
    ).user;
  }
  must(await db.from("profiles").upsert({ id: user.id, display_name: u.name }), "profile");
  for (const code of u.roles) {
    const role = roles.find((r) => r.code === code);
    must(await db.from("user_roles").upsert({ user_id: user.id, role_id: role.id }, { onConflict: "user_id,role_id" }), "role");
  }
  for (const [matchId, role] of u.assignments) {
    must(
      await db.from("operator_assignments").upsert(
        { match_id: matchId, user_id: user.id, role, active: true, revoked_at: null },
        { onConflict: "match_id,user_id" },
      ),
      "assignment",
    );
  }
  console.log(`✓ ${u.email.padEnd(24)} ${u.roles.join(",").padEnd(9)} ${u.assignments.map(([, r]) => r).join(", ") || "—"}`);
}
console.log("\nSign in at /op/login with any of these emails and DEV_USER_PASSWORD.");
