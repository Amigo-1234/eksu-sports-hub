import { test } from "node:test";
import assert from "node:assert/strict";
import { formatWatDateTime, fromWatInput, toWatInput, watDayRange } from "../src/lib/admin/time.ts";
import { describeDbError } from "../src/lib/admin/errors.ts";

test("WAT kick-off input round-trips through UTC storage", () => {
  assert.equal(fromWatInput("2026-10-04T16:00"), "2026-10-04T15:00:00.000Z");
  assert.equal(toWatInput("2026-10-04T15:00:00.000Z"), "2026-10-04T16:00");
  assert.equal(fromWatInput("2026-10-05T00:30"), "2026-10-04T23:30:00.000Z"); // crosses midnight
  assert.equal(toWatInput("2026-10-04T23:30:00Z"), "2026-10-05T00:30");
  assert.equal(formatWatDateTime("2026-10-04T15:00:00Z"), "Sun 4 Oct 2026, 16:00");
});

test("invalid kick-off inputs are rejected", () => {
  for (const v of ["", "2026-02-31T10:00", "2026-13-01T10:00", "2026-10-04 16:00", "2026-10-04T24:00", "nope"]) {
    assert.equal(fromWatInput(v), null, v);
  }
  assert.equal(toWatInput(null), "");
});

test("campus day ranges are WAT midnight to midnight", () => {
  assert.deepEqual(watDayRange("2026-10-04"), { from: "2026-10-03T23:00:00.000Z", to: "2026-10-04T23:00:00.000Z" });
  assert.equal(watDayRange("bad"), null);
});

test("database errors become actionable messages without leaking internals", () => {
  assert.equal(describeDbError({ code: "EK422", message: "Home and away team must be different" }), "Home and away team must be different");
  assert.equal(describeDbError({ code: "EK401", message: "x" }), "Your session has expired. Sign in again.");
  assert.equal(
    describeDbError({ code: "23505", message: 'duplicate key value violates unique constraint "squad_players_squad_id_shirt_number_key"' }),
    "That shirt number is already taken in this squad.",
  );
  assert.equal(describeDbError({ code: "23505", message: 'duplicate key value violates unique constraint "operator_assignments_one_primary"' }), "This match already has an active primary operator.");
  assert.match(describeDbError({ code: "23503", message: "fk" }), /cannot be removed/);
  assert.equal(describeDbError({ code: "42501", message: "permission denied for table seasons" }), "Administrator access required.");
  assert.equal(describeDbError({ code: "XX000", message: "internal: relation public.secret_stuff" }), "Something went wrong. Try again.");
});
