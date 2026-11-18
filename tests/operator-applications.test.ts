import test from "node:test";
import assert from "node:assert/strict";
import { validateApplication, type ApplicationInput } from "../src/lib/operator-applications/shared.ts";

const valid: ApplicationInput = {
  full_name: "Ada Applicant",
  email: "ada@example.com",
  phone: "0801 234 5678",
  department: "Civil Engineering",
  level: "300L",
  experience: "",
  available_days: ["MON", "WED"],
  periods: ["MORNING"],
  can_attend: true,
  answer_why: "I want to help EKSU football fans follow every match.",
  answer_wrong_goal: "Undo it at once and record it for the right team.",
  answer_offline: "Keep recording; the console syncs when I reconnect.",
  commits_accuracy: true,
  consent: true,
};

test("a complete application is valid; optional fields may be empty", () => {
  assert.deepEqual(validateApplication(valid), {});
  assert.deepEqual(validateApplication({ ...valid, phone: "", department: "", level: "" }), {});
});

test("days: exactly 2 or 3 known days", () => {
  assert.ok(validateApplication({ ...valid, available_days: ["MON"] }).available_days);
  assert.ok(validateApplication({ ...valid, available_days: ["MON", "TUE", "WED", "THU"] }).available_days);
  assert.ok(validateApplication({ ...valid, available_days: ["MON", "FUNDAY"] }).available_days);
  assert.ok(validateApplication({ ...valid, available_days: ["MON", "MON"] }).available_days, "duplicates do not count twice");
  assert.equal(validateApplication({ ...valid, available_days: ["MON", "TUE", "SUN"] }).available_days, undefined);
});

test("required answers, consent and contact details are enforced", () => {
  const e = validateApplication({ ...valid, full_name: " ", email: "nope", phone: "12", periods: [], can_attend: null, answer_why: "short", answer_wrong_goal: "", answer_offline: "", commits_accuracy: null, consent: false });
  for (const k of ["full_name", "email", "phone", "periods", "can_attend", "answer_why", "answer_wrong_goal", "answer_offline", "commits_accuracy", "consent"]) {
    assert.ok(e[k as keyof ApplicationInput], `${k} flagged`);
  }
  assert.ok(validateApplication({ ...valid, answer_why: "x".repeat(1501) }).answer_why, "over-long answer flagged");
});
