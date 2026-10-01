import { test } from "node:test";
import assert from "node:assert/strict";
import { HEARTBEAT_MS, parseAudienceRequest } from "../src/lib/audience/types.ts";

const M = "80000000-0000-4000-8000-000000000001";

test("only start / beat / end with a valid UUID are accepted", () => {
  assert.deepEqual(parseAudienceRequest({ t: "start", match: M }), { t: "start", match: M });
  assert.deepEqual(parseAudienceRequest({ t: "beat", session: M }), { t: "beat", session: M });
  assert.deepEqual(parseAudienceRequest({ t: "end", session: M }), { t: "end", session: M });
  assert.equal(parseAudienceRequest({ t: "start", match: "1; drop table matches" }), null);
  assert.equal(parseAudienceRequest({ t: "beat" }), null);
  assert.equal(parseAudienceRequest({ t: "count", match: M }), null);
  assert.equal(parseAudienceRequest(null), null);
  assert.equal(parseAudienceRequest("start"), null);
});

test("clients cannot send numbers or identities: extra fields are dropped", () => {
  const r = parseAudienceRequest({ t: "start", match: M, viewers: 5000, device: "someone-else", unique: 9 });
  assert.deepEqual(r, { t: "start", match: M });
});

test("heartbeat (20 s) fits twice inside the 50 s active window", () => {
  assert.ok(HEARTBEAT_MS >= 15_000 && HEARTBEAT_MS <= 30_000);
  assert.ok(HEARTBEAT_MS * 2 < 50_000);
});
